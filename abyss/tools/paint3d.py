# Использование: python3 tools/paint3d.py assets/models/sentinel/sentinel.json  (после tools/rig3d.py — он перезаписывает файл модели)
# Разметка материалов по точкам модели (№104): механика (тёмный металл, бронза) и ремень.
# Добавляет в модель поле paint: 2 байта на вершину (механика 0..255, ремень 0..255).
import json, base64, sys, numpy as np
f = sys.argv[1]; j = json.load(open(f)); n = j['verts']; b = base64.b64decode(j['bin'])
P = np.frombuffer(b, np.float32, n * 3, 0).reshape(-1, 3); J = {k: np.array(v) for k, v in j['joints'].items()}
def ss(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def segt(a, c):
    v = c - a; t = ((P - a) @ v) / (v @ v); d = np.linalg.norm(P - (a + np.clip(t, 0, 1)[:, None] * v), axis=1); return t, d
mech = np.zeros(n)
for s in 'lr':
    for jn, r in ((f'el_{s}', 0.075), (f'kn_{s}', 0.085), (f'sh_{s}', 0.055)):
        d = np.linalg.norm(P - J[jn], axis=1); mech = np.maximum(mech, 1 - ss(r * 0.75, r, d))
    t, d = segt(J[f'wr_{s}'], J[f'fi_{s}']); mech = np.maximum(mech, ss(-0.05, 0.1, t) * (d < 0.12))      # кисть
    mech = np.maximum(mech, 1 - ss(J[f'an_{s}'][2] - 0.0, J[f'an_{s}'][2] + 0.06, P[:, 2]))           # стопа-ботинок
z = P[:, 2]
mech = np.maximum(mech, ss(1.585, 1.605, z) * (1 - ss(1.665, 1.69, z)))                               # шея — кабели
waist = ss(1.07, 1.10, z) * (1 - ss(1.22, 1.25, z)) * (np.abs(P[:, 1]) < 0.21)                       # живот — механика с кабелями
mech = np.maximum(mech, waist)
belt = ss(0.985, 1.0, z) * (1 - ss(1.06, 1.075, z)) * (np.abs(P[:, 1]) < 0.24)
paint = np.stack([mech, belt], 1)
j['paint'] = base64.b64encode((paint * 255).round().astype(np.uint8).tobytes()).decode()
j['face'] = {'eyeR': [0.088, -0.032, 1.80], 'eyeL': [0.088, 0.032, 1.80], 'mouth': [0.087, 0.0, 1.722]}
json.dump(j, open(f, 'w'))
print('mech', round(float((mech > 0.5).mean()), 3), 'belt', round(float((belt > 0.5).mean()), 3))
