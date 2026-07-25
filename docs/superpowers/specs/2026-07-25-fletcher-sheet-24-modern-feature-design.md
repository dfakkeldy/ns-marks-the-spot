# Fletcher Sheet 24 Modern-Feature Georeferencing Design

**Date:** 2026-07-25  
**Status:** Approved in conversation; awaiting review of this written specification  
**Scope:** One-sheet pilot on Hugh Fletcher Sheet 24

## Purpose

Test whether a Fletcher sheet that cannot support the existing engraved-grid
workflow can earn a separately defined, reproducible modern-feature alignment
PASS. Sheet 24 is the only sheet in this pilot.

The intended product outcome is incremental: if Sheet 24 passes, it becomes
eligible to join the accepted direct-Rumsey replacement set. Later failed sheets
may be attempted one at a time under the same versioned method. A better future
observation may supersede an earlier modern-feature result without erasing its
receipt.

## Source receipt

- Rumsey ID: `RUMSEY~8~1~2649~290017`
- List number: `3997.026`
- Title: *Province of Nova Scotia (Island of Cape Breton). Sheet no. 24.*
- Published: 1884
- Dimensions: 10,782 × 7,655 pixels
- SHA-256:
  `735daf2fb3b8afd12bef672ffaad9425c05ec1873a75afdb708ff048cb8dfee8`
- Composite: no

The cached direct Rumsey scan must match this identity, dimensions, and SHA-256
before work begins. A mismatch is source drift and stops the pilot.

The existing graticule result remains:

```text
FAIL: automatic graticule detection found no reviewable regular sequence
```

The modern-feature workflow does not overwrite, reinterpret, or remove that
result.

## Rights and provenance boundary

The pilot uses the direct Rumsey scan under Cartography Associates' written
2026-07-25 permission for the georeferencing use described for the free Nova
Scotia web map. It retains:

- “David Rumsey Map Collection, David Rumsey Map Center, Stanford University
  Libraries”;
- the linked CC BY-NC-SA 3.0 terms;
- non-commercial use;
- attribution and identification of georeferencing and other changes;
- ShareAlike treatment where applicable.

The repository MIT licence covers software, not imagery.

The pilot must not use OldMapsOnline endpoints, keys, control points, warps,
tiles, metadata, inferred bounds, or the legacy Fletcher pyramid. It must not
use either composite or coordinates inferred from another Fletcher sheet.

Modern Province service evidence keeps its own licence and attribution. Raw
NSPRD geometry remains local and is not committed.

## Goals

1. Produce a defensible modern-feature alignment for Sheet 24 from frozen,
   discrete feature identities.
2. Keep transform controls and final accuracy checks independent by feature
   family.
3. Select the transform without opening the final natural-feature check
   coordinates.
4. Record exact source, observation, candidate, accuracy, structural, visual,
   and artifact evidence.
5. Produce XYZ PNG tiles at zooms 8–16 only after a final PASS.
6. Make a passing sheet eligible for later partial-coverage Fletcher layer
   publication.

## Non-goals

- Processing any sheet other than Sheet 24.
- Repairing or rescoring the existing engraved-grid sheets.
- Treating NSPRD as a survey, title record, road authority, or legal-access
  source.
- Proving that a historical road, railway, river, lake, or coastline has never
  changed.
- Publishing, hosting, enabling, deploying, or bundling a Fletcher layer in
  this pilot.
- Filling unavailable-sheet gaps with the OldMapsOnline pyramid.
- Establishing historical-survey accuracy or present-day parcel, road,
  shoreline, title, access, flood, value, permission, or service facts.

## Result model

Sheet 24 retains independent dispositions:

```text
graticule: FAIL
modern_feature_v1: PASS | FAIL
```

`modern_feature_v1: PASS` means that a transform fitted to frozen transport
features also meets the fixed accuracy gate on untouched natural features and
passes structural and visual QA. It is a product-oriented alignment result, not
a claim that the historical map or modern sources are perfect.

The result stores its method version, observation version, source dates, exact
metrics, and supersession relationship. A later result is a new version; it
does not silently edit the v1 evidence.

## Authoritative modern sources

### Transportation controls

Use the Province's existing NSTDB Transportation 1:10,000 service:

```text
https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Roads_UT83/MapServer
```

Relevant source classes include:

- railway layer 6;
- highway/road layers 7 and 8;
- bridge layer 5 when it helps prove identity.

The implementation must read and retain the live service/layer spatial
reference and metadata rather than assuming that coordinates are WGS84.
Committed observations store normalized WGS84 longitude/latitude plus the
source spatial reference and conversion receipt.

### Natural-feature final checks

Use the Province's NSTDB Water 1:10,000 service:

```text
https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer
```

Eligible discrete checks include:

- unambiguous river confluences;
- unambiguous lake outlets;
- island centroids derived by a fixed polygon-centroid rule;
- named or topologically distinctive headlands;
- distinctive coastline junctions that are not chosen by nearest-point
  residual.

Continuous shoreline fitting is excluded. A coastline check must identify one
specific historical and modern point by topology before the transform is run.

### Corroborating sources

NSPRD may corroborate narrow road or railway corridors and abandoned alignments:

```text
https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer/0
```

NSPRD geometry is not a control coordinate and is not legal evidence of a road,
railway, right-of-way, access, title, or surveyed boundary. Raw geometry remains
in the compute root.

NS Aerial may visually corroborate present physical layout. It is never a
coordinate source.

## Feature-family separation

Controls are limited to transport nodes:

- road-road intersections;
- road-rail crossings;
- rail-rail junctions if an independently identifiable example exists.

Final checks are limited to natural-feature points. No exact feature, derived
point, or coordinate may appear in both sets.

Linear road, rail, property, river, or coastline traces may support identity,
but the scored correspondence is always a discrete point.

This separation answers a specific question: does a warp fitted from historical
transport topology independently align modern natural geography?

## Observation schema

The reviewed source is:

```text
tools/fletcher/physical_observations/sheet-24.json
```

It contains:

- `schema_version`;
- `method_version: "modern-feature-v1"`;
- Sheet 24 source identity and checksum;
- observation version and frozen timestamp;
- controls;
- final checks;
- rejected candidates;
- reviewer QA notes;
- modern source receipts.

Every accepted point records:

- stable point ID;
- role and feature type;
- historical pixel x/y;
- modern longitude/latitude;
- historical label or topology description;
- modern source URL, layer ID, object identifier when available, source spatial
  reference, retrieval timestamp, and extract SHA-256;
- written one-to-one identity rationale;
- corroborating NSPRD/aerial evidence when used;
- uncertainty note;
- pre-fit acceptance decision.

Every rejected candidate records its historical pixel, proposed identity, and
one fixed reason such as ambiguous identity, apparent realignment, generalized
drawing, clipped feature, insufficient topology, source error, or duplicate.

The observation is frozen before any transform or residual is calculated.

## Selection workflow

1. Verify the direct Rumsey source receipt.
2. Inspect the full-resolution Sheet 24 scan.
3. Mark distributed historical transport candidates using the engraving alone.
4. Query current transportation evidence and corroborating sources.
5. Reject ambiguous candidates before fitting and record every rejection.
6. Freeze at least 10 accepted transport controls.
7. Independently identify and freeze at least 6 natural-feature checks.
8. Generate separate control and final-check CSVs from the reviewed JSON.
9. Compare transform candidates using transport-control leave-one-out
   cross-validation.
10. Freeze the winning transform family.
11. Refit that family using all transport controls.
12. Open the final-check coordinates and score the untouched natural features.
13. Run structural and visual QA.
14. Record PASS or FAIL.
15. Generate zoom 8–16 tiles only after final PASS.
16. Stop without opening another sheet.

No accepted point may be removed, moved, relabelled, or reclassified after any
residual is seen. A discovered observation defect makes v1 FAIL; correcting it
requires a newly versioned observation and new run.

## Spatial-distribution requirements

Transport controls must:

- number at least 10;
- include at least one accepted point in each quadrant of the usable mapped
  frame;
- span at least 70% of the usable mapped width and 70% of its height;
- avoid relying on multiple points from one small junction complex.

Natural checks must:

- number at least 6;
- occupy at least three separated areas of the sheet;
- include at least two natural-feature classes;
- include both interior and coastal evidence when the scan supports both;
- avoid duplicate points derived from one modern geometry.

Failure to meet distribution or count requirements is
`FAIL: insufficient independently distributed evidence`.

## Generated GCP artifacts

Generate, never hand-edit:

```text
tools/fletcher/physical_gcps/sheet-24-controls.csv
tools/fletcher/physical_gcps/sheet-24-checks.csv
```

Both reuse the existing GCP columns:

```text
pixel_x,pixel_y,lon,lat,role,label
```

The control CSV contains only `control`; the final-check CSV contains only
`check`. CI byte-checks both against the reviewed JSON.

The fitting command accepts the control CSV and cannot accept the check CSV.
The final scoring command accepts the already selected/refitted transform plus
the check CSV. This interface keeps final checks out of fitting by construction.

## Transform selection

Compare the existing fixed families:

- affine;
- second-order polynomial;
- thin-plate spline.

For each family and each transport control:

1. fit using the other `N-1` controls;
2. transform the withheld historical pixel;
3. measure its distance from the frozen modern coordinate.

Summarize all leave-one-out residuals as RMS, P95, and maximum.

Candidate order is lexicographic:

1. lowest leave-one-out RMS;
2. lowest P95;
3. lowest maximum;
4. lower complexity: affine, then polynomial2, then TPS.

Candidate failures remain explicit. The lowest-ranked structurally valid
candidate is selected. If none is structurally valid, the sheet fails before
final checks are opened.

After selection, refit the winning family using all frozen transport controls.

## Structural warp gate

Sample a 21 × 21 mesh inside the usable mapped frame and within the control
convex hull. Use finite differences to estimate each local transform Jacobian.

Reject a candidate if:

- any determinant is non-positive;
- any Jacobian component is non-finite;
- local singular-value anisotropy exceeds 4:1;
- local area scale is below 0.25× or above 4× the sampled median;
- the warp produces duplicated or disconnected mapped coverage.

These checks occur before final natural-feature coordinates are opened.

## Numerical acceptance gate

Both independent measurements must pass the existing fixed limits.

### Transport leave-one-out

- controls: at least 10;
- RMS ≤ 400 m;
- P95 ≤ 900 m;
- maximum ≤ 1,500 m.

### Untouched natural-feature checks

- checks: at least 6;
- RMS ≤ 400 m;
- P95 ≤ 900 m;
- maximum ≤ 1,500 m.

The natural-feature metrics are the primary published accuracy figures.
Transport leave-one-out metrics remain visible as transform-selection evidence.

Do not weaken thresholds, remove an inconvenient check, or substitute a
control residual for final accuracy.

## Visual QA

A candidate numerical PASS must produce and pass review of:

- a full-resolution candidate/identity contact sheet;
- transport-control crops;
- natural-check crops;
- a transport leave-one-out residual-vector plot;
- a final natural-check residual-vector plot;
- a downsampled warped preview;
- modern transportation overlay;
- modern hydrography overlay;
- NSPRD corroboration overlay where used;
- aerial corroboration overlay where useful;
- alpha/cutline coverage;
- representative XYZ tiles at zooms 8, 12, and 16;
- an adjacent accepted-sheet seam view only when a real shared boundary exists,
  and only as post-PASS visual evidence.

Reject:

- folding, mirroring, duplicated geography, disconnected coverage, or
  unreasonable stretch;
- transparent slivers or alpha holes;
- border leakage;
- wrong coordinate signs;
- obvious road/rail identity mismatch;
- systematic natural-feature mismatch;
- a seam that is obviously wrong when a shared boundary exists.

Full scan margins may remain visible only when explicitly recorded as an
intentional cutline decision.

## Repository architecture

Add narrowly scoped modules:

```text
tools/fletcher/physical_observation.py
tools/fletcher/emit_physical_gcps.py
tools/fletcher/physical_georeference.py
tools/fletcher/physical_qa.py
```

`physical_observation.py` owns schema and evidence validation.

`emit_physical_gcps.py` owns deterministic CSV generation and `--check`.

`physical_georeference.py` reuses the existing GDAL command builders but owns
leave-one-out selection, refitting, final-check isolation, and the modern
accuracy result.

`physical_qa.py` owns structural-mesh calculations and the required QA artifact
inventory.

Do not add a third serialized role to the shared Church/Fletcher GCP parser.
Leave-one-out points are temporarily withheld in memory; the versioned control
file remains `control`-only, and the final file remains `check`-only.

## Compute artifacts

Keep large and restricted artifacts outside Git:

```text
/var/home/dan/nsmarks-fletcher-20260725/reference/sheet-24-modern-v1/
/var/home/dan/nsmarks-fletcher-20260725/georef/sheet-24-modern-v1/
/var/home/dan/nsmarks-fletcher-20260725/qa/sheet-24-modern-v1/
/var/home/dan/nsmarks-fletcher-20260725/tiles/sheet-24-modern-v1/
/var/home/dan/nsmarks-fletcher-20260725/logs/
```

Commit only small reproducible observations, generated CSVs, source/query
checksums, tests, code, documentation, and result ledgers.

## Manifest and report

Update only Sheet 24, atomically, with a nested `modern_feature_v1` object:

```text
source receipt
observation and generated-GCP paths
modern source receipts
accepted and rejected feature counts
candidate failures
candidate leave-one-out metrics
selected method
transport control count and metrics
natural check count and metrics
structural gate details
visual-QA result
raster, QA, and tile paths
PNG tile count
PASS or FAIL and exact reason
```

The existing graticule fields remain byte-for-byte semantically unchanged.
Every other sheet remains unchanged.

`reports/fletcher/RESULTS.md` gains a separate “Modern-feature pilots” section.
Do not replace or merge the graticule table's result meanings.

## Failure states

Preserve distinct terminal states:

- `source-drift`;
- `modern-source-error`;
- `insufficient-identity`;
- `insufficient-distribution`;
- `candidate-failure`;
- `transport-cross-validation-fail`;
- `structural-fail`;
- `natural-check-fail`;
- `visual-qa-fail`;
- `PASS`.

An empty modern-source response is not proof that a historical feature did not
exist. An ambiguous identity is not a negative match.

## Test-first requirements

Write failing tests before implementing schema, emitter, fitting, manifest, or
report behavior.

Tests must prove:

- source identity and checksum validation;
- accepted feature types are role-specific;
- duplicate point IDs, historical pixels, or modern coordinates are rejected;
- counts and spatial distribution are enforced;
- rejected candidates require explicit reasons;
- transport and natural features cannot cross role boundaries;
- generated CSVs are deterministic and byte-checkable;
- final-check CSV rows are `check`-only;
- each leave-one-out point is absent from its temporary GDAL fit;
- final checks cannot enter candidate selection or fitting;
- candidate failures and deterministic tie-breaking are preserved;
- Jacobian, anisotropy, area-scale, and coverage gates reject unsafe warps;
- both numerical gates are required;
- tiling refuses anything except final PASS;
- nested manifest updates affect Sheet 24 only;
- report regeneration retains separate graticule and modern-feature meanings.

Run at minimum:

```bash
python3 -m unittest discover -s tools/fletcher/tests -t .

for observation in tools/fletcher/observations/sheet-*.json; do
  sheet="$(basename "$observation" .json)"
  python3 -m tools.fletcher.emit_gcps "$observation" \
    --out "tools/fletcher/gcps/$sheet.csv" \
    --check
done

python3 -m tools.fletcher.emit_physical_gcps \
  tools/fletcher/physical_observations/sheet-24.json \
  --controls tools/fletcher/physical_gcps/sheet-24-controls.csv \
  --checks tools/fletcher/physical_gcps/sheet-24-checks.csv \
  --check

git diff --check
```

Run CI-required shared and web checks in proportion to the changed paths. Do not
run a local Xcode build unless Swift or Xcode project files are touched.

## Incremental publication path

A later publication task may build a partial Fletcher replacement layer from
accepted direct-Rumsey sheets:

- the 11 existing engraved-grid PASS sheets;
- Sheet 24 if this pilot passes;
- transparent gaps for unavailable sheets.

Each sheet remains independently versioned with source checksum, alignment
method, metrics, attribution, and tile path. An improved Sheet 24 may replace
only its own version.

The eventual product manifest distinguishes `engraved-grid` from
`modern-feature-v1` and exposes exact accuracy and source dates. The layer must
not fall back to OldMapsOnline-derived imagery beneath gaps.

User-facing disclosure must say that alignment is approximate and that the
historical map is not a survey, navigation source, parcel authority, or
representation of current roads and shorelines.

Hosting, catalog integration, browser/device acceptance, and deployment are a
separate implementation and release plan after a passing pilot.

## Reuse for later failed sheets

If Sheet 24 demonstrates that the method works, each remaining failed sheet may
receive its own explicitly scoped modern-feature attempt. Every sheet must
independently satisfy:

- source verification;
- feature identity and distribution;
- frozen observation;
- transport leave-one-out selection;
- untouched natural checks;
- structural and visual QA;
- a separate manifest disposition.

Sheet 24's coordinates, transform, residuals, or inferred bounds may not seed a
later sheet. The method is reusable; its measured evidence is not transferable.

## Pilot stop condition

The implementation task stops after Sheet 24 is recorded as modern-feature PASS
or FAIL and its reproducible work is published for review.

It does not begin Sheet 1 or any other failed sheet, configure hosting, change a
production source URL, enable a product layer, bundle native tiles, or deploy.
