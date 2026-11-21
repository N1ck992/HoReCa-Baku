#!/usr/bin/env python3
"""
ABYSS: LOST SIGNAL — нарезка персонажа на части из одной фигуры в полный рост.

    python3 tools/rig_from_fullbody.py tools/rigs/CHAR001.json

Вход — JSON с разметкой суставов (координаты в пикселях исходной картинки):

    {
      "rig": "CHAR001",                 # имя скелета в игре (AB.RIGS.CHAR001)
      "height_units": 120,              # рост персонажа в единицах игры
      "out_dir": "assets/char001/v3",   # куда сложить части (относительно abyss/)
      "js_out": "js/data/rigs/CHAR001.js",
      "variants": { "01": {"image": "...png", "crop": [x0, y0, x1, y1]}, "02": {...} },
      "background": "green" | "black",
      "points": {
        "crown", "neck", "hip",
        "shoulder_near", "elbow_near", "wrist_near", "hand_near",
        "shoulder_far",  "elbow_far",  "wrist_far",  "hand_far",
        "knee_near", "ankle_near", "toe_near",
        "knee_far",  "ankle_far",  "toe_far",
        "sole_y"
      },
      "radius": { "head": 34, "torso": 46, "arm": 15, "leg": 24 }   # толщина частей, px
    }

Все варианты (обычный, повреждённый костюм) должны быть в одной позе и кадре:
разметка одна на всех.

Как режется:
  1. Слои по глубине: ближняя рука → ближняя нога → голова и торс → дальняя нога → дальняя рука.
     Пиксель достаётся самой ближней части, в «капсулу» которой он попадает (отрезок между
     суставами с заданной толщиной).
  2. То, что у части закрыто более ближней частью (торс под рукой, дальнее бедро за ближним),
     достраивается по окружающей текстуре (inpainting, нужен OpenCV: pip install opencv-python-headless).
     Без OpenCV закрытые места остаются прозрачными.
  3. У каждой части есть запас вокруг верхнего сустава, чтобы при сгибе не было щелей.
  4. Считаются точки вращения и длины костей.
"""
import json
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

try:
    import cv2  # достраивание закрытых мест
except ImportError:  # pragma: no cover
    cv2 = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # abyss/

# кость: (имя части, сустав-начало, сустав-конец, продолжение за конец (кисть, стопа), толщина)
BONES = [
    ('head', 'neck', 'crown', None, 'head'),
    ('torso', 'hip', 'neck', None, 'torso'),
    ('upperarm_near', 'shoulder_near', 'elbow_near', None, 'arm'),
    ('forearm_near', 'elbow_near', 'wrist_near', 'hand_near', 'arm'),
    ('upperarm_far', 'shoulder_far', 'elbow_far', None, 'arm'),
    ('forearm_far', 'elbow_far', 'wrist_far', 'hand_far', 'arm'),
    ('thigh_near', 'hip', 'knee_near', None, 'leg'),
    ('shin_near', 'knee_near', 'ankle_near', 'toe_near', 'leg'),
    ('thigh_far', 'hip', 'knee_far', None, 'leg'),
    ('shin_far', 'knee_far', 'ankle_far', 'toe_far', 'leg'),
]


# порядок слоёв сверху вниз: кто ближе к зрителю
LAYERS = ['forearm_near', 'upperarm_near', 'shin_near', 'thigh_near', 'head', 'torso',
          'thigh_far', 'shin_far', 'upperarm_far', 'forearm_far']


def seg_t(px, py, a, b):
    """Положение проекции пикселя вдоль отрезка a-b: 0 — у a, 1 — у b."""
    ax, ay = a
    vx, vy = b[0] - ax, b[1] - ay
    return ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy or 1e-6)


def seg_dist(px, py, a, b):
    """Расстояние от пикселей (сетки px, py) до отрезка a-b."""
    ax, ay = a
    bx, by = b
    vx, vy = bx - ax, by - ay
    L2 = vx * vx + vy * vy or 1e-6
    t = np.clip(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1)
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return np.sqrt(dx * dx + dy * dy)


def silhouette(img, mode):
    a = np.asarray(img.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if mode == 'green':
        # зелёный фон: g заметно больше r и b
        fg = ~((g > 120) & (g > r * 1.35) & (g > b * 1.35))
    else:
        fg = a.max(axis=2) > 9
    m = Image.fromarray((fg * 255).astype(np.uint8))
    closed = np.asarray(m.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))) > 0
    # фон — только то, что связано с краем картинки (дыры внутри фигуры заполняются)
    h, w = closed.shape
    bg = np.zeros((h, w), bool)
    q = deque((y, x) for x in range(w) for y in (0, h - 1) if not closed[y, x])
    q.extend((y, x) for y in range(h) for x in (0, w - 1) if not closed[y, x])
    for y, x in q:
        bg[y, x] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and not closed[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    mask = ~bg
    # мягкий край
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    if mode == 'green':
        # убираем зелёный ореол по краю
        spill = np.minimum(g, np.maximum(r, b) + 10)
        a = a.copy()
        a[..., 1] = np.where(mask, spill, g)
    return a.astype(np.uint8), mask, np.asarray(alpha)


def run(cfg_path):
    cfg = json.load(open(cfg_path))
    P = {k: tuple(v) if isinstance(v, list) else v for k, v in cfg['points'].items()}
    R = cfg.get('radius', {'head': 34, 'torso': 46, 'arm': 15, 'leg': 24})
    mode = cfg.get('background', 'green')
    out_dir = os.path.join(ROOT, cfg['out_dir'])
    upp = cfg['height_units'] / (P['sole_y'] - P['crown'][1])  # единиц игры на пиксель

    rig = {'source': os.path.relpath(cfg_path, ROOT), 'unitsPerPx': round(upp, 5), 'parts': {}, 'bones': {}, 'variants': {}}
    for vid, v in cfg['variants'].items():
        img = Image.open(os.path.join(ROOT, v['image']))
        x0, y0, x1, y1 = v.get('crop', (0, 0, img.width, img.height))
        img = img.crop((x0, y0, x1, y1))
        off = lambda p: (p[0] - x0, p[1] - y0)
        Q = {k: off(p) for k, p in P.items() if isinstance(p, tuple)}
        rgb, mask, alpha = silhouette(img, mode)
        h, w = mask.shape
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

        # 1) «капсула» каждой части: расстояние до кости в долях её толщины
        names = [b[0] for b in BONES]
        norm, along = {}, {}
        for name, j0, j1, ext, rk in BONES:
            a, b = Q[j0], Q[j1]
            d = seg_dist(xx, yy, a, b)
            along[name] = seg_t(xx, yy, a, b)
            if ext:
                d = np.minimum(d, seg_dist(xx, yy, b, Q[ext]))
            norm[name] = d / R[rk]
        # 2) владелец пикселя: самая ближняя к зрителю часть, в капсулу которой он попал;
        #    если ни в одну — ближайшая по расстоянию
        nearest = np.argmin(np.stack([norm[n] for n in names]), axis=0)
        owner = np.array(names, dtype=object)[nearest]
        assigned = np.zeros((h, w), bool)
        for name in LAYERS:
            inside = (norm[name] <= 1.0) & mask & ~assigned
            owner[inside] = name
            assigned |= inside
        # торс кончается на тазе и шее: ниже таза — бедро (ближайшее), выше шеи — голова
        below = (owner == 'torso') & (along['torso'] < 0)
        owner[below & (norm['thigh_near'] <= norm['thigh_far'])] = 'thigh_near'
        owner[below & (norm['thigh_near'] > norm['thigh_far'])] = 'thigh_far'
        owner[(owner == 'torso') & (along['torso'] > 1)] = 'head'
        # видимые куски дальней руки (рукав за спиной, кисть у бедра) не отдаём торсу и бёдрам
        for far in ('upperarm_far', 'forearm_far'):
            for other in ('torso', 'thigh_near', 'thigh_far'):
                grab = (owner == other) & (norm[far] <= 0.8) & (norm[other] > 0.75)
                owner[grab] = far
        # части, которые почти не видны, вырезаем целиком: их нарисует ближняя пара
        skipped = set()
        for name, j0, j1, ext, rk in BONES:
            own_n = ((owner == name) & mask).sum()
            cap_n = ((norm[name] <= 1.0) & mask).sum()
            if name.endswith('_far') and cap_n and own_n < 0.15 * cap_n:
                skipped.add(name)
                owner[(owner == name)] = 'none'

        vdir = os.path.join(out_dir, vid)
        os.makedirs(vdir, exist_ok=True)
        files = {}
        for name, j0, j1, ext, rk in BONES:
            own = (owner == name) & mask
            # закрытое другими частями достраиваем только вдоль самой кости:
            # не за суставами (там соседние части) и никогда под головой
            t = along[name]
            lo, hi = (0.04, 1.0) if name == 'torso' else (0.06, 0.97)
            behind = (norm[name] <= 0.9) & (t > lo) & (t < hi) & mask & (owner != 'head')
            hidden = behind & ~own
            # и только внутри собственного контура части (по строкам): не выходим за спину,
            # за край бедра и т.п.
            if name != 'head' and own.any():
                # контур торса по строкам. Край, который граничит с фоном, — настоящий;
                # край, за которым другая часть (например, рука закрывает спину), — неизвестен,
                # его достраиваем по соседним строкам, где контур виден.
                rows = np.nonzero(own.any(axis=1))[0]
                L, Rt, kl, kr = [], [], [], []
                for y in rows:
                    xs_ = np.nonzero(own[y])[0]
                    l, r = xs_.min(), xs_.max()
                    L.append(l); Rt.append(r)
                    kl.append(l < 3 or not mask[y, max(0, l - 3)])
                    kr.append(r > w - 4 or not mask[y, min(w - 1, r + 3)])
                L, Rt, kl, kr = map(np.array, (L, Rt, kl, kr))
                if kl.sum() >= 2:
                    L = np.where(kl, L, np.interp(rows, rows[kl], L[kl]))
                if kr.sum() >= 2:
                    Rt = np.where(kr, Rt, np.interp(rows, rows[kr], Rt[kr]))
                span = np.zeros_like(own)
                for y, l, r in zip(rows, L.astype(int), Rt.astype(int)):
                    span[y, l:r + 1] = True
                lo2, hi2 = (0.04, 1.0) if name == 'torso' else (0.06, 0.97)
                hidden = ((norm[name] <= 1.0) & (t >= lo2) & (t <= hi2) & span & (owner != 'head')) & ~own
            shape = own | hidden
            # запас вокруг верхнего сустава (против щелей при сгибе) — из настоящих пикселей
            jx, jy = Q[j0]
            if name != 'torso':
                k = 1.0 if rk == 'leg' else 0.6
                parent_ok = (owner == name) | (owner == 'torso') | ((owner == 'upperarm_near') & (name == 'forearm_near'))
                capm = (((xx - jx) ** 2 + (yy - jy) ** 2) < (R[rk] * k) ** 2) & mask & parent_ok
                shape |= capm
            if not shape.any():
                print(f'  ! {vid}/{name}: пусто — проверьте разметку')
                continue
            if name in skipped:
                # часть почти целиком закрыта (например, дальнее плечо за торсом):
                # игра возьмёт ближнюю часть и затемнит её
                print(f'  · {vid}/{name}: видна меньше чем на 15% — будет взята ближняя пара')
                if vid == next(iter(cfg['variants'])):
                    rig['bones'][name] = round(math.dist(Q[j0], Q[j1]) * upp, 2)
                continue
            px_rgb = rgb.copy()
            if hidden.any() and cv2 is not None and own.any():
                # достраиваем закрытое по видимой текстуре этой же части
                # источник текстуры — часть без краевой полосы (там цвета соседей)
                core = np.asarray(Image.fromarray((own * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(9))) > 0
                if core.sum() < 50:
                    core = own
                bad = (~core).astype(np.uint8) * 255
                filled = cv2.inpaint(np.ascontiguousarray(px_rgb[..., ::-1]), bad, 9, cv2.INPAINT_TELEA)[..., ::-1]
                px_rgb = np.where(hidden[..., None], filled, px_rgb)
            elif hidden.any():
                shape = shape & ~hidden
            ys, xs = np.nonzero(shape)
            bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
            soft = Image.fromarray((shape * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
            a_part = np.minimum(np.asarray(soft), np.where(hidden, 255, alpha))
            rgba = np.dstack([px_rgb, a_part.astype(np.uint8)])[by0:by1, bx0:bx1]
            fn = f'{name}.png'
            Image.fromarray(rgba, 'RGBA').save(os.path.join(vdir, fn), optimize=True)
            files[name] = f"{cfg['out_dir']}/{vid}/{fn}"
            if vid == next(iter(cfg['variants'])):
                W, H = bx1 - bx0, by1 - by0
                piv = ((Q[j0][0] - bx0) / W, (Q[j0][1] - by0) / H)
                end = ((Q[j1][0] - bx0) / W, (Q[j1][1] - by0) / H)
                spec = {'pivot': [round(piv[0], 4), round(piv[1], 4)], 'end': [round(end[0], 4), round(end[1], 4)]}
                if name == 'torso':
                    for side in ('near', 'far'):
                        sx, sy = Q[f'shoulder_{side}']
                        spec[f'shoulder_{side}'] = [round((sx - bx0) / W, 4), round((sy - by0) / H, 4)]
                rig['parts'][name] = spec
                rig['bones'][name] = round(math.dist(Q[j0], Q[j1]) * upp, 2)
        rig['variants'][vid] = files
        print(f'  {vid}: {len(files)} частей → {os.path.relpath(vdir, ROOT)}')

    rig['hipY'] = round(-(P['sole_y'] - P['hip'][1]) * upp, 2)
    rig['farDarken'] = cfg.get('far_darken', 0.55)

    js = os.path.join(ROOT, cfg['js_out'])
    os.makedirs(os.path.dirname(js), exist_ok=True)
    with open(js, 'w') as f:
        f.write('// Создано tools/rig_from_fullbody.py — не редактировать вручную.\n')
        f.write(f"// Разметка: {rig['source']}\n")
        f.write(f"AB.RIGS = AB.RIGS || {{}};\nAB.RIGS.{cfg['rig']} = {json.dumps(rig, ensure_ascii=False, indent=2)};\n")
    print(f'  скелет → {os.path.relpath(js, ROOT)}')


if __name__ == '__main__':
    run(sys.argv[1])
