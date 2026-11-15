# Использование: скачать наборы из assets/audio/CREDITS.txt в папку, распаковать в x/ (архивы) и dl/ (одиночные файлы),
# затем из этой папки: python3 <путь>/tools/build_sounds.py <путь>/assets/audio
# Сборка звуков игры (№108): обрезка тишины, нарезка длинных записей по паузам, выравнивание громкости, моно MP3.
import subprocess, numpy as np, os, json, sys
SR = 44100; OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
def load(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()
def save(x, name, q=5):
    p = OUT + '/' + name + '.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-q:a', str(q), p], input=x.astype(np.float32).tobytes())
    return os.path.getsize(p)
def trim(x, db=-42):
    th = np.abs(x).max() * 10 ** (db / 20); idx = np.nonzero(np.abs(x) > th)[0]
    if not len(idx): return x
    a = max(0, idx[0] - int(0.004 * SR)); b = min(len(x), idx[-1] + int(0.03 * SR)); return x[a:b]
def fade(x, out=0.03, inn=0.003):
    n = min(len(x), int(out * SR)); x[-n:] *= np.linspace(1, 0, n); m = min(len(x), int(inn * SR)); x[:m] *= np.linspace(0, 1, m); return x
def norm(x, peak=-1.0, rms=None):
    if rms is not None: x = x * (10 ** (rms / 20) / (np.sqrt((x ** 2).mean()) + 1e-9))
    pk = np.abs(x).max() + 1e-9; lim = 10 ** (peak / 20)
    if pk > lim: x = x * (lim / pk)
    return x
def split(x, db=-34, gap=0.12, minlen=0.35):
    fr = int(0.02 * SR); e = np.array([np.sqrt((x[i:i + fr] ** 2).mean()) for i in range(0, len(x) - fr, fr)])
    th = np.abs(x).max() * 10 ** (db / 20); on = e > th; segs = []; i = 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and (on[j] or (j + int(gap / 0.02) < len(on) and on[j:j + int(gap / 0.02)].any())): j += 1
            if (j - i) * 0.02 >= minlen: segs.append(x[max(0, i * fr - int(0.02 * SR)):min(len(x), j * fr + int(0.05 * SR))])
            i = j
        else: i += 1
    return segs
M = {}; total = 0
def one(group, files, rms=-20, peak=-1, q=5, pre=None):
    global total
    M[group] = []
    for k, f in enumerate(files):
        x = load(f) if isinstance(f, str) else f
        if pre: x = pre(x)
        x = fade(norm(trim(x), peak, rms)); n = f'{group}_{k + 1}'; total += save(x, n, q); M[group].append(n)
X = 'x/'
one('step_metal', [X + f'metal_steps_48k24b/metal_steps_{i:02d}.wav' for i in (1, 2, 5, 6, 8, 13, 16, 17)], rms=-22)
one('pipe_hit', [X + f'sfx_breaking_and_falling/bfh1_metal_hit_0{i}.ogg' for i in (2, 4, 6)], rms=-19)
one('flesh_hit', [X + f'independent_nu_ljudbank-hits_and_punches/{d}' for d in []] or [os.path.join(r, f) for r, _, fs in os.walk(X + 'independent_nu_ljudbank-hits_and_punches') for f in fs if f in ('hit03.mp3.flac', 'hit09.mp3.flac', 'hit07.mp3.flac')], rms=-18)
one('plasma_shot', [X + f'60-sci-fi-sfx_0/sfx_02{c}.ogg' for c in 'abcd'], rms=-19)
one('plasma_hit', [X + f'60-sci-fi-sfx_0/sfx_15{c}.ogg' for c in 'abc'], rms=-20)
C = X + '80-CC0-creature-SFX_0/'
one('mutant_alert', [C + 'monster_03.ogg', C + 'monster_06.ogg', C + 'grunt_01.ogg'], rms=-17)
one('mutant_attack', [C + 'roar_03.ogg', C + 'grunt_04.ogg', C + 'roar_01.ogg'], rms=-16)
one('mutant_hurt', [C + 'hurt_03.ogg', C + 'hurt_05.ogg', C + 'grunt_02.ogg'], rms=-17)
one('mutant_death', [C + 'monster_07.ogg', C + 'monster_04.ogg'], rms=-15)
zm = [s for s in split(load('dl/darsycho__zombie-moans_0.ogg')) if 0.5 < len(s) / SR < 3.5][:6]; one('mutant_idle', zm, rms=-22)
tr = [s for s in split(load('dl/troll-roars_0.ogg'), minlen=0.5) if 0.6 < len(s) / SR < 4][:4]; one('brute_roar', tr, rms=-14)
one('boss_roar', [C + 'monster_04.ogg', C + 'roar_02.ogg'], rms=-13, pre=lambda x: np.interp(np.arange(0, len(x), 0.8), np.arange(len(x)), x).astype(np.float32))   # ниже на треть
one('door', [X + 'yd-Sounds/yd-Sounds/door_open.ogg'], rms=-20)
one('distant', [X + f'dark_ambiences/dark_ambiences/ambience-{i}.wav' for i in (1, 3, 5)], rms=-20)
# зацикленные фоны: длиннее, качество пониже
def loop(name, f, a=0, b=None, rms=-24):
    global total
    x = load(f); b = len(x) / SR if b is None else b; x = x[int(a * SR):int(b * SR)]
    n = int(0.25 * SR); x[:n] = x[:n] * np.linspace(0, 1, n) + x[-n:] * np.linspace(1, 0, n); x = x[:-n]   # стык — перекрёстно
    x = norm(x, -1, rms); total += save(x, name, 7); M[name] = [name]
loop('amb_hum', X + 'sci-fi-sfx/loop_ambient_01.ogg', rms=-22)
loop('amb_dark', 'dl/dungeon_ambient_1_0.ogg', 22, 70, rms=-26)
loop('amb_drips', 'dl/atmosbasement.mp3_.flac', 1.5, 20, rms=-30)
loop('amb_machine', X + 'sci-fi-sfx/loop_machine_02.ogg', rms=-24)
json.dump(M, open(OUT + '/sounds.json', 'w'), ensure_ascii=False, indent=0)
print('файлов', sum(len(v) for v in M.values()), 'всего', total // 1024, 'КБ'); print({k: len(v) for k, v in M.items()})
