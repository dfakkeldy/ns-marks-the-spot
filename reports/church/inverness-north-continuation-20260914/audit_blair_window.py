import json,time,hashlib
from pathlib import Path
from osgeo import gdal
import numpy as np
gdal.UseExceptions();start=time.monotonic()
p=Path('/var/home/dan/nsmarks-church-20260726/sources');out=Path('/var/home/dan/nsmarks-church-20260914/inverness-north-review');window=[12700,4700,2800,2400]
print('Native original window',flush=True)
a=gdal.Translate('',str(p/'inverness.jp2'),srcWin=window,format='MEM');x=a.ReadAsArray()
gdal.Translate(str(out/'IN2-blair-native.png'),a,format='PNG')
print('Original read complete',round(time.monotonic()-start,2),flush=True)
b=gdal.Translate('',str(p/'inverness-master.tif'),srcWin=window,format='MEM');y=b.ReadAsArray()
r=dict(origin=window[:2],extent=window[2:],display=window[2:],rotation=0,original_source=str(p/'inverness.jp2'),working_source=str(p/'inverness-master.tif'),original_decoded_sha256=hashlib.sha256(x.tobytes()).hexdigest(),working_decoded_sha256=hashlib.sha256(y.tobytes()).hexdigest(),decoded_native_arrays_equal=bool(np.array_equal(x,y)),max_channel_difference=int(np.abs(x.astype(np.int16)-y.astype(np.int16)).max()),elapsed_seconds=time.monotonic()-start,scope='Exact native RGB comparison in this one window. No whole-source parity or geographic acceptance.')
(out/'blair-native-comparison.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r),flush=True)
