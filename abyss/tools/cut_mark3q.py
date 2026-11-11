# Нарезка Марка (вполоборота спереди) на 15 частей для перекладной анимации (тест, №75).
# Источник: assets/source/CHAR001-3Q-front.webp (зелёный фон). Каждый пиксель фигуры
# относится к ближайшей «кости» (отрезок между суставами, с учётом толщины части);
# у каждой части — запас вокруг её сустава (нахлёст), чтобы при повороте не было щелей.
import json, sys, math
import numpy as np
from PIL import Image

SRC = 'assets/source/CHAR001-3Q-front.webp'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/char001/3q/front'
SCALE = 0.5
# суставы в пикселях исходника (887×1774)
J = {
  'neck': (474, 292), 'crown': (462, 85), 'waist': (466, 742), 'chest': (468, 420), 'crotch': (470, 930),
  'sh_n': (262, 440), 'el_n': (198, 652), 'wr_n': (194, 792), 'fi_n': (200, 945),
  'sh_f': (612, 430), 'el_f': (665, 640), 'wr_f': (706, 748), 'fi_f': (728, 890),
  'hip_n': (402, 890), 'kn_n': (350, 1185), 'an_n': (276, 1470), 'to_n': (300, 1650),
  'hip_f': (545, 890), 'kn_f': (590, 1160), 'an_f': (565, 1425), 'to_f': (700, 1560),
}
# часть: (сустав-опора, конец кости, толщина, родитель)
P = {
  'pelvis':    ('waist', 'crotch', 120, None),
  'torso':     ('waist', 'chest', 155, 'pelvis'),
  'head':      ('neck', 'crown', 105, 'torso'),
  'uarm_n':    ('sh_n', 'el_n', 48, 'torso'),  'farm_n': ('el_n', 'wr_n', 42, 'uarm_n'), 'hand_n': ('wr_n', 'fi_n', 45, 'farm_n'),
  'uarm_f':    ('sh_f', 'el_f', 44, 'torso'),  'farm_f': ('el_f', 'wr_f', 40, 'uarm_f'), 'hand_f': ('wr_f', 'fi_f', 42, 'farm_f'),
  'thigh_n':   ('hip_n', 'kn_n', 70, 'pelvis'), 'shin_n': ('kn_n', 'an_n', 62, 'thigh_n'), 'foot_n': ('an_n', 'to_n', 80, 'shin_n'),
  'thigh_f':   ('hip_f', 'kn_f', 66, 'pelvis'), 'shin_f': ('kn_f', 'an_f', 58, 'thigh_f'), 'foot_f': ('an_f', 'to_f', 80, 'shin_f'),
}
OVERLAP = 22   # px исходника: нахлёст части на родителя вокруг сустава

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = (g > 120) & (g > r * 1.35) & (g > b * 1.35)
alpha = np.where(green, 0, 255).astype(np.uint8)
# убрать зелёную кайму: зелёный не больше максимума красного и синего
g2 = np.minimum(g, np.maximum(r, b) * 1.05)
rgb = np.stack([r, g2, b], -1).clip(0, 255).astype(np.uint8)

ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
def segdist(a, c):
  ax, ay = a; cx, cy = c
  vx, vy = cx - ax, cy - ay
  t = ((xs - ax) * vx + (ys - ay) * vy) / (vx * vx + vy * vy)
  t = np.clip(t, 0, 1)
  return np.hypot(xs - (ax + t * vx), ys - (ay + t * vy))
names = list(P)
D = np.stack([segdist(J[P[n][0]], J[P[n][1]]) - P[n][2] for n in names])
owner = np.argmin(D, 0)
fig = alpha > 0
meta = {'scale': SCALE, 'size': [W, H], 'joints': {k: [v[0], v[1]] for k, v in J.items()}, 'parts': {}}
import os
os.makedirs(OUT, exist_ok=True)
preview = np.zeros((H, W, 3), np.uint8)
PAL = [(230,60,60),(60,90,230),(240,200,40),(40,200,90),(200,60,220),(60,220,230),(250,130,30),(130,250,60),(150,90,40),(255,255,255),(120,120,255),(255,120,190),(30,120,60),(200,200,120),(90,40,140)]
for i, n in enumerate(names):
  piv, end, thick, parent = P[n]
  m = fig & (owner == i)
  # нахлёст: пиксели родителя в круге вокруг своего сустава
  if parent:
    jx, jy = J[piv]
    m = m | (fig & (np.hypot(xs - jx, ys - jy) < OVERLAP + thick * 0.6) & (owner == names.index(parent)))
  preview[fig & (owner == i)] = PAL[i]
  yy, xx = np.nonzero(m)
  x0, x1, y0, y1 = xx.min(), xx.max() + 1, yy.min(), yy.max() + 1
  rgba = np.dstack([rgb[y0:y1, x0:x1], np.where(m[y0:y1, x0:x1], alpha[y0:y1, x0:x1], 0)]).astype(np.uint8)
  img = Image.fromarray(rgba, 'RGBA')
  img = img.resize((max(1, round(img.width * SCALE)), max(1, round(img.height * SCALE))), Image.LANCZOS)
  img.save(f'{OUT}/{n}.png', optimize=True)
  meta['parts'][n] = {'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'pivot': J[piv], 'end': J[end], 'parent': parent}
json.dump(meta, open(f'{OUT}/rig.json', 'w'), ensure_ascii=False, indent=1)
# Image.fromarray(preview).save(f'{OUT}/_preview.png')   # цветная раскладка частей — для проверки
print('ok', len(names), 'parts')
