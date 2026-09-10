"""Tile the full-sheet review composite with verified raster provenance."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ACCEPTANCE = ROOT / "reports/fletcher/full-sheets/inputs.json"
REVISION = "fletcher-full-sheets-20260909.3"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def run(*args):
    return subprocess.check_output(list(map(str, args)), text=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", type=Path, required=True)
    p.add_argument(
        "--out", type=Path, required=True, help="New revision directory; must not exist"
    )
    p.add_argument("--gdal", default="gdal", help="GDAL 3.11+ command-line interface")
    p.add_argument("--gdalinfo", default="gdalinfo")
    a = p.parse_args()
    acceptance = json.loads(ACCEPTANCE.read_text())
    accepted = acceptance["composite"]
    if digest(a.source) != accepted["sha256"]:
        raise ValueError("Source does not match the recorded full-sheet composite")
    info = json.loads(run(a.gdalinfo, "-json", a.source))
    if (
        info["size"] != accepted["dimensions"]
        or len(info["bands"]) != 4
        or info["bands"][3]["colorInterpretation"] != "Alpha"
    ):
        raise ValueError("Expected the recorded RGBA raster")
    a.out.mkdir(parents=True, exist_ok=False)
    # Use the direct GDAL tile command: newer gdal2tiles wrappers force
    # skip_blank=True even without --exclude. Keep blank XYZ objects, and
    # resample native detail once rather than legacy query-size resampling.
    command = [
        a.gdal,
        "raster",
        "tile",
        "--min-zoom=8",
        "--max-zoom=15",
        "--convention=xyz",
        "--resampling=bilinear",
        "--overview-resampling=average",
        "--webviewer=none",
        "--num-threads=2",
        str(a.source),
        str(a.out),
    ]
    subprocess.run(command, check=True)
    counts = {}
    inventory = []
    transparent = 0
    for path in sorted(a.out.glob("*/*/*.png")):
        z, x, y = map(int, [*path.relative_to(a.out).parts[:2], path.stem])
        if not (8 <= z <= 15 and 0 <= x < 2**z and 0 <= y < 2**z):
            raise ValueError(f"Invalid XYZ tile: {path}")
        with Image.open(path) as tile:
            if tile.size != (256, 256):
                raise ValueError(f"Invalid tile size: {path}")
            _lo, hi = tile.convert("RGBA").getchannel("A").getextrema()
            transparent += hi == 0
        counts[z] = counts.get(z, 0) + 1
        inventory.append(
            {
                "path": str(path.relative_to(a.out)),
                "bytes": path.stat().st_size,
                "sha256": digest(path),
            }
        )
    if set(counts) != set(range(8, 16)):
        raise ValueError("Incomplete zoom pyramid")
    gt = info["geoTransform"]
    width, height = info["size"]

    def lon(x):
        return math.degrees(x / 6378137)

    def lat(y):
        return math.degrees(math.atan(math.sinh(y / 6378137)))

    bounds = [
        lon(gt[0]),
        lat(gt[3] + height * gt[5]),
        lon(gt[0] + width * gt[1]),
        lat(gt[3]),
    ]
    write(a.out / "tile-inventory.json", inventory)
    source = {
        "revision": REVISION,
        "name": "Fletcher complete sheets — Cape Mabou, Judique, Mabou and Hawkesbury",
        "status": "local-preview",
        "scheme": "xyz",
        "format": "png",
        "tileSize": 256,
        "minzoom": 8,
        "maxzoom": 15,
        "bounds": bounds,
        "attribution": "David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries",
        "licence": "https://creativecommons.org/licenses/by-nc-sa/3.0/",
        "modifications": "Georeferenced, cropped and tiled; original printed colours preserved.",
        "sourceRasterSha256": accepted["sha256"],
        "provenanceSha256": digest(ACCEPTANCE),
        "provenance": acceptance,
        "gdalVersion": run(a.gdal, "--version").strip(),
        "resampling": "bilinear at zoom 15; average for overviews",
        "sourceProjectedPixelSizeM": 5,
        "maximumZoomProjectedPixelSizeM": 2 * math.pi * 6378137 / (256 * 2**15),
        "tileCountsByZoom": counts,
        "tileCount": len(inventory),
        "tileBytes": sum(t["bytes"] for t in inventory),
        "fullyTransparentTiles": transparent,
        "inventorySha256": digest(a.out / "tile-inventory.json"),
        "note": "Transparent tiles intentionally retained within raster bounds to avoid missing-object errors. Higher display zooms enlarge zoom 15. No geographic improvement or production publication is implied.",
    }
    write(a.out / "source.json", source)
    print(json.dumps(source, indent=2))


if __name__ == "__main__":
    main()
