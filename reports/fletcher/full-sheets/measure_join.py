"""Measure vertical neatline separation; this is coverage, not geographic error."""

import argparse
import json
import math
from pathlib import Path

from osgeo import ogr


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--north", type=Path, required=True)
    parser.add_argument("--south", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    def polygon(path):
        data = json.loads(path.read_text())
        return ogr.CreateGeometryFromJson(json.dumps(data["features"][0]["geometry"]))

    north, south = polygon(args.north), polygon(args.south)
    points = []
    for index in range(370):
        lon = -61.59 + index * 0.001
        x = math.radians(lon) * 6378137
        line = ogr.Geometry(ogr.wkbLineString)
        line.AddPoint_2D(x, 5500000)
        line.AddPoint_2D(x, 5900000)
        a, b = north.Intersection(line), south.Intersection(line)
        if a.IsEmpty() or b.IsEmpty():
            continue
        y_north, y_south = a.GetEnvelope()[2], b.GetEnvelope()[3]
        lat = math.atan(math.sinh((y_north + y_south) / 2 / 6378137))
        points.append({"lon": lon, "gap_ground_m": (y_north - y_south) * math.cos(lat)})
    interior = [p for p in points if -61.46 < p["lon"] < -61.23]
    receipt = {
        "north_cutline": str(args.north),
        "south_cutline": str(args.south),
        "sample_step_lon_deg": 0.001,
        "samples": len(points),
        "positive_means": "Gap; negative means overlap. Ground distance approximated from Web Mercator.",
        "interior_longitude_range": [-61.46, -61.23],
        "interior_max_gap_ground_m": max(p["gap_ground_m"] for p in interior),
        "interior_gap_samples": sum(p["gap_ground_m"] > 0 for p in interior),
        "caution": "Far-west samples include sea; far-east spikes can intersect staggered side edges. This is not a feature-alignment accuracy metric.",
        "points": points,
    }
    args.out.write_text(json.dumps(receipt, indent=2) + "\n")
    print({k: v for k, v in receipt.items() if k != "points"})


if __name__ == "__main__":
    main()
