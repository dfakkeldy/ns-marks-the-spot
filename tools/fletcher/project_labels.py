"""Project reviewed lettering through PR #380's frozen native-scan TPS fits.

Requires GDAL's gdaltransform; --source/--packets additionally requires Pillow.
No source inventories, controls, or feature placements are modified.
"""

import argparse
import csv
import hashlib
import io
import json
import math
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INVENTORIES = Path("docs/fletcher/label-extraction/highway19-production")
REPORT = Path("reports/fletcher/label-geography")
REVISION = "a6619d96ba8fa8279ea6a8027654a92b15942b9d"
SHEETS = {
    19: ("judique-full-sheet/revised-fit.json", "judique-boundary/boundary.json", "judique-render-receipt.json"),
    16: ("mabou-full-sheet/revised-fit.json", "sheet16/boundary.json", "mabou-render-receipt.json"),
    22: ("hawkesbury-full-sheet/boundary-fit.json", "sheet22/boundary.json", "hawkesbury-boundary-render-receipt.json"),
}
CHECKS = {
    19: ("judique-full-sheet/fresh-checks.json", "judique-full-sheet/fresh-scores.json"),
    16: ("mabou-full-sheet/fresh-checks.json", "full-sheets/mabou-render-receipt.json"),
    22: ("hawkesbury-full-sheet/boundary-diagnostic-checks.json", "full-sheets/hawkesbury-boundary-render-receipt.json"),
}
RADIUS = 6378137.0


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read(path):
    return json.loads(path.read_text())


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def box_center(box, dimensions):
    require(len(box) == 4 and all(math.isfinite(v) for v in box), "Invalid source box")
    x, y, w, h = box
    require(x >= 0 and y >= 0 and w > 0 and h > 0
            and x + w <= dimensions[0] and y + h <= dimensions[1], "Box outside native scan")
    return [x + w / 2, y + h / 2]


def crop_to_source(point, source_xywh, displayed_dimensions):
    """Unrotated pixel-edge coordinates; no implicit half-pixel shift."""
    x, y, w, h = source_xywh
    dw, dh = displayed_dimensions
    require(w > 0 and h > 0 and dw > 0 and dh > 0, "Invalid crop dimensions")
    return [x + point[0] * w / dw, y + point[1] * h / dh]


def inside(point, ring):
    """Conservative ray crossing; boundary proximity is not geographic accuracy."""
    x, y = point
    result = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        cross = (x-a[0])*(b[1]-a[1]) - (y-a[1])*(b[0]-a[0])
        if abs(cross) < 1e-9 and min(a[0], b[0]) <= x <= max(a[0], b[0]) and min(a[1], b[1]) <= y <= max(a[1], b[1]):
            return False
        if (a[1] > y) != (b[1] > y):
            if x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
                result = not result
    return result


def hull(points):
    points = sorted(set(map(tuple, points)))
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    halves = []
    for sequence in (points, reversed(points)):
        half = []
        for p in sequence:
            while len(half) >= 2 and cross(half[-2], half[-1], p) <= 0:
                half.pop()
            half.append(p)
        halves.extend(half[:-1])
    return halves


def mercator(lonlat):
    lon, lat = map(math.radians, lonlat)
    return [RADIUS * lon, RADIUS * math.log(math.tan(math.pi / 4 + lat / 2))]


def lonlat(world):
    x, y = world
    return [math.degrees(x / RADIUS), math.degrees(2 * math.atan(math.exp(y / RADIUS)) - math.pi / 2)]


def transform(controls, points, executable):
    # Exactly the gdaltransform -tps / EPSG:3857 procedure in full-sheets/render.py.
    command = [executable, "-tps"]
    for p in controls:
        command += ["-gcp", *map(str, [*p["pixel_xy"], *mercator(p["lonlat"])])]
    result = subprocess.run(command, input="".join(f"{x} {y}\n" for x, y in points),
                            text=True, capture_output=True, check=True)
    values = [list(map(float, line.split()[:2])) for line in result.stdout.splitlines()]
    require(len(values) == len(points) and all(len(v) == 2 and all(map(math.isfinite, v)) for v in values),
            "GDAL returned invalid coordinates")
    return values


def load_inputs(sheet):
    fit_name, boundary_name, receipt_name = SHEETS[sheet]
    fit_path = Path("reports/fletcher") / fit_name
    boundary_path = Path("reports/fletcher") / boundary_name
    inventory_path = INVENTORIES / f"sheet-{sheet}-reviewed.json"
    manifest_path = INVENTORIES / f"sheet-{sheet}-manifest.json"
    csv_path = Path(f"reports/fletcher/full-sheets/sheet-{sheet}-controls.csv")
    receipt_path = Path("reports/fletcher/full-sheets") / receipt_name
    paths = [fit_path, boundary_path, inventory_path, manifest_path, csv_path, receipt_path]
    paths += [Path("reports/fletcher") / name for name in CHECKS[sheet]]
    # This derivative is pinned to PR #380. Future revisions require explicit reprocessing.
    for path in paths:
        frozen = subprocess.run(["git", "show", f"{REVISION}:{path}"], cwd=ROOT,
                                capture_output=True, check=True).stdout
        require(hashlib.sha256(frozen).hexdigest() == digest(ROOT / path), f"Changed frozen input: {path}")
    fit, boundary, inventory, manifest = map(lambda p: read(ROOT / p), paths[:4])
    receipt = read(ROOT / receipt_path)
    active = next(s for s in read(ROOT / "reports/fletcher/full-sheets/inputs.json")["sheets"] if s["sheet"] == str(sheet))
    require(active["fit"] == fit_name and active["fit_sha256"] == digest(ROOT / fit_path), "Active fit mismatch")
    require(receipt["fit_sha256"] == digest(ROOT / fit_path)
            and receipt["boundary_sha256"] == digest(ROOT / boundary_path), "Render receipt mismatch")
    require(fit["source_sha256"] == boundary["source_sha256"] == inventory["source_sha256"] == manifest["source_sha256"], "Source identity mismatch")
    require(fit["source_dimensions"] == boundary["source_dimensions"] == inventory["source_dimensions_px"] == manifest["source_dimensions_px"], "Source frame mismatch")
    controls = [p for p in fit["points"] if p["role"] == "control"]
    rows = list(csv.DictReader(io.StringIO("\n".join(line for line in (ROOT / csv_path).read_text().splitlines() if not line.startswith("#")))))
    require([(p["id"], p["pixel_xy"], p["lonlat"]) for p in controls] ==
            [(p["label"], [float(p["pixel_x"]), float(p["pixel_y"])], [float(p["lon"]), float(p["lat"])]) for p in rows], "Editable controls differ from fit")
    return fit, boundary, inventory, manifest, controls, receipt, {
        "fit_revision": REVISION, "fit_pr": "https://github.com/dfakkeldy/ns-marks-the-spot/pull/380",
        "fit_path": str(fit_path), "fit_sha256": digest(ROOT / fit_path),
        "input_sha256": {str(p): digest(ROOT / p) for p in paths},
    }


def audit_scan(source, packets, inventory, manifest):
    from PIL import Image, ImageChops
    Image.MAX_IMAGE_PIXELS = 150_000_000
    require(digest(source) == inventory["source_sha256"], "Native image hash mismatch")
    crops = []
    with Image.open(source) as scan:
        require(list(scan.size) == inventory["source_dimensions_px"], "Native image dimensions mismatch")
        for crop in manifest["crops"]:
            path = packets / crop["crop_id"] / "source.png"
            require(digest(path) == crop["sha256"], f"Crop hash mismatch: {crop['crop_id']}")
            x, y, w, h = crop["source_xywh"]
            with Image.open(path) as image:
                require(image.size == (w, h), "Unexpected extraction crop resizing")
                require(ImageChops.difference(image.convert("RGB"), scan.crop((x, y, x+w, y+h)).convert("RGB")).getbbox() is None,
                        f"Crop pixels differ: {crop['crop_id']}")
            crops.append({**crop, "displayed_dimensions_px": [w, h], "native_pixels_equal": True,
                          "scale_to_native_xy": [1, 1], "offset_to_native_xy": [x, y], "rotation_degrees": 0})
    return {"source_sha256": digest(source), "source_dimensions_px": inventory["source_dimensions_px"], "crops": crops}


def project(sheet, executable):
    fit, boundary, inventory, manifest, controls, _, provenance = load_inputs(sheet)
    annotations = inventory["annotations"]
    require(len({a["id"] for a in annotations}) == len(annotations), "Duplicate annotation IDs")
    control_hull = hull([p["pixel_xy"] for p in controls])
    all_anchors = []
    features = []
    for annotation in annotations:
        require(annotation["source_label_boxes_xywh"], "Missing source lettering boxes")
        anchors = []
        for index, box in enumerate(annotation["source_label_boxes_xywh"]):
            center = box_center(box, inventory["source_dimensions_px"])
            crop_ids = []
            for crop in manifest["crops"]:
                x, y, w, h = crop["source_xywh"]
                if x <= center[0] <= x+w and y <= center[1] <= y+h:
                    local = [center[0]-x, center[1]-y]
                    require(crop_to_source(local, crop["source_xywh"], [w, h]) == center, "Crop roundtrip failed")
                    crop_ids.append(crop["crop_id"])
            require(crop_ids, f"Anchor lacks extraction crop coverage: {annotation['id']}")
            supported = inside(center, boundary["ring_pixel_xy"])
            anchor = {"box_index": index, "source_pixel_xy": center, "covering_crop_ids": crop_ids,
                      "inside_control_hull": inside(center, control_hull),
                      "status": "derived-lettering-location" if supported else "outside-fit-neatline",
                      "projected_xy_m": None, "lonlat": None}
            anchors.append(anchor)
            if supported:
                all_anchors.append(anchor)
        features.append({"type": "Feature", "id": annotation["id"], "geometry": None,
                         "properties": {**annotation, "fit_revision": REVISION, "fit_sha256": provenance["fit_sha256"],
                                        "label_anchors": anchors, "geographic_role": "printed-lettering-only"}})
    # Include controls to verify numerical fidelity of the frozen transform.
    worlds = transform(controls, [a["source_pixel_xy"] for a in all_anchors] + [p["pixel_xy"] for p in controls], executable)
    for anchor, world in zip(all_anchors, worlds):
        anchor["projected_xy_m"] = world
        anchor["lonlat"] = lonlat(world)
    max_residual = max(math.dist(world, mercator(p["lonlat"])) for world, p in zip(worlds[len(all_anchors):], controls))
    require(max_residual < 0.001, "TPS does not reproduce fitting controls within 1 mm projected")
    # Replay independent-of-controls sample predictions already recorded in PR #380.
    checks = read(ROOT / "reports/fletcher" / CHECKS[sheet][0])
    scores = read(ROOT / "reports/fletcher" / CHECKS[sheet][1])
    require(checks["fit_sha256"] == scores["fit_sha256"] == provenance["fit_sha256"], "Check fit mismatch")
    check_by_id = {p["id"]: p for p in checks["points"]}
    require(all(p["role"] == "check" for p in check_by_id.values()), "Invalid check role")
    predicted = transform(controls, [check_by_id[p["id"]]["pixel_xy"] for p in scores["points"]], executable)
    replay_difference = max(math.dist(world, mercator(p["predicted_lonlat"])) for world, p in zip(predicted, scores["points"]))
    require(replay_difference < 0.001, "Transform differs from PR #380 check predictions")
    for feature in features:
        anchors = feature["properties"]["label_anchors"]
        # Keep partial/outside records fail-closed; preserve available anchors individually.
        if all(a["lonlat"] is not None for a in anchors):
            feature["geometry"] = {"type": "MultiPoint", "coordinates": [a["lonlat"] for a in anchors]}
    return {
        "type": "FeatureCollection", "sheet": sheet, "provenance": provenance,
        "source_sha256": inventory["source_sha256"], "source_dimensions_px": inventory["source_dimensions_px"],
        "source_frame": {"origin": "full scan top-left", "axes": "x right, y down", "scale_to_fit_xy": [1, 1],
                         "offset_to_fit_xy": [0, 0], "rotation_degrees": 0,
                         "anchor_convention": "Continuous pixel-edge coordinates: xywh box centre (x+w/2,y+h/2), passed unchanged to native GCP TPS; no half-pixel shift.",
                         "resampled_raster_pixels_used": False},
        "method": "GDAL TPS in EPSG:3857, then inverse spherical Mercator to GeoJSON longitude/latitude (OGC:CRS84)",
        "gdal_version": subprocess.run([executable, "--version"], text=True, capture_output=True, check=True).stdout.strip(),
        "geographic_role": "Lettering box centres, not feature symbols, sites, boundaries or ownership. Feature placement remains deferred.",
        "accuracy": "Approximate PR #380 fits; working accuracy targets not uniformly satisfied. See full-sheets/README.md. No new geographic acceptance.",
        "credit": manifest["credit"], "manifest_url": manifest["manifest_url"],
        "imagery_licence_url": manifest["imagery_licence_url"],
        "verification": {"annotation_count": len(features), "box_count": sum(len(f["properties"]["label_anchors"]) for f in features),
                         "derived_anchor_count": len(all_anchors), "complete_geometry_count": sum(f["geometry"] is not None for f in features),
                         "max_control_residual_projected_m": max_residual, "frozen_check_count": len(predicted),
                         "max_frozen_check_difference_projected_m": replay_difference},
        "features": features,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", type=int, choices=SHEETS, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--gdaltransform", default=shutil.which("gdaltransform"))
    parser.add_argument("--source", type=Path)
    parser.add_argument("--packets", type=Path)
    args = parser.parse_args()
    require(bool(args.source) == bool(args.packets), "--source and --packets must be supplied together")
    require(args.gdaltransform, "gdaltransform is required")
    result = project(args.sheet, args.gdaltransform)
    if args.source:
        _, _, inventory, manifest, *_ = load_inputs(args.sheet)
        audit = audit_scan(args.source, args.packets, inventory, manifest)
        audit["fit_revision"] = REVISION
        audit["fit_sha256"] = result["provenance"]["fit_sha256"]
        write(args.out / f"sheet-{args.sheet}-frame-audit.json", audit)
    write(args.out / f"sheet-{args.sheet}-labels.geojson", result)
    print(json.dumps(result["verification"]))


if __name__ == "__main__":
    main()
