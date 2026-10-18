"""Repeat southern complete-raster comparisons with the expanded NSTDB coverage."""
from pathlib import Path
p=Path(__file__).resolve().parent/'review_warp.py'
s=p.read_text().replace('OUT = HERE / "warped-review"','OUT = HERE / "southern-reference-review"').replace('DATA / f"reference-full/{layer}.geojson"','DATA / f"refinement-20260912/reference/{layer}.geojson"').replace('for name, (west, south, east, north) in REGIONS.items():','for name, (west, south, east, north) in {k:v for k,v in REGIONS.items() if k in ["baddeck-kidston","kemp-coffin-extension","lockman-extension"]}.items():').replace('reports/fletcher/sheet12/reference-receipts.json','reports/fletcher/sheet12/refinement-20260912/south-reference-receipts.json')
exec(compile(s,str(p),'exec'),{'__file__':str(p)})
