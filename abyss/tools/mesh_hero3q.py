# Сетки для героя вполоборота (№78, подход как в Spine): рука, нога и тело — цельные куски,
# натянутые на сетку из треугольников; каждая вершина привязана к 1–3 костям с весами.
# При повороте костей сетка плавно гнётся (колено, локоть, пояс) — без стыков между частями.
#   python3 tools/mesh_hero3q.py tools/rigs3q/mark-b.json [preview.png]
# Пишет в папку out (из конфига) рядом с частями: mesh_*.png и mesh.json.
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw

cfg = json.load(open(sys.argv[1]))
SRC, OUT, J, TH = cfg['src'], cfg['out'], {k: tuple(v) for k, v in cfg['joints'].items()}, cfg['thick']
SCALE = cfg.get('scale', 0.5)
BONES = {
  'pelvis': ('waist', 'crotch'), 'torso': ('waist', 'chest'), 'head': ('neck', 'crown'),
  'uarm_n': ('sh_n', 'el_n'), 'farm_n': ('el_n', 'wr_n'), 'hand_n': ('wr_n', 'fi_n'),
  'uarm_f': ('sh_f', 'el_f'), 'farm_f': ('el_f', 'wr_f'), 'hand_f': ('wr_f', 'fi_f'),
  'thigh_n': ('hip_n', 'kn_n'), 'shin_n': ('kn_n', 'an_n'), 'foot_n': ('an_n', 'to_n'),
  'thigh_f': ('hip_f', 'kn_f'), 'shin_f': ('kn_f', 'an_f'), 'foot_f': ('an_f', 'to_f'),
}
# группы: какие кости образуют цельный кусок; plus — к какой кости пристёгнут «корень» (нахлёст)
GROUPS = {
  'arm_f': ['uarm_f', 'farm_f', 'hand_f'],
  'leg_f': ['thigh_f', 'shin_f', 'foot_f'],
  'body': ['pelvis', 'torso', 'head'],
  'leg_n': ['thigh_n', 'shin_n', 'foot_n'],
  'arm_n': ['uarm_n', 'farm_n', 'hand_n'],
}
ORDER = cfg.get('mesh_order', ['arm_f', 'leg_f', 'body', 'leg_n', 'arm_n'])
CELL = 26          # шаг сетки, px исходника
SIGMA = cfg.get('sigma', 30)   # ширина плавного перехода веса у сустава, px

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = (g > 120) & (g > r * 1.35) & (g > b * 1.35)
alpha = np.where(green, 0, 255).astype(np.uint8)
g2 = np.minimum(g, np.maximum(r, b) * 1.05)
rgb = np.stack([r, g2, b], -1).clip(0, 255).astype(np.uint8)
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)

def segd(px, py, a, c):
  ax, ay = a; cx, cy = c; vx, vy = cx - ax, cy - ay
  t = np.clip(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1)
  return np.hypot(px - (ax + t * vx), py - (ay + t * vy))
names = list(BONES)
owner = np.argmin(np.stack([segd(xs, ys, J[BONES[n][0]], J[BONES[n][1]]) - TH[n] for n in names]), 0)
fig = alpha > 0
os.makedirs(OUT, exist_ok=True)
meta = {'groups': {}, 'order': ORDER, 'bones': names}
prev = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA').convert('RGB') if len(sys.argv) > 2 else None
pd = ImageDraw.Draw(prev) if prev else None
PARENT = {'arm_f': 'torso', 'arm_n': 'torso', 'leg_f': 'pelvis', 'leg_n': 'pelvis', 'body': None}
for gname, bones in GROUPS.items():
  m = np.zeros_like(fig)
  for bn in bones: m |= fig & (owner == names.index(bn))
  # нахлёст корня на родителя (плечо на торс, бедро на таз), чтобы при сгибе не было щели
  root = BONES[bones[0]][0]
  if PARENT[gname]:
    jx, jy = J[root]
    m |= fig & (np.hypot(xs - jx, ys - jy) < 24 + TH[bones[0]] * 0.6) & (owner == names.index(PARENT[gname]))
  # расширить маску на пару пикселей внутрь соседей, чтобы края кусков не просвечивали
  yy, xx = np.nonzero(m)
  x0, x1, y0, y1 = max(0, xx.min() - 2), min(W, xx.max() + 3), max(0, yy.min() - 2), min(H, yy.max() + 3)
  sub = np.dstack([rgb[y0:y1, x0:x1], np.where(m[y0:y1, x0:x1], alpha[y0:y1, x0:x1], 0)]).astype(np.uint8)
  img = Image.fromarray(sub, 'RGBA')
  img = img.resize((max(1, round(img.width * SCALE)), max(1, round(img.height * SCALE))), Image.LANCZOS)
  img.save(f'{OUT}/mesh_{gname}.png', optimize=True)
  # сетка по рамке куска
  cols = max(2, int(np.ceil((x1 - x0) / CELL))); rows = max(2, int(np.ceil((y1 - y0) / CELL)))
  vx_ = np.linspace(x0, x1, cols + 1); vy_ = np.linspace(y0, y1, rows + 1)
  verts, weights = [], []
  for vy in vy_:
    for vx in vx_:
      d = np.array([float(segd(np.float32(vx), np.float32(vy), J[BONES[bn][0]], J[BONES[bn][1]])) for bn in bones])
      w = np.exp(-((d - d.min()) / SIGMA) ** 2)
      w[w < 0.02] = 0
      w /= w.sum()
      top = np.argsort(-w)[:3]
      weights.append([[names.index(bones[i]), round(float(w[i]), 3)] for i in top if w[i] > 0])
      verts.append([round(float(vx), 1), round(float(vy), 1)])
  tris = []
  cover = m.astype(np.uint8)
  for rr in range(rows):
    for cc in range(cols):
      a = rr * (cols + 1) + cc; bq = a + 1; c = a + cols + 1; d = c + 1
      cx0, cx1, cy0, cy1 = int(vx_[cc]), int(np.ceil(vx_[cc + 1])), int(vy_[rr]), int(np.ceil(vy_[rr + 1]))
      if not cover[max(0, cy0 - 2):cy1 + 2, max(0, cx0 - 2):cx1 + 2].any(): continue   # пустая клетка — без треугольников
      tris += [[a, bq, d], [a, d, c]]
  meta['groups'][gname] = {'img': f'mesh_{gname}.png', 'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0),
                            'verts': verts, 'weights': weights, 'tris': tris, 'bones': bones}
  if pd:
    for t in tris:
      p = [tuple(verts[i]) for i in t] + [tuple(verts[t[0]])]
      pd.line(p, fill=(255, 255, 255), width=1)
json.dump(meta, open(f'{OUT}/mesh.json', 'w'), separators=(',', ':'))
if prev: prev.resize((W // 2, H // 2)).save(sys.argv[2])
print('ok', {g: len(v['tris']) for g, v in meta['groups'].items()})
