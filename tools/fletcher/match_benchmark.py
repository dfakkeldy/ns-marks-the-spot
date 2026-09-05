"""Exploratory modern-line to historical-ink matcher, not a production georeferencer.

prepare exposes four seed pairs and modern target coordinates; propose cannot
read withheld historical pixels. score is a separate, one-shot operation.
NumPy/OpenCV are optional local experiment dependencies, imported only by propose.
No rasters, service extracts, or proposed points are published as map layers.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
from statistics import median

CONFIG = {
    "downsample": 2,
    "template_radius": 160,
    "search_radius": 80,
    "ink_threshold": 105,
    "distance_scale": 3,
    "minimum_support": 80,
    "minimum_score": 0.65,
    "minimum_gap": 0.035,
    "peak_exclusion_radius": 8,
    "error_tolerance_metres": 100,
    "required_precision": 0.95,
    "required_coverage": 0.30,
    "required_median_improvement": 0.20,
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def merc(lon, lat):
    return (
        6378137 * math.radians(lon),
        6378137 * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)),
    )


def prepare(rows):
    """Select spatially spread seeds using modern coordinates only."""
    points = [
        {
            "id": r["label"],
            "lon": float(r["lon"]),
            "lat": float(r["lat"]),
            "pixel": [float(r["pixel_x"]), float(r["pixel_y"])],
            "role": r["role"],
        }
        for r in rows
    ]
    if len({p["id"] for p in points}) != len(points):
        raise ValueError("duplicate point identifiers")
    eligible = sorted(
        (p for p in points if p["role"] == "control"), key=lambda p: p["id"]
    )
    if len(eligible) < 5:
        raise ValueError("at least five controls required")
    # Angular coordinates suffice for this deterministic spread selection in NS.
    xy = lambda p: (p["lon"] * math.cos(math.radians(46)), p["lat"])
    distance = lambda a, b: sum((x - y) ** 2 for x, y in zip(xy(a), xy(b)))
    seeds = [min(eligible, key=lambda p: (p["lon"], p["id"]))]
    seeds.append(max(eligible, key=lambda p: distance(p, seeds[0])))

    def area(p):
        a, b, c = xy(seeds[0]), xy(seeds[1]), xy(p)
        return abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))

    third = max(eligible, key=area)
    if area(third) < 1e-10:
        raise ValueError("collinear modern seed geometry")
    seeds.append(third)
    seeds.append(
        max(
            (p for p in eligible if p not in seeds),
            key=lambda p: min(distance(p, s) for s in seeds),
        )
    )
    ids = {p["id"] for p in seeds}
    targets = [
        {k: p[k] for k in ("id", "lon", "lat", "role")}
        for p in points
        if p["id"] not in ids
    ]
    return {
        "version": 1,
        "config": CONFIG.copy(),
        "seeds": seeds,
        "targets": targets,
    }, [p for p in points if p["id"] not in ids]


def paths(geometry):
    kind = geometry["type"]
    coords = geometry["coordinates"]
    if kind == "LineString":
        return [coords]
    if kind in ("MultiLineString", "Polygon"):
        return coords
    if kind == "MultiPolygon":
        return [ring for polygon in coords for ring in polygon]
    return []


def peak_choice(scores, config):
    import numpy as np

    y, x = np.unravel_index(np.argmax(scores), scores.shape)
    yy, xx = np.indices(scores.shape)
    outside = (xx - x) ** 2 + (yy - y) ** 2 > config["peak_exclusion_radius"] ** 2
    gap = float(scores[y, x] - np.max(scores[outside])) if outside.any() else 0.0
    score = float(scores[y, x])
    accepted = score >= config["minimum_score"] and gap >= config["minimum_gap"]
    return x, y, score, gap, accepted


def propose(inputs, image_path, extract_paths):
    import cv2
    import numpy as np

    cfg = inputs["config"]
    ds = cfg["downsample"]
    image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError("cannot decode source scan")
    height, width = image.shape
    image = cv2.resize(image, (width // ds, height // ds), interpolation=cv2.INTER_AREA)
    ink = (image < cfg["ink_threshold"]).astype(np.uint8)
    affinity = np.exp(
        -cv2.distanceTransform(1 - ink, cv2.DIST_L2, 5) / cfg["distance_scale"]
    ).astype(np.float32)
    seeds = inputs["seeds"]
    src = np.array([[*p["pixel"], 1] for p in seeds])
    dst = np.array([merc(p["lon"], p["lat"]) for p in seeds])
    forward = np.linalg.lstsq(src, dst, rcond=None)[0]
    if np.linalg.matrix_rank(src) < 3 or np.linalg.cond(forward[:2]) > 50:
        raise ValueError("degenerate seed transform")
    inverse = np.linalg.inv(forward[:2])
    offset = forward[2]
    modern = []
    for path in extract_paths:
        collection = json.loads(Path(path).read_text())
        if collection.get("type") != "FeatureCollection":
            raise ValueError("invalid modern extract")
        for feature in collection["features"]:
            for line in paths(
                feature.get("geometry") or {"type": "Point", "coordinates": []}
            ):
                projected = np.array([merc(float(p[0]), float(p[1])) for p in line])
                pixels = (projected - offset) @ inverse / ds
                if len(pixels) > 1:
                    modern.append(pixels)
    template_r = cfg["template_radius"] // ds
    search_r = cfg["search_radius"] // ds
    predictions = []
    for target in inputs["targets"]:
        initial = (np.array(merc(target["lon"], target["lat"])) - offset) @ inverse
        center = np.rint(initial / ds).astype(int)
        radius = template_r + search_r
        row = {
            "id": target["id"],
            "baseline_pixel": initial.tolist(),
            "accepted": False,
        }
        if (
            any(center - radius < 0)
            or center[0] + radius >= image.shape[1]
            or center[1] + radius >= image.shape[0]
        ):
            row["reason"] = "outside-scan"
            predictions.append(row)
            continue
        origin = center - template_r
        size = 2 * template_r + 1
        template = np.zeros((size, size), np.uint8)
        for line in modern:
            if np.any(line.max(axis=0) < origin) or np.any(
                line.min(axis=0) > origin + size
            ):
                continue
            # Clip coordinates before int conversion only to a distant safe range;
            # cv2 clips actual segments to the template bounds.
            local = np.rint(np.clip(line - origin, -100000, 100000)).astype(np.int32)
            cv2.polylines(template, [local], False, 1, 1)
        support = int(template.sum())
        row["support"] = support
        if support < cfg["minimum_support"]:
            row["reason"] = "insufficient-modern-linework"
            predictions.append(row)
            continue
        yy, xx = np.nonzero(template)
        eig = np.linalg.eigvalsh(np.cov(np.stack((xx, yy))))
        if eig[0] / max(eig[-1], 1) < 0.03:
            row["reason"] = "near-linear-template"
            predictions.append(row)
            continue
        window = affinity[
            center[1] - radius : center[1] + radius + 1,
            center[0] - radius : center[0] + radius + 1,
        ]
        scores = (
            cv2.matchTemplate(window, template.astype(np.float32), cv2.TM_CCORR)
            / support
        )
        x, y, score, gap, accepted = peak_choice(scores, cfg)
        pixel = (center + np.array([x - search_r, y - search_r])) * ds
        boundary = x in (0, 2 * search_r) or y in (0, 2 * search_r)
        row.update(
            pixel=pixel.tolist(),
            score=score,
            gap=gap,
            accepted=accepted and not boundary,
            reason="search-boundary"
            if boundary
            else ("candidate" if accepted else "weak-or-ambiguous"),
        )
        predictions.append(row)
    return {
        "input_sha256": digest(inputs),
        "source_sha256": hashlib.sha256(Path(image_path).read_bytes()).hexdigest(),
        "source_dimensions": [width, height],
        "extract_sha256": {
            Path(p).name: hashlib.sha256(Path(p).read_bytes()).hexdigest()
            for p in extract_paths
        },
        "forward_affine": forward.tolist(),
        "predictions": predictions,
    }


def evaluate(inputs, gold, proposals):
    expected = {p["id"] for p in inputs["targets"]}
    rows = proposals["predictions"]
    if len(rows) != len(expected) or {p["id"] for p in rows} != expected:
        raise ValueError("predictions missing, duplicated, or unexpected")
    if proposals.get("input_sha256") != digest(inputs):
        raise ValueError("input receipt mismatch")
    if len(gold) != len(expected) or {p["id"] for p in gold} != expected:
        raise ValueError("gold mismatch")
    truth = {p["id"]: p for p in gold}
    affine = proposals["forward_affine"]

    def error(pixel, p):
        delta = [pixel[i] - p["pixel"][i] for i in range(2)]
        return math.hypot(
            *(sum(delta[i] * affine[i][j] for i in range(2)) for j in range(2))
        ) * math.cos(math.radians(p["lat"]))

    scored = []
    for row in rows:
        p = truth[row["id"]]
        r = {
            "id": p["id"],
            "role": p["role"],
            "accepted": row["accepted"],
            "reason": row["reason"],
            "baseline_error_m": error(row["baseline_pixel"], p),
        }
        if "pixel" in row:
            r["proposal_error_m"] = error(row["pixel"], p)
        if r["accepted"] and "proposal_error_m" not in r:
            raise ValueError("accepted candidate has no pixel")
        scored.append(r)
    accepted = [r for r in scored if r["accepted"]]
    cfg = inputs["config"]
    precision = (
        sum(r["proposal_error_m"] <= cfg["error_tolerance_metres"] for r in accepted)
        / len(accepted)
        if accepted
        else None
    )
    coverage = len(accepted) / len(scored)
    improvement = (
        1
        - median(r["proposal_error_m"] for r in accepted)
        / max(median(r["baseline_error_m"] for r in accepted), 1e-9)
        if accepted
        else None
    )
    passed = bool(
        accepted
        and precision >= cfg["required_precision"]
        and coverage >= cfg["required_coverage"]
        and improvement >= cfg["required_median_improvement"]
    )

    def summary(values):
        if not values:
            return None
        values = sorted(values)
        return {
            "n": len(values),
            "median_m": median(values),
            "rms_m": math.sqrt(sum(v * v for v in values) / len(values)),
            "max_m": max(values),
        }

    return {
        "status": "promising-in-this-sample" if passed else "does-not-meet-trial-gate",
        "input_sha256": digest(inputs),
        "proposal_sha256": digest(proposals),
        "target_count": len(scored),
        "accepted_count": len(accepted),
        "coverage": coverage,
        "precision_within_100m": precision,
        "accepted_median_improvement": improvement,
        "baseline_all": summary([r["baseline_error_m"] for r in scored]),
        "baseline_accepted": summary([r["baseline_error_m"] for r in accepted]),
        "proposals_accepted": summary([r["proposal_error_m"] for r in accepted]),
        "rows": scored,
    }


def write_new(path, value):
    with Path(path).open("x") as f:
        json.dump(value, f, indent=2)
        f.write("\n")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    a = sub.add_parser("prepare")
    a.add_argument("csv")
    a.add_argument("inputs")
    a.add_argument("gold")
    a = sub.add_parser("propose")
    a.add_argument("inputs")
    a.add_argument("image")
    a.add_argument("output")
    a.add_argument("extracts", nargs="+")
    a = sub.add_parser("score")
    a.add_argument("inputs")
    a.add_argument("gold")
    a.add_argument("proposals")
    a.add_argument("output")
    a = p.parse_args()
    if a.command == "prepare":
        rows = list(
            csv.DictReader(
                x for x in Path(a.csv).read_text().splitlines() if not x.startswith("#")
            )
        )
        inputs, gold = prepare(rows)
        write_new(a.inputs, inputs)
        write_new(a.gold, gold)
    elif a.command == "propose":
        write_new(
            a.output,
            propose(json.loads(Path(a.inputs).read_text()), a.image, a.extracts),
        )
    else:
        write_new(
            a.output,
            evaluate(
                *(
                    json.loads(Path(x).read_text())
                    for x in [a.inputs, a.gold, a.proposals]
                )
            ),
        )


if __name__ == "__main__":
    main()
