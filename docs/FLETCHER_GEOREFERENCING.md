# Hugh Fletcher direct-Rumsey georeferencing

This document describes the replacement workflow for Hugh Fletcher map sheets.
It uses the individual high-resolution scans served by the David Rumsey Map
Collection and evaluates each sheet independently. It does not use the legacy
OldMapsOnline-derived tile pyramid, OldMapsOnline control points or warps, or
either Fletcher composite as a georeferencing input.

## Evidence and rights boundary

For each sheet, record the individual Rumsey identifier, list number, title,
publication year, expected pixel dimensions, source path, and SHA-256 in the
compute manifest. Verify the cached file against those fields before processing
it. A mismatch is source drift and must stop the run; do not silently replace
the baseline.

On 2026-07-25, Cartography Associates replied to the request titled
“Permission to georeference Hugh Fletcher maps for a free Nova Scotia web map”:

> Hello, your use is permitted without charge. See link below for details on
> use and how to download images.

The reply linked the David Rumsey Map Collection
[Copyright and Permissions](https://www.davidrumsey.com/about/copyright-and-permissions)
page. This is written permission for the direct-Rumsey georeferencing use
described for the free Nova Scotia web map. The resulting use must retain:

- “David Rumsey Map Collection, David Rumsey Map Center, Stanford University
  Libraries”;
- the linked CC BY-NC-SA 3.0 terms;
- non-commercial use, attribution, identification of georeferencing and other
  changes, and ShareAlike treatment where applicable.

The repository MIT licence covers software, not the map imagery. The permission
does not clear OldMapsOnline-derived tiles, warps, or control points; unrelated
paid uses; standalone facsimile sales; materially different future
distribution; or native offline bundling unless that use is separately
supported by the original request and written response.

## Compute environment

Large source and generated artifacts live outside the repository:

```text
/var/home/dan/nsmarks-fletcher-20260725
```

On Bazzite, run GDAL, OpenCV, and other GIS tools inside the existing
`nsmarks-gis` distrobox. Do not layer GIS packages onto the immutable host with
`rpm-ostree`.

The compute root keeps:

- `manifest.json` as the atomic per-sheet run ledger;
- `work/` for direct Rumsey scans and prepared inputs;
- `georef/` for transforms, VRTs, and GeoTIFFs;
- `qa/` for contact sheets, label crops, previews, and diagnostics;
- `tiles/` for generated XYZ PNG tiles;
- `logs/` for command output.

These large artifacts are not committed. Small reviewed observations, generated
GCP CSVs, tests, report tooling, checksums, and reports are committed.

## 1. Verify or fetch one direct source

Compare the cached scan’s Rumsey identifier, dimensions, and SHA-256 with
`manifest.json`. Fetch only when the direct scan is genuinely absent:

```bash
python3 -m tools.fletcher.fetch \
  '<RUMSEY_ID>' \
  sheet-XX \
  --output /var/home/dan/nsmarks-fletcher-20260725/work
```

The downloader is courteous and resumable. Preserve its request delays, cache,
retry behavior, and recorded SHA-256. Do not fall back to OldMapsOnline,
neighbouring sheets, or the composites.

## 2. Retain automatic detection evidence

Run the existing detector first and keep its raw output or failure log:

```bash
python3 -m tools.fletcher.detect_lattice \
  <direct-rumsey-source> \
  --out /var/home/dan/nsmarks-fletcher-20260725/qa/sheet-XX/lattice-auto.json
```

Automatic candidates are evidence to review, not coordinates to accept
blindly. Inspect the full-resolution scan and distinguish engraved graticule
rules from folds, linen seams, neatlines, borders, lithological hatching,
survey or county boundaries, text strokes, and decorative rules.

If the sheet does not contain enough independently readable labelled
coordinates, record a precise failure and stop. Modern towns, guessed
shorelines, a neighbouring sheet, an old warp, and a composite are not
substitutes for the sheet’s own coordinate evidence.

## 3. Record a frozen reviewed observation

The observation must use coordinate values read from the sheet’s own engraved
labels and include:

- at least six control intersections;
- at least two held-out check intersections;
- control and check sets disjoint by construction;
- points distributed across the usable mapped area;
- check assignments and pixel measurements frozen before residuals are viewed;
- a QA note identifying accepted rules and rejected lookalikes.

For a truly axis-aligned grid, the format can store one pixel value per meridian
and parallel. When rules are slanted, curved, damaged, or otherwise unsuitable
for fixed axes, store individually measured intersection pixels. Do not flatten
such a sheet into the simplified model.

Reviewed observations live at:

```text
tools/fletcher/observations/sheet-XX.json
```

Generate the GCP CSV; do not hand-edit it:

```bash
python3 -m tools.fletcher.emit_gcps \
  tools/fletcher/observations/sheet-XX.json \
  --out tools/fletcher/gcps/sheet-XX.csv

python3 -m tools.fletcher.emit_gcps \
  tools/fletcher/observations/sheet-XX.json \
  --out tools/fletcher/gcps/sheet-XX.csv \
  --check
```

## 4. Compare transforms with the fixed held-out gate

Run the existing one-sheet georeference command. It compares affine,
second-order polynomial, and thin-plate-spline candidates without changing the
established thresholds:

```bash
python3 -m tools.fletcher.georeference \
  --source <direct-rumsey-source> \
  --points tools/fletcher/gcps/sheet-XX.csv \
  --output /var/home/dan/nsmarks-fletcher-20260725/georef/sheet-XX
```

Acceptance requires all of:

- RMS at most 400 metres;
- P95 at most 900 metres;
- maximum error at most 1,500 metres;
- at least six controls;
- at least two held-out checks.

Candidate failures remain in the manifest. Do not weaken a threshold, discard
an inconvenient check, or move a point after seeing its residual.

For series comparability, the current pipeline uses the same held-out set to
compare transform families and to report the selected transform. This means the
reported selected-model error is not an untouched final validation estimate.
Changing that methodology requires a separately scoped series-wide redesign;
do not silently rescore prior sheets during a one-sheet run.

## 5. Warp, inspect, and tile only a passing sheet

Only a numerical PASS can proceed to Web Mercator XYZ PNG tiles, and only at
zooms 8 through 16. Before accepting the sheet, inspect:

- the graticule contact sheet and full-resolution longitude/latitude label
  crops;
- a downsampled warped preview;
- alpha and cutline coverage;
- representative low-, middle-, and high-zoom tiles;
- a neighbouring boundary only when the sheets actually share one, and only
  as a post-PASS visual seam check.

Reject folding, mirroring, duplicated geography, unreasonable stretching,
transparent slivers, border leakage, wrong coordinate signs, or an obviously
mismatched seam. A passing registration measures agreement with Fletcher’s
engraved coordinate frame. It does not establish modern parcel, road, shoreline,
title, access, flood, value, service, or historical-survey accuracy.

Update only the target sheet in `manifest.json`, atomically, then regenerate:

```bash
python3 -m tools.fletcher.report \
  /var/home/dan/nsmarks-fletcher-20260725/manifest.json \
  --out reports/fletcher/RESULTS.md
```

## Sheet 23 receipt

Sheet 23 used direct Rumsey source `RUMSEY~8~1~2648~290016`, list number
`3997.025`, at 10,741 × 7,635 pixels with SHA-256
`407c48993dd29f8483700050cd4d2b61bca737629223abea7bdf676246244d31`.
Eight individually measured intersections supplied six controls and two frozen
checks. Thin-plate spline was selected with held-out RMS 50.96 m, P95 69.17 m,
and maximum 69.17 m. The visual QA passed and the zoom 8–16 pyramid contains
7,834 PNG tiles.

Sheet 22 and Sheet 23 do not share a labelled coordinate-frame boundary, so no
seam acceptance claim is made. No other sheet, product layer, host, source URL,
native bundle, or deployment was changed by the Sheet 23 run.
