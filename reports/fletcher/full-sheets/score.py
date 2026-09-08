"""Score frozen physical checks against a specified TPS, without fitting checks."""

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "boundary", HERE.parent / "judique-boundary/build_boundary.py"
)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fit", type=Path, required=True)
    parser.add_argument("--checks", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    observations = json.loads(args.fit.read_text())
    data = json.loads(args.checks.read_text())
    c.verified(args.fit, data["fit_sha256"])
    controls = [p for p in observations["points"] if p["role"] == "control"]
    checks = data["points"]
    assert all(p["role"] == "check" for p in checks)
    assert not {tuple(p["pixel_xy"]) for p in checks} & {
        tuple(p["pixel_xy"]) for p in controls
    }
    assert not {tuple(p["lonlat"]) for p in checks} & {
        tuple(p["lonlat"]) for p in controls
    }, "A modern location duplicates a fitting control"
    gcps = []
    for p, world in zip(controls, c.merc([p["lonlat"] for p in controls])):
        gcps.extend(["-gcp", *map(str, [*p["pixel_xy"], *world])])
    result = c.run(
        "gdaltransform",
        "-tps",
        *gcps,
        stdin="".join(f"{p['pixel_xy'][0]} {p['pixel_xy'][1]}\n" for p in checks),
    )
    predicted = c.unmerc(
        np.array([list(map(float, row.split()[:2])) for row in result.splitlines()])
    )
    actual = np.array([p["lonlat"] for p in checks])
    error = 6371008.8 * np.hypot(
        np.deg2rad(predicted[:, 0] - actual[:, 0])
        * np.cos(np.deg2rad((predicted[:, 1] + actual[:, 1]) / 2)),
        np.deg2rad(predicted[:, 1] - actual[:, 1]),
    )
    receipt = {
        "fit_sha256": c.digest(args.fit),
        "checks_sha256": c.digest(args.checks),
        "control_count": len(controls),
        "method": "GDAL TPS in EPSG:3857",
        "error_units": "Approximate spherical ground metres",
        "median_ground_m": float(np.median(error)),
        "worst_ground_m": float(max(error)),
        "points": [
            {"id": p["id"], "error_ground_m": float(e), "predicted_lonlat": ll.tolist()}
            for p, e, ll in zip(checks, error, predicted)
        ],
    }
    c.write(args.out, receipt)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
