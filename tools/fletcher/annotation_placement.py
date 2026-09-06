"""Map reviewed native feature marks through an existing sheet transform.

These are map-derived annotations, not surveyed historical sites. A source
group becomes an area; lettering centres and operational search boxes are
never substituted for a feature. Unreviewed or unsupported marks stay unlocated.
"""
from __future__ import annotations

import math
from collections.abc import Callable, Sequence

from .physical_qa import _inside_or_on


def source_geometry(review: dict, dimensions: Sequence[int]) -> dict | None:
    """Return geometry in the original scan frame, with sampled group edges."""
    anchor = review.get("source_anchor_xy")
    regions = review.get("candidate_symbol_regions_xywh", [])

    def checked(point):
        if len(point) != 2 or not all(math.isfinite(v) for v in point):
            raise ValueError("Invalid native coordinate")
        if not (0 <= point[0] < dimensions[0] and 0 <= point[1] < dimensions[1]):
            raise ValueError("Native coordinate outside original scan")
        return list(point)

    if anchor is not None:
        if review.get("status") != "supported-source-association" or regions:
            raise ValueError("A point requires an unambiguous reviewed source association")
        return {"type": "Point", "coordinates": checked(anchor)}
    if not regions:
        return None
    if review.get("status") != "unresolved":
        raise ValueError("Unexpected source-group review status")
    polygons = []
    for x, y, width, height in regions:
        if not all(math.isfinite(v) for v in [x, y, width, height]) or min(width, height) <= 0:
            raise ValueError("Invalid source-group rectangle")
        corners = [(x, y), (x + width, y), (x + width, y + height), (x, y + height)]
        ring = []
        for start, end in zip(corners, corners[1:] + corners[:1]):
            # A curved transform needs more than four corner samples.
            steps = max(1, math.ceil(math.dist(start, end) / 10))
            ring.extend(checked([start[j] + (end[j] - start[j]) * i / steps for j in (0, 1)])
                        for i in range(steps))
        ring.append(ring[0][:])
        polygons.append([ring])
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def place_review(review: dict, dimensions: Sequence[int], supported_hull: Sequence,
                 transform: Callable, alignment_status: str) -> dict:
    """Transform reviewed geometry, refusing failed alignments and extrapolation.

    `transform` accepts native xy rows and returns matching longitude/latitude rows.
    The caller supplies the current supported control hull in native pixels.
    """
    native = source_geometry(review, dimensions)
    result = {"geometry": None, "source_geometry_native": native,
              "placement_status": "needs-source-review", "alignment_status": alignment_status}
    if native is None:
        return result
    if alignment_status not in {"accepted", "draft-supported-area"}:
        result["placement_status"] = "alignment-not-supported"
        return result
    kind = native["type"]
    rings = ([[native["coordinates"]]] if kind == "Point" else
             native["coordinates"] if kind == "Polygon" else
             [p[0] for p in native["coordinates"]])
    points = [point for ring in rings for point in ring]
    if len(supported_hull) < 3 or not all(_inside_or_on(tuple(p), supported_hull) for p in points):
        result["placement_status"] = "outside-supported-coverage"
        return result
    projected = transform(points)
    if len(projected) != len(points):
        raise ValueError("Transform returned a different number of coordinates")
    for lon, lat in projected:
        if not (math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("Transform did not return finite longitude/latitude")
    output_rings = []
    offset = 0
    for ring in rings:
        mapped = [list(p) for p in projected[offset:offset + len(ring)]]
        offset += len(ring)
        if kind != "Point":
            mapped[-1] = mapped[0][:]
            area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(mapped, mapped[1:]))
            if abs(area) < 1e-15:
                raise ValueError("Degenerate transformed source group")
            if area < 0:
                mapped.reverse()  # GeoJSON exterior rings are counterclockwise.
        output_rings.append(mapped)
    coordinates = (output_rings[0][0] if kind == "Point" else output_rings if kind == "Polygon"
                   else [[ring] for ring in output_rings])
    result["geometry"] = {"type": kind, "coordinates": coordinates}
    result["placement_status"] = "map-derived-approximate"
    return result
