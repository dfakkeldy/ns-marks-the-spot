"""Resumable, courteous IIIF downloader for an arbitrary Rumsey item.

Network requests are serialized. Each completed region is cached under a name
that records its true source rectangle, so reruns do not contact Rumsey for
already-downloaded pixels and edge regions cannot be mosaicked at the wrong
size.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import subprocess
import time
import urllib.error
import urllib.request
from collections.abc import Callable

from tools.church.fetch_rumsey import (
    IIIF_BASE,
    REQUEST_DELAY_SECONDS,
    USER_AGENT,
    canvas_size,
    manifest_url,
    plan_regions,
    region_url,
)

Fetch = Callable[[str], bytes]
Sleep = Callable[[float], None]


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def fetch_manifest(
    rumsey_id: str,
    *,
    fetch: Fetch = fetch_bytes,
) -> dict:
    return json.loads(fetch(manifest_url(rumsey_id)).decode("utf-8"))


def _fetch_with_backoff(
    url: str,
    *,
    fetch: Fetch,
    sleep: Sleep,
    maximum_attempts: int,
) -> bytes:
    if maximum_attempts < 1:
        raise ValueError("maximum_attempts must be at least 1")
    for attempt in range(1, maximum_attempts + 1):
        try:
            return fetch(url)
        except (OSError, urllib.error.URLError):
            if attempt == maximum_attempts:
                raise
            sleep(float(2 ** (attempt - 1)))
    raise AssertionError("unreachable")


def download_regions(
    *,
    rumsey_id: str,
    width: int,
    height: int,
    destination: pathlib.Path,
    tile_size: int = 2048,
    fetch: Fetch = fetch_bytes,
    sleep: Sleep = time.sleep,
    courtesy_delay_seconds: float = REQUEST_DELAY_SECONDS,
    maximum_attempts: int = 5,
) -> list[pathlib.Path]:
    """Fetch missing image regions sequentially and return every cached path."""
    parts = destination / "parts"
    parts.mkdir(parents=True, exist_ok=True)
    paths: list[pathlib.Path] = []
    for x, y, region_width, region_height in plan_regions(width, height, tile_size):
        path = parts / (
            f"{x:06d}_{y:06d}_{region_width:06d}_{region_height:06d}.jpg"
        )
        if not path.exists():
            url = region_url(
                rumsey_id,
                x,
                y,
                region_width,
                region_height,
                region_width,
            )
            payload = _fetch_with_backoff(
                url,
                fetch=fetch,
                sleep=sleep,
                maximum_attempts=maximum_attempts,
            )
            path.write_bytes(payload)
            sleep(courtesy_delay_seconds)
        paths.append(path)
    return paths


def mosaic_regions(
    paths: list[pathlib.Path],
    destination: pathlib.Path,
    slug: str,
) -> pathlib.Path:
    """Mosaic cached regions without assuming edge parts are full tile size."""
    vrt_paths: list[pathlib.Path] = []
    for path in paths:
        x, y, width, height = (int(value) for value in path.stem.split("_"))
        vrt_path = path.with_suffix(".vrt")
        subprocess.run(
            [
                "gdal_translate",
                "-q",
                "-of",
                "VRT",
                "-a_ullr",
                str(x),
                str(-y),
                str(x + width),
                str(-(y + height)),
                str(path),
                str(vrt_path),
            ],
            check=True,
        )
        vrt_paths.append(vrt_path)

    mosaic = destination / f"{slug}.vrt"
    subprocess.run(
        ["gdalbuildvrt", "-q", str(mosaic), *map(str, vrt_paths)],
        check=True,
    )
    output = destination / f"{slug}.tif"
    subprocess.run(
        [
            "gdal_translate",
            "-q",
            "-co",
            "COMPRESS=DEFLATE",
            "-co",
            "TILED=YES",
            "-co",
            "BIGTIFF=IF_SAFER",
            str(mosaic),
            str(output),
        ],
        check=True,
    )
    return output


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_item(
    rumsey_id: str,
    slug: str,
    destination: pathlib.Path,
    tile_size: int = 2048,
) -> tuple[pathlib.Path, str]:
    manifest = fetch_manifest(rumsey_id)
    width, height = canvas_size(manifest)
    destination.mkdir(parents=True, exist_ok=True)
    paths = download_regions(
        rumsey_id=rumsey_id,
        width=width,
        height=height,
        destination=destination,
        tile_size=tile_size,
    )
    output = destination / f"{slug}.tif"
    if not output.exists():
        output = mosaic_regions(paths, destination, slug)
    return output, sha256(output)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("rumsey_id")
    parser.add_argument("slug")
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--tile-size", type=int, default=2048)
    args = parser.parse_args(argv)
    path, checksum = download_item(
        args.rumsey_id,
        args.slug,
        args.output / args.slug,
        args.tile_size,
    )
    print(json.dumps({"path": str(path), "sha256": checksum}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
