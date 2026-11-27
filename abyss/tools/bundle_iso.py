# Сборка игры в один HTML (скрипты и стили — внутрь): python3 tools/bundle_iso.py [выход.html]
import re, os, sys
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s=open(f'{root}/iso.html').read()
s=s.replace('<link rel="stylesheet" href="css/iso.css">', '<style>\n'+open(f'{root}/css/iso.css').read()+'\n</style>')
# в публикации — без ссылки на старую игру (она опубликована отдельно)
s=s.replace('    <a id="iso-back" href="index.html" title="Вернуться к игре (вид сбоку)">Вид сбоку</a>\n','')
def inl(m):
    return '<script>\n'+open(f'{root}/{m.group(1)}').read().replace('</script','<\\/script')+'\n</script>'
s=re.sub(r'<script src="(js/[^"]+)"></script>', inl, s)
OUT=sys.argv[1] if len(sys.argv)>1 else root+'/dist/iso-bundle.html'; os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT,'w').write(s)
print(len(s), s.count('<script src='))
