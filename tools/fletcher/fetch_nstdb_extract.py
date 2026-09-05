"""Fetch an NSTDB layer for one bounding box as a GeoJSON extract.

`feature_candidates.py` mines control-point proposals from NSTDB GeoJSON but
does not fetch it, so extracts had to be produced by hand. This does that
fetch, in the one shape the miner reads.

Paging is not optional. The province's MapServer caps a response at
`maxRecordCount` (2000 today) and signals truncation with
`exceededTransferLimit`; a single unpaged query over a Fletcher sheet's bbox
silently returns a prefix of the roads in it. Trusting that prefix would mine
candidates from part of the sheet and report a clean run.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import time
import urllib.parse
import urllib.request

BASE = "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE"

SERVICES = {
    "roads": (f"{BASE}/BASE_NSTDB_10k_Roads_UT83/MapServer", 8),
    "water": (f"{BASE}/BASE_NSTDB_10k_Water_WM84/MapServer", 4),
}
"""Layer numbers are the ones the Sheet 19 observation actually cited: roads
layer 8 (`Roads`) and water layer 4 (`Wet Features`)."""

PAGE = 1000
"""Below the server's 2000 cap on purpose — a page that exactly equals the cap
cannot be told apart from a page the server truncated."""


def _get(url: str, params: dict, retries: int = 3) -> dict:
    query = urllib.parse.urlencode(params)
    last: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(f"{url}?{query}", timeout=120) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001 - retried, then surfaced
            last = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"request failed after {retries} attempts: {last}")


def fetch(layer_url: str, bbox: str, getter=_get) -> dict:
    """Page through `layer_url` and return one GeoJSON FeatureCollection."""
    common = {
        "geometry": bbox,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": "true",
        "f": "geojson",
    }
    features: list[dict] = []
    offset = 0
    while True:
        page = getter(
            f"{layer_url}/query",
            {**common, "resultOffset": str(offset), "resultRecordCount": str(PAGE)},
        )
        if not isinstance(page, dict):
            raise RuntimeError(f"invalid page at offset {offset}: expected an object")  # noqa: TRY004 - remote response, not a caller argument
        if "error" in page:
            raise RuntimeError(f"source error at offset {offset}: {page['error']}")
        batch = page.get("features")
        if not isinstance(batch, list):
            raise RuntimeError(f"invalid page at offset {offset}: missing features list")  # noqa: TRY004 - remote response, not a caller argument
        if not batch and page.get("exceededTransferLimit"):
            raise RuntimeError(f"empty page still marked truncated at offset {offset}")
        features.extend(batch)
        # Stop on the server's own truncation flag where present, and fall back
        # to a short page. Using only the short page would loop forever against
        # a server that pads, and using only the flag would stop early against
        # one that omits it.
        if not page.get("exceededTransferLimit") and len(batch) < PAGE:
            break
        offset += len(batch)
    return {"type": "FeatureCollection", "features": features}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--service", choices=sorted(SERVICES), required=True)
    parser.add_argument(
        "--bbox",
        required=True,
        help="lon_min,lat_min,lon_max,lat_max in WGS84",
    )
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    service_url, layer = SERVICES[args.service]
    collection = fetch(f"{service_url}/{layer}", args.bbox)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(collection), encoding="utf-8")
    print(f"{args.service} layer {layer}: {len(collection['features'])} features -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
