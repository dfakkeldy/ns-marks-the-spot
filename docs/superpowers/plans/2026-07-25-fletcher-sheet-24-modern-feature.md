# Fletcher Sheet 24 Modern-Feature Georeferencing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently align Hugh Fletcher Sheet 24 from frozen transport controls, select a transform by transport leave-one-out validation, test it once against untouched natural features, and record an honest modern-feature PASS or FAIL without processing another sheet.

**Architecture:** Add a parallel `modern-feature-v1` pipeline beside the unchanged engraved-grid pipeline. A reviewed JSON observation generates two role-pure CSVs; a control-only selection command evaluates affine, polynomial2, and TPS with leave-one-out validation plus structural mesh gates, while a separate scoring command can only consume the selected/refitted transform and final natural-check CSV. A reviewed QA receipt completes the final gate, after which a PASS may produce zoom 8–16 XYZ tiles and a scoped nested manifest result.

**Tech Stack:** Python 3 standard library and `unittest`; existing Church/Fletcher GCP, residual, GDAL command, report, and atomic-manifest helpers; GDAL/OGR, OpenCV, and QGIS inside the existing Bazzite `nsmarks-gis` distrobox; official Nova Scotia ArcGIS MapServer evidence; direct David Rumsey source imagery.

**Design:** `docs/superpowers/specs/2026-07-25-fletcher-sheet-24-modern-feature-design.md`

## Global Constraints

- Process exactly Sheet 24. Stop after `modern_feature_v1` is recorded as PASS or FAIL. Do not open or process another sheet.
- Source: Rumsey ID `RUMSEY~8~1~2649~290017`, list number `3997.026`, title *Province of Nova Scotia (Island of Cape Breton). Sheet no. 24.*, published 1884, dimensions 10,782 × 7,655, SHA-256 `735daf2fb3b8afd12bef672ffaad9425c05ec1873a75afdb708ff048cb8dfee8`, non-composite.
- A source identity, dimension, or checksum mismatch is terminal `source-drift`; do not fetch over or silently replace the baseline.
- Use only the direct Rumsey scan and official Nova Scotia modern services. Do not use OldMapsOnline, Georeferencer, its API keys, the legacy `Tiles/Fletcher` pyramid, either composite, another Fletcher sheet's coordinates, or any previous warp.
- Keep `graticule: FAIL` unchanged. Record the new result only under `modern_feature_v1`.
- Controls: at least 10 distributed road-road intersections, road-rail crossings, or rail-rail junctions from Sheet 24 itself.
- Final checks: at least 6 frozen natural-feature points from at least two classes and three separated areas, including interior and coastal evidence when supported.
- Score discrete points only. Do not fit road, rail, river, property, or
  shoreline lines.
- NSPRD/property geometry and NS Aerial are corroboration only. They may not supply a control/check coordinate or prove a legal boundary, road, railway, right-of-way, title, or access.
- Before any transform or residual, commit either a validated pre-fit rejection
  or a frozen reviewed observation plus both generated CSVs.
- Compare affine, polynomial2, and TPS by transport-control leave-one-out RMS, P95, maximum, then complexity order affine → polynomial2 → TPS.
- Before natural checks are loaded, require a 21 × 21 structural mesh with finite values, positive determinants, anisotropy no worse than 4:1, and local area scale between 0.25× and 4× the mesh median.
- Both numerical gates are fixed: RMS ≤ 400 m, P95 ≤ 900 m, maximum ≤ 1,500 m. Transport requires at least 10 points; natural validation requires at least 6.
- Do not remove, move, relabel, or reclassify a point after any residual is seen. A discovered observation defect makes v1 FAIL; correction requires a newly versioned observation and run.
- Generate the full zoom 8–16 XYZ PNG pyramid only after final numerical, structural, and visual PASS. QA-only sample tiles at zooms 8, 12, and 16 are not a deliverable pyramid.
- Large scans, extracts, VRTs, rasters, previews, overlays, and tiles stay under `/var/home/dan/nsmarks-fletcher-20260725`; do not commit them.
- Preserve “David Rumsey Map Collection, David Rumsey Map Center, Stanford
  University Libraries,” the linked
  [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) terms,
  non-commercial use, attribution, identification of georeferencing and other
  changes, and ShareAlike treatment where applicable. The MIT licence covers
  software, not imagery.
- No hosting, catalog integration, web/native enablement, native bundling, production source change, or deployment.
- Use Conventional Commits. Before publishing implementation, fetch and rebase onto current `origin/nightly`, push the feature branch, keep PR base `nightly`, and wait for hosted CI on the exact current head.
- Do not run a local Xcode build unless Swift or Xcode project files are touched; none are expected.

## File Structure

| Path | Responsibility |
| --- | --- |
| `tools/fletcher/physical_observation.py` | Parse and validate frozen or pre-fit-rejected modern-feature evidence, verify the source receipt, enforce feature-family/count/distribution rules, derive fixed polygon centroids, validate the usable-frame cutline, and hash the observation. |
| `tools/fletcher/emit_physical_gcps.py` | Deterministically generate separate control-only and check-only CSVs and provide `--check`. |
| `tools/fletcher/physical_georeference.py` | Run transport LOOCV, deterministic candidate selection, all-control refit, natural scoring, final gating, PASS-only tiling, and normalized result serialization. |
| `tools/fletcher/physical_qa.py` | Evaluate structural mesh/coverage safety, render QA evidence, validate the human visual-review receipt, and inventory required artifacts. |
| `tools/fletcher/tests/physical_fixtures.py` | Reusable valid observation, point, transform, and raster-mask fixtures for the new unit tests. |
| `tools/fletcher/tests/test_physical_observation.py` | Observation, source receipt, identity, duplicate, count, and distribution tests. |
| `tools/fletcher/tests/test_emit_physical_gcps.py` | Deterministic, byte-checkable, role-pure CSV tests. |
| `tools/fletcher/tests/test_physical_georeference.py` | LOOCV isolation, candidate failure/ranking, staged CLI, independent gates, result, and PASS-only tiling tests. |
| `tools/fletcher/tests/test_physical_qa.py` | Jacobian, anisotropy, area-scale, overlap, coverage, artifact, and visual-review tests. |
| `tools/fletcher/physical_observations/sheet-24.json` | Frozen human-reviewed controls/checks or explicit pre-fit rejection, rejected candidates, source receipts, and QA notes. |
| `tools/fletcher/physical_gcps/sheet-24-controls.csv` | Generated control-only transport GCPs when the observation is fittable. |
| `tools/fletcher/physical_gcps/sheet-24-checks.csv` | Generated check-only natural GCPs when the observation is fittable. |
| `tools/fletcher/physical_reviews/sheet-24-modern-v1.json` | Human review of required numerical/visual artifacts when both numerical gates pass, bound to observation and artifact hashes. |
| `tools/fletcher/physical_results/sheet-24-modern-v1.json` | Generated normalized result copied from the Sheet 24 manifest namespace. |
| `tools/fletcher/manifest.py` | Add an atomic namespace update that changes only Sheet 24's `modern_feature_v1` object. |
| `tools/fletcher/report.py` | Render a separate modern-feature pilots section without changing graticule meanings. |
| `tools/fletcher/tests/test_manifest.py` | Prove the scoped nested update preserves all other sheets and Sheet 24 graticule fields. |
| `tools/fletcher/tests/test_report.py` | Prove separate graticule/modern semantics, metrics, failure states, and rights wording. |
| `.github/workflows/ci.yml` | Byte-check fittable physical GCP CSVs or validate an explicit pre-fit Sheet 24 rejection. |
| `docs/FLETCHER_GEOREFERENCING.md` | Document both the engraved-grid path and the separate modern-feature path, commands, limitations, and stop condition. |
| `reports/fletcher/INVENTORY.md` | Add Sheet 24's source/result receipt while retaining the scoped permission boundary. |
| `reports/fletcher/RESULTS.md` | Generated report containing the unchanged graticule table and separate modern-feature pilot table. |

---

### Task 1: Physical observation contract and source-drift guard

**Files:**
- Create: `tools/fletcher/physical_observation.py`
- Create: `tools/fletcher/tests/physical_fixtures.py`
- Create: `tools/fletcher/tests/test_physical_observation.py`

**Interfaces:**
- Produces: `SourceReceipt`, `AcceptedPoint`, `RejectedCandidate`, `PhysicalObservation`, and `SourceVerification` frozen dataclasses.
- Produces: `parse_observation(text: str) -> PhysicalObservation`.
- Produces: `load_observation(path: pathlib.Path) -> PhysicalObservation`.
- Produces: `observation_sha256(path: pathlib.Path) -> str`.
- Produces: `polygon_centroid(ring: Sequence[tuple[float, float]]) -> tuple[float, float]`.
- Produces: `verify_source(receipt: SourceReceipt, source: pathlib.Path, read_size: Callable[[pathlib.Path], tuple[int, int]]) -> SourceVerification`.
- Produces: `verify_manifest_source(manifest_path: pathlib.Path, sheet_id: str, source: pathlib.Path, read_size: Callable[[pathlib.Path], tuple[int, int]]) -> SourceVerification`.
- Produces CLI subcommand `verify-source` with required `--manifest`, `--sheet`,
  and `--source` arguments; GDAL is imported only inside the CLI dimension
  reader.
- Produces CLI subcommand `validate` with an observation path and optional
  `--require-rejected`.

- [ ] **Step 1: Add a valid reusable Sheet 24-shaped fixture**

Create `tools/fletcher/tests/physical_fixtures.py` with a 1,000 × 1,000 usable frame, these ten control pixels:

```python
CONTROL_PIXELS = (
    (100.0, 100.0), (900.0, 100.0), (100.0, 900.0), (900.0, 900.0),
    (500.0, 100.0), (500.0, 900.0), (100.0, 500.0), (900.0, 500.0),
    (350.0, 350.0), (650.0, 650.0),
)

CHECK_PIXELS = (
    (150.0, 250.0), (850.0, 250.0), (250.0, 750.0),
    (750.0, 750.0), (450.0, 550.0), (550.0, 450.0),
)
```

`valid_observation()` must return exact Sheet 24 source fields, one unique
`complex_id` per control, three distinct check `area_id` values, alternating
eligible feature types, both `coastal` and `interior` check zones, unique modern
coordinates, complete Province source receipts, and at least one explicit
rejected candidate.

Also define:

```python
def duplicate_control_field(payload: dict, field: str) -> dict:
    changed = copy.deepcopy(payload)
    source = changed["controls"][0]
    target = changed["controls"][1]
    if field == "modern_coordinate":
        target[field] = copy.deepcopy(source[field])
    elif field == "pixel":
        target[field] = copy.deepcopy(source[field])
    else:
        target[field] = source[field]
    return changed
```

- [ ] **Step 2: Write the failing schema and source tests**

Add tests that mutate one field at a time:

```python
class PhysicalObservationTests(unittest.TestCase):
    def test_accepts_a_distributed_role_separated_observation(self) -> None:
        parsed = parse_observation(json.dumps(valid_observation()))
        self.assertEqual(parsed.method_version, "modern-feature-v1")
        self.assertEqual(len(parsed.controls), 10)
        self.assertEqual(len(parsed.final_checks), 6)

    def test_rejects_transport_feature_in_final_checks(self) -> None:
        payload = valid_observation()
        payload["final_checks"][0]["feature_type"] = "road-road-intersection"
        with self.assertRaisesRegex(ValueError, "role.*feature"):
            parse_observation(json.dumps(payload))

    def test_rejects_duplicate_id_pixel_coordinate_and_junction_complex(self) -> None:
        for field in ("id", "pixel", "modern_coordinate", "complex_id"):
            with self.subTest(field=field):
                payload = duplicate_control_field(valid_observation(), field)
                with self.assertRaisesRegex(ValueError, "duplicate"):
                    parse_observation(json.dumps(payload))

    def test_requires_counts_quadrants_and_seventy_percent_spans(self) -> None:
        payload = valid_observation()
        payload["controls"] = payload["controls"][:9]
        with self.assertRaisesRegex(ValueError, "at least 10"):
            parse_observation(json.dumps(payload))

        payload = valid_observation()
        for point in payload["controls"]:
            point["pixel"]["x"] = 400.0 + point["pixel"]["x"] * 0.1
        with self.assertRaisesRegex(ValueError, "70%"):
            parse_observation(json.dumps(payload))

    def test_requires_three_check_areas_two_classes_and_supported_zones(self) -> None:
        payload = valid_observation()
        for point in payload["final_checks"]:
            point["area_id"] = "one-place"
        with self.assertRaisesRegex(ValueError, "three separated areas"):
            parse_observation(json.dumps(payload))

    def test_rejected_candidate_requires_a_fixed_reason(self) -> None:
        payload = valid_observation()
        payload["rejected_candidates"][0].pop("reason")
        with self.assertRaisesRegex(ValueError, "rejection reason"):
            parse_observation(json.dumps(payload))

    def test_accepts_an_explicit_pre_fit_failure_without_forcing_counts(self) -> None:
        payload = valid_observation()
        payload["status"] = "rejected"
        payload["terminal_state"] = "insufficient-identity"
        payload["terminal_reason"] = "only seven transport nodes are unambiguous"
        payload["controls"] = payload["controls"][:7]
        payload["final_checks"] = []
        parsed = parse_observation(json.dumps(payload))
        self.assertEqual(parsed.status, "rejected")

    def test_polygon_centroid_uses_the_fixed_shoelace_rule(self) -> None:
        self.assertEqual(
            polygon_centroid(((0.0, 0.0), (6.0, 0.0), (0.0, 6.0))),
            (2.0, 2.0),
        )
```

Source tests must write a small temporary byte file, inject
`lambda _: (10782, 7655)`, and prove that wrong Rumsey ID, list number,
dimensions, or SHA-256 raises `SourceDriftError` containing `source-drift`.

- [ ] **Step 3: Run the new tests and confirm the import failure**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_physical_observation -v
```

Expected: FAIL because `tools.fletcher.physical_observation` does not exist.

- [ ] **Step 4: Implement the dataclasses, enums, and parser**

Use these exact accepted values:

```python
SCHEMA_VERSION = 1
METHOD_VERSION = "modern-feature-v1"
TRANSPORT_TYPES = frozenset({
    "road-road-intersection",
    "road-rail-crossing",
    "rail-rail-junction",
})
NATURAL_TYPES = frozenset({
    "river-confluence",
    "lake-outlet",
    "island-centroid",
    "headland",
    "coastline-junction",
})
REJECTION_REASONS = frozenset({
    "ambiguous-identity",
    "apparent-realignment",
    "generalized-drawing",
    "clipped-feature",
    "insufficient-topology",
    "source-error",
    "duplicate",
})
```

Every accepted point must require:

```python
(
    "id", "feature_type", "pixel", "modern_coordinate", "historical_description",
    "modern_description", "identity_rationale", "uncertainty",
    "acceptance", "modern_source",
)
```

Require `acceptance == "accepted-pre-fit"`. A transport point additionally
requires `complex_id`; a natural point requires `area_id`, `zone`, and
`derivation`. `modern_source` requires service URL, layer ID, object IDs,
source spatial reference, normalized `EPSG:4326`, retrieval timestamp, local
extract path, and extract SHA-256.

The top-level `status` is either `frozen` or `rejected`. `frozen` enforces every
count/distribution rule and may be emitted/fitted. `rejected` requires a
`terminal_state` in
`source-drift`, `modern-source-error`, `insufficient-identity`, or
`insufficient-distribution`, plus a non-empty `terminal_reason`; it preserves
the accepted subset and rejections but may not be emitted or fitted.

For every frozen observation, and every rejected observation containing a
measured pixel, require `usable_frame` to be a simple, non-self-intersecting
source-pixel polygon with at least four distinct vertices. Every
accepted/rejected pixel must lie inside it. Distribution percentages use its
bounding box; the same polygon becomes the independently measured map cutline.
A `source-drift` rejection with no inspected pixels may omit the frame.

Normalize duplicate keys before comparison:

```python
pixel_key = (round(pixel_x, 3), round(pixel_y, 3))
world_key = (round(lon, 8), round(lat, 8))
```

Enforce control quadrants relative to the usable-frame midpoint, 70% x/y span,
unique `complex_id`, final-check area/class/zone requirements, and disjoint IDs,
pixels, and modern coordinates across both roles. Reject duplicate natural
derivations with the same service URL, layer ID, object-ID set, and derivation
rule so one modern geometry cannot count twice. Do not import GDAL at module
import time.

Implement `polygon_centroid` with the shoelace formula, reject a zero-area or
self-intersecting ring, and use the same function whenever a point declares
`derivation: "polygon-centroid"`.

- [ ] **Step 5: Implement source verification and CLI**

Reuse `tools.fletcher.fetch.sha256`. `verify_source` must compare all expected
fields and raise:

```python
class SourceDriftError(ValueError):
    pass

raise SourceDriftError(
    "source-drift: expected "
    f"{receipt.rumsey_id} {receipt.width}x{receipt.height} {receipt.sha256}; "
    f"got {actual_width}x{actual_height} {actual_sha256}"
)
```

`verify_manifest_source` must read `manifest["sheets"]["24"]`, require its
Rumsey ID, list number, source path/checksum/dimensions, and compare them with
the file. The CLI's `read_size` lazily imports `from osgeo import gdal`, opens
the raster, and returns `(RasterXSize, RasterYSize)`.

- [ ] **Step 6: Run targeted and complete Fletcher tests**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_physical_observation -v
python3 -m unittest discover -s tools/fletcher/tests -t .
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/fletcher/physical_observation.py \
  tools/fletcher/tests/physical_fixtures.py \
  tools/fletcher/tests/test_physical_observation.py
git commit -m "feat(fletcher): validate modern-feature observations"
```

---

### Task 2: Deterministic role-pure GCP generation

**Files:**
- Create: `tools/fletcher/emit_physical_gcps.py`
- Create: `tools/fletcher/tests/test_emit_physical_gcps.py`

**Interfaces:**
- Consumes: `PhysicalObservation` and `load_observation` from Task 1.
- Produces: `EmittedPhysicalGCPs(controls: str, checks: str)`.
- Produces: `emit(observation: PhysicalObservation) -> EmittedPhysicalGCPs`.
- Produces CLI with `observation`, `--controls`, `--checks`, and `--check`.

- [ ] **Step 1: Write failing deterministic and role tests**

```python
class EmitPhysicalGCPTests(unittest.TestCase):
    def test_emits_sorted_role_pure_files(self) -> None:
        emitted = emit(parse_observation(json.dumps(valid_observation())))
        controls = parse_gcp_csv(emitted.controls)
        checks = parse_gcp_csv(emitted.checks)
        self.assertEqual({point.role for point in controls}, {"control"})
        self.assertEqual({point.role for point in checks}, {"check"})
        self.assertEqual(len(controls), 10)
        self.assertEqual(len(checks), 6)

    def test_emission_is_byte_deterministic(self) -> None:
        observation = parse_observation(json.dumps(valid_observation()))
        self.assertEqual(emit(observation), emit(observation))

    def test_check_mode_refuses_either_stale_file(self) -> None:
        with self.assertRaisesRegex(ValueError, "controls.*stale"):
            check_outputs(observation, stale_controls, current_checks)
        with self.assertRaisesRegex(ValueError, "checks.*stale"):
            check_outputs(observation, current_controls, stale_checks)

    def test_refuses_to_emit_a_rejected_observation(self) -> None:
        payload = valid_observation()
        payload["status"] = "rejected"
        payload["terminal_state"] = "insufficient-distribution"
        payload["terminal_reason"] = "controls span less than 70% of the frame"
        with self.assertRaisesRegex(ValueError, "rejected observation"):
            emit(parse_observation(json.dumps(payload)))
```

- [ ] **Step 2: Confirm the test fails**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_emit_physical_gcps -v
```

Expected: FAIL because `emit_physical_gcps` does not exist.

- [ ] **Step 3: Implement deterministic rendering**

Sort each role by stable point ID. Use the existing columns and fixed precision:

```python
HEADER = "pixel_x,pixel_y,lon,lat,role,label"

def render(points: tuple[AcceptedPoint, ...], role: str, sheet: str) -> str:
    lines = [
        f"# {sheet} Fletcher {role} physical-feature points.",
        "# GENERATED - edit the observation JSON and re-emit; do not hand-edit.",
        HEADER,
    ]
    for point in sorted(points, key=lambda item: item.id):
        lines.append(
            f"{point.pixel_x:.1f},{point.pixel_y:.1f},"
            f"{point.lon:.8f},{point.lat:.8f},{role},{point.id}"
        )
    return "\n".join(lines) + "\n"
```

In normal mode write both files through sibling `.tmp` files followed by
`os.replace`. In `--check` mode write nothing; compare both expected byte
strings and return exit 1 naming every stale path.

- [ ] **Step 4: Run targeted and full Fletcher tests**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_emit_physical_gcps -v
python3 -m unittest discover -s tools/fletcher/tests -t .
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/fletcher/emit_physical_gcps.py \
  tools/fletcher/tests/test_emit_physical_gcps.py
git commit -m "feat(fletcher): emit separated physical GCP files"
```

---

### Task 3: Transport leave-one-out transform selection

**Files:**
- Create: `tools/fletcher/physical_georeference.py`
- Create: `tools/fletcher/tests/test_physical_georeference.py`

**Interfaces:**
- Consumes: control-only `GroundControlPoint` rows, existing
  `build_translate_command`, `build_transform_command`, `build_warp_command`,
  `check_errors`, and `summarise`.
- Produces: `AccuracyMetrics(point_count: int, rms_m: float, p95_m: float,
  max_m: float)`, `CandidateResult(method: str, metrics:
  AccuracyMetrics | None, failure: str | None)`, `CandidateSet(candidates:
  tuple[CandidateResult, ...], failures: dict[str, str])`,
  `SelectionResult`, and `FinalCheckResult` frozen dataclasses.
- Produces: `loocv_folds(points: Sequence[GroundControlPoint]) -> Iterator[tuple[GroundControlPoint, list[GroundControlPoint]]]`.
- Produces: `evaluate_candidate(method, source, controls, output_dir, transform_runner) -> CandidateResult`.
- Produces: `evaluate_candidates(source, controls, output_dir) -> CandidateSet`.
- Produces: `choose_candidate(candidates: Sequence[CandidateResult]) -> CandidateResult`.

- [ ] **Step 1: Write failing LOOCV-isolation and selection tests**

```python
def make_controls() -> list[GroundControlPoint]:
    return [
        GroundControlPoint(
            float(index * 10),
            float((index % 3) * 100),
            -61.0 + index * 0.001,
            45.5 + index * 0.001,
            "control",
            f"control-{index:02d}",
        )
        for index in range(10)
    ]

class LeaveOneOutTests(unittest.TestCase):
    def test_each_control_is_absent_from_its_fold_fit(self) -> None:
        controls = make_controls()
        folds = list(loocv_folds(controls))
        self.assertEqual(len(folds), 10)
        for held, training in folds:
            self.assertNotIn(held, training)
            self.assertEqual(len(training), 9)
            self.assertEqual(set(training) | {held}, set(controls))

    def test_final_check_coordinates_cannot_enter_candidate_api(self) -> None:
        signature = inspect.signature(evaluate_candidate)
        self.assertNotIn("checks", signature.parameters)
        self.assertNotIn("final_checks", signature.parameters)

    def test_candidate_failures_are_retained(self) -> None:
        source = pathlib.Path("scan.tif")
        controls = make_controls()
        output_dir = pathlib.Path("out")
        with mock.patch(
            "tools.fletcher.physical_georeference.evaluate_candidate",
            side_effect=[
                CandidateResult("affine", AccuracyMetrics(10, 50.0, 80.0, 90.0), None),
                ValueError("rank deficient"),
                CandidateResult("tps", AccuracyMetrics(10, 40.0, 70.0, 85.0), None),
            ],
        ):
            result = evaluate_candidates(source, controls, output_dir)
        self.assertEqual(result.failures["polynomial2"], "rank deficient")

    def test_tie_break_is_rms_p95_max_then_complexity(self) -> None:
        tied = [
            CandidateResult("tps", AccuracyMetrics(10, 20.0, 30.0, 40.0), None),
            CandidateResult("polynomial2", AccuracyMetrics(10, 20.0, 30.0, 40.0), None),
            CandidateResult("affine", AccuracyMetrics(10, 20.0, 30.0, 40.0), None),
        ]
        self.assertEqual(choose_candidate(tied).method, "affine")
```

Add a subprocess-mock test that captures all ten fold
`gdal_translate` commands and proves each command contains exactly nine
`-gcp` flags and never the held point's pixel pair.

`evaluate_candidates` must iterate `("affine", "polynomial2", "tps")` in that
order.

- [ ] **Step 2: Confirm failure**

Run:

```bash
python3 -m unittest \
  tools.fletcher.tests.test_physical_georeference.LeaveOneOutTests -v
```

Expected: FAIL because the new module does not exist.

- [ ] **Step 3: Implement data types, folds, and ranking**

Use:

```python
METHOD_FLAGS = {
    "affine": ("-order", "1"),
    "polynomial2": ("-order", "2"),
    "tps": ("-tps",),
}
METHOD_COMPLEXITY = {"affine": 0, "polynomial2": 1, "tps": 2}

def loocv_folds(points):
    for index, held in enumerate(points):
        yield held, [point for offset, point in enumerate(points) if offset != index]

def candidate_rank(candidate: CandidateResult) -> tuple[float, float, float, int]:
    metrics = candidate.metrics
    return (
        metrics.rms_m,
        metrics.p95_m,
        metrics.max_m,
        METHOD_COMPLEXITY[candidate.method],
    )
```

`choose_candidate` must reject candidates with execution or structural failure,
retain those failures in the enclosing selection result, and choose
`min(valid, key=candidate_rank)`. It must not search for a different family
after the selected family later fails the fixed transport gate.

- [ ] **Step 4: Implement actual fold evaluation**

For every fold:

1. create
   `output_dir / method / f"fold-{held.label}" / "gcps.vrt"`;
2. run `gdal_translate` with the `N-1` training controls;
3. run `gdaltransform` with the candidate's actual method flag on only the
   held pixel;
4. compute ground-metre error with `check_errors([held], transformed)`;
5. summarize all N errors with the existing `rms` and P95 rule.

Use the stable point ID supplied by the generated CSV label in artifact names.
Catch `OSError`, `subprocess.CalledProcessError`, and `ValueError` per family;
record the full exception string without hiding the other candidates.

- [ ] **Step 5: Test all three actual GDAL flag paths**

Assert affine fold commands contain `-order 1`, polynomial2 contains
`-order 2`, and TPS contains `-tps`. Assert no fold or all-control refit ever
uses a row whose role is not `control`.

- [ ] **Step 6: Run targeted and complete tests**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_physical_georeference -v
python3 -m unittest discover -s tools/fletcher/tests -t .
```

Expected: PASS with all subprocess calls mocked; CI must not require GDAL.

- [ ] **Step 7: Commit**

```bash
git add tools/fletcher/physical_georeference.py \
  tools/fletcher/tests/test_physical_georeference.py
git commit -m "feat(fletcher): select physical transforms by leave-one-out"
```

---

### Task 4: Structural warp and visual-evidence gates

**Files:**
- Create: `tools/fletcher/physical_qa.py`
- Create: `tools/fletcher/tests/test_physical_qa.py`
- Modify: `tools/fletcher/physical_georeference.py`
- Modify: `tools/fletcher/tests/test_physical_georeference.py`

**Interfaces:**
- Produces: `StructuralMetrics`, `StructuralVerdict`, `ArtifactInventory`, and
  `VisualReview` frozen dataclasses.
- Produces: `evaluate_structure(transform, frame_polygon, control_pixels,
  grid_size=21, step_px=1.0) -> StructuralVerdict`.
- Produces: `coverage_components(mask: Sequence[Sequence[bool]]) -> int`.
- Produces: `validate_visual_review(text: str, expected_observation_sha256: str) -> VisualReview`.
- Produces CLI subcommand `render` with required `--source`, `--observation`,
  `--selection`, `--natural-checks`, `--reference`, and `--output` arguments.
- Consumed by Task 3: every candidate gets a structural verdict before
  `choose_candidate`; invalid candidates are excluded but their exact failures
  remain recorded.

- [ ] **Step 1: Write failing structural tests**

```python
class StructuralGateTests(unittest.TestCase):
    def test_accepts_identity_like_transform(self) -> None:
        verdict = evaluate_structure(
            lambda x, y: (2.0 * x, 2.0 * y),
            frame_polygon=(
                (0.0, 0.0), (1000.0, 0.0),
                (1000.0, 1000.0), (0.0, 1000.0),
            ),
            control_pixels=CONTROL_PIXELS,
        )
        self.assertTrue(verdict.passed)
        self.assertEqual(verdict.sample_grid, (21, 21))

    def test_rejects_fold_nonfinite_anisotropy_and_area_outlier(self) -> None:
        cases = (
            (lambda x, y: (-x, y), "determinant"),
            (lambda x, y: (math.nan, y), "non-finite"),
            (lambda x, y: (5.0 * x, y), "anisotropy"),
            (
                lambda x, y: (
                    x * (0.1 if x > 500.0 else 1.0),
                    y,
                ),
                "area scale",
            ),
        )
        for transform, reason in cases:
            with self.subTest(reason=reason):
                verdict = evaluate_structure(
                    transform,
                    (
                        (0.0, 0.0), (1000.0, 0.0),
                        (1000.0, 1000.0), (0.0, 1000.0),
                    ),
                    CONTROL_PIXELS,
                )
                self.assertFalse(verdict.passed)
                self.assertIn(reason, verdict.reason)

    def test_rejects_disconnected_alpha_coverage(self) -> None:
        mask = [[True, True, False, True, True]]
        self.assertEqual(coverage_components(mask), 2)
```

Add tests for overlapping non-neighbour mesh cells, a missing required QA
artifact, an observation-hash mismatch, a claimed visual PASS with any failed
check, and a valid all-PASS review.

- [ ] **Step 2: Confirm failure**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_physical_qa -v
```

Expected: FAIL because `physical_qa` does not exist.

- [ ] **Step 3: Implement convex-hull mesh sampling**

Implement the monotone-chain hull over control pixels and sample exactly
21 positions on each usable-frame axis. Keep points/cells whose corners lie
inside or on the hull. Fail if no complete cell survives.

Estimate the Jacobian with central differences:

```python
dx0, dy0 = transform(x - step_px, y)
dx1, dy1 = transform(x + step_px, y)
ex0, ey0 = transform(x, y - step_px)
ex1, ey1 = transform(x, y + step_px)
jacobian = (
    ((dx1 - dx0) / (2 * step_px), (ex1 - ex0) / (2 * step_px)),
    ((dy1 - dy0) / (2 * step_px), (ey1 - ey0) / (2 * step_px)),
)
```

For `[[a,b],[c,d]]`, compute:

```python
determinant = a * d - b * c
trace_jtj = a * a + b * b + c * c + d * d
root = math.sqrt(max(0.0, trace_jtj * trace_jtj - 4.0 * determinant * determinant))
smax = math.sqrt((trace_jtj + root) / 2.0)
smin = math.sqrt((trace_jtj - root) / 2.0)
anisotropy = math.inf if smin == 0.0 else smax / smin
area_scale = abs(determinant)
```

Reject non-finite components, determinant ≤ 0, or anisotropy > 4. Reject any
area scale below `0.25 * median` or above `4.0 * median`.
Collect all structural violations in the verdict reason instead of returning
after the first one; this keeps the retained failure evidence complete.

- [ ] **Step 4: Implement duplicate/disconnected coverage checks**

Build transformed quadrilaterals from surviving mesh cells. Use orientation and
segment-intersection tests plus point-in-polygon containment to reject overlap
between non-neighbour cells. Treat edge-sharing neighbours as connected, build
the cell adjacency graph, and require one connected component.

For the raster alpha mask, use four-neighbour flood fill in
`coverage_components`; the runtime renderer reads the alpha band with GDAL,
thresholds alpha > 0, and rejects zero or multiple components. Keep OpenCV and
GDAL imports inside runtime functions so unit tests remain standard-library.

- [ ] **Step 5: Implement required artifact inventory and render command**

Require these keys:

```python
REQUIRED_ARTIFACTS = (
    "candidate_contact_sheet",
    "transport_control_crops",
    "natural_check_crops",
    "transport_residual_vectors",
    "natural_residual_vectors",
    "warped_preview",
    "transportation_overlay",
    "hydrography_overlay",
    "alpha_coverage",
    "tile_sample_z8",
    "tile_sample_z12",
    "tile_sample_z16",
)
```

`transport_control_crops` must contain at least 10 paths and
`natural_check_crops` at least 6. `nsprd_overlay` and `aerial_overlay` are
optional and may appear only when their use is described in the review.

The render CLI must:

- crop each frozen pixel from the full-resolution scan with GDAL/OpenCV;
- make contact sheets labelled by stable ID, role, pixel, source layer, and
  object ID;
- render residual-vector SVGs from immutable JSON metrics;
- create a 1,600-pixel warped preview with alpha;
- rasterize the retained modern extracts over the warp for transport,
  hydrography, and optional NSPRD overlays;
- create alpha coverage diagnostics;
- make QA-only sample tiles at zooms 8, 12, and 16 under the QA directory;
- hash every artifact and write `artifact-inventory.json`.

It must not create `/tiles/sheet-24-modern-v1/`.

- [ ] **Step 6: Define the visual-review contract**

Require checks named:

```python
VISUAL_CHECKS = (
    "upright",
    "not_mirrored",
    "no_folding",
    "no_duplicate_geography",
    "reasonable_stretch",
    "single_alpha_component",
    "no_transparent_slivers",
    "no_border_leakage",
    "coordinate_signs",
    "transport_identity",
    "natural_alignment",
    "tile_samples",
    "shared_boundary_if_applicable",
)
```

Each value is `PASS`, `FAIL`, or `NOT_APPLICABLE`; only
`shared_boundary_if_applicable` may be `NOT_APPLICABLE`. A review PASS requires
all other values PASS and every artifact path/hash to match the inventory.

- [ ] **Step 7: Integrate structure into candidate selection**

`evaluate_candidate` must refit each family on all transport controls solely to
obtain its structural transform, call `evaluate_structure`, and store the
verdict beside LOOCV metrics. `choose_candidate` must exclude structural
failures before applying the deterministic metric/complexity rank.

- [ ] **Step 8: Run tests and commit**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_physical_qa -v
python3 -m unittest tools.fletcher.tests.test_physical_georeference -v
python3 -m unittest discover -s tools/fletcher/tests -t .
```

Expected: PASS.

Commit:

```bash
git add tools/fletcher/physical_qa.py \
  tools/fletcher/physical_georeference.py \
  tools/fletcher/tests/test_physical_qa.py \
  tools/fletcher/tests/test_physical_georeference.py
git commit -m "feat(fletcher): gate physical warps on structural QA"
```

---

### Task 5: Staged selection, untouched natural scoring, final result, and PASS-only tiling

**Files:**
- Modify: `tools/fletcher/physical_georeference.py`
- Modify: `tools/fletcher/tests/test_physical_georeference.py`

**Interfaces:**
- Produces CLI subcommands: `select`, `score`, `finalize`, and `tile`.
- Produces: `select_transform(source, controls_path, observation_path, output_dir) -> SelectionResult`.
- Produces: `score_final_checks(selection_path, checks_path, output_path) -> FinalCheckResult`.
- Produces: `ModernGateVerdict(passed: bool, disposition: str, reason: str)`.
- Produces: `evaluate_final_gates(transport: AccuracyMetrics, natural:
  AccuracyMetrics) -> ModernGateVerdict`.
- Produces: `finalize_result(selection_path, final_check_path:
  pathlib.Path | None, visual_review_path: pathlib.Path | None) -> dict`.
- Produces: `tile_if_pass(result_path, raster_path, tiles_path, zoom_min=8, zoom_max=16) -> dict`.
- Produces CLI subcommand `prefit-failure` that converts only a rejected
  observation into a normalized terminal result without loading GCPs or GDAL.
- Produces: `prefit_failure_result(observation: PhysicalObservation) -> dict`.

- [ ] **Step 1: Write failing staged-interface tests**

```python
class StagedCommandTests(unittest.TestCase):
    def test_select_parser_has_no_check_argument(self) -> None:
        parser = build_parser()
        select = parser.parse_args([
            "select", "--source", "scan.tif", "--controls", "controls.csv",
            "--observation", "observation.json", "--output", "selection",
        ])
        self.assertFalse(hasattr(select, "checks"))

    def test_score_uses_the_frozen_refit_and_cannot_select_a_family(self) -> None:
        signature = inspect.signature(score_final_checks)
        self.assertNotIn("method", signature.parameters)
        self.assertNotIn("controls_path", signature.parameters)

    def test_both_numerical_gates_are_required(self) -> None:
        transport_pass = AccuracyMetrics(10, 100.0, 200.0, 300.0)
        transport_fail = AccuracyMetrics(10, 401.0, 500.0, 700.0)
        natural_pass = AccuracyMetrics(6, 120.0, 220.0, 320.0)
        natural_fail = AccuracyMetrics(6, 450.0, 600.0, 800.0)
        self.assertEqual(
            evaluate_final_gates(transport_pass, natural_fail).disposition,
            "FAIL",
        )
        self.assertEqual(
            evaluate_final_gates(transport_fail, natural_pass).disposition,
            "FAIL",
        )

    def test_tiling_refuses_non_pass_and_wrong_zoom_range(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            failed = root / "failed.json"
            passed = root / "passed.json"
            failed.write_text('{"disposition":"natural-check-fail"}\n')
            passed.write_text(
                '{"disposition":"PASS","visual_qa":{"gate":"PASS"}}\n'
            )
            with self.assertRaisesRegex(ValueError, "final PASS"):
                tile_if_pass(failed, root / "raster.tif", root / "tiles")
            with self.assertRaisesRegex(ValueError, "8 through 16"):
                tile_if_pass(
                    passed, root / "raster.tif", root / "tiles", 9, 16
                )

    def test_prefit_failure_refuses_a_fittable_observation(self) -> None:
        frozen = parse_observation(json.dumps(valid_observation()))
        with self.assertRaisesRegex(ValueError, "status.*rejected"):
            prefit_failure_result(frozen)
```

Add a test that patches `load_gcps` and proves `select` opens only the control
path; patch `pathlib.Path.read_text` during `score` and prove it reads selection
and checks but not the observation or control CSV.

- [ ] **Step 2: Confirm failure**

Run:

```bash
python3 -m unittest \
  tools.fletcher.tests.test_physical_georeference.StagedCommandTests -v
```

Expected: FAIL because the staged CLI is not complete.

- [ ] **Step 3: Implement the control-only selection stage**

`select` must:

1. verify observation SHA and source receipt;
2. parse only the generated control CSV and reject any non-control row;
3. require exactly the observation's control IDs/coordinates;
4. evaluate all candidate families by LOOCV and structural gate;
5. choose the deterministic winner;
6. evaluate the transport 10/400/900/1,500 gate;
7. refit the winner on all controls;
8. densify the frozen `usable_frame`, project it through the all-control
   transform, and build the selected raster with
   `-cutline`, `-crop_to_cutline`, and `-dstalpha`;
9. write `selection.json`, `selected-gcps.vrt`, selected raster, projected
   cutline, candidate
   failures, candidate metrics, structural metrics, and observation SHA.

If all methods error, use `candidate-failure`. If none is structurally valid,
use `structural-fail`. If the winner misses the transport numerical gate, use
`transport-cross-validation-fail`. These terminal states do not load or score
the natural-check CSV.

Add a command-builder test proving the selected warp carries `-cutline`,
`-crop_to_cutline`, and `-dstalpha`, and that the projected cutline is derived
from the observation's frozen usable-frame polygon rather than from a
neighbouring sheet or inferred bounds.

- [ ] **Step 4: Implement one-time natural scoring**

`score` must reject a selection whose transport or structural gate did not
pass. It loads the selected all-control VRT and the check-only CSV, validates
that every row is `check`, runs the selected method through `gdaltransform`,
and writes per-point ground-metre residuals plus RMS/P95/maximum to
`natural-checks.json`.

Bind the output to:

```python
{
    "schema_version": 1,
    "method_version": "modern-feature-v1",
    "observation_sha256": selection["observation_sha256"],
    "selection_sha256": sha256(selection_path),
    "selected_method": selection["selected_method"],
    "check_count": len(checks),
    "residuals": [residual.as_dict() for residual in residuals],
    "rms_m": report.check_rms_m,
    "p95_m": report.check_p95_m,
    "max_m": report.check_max_m,
    "gate": "PASS" if verdict.passed else "FAIL",
    "reason": verdict.reason,
}
```

A failed natural gate is terminal `natural-check-fail`. Do not rerun selection,
edit the observation, or drop a check.

- [ ] **Step 5: Implement the pre-fit failure result**

`prefit-failure` accepts only a `status: "rejected"` Sheet 24 observation. It
copies the exact source receipt, detector path, accepted/rejected counts,
terminal state/reason, and observation SHA into the normalized result. It
records candidate, transport, structural, natural, visual, raster, and tile
stages as `not-run`. It does not import GDAL, open GCP CSVs, or create a
deliverable tile directory.

- [ ] **Step 6: Implement finalization and result serialization**

`finalize` always validates the selection hash. It requires natural-check,
artifact-inventory, and visual-review hashes only when the preceding stage
reached them. A control-selection, structural, transport, or natural-check
failure records downstream stages as `not-run` with the blocking terminal
state; it does not manufacture a visual review. A candidate that passes both
numerical gates must supply and pass the complete artifact inventory and visual
review. It emits one normalized result with these terminal states:

```python
TERMINAL_STATES = frozenset({
    "source-drift",
    "modern-source-error",
    "insufficient-identity",
    "insufficient-distribution",
    "candidate-failure",
    "transport-cross-validation-fail",
    "structural-fail",
    "natural-check-fail",
    "visual-qa-fail",
    "PASS",
})
```

It records every required source, observation, GCP, candidate, metric,
structural, QA, raster, and planned tile field. A PASS initially records
`tile_png_count: 0` and `tile_stage: "not-generated"`; a FAIL records no
deliverable tile path.

- [ ] **Step 7: Implement PASS-only tiling**

`tile` must re-read the result and refuse unless disposition is exactly PASS,
the visual review is PASS, and the selected raster hash/path match. Reuse
`build_tile_command` with `--xyz`, `--resume`, and exact zooms 8–16. Count only
`*.png`, atomically update the result with `tile_stage: "tiled"`,
`tile_png_count`, tile path, and completion timestamp.

- [ ] **Step 8: Run all Fletcher tests and commit**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_physical_georeference -v
python3 -m unittest discover -s tools/fletcher/tests -t .
```

Expected: PASS.

Commit:

```bash
git add tools/fletcher/physical_georeference.py \
  tools/fletcher/tests/test_physical_georeference.py
git commit -m "feat(fletcher): stage independent physical validation"
```

---

### Task 6: Atomic Sheet 24 manifest namespace and normalized result ledger

**Files:**
- Modify: `tools/fletcher/manifest.py`
- Modify: `tools/fletcher/tests/test_manifest.py`
- Modify: `tools/fletcher/physical_georeference.py`
- Modify: `tools/fletcher/tests/test_physical_georeference.py`

**Interfaces:**
- Produces: `Manifest.update_namespace(sheet_id: str, namespace: str, value: dict) -> None`.
- Produces: `record_result(manifest_path, sheet_id, result_path,
  committed_result_path) -> None`.
- Adds CLI subcommand `record` with required `--manifest`, `--sheet`, `--result`,
  and `--committed-result` arguments.

- [ ] **Step 1: Write the failing preservation test**

```python
def test_modern_result_changes_only_sheet_24_namespace(self) -> None:
    with tempfile.TemporaryDirectory() as directory:
        path = pathlib.Path(directory) / "manifest.json"
        before = {
            "version": 1,
            "sheets": {
                "23": {"stage": "tiled", "gate": "PASS", "tile_png_count": 7834},
                "24": {
                    "stage": "failed",
                    "gate": "FAIL",
                    "reason": "automatic graticule detection found no reviewable regular sequence",
                    "rumsey_id": "RUMSEY~8~1~2649~290017",
                },
            },
        }
        modern = {"method_version": "modern-feature-v1", "disposition": "PASS"}
        path.write_text(json.dumps(before) + "\n", encoding="utf-8")
        Manifest(path).update_namespace("24", "modern_feature_v1", modern)
        after = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(after["sheets"]["23"], before["sheets"]["23"])
        self.assertEqual(
            {
                key: value
                for key, value in after["sheets"]["24"].items()
                if key != "modern_feature_v1"
            },
            before["sheets"]["24"],
        )
        self.assertEqual(after["sheets"]["24"]["modern_feature_v1"], modern)
```

Also assert the temporary `.tmp` file is absent after success and a simulated
`os.replace` failure leaves the original manifest bytes intact.

- [ ] **Step 2: Confirm failure**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_manifest -v
```

Expected: FAIL because `update_namespace` does not exist.

- [ ] **Step 3: Implement exact nested replacement**

```python
def update_namespace(self, sheet_id: str, namespace: str, value: dict) -> None:
    if sheet_id not in self.sheets:
        raise KeyError(f"sheet {sheet_id} is absent from the manifest")
    current = dict(self.sheets[sheet_id])
    current[namespace] = copy.deepcopy(value)
    self.sheets[sheet_id] = current
    self._write()
```

Do not call the existing top-level `update`, because that would add/change
Sheet 24's shared `updated_at` field and violate the narrower preservation
contract.

- [ ] **Step 4: Implement result recording**

`record_result` must:

1. require `sheet_id == "24"` and result method `modern-feature-v1`;
2. validate the final result schema and terminal disposition;
3. for PASS require `tile_stage == "tiled"` and `tile_png_count > 0`;
4. for FAIL require no deliverable tile path/count;
5. call `update_namespace("24", "modern_feature_v1", result)`;
6. re-read the manifest and write the identical nested object, sorted and
   newline-terminated, to
   `tools/fletcher/physical_results/sheet-24-modern-v1.json`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_manifest -v
python3 -m unittest tools.fletcher.tests.test_physical_georeference -v
python3 -m unittest discover -s tools/fletcher/tests -t .
```

Expected: PASS.

Commit:

```bash
git add tools/fletcher/manifest.py \
  tools/fletcher/physical_georeference.py \
  tools/fletcher/tests/test_manifest.py \
  tools/fletcher/tests/test_physical_georeference.py
git commit -m "feat(fletcher): record scoped modern-feature results"
```

---

### Task 7: Separate report semantics and modern workflow documentation

**Files:**
- Modify: `tools/fletcher/report.py`
- Modify: `tools/fletcher/tests/test_report.py`
- Modify: `docs/FLETCHER_GEOREFERENCING.md`

**Interfaces:**
- Produces: `render_modern_pilots(manifest: dict) -> str`.
- `render_results` appends, but does not merge, a `## Modern-feature pilots`
  section after the graticule table.

- [ ] **Step 1: Write failing report-separation tests**

```python
def test_report_keeps_graticule_failure_and_modern_pass_separate(self) -> None:
    manifest = {
        "sheets": {
            "24": {
                "stage": "failed",
                "gate": "FAIL",
                "reason": "automatic graticule detection found no reviewable regular sequence",
                "modern_feature_v1": {
                    "method_version": "modern-feature-v1",
                    "disposition": "PASS",
                    "selected_method": "affine",
                    "transport": {"count": 10, "rms_m": 100.0, "p95_m": 150.0, "max_m": 200.0},
                    "natural": {"count": 6, "rms_m": 120.0, "p95_m": 180.0, "max_m": 250.0},
                    "structural": {"gate": "PASS"},
                    "visual_qa": {"gate": "PASS"},
                    "tile_png_count": 100,
                    "reason": "all gates passed",
                },
            },
        },
    }
    rendered = render_results(manifest, sheet_numbers=[24])
    self.assertIn("| 24 | failed |", rendered)
    self.assertIn("automatic graticule detection", rendered)
    self.assertIn("## Modern-feature pilots", rendered)
    self.assertIn("| 24 | modern-feature-v1 | PASS |", rendered)
    self.assertIn("natural checks", rendered)

def test_report_preserves_every_terminal_failure_state(self) -> None:
    for state in sorted(TERMINAL_STATES - {"PASS"}):
        with self.subTest(state=state):
            manifest = {
                "sheets": {
                    "24": {
                        "modern_feature_v1": {
                            "method_version": "modern-feature-v1",
                            "disposition": state,
                            "reason": state,
                        }
                    }
                }
            }
            self.assertIn(state, render_modern_pilots(manifest))
```

Retain the existing rights and graticule methodological-limitation assertions.

- [ ] **Step 2: Confirm failure**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_report -v
```

Expected: FAIL because the modern section does not exist.

- [ ] **Step 3: Implement the separate modern table**

Use columns:

```text
Sheet | Method version | Disposition | Selected transform | Transport n |
Transport RMS/P95/max m | Natural n | Natural RMS/P95/max m |
Structural gate | Visual QA | PNG tiles | Reason
```

Read only `fields.get("modern_feature_v1")`; never infer a modern result from
graticule fields. If absent, render no modern row. Keep the existing graticule
pass/tile counts unchanged.

- [ ] **Step 4: Rewrite the operational document**

In `docs/FLETCHER_GEOREFERENCING.md`:

- retain the direct-Rumsey, rights, immutable-host, and OldMapsOnline history;
- describe engraved-grid and modern-feature workflows as separate result
  families;
- document exact `verify-source`, emitter, `select`, `score`, QA, `finalize`,
  `tile`, and `record` commands;
- explain why transport LOOCV selects the family and natural checks are the
  primary published estimate;
- state that the final checks are separated by file and command, not merely by
  reviewer convention;
- document the property/aerial corroboration boundary;
- document all structural and numerical limits;
- explain the no-point-adjustment/versioned-rerun rule;
- retain the complete Rumsey attribution and excluded-use wording;
- state that partial publication and all hosting/product/deployment work remain
  separate.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
python3 -m unittest tools.fletcher.tests.test_report -v
python3 -m unittest discover -s tools/fletcher/tests -t .
git diff --check
```

Expected: PASS.

Commit:

```bash
git add tools/fletcher/report.py \
  tools/fletcher/tests/test_report.py \
  docs/FLETCHER_GEOREFERENCING.md
git commit -m "docs(fletcher): define modern-feature result semantics"
```

- [ ] **Step 6: Publish and verify the tooling checkpoint before GIS work**

```bash
git fetch origin
git rebase origin/nightly
python3 -m unittest discover -s tools/fletcher/tests -t .
git diff --check
git push --force-with-lease origin feature/fletcher-sheet-24-modern-design
```

Wait for PR #163 checks on this exact head. Do not begin manual Sheet 24
measurement until the Fletcher tooling and generated-file checks are green.

---

### Task 8: Verify, investigate, measure, and freeze Sheet 24

**Files:**
- Create: `tools/fletcher/physical_observations/sheet-24.json`
- Create if observation status is frozen:
  `tools/fletcher/physical_gcps/sheet-24-controls.csv`
- Create if observation status is frozen:
  `tools/fletcher/physical_gcps/sheet-24-checks.csv`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes the schema/emitter from Tasks 1–2.
- Produces the immutable observation SHA used by every later stage.
- Produces no transform or residual.

- [ ] **Step 1: Prepare a clean Bazzite checkout without touching host packages**

Run in a shell on the Bazzite host:

```bash
set -euo pipefail
repo=/var/home/dan/nsmarks-fletcher-20260725/repo-sheet-24-modern-v1
if [ -e "$repo" ]; then
  git -C "$repo" status --short --branch
  test -z "$(git -C "$repo" status --porcelain)"
  test "$(git -C "$repo" branch --show-current)" = \
    feature/fletcher-sheet-24-modern-design
  git -C "$repo" fetch origin
  git -C "$repo" pull --ff-only
else
  git clone \
    --branch feature/fletcher-sheet-24-modern-design \
    --single-branch \
    https://github.com/dfakkeldy/ns-marks-the-spot.git \
    "$repo"
fi
git -C "$repo" merge-base --is-ancestor b417055dc HEAD
distrobox enter nsmarks-gis -- python3 -c \
  'from osgeo import gdal; import cv2; print(gdal.VersionInfo(), cv2.__version__)'
```

Expected: clean checkout, ancestry command exit 0, GDAL/OpenCV versions print.
Do not run `rpm-ostree`.

- [ ] **Step 2: Verify the cached direct source against the existing manifest**

Run:

```bash
distrobox enter nsmarks-gis -- bash -lc '
set -euo pipefail
cd /var/home/dan/nsmarks-fletcher-20260725/repo-sheet-24-modern-v1
python3 -m tools.fletcher.physical_observation verify-source \
  --manifest /var/home/dan/nsmarks-fletcher-20260725/manifest.json \
  --sheet 24 \
  --source /var/home/dan/nsmarks-fletcher-20260725/work/sheet-24/sheet-24.tif
'
```

Expected JSON: Rumsey ID `RUMSEY~8~1~2649~290017`, dimensions
`[10782, 7655]`, and SHA-256
`735daf2fb3b8afd12bef672ffaad9425c05ec1873a75afdb708ff048cb8dfee8`.
On any mismatch, do not inspect or transform the scan. Follow only the rejected
observation/result receipt path with terminal `source-drift`, publish that FAIL,
and stop.

- [ ] **Step 3: Retain the unchanged automatic-detector evidence**

Run:

```bash
distrobox enter nsmarks-gis -- bash -lc '
set -euo pipefail
cd /var/home/dan/nsmarks-fletcher-20260725/repo-sheet-24-modern-v1
mkdir -p /var/home/dan/nsmarks-fletcher-20260725/qa/sheet-24-modern-v1
python3 -m tools.fletcher.detect_lattice \
  /var/home/dan/nsmarks-fletcher-20260725/work/sheet-24/sheet-24.tif \
  --out /var/home/dan/nsmarks-fletcher-20260725/qa/sheet-24-modern-v1/lattice-auto.json
'
```

Expected: the raw output remains evidence even if it repeats the existing
no-reviewable-sequence failure. Do not tune global lattice constants.

- [ ] **Step 4: Fetch and hash official modern source metadata**

Run inside `nsmarks-gis`:

```bash
set -euo pipefail
reference=/var/home/dan/nsmarks-fletcher-20260725/reference/sheet-24-modern-v1
mkdir -p "$reference"
curl --fail --location --retry 5 --retry-delay 2 \
  'https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Roads_UT83/MapServer?f=pjson' \
  --output "$reference/nstdb-transportation-mapserver.json"
curl --fail --location --retry 5 --retry-delay 2 \
  'https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer?f=pjson' \
  --output "$reference/nstdb-water-mapserver.json"
curl --fail --location --retry 5 --retry-delay 2 \
  'https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer/0?f=pjson' \
  --output "$reference/nsprd-layer.json"
sha256sum "$reference"/*.json \
  > "$reference/source-metadata-sha256.txt"
```

Confirm transportation service WKID 2038/latest 2961 and layers 5 Bridges,
6 Railways, 7 Highways, 8 Roads; confirm water service WKID 102100/latest 3857
and relevant layers 1 Hydrography Points, 4 Wet Features lines, and 8 Wet
Features polygons. Record the live values rather than substituting assumptions.

- [ ] **Step 5: Mark historical candidates before consulting residuals**

Inspect the full-resolution scan in QGIS/OpenCV at native pixels. First record
historical-only candidate pixels and topology descriptions under the QA root.
Distinguish roads and rails from folds, linen seams, neatlines, geological
hatching, county/survey/property lines, rivers, shorelines, text strokes, and
decorative rules. No transform exists at this stage.

Use Sheet 24 labels only to orient the modern-source search. A label or town
centre cannot become a control/check coordinate.

- [ ] **Step 6: Match official transport controls and natural checks**

Load the Province services in QGIS. Snap transport coordinates only to a
specific road-road, road-rail, or rail-rail node whose one-to-one historical
identity is supported by Sheet 24's own line topology. Record every involved
layer and OBJECTID.

Freeze at least ten controls satisfying all quadrant/span/complex rules.
Independently freeze at least six natural checks in three areas and two feature
classes. Choose natural points by topology before fitting: confluence, outlet,
fixed shoelace centroid, named/distinctive headland, or distinctive coastline
junction. Do not use a nearest-point shoreline fit.

Use NSPRD only to corroborate a corridor. Store raw NSPRD and optional aerial
evidence under the reference root; do not commit raw geometry.

- [ ] **Step 7: Save exact accepted-object extracts and hashes**

For every unique service/layer/object-ID group used by an accepted point, issue
an ArcGIS `query` with:

```text
where = "OBJECTID IN (" + ",".join(str(value) for value in object_ids) + ")"
outFields=*
returnGeometry=true
outSR=4326
f=geojson
```

Save the response beneath the reference root, retain the request URL without
credentials, and record the response SHA-256. A missing/error response is
`modern-source-error`; an empty response does not prove historical absence.

- [ ] **Step 8: Write and validate the reviewed observation**

Create `tools/fletcher/physical_observations/sheet-24.json` with every accepted
point, rejection, QA note, exact service receipt, retrieval timestamp,
spatial-reference conversion, extract path/hash, identity rationale, and
uncertainty. If fewer than ten defensible controls or six defensible checks
survive, set observation status `rejected`, record `insufficient-identity` or
`insufficient-distribution`, and stop without fitting.

If the source or modern service failed earlier, create the same evidence file
with status `rejected`, the exact `source-drift` or `modern-source-error`
receipt, and no invented points. This is the reproducible FAIL evidence.

For `status: "frozen"`, run:

```bash
python3 -m tools.fletcher.emit_physical_gcps \
  tools/fletcher/physical_observations/sheet-24.json \
  --controls tools/fletcher/physical_gcps/sheet-24-controls.csv \
  --checks tools/fletcher/physical_gcps/sheet-24-checks.csv

python3 -m tools.fletcher.emit_physical_gcps \
  tools/fletcher/physical_observations/sheet-24.json \
  --controls tools/fletcher/physical_gcps/sheet-24-controls.csv \
  --checks tools/fletcher/physical_gcps/sheet-24-checks.csv \
  --check
```

Expected: both files match; controls contain only `control`, checks only
`check`.

For `status: "rejected"`, do not create either CSV; instead run:

```bash
python3 -m tools.fletcher.physical_observation validate \
  tools/fletcher/physical_observations/sheet-24.json \
  --require-rejected
```

Expected: exit 0 and print the exact terminal state/reason.

- [ ] **Step 9: Add the CI byte check**

Append to `.github/workflows/ci.yml` after the existing Fletcher observation
loop. The branch checks a frozen observation byte-for-byte and validates a
pre-fit rejection without requiring nonexistent CSVs:

```yaml
      - name: Fletcher physical controls and checks match the reviewed observation
        run: |
          if test -f tools/fletcher/physical_gcps/sheet-24-controls.csv; then
            python3 -m tools.fletcher.emit_physical_gcps \
              tools/fletcher/physical_observations/sheet-24.json \
              --controls tools/fletcher/physical_gcps/sheet-24-controls.csv \
              --checks tools/fletcher/physical_gcps/sheet-24-checks.csv \
              --check
          else
            python3 -m tools.fletcher.physical_observation validate \
              tools/fletcher/physical_observations/sheet-24.json \
              --require-rejected
          fi
```

- [ ] **Step 10: Freeze before residuals**

Run:

```bash
python3 -m unittest discover -s tools/fletcher/tests -t .
git diff --check
git add .github/workflows/ci.yml \
  tools/fletcher/physical_observations/sheet-24.json
if test -f tools/fletcher/physical_gcps/sheet-24-controls.csv; then
  git add tools/fletcher/physical_gcps/sheet-24-controls.csv \
    tools/fletcher/physical_gcps/sheet-24-checks.csv
fi
git commit -m "data(fletcher): freeze Sheet 24 physical observations"
git show HEAD:tools/fletcher/physical_observations/sheet-24.json | sha256sum
git push origin feature/fletcher-sheet-24-modern-design
```

Record this committed observation SHA in the compute log and wait for PR #163
CI on the exact observation commit. Do not run `physical_georeference select`
before the commit exists and its generated-file gate passes.

---

### Task 9: Execute Sheet 24 selection, final checks, QA, tiling, and result recording

**Files:**
- Create if numerical gates reach visual QA:
  `tools/fletcher/physical_reviews/sheet-24-modern-v1.json`
- Create: `tools/fletcher/physical_results/sheet-24-modern-v1.json`
- Modify: `reports/fletcher/INVENTORY.md`
- Modify: `reports/fletcher/RESULTS.md` (generated)

**Interfaces:**
- Consumes the immutable observation and CSVs from Task 8.
- Produces exactly one Sheet 24 `modern_feature_v1` terminal result.

- [ ] **Step 1: Run control-only selection**

If observation status is `rejected`, create the terminal result without
fitting:

```bash
python3 -m tools.fletcher.physical_georeference prefit-failure \
  --observation tools/fletcher/physical_observations/sheet-24.json \
  --output /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/result.json
```

Then skip directly to Step 7. For a frozen observation, run on Bazzite inside
`nsmarks-gis`:

```bash
set -euo pipefail
cd /var/home/dan/nsmarks-fletcher-20260725/repo-sheet-24-modern-v1
python3 -m tools.fletcher.physical_georeference select \
  --source /var/home/dan/nsmarks-fletcher-20260725/work/sheet-24/sheet-24.tif \
  --controls tools/fletcher/physical_gcps/sheet-24-controls.csv \
  --observation tools/fletcher/physical_observations/sheet-24.json \
  --output /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1
```

Confirm the command has no checks argument. Inspect `selection.json` only after
the run finishes. If the terminal state is candidate, transport, or structural
failure, do not run natural scoring; proceed directly to finalization and the
FAIL result receipt.

- [ ] **Step 2: Score the final natural checks once**

Only when selection reports transport and structural PASS:

```bash
python3 -m tools.fletcher.physical_georeference score \
  --selection /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/selection.json \
  --checks tools/fletcher/physical_gcps/sheet-24-checks.csv \
  --output /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/natural-checks.json
```

Do not alter or rerun the observation in response to these residuals. A natural
gate miss is `natural-check-fail`.

- [ ] **Step 3: Render the required QA package**

For a candidate numerical PASS:

```bash
python3 -m tools.fletcher.physical_qa render \
  --source /var/home/dan/nsmarks-fletcher-20260725/work/sheet-24/sheet-24.tif \
  --observation tools/fletcher/physical_observations/sheet-24.json \
  --selection /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/selection.json \
  --natural-checks /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/natural-checks.json \
  --reference /var/home/dan/nsmarks-fletcher-20260725/reference/sheet-24-modern-v1 \
  --output /var/home/dan/nsmarks-fletcher-20260725/qa/sheet-24-modern-v1
```

Expected: required inventory, crops, vectors, preview, overlays, alpha
diagnostic, and QA-only z8/z12/z16 sample tiles exist and hash correctly.

- [ ] **Step 4: Conduct and record visual QA**

Inspect the full artifact package at useful zoom. Record every required visual
check and exact artifact hash in
`tools/fletcher/physical_reviews/sheet-24-modern-v1.json`. Reject folding,
mirroring, duplicated/disconnected geography, unreasonable stretch,
transparent slivers, border leakage, wrong signs, mismatched transport
identity, systematic natural mismatch, or an obviously bad applicable seam.

An accepted neighbouring sheet may be used only now, as a visual-only seam
check. It cannot change Sheet 24 controls, checks, transform, or score.

- [ ] **Step 5: Finalize the disposition**

Run:

```bash
python3 -m tools.fletcher.physical_georeference finalize \
  --selection /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/selection.json \
  --natural-checks /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/natural-checks.json \
  --visual-review tools/fletcher/physical_reviews/sheet-24-modern-v1.json \
  --output /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/result.json
```

For a selection/structural/transport failure, omit both `--natural-checks` and
`--visual-review`:

```bash
python3 -m tools.fletcher.physical_georeference finalize \
  --selection /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/selection.json \
  --output /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/result.json
```

For a natural-check failure, supply `--natural-checks` and omit
`--visual-review`. The finalizer must preserve the earlier exact state and mark
downstream stages `not-run` rather than inventing missing metrics or review.

- [ ] **Step 6: Tile only a final PASS**

If and only if `result.json` says PASS:

```bash
python3 -m tools.fletcher.physical_georeference tile \
  --result /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/result.json \
  --raster /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/selected-3857.tif \
  --tiles /var/home/dan/nsmarks-fletcher-20260725/tiles/sheet-24-modern-v1 \
  --zoom-min 8 \
  --zoom-max 16
```

Inspect representative deliverable tiles again and confirm the reported PNG
count equals:

```bash
find /var/home/dan/nsmarks-fletcher-20260725/tiles/sheet-24-modern-v1 \
  -type f -name '*.png' -print | wc -l
```

If final FAIL, confirm the deliverable tile directory was not created.

- [ ] **Step 7: Atomically record Sheet 24 only**

Run:

```bash
python3 -m tools.fletcher.physical_georeference record \
  --manifest /var/home/dan/nsmarks-fletcher-20260725/manifest.json \
  --sheet 24 \
  --result /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/result.json \
  --committed-result tools/fletcher/physical_results/sheet-24-modern-v1.json
```

Diff a before/after manifest copy and confirm only
`sheets["24"]["modern_feature_v1"]` changed. Sheet 24's graticule failure and
all other sheet objects must compare equal.

- [ ] **Step 8: Update inventory and generate the report**

Add Sheet 24's verified source SHA, method version, observation/result paths,
modern-source dates/hashes, and exact terminal disposition to
`reports/fletcher/INVENTORY.md`. Retain the permission receipt and every
excluded-use boundary unchanged.

Generate:

```bash
python3 -m tools.fletcher.report \
  /var/home/dan/nsmarks-fletcher-20260725/manifest.json \
  --out reports/fletcher/RESULTS.md
```

Confirm the graticule table still says Sheet 24 FAIL and the separate modern
table carries the new result.

- [ ] **Step 9: Commit the reproducible result**

Run:

```bash
git add tools/fletcher/physical_results/sheet-24-modern-v1.json \
  reports/fletcher/INVENTORY.md \
  reports/fletcher/RESULTS.md
if test -f tools/fletcher/physical_reviews/sheet-24-modern-v1.json; then
  git add tools/fletcher/physical_reviews/sheet-24-modern-v1.json
fi
git commit -m "data(fletcher): record Sheet 24 modern-feature result"
```

Do not add scans, extracts, VRTs, GeoTIFFs, QA images, or tiles.

---

### Task 10: Full verification, publication for review, and hard stop

**Files:**
- Verify all files changed by Tasks 1–9.
- Do not modify web/native product source or deployment configuration.

**Interfaces:**
- Produces a ready-for-review PR targeting `nightly` at one exact tested head.

- [ ] **Step 1: Run complete Python and generated-artifact checks**

```bash
python3 -m unittest discover -s tools/fletcher/tests -t .
python3 -m unittest discover -s tools/church/tests -t .
python3 -m unittest discover -s .github/scripts/tests -v

for observation in tools/fletcher/observations/sheet-*.json; do
  sheet="$(basename "$observation" .json)"
  python3 -m tools.fletcher.emit_gcps "$observation" \
    --out "tools/fletcher/gcps/$sheet.csv" \
    --check
done

if test -f tools/fletcher/physical_gcps/sheet-24-controls.csv; then
  python3 -m tools.fletcher.emit_physical_gcps \
    tools/fletcher/physical_observations/sheet-24.json \
    --controls tools/fletcher/physical_gcps/sheet-24-controls.csv \
    --checks tools/fletcher/physical_gcps/sheet-24-checks.csv \
    --check
else
  python3 -m tools.fletcher.physical_observation validate \
    tools/fletcher/physical_observations/sheet-24.json \
    --require-rejected
fi

git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Run web checks required by the workflow edit**

Because `.github/workflows/ci.yml` classifies as shared CI, run:

```bash
cd web
npm ci
npm test
npm run lint
npm run build
cd ..
```

Expected: PASS. Do not run local Xcode because no Swift/Xcode file changed;
hosted CI will exercise its configured native gate for the shared-workflow
change.

- [ ] **Step 3: Verify scope and artifact hygiene**

```bash
git diff --name-only origin/nightly...HEAD
git status --short --branch
git ls-files | rg \
  '(^|/)(sheet-24.*\\.(tif|vrt|png|jpg|gpkg|geojson)$|Tiles/Fletcher/)'
```

Expected: only the two generated CSVs may match the sheet-24 pattern; no large
or restricted artifact is tracked. Confirm no Sheet 1–23 observation, GCP,
result, manifest result, or report row changed except shared generated prose
that counts the new Sheet 24 modern pilot.

- [ ] **Step 4: Rebase and push safely**

```bash
git fetch origin
git rebase origin/nightly
python3 -m unittest discover -s tools/fletcher/tests -t .
git diff --check
git push --force-with-lease origin feature/fletcher-sheet-24-modern-design
```

Expected: clean rebase and push. Resolve no conflict by overwriting unrelated
work; stop and report if preservation is uncertain.

- [ ] **Step 5: Update the ready PR and wait for current-head CI**

Update PR #163 title/body to describe the implemented Sheet 24 result, exact
source SHA, disposition, selected method/metrics or exact failure, control/check
counts, structural/visual QA, artifact paths, tile count if PASS, rights
boundary, and explicit non-deployment scope. Keep base `nightly`.

Wait for all checks on the exact current head. Inspect concrete job logs for
any failure, fix only in-scope defects, rerun local affected checks, commit,
rebase, push with lease, and wait again.

- [ ] **Step 6: Final state receipt and stop**

Record:

- branch and exact commit;
- PR URL and `nightly` target;
- current-head CI state;
- source SHA-256;
- PASS or FAIL;
- selected method and transport/natural metrics, or exact terminal reason;
- control/check counts;
- structural and visual findings;
- tile count if PASS;
- compute artifact paths;
- documentation/rights changes;
- confirmation that no other sheet, product layer, host, or deployment changed.

Stop. Do not begin Sheet 1 or any other failed Fletcher sheet.
