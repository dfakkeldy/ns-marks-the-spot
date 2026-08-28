# Hugh Fletcher direct-Rumsey georeferencing

This runbook keeps two independently reported result families.

- **Engraved-grid** uses the map's own labelled graticule and retains the
  existing graticule table and its meanings.
- **`modern-feature-v1`** is a separately versioned Sheet 24 pilot for a sheet
  whose engraved grid cannot support the first workflow.

Sheet 24's engraved-grid receipt remains unchanged:

```text
FAIL: automatic graticule detection found no reviewable regular sequence
```

The modern-feature workflow neither overwrites nor reinterprets that failure.
A modern PASS is a distinct alignment result, not an automatic-graticule PASS.

## Evidence and rights boundary

Use only individual high-resolution scans served by the David Rumsey Map
Collection. Record the Rumsey identifier, list number, title, publication year,
expected dimensions, source path, and SHA-256 in the compute manifest. Verify
the cached source against the receipt before processing; a mismatch is
`source-drift` and stops the run rather than silently changing the baseline.

On 2026-07-25, Cartography Associates replied to the request titled
“Permission to georeference Hugh Fletcher maps for a free Nova Scotia web map”:

> Hello, your use is permitted without charge. See link below for details on
> use and how to download images.

The reply linked the David Rumsey Map Collection
[Copyright and Permissions](https://www.davidrumsey.com/about/copyright-and-permissions)
page. This is written permission for the direct-Rumsey georeferencing use
described for the free Nova Scotia web map. The use retains:

- “David Rumsey Map Collection, David Rumsey Map Center, Stanford University
  Libraries”;
- linked [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/)
  terms;
- non-commercial use, attribution, identification of this project's
  georeferencing and other changes, and ShareAlike treatment where applicable.

The repository MIT licence covers software, not map imagery. This permission
does not clear OldMapsOnline-derived tiles, warps, control points, endpoints,
keys, metadata, inferred bounds, or the legacy Fletcher pyramid; unrelated paid
uses; standalone facsimile sales; materially different future distribution; or
native offline bundling unless separately supported by the original request and
written response. Never use OldMapsOnline to fill a direct-Rumsey gap.

## Immutable compute boundary

Large inputs and generated artifacts live outside Git at
`/var/home/dan/nsmarks-fletcher-20260725`. On Bazzite, run GDAL, OpenCV, and
other GIS tools only inside the existing `nsmarks-gis` distrobox. The Bazzite
host is immutable: do not layer GIS packages onto it with `rpm-ostree`.

The root contains the atomic `manifest.json` ledger, direct scans in `work/`,
transforms/rasters in `georef/`, review evidence in `qa/`, tiles in `tiles/`,
and logs in `logs/`. Commit only small observations, generated GCP CSVs,
checksums, tooling, tests, reports, and result ledgers. Do not commit scans,
GeoTIFFs, QA images, tiles, raw NSPRD geometry, or other restricted artifacts.

## Engraved-grid workflow

Run the existing detector and retain its output or failure log:

```bash
python3 -m tools.fletcher.detect_lattice <direct-rumsey-source> \
  --out /var/home/dan/nsmarks-fletcher-20260725/qa/sheet-XX/lattice-auto.json
```

Candidates are evidence to review, not coordinates to accept blindly. Use
independently readable engraved labels and intersections; reject folds, seams,
neatlines, borders, hatching, boundaries, text strokes, and decorative rules
when they are not labelled graticule rules. Keep slanted, curved, or damaged
rules as individually measured intersections rather than flattening them into a
fixed-axis model.

Freeze disjoint controls and checks before residuals are viewed. The existing
graticule gate requires at least six controls, two checks, RMS <= 400 m,
P95 <= 900 m, and maximum <= 1,500 m. It compares affine, polynomial2, and TPS
using the same held-out set that it reports for the selected transform. This is
a retained methodological limitation: that metric is not a second untouched
model-selection estimate.

## Sheet 24 modern-feature-v1

This pilot is only direct Rumsey Sheet 24 (`RUMSEY~8~1~2649~290017`, list
`3997.026`, 10,782 x 7,655 pixels, SHA-256
`735daf2fb3b8afd12bef672ffaad9425c05ec1873a75afdb708ff048cb8dfee8`). It
does not use a composite, old warp, or another sheet.

Transport controls are discrete road-road intersections, road-rail crossings,
or independently identifiable rail-rail junctions, sourced from the Province's
NSTDB Transportation 1:10,000 service with its spatial-reference and retrieval
receipt. Natural final checks are discrete NSTDB Water 1:10,000 river
confluences, lake outlets, fixed-rule island centroids, distinctive headlands,
or topological coastline junctions; continuous shoreline fitting is excluded.

NSPRD may corroborate a narrow transport corridor or abandoned alignment but
never supplies a control coordinate or legal proof of a road, railway,
right-of-way, access, title, or surveyed boundary. NS Aerial may corroborate
present layout but is never a coordinate source. Neither proves historical
permanence or a legal/service conclusion.

No exact feature, derived point, or coordinate may occur in both families.
Linear transport, property, river, or coastline traces may support identity,
but every scored correspondence is a discrete point.

### Frozen files and commands

The reviewed input is `tools/fletcher/physical_observations/sheet-24.json`.
It freezes source receipt, accepted and rejected identities, historical pixels,
modern-source receipts, rationale, uncertainty, and pre-fit acceptance.
Freeze this observation before any transform or residual is calculated.
Rejections record a fixed reason, including ambiguous identity, apparent
realignment, generalized drawing, clipped feature, insufficient topology,
source error, or duplicate.

Generate, never hand-edit, separate role-pure files:

```text
tools/fletcher/physical_gcps/sheet-24-controls.csv
tools/fletcher/physical_gcps/sheet-24-checks.csv
```

The first has only `control` rows; the second has only `check` rows. This is a
file-and-command boundary, not a reviewer convention: selection takes only the
controls file, while scoring takes a completed selection and only the checks
file.

```bash
compute=/var/home/dan/nsmarks-fletcher-20260725
source="$compute/work/sheet-24/source.tif"
observation=tools/fletcher/physical_observations/sheet-24.json
controls=tools/fletcher/physical_gcps/sheet-24-controls.csv
checks=tools/fletcher/physical_gcps/sheet-24-checks.csv
run="$compute/georef/sheet-24-modern-v1"
qa="$compute/qa/sheet-24-modern-v1"
result="$run/result.json"

python3 -m tools.fletcher.physical_observation verify-source \
  --manifest "$compute/manifest.json" --sheet 24 --source "$source"
python3 -m tools.fletcher.emit_physical_gcps "$observation" \
  --controls "$controls" --checks "$checks"
# Byte-verify the generated files against the frozen observation.
python3 -m tools.fletcher.emit_physical_gcps "$observation" \
  --controls "$controls" --checks "$checks" --check
python3 -m tools.fletcher.physical_georeference select \
  --source "$source" --controls "$controls" --observation "$observation" --output "$run"
python3 -m tools.fletcher.physical_georeference score \
  --selection "$run/selection.json" --checks "$checks" --output "$run/natural-checks.json"
python3 -m tools.fletcher.physical_qa render \
  --source "$source" --observation "$observation" --selection "$run/selection.json" \
  --natural-checks "$run/natural-checks.json" \
  --reference "$compute/reference/sheet-24-modern-v1" --output "$qa"
python3 -m tools.fletcher.physical_georeference finalize \
  --selection "$run/selection.json" --natural-checks "$run/natural-checks.json" \
  --visual-review "$qa/visual-review.json" --output "$result"
python3 -m tools.fletcher.physical_georeference tile \
  --result "$result" --raster "$run/selected-3857.tif" \
  --tiles "$compute/tiles/sheet-24-modern-v1" --zoom-min 8 --zoom-max 16
python3 -m tools.fletcher.physical_georeference record \
  --manifest "$compute/manifest.json" --sheet 24 --result "$result" \
  --committed-result tools/fletcher/results/sheet-24-modern-feature-v1.json
```

`finalize` accepts no downstream evidence for an early terminal failure. Run
`tile` only after final PASS; it requires visual PASS and writes only zoom 8--16
PNGs. `record` atomically writes the terminal result under Sheet 24's
`modern_feature_v1` namespace. Regenerate the report after recording:

```bash
python3 -m tools.fletcher.report "$compute/manifest.json" --out reports/fletcher/RESULTS.md
```

### Gates and published accuracy

Before selection, freeze at least 10 transport controls: one in every
usable-frame quadrant, spanning at least 70% of usable width and height, and
not concentrated in one junction complex. Freeze at least six natural checks
in three separated areas, across two natural-feature classes, including
interior/coastal evidence when the scan supports both, without duplicate
derivation from one modern geometry.

Compare affine, polynomial2, and TPS by transport leave-one-out cross-validation
and rank by lowest RMS, P95, maximum, then lower complexity. Refit the winner
with all controls. Transport LOOCV selects the transform family and remains
visible selection evidence; untouched natural checks are the primary published
accuracy estimate. Both require their minimum counts, RMS <= 400 m,
P95 <= 900 m, and maximum <= 1,500 m. Never substitute a control residual for
a natural check.

Every candidate is structurally sampled on a 21 x 21 mesh inside the usable
frame/control hull. Reject a non-positive determinant, non-finite Jacobian,
anisotropy above 4:1, area scale below 0.25x or above 4x its sampled median, or
duplicated/disconnected coverage. Visual QA is hash-bound to source,
observation, selection, natural checks, and raster; it reviews contact sheets,
crops, residual vectors, preview, modern overlays, alpha/cutline, zoom 8/12/16
tiles, and a real shared-boundary seam where one exists. Reject folding,
mirroring, duplicated geography, unreasonable stretch, alpha holes, border
leakage, wrong signs, identity mismatch, systematic natural mismatch, or a
visibly wrong real seam.

Never remove, move, relabel, reclassify, or otherwise adjust an accepted point
after seeing residuals. A defect makes v1 FAIL. Correct it only with a newly
versioned observation and a complete rerun; never silently rewrite v1.

Terminal states remain explicit: `source-drift`, `modern-source-error`,
`insufficient-identity`, `insufficient-distribution`, `candidate-failure`,
`transport-cross-validation-fail`, `structural-fail`, `natural-check-fail`,
`visual-qa-fail`, or `PASS`. An empty modern source response is not proof that
a historical feature did not exist, and ambiguity is not a negative match.

## Result and publication boundary

The report keeps the engraved-grid table unchanged, then appends a separate
`Modern-feature pilots` table sourced only from `modern_feature_v1`. It reports
the selected method, transport selection evidence, natural published estimate,
structural/visual gates, tile count, disposition, and reason without merging
those facts into graticule semantics.

A passing registration does not establish current parcel, road, shoreline,
title, access, value, permission, flood, power, service, or historical-survey
accuracy. The pilot ends when Sheet 24 has a reproducible PASS or FAIL.
Partial publication, hosting, catalog/product integration, browser/device
acceptance, native bundling, and deployment are separate decisions requiring
their own evidence and release work. A later partial layer leaves transparent
gaps rather than falling back to OldMapsOnline.
