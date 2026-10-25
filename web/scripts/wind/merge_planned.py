"""Merge the reviewed wind-turbine extracts into the web map's two public GeoJSON files.

Usage, from web/:
  python3 -I scripts/wind/merge_planned.py public/wind/planned-turbines.geojson public/wind/installed-since-2018.geojson \
    scripts/wind/raw/strait-and-everwind.geojson scripts/wind/raw/province.geojson scripts/wind/raw/harbour-hills.geojson \
    scripts/wind/raw/built-since-2018.geojson
Positions whose `build_status` is "operating" go to the second (installed)
file and the rest to the first. Drops alternate, unclear and dropped sites
(they would double-count a layout or are no longer planned), keeps a fixed
property set, validates coordinates and ids, and sorts by project then turbine
so the files diff cleanly. Reads only the committed extracts: the Sentinel-2
checks are already written into them (`site_check`, see pad-check.txt).
"""
import json, re, sys

NOTICE = ('Wind turbine positions from tables in Nova Scotia environmental assessment filings: assessed layouts, subject to change, not as-built surveys. Some farms are under construction and one is still under review; an approval does not mean a farm will be built. Alternate and dropped sites, and turbines already operating, are left out.')
INSTALLED_NOTICE = ("Wind turbines built in Nova Scotia since 2018, which NRCan's database does not list yet. Positions are from tables in each farm's environmental assessment filing, not as-built surveys: some turbines were built up to about 130 m from the tabulated spot, and each point says how far the nearest cleared pad is in Sentinel-2 imagery.")
KEEP = ["id", "turbine", "project", "proponent", "county", "status", "status_date", "layout_role",
        "project_turbines", "project_capacity_mw", "tip_height_m", "hub_height_m", "rotor_diameter_m",
        "coords_as_published", "source", "source_url", "source_locator", "read_date"]
DROP_ROLE = re.compile(r"^(alternate|unclear|dropped)", re.I)
NS = {"west": -66.6, "south": 43.3, "east": -59.6, "north": 47.1}

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
def spoken(date):
    y, m, d = (int(x) for x in date.split("-"))
    return f"{d} {MONTHS[m - 1]} {y}"

PASSED = "; its two-year deadline to start work passed on {deadline} with no extension posted, and no turbine position had been cleared by 30 August 2026"
MERSEY_LAYOUT = "Assessed layout; a 2023 revision moved a few turbines and the revised positions are not published"
# Current state, plain: (status template using {date}, layout note or None[, status date]).
# A dict picks the entry by the position's `build_status` (None for the rest).
PROJECTS = {
    "Rhodena Wind Project": ("EA approved with conditions on {date}", None),
    "Aulds Cove Wind Project": ("EA approved with conditions on {date}", None),
    "Setapuktuk Wind Project (formerly EverWind Wind Farm 1)": ("EA approved with conditions on {date}", None),
    "Goose Harbour Lake Wind Farm": ("Under construction, with commissioning planned for late 2026; EA approved with conditions on {date}", "Positions from neighbouring projects' sound models (24 turbines as redesigned); 4 matched to turbine numbers"),
    "Upper Afton Wind Project": ("EA approved with conditions on {date}", "Primary site, one of 22 to be built from 28 assessed"),
    "Ocean Lake Wind Project (formerly EverWind Wind Farm 2)": ("EA approved with conditions on {date}", None),
    "Windy Ridge Wind Power Project": ("EA approved with conditions on {date}; site work began between October 2025 and April 2026, before the deadline to start work, and pads were cleared at 32 of these 49 positions by 30 August 2026",
                                       "Assessed layout of 49; EverWind has since cut two turbines, moved to 8 MW and kept turbines off the west side of the East Folly Mountain River (June 2025), and the revised positions are not published"),
    "Kmtnuk Wind Power Project": ("EA approved with conditions on {date}" + PASSED.format(deadline="21 December 2025"), "Assessed layout; EverWind now lists 16 turbines of up to 128 MW in all"),
    "Bear Lake Wind Power Project": ("EA approved with conditions on {date}" + PASSED.format(deadline="13 December 2025"),
                                     "Assessed layout of 15; an 11-turbine design was approved in April 2025 and its positions are not published, so at least 4 of these points will not be built"),
    "Eigg Mountain Wind Project": ("EA approved with conditions on {date}; construction not started", None),
    "Sugar Maple Wind Energy Project": ("EA approved with conditions on {date}; construction planned from 2027", None),
    "Weavers Mountain Wind Energy Project": ("Under construction, with turbines delivered from June 2026; EA approved with conditions on {date}", None),
    "Melvin Lake Wind Project": ("EA approved with conditions on {date}; not under construction, and work must start by 24 January 2027 unless extended", None),
    "Benjamins Mill Wind Project": {
        "operating": ("Operating since {date} (phase 1: 8 turbines, about 34 MW); EA approved with conditions on 13 February 2023", "EA position", "2025-12-16"),
        "under construction": ("Under construction as the 3-turbine Minas Highlands phase, with turbines delivered in September 2026; EA approved with conditions on {date}", "EA position"),
        None: ("Not built: later phases are being bid into the Green Choice Program; EA approved with conditions on {date}", "Assessed layout"),
    },
    "Mersey River Wind Farm": {
        "under construction": ("Under construction as phase 1 of 2, with first power planned for fall 2026; EA approved with conditions on {date}", MERSEY_LAYOUT),
        None: ("Phase 1 is under construction elsewhere on the site, with first power planned for fall 2026; EA approved with conditions on {date}", MERSEY_LAYOUT),
    },
    "Wedgeport Wind Farm Project": ("Under construction, with operation planned for late 2026; EA approved with conditions on {date}", "Assessed layout of 13, being built as 12: two positions were dropped and one turbine is at an untabulated site"),
    "Harbour Hills Wind Project": ("EA under review, not approved; registered {date}", None),
    "Higgins Mountain Wind Farm": ("In operation since {date}, by the proponent's account; EA approved with conditions on 4 May 2023", "EA model row {turbine}; site sign {site_label}", "2026-05-01"),
}
ROLE_NOTES = {"modelled": "Modelled site", "optional (not in sound/shadow models)": "Optional site, not in the sound and shadow models", "assessed": "Assessed layout", "primary": None, "under construction": None}

def natural(text):
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", str(text))]

planned_path, installed_path, *inputs = sys.argv[1:]
planned, installed, dropped, seen = [], [], [], set()
for path in inputs:
    for f in json.load(open(path, encoding="utf-8"))["features"]:
        p = f["properties"]
        role = str(p.get("layout_role") or "assessed")
        if DROP_ROLE.match(role):
            dropped.append((p["id"], role.split(" ")[0])); continue
        lon, lat = f["geometry"]["coordinates"][:2]
        assert f["geometry"]["type"] == "Point", p["id"]
        assert NS["west"] < lon < NS["east"] and NS["south"] < lat < NS["north"], (p["id"], lon, lat)
        assert p["id"] not in seen, ("duplicate id", p["id"]); seen.add(p["id"])
        for field in ("project", "status", "source", "source_url", "coords_as_published", "status_date"):
            assert isinstance(p.get(field), str) and p[field].strip(), (p["id"], field)
        assert p["source_url"].startswith("https://"), (p["id"], p["source_url"])
        props = {k: p.get(k) for k in KEEP}
        entry = PROJECTS[p["project"]]
        if isinstance(entry, dict):
            entry = entry.get(p.get("build_status"), entry[None])
        status, layout, *date = entry
        props["status_date"] = date[0] if date else p["status_date"]
        props["status"] = status.format(date=spoken(props["status_date"]))
        layout = (layout or ROLE_NOTES.get(role) or "Assessed layout").format_map(p)
        props["layout_role"] = f"{layout}; {p['site_check']} (Sentinel-2)" if p.get("site_check") else layout
        if str(p["turbine"]).startswith("unlabelled"):
            props["turbine"] = None
        (installed if p.get("build_status") == "operating" else planned).append(
            {"type": "Feature", "id": p["id"], "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, "properties": props})

def write(path, label, notice, features):
    features.sort(key=lambda f: (f["properties"]["project"], natural(f["properties"]["turbine"] or f["id"])))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write('{\n  "type": "FeatureCollection",\n')
        fh.write(f'  "label": {json.dumps(label)},\n  "notice": {json.dumps(notice)},\n  "features": [\n')
        fh.write(",\n".join("    " + json.dumps(f, ensure_ascii=False, separators=(", ", ": ")) for f in features))
        fh.write("\n  ]\n}\n")
    projects = {}
    for f in features: projects[f["properties"]["project"]] = projects.get(f["properties"]["project"], 0) + 1
    print(path, len(features), "turbines from", len(projects), "projects")
    for name, count in sorted(projects.items()): print(f"  {count:4d}  {name}")

write(planned_path, "Planned wind turbines in Nova Scotia (EA filings)", NOTICE, planned)
write(installed_path, "Wind turbines built in Nova Scotia since 2018 (EA filings)", INSTALLED_NOTICE, installed)
print(len(dropped), "dropped:", dropped)
