from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw
D=Path('reports/fletcher/sheet02');L=Path.home()/'Downloads/fletcher-sheet02';s=json.loads((D/'source-receipt.json').read_text());ring=[[1305,985],[9493,1038],[9470,6472],[1282,6423],[1305,985]]
(D/'boundary.json').write_text(json.dumps(dict(sheet='sheet-02',source_sha256=s['source_sha256'],ring_pixel_xy=ring,scope='Complete mapped frame. No outside mapped extension identified; broad sea, interior legend, pond islands and offshore rocks retained.',status='Native overview, four corners and labels personally inspected; boundary overlay pending review.'),indent=2)+'\n')
im=Image.open(L/'native/sheet02.png');dr=ImageDraw.Draw(im);dr.line([tuple(p) for p in ring],fill='red',width=10);im.thumbnail((1800,1800));im.save(D/'boundary-overview.jpg',quality=92)
(D/'guide-audit.json').write_text(json.dumps(dict(source_sha256=s['source_sha256'],prior_encoding_sha256='ecb32ff9ae2f4225abd248540ddfa14f829b5c96aafe30b69820a381b0d80eee',method='Eight previously recorded slanted crossings retained for search only. This pass checked native latitude labels and outer retained longitude labels; it did not freshly measure all crossings.',longitude_labels=['60d25mW','60d20mW','60d15mW','60d10mW'],latitude_labels=['46d55mN','46d50mN'],physical_fitting_constraint=False),indent=2)+'\n')
