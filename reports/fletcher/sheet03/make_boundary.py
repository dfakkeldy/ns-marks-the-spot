from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw
D=Path('reports/fletcher/sheet03');L=Path.home()/'Downloads/fletcher-sheet03';s=json.loads((D/'source-receipt.json').read_text());ring=[[1272,1053],[9483,1107],[9470,6540],[230,6500],[230,5475],[1260,5475],[1272,1053]]
(D/'boundary.json').write_text(json.dumps(dict(sheet='sheet-03',source_sha256=s['source_sha256'],ring_pixel_xy=ring,scope='Complete mapped frame and southwest Fishing Cove / White Capes extension, including labels and offshore rocks.',status='Native overview, four corners and labels personally inspected; boundary overlay pending review.'),indent=2)+'\n')
im=Image.open(L/'native/sheet03.png');dr=ImageDraw.Draw(im);dr.line([tuple(p) for p in ring],fill='red',width=10);im.thumbnail((1800,1800));im.save(D/'boundary-overview.jpg',quality=92)
(D/'guide-audit.json').write_text(json.dumps(dict(source_sha256=s['source_sha256'],prior_encoding_sha256='6c59736ae35d298adf59778d63c32aedc051b75e6703a88dea1b9c75dc110578',method='Eight previously recorded slanted crossings retained for search only. This pass checked native latitude labels and outer retained longitude labels; it did not freshly measure all crossings.',longitude_labels=['60d45mW','60d40mW','60d35mW','60d30mW'],latitude_labels=['46d55mN','46d50mN'],physical_fitting_constraint=False),indent=2)+'\n')
