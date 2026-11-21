# №128: звук ручного резака-гвоздомёта — синтез (подходящей записи с лицензией CC0 не нашлось).
# Слои: щелчок бойка (широкополосный удар + металлические резонансы), шипение сжатого воздуха,
# глухой удар корпуса, короткий звон. Три варианта. python3 tools/make_nailgun.py
import numpy as np, subprocess, os, json
SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/audio')
def env(n, a, d):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d); return e
def bp(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, len(x))
def one(seed, pitch):
    rng = np.random.default_rng(seed); n = int(0.42 * SR); t = np.arange(n) / SR
    click = rng.standard_normal(n) * env(n, 0.0005, 0.004) * 0.9
    ring = sum(a * np.sin(2 * np.pi * f * pitch * t + rng.random() * 6) * env(n, 0.0008, d) for f, a, d in [(2350, .35, .045), (3720, .25, .03), (5150, .15, .02), (1410, .12, .11)])
    air = bp(rng.standard_normal(n), 1800, 9000) * env(n, 0.003, 0.07) * 0.55
    hiss = bp(rng.standard_normal(n), 3000, 12000) * env(n, 0.02, 0.12) * 0.12 * (t > 0.015)
    thump = np.sin(2 * np.pi * (115 * pitch) * t * (1 - t * 0.8)) * env(n, 0.001, 0.05) * 0.7
    x = click + ring + air + hiss + thump
    x = x / (np.abs(x).max() + 1e-9) * 0.89
    return x.astype(np.float32)
names = []
for i, (seed, pitch) in enumerate([(3, 1.0), (11, 0.94), (27, 1.07)], 1):
    name = f'nailgun_{i}'; names.append(name)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-q:a', '4', os.path.join(OUT, name + '.mp3')], input=one(seed, pitch).tobytes(), check=True)
p = os.path.join(OUT, 'sounds.json'); d = json.load(open(p)); d['nailgun'] = names
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=0)
print('ok', names)
