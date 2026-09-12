"""Verify ready rasters using existing coverage and browser tools; package evidence."""
import shutil, subprocess, sys
from pathlib import Path
import work as w
positions={'14':'46.18,-61.40,11','16':'46.00,-61.40,11','19':'45.84,-61.40,11','22':'45.66,-61.40,11'}
for s in sys.argv[1:]:
    folder=w.HERE/f'sheet-{s}';local=w.DL/f'fletcher-route19-three-rounds-20260912/sheet-{s}'
    raster=local/f'sheet-{s}-full-sheet.tif';assert raster.exists() and (folder/'raster-receipt.json').exists()
    subprocess.run(['/opt/homebrew/bin/python3',str(w.ROOT/'sheet14/refinement-20260909/verify_raster_coverage.py'),'--raster',str(raster),'--cutline',str(local/'neatline.geojson'),'--out',str(folder/'coverage.json')],check=True)
    subprocess.run([sys.executable,str(w.HERE/'review_raster.py'),s],check=True)
    subprocess.run(['node',str(w.HERE/'verify-browser.mjs'),str(raster),str(local/'browser'),positions[s]],check=True)
