# Fletcher Feature-Led Georeferencing v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Georeference Fletcher Sheet 19 to the tight z14 bar (~30–50 m) with a
dense-GCP iterative TPS workflow, produce staged tiles the user accepts in the
web map, and leave behind sheet-agnostic tooling for the remaining 23 sheets.

**Architecture:** A small family of `tools/fletcher/feature_*` modules (schema,
importer, fit/score, candidates, QA renders, report) reusing the proven
`tools/church` GDAL command builders and geometry helpers. The observation JSON
is the single source of truth; rasters, crops, and tiles stay on the Bazzite
compute workspace. Phase A builds tooling with unittest TDD; Phase B runs the
Sheet 19 pilot with Claude visually verifying every GCP and the user accepting
the staged overlay.

**Tech Stack:** Python 3 stdlib (CI-safe), GDAL CLI (`gdal_translate`,
`gdalwarp -tps`, `gdaltransform`, `gdal2tiles`) on the Bazzite `nsmarks-gis`
distrobox, OpenCV only on Bazzite behind lazy imports, existing React/Leaflet
web map for staging.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-fletcher-feature-led-georeferencing-v2-design.md`.
- Direct-Rumsey sources only; Sheet 19 source SHA-256 must equal
  `965ae592a1aa4276425a43d54b737669f7662f34c179e4861cb6d9284374f319`.
- Nothing OldMapsOnline-derived, ever.
- Committed artifacts must never contain `pid`, `property_selector`,
  `near_property` keys or `pid-<digits>` strings (spec §6); region labels match
  `qa-region-<n>`.
- Final held-out checks: ≥8 points, ≥3 distinct regions, frozen before scoring,
  scored exactly once, never edited afterwards.
- A control may be demoted only with a recorded identity re-review note citing
  feature evidence, never its residual alone.
- Tests run with `python3 -m unittest discover -s tools/fletcher/tests -t .`
  (CI convention); new test modules must import without numpy/cv2/GDAL.
- No new third-party dependencies. No scans, GeoTIFFs, QA images, or tiles in
  git.
- Bazzite: SSH as `dan@bazzite`; GIS tools only inside the `nsmarks-gis`
  distrobox; workspace
  `/var/home/dan/nsmarks-fletcher-sheet19-feature-pilot-20260726`.
- Commit style: Conventional Commits; branch `claude/fletcher-maps-georeferencing-a3f272`; PR to `nightly` only at the end.

---

## Phase A — sheet-agnostic tooling (local, TDD)

### Task 1: Observation schema module

**Files:**
- Create: `tools/fletcher/feature_observation.py`
- Test: `tools/fletcher/tests/test_feature_observation.py`

**Interfaces:**
- Consumes: `tools.church.gcps.GroundControlPoint(pixel_x, pixel_y, lon, lat, role, label)`, `CONTROL_ROLE`, `CHECK_ROLE`.
- Produces (used by Tasks 2–4, 7):
  - `load_observation(path: pathlib.Path) -> dict` (parses + validates)
  - `validate_observation(obs: dict) -> None` (raises `ValueError`)
  - `accepted_controls(obs: dict) -> list[GroundControlPoint]`
  - `frozen_checks(obs: dict) -> list[GroundControlPoint]`
  - Constants: `SCHEMA_VERSION = 2`, `METHOD_VERSION = "feature-led-v2"`, `ACCEPTED = "accepted"`, `NEEDS_RE_REVIEW = "needs-re-review"`, `REJECTED = "rejected"`

Observation shape (v2):

```json
{
  "schema_version": 2,
  "method_version": "feature-led-v2",
  "sheet_id": "19",
  "source_receipt": {"rumsey_id": "...", "width": 10815, "height": 7549, "sha256": "..."},
  "usable_frame": [[1477.0, 1098.0], [9687.0, 1098.0], [9687.0, 6682.0], [1477.0, 6682.0]],
  "regions": {"qa-region-1": "western coastal acceptance neighbourhood"},
  "controls": [
    {"id": "c02", "feature_type": "road-road-intersection",
     "pixel": {"x": 4216.0, "y": 1255.0},
     "lonlat": {"lon": -61.4693255, "lat": 45.9183328},
     "region": "qa-region-2",
     "identity": "Rear Intervale Road meets Gussieville Road.",
     "uncertainty": "Historical road-centre ink width.",
     "modern_source": {"service_url": "https://...", "layers": [{"layer_id": "8", "object_ids": [3593, 9669]}], "retrieved_at": "2026-07-26"},
     "evidence_crop": {"path": "controls/c02.jpg", "sha256": "..."},
     "review": {"status": "accepted", "note": "...", "date": "2026-07-26"}}
  ],
  "diagnostics": [],
  "final_checks": [],
  "rejected": [{"id": "c13", "reason": "..."}],
  "checks_frozen_at": null
}
```

Rules enforced by `validate_observation`:
- `schema_version == 2`; `source_receipt` has all four fields.
- Point ids unique across `controls + diagnostics + final_checks`.
- Every point has numeric `pixel.x/y`, `lonlat.lon/lat`, a `review.status` in
  `{accepted, needs-re-review, rejected}`, and (for `final_checks` only) a
  `region` matching `^qa-region-\d+$` present in `regions`.
- Privacy guard: recursive walk rejects dict keys in
  `{"pid", "property_selector", "near_property"}` and any string value
  matching `pid[-_]?\d{5,}`.
- `frozen_checks` raises unless `checks_frozen_at` is a non-empty string.

- [ ] **Step 1: Write the failing tests**

```python
# tools/fletcher/tests/test_feature_observation.py
from __future__ import annotations

import copy
import unittest

from tools.fletcher.feature_observation import (
    ACCEPTED,
    NEEDS_RE_REVIEW,
    accepted_controls,
    frozen_checks,
    validate_observation,
)


def minimal_obs() -> dict:
    point = {
        "id": "c01",
        "feature_type": "road-road-intersection",
        "pixel": {"x": 100.0, "y": 200.0},
        "lonlat": {"lon": -61.4, "lat": 45.8},
        "identity": "junction",
        "uncertainty": "ink width",
        "modern_source": {"service_url": "https://example", "layers": [], "retrieved_at": "2026-07-26"},
        "review": {"status": ACCEPTED, "note": "ok", "date": "2026-07-26"},
    }
    check = copy.deepcopy(point)
    check.update({"id": "n01", "region": "qa-region-1"})
    return {
        "schema_version": 2,
        "method_version": "feature-led-v2",
        "sheet_id": "19",
        "source_receipt": {"rumsey_id": "R", "width": 10, "height": 10, "sha256": "abc"},
        "usable_frame": [[0, 0], [10, 0], [10, 10], [0, 10]],
        "regions": {"qa-region-1": "west"},
        "controls": [point],
        "diagnostics": [],
        "final_checks": [check],
        "rejected": [],
        "checks_frozen_at": None,
    }


class ValidateTests(unittest.TestCase):
    def test_valid_observation_passes(self) -> None:
        validate_observation(minimal_obs())

    def test_duplicate_ids_rejected(self) -> None:
        obs = minimal_obs()
        obs["final_checks"][0]["id"] = "c01"
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_observation(obs)

    def test_private_key_rejected(self) -> None:
        obs = minimal_obs()
        obs["controls"][0]["near_property"] = True
        with self.assertRaisesRegex(ValueError, "private"):
            validate_observation(obs)

    def test_private_value_rejected(self) -> None:
        obs = minimal_obs()
        obs["controls"][0]["identity"] = "near pid-50319672 shore"
        with self.assertRaisesRegex(ValueError, "private"):
            validate_observation(obs)

    def test_check_requires_known_region(self) -> None:
        obs = minimal_obs()
        obs["final_checks"][0]["region"] = "qa-region-9"
        with self.assertRaisesRegex(ValueError, "region"):
            validate_observation(obs)


class RoleTests(unittest.TestCase):
    def test_accepted_controls_excludes_unreviewed(self) -> None:
        obs = minimal_obs()
        extra = copy.deepcopy(obs["controls"][0])
        extra.update({"id": "c02"})
        extra["review"] = {"status": NEEDS_RE_REVIEW, "note": "", "date": ""}
        obs["controls"].append(extra)
        points = accepted_controls(obs)
        self.assertEqual([p.label for p in points], ["c01"])
        self.assertEqual(points[0].pixel_x, 100.0)

    def test_frozen_checks_requires_freeze_stamp(self) -> None:
        obs = minimal_obs()
        with self.assertRaisesRegex(ValueError, "frozen"):
            frozen_checks(obs)
        obs["checks_frozen_at"] = "2026-07-27"
        self.assertEqual([p.label for p in frozen_checks(obs)], ["n01"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tools.fletcher.tests.test_feature_observation -v`
Expected: `ModuleNotFoundError: No module named 'tools.fletcher.feature_observation'`

- [ ] **Step 3: Implement the module**

```python
# tools/fletcher/feature_observation.py
"""Feature-led v2 observation records: load, validate, and expose GCP roles.

The observation JSON is the intellectual asset of the workflow — identity
decisions, provenance, and review notes. Rasters and crops stay on compute.
"""
from __future__ import annotations

import json
import pathlib
import re

from tools.church.gcps import CHECK_ROLE, CONTROL_ROLE, GroundControlPoint

SCHEMA_VERSION = 2
METHOD_VERSION = "feature-led-v2"
ACCEPTED = "accepted"
NEEDS_RE_REVIEW = "needs-re-review"
REJECTED = "rejected"
_STATUSES = frozenset({ACCEPTED, NEEDS_RE_REVIEW, REJECTED})
_FORBIDDEN_KEYS = frozenset({"pid", "property_selector", "near_property"})
_PRIVATE_VALUE = re.compile(r"pid[-_]?\d{5,}")
_REGION = re.compile(r"^qa-region-\d+$")
_POINT_LISTS = ("controls", "diagnostics", "final_checks")


def load_observation(path: pathlib.Path) -> dict:
    obs = json.loads(path.read_text(encoding="utf-8"))
    validate_observation(obs)
    return obs


def validate_observation(obs: dict) -> None:
    if obs.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("schema_version must be 2")
    receipt = obs.get("source_receipt") or {}
    for field in ("rumsey_id", "width", "height", "sha256"):
        if not receipt.get(field):
            raise ValueError(f"source_receipt.{field} is required")
    _scan_private(obs, "$")
    seen: set[str] = set()
    for list_name in _POINT_LISTS:
        for point in obs.get(list_name, ()):
            _validate_point(point, list_name, obs)
            if point["id"] in seen:
                raise ValueError(f"duplicate point id {point['id']}")
            seen.add(point["id"])


def _validate_point(point: dict, list_name: str, obs: dict) -> None:
    identifier = point.get("id")
    if not identifier:
        raise ValueError(f"{list_name} point missing id")
    for group, axes in (("pixel", ("x", "y")), ("lonlat", ("lon", "lat"))):
        values = point.get(group) or {}
        for axis in axes:
            if not isinstance(values.get(axis), (int, float)):
                raise ValueError(f"{identifier}: {group}.{axis} must be numeric")
    status = (point.get("review") or {}).get("status")
    if status not in _STATUSES:
        raise ValueError(f"{identifier}: review.status must be one of {sorted(_STATUSES)}")
    if list_name == "final_checks":
        region = point.get("region", "")
        if not _REGION.match(region) or region not in (obs.get("regions") or {}):
            raise ValueError(f"{identifier}: final check needs a declared qa-region label")


def _scan_private(node: object, path: str) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            if key in _FORBIDDEN_KEYS:
                raise ValueError(f"private marker key {key!r} at {path}")
            _scan_private(value, f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            _scan_private(value, f"{path}[{index}]")
    elif isinstance(node, str) and _PRIVATE_VALUE.search(node):
        raise ValueError(f"private marker value at {path}")


def _point_gcp(point: dict, role: str) -> GroundControlPoint:
    return GroundControlPoint(
        pixel_x=float(point["pixel"]["x"]),
        pixel_y=float(point["pixel"]["y"]),
        lon=float(point["lonlat"]["lon"]),
        lat=float(point["lonlat"]["lat"]),
        role=role,
        label=str(point["id"]),
    )


def accepted_controls(obs: dict) -> list[GroundControlPoint]:
    return [
        _point_gcp(point, CONTROL_ROLE)
        for point in obs.get("controls", ())
        if point["review"]["status"] == ACCEPTED
    ]


def frozen_checks(obs: dict) -> list[GroundControlPoint]:
    if not obs.get("checks_frozen_at"):
        raise ValueError("final checks are not frozen")
    return [
        _point_gcp(point, CHECK_ROLE)
        for point in obs.get("final_checks", ())
        if point["review"]["status"] == ACCEPTED
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest tools.fletcher.tests.test_feature_observation -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add tools/fletcher/feature_observation.py tools/fletcher/tests/test_feature_observation.py
git commit -m "feat(fletcher): add feature-led v2 observation schema"
```

### Task 2: v1 → v2 importer

**Files:**
- Create: `tools/fletcher/feature_import.py`
- Test: `tools/fletcher/tests/test_feature_import.py`

**Interfaces:**
- Consumes: Task 1 (`validate_observation`, `ACCEPTED`, `NEEDS_RE_REVIEW`).
- Produces: `convert_v1(v1: dict, region_map: dict[str, str], regions: dict[str, str]) -> dict` and CLI
  `python3 -m tools.fletcher.feature_import <v1.json> --region-map <map.json> --regions <regions.json> --out <v2.json>`.

Conversion rules:
- `controls[*]` → v2 `controls` with `review.status = accepted`,
  `note = "imported from sheet19-feature-pilot-v1 pre-fit acceptance"`,
  `identity` from `identity_rationale`; keep `feature_type`, `pixel`,
  `modern_source`, `evidence_crop`, `uncertainty`; rename `modern_coordinate`
  → `lonlat`; drop `complex_id`, `acceptance`, `historical_description`,
  `modern_description` into a single `identity` string
  (`identity_rationale + " | " + historical_description`).
- `final_checks[*]` → v2 `diagnostics` with `origin = "burned-check-v1"`,
  `review.status = needs-re-review`,
  `note = "held-out residual was seen in the 2026-07-26 affine pilot"`; the
  v1 `area_id` must be a key of `region_map`, and maps to `region`; the
  `near_property` key is dropped.
- `rejected_candidates` → `rejected` unchanged (id + reason).
- `property_selector` and `acceptance_gate` are dropped entirely.
- Output carries `source_receipt`, `usable_frame` verbatim; `regions` comes
  from a `--regions <json>` file (label → neutral description).
- After building the dict, run `validate_observation` (privacy guard included).
- Missing `region_map` entry for any `area_id` raises `ValueError` naming it.

- [ ] **Step 1: Write the failing tests** — build a synthetic v1 dict in the
  test containing one control, one final check with
  `area_id: "pid-50319672-coastal-north"`, `near_property: true`, a
  `property_selector` block, and one rejected candidate. Assert:
  - converted dict passes `validate_observation`;
  - control review status is `accepted`, diagnostic status is
    `needs-re-review` with `origin == "burned-check-v1"`;
  - `json.dumps(converted)` contains no `pid` substring;
  - unmapped `area_id` raises `ValueError` mentioning the id.

```python
# tools/fletcher/tests/test_feature_import.py
from __future__ import annotations

import json
import unittest

from tools.fletcher.feature_import import convert_v1
from tools.fletcher.feature_observation import validate_observation


def v1_fixture() -> dict:
    return {
        "schema_version": 1,
        "sheet_id": "19",
        "property_selector": {"pid": "50319672"},
        "source_receipt": {"rumsey_id": "R", "width": 10, "height": 10, "sha256": "abc"},
        "usable_frame": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}],
        "acceptance_gate": {"check_rms_m_max": 100.0},
        "controls": [{
            "id": "c02", "feature_type": "road-road-intersection",
            "pixel": {"x": 1.0, "y": 2.0},
            "modern_coordinate": {"lon": -61.4, "lat": 45.9},
            "historical_description": "junction", "modern_description": "NSTDB",
            "identity_rationale": "same junction", "uncertainty": "ink",
            "acceptance": "accepted-pre-fit", "complex_id": "roads8:1|2",
            "modern_source": {"service_url": "https://x", "layers": [], "retrieved_at": "2026-07-26"},
            "evidence_crop": {"path": "controls/c02.jpg", "sha256": "s"},
        }],
        "final_checks": [{
            "id": "n02", "feature_type": "river-mouth",
            "pixel": {"x": 3.0, "y": 4.0},
            "modern_coordinate": {"lon": -61.5, "lat": 45.8},
            "historical_description": "stream mouth", "modern_description": "NSTDB",
            "identity_rationale": "same mouth", "uncertainty": "tide",
            "acceptance": "accepted-pre-fit",
            "area_id": "pid-50319672-coastal-north", "near_property": True,
            "modern_source": {"service_url": "https://x", "layers": [], "retrieved_at": "2026-07-26"},
            "evidence_crop": {"path": "checks/n02.jpg", "sha256": "s"},
        }],
        "rejected_candidates": [{"id": "c13", "reason": "realigned"}],
    }


REGION_MAP = {"pid-50319672-coastal-north": "qa-region-1"}
REGIONS = {"qa-region-1": "western coastal acceptance neighbourhood"}


class ConvertTests(unittest.TestCase):
    def test_converts_and_passes_validation(self) -> None:
        out = convert_v1(v1_fixture(), REGION_MAP, REGIONS)
        validate_observation(out)
        self.assertEqual(out["controls"][0]["review"]["status"], "accepted")
        diagnostic = out["diagnostics"][0]
        self.assertEqual(diagnostic["origin"], "burned-check-v1")
        self.assertEqual(diagnostic["review"]["status"], "needs-re-review")
        self.assertEqual(diagnostic["region"], "qa-region-1")
        self.assertEqual(out["rejected"], [{"id": "c13", "reason": "realigned"}])
        self.assertNotIn("pid", json.dumps(out))

    def test_unmapped_area_id_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown-area"):
            fixture = v1_fixture()
            fixture["final_checks"][0]["area_id"] = "unknown-area"
            convert_v1(fixture, REGION_MAP, REGIONS)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure** — expect `ModuleNotFoundError`.
- [ ] **Step 3: Implement** `convert_v1(v1, region_map, regions)` per the rules
  above plus a `main(argv)` CLI (`argparse`; reads the three JSON files, writes
  `--out`, prints the accepted/diagnostic counts). Signature:

```python
def convert_v1(v1: dict, region_map: dict[str, str], regions: dict[str, str]) -> dict: ...
def main(argv: list[str] | None = None) -> int: ...
```

  Implementation sketch (complete the point copying exactly per the rules):

```python
def _convert_point(point: dict, status: str, note: str) -> dict:
    identity = point.get("identity_rationale", "")
    historical = point.get("historical_description", "")
    if historical:
        identity = f"{identity} | {historical}" if identity else historical
    converted = {
        "id": point["id"],
        "feature_type": point["feature_type"],
        "pixel": dict(point["pixel"]),
        "lonlat": dict(point["modern_coordinate"]),
        "identity": identity,
        "uncertainty": point.get("uncertainty", ""),
        "modern_source": point.get("modern_source", {}),
        "evidence_crop": point.get("evidence_crop", {}),
        "review": {"status": status, "note": note, "date": "2026-07-26"},
    }
    return converted
```

- [ ] **Step 4: Run tests** — expect PASS; also run the full suite:
  `python3 -m unittest discover -s tools/fletcher/tests -t .` — expect PASS.
- [ ] **Step 5: Commit** — `feat(fletcher): import v1 pilot observations as feature-led v2`

### Task 3: TPS fit and leave-one-out diagnostics

**Files:**
- Create: `tools/fletcher/feature_georeference.py`
- Test: `tools/fletcher/tests/test_feature_georeference.py`

**Interfaces:**
- Consumes: Task 1; `tools.church.georeference.build_translate_command(source, translated, points, window=None)`, `warp_command(translated, output, transform="tps")`, `parse_gdaltransform_output(text)`; `tools.church.geometry.mercator_to_ground_metres(distance, lat)`.
- Produces (used by Tasks 4 and Phase B):
  - `Runner = Callable[[list[str], str | None], str]` — `(command, stdin) -> stdout`; default `_run` uses `subprocess.run(..., check=True, capture_output=True, text=True)`.
  - `fit(source: str, obs: dict, out_dir: pathlib.Path, runner: Runner = _run) -> pathlib.Path` — writes `controls.vrt` + `warped-3857.tif` + `fit.json` (control ids/count + exact commands), returns the warped path. Raises if accepted controls < 12.
  - `loo_rows(source: str, obs: dict, out_dir: pathlib.Path, runner: Runner = _run) -> list[dict]` — per accepted control: fit VRT without it, project its pixel with `gdaltransform -tps`, return `{"id", "error_m", "flagged"}` sorted by descending error. `flagged` = error > 100 m **and** > 3× median.
  - CLI: `fit`, `loo` subcommands taking `--source --observation --out`.

- [ ] **Step 1: Write failing tests** — use a fake runner that records
  commands and returns canned `gdaltransform` output; 13 synthetic controls on
  a grid so median math is stable. Test:
  - `fit` raises below 12 accepted controls;
  - `fit` invokes `gdal_translate` with 12 `-gcp` flags then `gdalwarp -tps`,
    and writes `fit.json` naming every control id;
  - `loo_rows` returns one row per control, errors computed in ground metres,
    and flags a deliberately displaced point (canned output places it 500 m
    off while others are ~10 m);
  - the held-out control's id never appears in its own fold's translate
    command.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Core loop for `loo_rows`:

```python
def loo_rows(source, obs, out_dir, runner=_run):
    controls = accepted_controls(obs)
    rows = []
    for index, held in enumerate(controls):
        others = controls[:index] + controls[index + 1 :]
        vrt = out_dir / "loo" / f"{held.label}.vrt"
        vrt.parent.mkdir(parents=True, exist_ok=True)
        runner(build_translate_command(source, str(vrt), others), None)
        stdout = runner(["gdaltransform", "-tps", str(vrt)], f"{held.pixel_x} {held.pixel_y}\n")
        got_x, got_y = parse_gdaltransform_output(stdout)[0]
        want_x, want_y = held.mercator
        error = mercator_to_ground_metres(math.hypot(got_x - want_x, got_y - want_y), held.lat)
        rows.append({"id": held.label, "error_m": error})
    errors = sorted(row["error_m"] for row in rows)
    median = errors[len(errors) // 2]
    for row in rows:
        row["flagged"] = row["error_m"] > 100.0 and row["error_m"] > 3.0 * median
    return sorted(rows, key=lambda row: -row["error_m"])
```

- [ ] **Step 4: Run tests + full discover** — expect PASS.
- [ ] **Step 5: Commit** — `feat(fletcher): TPS fit and LOO diagnostics for feature-led v2`

### Task 4: Freeze and score final checks

**Files:**
- Modify: `tools/fletcher/feature_georeference.py`
- Test: extend `tools/fletcher/tests/test_feature_georeference.py`

**Interfaces:**
- Produces:
  - `freeze(obs_path: pathlib.Path, frozen_at: str) -> dict` — validates the
    observation's `final_checks`: all `accepted`, count ≥ 8, ≥ 3 distinct
    regions, ids disjoint from controls/diagnostics (already guaranteed unique
    by Task 1, re-assert anyway), then writes `checks_frozen_at = frozen_at`
    back to the file and returns the updated dict. Raises if already frozen.
  - `score(source: str, obs: dict, out_path: pathlib.Path, runner: Runner = _run) -> dict` —
    refuses if `out_path` exists (`ValueError: already scored`); requires
    frozen checks; builds a controls-only VRT, projects every check pixel with
    `gdaltransform -tps`, computes ground-metre errors via
    `tools.church.georeference.check_errors`, and writes/returns
    `{"scored_at", "control_count", "overall": {"count", "rms_m", "p95_m", "max_m"}, "regions": {label: {...}}, "per_check": {id: error_m}}`.
    P95 = value at index `ceil(0.95 * n) - 1` of sorted errors.
- [ ] **Step 1: Write failing tests** — freeze rejects 7 checks, rejects 2
  regions, stamps and persists on success, refuses double-freeze; score
  refuses unfrozen obs, refuses existing output file, groups per-region
  metrics correctly with a canned runner.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (metrics helper shared with the report):

```python
def _metrics(errors: list[float]) -> dict:
    ordered = sorted(errors)
    p95_index = max(0, math.ceil(0.95 * len(ordered)) - 1)
    return {
        "count": len(ordered),
        "rms_m": math.sqrt(sum(error * error for error in ordered) / len(ordered)),
        "p95_m": ordered[p95_index],
        "max_m": ordered[-1],
    }
```

- [ ] **Step 4: Run tests + full discover** — expect PASS.
- [ ] **Step 5: Commit** — `feat(fletcher): frozen final-check scoring for feature-led v2`

### Task 5: Candidate mining from NSTDB extracts

**Files:**
- Create: `tools/fletcher/feature_candidates.py`
- Test: `tools/fletcher/tests/test_feature_candidates.py`

**Interfaces:**
- Consumes: `tools.church.geometry.lonlat_to_mercator`, `mercator_to_ground_metres`.
- Produces:
  - `road_intersections(geojson: dict, name_field: str = "STREET") -> list[dict]` —
    endpoints (first/last vertex of each LineString / MultiLineString part,
    rounded to 7 decimals) shared by ≥ 2 features with distinct names; name
    falls back to `f"obj-{properties.get('OBJECTID', index)}"`. Returns
    `{"kind": "road-road-intersection", "lon", "lat", "names": [..]}`.
  - `water_junctions(geojson: dict) -> list[dict]` — endpoints of one feature
    that coincide with any vertex of a different feature
    (`kind: "water-junction"` — covers confluences and mouths; identity is
    decided at review time).
  - `dedupe(candidates: list[dict], min_separation_m: float = 150.0) -> list[dict]` —
    greedy keep-first by ground distance.
  - `write_csv(candidates, path)` and CLI:
    `python3 -m tools.fletcher.feature_candidates --roads r.geojson --water w.geojson --out candidates.csv [--name-field STREET]`
    CSV columns: `id,kind,lon,lat,names` with ids `cand-0001…`.
- [ ] **Step 1: Write failing tests** — two named roads sharing an endpoint →
  one intersection; same-name segments (a road continuing) → none; tributary
  endpoint touching a river mid-vertex → one water junction; `dedupe` collapses
  two candidates 50 m apart and keeps 500 m apart; MultiLineString endpoints
  handled.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — pure stdlib; index vertices in dicts keyed by
  rounded `(lon, lat)` tuples.
- [ ] **Step 4: Run tests + full discover** — expect PASS.
- [ ] **Step 5: Commit** — `feat(fletcher): mine NSTDB candidates for feature-led controls`

### Task 6: QA rendering (crops and overlays)

**Files:**
- Create: `tools/fletcher/feature_qa.py`
- Test: `tools/fletcher/tests/test_feature_qa.py`

**Interfaces:**
- Consumes: Task 3 `Runner`/`_run`; `tools.church.geometry.lonlat_to_mercator`.
- Produces:
  - `qa_grid_centers(frame: list[list[float]], n: int = 4) -> list[tuple[float, float]]` —
    n×n pixel centers inside the usable-frame bounding box, inset by half a
    cell.
  - `crop_window(center: tuple[float, float], size: int, width: int, height: int) -> tuple[int, int, int, int]` —
    clamped `(x, y, w, h)` for `gdal_translate -srcwin`.
  - `merc_to_crop_px(merc: tuple[float, float], projwin: tuple[float, float, float, float], out_size: tuple[int, int]) -> tuple[float, float]` —
    linear mapping for north-up Web Mercator crops (`projwin` =
    `ulx, uly, lrx, lry`).
  - `render_scan_crop(source, window, polylines_px, out_jpg, runner=_run)` —
    shells `gdal_translate -srcwin ... -of PNG` to a temp file, then lazy-imports
    cv2 to draw `polylines_px` (list of lists of `(x, y)` crop-local floats) in
    two colours (roads red, water blue by `kind`) and writes JPEG.
  - `render_overlay(warped, projwin, polylines_merc, out_jpg, runner=_run)` —
    same pattern with `-projwin`, converting mercator polylines via
    `merc_to_crop_px`.
  - CLI: `crops` (from a candidates CSV or observation ids + a pixel-projection
    file) and `overlays` (grid + explicit centers) — both take `--out-dir`.
- [ ] **Step 1: Write failing tests** for the three pure functions only
  (grid count/inset, window clamping at raster edges, merc→px corners and
  midpoint). Rendering functions are exercised on Bazzite, not in CI.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**; keep `import cv2` inside the render functions.
- [ ] **Step 4: Run tests + full discover** — expect PASS.
- [ ] **Step 5: Commit** — `feat(fletcher): QA crop and overlay rendering for feature-led v2`

### Task 7: Result record and report table

**Files:**
- Create: `tools/fletcher/feature_report.py`
- Create dir: `tools/fletcher/results/` (committed result receipts)
- Modify: `reports/fletcher/RESULTS.md` (marker section only, in Phase B)
- Test: `tools/fletcher/tests/test_feature_report.py`

**Interfaces:**
- Consumes: score dict shape from Task 4.
- Produces:
  - `render_feature_table(results: list[dict]) -> str` — markdown table with
    columns `Sheet | Disposition | Controls | Checks | RMS m | P95 m | Max m | Regions | Reason`.
  - `update_results_md(text: str, table: str) -> str` — replaces content
    between `<!-- feature-led-v2:start -->` and `<!-- feature-led-v2:end -->`;
    if absent, appends a `## Feature-led v2 registrations` section with the
    markers and a two-line preamble stating these rows measure alignment to
    modern NSTDB features at held-out checks and do not alter the engraved-grid
    history above.
  - CLI `record`: `--observation --score --disposition --reason --out tools/fletcher/results/sheet-<NN>-feature-v2.json --results-md reports/fletcher/RESULTS.md`
    — writes the receipt (observation sha256, control/check counts, score
    metrics, disposition, reason) and rewrites the marker section from all
    `tools/fletcher/results/sheet-*-feature-v2.json` files.
- [ ] **Step 1: Write failing tests** — table renders one PASS row with
  rounded metrics; `update_results_md` appends markers when missing and
  replaces stale content between existing markers without touching text
  outside them.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests + full discover** — expect PASS. Also run
  `python3 -m unittest discover -s tools/church/tests -t .` to prove church
  imports are untouched.
- [ ] **Step 5: Commit** — `feat(fletcher): feature-led v2 result receipts and report table`

---

## Phase B — Sheet 19 pilot execution (Bazzite + staging)

Execution conventions for every Bazzite step:

```bash
# run <CMD> inside the distrobox from the workspace repo clone
ssh dan@bazzite "distrobox enter nsmarks-gis -- bash -lc 'cd /var/home/dan/nsmarks-fletcher-sheet19-feature-pilot-20260726/repo-run && <CMD>'"
# sync current tooling before any run (from the local worktree root)
rsync -a tools/fletcher/ dan@bazzite:/var/home/dan/nsmarks-fletcher-sheet19-feature-pilot-20260726/repo-run/tools/fletcher/
rsync -a tools/church/ dan@bazzite:/var/home/dan/nsmarks-fletcher-sheet19-feature-pilot-20260726/repo-run/tools/church/
# pull QA images back for visual review (Claude reads them with the Read tool)
rsync -a dan@bazzite:/var/home/dan/nsmarks-fletcher-sheet19-feature-pilot-20260726/qa/v2/ <scratchpad>/qa/
```

`WS=/var/home/dan/nsmarks-fletcher-sheet19-feature-pilot-20260726` below.

### Task 8: Workspace verification and observation import

- [ ] **Step 1:** Verify the source: `sha256sum $WS/source/direct-rumsey-sheet-19.tif`
  must equal the Global Constraints SHA; `gdalinfo` must report 10815×7549.
  A mismatch is `source-drift`: stop and report.
- [ ] **Step 2:** Copy the v1 observation from the Codex worktree into the
  workspace (not into git):
  `scp /Users/dfakkeldy/.codex/worktrees/97a5/ns-marks-the-spot/tools/fletcher/feature_observations/sheet-19.json dan@bazzite:$WS/observations/v1-sheet-19.json`
- [ ] **Step 3:** Write `$WS/observations/region-map.json` (workspace-only;
  contains the pid-labelled v1 area ids):
  the three `pid-50319672-*` area ids → `qa-region-1`;
  `judique-intervale-mouth` → `qa-region-2`;
  `river-inhabitants-macleods`, `river-inhabitants-glendale`,
  `river-inhabitants-maple` → `qa-region-3`;
  `alder-macphail` → `qa-region-4`.
  Write `$WS/observations/regions.json`:
  `qa-region-1: "western coastal acceptance neighbourhood"`,
  `qa-region-2: "northwest coast"`, `qa-region-3: "River Inhabitants valley"`,
  `qa-region-4: "northeast interior"`.
- [ ] **Step 4:** Run the importer on Bazzite; copy the v2 output back to the
  local worktree as `tools/fletcher/feature_observations/sheet-19.json`; run
  `python3 -m unittest discover -s tools/fletcher/tests -t .` locally, and
  `grep -c "pid" tools/fletcher/feature_observations/sheet-19.json` — expect 0.
- [ ] **Step 5:** Commit — `data(fletcher): import sheet 19 v1 controls as feature-led v2 observation`

### Task 9: Re-review the nine burned checks

- [ ] **Step 1:** Generate evidence crops for the 9 diagnostics using the
  Codex affine VRT as prior
  (`$WS/evidence/affine-v2/` holds `selected-affine.vrt`; if the exact
  filename differs, `ls` the directory and use the affine VRT recorded in
  `affine-selection.json`): project each diagnostic's `lonlat` to pixel with
  `gdaltransform -i`, then `feature_qa crops` at 1400 px.
- [ ] **Step 2:** Pull crops to the scratchpad and visually review each one
  (Read tool). For each diagnostic decide, recording a `review.note` that
  cites feature evidence:
  - identity confirmed → promote: move the entry to `controls` with
    `review.status = accepted`, note `"re-reviewed after burned residual; identity confirmed: <evidence>"`;
  - identity wrong or ambiguous → keep in `diagnostics` with
    `review.status = rejected` and the reason.
  n08 and n09 (~1.5 km residuals) get explicit attention: compare the drawn
  River Inhabitants confluence topology against NSTDB before deciding whether
  the 1884 drawing is displaced (keep, use as control with caution note) or
  the match was wrong (reject).
- [ ] **Step 3:** Validate + commit — `data(fletcher): re-review burned sheet 19 checks`

### Task 10: Candidate sweep to ≥ 35 controls

- [ ] **Step 1:** Confirm reference extracts cover the whole usable frame
  (`$WS/reference/`): roads layers, water layer 4, coastline layer 1. If the
  west-coast or Bras d'Or shore is missing, fetch the missing NSTDB extracts
  from the recorded service URLs with a bbox query and record
  file+sha in the observation's `modern_source` conventions.
- [ ] **Step 2:** Run `feature_candidates` over roads + water extracts
  (inspect one feature's `properties` first and set `--name-field` to the
  actual street-name field). Expect a few hundred raw candidates; `dedupe`
  to ~150.
- [ ] **Step 3:** Project candidate lonlats to scan pixels with the current
  best transform (round 0: the Codex affine VRT; later rounds: the newest TPS
  controls VRT) via `gdaltransform -i -tps`; drop candidates outside the
  usable frame.
- [ ] **Step 4:** Render review batches of ~15 crops (1400 px, modern vectors
  overlaid in colour), pull to scratchpad, and visually accept/reject each
  candidate: matching junction topology and bearings → append to `controls`
  with `identity`, `uncertainty`, `modern_source` object ids, and
  `review.status = accepted`; otherwise append to `rejected` with the reason.
  Date-check any rail candidate (Global Constraints; the Cape Breton rail
  extension postdates the 1884 survey).
- [ ] **Step 5:** Repeat batches until: ≥ 35 accepted controls, every
  usable-frame quadrant has ≥ 6, and both a transport and a water/coast
  feature class appear in every quadrant that offers them. Commit after each
  batch — `data(fletcher): sheet 19 feature controls batch N`.

### Task 11: Fit–QA–iterate loop (max 5 rounds)

Each round:

- [ ] **Step 1:** `rsync` tooling; run `fit` →
  `$WS/georef/v2/round-N/warped-3857.tif`.
- [ ] **Step 2:** Run `loo` and read the table. For every flagged control,
  re-render its crop with the new TPS projection and re-review identity only
  (demotion requires feature evidence in the note — never the residual alone).
- [ ] **Step 3:** Render overlays: 4×4 grid across the usable frame plus every
  location that looked wrong last round, each 1500 m half-width, NSTDB roads
  red / water blue over the warped raster. Pull to scratchpad and inspect.
  Pass criterion per crop at z14 scale: drawn road/stream/coast ink sits
  within ~3–5 tile pixels (30–50 m) of the modern vector wherever the 1884
  feature credibly survives.
- [ ] **Step 4:** Where a crop fails: add controls there next batch
  (Task 10 procedure) or record an honest local caveat if the engraving
  itself is displaced (e.g. sketch-surveyed interior drainage). Log the round
  in `$WS/georef/v2/round-N/notes.md` and mirror the summary into the commit
  message.
- [ ] **Step 5:** Exit the loop when all grid crops pass or two consecutive
  rounds show no visible improvement (then the remaining misfit areas are
  named caveats). Hard stop after round 5 with an honest plateau report to the
  user before proceeding.

### Task 12: Freeze fresh checks and score once

- [ ] **Step 1:** From the candidate pool, select 8–10 features **never used
  in any fit, LOO fold, crop review, or the v1 pilot** — verify by id against
  the observation and `fit.json` control lists — spanning ≥ 3 regions
  including `qa-region-1`, mixing water and transport classes. Review each
  crop for identity exactly once, append to `final_checks` with
  `review.status = accepted`.
- [ ] **Step 2:** Run `freeze` with today's date; commit —
  `data(fletcher): freeze sheet 19 v2 final checks`.
- [ ] **Step 3:** Run `score` → `$WS/georef/v2/score.json`; copy back beside
  the observation as uncommitted working data. Report the per-region numbers
  in chat honestly, whatever they are. No re-running, no point edits.

### Task 13: Tile, stage, and user acceptance gate

- [ ] **Step 1:** Tile the final warp on Bazzite:
  `gdal2tiles --xyz -z 8-16 -w none --processes=6 $WS/georef/v2/round-<final>/warped-3857.tif $WS/tiles/v2/sheet-19/`
  (if `gdal2tiles` is absent in the distrobox, use `gdal2tiles.py`; verify
  with `command -v`). Expect ~7–8k PNGs.
- [ ] **Step 2:** `rsync` tiles to the local scratchpad under
  `staging/fletcher-direct-rumsey-20260726.1/sheet-19/` (the path segment must
  equal `FLETCHER_TILE_REVISION` in `web/src/layers/fletcherLayer.ts:1`).
- [ ] **Step 3:** Serve and stage:

```bash
cd <scratchpad>/staging && python3 -m http.server 8899
```

  Then start the web dev server with
  `VITE_FLETCHER_TILE_BASE_URL=http://localhost:8899` (add a `.claude/launch.json`
  entry if one does not exist) and verify in the Browser pane: navigate to the
  Sheet 19 area, enable the Fletcher layer, confirm tiles load (network panel,
  no 404 spam), and take comparison screenshots at z12/z14 over three areas
  including qa-region-1. Browser-verification quirk: reach parcel zoom via PID
  search, probe state via DOM text (see project memory).
- [ ] **Step 4:** **USER GATE.** Send the user the staged URL, the score
  numbers, and the screenshots. Wait for explicit visual acceptance. Not
  accepted → return to Task 11 with their observations; accepted → Task 14.

### Task 14: Record, report, and PR

- [ ] **Step 1:** Run `record` with `--disposition PASS` (or the honest
  alternative) — writes `tools/fletcher/results/sheet-19-feature-v2.json` and
  the `Feature-led v2 registrations` marker section in
  `reports/fletcher/RESULTS.md`. The engraved-grid table and its rejection
  banner stay untouched.
- [ ] **Step 2:** Update `docs/FLETCHER_GEOREFERENCING.md` with a short
  `## Feature-led v2 workflow` section pointing at the spec, the module
  family, and the invariants (direct-Rumsey only, privacy guard, frozen
  checks, fail-closed rejections). Do not delete the historical sections.
- [ ] **Step 3:** Run the full local gates: both unittest discovers, and
  `cd web && npm test && npm run lint && npm run build` if any `web/` file
  changed (launch.json is not a web source change).
- [ ] **Step 4:** `git status --short --branch` — confirm only intended files;
  commit remaining changes; push the branch; open a PR to `nightly` titled
  `feat(fletcher): feature-led v2 georeferencing — Sheet 19 pilot`, body
  summarizing diagnosis → method → score table → user acceptance, ending with
  the standard generation footer. Tile hosting/deployment is explicitly out of
  scope for this PR (separate decision per the repo's publication boundary).
- [ ] **Step 5:** After the pilot PR is open, ask the user whether to proceed
  to the series skill (spec §7) — that is a separate plan.

## Out of scope for this plan

- The remaining 23 sheets, seam QA between sheets, and the
  `fletcher-feature-georeference` skill (follow-up after user acceptance).
- Church counties (frozen until the user lifts the freeze).
- Tile hosting, KinNoKi publication, and any revision bump of
  `FLETCHER_TILE_REVISION`.
