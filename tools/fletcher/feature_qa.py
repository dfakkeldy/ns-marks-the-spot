"""QA crop and overlay rendering for feature-led v2 georeferencing.

A reviewer accepts or rejects GCPs, and judges alignment, by looking at two
kinds of pictures:

- Evidence crops: a pixel-space window of the historical scan with the
  modern vector features that produced a control's coordinates drawn on top,
  so a reviewer can see the feature the operator actually clicked.
- Overlay crops: a Web-Mercator window of the warped raster with the same
  modern vectors drawn on top *after* the warp, so a reviewer can see how
  well the historical geography now lines up with the modern one.

`qa_grid_centers` picks an n x n lattice of QA sample points across the
usable frame so overlay coverage isn't left to chance; `crop_window` turns
a pixel center into a `gdal_translate -srcwin` box that never runs off the
raster; `merc_to_crop_px` places a mercator point inside an already-rendered
north-up crop so drawing code never has to reopen the raster to find out.

`render_scan_crop` and `render_overlay` are exercised only on the remote GIS
host (Bazzite), never in CI: CI has no cv2, numpy, or GDAL. Both shell every
`gdal_translate` invocation through the injectable `Runner` from
`tools.fletcher.feature_georeference` (never `subprocess` directly, so a
fake runner in a test never has to touch a real raster), and both import
cv2/numpy lazily, inside the function body, so importing this module in CI
never touches either package. The intermediate PNG that `gdal_translate`
produces is written to a `tempfile.TemporaryDirectory` and never persisted.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import tempfile

from tools.fletcher.feature_georeference import Runner, _run

DEFAULT_CROP_SIZE = 1400
DEFAULT_OVERLAY_HALF_WIDTH_M = 1500.0

Point = tuple[float, float]

_ROAD_COLOR_BGR = (0, 0, 255)
_WATER_COLOR_BGR = (255, 0, 0)
_POLYLINE_THICKNESS = 2


def qa_grid_centers(frame: list[list[float]], n: int = 4) -> list[tuple[float, float]]:
    """n^2 pixel centers of an n x n lattice over `frame`'s bounding box.

    `frame` is the 4 corner `[x, y]` pixel pairs of the usable scan frame (in
    any order); only their axis-aligned bounding box is used. Each of the
    n x n cells contributes its center, inset by half a cell from the bbox
    edges, so no sample point sits exactly on the frame boundary. Returned
    row-major: all of row 0 (increasing x), then row 1, and so on, with row
    index increasing with y.
    """
    if n < 1:
        raise ValueError("qa_grid_centers requires n >= 1")
    xs = [point[0] for point in frame]
    ys = [point[1] for point in frame]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    cell_w = (max_x - min_x) / n
    cell_h = (max_y - min_y) / n
    centers: list[tuple[float, float]] = []
    for row in range(n):
        center_y = min_y + (row + 0.5) * cell_h
        for column in range(n):
            center_x = min_x + (column + 0.5) * cell_w
            centers.append((center_x, center_y))
    return centers


def crop_window(
    center: tuple[float, float], size: int, width: int, height: int
) -> tuple[int, int, int, int]:
    """`(x, y, w, h)` for `gdal_translate -srcwin`, clamped inside the raster.

    The window is `size` x `size`, centered on `center`, and shifted (never
    shrunk) so it stays fully inside a `width` x `height` raster - unless the
    raster itself is smaller than `size` along that axis, in which case the
    window is capped to the raster's own extent and starts at 0.
    """
    center_x, center_y = center
    window_w = min(size, width)
    window_h = min(size, height)
    x = round(center_x - size / 2)
    y = round(center_y - size / 2)
    x = max(0, min(x, width - window_w))
    y = max(0, min(y, height - window_h))
    return (x, y, window_w, window_h)


def merc_to_crop_px(
    merc: tuple[float, float],
    projwin: tuple[float, float, float, float],
    out_size: tuple[int, int],
) -> tuple[float, float]:
    """Linear EPSG:3857 -> crop-pixel mapping for a north-up crop.

    `projwin` is `(ulx, uly, lrx, lry)`, exactly as passed to
    `gdal_translate -projwin`: `uly` is the greater northing (the crop's top
    row) and `lry` is the lesser northing (the crop's bottom row), so the
    mapping inverts the y-axis - `uly` lands at pixel row 0, `lry` at pixel
    row `out_size[1]`.
    """
    merc_x, merc_y = merc
    ulx, uly, lrx, lry = projwin
    out_w, out_h = out_size
    px = (merc_x - ulx) / (lrx - ulx) * out_w
    py = (uly - merc_y) / (uly - lry) * out_h
    return (px, py)


def _draw_polylines(image: object, polylines: list[dict]) -> None:
    """Draw each `{"kind", "points"}` polyline onto `image` in place.

    Lazy-imports cv2/numpy - called only from `render_scan_crop` and
    `render_overlay`, never at module import time.
    """
    import cv2  # type: ignore[import-not-found]
    import numpy  # type: ignore[import-not-found]

    for polyline in polylines:
        kind = polyline.get("kind")
        if kind == "road":
            color = _ROAD_COLOR_BGR
        elif kind == "water":
            color = _WATER_COLOR_BGR
        else:
            raise ValueError(f"unknown polyline kind {kind!r}")
        points = polyline.get("points") or []
        if len(points) < 2:
            continue
        pixel_points = numpy.array(
            [[round(x), round(y)] for x, y in points], dtype=numpy.int32
        ).reshape((-1, 1, 2))
        cv2.polylines(
            image,
            [pixel_points],
            isClosed=False,
            color=color,
            thickness=_POLYLINE_THICKNESS,
        )


def render_scan_crop(
    source: str,
    window: tuple[int, int, int, int],
    polylines_px: list[dict],
    out_jpg: pathlib.Path,
    runner: Runner = _run,
) -> None:
    """Render a pixel-space evidence crop of the historical scan.

    Shells `gdal_translate -srcwin` (via `runner`) to a temporary PNG, draws
    `polylines_px` (crop-local pixel points already, no conversion needed) in
    roads-red/water-blue, and writes `out_jpg` as a JPEG. cv2 is imported
    lazily so this module stays importable where cv2 is absent (CI).
    """
    import cv2  # type: ignore[import-not-found]

    x, y, w, h = window
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_png = pathlib.Path(tmp_dir) / "scan-crop.png"
        runner(
            [
                "gdal_translate",
                "-q",
                "-of",
                "PNG",
                "-srcwin",
                str(x),
                str(y),
                str(w),
                str(h),
                source,
                str(tmp_png),
            ],
            None,
        )
        image = cv2.imread(str(tmp_png))
        if image is None:
            raise ValueError(f"gdal_translate did not produce a readable PNG at {tmp_png}")
        _draw_polylines(image, polylines_px)
        out_jpg.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(out_jpg), image):
            raise OSError(f"OpenCV could not write {out_jpg}")


def _load_json_list(path: pathlib.Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"{path} must contain a JSON list")
    return payload


def _shift_polylines_to_crop(
    polylines: list[dict], origin_x: int, origin_y: int
) -> list[dict]:
    """Shift each polyline's raster-absolute pixel points into crop-local
    coordinates, by subtracting the crop window's origin."""
    return [
        {
            "kind": polyline["kind"],
            "points": [
                [x - origin_x, y - origin_y] for x, y in polyline.get("points", [])
            ],
        }
        for polyline in polylines
    ]


def render_overlay(
    warped: str,
    projwin: tuple[float, float, float, float],
    polylines_merc: list[dict],
    out_jpg: pathlib.Path,
    runner: Runner = _run,
) -> None:
    """Render a Web-Mercator overlay crop of the warped raster.

    Shells `gdal_translate -projwin` (via `runner`) to a temporary PNG, then
    converts each `polylines_merc` point from EPSG:3857 to crop-local pixels
    with `merc_to_crop_px`, using the *actual* output PNG's size (read with
    cv2 after the translate, since `gdal_translate -projwin` does not
    guarantee an exact requested pixel size). Draws in roads-red/water-blue
    and writes `out_jpg` as a JPEG. cv2 is imported lazily so this module
    stays importable where cv2 is absent (CI).
    """
    import cv2  # type: ignore[import-not-found]

    ulx, uly, lrx, lry = projwin
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_png = pathlib.Path(tmp_dir) / "overlay-crop.png"
        runner(
            [
                "gdal_translate",
                "-q",
                "-of",
                "PNG",
                "-projwin",
                str(ulx),
                str(uly),
                str(lrx),
                str(lry),
                warped,
                str(tmp_png),
            ],
            None,
        )
        image = cv2.imread(str(tmp_png))
        if image is None:
            raise ValueError(f"gdal_translate did not produce a readable PNG at {tmp_png}")
        out_size = (image.shape[1], image.shape[0])
        polylines_px = [
            {
                "kind": polyline["kind"],
                "points": [
                    merc_to_crop_px(point, projwin, out_size)
                    for point in polyline["points"]
                ],
            }
            for polyline in polylines_merc
        ]
        _draw_polylines(image, polylines_px)
        out_jpg.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(out_jpg), image):
            raise OSError(f"OpenCV could not write {out_jpg}")


def run_crops(
    source: str,
    points: list[dict],
    size: int,
    width: int,
    height: int,
    out_dir: pathlib.Path,
    runner: Runner = _run,
) -> None:
    """Render one evidence crop per `points` entry into `out_dir/<id>.jpg`.

    Each entry is `{"id", "pixel": {"x", "y"}, "polylines_px": [...]}`, with
    `polylines_px` points in raster-absolute pixel coordinates. `crop_window`
    computes a `size` x `size` window clamped inside a `width` x `height`
    raster (never shrunk, only shifted); each polyline is then shifted into
    that window's local coordinates before `render_scan_crop` draws it. Never
    calls `gdalinfo` - `width`/`height` are supplied by the caller, so this
    function (and this whole module's CLI) stays GDAL-free except through
    `runner`.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    for entry in points:
        identifier = str(entry["id"])
        center = (float(entry["pixel"]["x"]), float(entry["pixel"]["y"]))
        window = crop_window(center, size, width, height)
        origin_x, origin_y, _, _ = window
        polylines_px = _shift_polylines_to_crop(
            entry.get("polylines_px", []), origin_x, origin_y
        )
        render_scan_crop(
            source, window, polylines_px, out_dir / f"{identifier}.jpg", runner=runner
        )


def run_overlays(
    warped: str,
    centers: list[dict],
    half_width_m: float,
    out_dir: pathlib.Path,
    runner: Runner = _run,
) -> None:
    """Render one overlay crop per `centers` entry into `out_dir/<id>.jpg`.

    Each entry is `{"id", "merc": {"x", "y"}, "polylines_merc": [...]}`, all
    in EPSG:3857. The `projwin` passed to `render_overlay` is a `half_width_m`
    square centered on `merc`, in `gdal_translate -projwin`'s
    `(ulx, uly, lrx, lry)` order (northing decreases downward).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    for entry in centers:
        identifier = str(entry["id"])
        merc_x = float(entry["merc"]["x"])
        merc_y = float(entry["merc"]["y"])
        projwin = (
            merc_x - half_width_m,
            merc_y + half_width_m,
            merc_x + half_width_m,
            merc_y - half_width_m,
        )
        polylines_merc = [
            {
                "kind": polyline["kind"],
                "points": [[float(x), float(y)] for x, y in polyline.get("points", [])],
            }
            for polyline in entry.get("polylines_merc", [])
        ]
        render_overlay(
            warped,
            projwin,
            polylines_merc,
            out_dir / f"{identifier}.jpg",
            runner=runner,
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)

    crops = subparsers.add_parser("crops", help="render pixel-space evidence crops")
    crops.add_argument("--source", required=True)
    crops.add_argument("--points", type=pathlib.Path, required=True)
    crops.add_argument("--size", type=int, default=DEFAULT_CROP_SIZE)
    crops.add_argument("--width", type=int, required=True)
    crops.add_argument("--height", type=int, required=True)
    crops.add_argument("--out-dir", type=pathlib.Path, required=True)

    overlays = subparsers.add_parser("overlays", help="render Web-Mercator overlay crops")
    overlays.add_argument("--warped", required=True)
    overlays.add_argument("--centers", type=pathlib.Path, required=True)
    overlays.add_argument(
        "--half-width-m", type=float, default=DEFAULT_OVERLAY_HALF_WIDTH_M
    )
    overlays.add_argument("--out-dir", type=pathlib.Path, required=True)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "crops":
        points = _load_json_list(args.points)
        run_crops(args.source, points, args.size, args.width, args.height, args.out_dir)
    elif args.command == "overlays":
        centers = _load_json_list(args.centers)
        run_overlays(args.warped, centers, args.half_width_m, args.out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
