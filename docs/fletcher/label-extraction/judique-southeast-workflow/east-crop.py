from pathlib import Path
from PIL import Image
import sys
p=Path(__file__).resolve().parent
cid=sys.argv[1];assert cid in ['I03', 'I06']
x,y,w,h=map(int,sys.argv[2:6]);angle=int(sys.argv[6]) if len(sys.argv)>6 else 0
im=Image.open(p/(cid+'.png'));assert 0<=x and 0<=y and w>0 and h>0 and x+w<=im.width and y+h<=im.height
im=im.crop((x,y,x+w,y+h)).rotate(angle,expand=True)
f=p/f'{cid}-detail-{x}-{y}-{w}-{h}-{angle}.png';im.save(f);print(f)
