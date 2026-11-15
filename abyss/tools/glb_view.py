import json, struct, sys, numpy as np
from PIL import Image, ImageDraw
d=open(sys.argv[1],'rb').read()
cl,ct=struct.unpack('<I4s',d[12:20]); j=json.loads(d[20:20+cl]); off=20+cl+8
def acc(i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; o=off+bv.get('byteOffset',0)+a.get('byteOffset',0)
    n={'SCALAR':1,'VEC3':3,'VEC4':4,'VEC2':2}[a['type']]; dt={5126:np.float32,5125:np.uint32,5123:np.uint16}[a['componentType']]
    return np.frombuffer(d,dt,a['count']*n,o).reshape(-1,n) if n>1 else np.frombuffer(d,dt,a['count'],o)
p=j['meshes'][0]['primitives'][0]; P=acc(p['attributes']['POSITION']).astype(np.float64); I=acc(p['indices']).reshape(-1,3)
M=np.array(j['nodes'][0]['matrix']).reshape(4,4).T; print('matrix\n',M.round(3))
P=(np.c_[P,np.ones(len(P))]@M.T)[:,:3]
print('bounds',P.min(0).round(3),P.max(0).round(3))
np.save(sys.argv[2]+'/P.npy',P); np.save(sys.argv[2]+'/I.npy',I)
S=400
def view(ax_h, ax_v, flip_h, name):
    h=P[:,ax_h]*(-1 if flip_h else 1); v=P[:,ax_v]
    lo=min(h.min(),v.min()); 
    sc=(S*2-40)/(v.max()-v.min()); im=Image.new('RGB',(int((h.max()-h.min())*sc)+40,S*2),(20,20,20)); dr=ImageDraw.Draw(im)
    # тени по нормалям треугольников
    A,B,C=P[I[:,0]],P[I[:,1]],P[I[:,2]]; n=np.cross(B-A,C-A); n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-9
    depth_ax=3-ax_h-ax_v; dep=(A+B+C)[:,depth_ax]/3
    order=np.argsort(dep*(1))
    for t in order[::3]:
        pts=[((P[k,ax_h]*(-1 if flip_h else 1)-h.min())*sc+20,(v.max()-P[k,ax_v])*sc+20) for k in I[t]]
        sh=int(60+150*abs(n[t,depth_ax])); dr.polygon(pts,fill=(sh,sh,sh))
    for y in np.arange(0,S*2,40): dr.line([(0,y),(im.width,y)],fill=(90,0,0)); dr.text((2,y),f'{v.max()-(y-20)/sc:.2f}',fill=(255,80,80))
    for x in np.arange(20,im.width,40): dr.line([(x,0),(x,im.height)],fill=(0,0,90)); dr.text((x,2),f'{(x-20)/sc+h.min():.2f}',fill=(120,120,255))
    im.save(sys.argv[2]+f'/{name}.png'); print(name, im.size, 'sc',sc)
view(0,1,False,'front_xy'); view(2,1,False,'side_zy')
