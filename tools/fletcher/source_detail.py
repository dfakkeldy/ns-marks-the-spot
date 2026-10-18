"""Compare same-coordinate scan crops against independently fetched native probes.

A diagnostic, not proof of archival quality or georeferencing accuracy. Variance
ratios require the same source content, alignment and colour treatment. Blank
probes cannot certify detail. NumPy and OpenCV are optional experiment packages.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def compare_detail(candidate, native, ratio_limit=4.0):
    import cv2
    import numpy as np

    if candidate.shape != native.shape:
        raise ValueError("probe dimensions differ")
    candidate_energy = float(cv2.Laplacian(candidate, cv2.CV_64F).var())
    native_energy = float(cv2.Laplacian(native, cv2.CV_64F).var())
    ratio = native_energy / max(candidate_energy, 1e-9)
    status = (
        "inconclusive"
        if native_energy < 5
        else "detail-loss"
        if ratio > ratio_limit
        else "consistent-detail"
    )
    return {
        "status": status,
        "candidate_laplacian_variance": candidate_energy,
        "native_laplacian_variance": native_energy,
        "native_to_candidate_ratio": ratio,
        "mean_absolute_difference": float(
            np.abs(candidate.astype(float) - native).mean()
        ),
    }


def audit(source_path, manifest_path, probes_dir):
    import cv2

    source = cv2.imread(str(source_path), cv2.IMREAD_GRAYSCALE)
    if source is None:
        raise ValueError("cannot decode source")
    manifest = json.loads(Path(manifest_path).read_text())
    rows = []
    for crop in manifest["crops"]:
        x, y, x2, y2 = crop["box"]
        path = Path(probes_dir) / f"native-{crop['id']}.jpg"
        native = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if native is None:
            raise ValueError("cannot decode native probe")
        rows.append(
            {
                "id": crop["id"],
                "probe_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                **compare_detail(source[y:y2, x:x2], native),
            }
        )
    return {
        "source_sha256": hashlib.sha256(Path(source_path).read_bytes()).hexdigest(),
        "source_dimensions": [source.shape[1], source.shape[0]],
        "manifest_sha256": hashlib.sha256(Path(manifest_path).read_bytes()).hexdigest(),
        "ratio_limit": 4.0,
        "rows": rows,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source")
    p.add_argument("manifest")
    p.add_argument("probes")
    p.add_argument("output")
    a = p.parse_args()
    result = audit(a.source, a.manifest, a.probes)
    with Path(a.output).open("x") as f:
        json.dump(result, f, indent=2)
        f.write("\n")
    print(
        {
            s: sum(r["status"] == s for r in result["rows"])
            for s in ("detail-loss", "consistent-detail", "inconclusive")
        }
    )


if __name__ == "__main__":
    main()
