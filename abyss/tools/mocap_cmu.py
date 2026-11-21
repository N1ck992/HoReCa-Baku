# Использование (из папки abyss): python3 tools/mocap_cmu.py assets/models/sentinel/sentinel.json assets/models/anims/cmu-basic.json 82 82_08
# Записи — CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), свободное использование; лежат в assets/source/mocap-cmu/
# Перенос записей CMU (ASF/AMC) на наш скелет из 15 костей (оси: X — вперёд, Y — влево, Z — вверх).
# Для каждой кости — поворот относительно родителя (кватернион) в каждом кадре; таз — полная ориентация;
# общий проход актёра убран (движение на месте), остаётся покачивание и подъём таза.
import json, sys, math, numpy as np
D2R = math.pi / 180
def rx(a): c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def ry(a): c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def rz(a): c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
def eul(x, y, z): return rz(z) @ ry(y) @ rx(x)          # как в amc_parser (статические оси XYZ)

def read_asf(path):
    L = open(path).read().split('\n'); bones = {}; hier = {}; i = 0; mode = None
    while i < len(L):
        t = L[i].strip()
        if t.startswith(':bonedata'): mode = 'b'
        elif t.startswith(':hierarchy'): mode = 'h'
        elif t.startswith(':'): mode = None
        if mode == 'b' and t == 'begin':
            b = {'dof': []}; i += 1
            while L[i].strip() != 'end':
                p = L[i].split()
                if p[0] == 'name': b['name'] = p[1]
                elif p[0] == 'direction': b['dir'] = np.array(list(map(float, p[1:4])))
                elif p[0] == 'length': b['len'] = float(p[1])
                elif p[0] == 'axis': b['axis'] = np.array(list(map(float, p[1:4]))) * D2R
                elif p[0] == 'dof': b['dof'] = p[1:]
                i += 1
            bones[b['name']] = b
        elif mode == 'h' and t and t not in ('begin', 'end') and not t.startswith(':'):
            p = t.split(); hier[p[0]] = p[1:]
        i += 1
    par = {c: p for p, cs in hier.items() for c in cs}
    return bones, par, hier

def read_amc(path):
    frames = []; cur = None
    for line in open(path):
        t = line.strip()
        if not t or t[0] in '#:': continue
        if t.isdigit(): cur = {}; frames.append(cur); continue
        p = t.split(); cur[p[0]] = list(map(float, p[1:]))
    return frames

def fk(bones, par, hier, fr):
    pos, R = {}, {}
    r = fr['root']; pos['root'] = np.array(r[:3]); R['root'] = eul(*(np.array(r[3:6]) * D2R))
    order = []; st = list(hier.get('root', []))
    while st: b = st.pop(0); order.append(b); st += hier.get(b, [])
    for b in order:
        B = bones[b]; C = eul(*B['axis']); vals = dict(zip(B['dof'], fr.get(b, [0] * len(B['dof']))))
        M = eul(vals.get('rx', 0) * D2R, vals.get('ry', 0) * D2R, vals.get('rz', 0) * D2R)
        R[b] = R[par[b]] @ C @ M @ C.T
        pos[b] = pos[par[b]] + B['len'] * (R[b] @ B['dir'])
    return pos                                             # конец каждой кости; 'root' — таз

def nrm(v): return v / (np.linalg.norm(v) + 1e-9)
def frame(left, up):                                       # столбцы: вперёд, влево, вверх
    l = nrm(left); u = nrm(up - l * (up @ l)); f = np.cross(l, u); return np.stack([f, l, u], 1)
def swing(a, b):                                           # кратчайший поворот a → b
    a, b = nrm(a), nrm(b); v = np.cross(a, b); c = a @ b
    if c < -0.9999: return -np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K / (1 + c)
def quat(M):
    t = M[0, 0] + M[1, 1] + M[2, 2]
    if t > 0: s = math.sqrt(t + 1) * 2; q = [(M[2, 1] - M[1, 2]) / s, (M[0, 2] - M[2, 0]) / s, (M[1, 0] - M[0, 1]) / s, s / 4]
    elif M[0, 0] > M[1, 1] and M[0, 0] > M[2, 2]: s = math.sqrt(1 + M[0, 0] - M[1, 1] - M[2, 2]) * 2; q = [s / 4, (M[0, 1] + M[1, 0]) / s, (M[0, 2] + M[2, 0]) / s, (M[2, 1] - M[1, 2]) / s]
    elif M[1, 1] > M[2, 2]: s = math.sqrt(1 + M[1, 1] - M[0, 0] - M[2, 2]) * 2; q = [(M[0, 1] + M[1, 0]) / s, s / 4, (M[1, 2] + M[2, 1]) / s, (M[0, 2] - M[2, 0]) / s]
    else: s = math.sqrt(1 + M[2, 2] - M[0, 0] - M[1, 1]) * 2; q = [(M[0, 2] + M[2, 0]) / s, (M[1, 2] + M[2, 1]) / s, s / 4, (M[1, 0] - M[0, 1]) / s]
    q = np.array(q); return q / np.linalg.norm(q)

# наш скелет: кость → (сустав, конец сустава в модели), родитель
MODEL = json.load(open(sys.argv[1]))
J = {k: np.array(v) for k, v in MODEL['joints'].items()}
REST = {'neck': ('neck', 'crown'), 'sh_l': ('sh_l', 'el_l'), 'el_l': ('el_l', 'wr_l'), 'wr_l': ('wr_l', 'fi_l'), 'sh_r': ('sh_r', 'el_r'), 'el_r': ('el_r', 'wr_r'), 'wr_r': ('wr_r', 'fi_r'),
        'hip_l': ('hip_l', 'kn_l'), 'kn_l': ('kn_l', 'an_l'), 'an_l': ('an_l', 'to_l'), 'hip_r': ('hip_r', 'kn_r'), 'kn_r': ('kn_r', 'an_r'), 'an_r': ('an_r', 'to_r')}
PAR = MODEL['parents']
# соответствие: кость → (начало, конец) в точках записи CMU (концы костей ASF)
def seg(p, b, s):
    S = {'neck': ('thorax', 'head'), 'sh_l': ('lclavicle', 'lhumerus'), 'el_l': ('lhumerus', 'lradius'), 'wr_l': ('lradius', 'lhand'),
         'sh_r': ('rclavicle', 'rhumerus'), 'el_r': ('rhumerus', 'rradius'), 'wr_r': ('rradius', 'rhand'),
         'hip_l': ('lhipjoint', 'lfemur'), 'kn_l': ('lfemur', 'ltibia'), 'an_l': ('ltibia', 'lfoot'),
         'hip_r': ('rhipjoint', 'rfemur'), 'kn_r': ('rfemur', 'rtibia'), 'an_r': ('rtibia', 'rfoot')}[b]
    return p[S[1]] - p[S[0]]
LEGS = ['hip_l', 'kn_l', 'an_l', 'hip_r', 'kn_r', 'an_r']
ORDER = ['pelvis', 'spine', 'neck', 'sh_l', 'el_l', 'wr_l', 'sh_r', 'el_r', 'wr_r', 'hip_l', 'kn_l', 'an_l', 'hip_r', 'kn_r', 'an_r']

def convert(asf, amc, kind, fps_out=30):
    bones, par, hier = read_asf(asf); F = read_amc(amc)
    P = [fk(bones, par, hier, f) for f in F[::4]]          # 120 → 30 кадров в секунду
    up = np.array([0, 1.0, 0])
    # направление «вперёд»: шаг/бег — общий путь; стойка — куда смотрит таз в начале
    if kind == 'loco': d = P[-1]['root'] - P[0]['root']
    else: lf = P[0]['lhipjoint'] - P[0]['rhipjoint']; d = np.cross(lf, up)
    fwd = nrm(d - up * (d @ up)); left = np.cross(up, fwd)
    W = np.stack([fwd, left, up])                           # мир CMU → наши оси
    if (W @ (P[0]['lhipjoint'] - P[0]['rhipjoint']))[1] < 0: raise SystemExit('лево/право перепутаны')
    leg_cmu = np.mean([np.linalg.norm(P[0]['lfemur'] - P[0]['lhipjoint']) + np.linalg.norm(P[0]['ltibia'] - P[0]['lfemur'])])
    leg_mod = np.linalg.norm(J['kn_l'] - J['hip_l']) + np.linalg.norm(J['an_l'] - J['kn_l'])
    k = leg_mod / leg_cmu                                   # шаг под длину ног модели
    out = []; h0 = np.mean([W @ p['root'] for p in P], 0)[2]
    for p in P:
        q = {n: W @ v for n, v in p.items()}
        G = {}
        G['pelvis'] = frame(q['lhipjoint'] - q['rhipjoint'], q['lowerback'] - q['root'] + (q['upperback'] - q['root']))
        G['spine'] = frame(q['lclavicle'] - q['rclavicle'], q['lowerneck'] - q['upperback'])
        Rl = {}
        Rl['pelvis'] = G['pelvis']; Rl['spine'] = G['pelvis'].T @ G['spine']
        for b in ['neck'] + ORDER[3:]:
            pb = PAR[b]; r = J[REST[b][1]] - J[REST[b][0]]; d = W @ seg(p, b, None)
            G[b] = swing(G[pb] @ r, d) @ G[pb]; Rl[b] = G[pb].T @ G[b]
        root = W @ p['root']
        out.append({'q': {b: quat(Rl[b]) for b in ORDER}, 'root': root * k, 'lft': (W @ (p['lfoot'] - p['root']))[0]})
    return out, k, fps_out

def loop_cycle(fr, fps, lo, hi):
    feat = np.array([np.concatenate([f['q'][b] * np.sign(f['q'][b][3] + 1e-9) for b in LEGS]) for f in fr])
    n = len(feat); best = None
    for per in range(int(lo * fps), int(hi * fps) + 1):
        for a in range(n // 5, n - per - 2):
            e = np.linalg.norm(feat[a] - feat[a + per]) + 0.5 * np.linalg.norm(feat[a + 1] - feat[a + per + 1])
            if best is None or e < best[0]: best = (e, a, per)
    e, a, per = best
    cyc = [dict(x, q=dict(x['q'])) for x in fr[a:a + per]]
    # стык: последние кадры плавно подводятся к первому
    B = max(2, per // 8)
    for i in range(B):
        w = ((i + 1) / (B + 1)) ** 1.5; f = cyc[per - B + i]; g = fr[a + per + i - B + 1] if a + per + i - B + 1 < len(fr) else cyc[0]
        for b in ORDER:
            qa, qb = f['q'][b], cyc[(i + 1) % per]['q'][b] if False else cyc[0]['q'][b]
            if qa @ qb < 0: qb = -qb
            f['q'][b] = nrm(qa * (1 - w * 0.5) + qb * w * 0.5)
    # начало цикла — левая нога дальше всего впереди (чтобы шаг и бег совпадали по фазе)
    s = int(np.argmax([f['lft'] for f in cyc])); cyc = cyc[s:] + cyc[:s]
    dist = np.linalg.norm((fr[a + per]['root'] - fr[a]['root'])[:2])
    return cyc, per / fps, dist / (per / fps), e

def pack(cyc, extra):
    z = np.array([f['root'][2] for f in cyc]); z -= z.mean()
    return dict(extra, frames=len(cyc), q={b: [round(float(x), 4) for f in cyc for x in f['q'][b]] for b in ORDER}, bob=[round(float(v), 4) for v in z])

lib = {'note': 'Записанные движения CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), перенесены на скелет из 15 костей (№103). Кватернионы x,y,z,w — поворот кости относительно родителя; таз — относительно мира модели.', 'bones': ORDER}
fr, k, fps = convert('assets/source/mocap-cmu/35.asf', 'assets/source/mocap-cmu/35_01.amc', 'loco'); cyc, T, v, e = loop_cycle(fr, fps, 0.9, 1.4)
lib['walk'] = pack(cyc, {'src': '35_01 walk', 'fps': fps, 'dur': round(T, 3), 'speed': round(v, 3)}); print('walk', len(fr), 'cycle', round(T, 2), 's', round(v, 2), 'm/s err', round(e, 3), 'k', round(k, 3))
fr, k, fps = convert('assets/source/mocap-cmu/35.asf', 'assets/source/mocap-cmu/35_18.amc', 'loco'); cyc, T, v, e = loop_cycle(fr, fps, 0.55, 0.85)
lib['run'] = pack(cyc, {'src': '35_18 run/jog', 'fps': fps, 'dur': round(T, 3), 'speed': round(v, 3)}); print('run', len(fr), 'cycle', round(T, 2), 's', round(v, 2), 'm/s err', round(e, 3))
# стойка: 6 с самого спокойного места, стык — плавно
fr, k, fps = convert('assets/source/mocap-cmu/' + sys.argv[3] + '.asf', 'assets/source/mocap-cmu/' + sys.argv[4] + '.amc', 'idle')
rt = np.array([f["root"][:2] for f in fr]); L = min(6 * fps, len(fr) - 6)
mv = [np.linalg.norm(np.diff(rt[a:a + L], axis=0), axis=1).sum() for a in range(0, len(fr) - L, 5)]
a = int(np.argmin(mv)) * 5; seg_ = fr[a:a + L]
# стык: последние 0,6 с плавно переходят в первые кадры
B = int(0.6 * fps)
for i in range(B):
    w = (i + 1) / (B + 1); f = seg_[L - B + i]; g = seg_[i]
    for b in ORDER:
        qa, qb = f['q'][b], g['q'][b]
        if qa @ qb < 0: qb = -qb
        f['q'][b] = nrm(qa * (1 - w) + qb * w)
    f['root'] = f['root'] * (1 - w) + g['root'] * w
lib['idle'] = pack(seg_, {'src': sys.argv[4], 'fps': fps, 'dur': round(L / fps, 3), 'speed': 0})
print('idle from frame', a * 4, 'travel', round(min(mv), 3))
json.dump(lib, open(sys.argv[2], 'w'), separators=(',', ':'))
import os; print('size', os.path.getsize(sys.argv[2]) // 1024, 'KB')
