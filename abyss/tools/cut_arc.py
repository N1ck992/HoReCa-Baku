# Дуга (№207): вырезать руки из корпуса (assets/vehicles/arc-rig/body-full.webp — прежний корпус с руками), корпус — без рук
import numpy as np, cv2, sys
from PIL import Image, ImageDraw, ImageFilter
SRC = '/home/user/HoReCa-Baku/abyss/assets/vehicles/arc-rig/body-full.webp'
im = Image.open(SRC).convert('RGBA'); W, H = im.size
A = np.array(im)
P = {  # №207: руки Дуги в координатах корпуса (775×762)
 'ua':      [(95,400),(150,362),(210,352),(240,378),(232,422),(200,452),(150,490),(112,520),(60,522),(44,482),(70,450)],
 'fa':      [(28,505),(60,470),(105,470),(150,480),(182,500),(198,540),(178,575),(140,590),(90,600),(45,610),(24,570)],
 'fist':    [(38,602),(90,592),(140,587),(182,577),(202,560),(238,570),(248,640),(242,712),(205,752),(150,748),(100,772),(48,762),(36,700)],
 'ua_far':  [(538,398),(600,392),(662,408),(668,460),(642,508),(602,520),(562,508),(534,468)],
 'fa_far':  [(590,486),(628,478),(650,500),(646,530),(618,540),(592,524)],
 'fist_far':[(572,520),(612,505),(650,482),(705,500),(775,555),(775,665),(720,684),(640,645),(590,585),(566,545)],
}
TORSO = [(0,200),(200,170),(300,150),(540,190),(595,330),(565,400),(528,450),(505,520),(475,592),(400,615),(330,605),(270,565),(240,480),(225,420),(150,392),(60,392),(0,335)]
def poly_mask(pts, blur=0):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(pts, fill=255)
    if blur: m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.array(m)
out = sys.argv[1]
names = list(P.keys())
lab = np.zeros((H, W), np.int32)                       # 0 — не размечено, 1 — корпус, 2.. — детали
lab[poly_mask(TORSO) > 0] = 1
for i, n in enumerate(names): lab[poly_mask(P[n]) > 0] = i + 2
opaque = A[..., 3] > 8
# неразмеченные непрозрачные пиксели — ближайшей детали (или корпусу)
seed = (lab > 0).astype(np.uint8)
d, idx = cv2.distanceTransformWithLabels((1 - seed).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
ys, xs = np.nonzero(seed); lbl_of = np.zeros(idx.max() + 1, np.int32); lbl_of[idx[ys, xs]] = lab[ys, xs]
full = np.where(lab > 0, lab, lbl_of[idx])
def soft(m): return np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9)))
for i, n in enumerate(names):
    m = soft(full == i + 2)
    part = A.copy(); part[..., 3] = (part[..., 3].astype(np.float32) * m / 255).astype(np.uint8)
    Image.fromarray(part).save(f'{out}/{n}.webp', 'WEBP', quality=88)
used = (full >= 2) & opaque
torso = poly_mask(TORSO) > 0
hole = used & torso
body = A.copy(); bm = soft(full == 1)
body[..., 3] = (body[..., 3].astype(np.float32) * bm / 255).astype(np.uint8)
rgb = cv2.cvtColor(A[..., :3], cv2.COLOR_RGB2BGR)
known = opaque & (full == 1)
inp = cv2.inpaint(rgb, np.where(known, 0, 255).astype(np.uint8), 7, cv2.INPAINT_TELEA)
inp = cv2.cvtColor(inp, cv2.COLOR_BGR2RGB)
body[hole, :3] = (inp[hole] * 0.72).astype(np.uint8); body[hole, 3] = 255
Image.fromarray(body).save(f'{out}/body.webp', 'WEBP', quality=88)
# palm: у Дуги — та же клешня
Image.open(f'{out}/fist.webp').save(f'{out}/palm.webp', 'WEBP', quality=88)
print('ok')
