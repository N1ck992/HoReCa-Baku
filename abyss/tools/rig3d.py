# Использование: python3 tools/glb_view.py assets/source/models/<file>.glb <папка>  (виды спереди/сбоку с сеткой координат + P.npy, I.npy)
#                python3 tools/rig3d.py <папка> tools/rigs3d/<name>.json assets/models/<name>/<name>.json [проверка.png]
# Скелет для цельной 3D-модели без костей: суставы (x, y в осях файла; z — по центру сечения),
# веса — от расстояния до отрезков костей (2 кости на вершину), упаковка в .json (base64).
import json, sys, base64, numpy as np
P=np.load(sys.argv[1]+'/P.npy'); I=np.load(sys.argv[1]+'/I.npy').astype(np.int64)
cfg=json.load(open(sys.argv[2])); J={k:np.array(v,float) for k,v in cfg['joints'].items()}
# z сустава — середина сечения модели рядом с точкой
for k,v in J.items():
    if len(v)==2:
        r=0.035; m=(np.abs(P[:,0]-v[0])<r)&(np.abs(P[:,1]-v[1])<r)
        while m.sum()<12: r*=1.5; m=(np.abs(P[:,0]-v[0])<r)&(np.abs(P[:,1]-v[1])<r)
        J[k]=np.array([v[0],v[1],(P[m,2].min()+P[m,2].max())/2])
# кости: имя → (сустав, конец)
B=cfg['bones']; names=list(B)
def segd(a,c):
    v=c-a; t=np.clip(((P-a)@v)/(v@v),0,1); return np.linalg.norm(P-(a+t[:,None]*v),axis=1)
D=np.stack([segd(J[B[n][0]],J[B[n][1]])-cfg['thick'].get(n,0.05) for n in names],1)
# допустимые кости по стороне (рука не цепляет торс другой стороны и т.п.)
x=P[:,0]
for i,n in enumerate(names):
    if n.endswith('_l'): D[x< -0.02,i]=9
    if n.endswith('_r'): D[x>  0.02,i]=9
order=np.argsort(D,1)[:,:2]
d0=np.take_along_axis(D,order,1)
SIG=cfg.get('sigma',0.035)
w=np.exp(-((d0-d0[:,:1])/SIG)**2); w/=w.sum(1,keepdims=True)
# нормали вершин
A,Bv,C=P[I[:,0]],P[I[:,1]],P[I[:,2]]; fn=np.cross(Bv-A,C-A)
N=np.zeros_like(P); 
for k in range(3): np.add.at(N,I[:,k],fn)
N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-9
# в наши оси: вперёд = +z файла, влево = +x, вверх = +y; низ — на полу; рост — cfg['height']
bot=P[:,1].min(); k=cfg['height']/(P[:,1].max()-bot)
conv=lambda Q,isn=False: np.stack([Q[:,2],Q[:,0],(Q[:,1]-(0 if isn else bot))],1)*(1 if isn else k)
Pm=conv(P).astype(np.float32); Nm=conv(N,True).astype(np.float32)
Jm={kk:conv(v[None])[0].round(4).tolist() for kk,v in J.items()}
bi=np.array([[names.index(n) for n in names]])  # не нужно
blob=Pm.tobytes()+(Nm*127).round().astype(np.int8).tobytes()+order.astype(np.uint8).tobytes()+(w*255).round().astype(np.uint8).tobytes()+I.astype(np.uint16 if P.shape[0]<65536 else np.uint32).tobytes()
out={'note':'3D-модель со скелетом для тестовой комнаты (№102): суставы и веса — tools/rig3d (scratchpad rig3d.py)','verts':int(len(P)),'tris':int(len(I)),'idx16':bool(P.shape[0]<65536),
     'bones':names,'boneJoint':{n:B[n][0] for n in names},'joints':Jm,'parents':cfg['parents'],'bin':base64.b64encode(blob).decode()}
json.dump(out,open(sys.argv[3],'w'))
print('ok verts',len(P),'tris',len(I),'size',len(blob)//1024,'KB'); print({kk:[round(c,3) for c in v] for kk,v in Jm.items()})
# проверка раскраски по костям
if len(sys.argv)>4:
    from PIL import Image, ImageDraw
    pal=np.random.RandomState(3).randint(60,255,(len(names),3))
    S=400; sc=(S*2-40)/(P[:,1].max()-P[:,1].min()); im=Image.new('RGB',(int((x.max()-x.min())*sc)+40,S*2),(20,20,20)); dr=ImageDraw.Draw(im)
    dep=(A+Bv+C)[:,2]/3
    for t in np.argsort(dep):
        cb=order[I[t,0],0]; pts=[((P[q,0]-x.min())*sc+20,(P[:,1].max()-P[q,1])*sc+20) for q in I[t]]; dr.polygon(pts,fill=tuple(int(c) for c in pal[cb]))
    for kk,v in J.items(): px=((v[0]-x.min())*sc+20,(P[:,1].max()-v[1])*sc+20); dr.ellipse([px[0]-4,px[1]-4,px[0]+4,px[1]+4],fill=(255,0,0))
    im.save(sys.argv[4])
