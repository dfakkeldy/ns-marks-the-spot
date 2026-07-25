"""Mask a panel warp to its cutline.

The cutline is authored in source pixel space, but gdalwarp wants it in the
target CRS. Rather than assume the two are related by anything simple, the
cutline ring is pushed through the SAME thin-plate spline as the imagery (see
`georeference.project_cutline`), so the mask lands exactly where the pixels do.

A TPS bends straight lines, so each edge is densified before transformation -
transforming only the corners would cut a straight chord across a curve and
shave off real map content.

Note on honesty: masking here removes area the panel never covered - blank
paper, the title cartouche, the neighbouring panel. It is not a way to hide
misalignment, and accuracy is always measured before any mask is applied.
"""

from __future__ import annotations

import json
import math

from tools.church.cutlines import Cutline

Vertex = tuple[float, float]


def densify(cutline: Cutline, max_spacing: float) -> list[Vertex]:
    """Walk the ring, inserting points so no gap exceeds `max_spacing`."""
    if max_spacing <= 0:
        raise ValueError(f"max_spacing must be positive, got {max_spacing}")

    dense: list[Vertex] = []
    count = len(cutline.vertices)
    for index in range(count):
        start = cutline.vertices[index]
        end = cutline.vertices[(index + 1) % count]
        dense.append(start)
        length = math.hypot(end[0] - start[0], end[1] - start[1])
        steps = int(math.ceil(length / max_spacing))
        for step in range(1, steps):
            fraction = step / steps
            dense.append(
                (
                    start[0] + (end[0] - start[0]) * fraction,
                    start[1] + (end[1] - start[1]) * fraction,
                )
            )
    return dense


def cutline_geojson(ring: list[Vertex], epsg: int) -> str:
    """A single closed polygon feature, ready for `gdalwarp -cutline`."""
    closed = list(ring)
    if closed[0] != closed[-1]:
        closed.append(closed[0])
    return json.dumps(
        {
            "type": "FeatureCollection",
            "crs": {"type": "name", "properties": {"name": f"urn:ogc:def:crs:EPSG::{epsg}"}},
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "Polygon", "coordinates": [[list(p) for p in closed]]},
                }
            ],
        }
    )


def warp_command_with_cutline(
    translated: str,
    output: str,
    cutline_path: str,
    target_bounds=None,
    target_resolution_m: float | None = None,
) -> list[str]:
    """gdalwarp targeting Web Mercator, masked to the panel cutline.

    Deliberately no `-crop_to_cutline`: the output extent must stay pinned to
    the panel's declared target bounds so successive runs stay comparable and
    the mosaic step has a predictable grid.
    """
    command = ["gdalwarp", "-r", "bilinear", "-t_srs", "EPSG:3857", "-tps"]
    command += ["-cutline", cutline_path]
    if target_bounds is not None:
        command += [
            "-te_srs", "EPSG:4326",
            "-te",
            str(target_bounds.west), str(target_bounds.south),
            str(target_bounds.east), str(target_bounds.north),
        ]
    command += ["-dstalpha"]
    if target_resolution_m is not None:
        command += ["-tr", str(target_resolution_m), str(target_resolution_m)]
    command += [
        "-co", "COMPRESS=DEFLATE",
        "-co", "TILED=YES",
        "-co", "BIGTIFF=IF_SAFER",
        translated,
        output,
    ]
    return command
