"""Mine candidate ground-control features from NSTDB GeoJSON extracts.

This module only PROPOSES locations for a human (or a later, more careful
step) to look at - it decides nothing about identity, provenance, or whether
a location actually belongs on a georeferenced sheet. Two families of
candidate are mined:

- `road_intersections`: a point where two or more distinctly-named roads meet
  end-to-end. Roads split into several digitized segments are common in NSTDB
  extracts, so a segment continuing under the SAME name at a shared endpoint
  is deliberately not a candidate - only a genuine junction of different
  named roads is.
- `water_junctions`: a point where one feature's endpoint coincides with any
  vertex - endpoint or mid-line - of a DIFFERENT feature. This covers both
  confluences (a tributary's endpoint meeting a river's bank mid-course) and
  mouths/endpoint-to-endpoint meetings. Water linework rarely carries a
  usable name, so every water feature is identified by its OBJECTID (or, if
  that is absent, its index in the input) rather than any name field.

Both miners key vertices by coordinates rounded to 7 decimal degrees (about
1 cm at this latitude) so that floating-point noise in the source extract
does not stop two genuinely coincident vertices from matching.

    python3 -m tools.fletcher.feature_candidates \
        --roads roads.geojson --water water.geojson --out candidates.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import pathlib

from tools.church.geometry import lonlat_to_mercator, mercator_to_ground_metres

ROAD_ROAD_INTERSECTION = "road-road-intersection"
WATER_JUNCTION = "water-junction"

Point = tuple[float, float]


def _feature_name(properties: dict, index: int, name_field: str | None) -> str:
    """A feature's identifying name, or a stable fallback.

    `name_field` is `None` for water linework, which is identified purely by
    OBJECTID (or index) since its `properties` rarely carry a usable name.
    """
    if name_field:
        raw = properties.get(name_field)
        if raw not in (None, ""):
            return str(raw)
    return f"obj-{properties.get('OBJECTID', index)}"


def _parts(geometry: dict) -> list[list[list[float]]]:
    """A geometry's linework as a list of vertex-lists.

    A `LineString` is one part; a `MultiLineString` is however many parts it
    declares. Anything else (a `Point`, a missing geometry) contributes none -
    this module mines linework only.
    """
    geometry = geometry or {}
    geom_type = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    if geom_type == "LineString":
        return [coordinates]
    if geom_type == "MultiLineString":
        return list(coordinates)
    return []


def _round_point(coord: list[float]) -> Point:
    return (round(float(coord[0]), 7), round(float(coord[1]), 7))


def road_intersections(geojson: dict, name_field: str = "STREET") -> list[dict]:
    """Endpoints shared by two or more distinctly-named road features.

    Only first/last vertices of each `LineString` or `MultiLineString` part
    are considered - a road merely passing through another's mid-course is
    not a road-road intersection (NSTDB roads are not generally noded at
    grade-separated crossings, so a mid-vertex coincidence there would be
    spurious). Same-name endpoints - a road continuing across a segment
    boundary - contribute only one name, so they never qualify: qualifying
    requires at least two DISTINCT names sharing the endpoint.
    """
    names_at: dict[Point, set[str]] = {}
    order: list[Point] = []

    for index, feature in enumerate(geojson.get("features", [])):
        properties = feature.get("properties") or {}
        name = _feature_name(properties, index, name_field)
        for part in _parts(feature.get("geometry") or {}):
            if len(part) < 2:
                continue
            for coord in (part[0], part[-1]):
                key = _round_point(coord)
                if key not in names_at:
                    names_at[key] = set()
                    order.append(key)
                names_at[key].add(name)

    candidates = []
    for key in order:
        names = names_at[key]
        if len(names) >= 2:
            lon, lat = key
            candidates.append({
                "kind": ROAD_ROAD_INTERSECTION,
                "lon": lon,
                "lat": lat,
                "names": sorted(names),
            })
    return candidates


def water_junctions(geojson: dict) -> list[dict]:
    """Endpoints of one water feature coinciding with any vertex of another.

    "Any vertex" (not just an endpoint) on the OTHER feature is what lets
    this catch a tributary running into the middle of a river's digitized
    course, as well as an ordinary endpoint-to-endpoint meeting. A vertex
    revisited only by its OWN feature (a closed ring's first/last vertex,
    say) never qualifies - qualifying requires a DIFFERENT feature's vertex
    at the same point, and at least one of the features touching that point
    must be there via an endpoint.
    """
    owners_at: dict[Point, set[int]] = {}
    endpoint_owners_at: dict[Point, set[int]] = {}
    order: list[Point] = []
    name_of: dict[int, str] = {}

    for index, feature in enumerate(geojson.get("features", [])):
        properties = feature.get("properties") or {}
        name_of[index] = _feature_name(properties, index, None)
        for part in _parts(feature.get("geometry") or {}):
            if len(part) < 2:
                continue
            for coord in part:
                key = _round_point(coord)
                if key not in owners_at:
                    owners_at[key] = set()
                    order.append(key)
                owners_at[key].add(index)
            for coord in (part[0], part[-1]):
                key = _round_point(coord)
                endpoint_owners_at.setdefault(key, set()).add(index)

    candidates = []
    for key in order:
        owners = owners_at[key]
        if len(owners) >= 2 and endpoint_owners_at.get(key):
            lon, lat = key
            names = sorted(name_of[owner] for owner in owners)
            candidates.append({
                "kind": WATER_JUNCTION,
                "lon": lon,
                "lat": lat,
                "names": names,
            })
    return candidates


def dedupe(candidates: list[dict], min_separation_m: float = 150.0) -> list[dict]:
    """Greedily keep candidates that are not too close to one already kept.

    Kept in list order (keep-first): a candidate is dropped only if some
    already-kept candidate lies within `min_separation_m` GROUND metres, using
    `mercator_to_ground_metres` at the candidate's own latitude to undo Web
    Mercator's latitude-dependent scale distortion.
    """
    kept: list[dict] = []
    kept_mercator: list[Point] = []

    for candidate in candidates:
        lon = candidate["lon"]
        lat = candidate["lat"]
        x, y = lonlat_to_mercator(lon, lat)
        far_enough = True
        for kx, ky in kept_mercator:
            mercator_distance = math.hypot(x - kx, y - ky)
            ground_distance = mercator_to_ground_metres(mercator_distance, lat)
            if ground_distance < min_separation_m:
                far_enough = False
                break
        if far_enough:
            kept.append(candidate)
            kept_mercator.append((x, y))

    return kept


def write_csv(candidates: list[dict], path: pathlib.Path) -> None:
    """Write candidates as `id,kind,lon,lat,names`, ids `cand-0001` in order."""
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "kind", "lon", "lat", "names"])
        for position, candidate in enumerate(candidates, start=1):
            writer.writerow([
                f"cand-{position:04d}",
                candidate["kind"],
                candidate["lon"],
                candidate["lat"],
                "|".join(candidate["names"]),
            ])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Mine candidate ground-control features from NSTDB GeoJSON extracts."
    )
    parser.add_argument("--roads", type=pathlib.Path, help="NSTDB roads GeoJSON extract")
    parser.add_argument("--water", type=pathlib.Path, help="NSTDB water GeoJSON extract")
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument(
        "--name-field",
        default="STREET",
        help="properties field carrying a road's name (default: STREET)",
    )
    args = parser.parse_args(argv)

    if not args.roads and not args.water:
        parser.error("at least one of --roads or --water is required")

    candidates: list[dict] = []
    if args.roads:
        roads_geojson = json.loads(args.roads.read_text(encoding="utf-8"))
        candidates += road_intersections(roads_geojson, name_field=args.name_field)
    if args.water:
        water_geojson = json.loads(args.water.read_text(encoding="utf-8"))
        candidates += water_junctions(water_geojson)

    raw_count = len(candidates)
    deduped = dedupe(candidates)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    write_csv(deduped, args.out)

    print(f"{raw_count} raw candidates -> {len(deduped)} after dedupe")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
