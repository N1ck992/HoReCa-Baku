# Сделать текстуру бесшовной (№209): края подмешиваются из середины (картинка, сдвинутая на половину),
# в узкой полосе у краёв; середина — без изменений. python3 tools/seamless.py вход выход [размер] [полоса]
import sys, numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
band = float(sys.argv[4]) if len(sys.argv) > 4 else 0.14
im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
r = np.roll(np.roll(a, size // 2, 0), size // 2, 1)
t = np.minimum(np.arange(size), size - 1 - np.arange(size)) / (size * band)
t = np.clip(t, 0, 1); t = t * t * (3 - 2 * t)
m = np.minimum.outer(t, t)[..., None]
out = a * m + r * (1 - m)
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dst, 'WEBP', quality=86)
b = np.asarray(Image.open(dst).convert('RGB')).astype(int)
print(dst, 'шов X', round(abs(b[:, 0] - b[:, -1]).mean(), 1), 'шов Y', round(abs(b[0] - b[-1]).mean(), 1), 'соседние', round(abs(b[:, 1] - b[:, 2]).mean(), 1))
