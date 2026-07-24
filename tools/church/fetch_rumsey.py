"""Fetch a full-resolution Church county sheet from the David Rumsey IIIF service.

Host note: `iiif.davidrumsey.com` does NOT resolve (NXDOMAIN). The working
endpoint is www.davidrumsey.com/luna/servlet/iiif, and it advertises IIIF Image
API *level1*, so we request explicit regions at explicit widths rather than
assuming arbitrary size support.

At 34427 x 34543 px, Inverness is far too large to request in one call, so we
walk it in 2048 px regions and let GDAL mosaic the pieces.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import time
import urllib.request

from tools.church.counties import get_county

IIIF_BASE = "https://www.davidrumsey.com/luna/servlet/iiif"
USER_AGENT = "ns-marks-the-spot/1.0 (open-source historical map project)"
REQUEST_DELAY_SECONDS = 0.5
"""Courtesy pause between region requests - Rumsey is a free public service."""


def manifest_url(rumsey_id: str) -> str:
    """URL of the IIIF presentation manifest for an item."""
    return f"{IIIF_BASE}/m/{rumsey_id}/manifest"


def region_url(
    rumsey_id: str, x: int, y: int, width: int, height: int, size_width: int
) -> str:
    """URL of one IIIF image region at a requested output width."""
    return f"{IIIF_BASE}/{rumsey_id}/{x},{y},{width},{height}/{size_width},/0/default.jpg"


def canvas_size(manifest: dict) -> tuple[int, int]:
    """Pull (width, height) in pixels from a IIIF presentation manifest."""
    try:
        canvas = manifest["sequences"][0]["canvases"][0]
        return int(canvas["width"]), int(canvas["height"])
    except (KeyError, IndexError) as error:
        raise ValueError(f"manifest has no usable canvas: {error}") from error


def plan_regions(
    width: int, height: int, tile_size: int = 2048
) -> list[tuple[int, int, int, int]]:
    """Split an image into non-overlapping (x, y, w, h) regions, clipped at edges."""
    if tile_size <= 0:
        raise ValueError(f"tile_size must be positive, got {tile_size}")
    regions: list[tuple[int, int, int, int]] = []
    for y in range(0, height, tile_size):
        for x in range(0, width, tile_size):
            regions.append((x, y, min(tile_size, width - x), min(tile_size, height - y)))
    return regions


def _fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def fetch_manifest(rumsey_id: str) -> dict:
    """Download and parse an item's IIIF manifest."""
    return json.loads(_fetch(manifest_url(rumsey_id)).decode("utf-8"))


def download_county(slug: str, destination: pathlib.Path, tile_size: int = 2048) -> pathlib.Path:
    """Download every region of a county sheet and mosaic them into one TIFF."""
    county = get_county(slug)
    if county.rumsey_id is None:
        raise ValueError(
            f"{county.name} has no known digital source; "
            f"see docs/annapolis-church-lac-enquiry.md"
        )

    destination.mkdir(parents=True, exist_ok=True)
    parts_dir = destination / "parts"
    parts_dir.mkdir(exist_ok=True)

    width, height = canvas_size(fetch_manifest(county.rumsey_id))
    regions = plan_regions(width, height, tile_size)
    print(f"{county.name}: {width}x{height} px, {len(regions)} regions", file=sys.stderr)

    part_paths: list[pathlib.Path] = []
    for index, (x, y, region_width, region_height) in enumerate(regions, start=1):
        part_path = parts_dir / f"{x:06d}_{y:06d}.jpg"
        if not part_path.exists():
            url = region_url(county.rumsey_id, x, y, region_width, region_height, region_width)
            part_path.write_bytes(_fetch(url))
            time.sleep(REQUEST_DELAY_SECONDS)
        part_paths.append(part_path)
        if index % 25 == 0:
            print(f"  {index}/{len(regions)}", file=sys.stderr)

    # Give each part its pixel-space position so gdalbuildvrt can mosaic them.
    for part_path in part_paths:
        x, y = (int(value) for value in part_path.stem.split("_"))
        subprocess.run(
            ["gdal_translate", "-q", "-a_ullr", str(x), str(-y),
             str(x + tile_size), str(-(y + tile_size)), str(part_path),
             str(part_path.with_suffix(".vrt"))],
            check=True,
        )

    mosaic_vrt = destination / f"{slug}.vrt"
    subprocess.run(
        ["gdalbuildvrt", "-q", str(mosaic_vrt),
         *[str(p.with_suffix(".vrt")) for p in part_paths]],
        check=True,
    )
    output = destination / f"{slug}.tif"
    subprocess.run(
        ["gdal_translate", "-q", "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES",
         str(mosaic_vrt), str(output)],
        check=True,
    )
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch a Church county sheet from Rumsey.")
    parser.add_argument("slug", help="county slug, e.g. inverness")
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("build/church"))
    parser.add_argument("--tile-size", type=int, default=2048)
    args = parser.parse_args(argv)
    path = download_county(args.slug, args.output / args.slug, args.tile_size)
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
