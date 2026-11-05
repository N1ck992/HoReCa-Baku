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
        norm = {}
        for name, j0, j1, ext, rk in BONES:
            a, b = Q[j0], Q[j1]
            d = seg_dist(xx, yy, a, b)
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

        vdir = os.path.join(out_dir, vid)
        os.makedirs(vdir, exist_ok=True)
        files = {}
        for name, j0, j1, ext, rk in BONES:
            own = (owner == name) & mask
            # полная форма части: её капсула внутри силуэта (включая закрытое другими)
            shape = own | ((norm[name] <= 1.0) & mask)
            hidden = shape & ~own
            # запас вокруг верхнего сустава (против щелей при сгибе)
            jx, jy = Q[j0]
            if name != 'torso':
                capm = (((xx - jx) ** 2 + (yy - jy) ** 2) < (R[rk] * 0.9) ** 2) & mask
                hidden |= capm & ~own & ~shape
                shape |= capm
            if not shape.any():
                print(f'  ! {vid}/{name}: пусто — проверьте разметку')
                continue
            if own.sum() < 0.15 * shape.sum():
                # часть почти целиком закрыта (например, дальнее плечо за торсом):
                # игра возьмёт ближнюю часть и затемнит её
                print(f'  · {vid}/{name}: видна меньше чем на 15% — будет взята ближняя пара')
                if vid == next(iter(cfg['variants'])):
                    rig['bones'][name] = round(math.dist(Q[j0], Q[j1]) * upp, 2)
                continue
            px_rgb = rgb.copy()
            if hidden.any() and cv2 is not None and own.any():
                # достраиваем закрытое по видимой текстуре этой же части
                bad = (~own).astype(np.uint8) * 255
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
