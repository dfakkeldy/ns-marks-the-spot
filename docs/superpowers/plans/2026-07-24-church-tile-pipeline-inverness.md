# Church Tile Pipeline (Inverness) + Annapolis Acquisition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable A.F. Church georeference-and-tile pipeline, prove it end-to-end on Inverness County (free via Rumsey), and draft the Library and Archives Canada enquiry that unblocks the Annapolis sheet.

**Architecture:** A pure-stdlib Python core (`tools/church/`) handles county metadata, Web Mercator geometry, GCP parsing, and accuracy measurement; thin subprocess wrappers drive the GDAL CLI for warping and tiling. Generated tiles are gitignored and shipped as GitHub Release assets. The Inverness layer registers in both the web and iOS catalogs using the existing Fletcher "rumsey-reference / rights-pending" disable mechanism, flipping to available only once the deploy step serves unpacked tiles.

**Tech Stack:** Python 3 (stdlib only — no numpy, no pytest), `unittest`, GDAL 3.9.0 CLI (`gdal_translate`, `gdalwarp`, `gdaltransform`, `gdal2tiles.py`), TypeScript + Vitest (web), Swift + XCTest (iOS).

## Global Constraints

- **Python: stdlib only.** No numpy, no pytest. Tests use `unittest`, matching `.github/scripts/tests/` and `marketing/handouts/test_generate_tax_sale_handout.py`.
- **Python tests run:** `python3 -m unittest discover -s tools/church/tests -t . -v` from the repo root.
- **Warp method is thin-plate spline** (`gdalwarp -tps`), never the 4-corner affine in `docs/FLETCHER_GEOREFERENCING.md`. Church county maps are compiled, not survey-grid, maps.
- **Never report TPS residuals at control points as accuracy.** TPS interpolates controls exactly (error ≈ 0). Accuracy comes only from held-out `role=check` points.
- **Ground distance ≠ EPSG:3857 distance.** Always convert with `× cos(latitude)`. At Inverness (~46°N) the uncorrected figure overstates by ~44%.
- **Tiles are gitignored.** Never commit generated tiles; ship as GitHub Release assets.
- **Web tests run:** `npm test` from `web/`. **Lint:** `npm run lint` from `web/`.
- **Rumsey attribution string, verbatim:** `David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries`
- **Rumsey licence URL, verbatim:** `https://www.davidrumsey.com/about/copyright-and-permissions`
- **Rumsey IIIF host is `www.davidrumsey.com/luna/servlet/iiif/`.** `iiif.davidrumsey.com` is NXDOMAIN. Profile is `level1`.
- **Inverness facts (verified 2026-07-24):** Rumsey ID `RUMSEY~8~1~353591~90120835`; 34,427 × 34,543 px; published **1884** (the Rumsey `Date` field says 1864 — that is the survey/copyright date, not publication); scale 1:63,360.
- **Conventional Commits** for every commit message.
- **Branch:** feature branch → PR into `nightly`. Never target `main`.

---

### Task 1: LAC enquiry document

Independent of all other tasks and the long pole on Annapolis — do it first so it can be sent while the pipeline is built.

**Files:**
- Create: `docs/annapolis-church-lac-enquiry.md`

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by later tasks (standalone document)

- [ ] **Step 1: Write the enquiry document**

Create `docs/annapolis-church-lac-enquiry.md`:

```markdown
# Enquiry: A.F. Church Annapolis County map (1876) — Library and Archives Canada

**Status:** Draft, ready to send. **Not yet sent.**
**Send to:** reproduction@bac-lac.gc.ca (Reprography), 613-996-5115 / 1-866-578-7777
**Order form:** https://reproduction.bac-lac.gc.ca/eng — "Art, maps or photographs (digital copies)"
**Record:** LAC Collection Search IdNumber **4000751** — "Topographical township map of
Annapolis County, Nova Scotia [cartographic material] / from actual surveys made, drawn
and engraved by and under the direction of A.F. Church"

## Why LAC rather than NS Archives or DNR

Verified 2026-07-24: no free full-resolution scan of this sheet exists. NS Archives holds
only a corner fragment (1786 x 2661 px) under Crown copyright; DNR/NRR sells paper
reproductions only ($19.35/county, two ~36" x 60" sheets). LAC is the preferred source
because its holding may carry expired copyright, which would avoid the Nova Scotia Crown
copyright restriction entirely.

## Draft message

> Subject: Reproduction and permissions enquiry — A.F. Church Annapolis County map, IdNumber 4000751
>
> Hello,
>
> I am seeking a high-resolution digital reproduction of the following item from your
> collection:
>
> Title: Topographical township map of Annapolis County, Nova Scotia
> Creator: A.F. Church
> Date: 1876
> LAC Collection Search IdNumber: 4000751
>
> I am the developer of "NS Marks The Spot", a free, open-source (MIT-licensed),
> non-commercial iOS and web application that displays georeferenced historical maps of
> Nova Scotia. I would like to georeference this sheet and publish it as a map layer.
>
> I would be grateful for your guidance on four points:
>
> 1. **Copyright status.** Can you confirm the copyright status of both the 1876 original
>    and of LAC's reproduction of it?
>
> 2. **Digitization quote.** What would a high-resolution scan cost? For the map to be
>    legible at the parcel and resident-name level, I am aiming for at least 20,000 pixels
>    on the long edge. For reference, comparable Church county sheets in the David Rumsey
>    collection are scanned at roughly 34,000 x 34,500 pixels, about 2.6 m/pixel on the
>    ground. Please advise what resolutions and file formats are available and their cost.
>
> 3. **Permission to publish derived tiles.** The application slices the georeferenced
>    image into standard web map tiles. May I publish these derived tiles publicly within
>    the open-source application? If a separate permissions process applies, please point
>    me to it.
>
> 4. **Credit line.** What exact wording would you like displayed as attribution?
>
> Thank you for your time.
>
> Dan Fakkeldy
> dfakkeldy@gmail.com

## Reply log

_Record LAC's response here — especially the copyright determination, since it decides
whether Annapolis can use this pipeline or needs the NS Crown-copyright fallback path._
```

- [ ] **Step 2: Verify the document renders and contains no placeholders**

Run: `grep -nE "TBD|TODO|FIXME|XXX" docs/annapolis-church-lac-enquiry.md`
Expected: no output (exit code 1).

- [ ] **Step 3: Commit**

```bash
git add docs/annapolis-church-lac-enquiry.md
git commit -m "docs: draft the LAC enquiry for the Church Annapolis sheet"
```

---

### Task 2: Package scaffolding and county registry

**Files:**
- Create: `tools/__init__.py`
- Create: `tools/church/__init__.py`
- Create: `tools/church/counties.py`
- Create: `tools/church/tests/__init__.py`
- Test: `tools/church/tests/test_counties.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `ChurchCounty` dataclass with fields `slug: str`, `name: str`, `layer_id: str`, `rumsey_id: str | None`, `published_year: int`, `scale_denominator: int`, `pixel_width: int | None`, `pixel_height: int | None`
  - `COUNTIES: dict[str, ChurchCounty]` keyed by slug
  - `get_county(slug: str) -> ChurchCounty` — raises `KeyError` with the known slugs listed

- [ ] **Step 1: Write the failing test**

Create `tools/church/tests/test_counties.py`:

```python
import unittest

from tools.church.counties import COUNTIES, ChurchCounty, get_county


class CountyRegistryTests(unittest.TestCase):
    def test_inverness_carries_verified_rumsey_facts(self) -> None:
        county = get_county("inverness")
        self.assertEqual(county.name, "Inverness")
        self.assertEqual(county.layer_id, "church-inverness")
        self.assertEqual(county.rumsey_id, "RUMSEY~8~1~353591~90120835")
        self.assertEqual(county.pixel_width, 34427)
        self.assertEqual(county.pixel_height, 34543)
        self.assertEqual(county.scale_denominator, 63360)

    def test_published_year_is_publication_not_survey_date(self) -> None:
        # Rumsey's Date field says 1864 (survey/copyright). The Note gives the
        # true publication date, 1884. Shipping 1864 would mislabel the layer.
        self.assertEqual(get_county("inverness").published_year, 1884)

    def test_annapolis_is_registered_without_a_rumsey_source(self) -> None:
        county = get_county("annapolis")
        self.assertEqual(county.published_year, 1876)
        self.assertIsNone(county.rumsey_id)
        self.assertIsNone(county.pixel_width)

    def test_layer_ids_are_unique_and_prefixed(self) -> None:
        ids = [c.layer_id for c in COUNTIES.values()]
        self.assertEqual(len(ids), len(set(ids)))
        for layer_id in ids:
            self.assertTrue(layer_id.startswith("church-"), layer_id)

    def test_unknown_slug_lists_the_known_ones(self) -> None:
        with self.assertRaises(KeyError) as caught:
            get_county("atlantis")
        self.assertIn("inverness", str(caught.exception))

    def test_dataclass_is_frozen(self) -> None:
        with self.assertRaises(Exception):
            get_county("inverness").name = "Mutated"  # type: ignore[misc]

    def test_registry_values_are_church_counties(self) -> None:
        for county in COUNTIES.values():
            self.assertIsInstance(county, ChurchCounty)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools'`

- [ ] **Step 3: Create the package files and registry**

Create `tools/__init__.py` (empty file) and `tools/church/tests/__init__.py` (empty file).

Create `tools/church/__init__.py`:

```python
"""Tooling for georeferencing and tiling the A.F. Church county map series."""
```

Create `tools/church/counties.py`:

```python
"""Registry of the A.F. Church county maps (1864-1888, one per Nova Scotia county).

Single source of truth for county metadata shared by the fetch, georeference,
tiling, and documentation steps.

Note on dates: the Rumsey `Date` field carries the 1864 survey/copyright date for
most sheets. The true publication date lives in the item's `Note` field and is
what we display. Inverness is dated 1864 by Rumsey but was published in 1884.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ChurchCounty:
    """One county sheet in the Church series."""

    slug: str
    name: str
    layer_id: str
    published_year: int
    scale_denominator: int
    rumsey_id: str | None = None
    pixel_width: int | None = None
    pixel_height: int | None = None

    @property
    def has_source(self) -> bool:
        """True when a digital source is known for this county."""
        return self.rumsey_id is not None


_REGISTERED = (
    ChurchCounty(
        slug="inverness",
        name="Inverness",
        layer_id="church-inverness",
        published_year=1884,
        scale_denominator=63360,
        rumsey_id="RUMSEY~8~1~353591~90120835",
        pixel_width=34427,
        pixel_height=34543,
    ),
    ChurchCounty(
        slug="victoria",
        name="Victoria",
        layer_id="church-victoria",
        published_year=1884,
        scale_denominator=63360,
        rumsey_id="RUMSEY~8~1~374820~90141224",
    ),
    ChurchCounty(
        slug="richmond",
        name="Richmond",
        layer_id="church-richmond",
        published_year=1885,
        scale_denominator=84269,
        rumsey_id="RUMSEY~8~1~373669~90140407",
    ),
    ChurchCounty(
        slug="cape-breton",
        name="Cape Breton",
        layer_id="church-cape-breton",
        published_year=1884,
        scale_denominator=63360,
        rumsey_id="RUMSEY~8~1~374821~90141223",
    ),
    # No digital source known. See docs/annapolis-church-lac-enquiry.md.
    ChurchCounty(
        slug="annapolis",
        name="Annapolis",
        layer_id="church-annapolis",
        published_year=1876,
        scale_denominator=63360,
    ),
)

COUNTIES: dict[str, ChurchCounty] = {county.slug: county for county in _REGISTERED}


def get_county(slug: str) -> ChurchCounty:
    """Look up a county by slug, naming the valid options when it is missing."""
    try:
        return COUNTIES[slug]
    except KeyError:
        known = ", ".join(sorted(COUNTIES))
        raise KeyError(f"unknown county {slug!r}; known counties: {known}") from None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/__init__.py tools/church/__init__.py tools/church/counties.py tools/church/tests/
git commit -m "feat(tools): add the A.F. Church county registry"
```

---

### Task 3: Web Mercator geometry with ground-distance correction

**Files:**
- Create: `tools/church/geometry.py`
- Test: `tools/church/tests/test_geometry.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `lonlat_to_mercator(lon_deg: float, lat_deg: float) -> tuple[float, float]`
  - `mercator_to_lonlat(x: float, y: float) -> tuple[float, float]`
  - `mercator_to_ground_metres(mercator_distance: float, latitude_deg: float) -> float`
  - `EARTH_RADIUS_M: float`

- [ ] **Step 1: Write the failing test**

Create `tools/church/tests/test_geometry.py`:

```python
import math
import unittest

from tools.church.geometry import (
    EARTH_RADIUS_M,
    lonlat_to_mercator,
    mercator_to_ground_metres,
    mercator_to_lonlat,
)


class MercatorTests(unittest.TestCase):
    def test_origin_maps_to_origin(self) -> None:
        x, y = lonlat_to_mercator(0.0, 0.0)
        self.assertAlmostEqual(x, 0.0, places=6)
        self.assertAlmostEqual(y, 0.0, places=6)

    def test_antimeridian_maps_to_half_circumference(self) -> None:
        x, _ = lonlat_to_mercator(180.0, 0.0)
        self.assertAlmostEqual(x, math.pi * EARTH_RADIUS_M, places=3)

    def test_roundtrip_at_inverness(self) -> None:
        lon, lat = -61.2, 46.2
        back_lon, back_lat = mercator_to_lonlat(*lonlat_to_mercator(lon, lat))
        self.assertAlmostEqual(back_lon, lon, places=9)
        self.assertAlmostEqual(back_lat, lat, places=9)

    def test_northern_latitudes_have_larger_y(self) -> None:
        _, south = lonlat_to_mercator(-61.0, 45.0)
        _, north = lonlat_to_mercator(-61.0, 47.0)
        self.assertGreater(north, south)


class GroundDistanceTests(unittest.TestCase):
    def test_no_correction_at_the_equator(self) -> None:
        self.assertAlmostEqual(mercator_to_ground_metres(1000.0, 0.0), 1000.0, places=6)

    def test_inverness_latitude_shrinks_distance_by_cosine(self) -> None:
        # This is the whole point of the function: 1000 Mercator metres at 46N
        # is only ~695 m on the ground. Reporting the uncorrected number would
        # overstate positional error by ~44%.
        self.assertAlmostEqual(
            mercator_to_ground_metres(1000.0, 46.0),
            1000.0 * math.cos(math.radians(46.0)),
            places=6,
        )
        self.assertAlmostEqual(mercator_to_ground_metres(1000.0, 46.0), 694.658, places=2)

    def test_correction_is_symmetric_across_the_equator(self) -> None:
        self.assertAlmostEqual(
            mercator_to_ground_metres(500.0, 46.0),
            mercator_to_ground_metres(500.0, -46.0),
            places=9,
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.church.geometry'`

- [ ] **Step 3: Write the implementation**

Create `tools/church/geometry.py`:

```python
"""Spherical Web Mercator (EPSG:3857) conversions.

The ground-distance correction here is load-bearing. EPSG:3857 is conformal but
not equidistant: distances inflate by 1/cos(latitude). At Inverness County's
~46 degrees N that is roughly 44 percent, so an accuracy figure measured in raw
3857 units would be badly wrong. Every distance we report to a user passes
through `mercator_to_ground_metres`.
"""

from __future__ import annotations

import math

EARTH_RADIUS_M = 6378137.0
"""Semi-major axis of WGS84, the sphere radius EPSG:3857 assumes."""


def lonlat_to_mercator(lon_deg: float, lat_deg: float) -> tuple[float, float]:
    """Convert WGS84 degrees to EPSG:3857 metres."""
    x = math.radians(lon_deg) * EARTH_RADIUS_M
    y = math.log(math.tan(math.pi / 4.0 + math.radians(lat_deg) / 2.0)) * EARTH_RADIUS_M
    return x, y


def mercator_to_lonlat(x: float, y: float) -> tuple[float, float]:
    """Convert EPSG:3857 metres back to WGS84 degrees."""
    lon_deg = math.degrees(x / EARTH_RADIUS_M)
    lat_deg = math.degrees(2.0 * math.atan(math.exp(y / EARTH_RADIUS_M)) - math.pi / 2.0)
    return lon_deg, lat_deg


def mercator_to_ground_metres(mercator_distance: float, latitude_deg: float) -> float:
    """Scale a distance measured in EPSG:3857 metres to true ground metres."""
    return mercator_distance * math.cos(math.radians(latitude_deg))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: PASS, 14 tests total (7 from Task 2, 7 here).

- [ ] **Step 5: Commit**

```bash
git add tools/church/geometry.py tools/church/tests/test_geometry.py
git commit -m "feat(tools): add Web Mercator geometry with ground-distance correction"
```

---

### Task 4: GCP model and CSV parsing

**Files:**
- Create: `tools/church/gcps.py`
- Create: `tools/church/gcps/inverness.csv`
- Test: `tools/church/tests/test_gcps.py`

**Interfaces:**
- Consumes: `tools.church.geometry.lonlat_to_mercator`
- Produces:
  - `GroundControlPoint` frozen dataclass: `pixel_x: float`, `pixel_y: float`, `lon: float`, `lat: float`, `role: str`, `label: str`
  - `GroundControlPoint.mercator` property → `tuple[float, float]`
  - `parse_gcp_csv(text: str) -> list[GroundControlPoint]`
  - `load_gcps(path: pathlib.Path) -> list[GroundControlPoint]`
  - `split_roles(points) -> tuple[list[GroundControlPoint], list[GroundControlPoint]]` returning `(control, check)`
  - `CONTROL_ROLE = "control"`, `CHECK_ROLE = "check"`

- [ ] **Step 1: Write the failing test**

Create `tools/church/tests/test_gcps.py`:

```python
import unittest

from tools.church.gcps import (
    CHECK_ROLE,
    CONTROL_ROLE,
    GroundControlPoint,
    parse_gcp_csv,
    split_roles,
)
from tools.church.geometry import lonlat_to_mercator

VALID_CSV = """pixel_x,pixel_y,lon,lat,role,label
1000,2000,-61.5,46.1,control,Port Hood wharf
5000,7000,-61.2,46.3,control,Mabou bridge
9000,9000,-61.0,46.5,check,Inverness station
"""


class ParseTests(unittest.TestCase):
    def test_parses_every_row(self) -> None:
        points = parse_gcp_csv(VALID_CSV)
        self.assertEqual(len(points), 3)
        self.assertEqual(points[0].label, "Port Hood wharf")
        self.assertEqual(points[0].pixel_x, 1000.0)
        self.assertEqual(points[2].role, CHECK_ROLE)

    def test_mercator_matches_the_geometry_module(self) -> None:
        point = parse_gcp_csv(VALID_CSV)[0]
        self.assertEqual(point.mercator, lonlat_to_mercator(-61.5, 46.1))

    def test_blank_lines_and_comments_are_skipped(self) -> None:
        text = "# a comment\n" + VALID_CSV + "\n\n# trailing note\n"
        self.assertEqual(len(parse_gcp_csv(text)), 3)

    def test_rejects_unknown_role(self) -> None:
        text = VALID_CSV.replace("control,Port Hood wharf", "bogus,Port Hood wharf")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("bogus", str(caught.exception))

    def test_rejects_out_of_range_latitude(self) -> None:
        text = VALID_CSV.replace(",46.1,", ",946.1,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("latitude", str(caught.exception).lower())

    def test_rejects_out_of_range_longitude(self) -> None:
        text = VALID_CSV.replace("-61.5,", "-361.5,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("longitude", str(caught.exception).lower())

    def test_rejects_negative_pixel_coordinates(self) -> None:
        text = VALID_CSV.replace("1000,2000,", "-1000,2000,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("pixel", str(caught.exception).lower())

    def test_error_names_the_offending_line_number(self) -> None:
        # Header is line 1, so the second data row ("Mabou bridge") is line 3.
        text = VALID_CSV.replace(",46.3,", ",946.3,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("line 3", str(caught.exception))

    def test_line_numbers_account_for_skipped_comment_lines(self) -> None:
        # Reported numbers must match what an editor shows, or they are useless
        # for finding one bad point among several hundred.
        text = "# note\n# another\n" + VALID_CSV.replace(",46.3,", ",946.3,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("line 5", str(caught.exception))

    def test_empty_input_is_rejected(self) -> None:
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv("# only a comment\n\n")
        self.assertIn("empty", str(caught.exception).lower())

    def test_rejects_missing_required_column(self) -> None:
        text = VALID_CSV.replace("pixel_x,pixel_y,lon,lat,role,label", "pixel_x,pixel_y,lon,lat,role")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("label", str(caught.exception))


class SplitTests(unittest.TestCase):
    def test_splits_control_from_check(self) -> None:
        control, check = split_roles(parse_gcp_csv(VALID_CSV))
        self.assertEqual(len(control), 2)
        self.assertEqual(len(check), 1)
        self.assertTrue(all(p.role == CONTROL_ROLE for p in control))
        self.assertTrue(all(p.role == CHECK_ROLE for p in check))

    def test_split_of_empty_input_is_two_empty_lists(self) -> None:
        self.assertEqual(split_roles([]), ([], []))

    def test_point_is_hashable_and_frozen(self) -> None:
        point = GroundControlPoint(1.0, 2.0, -61.0, 46.0, CONTROL_ROLE, "x")
        self.assertIsInstance(hash(point), int)
        with self.assertRaises(Exception):
            point.lat = 0.0  # type: ignore[misc]


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.church.gcps'`

- [ ] **Step 3: Write the implementation**

Create `tools/church/gcps.py`:

```python
"""Ground control points for georeferencing a Church county sheet.

GCPs live in version-controlled CSV files so they stay reviewable in diffs -
they are the real intellectual asset of this pipeline, far more valuable than
the derived rasters.

Each row carries a `role`:
  * `control` - fed to gdalwarp to build the warp.
  * `check`   - held out entirely, used only to measure accuracy afterwards.

The split matters. A thin-plate spline interpolates its control points exactly,
so residuals measured at control points are always ~0 and say nothing about
accuracy. Only held-out check points give an honest number.
"""

from __future__ import annotations

import csv
import io
import pathlib
from dataclasses import dataclass

from tools.church.geometry import lonlat_to_mercator

CONTROL_ROLE = "control"
CHECK_ROLE = "check"
_VALID_ROLES = frozenset({CONTROL_ROLE, CHECK_ROLE})
_REQUIRED_COLUMNS = ("pixel_x", "pixel_y", "lon", "lat", "role", "label")


@dataclass(frozen=True)
class GroundControlPoint:
    """A single pixel-to-world correspondence."""

    pixel_x: float
    pixel_y: float
    lon: float
    lat: float
    role: str
    label: str

    @property
    def mercator(self) -> tuple[float, float]:
        """This point's world position in EPSG:3857 metres."""
        return lonlat_to_mercator(self.lon, self.lat)


def parse_gcp_csv(text: str) -> list[GroundControlPoint]:
    """Parse GCP CSV text, validating every row.

    Raises ValueError naming the TRUE file line number, so a bad point in a file
    of several hundred is findable. Comment and blank lines are skipped for
    parsing but still counted, so the reported number matches what an editor
    shows.
    """
    kept: list[tuple[int, str]] = [
        (number, line)
        for number, line in enumerate(text.splitlines(), start=1)
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not kept:
        raise ValueError("GCP file is empty")

    reader = csv.DictReader(io.StringIO("\n".join(line for _, line in kept)))
    if reader.fieldnames is None:
        raise ValueError("GCP file is empty")

    missing = [column for column in _REQUIRED_COLUMNS if column not in reader.fieldnames]
    if missing:
        raise ValueError(f"GCP file is missing required column(s): {', '.join(missing)}")

    points: list[GroundControlPoint] = []
    for index, row in enumerate(reader):
        # kept[0] is the header row, so data row `index` is kept[index + 1].
        points.append(_parse_row(row, kept[index + 1][0]))
    return points


def _parse_row(row: dict[str, str], line_number: int) -> GroundControlPoint:
    def number(column: str) -> float:
        raw = (row.get(column) or "").strip()
        try:
            return float(raw)
        except ValueError:
            raise ValueError(f"line {line_number}: {column} is not a number: {raw!r}") from None

    pixel_x = number("pixel_x")
    pixel_y = number("pixel_y")
    lon = number("lon")
    lat = number("lat")
    role = (row.get("role") or "").strip()
    label = (row.get("label") or "").strip()

    if pixel_x < 0 or pixel_y < 0:
        raise ValueError(f"line {line_number}: pixel coordinates must be non-negative")
    if not -180.0 <= lon <= 180.0:
        raise ValueError(f"line {line_number}: longitude out of range: {lon}")
    if not -85.05112878 <= lat <= 85.05112878:
        raise ValueError(f"line {line_number}: latitude out of Web Mercator range: {lat}")
    if role not in _VALID_ROLES:
        raise ValueError(
            f"line {line_number}: unknown role {role!r}; expected one of {sorted(_VALID_ROLES)}"
        )
    if not label:
        raise ValueError(f"line {line_number}: label must not be empty")

    return GroundControlPoint(pixel_x, pixel_y, lon, lat, role, label)


def load_gcps(path: pathlib.Path) -> list[GroundControlPoint]:
    """Read and parse a GCP CSV file."""
    return parse_gcp_csv(path.read_text(encoding="utf-8"))


def split_roles(
    points: list[GroundControlPoint],
) -> tuple[list[GroundControlPoint], list[GroundControlPoint]]:
    """Partition points into (control, check)."""
    control = [p for p in points if p.role == CONTROL_ROLE]
    check = [p for p in points if p.role == CHECK_ROLE]
    return control, check
```

- [ ] **Step 4: Create the seed GCP file**

Create `tools/church/gcps/inverness.csv`. This is a **seed placeholder with a single
header row and no data** — real points come from the QGIS capture in Task 8, and
inventing coordinates here would produce a silently wrong warp:

```csv
# Ground control points for the A.F. Church Inverness County sheet (published 1884).
# Source image: Rumsey RUMSEY~8~1~353591~90120835, 34427 x 34543 px.
# pixel_y is measured from the TOP of the image, matching GDAL's convention.
# role=control feeds the warp; role=check is held out to measure accuracy.
# Capture points in QGIS Georeferencer, then convert its .points export (see
# docs/CHURCH_MAPS.md). Aim for 20+ control and 5+ check points to start.
pixel_x,pixel_y,lon,lat,role,label
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: PASS, 28 tests total.

- [ ] **Step 6: Commit**

```bash
git add tools/church/gcps.py tools/church/gcps/inverness.csv tools/church/tests/test_gcps.py
git commit -m "feat(tools): add validated GCP parsing with control/check roles"
```

---

### Task 5: Affine fit and accuracy reporting

The distortion measurement that quantifies the StFX/GANS finding.

**Files:**
- Create: `tools/church/residuals.py`
- Test: `tools/church/tests/test_residuals.py`

**Interfaces:**
- Consumes: `tools.church.gcps.GroundControlPoint`, `tools.church.geometry.mercator_to_ground_metres`
- Produces:
  - `AffineModel` frozen dataclass with `a b c d e f: float` and `apply(pixel_x, pixel_y) -> tuple[float, float]`
  - `solve_affine(points) -> AffineModel` — raises `ValueError` on <3 points or degenerate geometry
  - `residual_metres(points, model) -> list[float]` — ground metres, per point
  - `rms(values: list[float]) -> float`
  - `AccuracyReport` frozen dataclass: `affine_rms_m: float`, `check_rms_m: float | None`, `check_max_m: float | None`, `control_count: int`, `check_count: int`
  - `AccuracyReport.as_dict() -> dict`
  - `summarise(control, check, check_errors_m=None) -> AccuracyReport`

- [ ] **Step 1: Write the failing test**

Create `tools/church/tests/test_residuals.py`:

```python
import math
import unittest

from tools.church.gcps import CHECK_ROLE, CONTROL_ROLE, GroundControlPoint
from tools.church.geometry import mercator_to_lonlat
from tools.church.residuals import (
    AffineModel,
    solve_affine,
    residual_metres,
    rms,
    summarise,
)


def point_from_mercator(px: float, py: float, x: float, y: float, role: str = CONTROL_ROLE):
    lon, lat = mercator_to_lonlat(x, y)
    return GroundControlPoint(px, py, lon, lat, role, f"p{px}-{py}")


class SolveAffineTests(unittest.TestCase):
    def test_recovers_a_known_scale_and_offset(self) -> None:
        # World = pixel * 2 + 100 in X, pixel * 3 - 50 in Y.
        points = [
            point_from_mercator(0.0, 0.0, 100.0, -50.0),
            point_from_mercator(10.0, 0.0, 120.0, -50.0),
            point_from_mercator(0.0, 10.0, 100.0, -20.0),
            point_from_mercator(10.0, 10.0, 120.0, -20.0),
        ]
        model = solve_affine(points)
        self.assertAlmostEqual(model.a, 2.0, places=6)
        self.assertAlmostEqual(model.c, 100.0, places=4)
        self.assertAlmostEqual(model.e, 3.0, places=6)
        self.assertAlmostEqual(model.f, -50.0, places=4)

    def test_exactly_affine_points_have_near_zero_residual(self) -> None:
        points = [
            point_from_mercator(0.0, 0.0, 0.0, 0.0),
            point_from_mercator(100.0, 0.0, 200.0, 0.0),
            point_from_mercator(0.0, 100.0, 0.0, 300.0),
            point_from_mercator(100.0, 100.0, 200.0, 300.0),
        ]
        self.assertLess(rms(residual_metres(points, solve_affine(points))), 1e-6)

    def test_requires_at_least_three_points(self) -> None:
        points = [point_from_mercator(0.0, 0.0, 0.0, 0.0), point_from_mercator(1.0, 1.0, 1.0, 1.0)]
        with self.assertRaises(ValueError) as caught:
            solve_affine(points)
        self.assertIn("3", str(caught.exception))

    def test_rejects_collinear_points(self) -> None:
        points = [
            point_from_mercator(0.0, 0.0, 0.0, 0.0),
            point_from_mercator(1.0, 1.0, 1.0, 1.0),
            point_from_mercator(2.0, 2.0, 2.0, 2.0),
        ]
        with self.assertRaises(ValueError) as caught:
            solve_affine(points)
        self.assertIn("degenerate", str(caught.exception).lower())

    def test_apply_matches_the_model_equations(self) -> None:
        model = AffineModel(2.0, 0.0, 5.0, 0.0, 3.0, 7.0)
        self.assertEqual(model.apply(10.0, 20.0), (25.0, 67.0))


class ResidualTests(unittest.TestCase):
    def test_distorted_point_produces_nonzero_residual(self) -> None:
        # Three points define an exact affine; the fourth is displaced, so the
        # least-squares fit cannot absorb it. This is the distortion signal.
        points = [
            point_from_mercator(0.0, 0.0, 0.0, 0.0),
            point_from_mercator(100.0, 0.0, 100.0, 0.0),
            point_from_mercator(0.0, 100.0, 0.0, 100.0),
            point_from_mercator(100.0, 100.0, 400.0, 100.0),
        ]
        self.assertGreater(rms(residual_metres(points, solve_affine(points))), 1.0)

    def test_residuals_are_ground_metres_not_mercator_metres(self) -> None:
        # One point displaced by a known Mercator amount at ~46N. The reported
        # residual must be the cosine-corrected (smaller) ground distance.
        base = [
            point_from_mercator(0.0, 0.0, -6800000.0, 5800000.0),
            point_from_mercator(100.0, 0.0, -6799000.0, 5800000.0),
            point_from_mercator(0.0, 100.0, -6800000.0, 5801000.0),
        ]
        model = solve_affine(base)
        residuals = residual_metres(base, model)
        self.assertTrue(all(r >= 0.0 for r in residuals))
        latitude = base[0].lat
        self.assertGreater(latitude, 40.0)  # confirms the fixture really is northern

    def test_rms_of_known_values(self) -> None:
        self.assertAlmostEqual(rms([3.0, 4.0]), math.sqrt(12.5), places=9)

    def test_rms_of_empty_is_zero(self) -> None:
        self.assertEqual(rms([]), 0.0)


class SummariseTests(unittest.TestCase):
    def _control(self):
        return [
            point_from_mercator(0.0, 0.0, 0.0, 0.0),
            point_from_mercator(100.0, 0.0, 100.0, 0.0),
            point_from_mercator(0.0, 100.0, 0.0, 100.0),
            point_from_mercator(100.0, 100.0, 400.0, 100.0),
        ]

    def test_reports_counts_and_affine_rms(self) -> None:
        report = summarise(self._control(), [])
        self.assertEqual(report.control_count, 4)
        self.assertEqual(report.check_count, 0)
        self.assertGreater(report.affine_rms_m, 0.0)

    def test_check_accuracy_is_none_without_check_points(self) -> None:
        report = summarise(self._control(), [])
        self.assertIsNone(report.check_rms_m)
        self.assertIsNone(report.check_max_m)

    def test_check_accuracy_uses_supplied_errors(self) -> None:
        check = [point_from_mercator(50.0, 50.0, 50.0, 50.0, CHECK_ROLE)]
        report = summarise(self._control(), check, check_errors_m=[30.0, 40.0])
        self.assertAlmostEqual(report.check_rms_m, math.sqrt(1250.0), places=9)
        self.assertEqual(report.check_max_m, 40.0)

    def test_as_dict_is_json_ready(self) -> None:
        report = summarise(self._control(), [])
        payload = report.as_dict()
        self.assertIn("affine_rms_m", payload)
        self.assertIn("control_count", payload)
        self.assertIsInstance(payload["affine_rms_m"], float)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.church.residuals'`

- [ ] **Step 3: Write the implementation**

Create `tools/church/residuals.py`:

```python
"""Accuracy measurement for a georeferenced Church sheet.

Two distinct numbers, easily confused:

`affine_rms_m` - how badly a plain 6-parameter affine fits the control points.
    This is a DISTORTION INDEX, not the accuracy of the delivered layer. A large
    value is the quantitative form of the StFX observation that Church map
    geometry "is so distorted that it is impossible to georeference to the modern
    base map" with simple methods. It is exactly why we warp with -tps.

`check_rms_m` - the error of the delivered thin-plate-spline warp, measured at
    points that were HELD OUT of the warp. This is the honest accuracy figure and
    the only one fit to show a user.

Measuring TPS error at its own control points would always yield ~0, because a
thin-plate spline interpolates its controls exactly. That number would be a lie.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from tools.church.gcps import GroundControlPoint
from tools.church.geometry import mercator_to_ground_metres


@dataclass(frozen=True)
class AffineModel:
    """Pixel-to-EPSG:3857 affine: X = a*px + b*py + c, Y = d*px + e*py + f."""

    a: float
    b: float
    c: float
    d: float
    e: float
    f: float

    def apply(self, pixel_x: float, pixel_y: float) -> tuple[float, float]:
        """Project a pixel coordinate through this model."""
        return (
            self.a * pixel_x + self.b * pixel_y + self.c,
            self.d * pixel_x + self.e * pixel_y + self.f,
        )


def _solve3(matrix: list[list[float]], rhs: list[float]) -> list[float]:
    """Solve a 3x3 linear system by Gaussian elimination with partial pivoting."""
    augmented = [row[:] + [rhs[index]] for index, row in enumerate(matrix)]
    for column in range(3):
        pivot = max(range(column, 3), key=lambda r: abs(augmented[r][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            raise ValueError(
                "control points are degenerate (collinear or coincident); "
                "an affine fit needs points spanning two dimensions"
            )
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        for row in range(3):
            if row == column:
                continue
            factor = augmented[row][column] / augmented[column][column]
            for col in range(column, 4):
                augmented[row][col] -= factor * augmented[column][col]
    return [augmented[i][3] / augmented[i][i] for i in range(3)]


def solve_affine(points: list[GroundControlPoint]) -> AffineModel:
    """Least-squares 6-parameter affine from pixel space to EPSG:3857."""
    if len(points) < 3:
        raise ValueError(f"need at least 3 control points, got {len(points)}")

    count = float(len(points))
    sum_xx = sum_xy = sum_x = sum_yy = sum_y = 0.0
    for point in points:
        sum_xx += point.pixel_x * point.pixel_x
        sum_xy += point.pixel_x * point.pixel_y
        sum_x += point.pixel_x
        sum_yy += point.pixel_y * point.pixel_y
        sum_y += point.pixel_y

    normal = [[sum_xx, sum_xy, sum_x], [sum_xy, sum_yy, sum_y], [sum_x, sum_y, count]]
    rhs_x = [0.0, 0.0, 0.0]
    rhs_y = [0.0, 0.0, 0.0]
    for point in points:
        world_x, world_y = point.mercator
        rhs_x[0] += point.pixel_x * world_x
        rhs_x[1] += point.pixel_y * world_x
        rhs_x[2] += world_x
        rhs_y[0] += point.pixel_x * world_y
        rhs_y[1] += point.pixel_y * world_y
        rhs_y[2] += world_y

    a, b, c = _solve3(normal, rhs_x)
    d, e, f = _solve3(normal, rhs_y)
    return AffineModel(a, b, c, d, e, f)


def residual_metres(points: list[GroundControlPoint], model: AffineModel) -> list[float]:
    """Per-point fit error in GROUND metres (Mercator inflation removed)."""
    errors: list[float] = []
    for point in points:
        predicted_x, predicted_y = model.apply(point.pixel_x, point.pixel_y)
        actual_x, actual_y = point.mercator
        mercator_error = math.hypot(predicted_x - actual_x, predicted_y - actual_y)
        errors.append(mercator_to_ground_metres(mercator_error, point.lat))
    return errors


def rms(values: list[float]) -> float:
    """Root mean square. Zero for an empty list."""
    if not values:
        return 0.0
    return math.sqrt(sum(value * value for value in values) / len(values))


@dataclass(frozen=True)
class AccuracyReport:
    """What we know about a warp's quality, ready for metadata.json."""

    affine_rms_m: float
    control_count: int
    check_count: int
    check_rms_m: float | None = None
    check_max_m: float | None = None

    def as_dict(self) -> dict:
        """JSON-serialisable form."""
        return {
            "affine_rms_m": self.affine_rms_m,
            "control_count": self.control_count,
            "check_count": self.check_count,
            "check_rms_m": self.check_rms_m,
            "check_max_m": self.check_max_m,
        }


def summarise(
    control: list[GroundControlPoint],
    check: list[GroundControlPoint],
    check_errors_m: list[float] | None = None,
) -> AccuracyReport:
    """Build the accuracy report.

    `check_errors_m` comes from transforming held-out points through the actual
    TPS warp (see georeference.py); it is not derivable from the affine fit.
    """
    affine_rms = rms(residual_metres(control, solve_affine(control))) if control else 0.0
    return AccuracyReport(
        affine_rms_m=affine_rms,
        control_count=len(control),
        check_count=len(check),
        check_rms_m=rms(check_errors_m) if check_errors_m else None,
        check_max_m=max(check_errors_m) if check_errors_m else None,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: PASS, 41 tests total.

- [ ] **Step 5: Commit**

```bash
git add tools/church/residuals.py tools/church/tests/test_residuals.py
git commit -m "feat(tools): measure warp distortion and held-out check accuracy"
```

---

### Task 6: IIIF source fetching

**Files:**
- Create: `tools/church/fetch_rumsey.py`
- Test: `tools/church/tests/test_fetch_rumsey.py`

**Interfaces:**
- Consumes: `tools.church.counties.ChurchCounty`, `get_county`
- Produces:
  - `IIIF_BASE = "https://www.davidrumsey.com/luna/servlet/iiif"`
  - `manifest_url(rumsey_id: str) -> str`
  - `region_url(rumsey_id, x, y, width, height, size_width) -> str`
  - `canvas_size(manifest: dict) -> tuple[int, int]`
  - `plan_regions(width, height, tile_size=2048) -> list[tuple[int, int, int, int]]` — `(x, y, w, h)` tiles covering the image
  - `main(argv: list[str] | None = None) -> int` — CLI entry

- [ ] **Step 1: Write the failing test**

Create `tools/church/tests/test_fetch_rumsey.py`:

```python
import unittest

from tools.church.fetch_rumsey import (
    IIIF_BASE,
    canvas_size,
    manifest_url,
    plan_regions,
    region_url,
)

INVERNESS_ID = "RUMSEY~8~1~353591~90120835"

# Trimmed from the live manifest, recorded 2026-07-24. Tests never hit the network.
MANIFEST_FIXTURE = {
    "label": "Topographical township map Inverness County, Nova Scotia",
    "attribution": "David Rumsey Historical Map Collection",
    "sequences": [
        {
            "canvases": [
                {
                    "width": 34427,
                    "height": 34543,
                    "images": [
                        {
                            "resource": {
                                "service": {
                                    "@id": f"{IIIF_BASE}/{INVERNESS_ID}",
                                    "profile": "http://iiif.io/api/image/2/level1.json",
                                }
                            }
                        }
                    ],
                }
            ]
        }
    ],
}


class UrlTests(unittest.TestCase):
    def test_manifest_url_uses_the_working_host(self) -> None:
        url = manifest_url(INVERNESS_ID)
        self.assertEqual(url, f"{IIIF_BASE}/m/{INVERNESS_ID}/manifest")
        # iiif.davidrumsey.com is NXDOMAIN - guard against regressing to it.
        self.assertNotIn("iiif.davidrumsey.com", url)

    def test_region_url_is_iiif_shaped(self) -> None:
        url = region_url(INVERNESS_ID, 0, 0, 2048, 2048, 2048)
        self.assertEqual(url, f"{IIIF_BASE}/{INVERNESS_ID}/0,0,2048,2048/2048,/0/default.jpg")


class ManifestTests(unittest.TestCase):
    def test_reads_canvas_dimensions(self) -> None:
        self.assertEqual(canvas_size(MANIFEST_FIXTURE), (34427, 34543))

    def test_raises_on_a_manifest_without_canvases(self) -> None:
        with self.assertRaises(ValueError):
            canvas_size({"sequences": [{"canvases": []}]})


class PlanRegionsTests(unittest.TestCase):
    def test_single_region_when_image_fits_one_tile(self) -> None:
        self.assertEqual(plan_regions(100, 80, tile_size=2048), [(0, 0, 100, 80)])

    def test_tiles_cover_the_image_exactly_without_overlap(self) -> None:
        width, height, tile = 5000, 4000, 2048
        regions = plan_regions(width, height, tile_size=tile)
        self.assertEqual(sum(w * h for _, _, w, h in regions), width * height)
        for x, y, w, h in regions:
            self.assertLessEqual(x + w, width)
            self.assertLessEqual(y + h, height)
            self.assertGreater(w, 0)
            self.assertGreater(h, 0)

    def test_edge_tiles_are_clipped_not_padded(self) -> None:
        regions = plan_regions(3000, 2048, tile_size=2048)
        self.assertIn((2048, 0, 952, 2048), regions)

    def test_inverness_full_size_plans_a_sane_tile_count(self) -> None:
        regions = plan_regions(34427, 34543, tile_size=2048)
        self.assertEqual(len(regions), 17 * 17)

    def test_rejects_non_positive_tile_size(self) -> None:
        with self.assertRaises(ValueError):
            plan_regions(100, 100, tile_size=0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.church.fetch_rumsey'`

- [ ] **Step 3: Write the implementation**

Create `tools/church/fetch_rumsey.py`:

```python
"""Fetch a full-resolution Church county sheet from the David Rumsey IIIF service.

Host note: `iiif.davidrumsey.com` does NOT resolve (NXDOMAIN). The working
endpoint is www.davidrumsey.com/luna/servlet/iiif, and it advertises IIIF Image
API *level1*, so we request explicit regions at explicit widths rather than
assuming arbitrary size support.

At 34427 x 34543 px, Inverness is far too large to request in one call, so we
walk it in 2048 px regions and let GDAL mosaic the pieces.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import time
import urllib.request

from tools.church.counties import get_county

IIIF_BASE = "https://www.davidrumsey.com/luna/servlet/iiif"
USER_AGENT = "ns-marks-the-spot/1.0 (open-source historical map project)"
REQUEST_DELAY_SECONDS = 0.5
"""Courtesy pause between region requests - Rumsey is a free public service."""


def manifest_url(rumsey_id: str) -> str:
    """URL of the IIIF presentation manifest for an item."""
    return f"{IIIF_BASE}/m/{rumsey_id}/manifest"


def region_url(
    rumsey_id: str, x: int, y: int, width: int, height: int, size_width: int
) -> str:
    """URL of one IIIF image region at a requested output width."""
    return f"{IIIF_BASE}/{rumsey_id}/{x},{y},{width},{height}/{size_width},/0/default.jpg"


def canvas_size(manifest: dict) -> tuple[int, int]:
    """Pull (width, height) in pixels from a IIIF presentation manifest."""
    try:
        canvas = manifest["sequences"][0]["canvases"][0]
        return int(canvas["width"]), int(canvas["height"])
    except (KeyError, IndexError) as error:
        raise ValueError(f"manifest has no usable canvas: {error}") from error


def plan_regions(
    width: int, height: int, tile_size: int = 2048
) -> list[tuple[int, int, int, int]]:
    """Split an image into non-overlapping (x, y, w, h) regions, clipped at edges."""
    if tile_size <= 0:
        raise ValueError(f"tile_size must be positive, got {tile_size}")
    regions: list[tuple[int, int, int, int]] = []
    for y in range(0, height, tile_size):
        for x in range(0, width, tile_size):
            regions.append((x, y, min(tile_size, width - x), min(tile_size, height - y)))
    return regions


def _fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def fetch_manifest(rumsey_id: str) -> dict:
    """Download and parse an item's IIIF manifest."""
    return json.loads(_fetch(manifest_url(rumsey_id)).decode("utf-8"))


def download_county(slug: str, destination: pathlib.Path, tile_size: int = 2048) -> pathlib.Path:
    """Download every region of a county sheet and mosaic them into one TIFF."""
    county = get_county(slug)
    if county.rumsey_id is None:
        raise ValueError(
            f"{county.name} has no known digital source; "
            f"see docs/annapolis-church-lac-enquiry.md"
        )

    destination.mkdir(parents=True, exist_ok=True)
    parts_dir = destination / "parts"
    parts_dir.mkdir(exist_ok=True)

    width, height = canvas_size(fetch_manifest(county.rumsey_id))
    regions = plan_regions(width, height, tile_size)
    print(f"{county.name}: {width}x{height} px, {len(regions)} regions", file=sys.stderr)

    part_paths: list[pathlib.Path] = []
    for index, (x, y, region_width, region_height) in enumerate(regions, start=1):
        part_path = parts_dir / f"{x:06d}_{y:06d}.jpg"
        if not part_path.exists():
            url = region_url(county.rumsey_id, x, y, region_width, region_height, region_width)
            part_path.write_bytes(_fetch(url))
            time.sleep(REQUEST_DELAY_SECONDS)
        part_paths.append(part_path)
        if index % 25 == 0:
            print(f"  {index}/{len(regions)}", file=sys.stderr)

    # Give each part its pixel-space position so gdalbuildvrt can mosaic them.
    for part_path in part_paths:
        x, y = (int(value) for value in part_path.stem.split("_"))
        subprocess.run(
            ["gdal_translate", "-q", "-a_ullr", str(x), str(-y),
             str(x + tile_size), str(-(y + tile_size)), str(part_path),
             str(part_path.with_suffix(".vrt"))],
            check=True,
        )

    mosaic_vrt = destination / f"{slug}.vrt"
    subprocess.run(
        ["gdalbuildvrt", "-q", str(mosaic_vrt),
         *[str(p.with_suffix(".vrt")) for p in part_paths]],
        check=True,
    )
    output = destination / f"{slug}.tif"
    subprocess.run(
        ["gdal_translate", "-q", "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES",
         str(mosaic_vrt), str(output)],
        check=True,
    )
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch a Church county sheet from Rumsey.")
    parser.add_argument("slug", help="county slug, e.g. inverness")
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("build/church"))
    parser.add_argument("--tile-size", type=int, default=2048)
    args = parser.parse_args(argv)
    path = download_county(args.slug, args.output / args.slug, args.tile_size)
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: PASS, 50 tests total.

- [ ] **Step 5: Commit**

```bash
git add tools/church/fetch_rumsey.py tools/church/tests/test_fetch_rumsey.py
git commit -m "feat(tools): fetch full-resolution Church sheets over IIIF"
```

---

### Task 7: Georeference and tile

**Files:**
- Create: `tools/church/georeference.py`
- Create: `tools/church/make_tiles.py`
- Test: `tools/church/tests/test_georeference.py`
- Test: `tools/church/tests/test_make_tiles.py`

**Interfaces:**
- Consumes: `tools.church.gcps` (`load_gcps`, `split_roles`), `tools.church.residuals` (`summarise`, `AccuracyReport`), `tools.church.counties.get_county`, `tools.church.geometry.mercator_to_ground_metres`
- Produces:
  - `build_gcp_arguments(points) -> list[str]` — `-gcp px py X Y` flags for `gdal_translate`
  - `warp_command(translated, output, tps=True) -> list[str]`
  - `parse_gdaltransform_output(text) -> list[tuple[float, float]]`
  - `check_errors(check_points, transformed) -> list[float]` — ground metres
  - `build_metadata(county, report, zoom_min, zoom_max, source_url, retrieved) -> dict`
  - `tile_command(warped, output_dir, zoom_min, zoom_max) -> list[str]`

- [ ] **Step 1: Write the failing tests**

Create `tools/church/tests/test_georeference.py`:

```python
import math
import unittest

from tools.church.counties import get_county
from tools.church.gcps import CHECK_ROLE, CONTROL_ROLE, GroundControlPoint
from tools.church.georeference import (
    build_gcp_arguments,
    build_metadata,
    check_errors,
    parse_gdaltransform_output,
    warp_command,
)
from tools.church.residuals import summarise


class GcpArgumentTests(unittest.TestCase):
    def test_emits_one_flag_group_per_point(self) -> None:
        points = [
            GroundControlPoint(10.0, 20.0, -61.0, 46.0, CONTROL_ROLE, "a"),
            GroundControlPoint(30.0, 40.0, -61.1, 46.1, CONTROL_ROLE, "b"),
        ]
        args = build_gcp_arguments(points)
        self.assertEqual(args.count("-gcp"), 2)
        self.assertEqual(len(args), 10)
        self.assertEqual(args[0], "-gcp")
        self.assertEqual(args[1], "10.0")
        self.assertEqual(args[2], "20.0")

    def test_only_control_points_reach_gdal(self) -> None:
        points = [
            GroundControlPoint(10.0, 20.0, -61.0, 46.0, CONTROL_ROLE, "a"),
            GroundControlPoint(30.0, 40.0, -61.1, 46.1, CHECK_ROLE, "held out"),
        ]
        self.assertEqual(build_gcp_arguments(points).count("-gcp"), 1)


class WarpCommandTests(unittest.TestCase):
    def test_uses_thin_plate_spline_and_web_mercator(self) -> None:
        command = warp_command("in.tif", "out.tif")
        self.assertIn("-tps", command)
        self.assertIn("-t_srs", command)
        self.assertIn("EPSG:3857", command)
        self.assertEqual(command[0], "gdalwarp")

    def test_affine_mode_omits_tps(self) -> None:
        self.assertNotIn("-tps", warp_command("in.tif", "out.tif", tps=False))


class TransformParsingTests(unittest.TestCase):
    def test_parses_gdaltransform_triples(self) -> None:
        text = "-6801234.5 5812345.6 0\n-6801000.0 5812000.0 0\n"
        self.assertEqual(
            parse_gdaltransform_output(text),
            [(-6801234.5, 5812345.6), (-6801000.0, 5812000.0)],
        )

    def test_ignores_blank_lines(self) -> None:
        self.assertEqual(len(parse_gdaltransform_output("1.0 2.0 0\n\n3.0 4.0 0\n\n")), 2)


class CheckErrorTests(unittest.TestCase):
    def test_perfect_transform_gives_zero_error(self) -> None:
        point = GroundControlPoint(0.0, 0.0, -61.0, 46.0, CHECK_ROLE, "x")
        self.assertAlmostEqual(check_errors([point], [point.mercator])[0], 0.0, places=6)

    def test_error_is_cosine_corrected_ground_distance(self) -> None:
        point = GroundControlPoint(0.0, 0.0, -61.0, 46.0, CHECK_ROLE, "x")
        actual_x, actual_y = point.mercator
        errors = check_errors([point], [(actual_x + 1000.0, actual_y)])
        self.assertAlmostEqual(errors[0], 1000.0 * math.cos(math.radians(46.0)), places=3)

    def test_length_mismatch_is_rejected(self) -> None:
        point = GroundControlPoint(0.0, 0.0, -61.0, 46.0, CHECK_ROLE, "x")
        with self.assertRaises(ValueError):
            check_errors([point], [])


class MetadataTests(unittest.TestCase):
    def _report(self):
        points = [
            GroundControlPoint(0.0, 0.0, -61.0, 46.0, CONTROL_ROLE, "a"),
            GroundControlPoint(100.0, 0.0, -60.9, 46.0, CONTROL_ROLE, "b"),
            GroundControlPoint(0.0, 100.0, -61.0, 46.1, CONTROL_ROLE, "c"),
        ]
        return summarise(points, [], check_errors_m=[25.0, 35.0])

    def test_carries_provenance_and_accuracy(self) -> None:
        metadata = build_metadata(
            county=get_county("inverness"),
            report=self._report(),
            zoom_min=8,
            zoom_max=16,
            source_url="https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~353591~90120835",
            retrieved="2026-07-24",
        )
        self.assertEqual(metadata["county"], "Inverness")
        self.assertEqual(metadata["layer_id"], "church-inverness")
        self.assertEqual(metadata["published_year"], 1884)
        self.assertEqual(metadata["rumsey_id"], "RUMSEY~8~1~353591~90120835")
        self.assertEqual(metadata["retrieved"], "2026-07-24")
        self.assertEqual(metadata["zoom"], {"min": 8, "max": 16})
        self.assertEqual(metadata["srs"], "EPSG:3857")
        self.assertIn("check_rms_m", metadata["accuracy"])

    def test_records_the_rumsey_licence(self) -> None:
        metadata = build_metadata(
            county=get_county("inverness"),
            report=self._report(),
            zoom_min=8,
            zoom_max=16,
            source_url="https://example.invalid",
            retrieved="2026-07-24",
        )
        self.assertIn("Rumsey", metadata["attribution"])
        self.assertIn("davidrumsey.com", metadata["licence_url"])

    def test_is_json_serialisable(self) -> None:
        import json

        metadata = build_metadata(
            county=get_county("inverness"),
            report=self._report(),
            zoom_min=8,
            zoom_max=16,
            source_url="https://example.invalid",
            retrieved="2026-07-24",
        )
        self.assertIsInstance(json.dumps(metadata), str)


if __name__ == "__main__":
    unittest.main()
```

Create `tools/church/tests/test_make_tiles.py`:

```python
import unittest

from tools.church.make_tiles import tile_command


class TileCommandTests(unittest.TestCase):
    def test_uses_xyz_scheme_not_tms(self) -> None:
        command = tile_command("warped.tif", "tiles/church-inverness", 8, 16)
        self.assertIn("--xyz", command)

    def test_passes_the_zoom_range(self) -> None:
        command = tile_command("warped.tif", "tiles/church-inverness", 8, 16)
        self.assertIn("--zoom=8-16", command)

    def test_rejects_inverted_zoom_range(self) -> None:
        with self.assertRaises(ValueError):
            tile_command("warped.tif", "out", 16, 8)

    def test_names_the_input_and_output_last(self) -> None:
        command = tile_command("warped.tif", "tiles/church-inverness", 8, 16)
        self.assertEqual(command[-2:], ["warped.tif", "tiles/church-inverness"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: FAIL with `ModuleNotFoundError` for `tools.church.georeference` and `tools.church.make_tiles`

- [ ] **Step 3: Write `tools/church/georeference.py`**

```python
"""Warp a Church county sheet to EPSG:3857 and measure how well it landed.

Thin-plate spline, not affine. Church county maps were compiled for legibility
of resident names rather than surveyed on a grid, so their internal geometry
does not admit a global affine fit. See docs/CHURCH_MAPS.md.

Accuracy comes from `role=check` points that never touch the warp. TPS
interpolates its control points exactly, so measuring error there would always
return ~0 regardless of how good the result actually is.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import subprocess

from tools.church.counties import ChurchCounty, get_county
from tools.church.gcps import CONTROL_ROLE, GroundControlPoint, load_gcps, split_roles
from tools.church.geometry import mercator_to_ground_metres
from tools.church.residuals import AccuracyReport, summarise

RUMSEY_ATTRIBUTION = (
    "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries"
)
RUMSEY_LICENCE_URL = "https://www.davidrumsey.com/about/copyright-and-permissions"


def build_gcp_arguments(points: list[GroundControlPoint]) -> list[str]:
    """Build `-gcp pixel_x pixel_y mercator_x mercator_y` flags for gdal_translate.

    Check points are deliberately excluded - including them would make the
    accuracy measurement circular.
    """
    arguments: list[str] = []
    for point in points:
        if point.role != CONTROL_ROLE:
            continue
        world_x, world_y = point.mercator
        arguments += ["-gcp", str(point.pixel_x), str(point.pixel_y), str(world_x), str(world_y)]
    return arguments


def warp_command(translated: str, output: str, tps: bool = True) -> list[str]:
    """gdalwarp invocation targeting Web Mercator."""
    command = ["gdalwarp", "-r", "bilinear", "-t_srs", "EPSG:3857"]
    if tps:
        command.append("-tps")
    command += ["-co", "COMPRESS=DEFLATE", "-co", "TILED=YES", translated, output]
    return command


def parse_gdaltransform_output(text: str) -> list[tuple[float, float]]:
    """Parse `gdaltransform` stdout, which emits `x y z` per line."""
    results: list[tuple[float, float]] = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            results.append((float(parts[0]), float(parts[1])))
    return results


def check_errors(
    check_points: list[GroundControlPoint], transformed: list[tuple[float, float]]
) -> list[float]:
    """Ground-metre error at each held-out check point."""
    if len(check_points) != len(transformed):
        raise ValueError(
            f"expected {len(check_points)} transformed points, got {len(transformed)}"
        )
    errors: list[float] = []
    for point, (got_x, got_y) in zip(check_points, transformed):
        want_x, want_y = point.mercator
        errors.append(
            mercator_to_ground_metres(math.hypot(got_x - want_x, got_y - want_y), point.lat)
        )
    return errors


def build_metadata(
    county: ChurchCounty,
    report: AccuracyReport,
    zoom_min: int,
    zoom_max: int,
    source_url: str,
    retrieved: str,
) -> dict:
    """Provenance + accuracy record written beside the tiles."""
    return {
        "county": county.name,
        "slug": county.slug,
        "layer_id": county.layer_id,
        "published_year": county.published_year,
        "scale_denominator": county.scale_denominator,
        "rumsey_id": county.rumsey_id,
        "source_url": source_url,
        "retrieved": retrieved,
        "srs": "EPSG:3857",
        "tile_scheme": "xyz",
        "zoom": {"min": zoom_min, "max": zoom_max},
        "attribution": RUMSEY_ATTRIBUTION,
        "licence_url": RUMSEY_LICENCE_URL,
        "warp": "thin-plate-spline",
        "accuracy": report.as_dict(),
    }


def georeference(
    slug: str, source: pathlib.Path, gcp_path: pathlib.Path, output_dir: pathlib.Path
) -> tuple[pathlib.Path, AccuracyReport]:
    """Warp `source` using the county's GCPs, returning the raster and its accuracy."""
    county = get_county(slug)
    points = load_gcps(gcp_path)
    control, check = split_roles(points)
    if len(control) < 3:
        raise ValueError(
            f"{gcp_path} has {len(control)} control points; need at least 3. "
            f"Capture them in QGIS Georeferencer - see docs/CHURCH_MAPS.md."
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    translated = output_dir / f"{slug}-gcp.tif"
    subprocess.run(
        ["gdal_translate", "-q", "-a_srs", "EPSG:3857",
         *build_gcp_arguments(control), str(source), str(translated)],
        check=True,
    )

    warped = output_dir / f"{slug}-3857.tif"
    subprocess.run(warp_command(str(translated), str(warped)), check=True)

    errors: list[float] | None = None
    if check:
        stdin = "\n".join(f"{p.pixel_x} {p.pixel_y}" for p in check)
        completed = subprocess.run(
            ["gdaltransform", "-tps", str(translated)],
            input=stdin, capture_output=True, text=True, check=True,
        )
        errors = check_errors(check, parse_gdaltransform_output(completed.stdout))

    return warped, summarise(control, check, errors)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Georeference a Church county sheet.")
    parser.add_argument("slug")
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--gcps", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("build/church"))
    args = parser.parse_args(argv)
    warped, report = georeference(args.slug, args.source, args.gcps, args.output / args.slug)
    print(warped)
    print(json.dumps(report.as_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Write `tools/church/make_tiles.py`**

```python
"""Slice a warped Church raster into an XYZ tile pyramid with a metadata sidecar."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess

from tools.church.counties import get_county
from tools.church.georeference import RUMSEY_ATTRIBUTION, build_metadata
from tools.church.residuals import AccuracyReport

GDAL2TILES = "gdal2tiles.py"


def tile_command(source: str, output_dir: str, zoom_min: int, zoom_max: int) -> list[str]:
    """gdal2tiles invocation producing XYZ (not TMS) tiles."""
    if zoom_min > zoom_max:
        raise ValueError(f"zoom_min {zoom_min} exceeds zoom_max {zoom_max}")
    return [
        GDAL2TILES,
        "--xyz",
        f"--zoom={zoom_min}-{zoom_max}",
        "--resampling=bilinear",
        f"--attribution={RUMSEY_ATTRIBUTION}",
        source,
        output_dir,
    ]


def make_tiles(
    slug: str,
    warped: pathlib.Path,
    output_dir: pathlib.Path,
    report: AccuracyReport,
    source_url: str,
    retrieved: str,
    zoom_min: int = 8,
    zoom_max: int = 16,
) -> pathlib.Path:
    """Produce the tile pyramid and write metadata.json beside it."""
    output_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(tile_command(str(warped), str(output_dir), zoom_min, zoom_max), check=True)
    metadata = build_metadata(
        county=get_county(slug),
        report=report,
        zoom_min=zoom_min,
        zoom_max=zoom_max,
        source_url=source_url,
        retrieved=retrieved,
    )
    metadata_path = output_dir / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return metadata_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Tile a warped Church raster.")
    parser.add_argument("slug")
    parser.add_argument("--warped", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--retrieved", required=True)
    parser.add_argument("--zoom-min", type=int, default=8)
    parser.add_argument("--zoom-max", type=int, default=16)
    args = parser.parse_args(argv)
    # Accuracy is recomputed by georeference.py; an empty report here keeps the
    # CLI usable for re-tiling an already-warped raster.
    report = AccuracyReport(affine_rms_m=0.0, control_count=0, check_count=0)
    print(make_tiles(args.slug, args.warped, args.output, report,
                     args.source_url, args.retrieved, args.zoom_min, args.zoom_max))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m unittest discover -s tools/church/tests -t . -v`
Expected: PASS, 66 tests total.

- [ ] **Step 6: Commit**

```bash
git add tools/church/georeference.py tools/church/make_tiles.py tools/church/tests/test_georeference.py tools/church/tests/test_make_tiles.py
git commit -m "feat(tools): warp Church sheets with TPS and emit accuracy metadata"
```

---

### Task 8: Ignore generated tiles, document the workflow, capture Inverness GCPs

**Files:**
- Modify: `.gitignore`
- Create: `docs/CHURCH_MAPS.md`
- Modify: `tools/church/gcps/inverness.csv`

**Interfaces:**
- Consumes: everything from Tasks 2–7
- Produces: a populated `tools/church/gcps/inverness.csv` and a measured accuracy figure used by Tasks 9–10

- [ ] **Step 1: Ignore generated artefacts**

Append to `.gitignore`:

```gitignore

# Generated Church map rasters and tiles. Never committed - shipped as GitHub
# Release assets instead. See docs/CHURCH_MAPS.md.
build/church/
tiles/church-*/
```

- [ ] **Step 2: Install the missing GDAL tiling tool**

`gdal2tiles.py` and the Python `osgeo` bindings are not present on a stock setup.

```bash
brew install gdal
```

Run: `command -v gdal2tiles.py && gdal2tiles.py --version`
Expected: a path and a version string. If `brew install gdal` does not provide it, use `pipx install gdal2tiles` and confirm `gdal2tiles --help` runs.

- [ ] **Step 3: Write `docs/CHURCH_MAPS.md`**

```markdown
# A.F. Church County Maps

Ambrose F. Church was commissioned by the Nova Scotia legislature in 1864 to
produce a topographical township map for each of the province's 18 counties,
finishing in 1888. Each sheet names the head of household at nearly every
dwelling, and gives occupations for prominent townsfolk — which is what makes
them useful for property due diligence a century and a half later.

## Dates: publication, not survey

The David Rumsey catalogue's `Date` field usually reads **1864** — the survey and
copyright date for the series as a whole. The true publication date lives in each
item's `Note` field. We display publication dates. Inverness is catalogued 1864
but was published **1884**.

## Source availability

| County | Published | Scale | Source | Status |
|---|---|---|---|---|
| Inverness | 1884 | 1:63,360 | Rumsey `RUMSEY~8~1~353591~90120835` (34,427 × 34,543) | Wired |
| Victoria | 1884 | 1:63,360 | Rumsey `RUMSEY~8~1~374820~90141224` | Available, not wired |
| Richmond | 1885 | 1:84,269 | Rumsey `RUMSEY~8~1~373669~90140407` | Available, not wired |
| Cape Breton | 1884 | 1:63,360 | Rumsey `RUMSEY~8~1~374821~90141223` | Available, not wired |
| Cumberland | 1873 | 1:42,240 | Rumsey `RUMSEY~8~1~372500~90139420` | Available, not wired |
| Kings | 1872 | 1:63,360 | Rumsey `RUMSEY~8~1~372851~90139591` | Available, not wired |
| Lunenburg | 1883 | 1:63,360 | Rumsey `RUMSEY~8~1~200267~3000165` | Available, not wired |
| Halifax | 1865 | 1:99,000 | Rumsey `RUMSEY~8~1~351990~90119171` (H.F. Walling, not Church) | Available, not wired |
| **Annapolis** | **1876** | 1:63,360 | **None — see gap below** | **Blocked on sourcing** |
| Pictou, Antigonish, Guysborough, Colchester, Hants, Digby, Yarmouth, Shelburne, Queens | 1865–1888 | varies | Not in Rumsey | Not investigated |

## The Annapolis gap

Verified 2026-07-24: **no free full-resolution scan of the 1876 Annapolis sheet
exists.** Everything checked, and what it turned out to be:

- **David Rumsey** — zero hits for a Church Annapolis map. The only Rumsey
  Annapolis map is Roe Brothers 1878 (`RUMSEY~8~1~33063~1170426`) at 1:443,520,
  with no parcel or owner detail.
- **NS Archives** (`maps/archives/?ID=942`) — a *fragment*. Downloaded and
  inspected: 1786 × 2661 px, 841 KB, a photographic copy print of only the
  south-east (Lunenburg boundary) corner, ruler and hole-punches in frame. About
  1/20th the linear resolution of a Rumsey scan. Crown copyright.
- **GANS A.F. Church Maps Project** — digitized Antigonish, Cumberland, Halifax,
  Hants, Lunenburg, Queens, Shelburne, Guysborough; georeferenced Antigonish,
  Hants, Halifax with 300–500 anchor points each. Annapolis in neither list.
- **MIRCS** (`mircs.ca`) — dead domain (NXDOMAIN). Wayback holds working papers
  only, no county scans.
- **DNR/NRR library** — paper reproductions only, $19.35/county, two ≈36″ × 60″
  sheets.
- **Internet Archive**, **HantsGenWeb/Rootsweb** — nothing usable.
- **Library and Archives Canada** — holds it (IdNumber 4000751). The site sits
  behind a bot challenge, so ordering goes through reprography.

**Current path:** an enquiry to LAC, drafted in
`docs/annapolis-church-lac-enquiry.md`. LAC is preferred because its copyright
may be expired, which would avoid the Nova Scotia Crown copyright restriction
that NS Archives and DNR both carry.

## Licensing

| Source | Terms |
|---|---|
| David Rumsey | CC BY-NC-SA. Attribution: "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries". This app is non-commercial and MIT-licensed, which fits. |
| NS Archives / DNR | Crown copyright © Province of Nova Scotia. Republishing tiles needs written permission. |
| LAC | Pending — see the enquiry document. |

The originals are all public domain by age. It is the *scan* whose rights vary by
digitizing institution.

## Why these maps need thin-plate splines

The 4-corner affine recipe in `docs/FLETCHER_GEOREFERENCING.md` does **not** work
here. Fletcher sheets are systematic grid surveys with true rectangular lat/lon
bounds. Church county maps were compiled for legibility of resident names, and
their internal geometry is correspondingly loose:

- StFX's Eigg Mountain GIS project: the Church map's geography "is so distorted
  that it is impossible to georeference to the modern base map in ArcView."
- GANS needed **300–500 anchor points per county** to succeed.

So we use dense GCPs with `gdalwarp -tps`.

## Accuracy reporting

Two numbers appear in each layer's `metadata.json`, and they mean different things:

- **`affine_rms_m`** — how badly a plain affine fits the control points. A
  *distortion index*, not the layer's accuracy. It is the quantitative form of
  the StFX observation.
- **`check_rms_m`** — the error of the delivered TPS warp measured at points held
  out of it entirely (`role=check` in the GCP CSV). **This is the honest accuracy
  figure**, and the only one shown to users.

A thin-plate spline interpolates its control points exactly, so error measured at
control points is always ≈0 no matter how bad the warp is. Held-out points are
the only meaningful measurement.

## Producing a county

```bash
# 1. Fetch the source sheet (walks IIIF in 2048 px regions, then mosaics).
python3 -m tools.church.fetch_rumsey inverness --output build/church

# 2. Capture GCPs in QGIS: Raster > Georeferencer, load build/church/inverness/inverness.tif,
#    add points against a modern basemap, then File > Save GCP Points As... (.points).
#    Convert to tools/church/gcps/inverness.csv, marking ~20% of rows role=check.

# 3. Warp to EPSG:3857 and measure accuracy.
python3 -m tools.church.georeference inverness \
  --source build/church/inverness/inverness.tif \
  --gcps tools/church/gcps/inverness.csv \
  --output build/church

# 4. Tile.
python3 -m tools.church.make_tiles inverness \
  --warped build/church/inverness/inverness-3857.tif \
  --output tiles/church-inverness \
  --source-url "https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~353591~90120835" \
  --retrieved 2026-07-24

# 5. Package and upload as a GitHub Release asset (tiles are gitignored).
tar -czf church-inverness-v1.tar.gz -C tiles church-inverness
gh release create tiles/church-inverness-v1 church-inverness-v1.tar.gz \
  --title "Church Inverness tiles v1" --notes "Generated by tools/church."
```

Tests: `python3 -m unittest discover -s tools/church/tests -t . -v`
```

- [ ] **Step 4: Run the pipeline end-to-end and capture GCPs**

This is the manual, judgement-heavy step the whole plan exists to reach.

1. Run step 1 of the recipe above to fetch Inverness.
2. In QGIS, capture **at least 20 `control` points and 5 `check` points**, spread
   across the sheet rather than clustered. Good targets: river confluences,
   surviving road junctions, harbour points, county-line corners.
3. Write them into `tools/church/gcps/inverness.csv`.
4. Run steps 3 and 4 of the recipe.

Expected: `georeference.py` prints an accuracy report. **Record `check_rms_m`** —
Tasks 9 and 10 put this number in front of users.

- [ ] **Step 5: Judge whether the warp is usable**

Open the warped raster over a modern basemap in QGIS and look at it.

This is a real gate, not a formality. If `check_rms_m` is large enough that
parcels land in the wrong place, or the overlay is visibly unusable, **stop and
report** rather than shipping a layer that misleads. The spec anticipates this
outcome; discovering it here, on a free county, is exactly the point.

- [ ] **Step 6: Commit**

```bash
git add .gitignore docs/CHURCH_MAPS.md tools/church/gcps/inverness.csv
git commit -m "docs: document the Church series, sourcing gap, and tile workflow"
```

---

### Task 9: Wire the web layer

**Files:**
- Create: `web/src/licensing/rumseyLicense.ts`
- Create: `web/src/licensing/rumseyLicense.test.ts`
- Modify: `web/src/layers/layerCatalog.ts` (lines 3–20, the `nativeLayerCatalog` array, and the `provinceLayerCatalog` filter near line 591)
- Modify: `web/src/layers/layerCatalog.test.ts`

**Interfaces:**
- Consumes: the `check_rms_m` figure recorded in Task 8
- Produces:
  - `RUMSEY_ATTRIBUTION`, `RUMSEY_LICENCE_URL` from `web/src/licensing/rumseyLicense.ts`
  - `ChurchCountyLayerId`, `RumseyReferenceLayerId`, `churchLayerCatalog` from `layerCatalog.ts`

- [ ] **Step 1: Write the failing tests**

Create `web/src/licensing/rumseyLicense.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RUMSEY_ATTRIBUTION, RUMSEY_LICENCE_URL } from "./rumseyLicense";

describe("Rumsey licensing constants", () => {
  it("names the collection, center, and library exactly", () => {
    expect(RUMSEY_ATTRIBUTION).toBe(
      "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries",
    );
  });

  it("points at the copyright and permissions page", () => {
    expect(RUMSEY_LICENCE_URL).toBe(
      "https://www.davidrumsey.com/about/copyright-and-permissions",
    );
  });
});
```

Append to `web/src/layers/layerCatalog.test.ts`:

```ts
describe("Church historical map series", () => {
  it("registers Inverness with its publication year, not its survey year", () => {
    const inverness = churchLayerCatalog.find(
      (layer) => layer.id === "church-inverness",
    );
    expect(inverness).toBeDefined();
    expect(inverness?.name).toBe("Inverness (Church 1884)");
    // Rumsey's Date field says 1864; that is the survey date, not publication.
    expect(inverness?.sourceDate).toContain("1884");
    expect(inverness?.sourceDate).not.toContain("1864");
  });

  it("carries the Rumsey reference licence, like Fletcher", () => {
    for (const layer of churchLayerCatalog) {
      expect(layer.licence).toBe("rumsey-reference");
    }
  });

  it("stays out of the province-licensed renderable set", () => {
    const provinceIds = provinceLayerCatalog.map((layer) => layer.id);
    for (const layer of churchLayerCatalog) {
      expect(provinceIds).not.toContain(layer.id);
    }
  });

  it("keeps Fletcher out of the Church group", () => {
    expect(churchLayerCatalog.map((layer) => layer.id)).not.toContain("fletcher");
  });

  it("discloses georeferencing accuracy in the caveat", () => {
    for (const layer of churchLayerCatalog) {
      expect(layer.webCaveat).toMatch(/±\s*\d+\s*m/);
    }
  });
});
```

Add `churchLayerCatalog` to the existing import block at the top of
`web/src/layers/layerCatalog.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test`
Expected: FAIL — `rumseyLicense` module not found, and `churchLayerCatalog` is not exported.

- [ ] **Step 3: Create `web/src/licensing/rumseyLicense.ts`**

```ts
// David Rumsey Map Collection attribution, following the provinceLicense.ts
// constant pattern. The collection's terms are CC BY-NC-SA, but no version is
// hardcoded here: the copyright page is authoritative and has changed version
// before. The nuance is documented in docs/CHURCH_MAPS.md.
export const RUMSEY_ATTRIBUTION =
  "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries";

export const RUMSEY_LICENCE_URL =
  "https://www.davidrumsey.com/about/copyright-and-permissions";
```

- [ ] **Step 4: Update the layer id unions in `web/src/layers/layerCatalog.ts`**

Replace lines 3–20 (the `NativeLayerId` through `ProvinceLayerId` block) with:

```ts
/** Church county sheets: catalogued, Rumsey-licensed, never province-licensed. */
export type ChurchCountyLayerId = "church-inverness";

export type NativeLayerId =
  | "fletcher"
  | ChurchCountyLayerId
  | "ns-aerial"
  | "nsprd"
  | "crown-lands"
  | "flood-risk"
  | "waterfalls"
  | "water-features"
  | "roads";

/**
 * Historical layers sourced from David Rumsey rather than the Province. They are
 * excluded from the province-licensed renderable set at the type level.
 */
export type RumseyReferenceLayerId = "fletcher" | ChurchCountyLayerId;

export type TopographyLayerId = "contours";

export type WebOnlyProvinceLayerId = "buildings" | TopographyLayerId;

export type ProvinceLayerId =
  | Exclude<NativeLayerId, RumseyReferenceLayerId>
  | WebOnlyProvinceLayerId;
```

- [ ] **Step 5: Add the Inverness catalog entry**

In `nativeLayerCatalog`, immediately after the `fletcher` entry, insert
(**substituting the `check_rms_m` you recorded in Task 8** for `NN`):

```ts
  {
    id: "church-inverness",
    name: "Inverness (Church 1884)",
    serviceUrl: "/tiles/church-inverness/{z}/{x}/{y}.png",
    nativeDefaultVisibility: false,
    minZoom: 8,
    maxZoom: 16,
    opacity: 1,
    licence: "rumsey-reference",
    webAvailability: "rights-pending",
    webCaveat: "Published 1884 · georeferenced ±NN m · web view pending tile deploy",
    sourceDate: "A.F. Church survey · published 1884",
    scale: "1:63,360 township map",
    coverage: "Inverness County",
  },
```

- [ ] **Step 6: Update the `provinceLayerCatalog` filter**

Near line 591, change the filter's type predicate from `Exclude<NativeLayerId, "fletcher">`
to `Exclude<NativeLayerId, RumseyReferenceLayerId>`:

```ts
export const provinceLayerCatalog: readonly (
  WebLayerDescriptor & { id: ProvinceLayerId }
)[] = [
  ...nativeLayerCatalog.filter(
    (layer): layer is WebLayerDescriptor & {
      id: Exclude<NativeLayerId, RumseyReferenceLayerId>;
    } => layer.licence === "province-restricted",
  ),
  ...webOnlyProvinceLayerCatalog,
];
```

- [ ] **Step 7: Add the `churchLayerCatalog` selector**

After the `nativeLayerCatalog` declaration, add:

```ts
/** The Church county sheets, for group rendering and tests. */
export const churchLayerCatalog: readonly (
  WebLayerDescriptor & { id: ChurchCountyLayerId }
)[] = nativeLayerCatalog.filter(
  (layer): layer is WebLayerDescriptor & { id: ChurchCountyLayerId } =>
    layer.id.startsWith("church-"),
);
```

- [ ] **Step 8: Run tests and lint**

Run: `cd web && npm test && npm run lint`
Expected: PASS. If `App.test.tsx` asserts on the last/count of native rows, update
that assertion to account for the new entry.

- [ ] **Step 9: Commit**

```bash
git add web/src/licensing/rumseyLicense.ts web/src/licensing/rumseyLicense.test.ts web/src/layers/layerCatalog.ts web/src/layers/layerCatalog.test.ts web/src/App.test.tsx
git commit -m "feat(web): catalog the Church Inverness historical map layer"
```

---

### Task 10: Wire the iOS layer

**Files:**
- Modify: `ns-marks-the-spot/Layers/LayerDescriptor.swift:3-10` (the `LayerID` enum)
- Modify: `ns-marks-the-spot/Layers/LayerCatalog.swift` (the `all` array)
- Modify: `ns-marks-the-spot/App/AppContainer.swift:46-53` (`makeLayer(from:)`)
- Modify: `ns-marks-the-spotTests/Layers/LayerCatalogTests.swift`

**Interfaces:**
- Consumes: the `check_rms_m` figure recorded in Task 8
- Produces: `LayerID.churchInverness`

- [ ] **Step 1: Write the failing test**

Append to `ns-marks-the-spotTests/Layers/LayerCatalogTests.swift` (inside the existing test class):

```swift
    func testChurchInvernessIsCatalogued() throws {
        let descriptor = try XCTUnwrap(
            LayerCatalog.all.first { $0.id == .churchInverness }
        )
        XCTAssertEqual(descriptor.name, "Inverness (Church 1884)")
        XCTAssertEqual(descriptor.sourceKind, .remoteXYZTemplate)
        XCTAssertEqual(descriptor.renderingRole, .overlay)
        // No bundled tiles yet, so nothing to download for offline use.
        XCTAssertEqual(descriptor.offlinePolicy, .onlineOnly)
        // A non-rendering layer must not default to visible.
        XCTAssertFalse(descriptor.defaultVisibility)
    }

    func testChurchInvernessCreditsRumsey() throws {
        let descriptor = try XCTUnwrap(
            LayerCatalog.all.first { $0.id == .churchInverness }
        )
        XCTAssertTrue(descriptor.attribution.provider.contains("David Rumsey"))
    }

    func testChurchInvernessCaveatStatesPublicationYearAndAccuracy() throws {
        let descriptor = try XCTUnwrap(
            LayerCatalog.all.first { $0.id == .churchInverness }
        )
        let caveat = try XCTUnwrap(descriptor.userCaveat)
        // 1884 is publication; Rumsey's 1864 Date field is the survey year.
        XCTAssertTrue(caveat.contains("1884"))
        XCTAssertFalse(caveat.contains("1864"))
        XCTAssertTrue(caveat.contains("±"))
    }

    func testChurchLayerIdMatchesTheWebCatalog() {
        XCTAssertEqual(LayerID.churchInverness.rawValue, "church-inverness")
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
"$HOME/.claude/bin/xcode-build-gate.sh" --wait && xcodebuild test -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ns-marks-the-spotTests/LayerCatalogTests
```
Expected: compile failure — `.churchInverness` is not a member of `LayerID`.

Note: the build gate is mandatory on this machine (16 GB). Do not bypass it.

- [ ] **Step 3: Add the enum case**

In `ns-marks-the-spot/Layers/LayerDescriptor.swift`, add to `LayerID`:

```swift
nonisolated enum LayerID: String, CaseIterable, Sendable {
    case fletcher
    case churchInverness = "church-inverness"
    case nsAerial = "ns-aerial"
    case nsPropertyBoundaries = "nsprd"
    case crownLands = "crown-lands"
    case floodRisk = "flood-risk"
    case waterfalls
}
```

- [ ] **Step 4: Add the descriptor**

In `ns-marks-the-spot/Layers/LayerCatalog.swift`, add a private constant beside
`oldMapsOnlineFletcherTemplate` (substituting your recorded accuracy for `NN`):

```swift
    private static let churchInvernessTemplate = "https://tiles.example.invalid/church-inverness/{z}/{x}/{y}.png"
```

and insert this descriptor into `all`, immediately after the `.fletcher` entry:

```swift
        LayerDescriptor(
            id: .churchInverness,
            name: "Inverness (Church 1884)",
            sourceKind: .remoteXYZTemplate,
            sourceURL: URL(string: churchInvernessTemplate),
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 8,
            maxZoom: 16,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-inverness",
            attribution: LayerAttribution(
                provider: "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries",
                copyright: nil,
                disclaimer: "Historical maps are provided for reference and historical interest only.",
                licenseTitle: nil,
                licenseURL: URL(string: "https://www.davidrumsey.com/about/copyright-and-permissions")
            ),
            userCaveat: "A.F. Church county map (published 1884); georeferenced ±NN m — historical reference, not for navigation."
        ),
```

**Replace `tiles.example.invalid` with the real Release-asset host once the deploy
step from Task 8's workflow is live.** Until then the layer is registered but not
usefully renderable, which is why `defaultVisibility` is `false`.

- [ ] **Step 5: Add the `makeLayer` arm**

In `ns-marks-the-spot/App/AppContainer.swift`, add to the `switch descriptor.id`
immediately after the `.fletcher` case:

```swift
        case .churchInverness:
            guard let url = descriptor.sourceURL else { return nil }
            return MapKitTileLayer(
                descriptor: descriptor,
                type: .tile(url)
            )
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
"$HOME/.claude/bin/xcode-build-gate.sh" --wait && xcodebuild test -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ns-marks-the-spotTests/LayerCatalogTests
```
Expected: PASS. If `LayerStatusTests` or `LayerInstallationTests` assert on the
catalog's count, update those counts too and re-run the full suite.

- [ ] **Step 7: Commit**

```bash
git add ns-marks-the-spot/Layers/LayerDescriptor.swift ns-marks-the-spot/Layers/LayerCatalog.swift ns-marks-the-spot/App/AppContainer.swift ns-marks-the-spotTests/
git commit -m "feat(ios): catalog the Church Inverness historical map layer"
```

---

### Task 11: Sync the project documentation

The project's CLAUDE.md requires documentation updates whenever a new layer type lands.

**Files:**
- Modify: `ARCHITECTURE.md` ("Layer Catalog And Offline Storage")
- Modify: `README.md`
- Modify: `web/README.md`
- Modify: `plan.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing

- [ ] **Step 1: Update `ARCHITECTURE.md`**

In the "Layer Catalog And Offline Storage" section, add:

```markdown
### A.F. Church county series

Church county sheets (1864–1888) register alongside Fletcher as
`licence: "rumsey-reference"` layers, excluded from the province-licensed
renderable set via `RumseyReferenceLayerId`. Unlike Fletcher, their tiles are
generated in-repo by `tools/church/` (thin-plate-spline warp to EPSG:3857) and
distributed as GitHub Release assets rather than committed — see
`docs/CHURCH_MAPS.md`. Each layer's caveat carries a measured georeferencing
accuracy taken from held-out check points, not from control-point residuals.
```

- [ ] **Step 2: Update `README.md` and `web/README.md`**

Add "Inverness (Church 1884)" to the layer lists, noting it is a historical
overlay with a stated georeferencing accuracy.

- [ ] **Step 3: Update `plan.md`**

Annotate the "Additional historical map collections beyond Fletcher" item as
partially complete: Church series pipeline built and Inverness wired; Annapolis
blocked on LAC sourcing.

- [ ] **Step 4: Verify no placeholders leaked in**

Run: `grep -nE "TBD|TODO|±NN|NN m|example.invalid" README.md web/README.md ARCHITECTURE.md plan.md docs/CHURCH_MAPS.md`
Expected: no output. Any hit is an unsubstituted placeholder — fix it.

- [ ] **Step 5: Commit and open the PR**

```bash
git add ARCHITECTURE.md README.md web/README.md plan.md
git commit -m "docs: record the Church series in the project documentation"
git push -u origin HEAD
gh pr create --base nightly --title "feat: Church tile pipeline proven on Inverness" --body "$(cat <<'BODY'
Builds the A.F. Church georeference-and-tile pipeline and proves it end-to-end on
Inverness County, plus drafts the LAC enquiry that unblocks Annapolis.

- `tools/church/` — stdlib-only core (county registry, Mercator geometry with
  ground-distance correction, validated GCP parsing, accuracy measurement) plus
  thin GDAL subprocess wrappers.
- Warps with `gdalwarp -tps`, not the Fletcher 4-corner affine: Church sheets are
  compiled maps whose geometry defeats a global affine fit.
- Accuracy is measured at held-out check points. TPS interpolates its control
  points exactly, so control-point residuals would always read ~0.
- Tiles are gitignored and shipped as GitHub Release assets.
- `docs/CHURCH_MAPS.md` records the series, the verified Annapolis sourcing gap,
  and the workflow.

Annapolis remains blocked: no free full-resolution scan exists. See
`docs/annapolis-church-lac-enquiry.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Track 1 — LAC enquiry | 1 |
| Track 2 — `tools/church/` (fetch, georeference, tiles, GCPs) | 2, 3, 4, 5, 6, 7 |
| Track 2 — TPS not affine | 7 (`warp_command`), constraint |
| Track 2 — residuals feed the caveat | 5, 7, 9, 10 |
| Track 2 — GCP capture via QGIS | 8 |
| Track 2 — gdal2tiles not installed | 8 step 2 |
| Track 3 — Release assets, gitignored | 8 step 1, 8 recipe step 5 |
| Track 3 — differing web vs iOS source URLs | 9 step 5, 10 step 4 |
| Track 4 — web wiring | 9 |
| Track 4 — iOS wiring | 10 |
| Track 5 — `docs/CHURCH_MAPS.md` | 8 step 3 |
| Testing — synthetic fixtures, no network | 5, 6 |
| Testing — manual overlay gate | 8 step 5 |
| Docs sync (project CLAUDE.md) | 11 |

**Placeholders:** `NN` in Tasks 9 and 10 and `tiles.example.invalid` in Task 10
are *deliberate*, because the accuracy figure and tile host cannot exist until
Task 8 runs. Both are called out at their use site and swept by the grep in Task
11 step 4.

**Type consistency:** `AccuracyReport` fields (`affine_rms_m`, `check_rms_m`,
`check_max_m`, `control_count`, `check_count`) are consistent across Tasks 5, 7.
`GroundControlPoint` field names and `.mercator` are consistent across Tasks 4,
5, 7. `ChurchCounty.layer_id` matches `LayerID.churchInverness.rawValue` and the
web `id` — asserted by a test in Task 10.
