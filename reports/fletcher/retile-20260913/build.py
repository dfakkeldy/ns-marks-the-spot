"""Reproduce the versioned 24-sheet mosaic from frozen raster receipts."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
INPUTS = Path(__file__).with_name('inputs.json')

def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(INPUTS.read_text())
    rasters = {}
    for sheet in data['sheets']:
        raster = Path(sheet['raster']['path'])
        assert digest(raster) == sheet['raster']['sha256'], raster
        for field in ['fit', 'receipt']:
            assert digest(ROOT / sheet[field]) == sheet[field + '_sha256'], sheet[field]
        rasters[sheet['sheet']] = raster
        print('Verified sheet', sheet['sheet'], flush=True)
    args.out.mkdir(parents=True, exist_ok=True)
    composite = args.out / 'fletcher-24-full-sheets.tif'
    if composite.exists():
        assert data.get('composite', {}).get('sha256') == digest(composite), 'Existing composite does not match receipt'
    else:
        cmd = ['gdalwarp', '-wm', '256', '--config', 'GDAL_CACHEMAX', '256', '-srcalpha', '-dstalpha', '-r', 'near', '-tr', '5', '5', '-tap', '-co', 'COMPRESS=DEFLATE', '-co', 'TILED=YES', '-co', 'BIGTIFF=IF_SAFER']
        cmd += [str(rasters[s]) for s in data['composite_order_bottom_to_top']] + [str(composite)]
        subprocess.run(cmd, check=True)
        info = json.loads(subprocess.check_output(['gdalinfo', '-json', str(composite)], text=True))
        data['composite'] = {'sha256': digest(composite), 'dimensions': info['size'], 'bounds': info['wgs84Extent'], 'method': 'gdalwarp RGBA nearest-neighbour at 5 projected metres, aligned cells; recorded bottom-to-top order, complete neatlines and transparent gaps'}
        INPUTS.write_text(json.dumps(data, indent=2) + '\n')
    subprocess.run([sys.executable, str(ROOT/'tools/fletcher/tile_full_sheets.py'), '--source', str(composite), '--out', str(args.out/data['revision']), '--inputs', str(INPUTS), '--revision', data['revision'], '--status', 'provisional-review', '--name', 'Fletcher complete 24-sheet provisional review mosaic', '--gdal', '/opt/homebrew/bin/gdal'], check=True)

if __name__ == '__main__':
    main()
