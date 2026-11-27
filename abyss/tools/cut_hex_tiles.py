# №113: нарезка клеток дна (шестиугольник, вершина сверху) из картинок автора.
# python3 tools/cut_hex_tiles.py <картинка.png> <имя> [ширина=256]
# Клетки на листе разделены прозрачными промежутками; каждая обрезается по своему силуэту
# (верхняя вершина — y=0, ширина — ровно ширина клетки) → assets/seabed/<имя>-<n>.webp
import sys, os
import numpy as np
from PIL import Image
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, name = sys.argv[1], sys.argv[2]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 256
im = Image.open(src).convert('RGBA'); a = np.array(im)[:, :, 3] > 128
cols = np.where(a.any(0))[0]
segs, s, p = [], cols[0], cols[0]
for c in cols[1:]:
    if c != p + 1: segs.append((s, p)); s = c
    p = c
segs.append((s, p))
segs = [g for g in segs if g[1] - g[0] > 50]
for n, (x0, x1) in enumerate(segs, 1):
    rows = np.where(a[:, x0:x1 + 1].any(1))[0]
    t = im.crop((x0, rows[0], x1 + 1, rows[-1] + 1))
    t = t.resize((W, round(t.height * W / t.width)), Image.LANCZOS)
    out = f'{root}/assets/seabed/{name}-{n}.webp' if len(segs) > 1 else f'{root}/assets/seabed/{name}.webp'
    t.save(out, 'WEBP', quality=88, method=6)
    print(out, t.size, os.path.getsize(out) // 1024, 'КБ')
