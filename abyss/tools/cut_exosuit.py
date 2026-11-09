#!/usr/bin/env python3
"""
Нарезка экзокостюма (EQUIP-005) из одной картинки сбоку (дополнение №62).

    python3 tools/cut_exosuit.py

У этого дизайна корпус почти целиком закрыт наплечником и ближней рукой, поэтому режем не на 11
частей, как человека, а на то, что действительно двигается:
  body          — корпус со шлемом, ранцем, наплечником и дальней рукой (жёстко, наклоняется целиком)
  forearm_near  — ближнее предплечье с кулаком (удар, вращение в локте)
  thigh_near, shin_near, thigh_far, shin_far — ноги (шаг)
Закрытые места (корпус за предплечьем, дальнее бедро за ближней ногой) достраиваются по текстуре
(OpenCV inpaint). Результат: assets/exosuit/v2/*.png и js/data/rigs/EXOSUIT_ART.js.
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/source/EXOSUIT-01.png')
OUT = os.path.join(ROOT, 'assets/exosuit/v2')
SCALE = 0.5                       # уменьшаем: в игре костюм не больше ~400 px в высоту
# суставы на исходной картинке (1024×1536), лицом вправо
J = {
    'crown': (655, 60), 'hip': (515, 905),
    'elbow': (485, 545), 'wrist': (640, 715), 'hand': (690, 800),
    'hip_near': (520, 960), 'knee_near': (515, 1160), 'ankle_near': (530, 1310), 'toe_near': (790, 1450),
    'hip_far': (470, 950), 'knee_far': (370, 1140), 'ankle_far': (320, 1300), 'toe_far': (430, 1440),
}
SOLE = 1490
# капсулы частей: (отрезки, толщина в px)
CAPS = {
    'forearm_near': ([('elbow', 'wrist'), ('wrist', 'hand')], 95),
    'shin_near': ([('knee_near', 'ankle_near'), ('ankle_near', 'toe_near')], 120),
    'thigh_near': ([('hip_near', 'knee_near')], 115),
    'thigh_far': ([('hip_far', 'knee_far')], 105),
    'shin_far': ([('knee_far', 'ankle_far'), ('ankle_far', 'toe_far')], 115),
}
ORDER = ['forearm_near', 'shin_near', 'thigh_near', 'body', 'thigh_far', 'shin_far']   # ближнее — раньше


def seg_dist(xx, yy, a, b):
    ax, ay = a; bx, by = b; vx, vy = bx - ax, by - ay
    t = np.clip(((xx - ax) * vx + (yy - ay) * vy) / (vx * vx + vy * vy), 0, 1)
    return np.hypot(xx - (ax + t * vx), yy - (ay + t * vy))


def main():
    img = Image.open(SRC).convert('RGB')
    a = np.asarray(img).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fg = ~((g > 120) & (g > r * 1.3) & (g > b * 1.3))
    fg = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))) > 0
    spill = np.minimum(g, np.maximum(r, b) + 8)
    a[..., 1] = np.where(fg, spill, g)                    # убираем зелёный ореол
    rgb = a.astype(np.uint8)
    h, w = fg.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = {}
    for n, (segs, rad) in CAPS.items():
        d = np.min(np.stack([seg_dist(xx, yy, J[s0], J[s1]) for s0, s1 in segs]), axis=0)
        dist[n] = d / rad
    owner = np.full((h, w), '', dtype=object)
    done = np.zeros((h, w), bool)
    for n in ORDER:
        if n == 'body':
            # корпус — всё выше линии таза, что не взяла рука
            inside = fg & ~done & (yy < 930)
        else:
            inside = fg & ~done & (dist[n] <= 1.0)
            if n.startswith('thigh'):
                inside &= yy > 900                       # бедро начинается ниже юбки корпуса
        owner[inside] = n; done |= inside
    # что осталось (края ног) — ближайшей ноге
    left = fg & ~done
    legs = ['shin_near', 'thigh_near', 'thigh_far', 'shin_far']
    near = np.argmin(np.stack([dist[n] for n in legs]), axis=0)
    owner[left] = np.array(legs, dtype=object)[near][left]

    os.makedirs(OUT, exist_ok=True)
    parts = {}
    for n in ORDER:
        own = (owner == n) & fg
        hidden = np.zeros_like(own)
        if n == 'body':
            # корпус за предплечьем: полоса под рукой внутри силуэта
            hidden = (owner == 'forearm_near') & (yy < 900)
        elif n == 'thigh_far':
            hidden = (dist['thigh_far'] <= 0.85) & ((owner == 'thigh_near') | (owner == 'shin_near')) & (yy > 930)
        elif n == 'shin_far':
            hidden = (dist['shin_far'] <= 0.8) & ((owner == 'shin_near') | (owner == 'thigh_near'))
        elif n == 'thigh_near':
            hidden = (dist['thigh_near'] <= 0.8) & (owner == 'shin_near') & (yy < J['knee_near'][1] + 40)
        px = rgb.copy()
        if hidden.any():
            core = np.asarray(Image.fromarray((own * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7))) > 0
            bad = (~core).astype(np.uint8) * 255
            filled = cv2.inpaint(np.ascontiguousarray(px[..., ::-1]), bad, 7, cv2.INPAINT_TELEA)[..., ::-1]
            # закрытое — тёмная механика под бронёй (затемнённая достроенная текстура с шумом),
            # а не размытое пятно: у робота там действительно тень и узлы
            rng = np.random.default_rng(7)
            noise = rng.integers(-6, 7, size=filled.shape[:2])[..., None]
            dark = np.clip(filled.astype(int) * 0.32 + 18 + noise, 0, 255).astype(np.uint8)
            px = np.where(hidden[..., None], dark, px)
        shape = own | hidden
        ys, xs = np.nonzero(shape)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        alpha = np.asarray(Image.fromarray((shape * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9)))
        rgba = np.dstack([px, alpha.astype(np.uint8)])[y0:y1, x0:x1]
        im = Image.fromarray(rgba, 'RGBA')
        im = im.resize((max(1, round(im.width * SCALE)), max(1, round(im.height * SCALE))), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{n}.png'), optimize=True)
        parts[n] = {'file': f'assets/exosuit/v2/{n}.png', 'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0)}
        print(f'  {n}: {x1 - x0}×{y1 - y0}' + (' (достроено)' if hidden.any() else ''))

    art = {
        'source': 'assets/source/EXOSUIT-01.png', 'scale': SCALE,
        'heightPx': SOLE - J['crown'][1], 'soleY': SOLE, 'joints': J, 'parts': parts,
        'order': ['thigh_far', 'shin_far', 'body', 'thigh_near', 'shin_near', 'forearm_near'],   # дальнее — раньше
    }
    js = os.path.join(ROOT, 'js/data/rigs/EXOSUIT_ART.js')
    with open(js, 'w') as f:
        f.write('// Создано tools/cut_exosuit.py — не редактировать вручную (№62).\n')
        f.write('// Картинка экзокостюма, нарезанная на части: координаты — в пикселях исходника.\n')
        f.write('AB.RIGS = AB.RIGS || {};\nAB.RIGS.EXOSUIT_ART = ' + json.dumps(art, ensure_ascii=False, indent=2) + ';\n')
    print('  →', os.path.relpath(js, ROOT))


if __name__ == '__main__':
    main()
