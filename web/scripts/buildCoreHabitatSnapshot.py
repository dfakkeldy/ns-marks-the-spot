#!/usr/bin/env python3
"""Build the public, display-only Nova Scotia core-habitat polygon snapshot.

Requires GDAL's ogr2ogr. Run from the repository root:
  python3 web/scripts/buildCoreHabitatSnapshot.py /path/to/NS_CoreHabitat.zip

The input is GeoNOVA GDD entry 153's original ZIP, including its FileGDB.
The script deliberately excludes the point layer and never reconstructs the
location-sensitive habitats the province withheld from the public package.
"""

import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public/ecology/ns-core-habitat.geojson"
EXPECTED_SOURCE_SHA256 = "d0998a355e1f8658c1bf572f65723e809ec4577595e0ee051b73c0f59444b878"
SOURCE_URL = "https://nsgi.novascotia.ca/gdd/"  # entry 153; download token can change
FIELDS = "OBJECTID,SciName,CommName,Population,Sub_Species,Taxon,Year,Source,RDoc,Status,Ha"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def polygons_only(geometry):
    """GDAL may emit a line fragment from one unusually complex polygon."""
    if geometry["type"] != "GeometryCollection":
        if geometry["type"] not in ("Polygon", "MultiPolygon"):
            raise ValueError(f"Unexpected source geometry: {geometry['type']}")
        return geometry
    polygons = []
    for part in geometry["geometries"]:
        if part["type"] == "Polygon":
            polygons.append(part["coordinates"])
        elif part["type"] == "MultiPolygon":
            polygons.extend(part["coordinates"])
    if not polygons:
        raise ValueError("Simplified geometry lost all polygon parts")
    return {"type": "MultiPolygon", "coordinates": polygons}


def main(source_zip: Path) -> None:
    if sha256(source_zip) != EXPECTED_SOURCE_SHA256:
        raise ValueError("Source ZIP SHA-256 differs from the audited 2026-01-30 package")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        with zipfile.ZipFile(source_zip) as archive:
            archive.extractall(root)
        geodatabases = list(root.rglob("NS_CoreHabitat.gdb"))
        if len(geodatabases) != 1:
            raise ValueError("Expected one NS_CoreHabitat.gdb in the source archive")
        intermediate = root / "converted.geojson"
        subprocess.run([
            "ogr2ogr", "-f", "GeoJSON", str(intermediate), str(geodatabases[0]),
            "-sql", f"SELECT {FIELDS} FROM NS_CoreHabitat_Poly",
            "-simplify", "20",  # metres, while geometry is still in source UTM 20
            "-dim", "XY", "-t_srs", "EPSG:4326",
            "-lco", "RFC7946=YES", "-lco", "COORDINATE_PRECISION=6",
        ], check=True)
        converted = json.loads(intermediate.read_text())
    features = converted["features"]
    if len(features) != 3660:
        raise ValueError(f"Expected 3,660 public polygons, found {len(features)}")
    ids = set()
    for feature in features:
        properties = feature["properties"]
        oid = properties["OBJECTID"]
        if oid in ids:
            raise ValueError(f"Duplicate source OBJECTID {oid}")
        ids.add(oid)
        if properties["Status"] != "Identified":
            raise ValueError(f"Unexpected core-habitat status for OBJECTID {oid}")
        feature["geometry"] = polygons_only(feature["geometry"])
    result = {
        "type": "FeatureCollection",
        "name": "NS_CoreHabitat_Poly",
        "source": SOURCE_URL,
        "sourcePublished": "2026-01-30",
        "sourceArchiveSHA256": EXPECTED_SOURCE_SHA256,
        "displaySimplificationMetres": 20,
        "notice": "Reproduced and distributed with the permission of the Department of Service Nova Scotia.",
        "disclaimer": "SNS MAKES NO REPRESENTATION AND GIVES NO WARRANTY OF ANY KIND WITH RESPECT TO THE ACCURACY, USEFULNESS, NOVELTY, VALIDITY, SCOPE, COMPLETENESS OR CURRENCY OF THE SNS DIGITAL DATA AND EXPRESSLY DISCLAIMS ANY IMPLIED WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE OF THE SNS DIGITAL DATA.",
        "features": features,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(features)} polygons; {OUT.stat().st_size} bytes; SHA-256 {sha256(OUT)}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: buildCoreHabitatSnapshot.py <GeoNOVA GDD entry 153 ZIP>")
    main(Path(sys.argv[1]))
