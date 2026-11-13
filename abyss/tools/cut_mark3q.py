# Нарезка героя вполоборота на 15 частей для перекладной анимации (№75).
#   python3 tools/cut_mark3q.py tools/rigs3q/mark-a.json
# Конфиг: src — картинка на зелёном фоне, out — папка частей, joints — суставы (px исходника),
# thick — толщина каждой части. Каждый пиксель фигуры относится к ближайшей «кости»
# (отрезок между суставами минус толщина); вокруг сустава часть заходит на родителя
# (нахлёст), чтобы при повороте не было щелей. Пишет части PNG и rig.json.
import json, sys, os
import numpy as np
from PIL import Image

cfg = json.load(open(sys.argv[1]))
SRC, OUT, J, TH = cfg['src'], cfg['out'], {k: tuple(v) for k, v in cfg['joints'].items()}, cfg['thick']
SCALE = cfg.get('scale', 0.5)
# часть: (сустав-опора, конец кости, родитель)
P = {
  'pelvis': ('waist', 'crotch', None), 'torso': ('waist', 'chest', 'pelvis'), 'head': ('neck', 'crown', 'torso'),
  'uarm_n': ('sh_n', 'el_n', 'torso'), 'farm_n': ('el_n', 'wr_n', 'uarm_n'), 'hand_n': ('wr_n', 'fi_n', 'farm_n'),
  'uarm_f': ('sh_f', 'el_f', 'torso'), 'farm_f': ('el_f', 'wr_f', 'uarm_f'), 'hand_f': ('wr_f', 'fi_f', 'farm_f'),
  'thigh_n': ('hip_n', 'kn_n', 'pelvis'), 'shin_n': ('kn_n', 'an_n', 'thigh_n'), 'foot_n': ('an_n', 'to_n', 'shin_n'),
  'thigh_f': ('hip_f', 'kn_f', 'pelvis'), 'shin_f': ('kn_f', 'an_f', 'thigh_f'), 'foot_f': ('an_f', 'to_f', 'shin_f'),
}
OVERLAP = 22


# №97: «force» в конфиге — многоугольники, пиксели внутри которых принудительно отходят указанной кости
# (например, пояс и пах — тазу, а не торсу). Формат: "force": {"pelvis": [[x, y], ...]}
from PIL import ImageDraw as _ID
def force_masks(cfg, W, H):
  out = {}
  for bn, poly in (cfg.get('force') or {}).items():
    mk = Image.new('L', (W, H), 0); _ID.Draw(mk).polygon([tuple(p) for p in poly], fill=255)
    out[bn] = np.asarray(mk) > 0
  return out

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = (g > 120) & (g > r * 1.35) & (g > b * 1.35)
alpha = np.where(green, 0, 255).astype(np.uint8)
g2 = np.minimum(g, np.maximum(r, b) * 1.05)              # убрать зелёную кайму
rgb = np.stack([r, g2, b], -1).clip(0, 255).astype(np.uint8)
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
def segdist(a, c):
  ax, ay = a; cx, cy = c; vx, vy = cx - ax, cy - ay
  t = np.clip(((xs - ax) * vx + (ys - ay) * vy) / (vx * vx + vy * vy), 0, 1)
  return np.hypot(xs - (ax + t * vx), ys - (ay + t * vy))
names = list(P)
owner = np.argmin(np.stack([segdist(J[P[n][0]], J[P[n][1]]) - TH[n] for n in names]), 0)
for bn, fm in force_masks(cfg, W, H).items(): owner[fm] = names.index(bn)
fig = alpha > 0
fy, fx = np.nonzero(fig)
os.makedirs(OUT, exist_ok=True)
# опора на пол: самая нижняя точка подошв, по горизонтали — середина между стопами
ground = [int((J['to_n'][0] + J['to_f'][0] + J['an_n'][0] + J['an_f'][0]) / 4), int(fy.max())]
meta = {'order': cfg.get('order'), 'scale': SCALE, 'size': [W, H], 'ground': ground, 'height': int(fy.max() - fy.min()), 'face': cfg.get('face', 1), 'parts': {}}
for i, n in enumerate(names):
  piv, end, parent = P[n]
  m = fig & (owner == i)
  if parent:
    jx, jy = J[piv]
    m = m | (fig & (np.hypot(xs - jx, ys - jy) < OVERLAP + TH[n] * 0.6) & (owner == names.index(parent)))
  yy, xx = np.nonzero(m)
  x0, x1, y0, y1 = xx.min(), xx.max() + 1, yy.min(), yy.max() + 1
  rgba = np.dstack([rgb[y0:y1, x0:x1], np.where(m[y0:y1, x0:x1], alpha[y0:y1, x0:x1], 0)]).astype(np.uint8)
  img = Image.fromarray(rgba, 'RGBA')
  img = img.resize((max(1, round(img.width * SCALE)), max(1, round(img.height * SCALE))), Image.LANCZOS)
  img.save(f'{OUT}/{n}.png', optimize=True)
  meta['parts'][n] = {'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'pivot': list(J[piv]), 'end': list(J[end]), 'parent': parent}
json.dump(meta, open(f'{OUT}/rig.json', 'w'), ensure_ascii=False, indent=1)
if len(sys.argv) > 2:                                       # цветная раскладка частей — для проверки
  PAL = [(230,60,60),(60,90,230),(240,200,40),(40,200,90),(200,60,220),(60,220,230),(250,130,30),(130,250,60),(150,90,40),(255,255,255),(120,120,255),(255,120,190),(30,120,60),(200,200,120),(90,40,140)]
  prev = np.zeros((H, W, 3), np.uint8)
  for i in range(len(names)): prev[fig & (owner == i)] = PAL[i]
  Image.blend(Image.fromarray(prev), Image.fromarray(rgb), 0.4).save(sys.argv[2])
print('ok', OUT, meta['ground'], meta['height'])
