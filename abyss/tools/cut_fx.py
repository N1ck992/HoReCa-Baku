# Нарезка листа эффектов (дополнение №147): python3 tools/cut_fx.py <лист.webp|png> <папка> [ряды]
# Лист — на прозрачном фоне, кадры рядами. Ряды ищутся по пустым строкам, кадры в ряду — по пустым
# столбцам (мелкие искры прилипают к ближайшему кадру). Ряды подписываются по порядку: [ряды] — через
# запятую, например «charge,fly,hit,hit» (одинаковые имена — кадры продолжают нумерацию).
# Для каждого кадра — точка привязки: «ядро» (центр самых ярких пикселей), чтобы эффект стоял ровно.
# На выходе: <папка>/<ряд>_<n>.webp и <папка>/frames.json { ряд: [{ file, w, h, ax, ay }] }.
import sys, os, json
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
names = (sys.argv[3] if len(sys.argv) > 3 else 'charge,fly,hit,hit').split(',')
im = Image.open(src).convert('RGBA'); W, H = im.size; px = im.load()
A = [[px[x, y][3] > 18 for x in range(W)] for y in range(H)]

def bands(occ, gap):
    res, start, empty = [], None, 0
    for i, o in enumerate(occ):
        if o:
            if start is None: start = i
            empty = 0
        elif start is not None:
            empty += 1
            if empty >= gap: res.append((start, i - empty)); start = None; empty = 0
    if start is not None: res.append((start, len(occ) - 1))
    return res

# ряды: по пустым строкам; если два ряда слиплись — разрезать по самой пустой строке (ROWS=«y1,y2,…» — явные границы)
prof = [sum(A[y]) for y in range(H)]
if os.environ.get('ROWS'):
    cuts = [0] + [int(v) for v in os.environ['ROWS'].split(',')] + [H]
    rows = [(cuts[i], cuts[i + 1] - 1) for i in range(len(cuts) - 1)]
else:
    rows = bands([p > 2 for p in prof], 10)
# сколько кадров в каждом ряду (COUNTS=«6,6,5,5»): лишние куски — к соседу, слипшиеся — разрезать по минимуму
COUNTS = [int(v) for v in os.environ['COUNTS'].split(',')] if os.environ.get('COUNTS') else None
os.makedirs(out, exist_ok=True)
meta, count = {}, {}
for ri, (y0, y1) in enumerate(rows):
    name = names[min(ri, len(names) - 1)]
    cprof = [sum(A[y][x] for y in range(y0, y1 + 1)) for x in range(W)]
    segs = bands([c > 1 for c in cprof], 4)
    if COUNTS:
        want = COUNTS[min(ri, len(COUNTS) - 1)]
        while len(segs) > want:                            # самый узкий кусок — к ближайшему соседу
            i = min(range(len(segs)), key=lambda k: segs[k][1] - segs[k][0])
            j = i - 1 if i == len(segs) - 1 or (i > 0 and segs[i][0] - segs[i - 1][1] < segs[i + 1][0] - segs[i][1]) else i + 1
            a, b = sorted((i, j)); segs[a:b + 1] = [(segs[a][0], segs[b][1])]
        while len(segs) < want:                            # самый широкий — разрезать по самому пустому столбцу в середине
            i = max(range(len(segs)), key=lambda k: segs[k][1] - segs[k][0]); x0, x1 = segs[i]
            lo, hi = x0 + (x1 - x0) // 4, x1 - (x1 - x0) // 4
            cut = min(range(lo, hi), key=lambda x: cprof[x])
            segs[i:i + 1] = [(x0, cut), (cut + 1, x1)]
    else:
        segs = [s for s in segs if s[1] - s[0] > 12]       # отдельные искры — не кадры
    for (x0, x1) in segs:
        box = im.crop((x0, y0, x1 + 1, y1 + 1)); bb = box.getbbox()
        if not bb: continue
        fr = box.crop(bb); w, h = fr.size; fp = fr.load()
        # ядро: центр 3% самых ярких непрозрачных пикселей
        lum = sorted(((fp[x, y][0] + fp[x, y][1] + fp[x, y][2]) * fp[x, y][3], x, y) for y in range(h) for x in range(w) if fp[x, y][3] > 60)
        top = lum[-max(1, len(lum) // 33):] if lum else [(0, w // 2, h // 2)]
        ax = sum(t[1] for t in top) / len(top); ay = sum(t[2] for t in top) / len(top)
        n = count.get(name, 0); count[name] = n + 1
        f = f'{name}_{n}.webp'; fr.save(os.path.join(out, f), quality=90)
        meta.setdefault(name, []).append({ 'file': f, 'w': w, 'h': h, 'ax': round(ax, 1), 'ay': round(ay, 1) })
json.dump(meta, open(os.path.join(out, 'frames.json'), 'w'), indent=1)
print({k: len(v) for k, v in meta.items()}, 'рядов', len(rows))
