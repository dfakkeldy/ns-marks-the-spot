"""Source-only Fletcher line extraction feasibility experiment.

This is colour-aware ink extraction, NOT a trained semantic water classifier.
Long roads, coordinate rules and connected lettering can survive the filter.
No modern coordinates, gold controls or production map writes are accepted.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

CONFIG = {
    "background_radius": 9,
    "red_contrast": 28,
    "green_contrast": 20,
    "maximum_red_excess": 65,
    "maximum_relative_red": 0.52,
    "minimum_area": 80,
    "minimum_span": 100,
    "join_radius": 1,
    "point_tolerance": 3,
    "shore_minimum_red": 190,
    "shore_minimum_green": 180,
    "shore_cleanup_radius": 5,
    "shore_minimum_hole_area": 1000,
}


def extract(rgb, config=None):
    import cv2
    import numpy as np

    cfg = CONFIG if config is None else config
    if rgb.ndim != 3 or rgb.shape[2] != 3:
        raise ValueError("expected RGB image")
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (2 * cfg["background_radius"] + 1,) * 2
    )
    rgb16 = rgb.astype(np.int16)
    background = cv2.morphologyEx(rgb, cv2.MORPH_CLOSE, kernel).astype(np.int16)
    contrast = background - rgb16
    ink = (
        (contrast[:, :, 0] >= cfg["red_contrast"])
        & (contrast[:, :, 1] >= cfg["green_contrast"])
        & (rgb16[:, :, 0] - rgb16[:, :, 1] <= cfg["maximum_red_excess"])
        & (rgb16[:, :, 0] <= cfg["maximum_relative_red"] * background[:, :, 0])
    ).astype(np.uint8)
    radius = cfg["join_radius"]
    joined = cv2.morphologyEx(
        ink, cv2.MORPH_CLOSE, np.ones((2 * radius + 1,) * 2, np.uint8)
    )
    n, labels, stats, _ = cv2.connectedComponentsWithStats(joined, 8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        keep[i] = (
            stats[i, cv2.CC_STAT_AREA] >= cfg["minimum_area"]
            and max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT])
            >= cfg["minimum_span"]
        )
    return {
        "mask": keep[labels].astype(np.uint8),
        "ink": ink,
        "component_count": int(keep.sum()),
    }


def shore_mask(rgb, config=None):
    """Sea-paper edge for preselected coastal crops; not inland water detection."""
    import cv2
    import numpy as np

    cfg = CONFIG if config is None else config
    paper = (
        (rgb[:, :, 0] >= cfg["shore_minimum_red"])
        & (rgb[:, :, 1] >= cfg["shore_minimum_green"])
    ).astype(np.uint8)
    r = cfg["shore_cleanup_radius"]
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1,) * 2)
    paper = cv2.morphologyEx(paper, cv2.MORPH_OPEN, kernel)
    paper = cv2.morphologyEx(paper, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(paper, 8)
    if n < 2:
        return np.zeros(paper.shape, np.uint8)
    region = (labels == (1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    n_h, holes, hstats, _ = cv2.connectedComponentsWithStats(1 - region, 8)
    for i in range(1, n_h):
        if hstats[i, cv2.CC_STAT_AREA] < cfg["shore_minimum_hole_area"]:
            region[holes == i] = 1
    edge = cv2.morphologyEx(region, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    edge[: r + 1] = 0
    edge[-r - 1 :] = 0
    edge[:, : r + 1] = 0
    edge[:, -r - 1 :] = 0
    return edge


def point_support(mask, points, tolerance=3):
    import cv2
    import numpy as np

    if not points:
        return None
    distance = cv2.distanceTransform(1 - mask.astype(np.uint8), cv2.DIST_L2, 5)
    supported = []
    for x, y in points:
        x, y = round(x), round(y)
        if not (0 <= x < mask.shape[1] and 0 <= y < mask.shape[0]):
            raise ValueError("annotation outside crop")
        supported.append(distance[y, x] <= tolerance)
    return float(np.mean(supported))


def run(manifest_path, image_dir, output, split, annotations_path=None):
    import cv2
    import numpy as np

    manifest = json.loads(Path(manifest_path).read_text())
    annotations = (
        json.loads(Path(annotations_path).read_text()) if annotations_path else {}
    )
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    rows = []
    for crop in manifest["crops"]:
        if split != "all" and crop["split"] != split:
            continue
        name = crop["id"]
        path = Path(image_dir) / f"native-{name}.jpg"
        bgr = cv2.imread(str(path))
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        result = extract(rgb)
        mask = result["mask"]
        if crop["stratum"] == "coastal":
            mask = shore_mask(rgb)
        cv2.imwrite(str(output / f"{name}-mask.png"), mask * 255)
        overlay = rgb.copy()
        overlay[mask > 0] = (
            0.3 * rgb[mask > 0] + 0.7 * np.array([0, 220, 255])
        ).astype(np.uint8)
        cv2.imwrite(
            str(output / f"{name}-overlay.png"),
            cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR),
        )
        row = {
            "id": name,
            "split": crop["split"],
            "stratum": crop["stratum"],
            "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "mask_sha256": hashlib.sha256(mask.tobytes()).hexdigest(),
            "candidate_fraction": float(mask.mean()),
            "component_count": int(cv2.connectedComponents(mask, 8)[0] - 1),
        }
        if name in annotations:
            for label, points in annotations[name]["points"].items():
                row[label + "_n"] = len(points)
                row[label + "_support"] = point_support(
                    mask, points, CONFIG["point_tolerance"]
                )
        rows.append(row)
    receipt = {
        "config": CONFIG,
        "interpretation": "line-candidates-not-semantic-water",
        "manifest_sha256": hashlib.sha256(Path(manifest_path).read_bytes()).hexdigest(),
        "annotations_sha256": hashlib.sha256(
            Path(annotations_path).read_bytes()
        ).hexdigest()
        if annotations_path
        else None,
        "rows": rows,
    }
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("manifest")
    p.add_argument("image_dir")
    p.add_argument("output")
    p.add_argument(
        "--split", choices=["development", "evaluation", "all"], default="development"
    )
    p.add_argument("--annotations")
    a = p.parse_args()
    run(a.manifest, a.image_dir, a.output, a.split, a.annotations)


if __name__ == "__main__":
    main()
