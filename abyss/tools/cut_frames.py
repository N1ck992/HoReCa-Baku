#!/usr/bin/env python3
"""
№122: кадры ходьбы костюма из листа (зелёный фон #00FF00): ряды — стороны, столбцы — кадры.

    python3 tools/cut_frames.py <лист.png> <папка-выхода> <ИМЯ_ПЕРЕМЕННОЙ> [столбцов=4] [рядов=2]

Ряд 1 — лицом вправо, ряд 2 — лицом влево. Каждый кадр: убираем зелёный, обрезаем по силуэту,
точка опоры — середина шлема/ранца по горизонтали (центр верхней трети фигуры) и подошва по вертикали,
чтобы кадры не «прыгали». Результат: <папка>/r0.webp… и js/data/rigs/<ИМЯ>.js.
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, out_rel, var = sys.argv[1], sys.argv[2], sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 4
rows = int(sys.argv[5]) if len(sys.argv) > 5 else 2
SCALE = 0.75
out = os.path.join(ROOT, out_rel); os.makedirs(out, exist_ok=True)
img = Image.open(src).convert('RGB'); a = np.asarray(img).astype(int)
H, W = a.shape[:2]; cw, ch = W // cols, H // rows
sides = ['right', 'left']
res = {s: [] for s in sides[:rows]}
heights = []
for r in range(rows):
    for c in range(cols):
        cell = a[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw].copy()
        R, G, B = cell[..., 0], cell[..., 1], cell[..., 2]
        fg = ~((G > 120) & (G > R * 1.3) & (G > B * 1.3))
        fg = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))) > 0
        cell[..., 1] = np.where(fg, np.minimum(G, np.maximum(R, B) + 8), G)     # без зелёного ореола
        ys, xs = np.nonzero(fg)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        top = fg[y0:y0 + (y1 - y0) // 3]
        tx = np.nonzero(top)[1].mean()
        alpha = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))
        rgba = np.dstack([cell.astype(np.uint8), alpha])[y0:y1, x0:x1]
        im = Image.fromarray(rgba, 'RGBA')
        im = im.resize((round(im.width * SCALE), round(im.height * SCALE)), Image.LANCZOS)
        name = f'{sides[r][0]}{c}.webp'
        im.save(os.path.join(out, name), 'WEBP', quality=90, method=6)
        res[sides[r]].append({'file': f'{out_rel}/{name}', 'w': im.width, 'h': im.height,
                              'ax': round((tx - x0) * SCALE, 1), 'ay': im.height})
        heights.append(y1 - y0)
        print(f'  {sides[r]} {c}: {im.width}×{im.height}')
art = {'source': os.path.relpath(src, ROOT), 'frames': res, 'heightPx': round(max(heights) * SCALE),
       'walk': [1, 2, 3, 0], 'idle': 0}
js = os.path.join(ROOT, 'js/data/rigs', var + '.js')
with open(js, 'w') as f:
    f.write('// Создано tools/cut_frames.py — не редактировать вручную (№122).\n')
    f.write('// Кадры ходьбы костюма: ax/ay — точка опоры (центр шлема по горизонтали, подошва).\n')
    f.write('AB.RIGS = AB.RIGS || {};\nAB.RIGS.' + var + ' = ' + json.dumps(art, ensure_ascii=False, indent=2) + ';\n')
print('  →', os.path.relpath(js, ROOT))
