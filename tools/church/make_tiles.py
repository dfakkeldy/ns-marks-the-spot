"""Slice a warped Church raster into an XYZ tile pyramid with a metadata sidecar."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess

from tools.church.counties import get_county
from tools.church.georeference import RUMSEY_ATTRIBUTION, build_metadata
from tools.church.residuals import AccuracyReport

GDAL2TILES = "gdal2tiles.py"


def tile_command(source: str, output_dir: str, zoom_min: int, zoom_max: int) -> list[str]:
    """gdal2tiles invocation producing XYZ (not TMS) tiles."""
    if zoom_min > zoom_max:
        raise ValueError(f"zoom_min {zoom_min} exceeds zoom_max {zoom_max}")
    return [
        GDAL2TILES,
        "--xyz",
        f"--zoom={zoom_min}-{zoom_max}",
        "--resampling=bilinear",
        f"--attribution={RUMSEY_ATTRIBUTION}",
        source,
        output_dir,
    ]


def make_tiles(
    slug: str,
    warped: pathlib.Path,
    output_dir: pathlib.Path,
    report: AccuracyReport,
    source_url: str,
    retrieved: str,
    zoom_min: int = 8,
    zoom_max: int = 16,
) -> pathlib.Path:
    """Produce the tile pyramid and write metadata.json beside it."""
    output_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(tile_command(str(warped), str(output_dir), zoom_min, zoom_max), check=True)
    metadata = build_metadata(
        county=get_county(slug),
        report=report,
        zoom_min=zoom_min,
        zoom_max=zoom_max,
        source_url=source_url,
        retrieved=retrieved,
    )
    metadata_path = output_dir / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return metadata_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Tile a warped Church raster.")
    parser.add_argument("slug")
    parser.add_argument("--warped", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--retrieved", required=True)
    parser.add_argument("--zoom-min", type=int, default=8)
    parser.add_argument("--zoom-max", type=int, default=16)
    args = parser.parse_args(argv)
    # Accuracy is recomputed by georeference.py; an empty report here keeps the
    # CLI usable for re-tiling an already-warped raster.
    report = AccuracyReport(affine_rms_m=0.0, control_count=0, check_count=0)
    print(make_tiles(args.slug, args.warped, args.output, report,
                     args.source_url, args.retrieved, args.zoom_min, args.zoom_max))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
