# Патч для приложения (№110): python3 tools/make_patch.py <номер версии APK-основы> <номер новой версии>
# Собирает игру заново, сравнивает с описанием файлов основы (android/releases/v<основа>.json)
# и кладёт в zip только изменённые и новые файлы + index.html + version.json. Патч накопительный.
import sys, os, json, subprocess, tempfile, zipfile, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
base, n = int(sys.argv[1]), int(sys.argv[2])
old = json.load(open(os.path.join(ROOT, f'android/releases/v{base}.json')))
with tempfile.TemporaryDirectory() as d:
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools/stage_www.py'), d, str(n), '--patch'], check=True)
    out = os.path.join(ROOT, f'dist/project-abyss-patch-v{n}.zip'); os.makedirs(os.path.dirname(out), exist_ok=True)
    k = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for r, _, fs in os.walk(d):
            for f in fs:
                p = os.path.join(r, f); rel = os.path.relpath(p, d).replace(os.sep, '/')
                h = hashlib.sha1(open(p, 'rb').read()).hexdigest()
                if rel in ('index.html', 'version.json') or old.get(rel) != h: z.write(p, rel); k += 1
    print(f'патч v{n} (основа v{base}): файлов {k}, {os.path.getsize(out) // 1024} КБ → {out}')
