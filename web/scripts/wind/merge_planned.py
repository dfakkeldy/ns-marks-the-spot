"""Merge the reviewed planned-turbine extracts into the web map's public GeoJSON.

Usage, from web/:
  python3 -I scripts/wind/merge_planned.py public/wind/planned-turbines.geojson \
    scripts/wind/raw/strait-and-everwind.geojson scripts/wind/raw/province.geojson scripts/wind/raw/harbour-hills.geojson
Drops alternate and unclear sites (they would double-count a layout), keeps a
fixed property set, validates coordinates and ids, and sorts by project then
turbine so the file diffs cleanly.
"""
import json, re, sys

NOTICE = ('Wind turbine positions from tables in Nova Scotia environmental assessment filings: assessed layouts, subject to change, not as-built surveys. Some farms are under construction and one is still under review; an approval does not mean a farm will be built. Alternate sites are left out.')
KEEP = ["id", "turbine", "project", "proponent", "county", "status", "status_date", "layout_role",
        "project_turbines", "project_capacity_mw", "tip_height_m", "hub_height_m", "rotor_diameter_m",
        "coords_as_published", "source", "source_url", "source_locator", "read_date"]
DROP_ROLE = re.compile(r"^(alternate|unclear)", re.I)
NS = {"west": -66.6, "south": 43.3, "east": -59.6, "north": 47.1}

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
def spoken(date):
    y, m, d = (int(x) for x in date.split("-"))
    return f"{d} {MONTHS[m - 1]} {y}"

PASSED = "; its two-year deadline to start work has passed with no extension posted"
# Current state, plain: (status template using {date}, layout note or None).
PROJECTS = {
    "Rhodena Wind Project": ("EA approved with conditions on {date}", None),
    "Aulds Cove Wind Project": ("EA approved with conditions on {date}", None),
    "Setapuktuk Wind Project (formerly EverWind Wind Farm 1)": ("EA approved with conditions on {date}", None),
    "Goose Harbour Lake Wind Farm": ("Under construction; EA approved with conditions on {date}", "Positions from neighbouring projects' sound models (24 turbines as redesigned); 4 matched to turbine numbers"),
    "Upper Afton Wind Project": ("EA approved with conditions on {date}", "Primary site, one of 22 to be built from 28 assessed"),
    "Ocean Lake Wind Project (formerly EverWind Wind Farm 2)": ("EA approved with conditions on {date}", None),
    "Windy Ridge Wind Power Project": ("EA approved with conditions on {date}" + PASSED, None),
    "Kmtnuk Wind Power Project": ("EA approved with conditions on {date}" + PASSED, None),
    "Bear Lake Wind Power Project": ("EA approved with conditions on {date}" + PASSED, None),
    "Eigg Mountain Wind Project": ("EA approved with conditions on {date}; construction not started", None),
    "Sugar Maple Wind Energy Project": ("EA approved with conditions on {date}; construction planned from 2027", None),
    "Weavers Mountain Wind Energy Project": ("Under construction; EA approved with conditions on {date}", None),
    "Melvin Lake Wind Project": ("EA approved with conditions on {date}; not under construction, and work must start by 24 January 2027 unless extended", None),
    "Benjamins Mill Wind Project": ("Partly built: 8 turbines operating since December 2025 and 3 under construction; EA approved with conditions on {date}", "Assessed layout; which of these positions are built is not published"),
    "Mersey River Wind Farm": ("Under construction; EA approved with conditions on {date}", "Assessed layout; a 2023 revision moved a few turbines and the revised positions are not published"),
    "Wedgeport Wind Farm Project": ("Under construction; EA approved with conditions on {date}", "Assessed layout of 13 positions; being built as 12 turbines"),
    "Harbour Hills Wind Project": ("EA under review, not approved; registered {date}", None),
}
ROLE_NOTES = {"modelled": "Modelled site", "optional (not in sound/shadow models)": "Optional site, not in the sound and shadow models", "assessed": "Assessed layout", "primary": None, "under construction": None}

def natural(text):
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", str(text))]

out_path, *inputs = sys.argv[1:]
features, dropped, seen = [], [], set()
for path in inputs:
    for f in json.load(open(path, encoding="utf-8"))["features"]:
        p = f["properties"]
        role = str(p.get("layout_role") or "assessed")
        if DROP_ROLE.match(role):
            dropped.append((p["id"], role)); continue
        lon, lat = f["geometry"]["coordinates"][:2]
        assert f["geometry"]["type"] == "Point", p["id"]
        assert NS["west"] < lon < NS["east"] and NS["south"] < lat < NS["north"], (p["id"], lon, lat)
        assert p["id"] not in seen, ("duplicate id", p["id"]); seen.add(p["id"])
        for field in ("project", "status", "source", "source_url", "coords_as_published", "status_date"):
            assert isinstance(p.get(field), str) and p[field].strip(), (p["id"], field)
        assert p["source_url"].startswith("https://"), (p["id"], p["source_url"])
        props = {k: p.get(k) for k in KEEP}
        status, layout = PROJECTS[p["project"]]
        props["status"] = status.format(date=spoken(p["status_date"]))
        props["layout_role"] = layout or ROLE_NOTES.get(role) or "Assessed layout"
        if str(p["turbine"]).startswith("unlabelled"):
            props["turbine"] = None
        features.append({"type": "Feature", "id": p["id"],
                         "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                         "properties": props})
features.sort(key=lambda f: (f["properties"]["project"], natural(f["properties"]["turbine"] or f["id"])))
collection = {"type": "FeatureCollection", "label": "Planned wind turbines in Nova Scotia (EA filings)",
              "notice": NOTICE, "features": features}
with open(out_path, "w", encoding="utf-8") as fh:
    fh.write('{\n  "type": "FeatureCollection",\n')
    fh.write(f'  "label": {json.dumps(collection["label"])},\n  "notice": {json.dumps(NOTICE)},\n  "features": [\n')
    fh.write(",\n".join("    " + json.dumps(f, ensure_ascii=False, separators=(", ", ": ")) for f in features))
    fh.write("\n  ]\n}\n")
projects = {}
for f in features: projects[f["properties"]["project"]] = projects.get(f["properties"]["project"], 0) + 1
print(len(features), "turbines kept;", len(dropped), "dropped:", dropped)
for name, count in sorted(projects.items()): print(f"  {count:4d}  {name}")
