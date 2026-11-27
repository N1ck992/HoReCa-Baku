# Кузнец: разрезать картинку автора (assets/vehicles/forge.webp, 632×640) на детали в общей рамке 632×640
import numpy as np, cv2, sys
from PIL import Image, ImageDraw, ImageFilter
SRC = '/home/user/HoReCa-Baku/abyss/assets/vehicles/forge.webp'
im = Image.open(SRC).convert('RGBA'); W, H = im.size
A = np.array(im)
P = {  # многоугольники деталей в координатах картинки
 'ua':      [(118,168),(150,150),(205,146),(255,152),(262,205),(248,240),(215,258),(200,300),(175,318),(130,318),(102,300),(100,262),(112,225)],
 'fa':      [(70,318),(100,300),(130,312),(190,310),(205,330),(200,372),(172,405),(152,428),(118,432),(90,412),(72,375)],
 'fist':    [(0,425),(80,415),(118,402),(150,410),(172,430),(168,470),(165,560),(120,585),(40,582),(0,560)],
 'thigh':   [(228,372),(262,355),(305,352),(352,360),(356,410),(352,445),(318,468),(282,476),(248,470),(225,440)],
 'shin':    [(165,470),(230,452),(262,466),(300,470),(330,452),(356,452),(362,520),(362,632),(160,632),(150,600)],
 'thigh_far':[(398,372),(430,355),(472,362),(500,385),(498,440),(470,458),(430,462),(400,448)],
 'shin_far':[(368,445),(410,452),(445,458),(480,450),(505,445),(520,500),(570,560),(578,632),(368,632),(362,560)],
 'ua_far':  [(458,312),(490,300),(518,318),(548,355),(552,392),(528,402),(500,382),(468,352)],
 'fa_far':  [(512,378),(548,372),(572,395),(566,425),(538,432),(512,410)],
 'fist_far':[(505,402),(540,428),(566,420),(600,410),(632,440),(632,540),(560,545),(520,500),(505,440)],
}
TORSO = [(232,140),(270,80),(300,55),(330,0),(470,0),(470,110),(500,160),(520,230),(505,330),(470,350),(420,362),(400,374),(360,376),(300,368),(255,360),(230,320),(225,250)]
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
# palm (ладонь — для ближней руки «раскрытая»): у Кузнеца та же кувалда
Image.open(f'{out}/fist.webp').save(f'{out}/palm.webp', 'WEBP', quality=88)
print('ok')
