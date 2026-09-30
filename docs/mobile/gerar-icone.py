import numpy as np
from PIL import Image, ImageDraw, ImageFilter
rng=np.random.default_rng(7)
S=1024
logo=Image.open('/home/user/gestao-de-acordos/public/logo-bookplay.png').convert('RGBA')
blue=np.array([0x1e,0xa5,0xe6],float); green=np.array([0x1f,0x7f,0x2c],float)
# degrade baguncado: campo de blobs + distorcao
yy,xx=np.mgrid[0:S,0:S]/S
field=np.zeros((S,S))
for _ in range(14):
    cx,cy=0.15+0.7*rng.random(2); r=0.07+rng.random()*0.12; w=rng.choice([-1,1])
    field+=w*np.exp(-((xx-cx)**2+(yy-cy)**2)/(2*r*r))
field+=0.6*(xx-yy)  # tendencia diagonal azul->verde
field+=0.35*np.sin(xx*14+np.cos(yy*11)*2.5)
c=field[int(S*.2):int(S*.8),int(S*.2):int(S*.8)]
med=np.median(c); sd=c.std()
t=np.clip((field-med)/(2.2*sd)+0.5,0,1)
grad=(blue*(1-t[...,None])+green*t[...,None]).astype(np.uint8)
gimg=Image.fromarray(grad,'RGB')
def compor(fundo, cor_mao, escala=0.72, nome='x'):
    base=Image.new('RGB',(S,S),fundo)
    n=int(S*escala); m=logo.resize((n,n),Image.LANCZOS)
    mask=Image.new('L',(S,S),0); mask.paste(m.split()[3],((S-n)//2,(S-n)//2))
    fill=gimg if cor_mao is None else Image.new('RGB',(S,S),cor_mao)
    base.paste(fill,(0,0),mask)
    return base
a=compor((255,255,255),None)                 # fundo branco, mao em degrade
b=Image.new('RGB',(S,S)); b.paste(gimg)       # fundo em degrade, mao branca
n=int(S*0.72); m=logo.resize((n,n),Image.LANCZOS)
mk=Image.new('L',(S,S),0); mk.paste(m.split()[3],((S-n)//2,(S-n)//2))
b.paste(Image.new('RGB',(S,S),(255,255,255)),(0,0),mk)
def arred(im):
    mk=Image.new('L',im.size,0); ImageDraw.Draw(mk).rounded_rectangle([0,0,S-1,S-1],radius=S*0.22,fill=255)
    out=Image.new('RGBA',im.size,(0,0,0,0)); out.paste(im,(0,0),mk); return out
prev=Image.new('RGBA',(S*2+120,S+80),(236,238,242,255))
prev.paste(arred(a),(40,40),arred(a)); prev.paste(arred(b),(S+80,40),arred(b))
prev.resize((prev.width//2,prev.height//2),Image.LANCZOS).save('icone-rascunho.png')
a.save('icone-A-1024.png'); b.save('icone-B-1024.png')
