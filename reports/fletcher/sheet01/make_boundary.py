from pathlib import Path
import json
from PIL import Image,ImageDraw
D=Path('reports/fletcher/sheet01');L=Path.home()/'Downloads/fletcher-sheet01';s=json.loads((D/'source-receipt.json').read_text());ring=[[1325,1054],[9543,1102],[9524,6555],[1311,6510],[1325,1054]]
(D/'boundary.json').write_text(json.dumps(dict(sheet='sheet-01',source_sha256=s['source_sha256'],ring_pixel_xy=ring,scope='Complete mapped frame including broad northern sea, interior legend, Cape St Lawrence, Cape North, ponds and coastal rocks. No mapped extension outside frame identified.',status='Overview, four corners and labels personally inspected; red boundary pending review.'),indent=2)+'\n')
im=Image.open(L/'native/sheet01.png');dr=ImageDraw.Draw(im);dr.line([tuple(p) for p in ring],fill='red',width=10);im.thumbnail((1800,1800));im.save(D/'boundary-overview.jpg',quality=92)
(D/'guide-audit.json').write_text(json.dumps(dict(source_sha256=s['source_sha256'],prior_encoding_sha256='0df00e295c3f798c9ad4b72ca07768b06fd0267e02e491be1e556bef846609a1',method='Native latitude and all four longitude labels personally inspected. Old meridians 60d45/40/35/30W were wrong; corrected search guide uses 60d40/35/30/25W. Eight original crossing pixels retained, not remeasured. Original files unchanged.',latitude_labels=['47d05mN','47d00mN'],physical_fitting_constraint=False),indent=2)+'\n')
