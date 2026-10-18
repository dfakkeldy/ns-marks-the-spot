"""Create small label crops used to transcribe and review Fletcher anchors."""

from __future__ import annotations

import argparse
import json
import pathlib


def anchor_windows(
    width: int,
    height: int,
    *,
    meridian_x: float | None = None,
    parallel_y: float | None = None,
) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    """Return longitude and latitude label windows in source pixels.

    The ratios locate the first interior meridian and parallel on the common
    Fletcher sheet layout. The generous windows retain the engraved label,
    rule and adjacent context so a reviewer can reject a bad crop.
    """
    if meridian_x is None:
        meridian_x = width * (1796 / 10873)
    if parallel_y is None:
        parallel_y = height * (1261 / 7642)
    longitude_x = round(meridian_x) - 600
    longitude_y = round(height * (1060 / 7642)) - 450
    latitude_y = round(parallel_y) - 450
    return (
        (max(0, longitude_x), max(0, longitude_y), 1200, 700),
        (500, max(0, latitude_y), 1300, 900),
    )


def render_contact_sheet(
    dataset,
    meridians: list[float],
    parallels: list[float],
    output: pathlib.Path,
) -> None:
    """Render every detected intersection for a compact human review."""
    import cv2
    import numpy as np

    cell_size = 280
    crop_radius = 100
    canvas = np.full(
        (cell_size * len(parallels), cell_size * len(meridians), 3),
        255,
        dtype=np.uint8,
    )
    for row, parallel in enumerate(parallels):
        for column, meridian in enumerate(meridians):
            x = round(meridian)
            y = round(parallel)
            pixels = dataset.ReadAsArray(
                x - crop_radius,
                y - crop_radius,
                crop_radius * 2,
                crop_radius * 2,
            )
            if pixels.ndim == 3:
                image = np.transpose(pixels[:3], (1, 2, 0))
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            else:
                image = cv2.cvtColor(pixels, cv2.COLOR_GRAY2BGR)
            image = cv2.resize(image, (260, 240))
            top = row * cell_size
            left = column * cell_size
            canvas[top + 40 : top + 280, left + 10 : left + 270] = image
            cv2.putText(
                canvas,
                f"M{column + 1}/P{row + 1} {x},{y}",
                (left + 10, top + 27),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 0, 0),
                1,
                cv2.LINE_AA,
            )
    if not cv2.imwrite(str(output), canvas):
        raise RuntimeError(f"could not write {output}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    from osgeo import gdal

    root = args.root.resolve()
    manifest = json.loads(
        (root / "manifest.json").read_text(encoding="utf-8")
    )
    for sheet_id, fields in manifest["sheets"].items():
        source_value = fields.get("source_path")
        if not source_value:
            source_value = str(
                root
                / "work"
                / f"sheet-{int(sheet_id):02d}"
                / f"sheet-{int(sheet_id):02d}.tif"
            )
        source = pathlib.Path(source_value)
        if not source.exists():
            continue
        dataset = gdal.Open(str(source))
        if dataset is None:
            raise RuntimeError(f"could not open {source}")
        destination = root / "qa" / f"sheet-{int(sheet_id):02d}"
        destination.mkdir(parents=True, exist_ok=True)
        lattice_path = destination / "lattice-auto.json"
        if not lattice_path.exists():
            print(f"{lattice_path}: missing; skip QA")
            continue
        lattice = json.loads(lattice_path.read_text(encoding="utf-8"))
        meridians = [float(value) for value in lattice["meridians"]]
        parallels = [float(value) for value in lattice["parallels"]]
        windows = anchor_windows(
            dataset.RasterXSize,
            dataset.RasterYSize,
            meridian_x=meridians[0],
            parallel_y=parallels[0],
        )
        for name, window in zip(("longitude", "latitude"), windows):
            output = destination / f"{name}-anchor.png"
            gdal.Translate(
                str(output),
                dataset,
                srcWin=window,
                width=window[2] * 2,
                height=window[3] * 2,
            )
            print(output)
        contact = destination / "graticule-contact-sheet.png"
        render_contact_sheet(dataset, meridians, parallels, contact)
        print(contact)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
