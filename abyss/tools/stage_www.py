# Подготовка файлов игры для приложения (№110).
#   python3 tools/stage_www.py <папка> <номер> [--patch]  — собрать игру (index.html) + картинки, звуки + version.json
#   python3 tools/stage_www.py --manifest <папка>          — описание файлов (путь → sha1) в stdout
import sys, os, json, shutil, hashlib, subprocess, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'source', 'models'}                         # исходники и 3D для тестовой комнаты — игре не нужны
if sys.argv[1] == '--manifest':
    d = sys.argv[2]; out = {}
    for r, _, fs in os.walk(d):
        for f in fs:
            p = os.path.join(r, f); rel = os.path.relpath(p, d).replace(os.sep, '/')
            if rel != 'version.json': out[rel] = hashlib.sha1(open(p, 'rb').read()).hexdigest()
    print(json.dumps(out, indent=0, sort_keys=True)); sys.exit()
d, n = sys.argv[1], int(sys.argv[2]); patch = '--patch' in sys.argv
os.makedirs(d, exist_ok=True)
subprocess.run([sys.executable, os.path.join(ROOT, 'tools/bundle_iso.py'), os.path.join(d, 'index.html')], check=True, stdout=subprocess.DEVNULL)
for name in os.listdir(os.path.join(ROOT, 'assets')):
    if name in SKIP: continue
    src = os.path.join(ROOT, 'assets', name)
    # №137: исходники пропускаем на любой глубине (assets/props/source и т. п.)
    if os.path.isdir(src): shutil.copytree(src, os.path.join(d, 'assets', name), dirs_exist_ok=True, ignore=shutil.ignore_patterns(*SKIP))
json.dump({'version': n, 'name': f'v{n}', 'patch': patch, 'built': datetime.date.today().isoformat()}, open(os.path.join(d, 'version.json'), 'w'), ensure_ascii=False)
