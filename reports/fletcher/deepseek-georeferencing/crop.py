from pathlib import Path
import sys
import fcntl
from PIL import Image
root=Path(__file__).resolve().parent
name=sys.argv[1]
assert name in ['historical','context','modern']
x,y,w,h=map(int,sys.argv[2:6])
assert 0<=x<800 and 0<=y<800 and w>0 and h>0 and x+w<=800 and y+h<=800
with (root/'.crop-count').open('a+') as counter:
 fcntl.flock(counter,fcntl.LOCK_EX)
 counter.seek(0);count=int(counter.read() or '0')
 if count>=2:raise SystemExit('Two close-ups already used; return an answer from the available images.')
 counter.seek(0);counter.truncate();counter.write(str(count+1));counter.flush()
im=Image.open(root/(name+'.png')).crop((x,y,x+w,y+h)).resize((w*2,h*2))
out=root/f'{name}-zoom-{x}-{y}-{w}-{h}.png'
im.save(out)
print(out)
