# Judique georeferencing draft

The four visually reviewed stream junctions now anchor a **39-control, sheet-scale
Judique draft**, with the **15 saved hand-added controls retained exactly**.
Eight additional stream junctions are excluded from the fit. Their ground errors
are **20–94 m, median 68 m**. The final draft passes the predeclared numerical
limits after correcting one new control's tributary identity. This is a useful
assisted georeferencing result, not a successful unattended or blind trial.

The production measured CSV, published raster, tiles, and browser records are
unchanged. All new material is a separate draft. The 45 earlier feature-led
controls in the production CSV are excluded from this draft, including the
suspect control discussed in the [preceding test](../visual-match-test/README.md).

## Controls and evidence

| Source | Controls |
| --- | ---: |
| Four stream junctions visually accepted by the user (T, C1–C3) | 4 |
| Additional local stream junctions (V01–V08) | 8 |
| Existing hand-added `gcp-*` rows, unchanged | 15 |
| Outer stream junctions, stream outlets and Mackay Point (O00–O11) | 12 |
| Total fitted | **39** |
| Separate check junctions (Q01–Q08) | **8** |

Correspondences use native scan detail and the topology of streams and their
branches, with road relationships and a coastal headland where identifiable.
The printed graticule translated using the four reviewed controls guided the
initial search. An affine guide incorporating the 15 saved hand controls and
12 local controls helped locate outer areas. These guides narrow the search;
the guide position itself is not the evidence for a match. No learned matcher
or extraction mask supplies these new controls.

Only T and C1–C3 received user review in this continuation. The 20 additional
controls and eight checks are agent proposals. Native source crosshairs were
visually audited, as were the final raster overview and all eight check overlays.
The saved hand controls are preserved, not independently resurveyed.

## Frozen stages and correction

Each observation stage was committed before its own score was calculated.
All stages and scores are retained, including the failed outer fit.

| Stage | Observation file | Controls / checks | Median / worst | Gate |
| --- | --- | ---: | ---: | --- |
| Local expansion | `observations.json` | 12 / 4 | 72 / 102 m | Pass locally |
| Initial sheet expansion | `outer-observations.json` | 39 / 8 | 76 / 229 m | **Fail** |
| Corrected sheet draft | `sheet-observations.json` | 39 / 8 | **68 / 94 m** | Pass after correction |

The original freeze commits are `96fa3b7e`, `55816e53`, and `d9160367`, respectively.
After the preceding PR merged, these were cherry-picked onto current nightly as
`c21dd2839`, `02dfbaaa3`, and `1d232dd0b`. Observation file hashes are unchanged.

The initial outer fit failed at Q05 (229 m). Reviewing the nearby new O01
control showed that source pixel **(4120, 1230)** is the **large eastern
tributary**, while its original modern assignment J0917 is the northwestern
tributary. Tracing NSTDB line 287047 established the eastern tributary's junction
as J0908, at **45.9209605, -61.472227** (lines 275412, 275413, 287047).
The original target at **45.9184515, -61.4768313** belongs to the other branch
(lines 209854, 275414, 275415).

Only O01's modern correspondence changed. Its source pixel, every other point,
all eight checks, and the thresholds stayed fixed. Q05's error then became 70 m.
Because a check failure prompted this correction, the final eight checks are
**withheld from fitting but used for diagnosis**; this is not fresh blind
validation. The frozen sheet JSON inherited a sentence saying “Four checks
cannot establish sheet-wide accuracy”; the final stage actually has **eight**,
which still cannot establish accuracy across the sheet. The frozen file is left
unchanged to preserve its scored hash.

## Final check errors

| Check | Draft ground error | Four-reviewed-point translation baseline |
| --- | ---: | ---: |
| Q01 | 94 m | 135 m |
| Q02 | 20 m | 105 m |
| Q03 | 32 m | 70 m |
| Q04 | 89 m | 281 m |
| Q05 | 70 m | 138 m |
| Q06 | 87 m | 59 m |
| Q07 | 52 m | 372 m |
| Q08 | 67 m | 68 m |
| Median | **68 m** | **120 m** |

Seven checks improved against that simple baseline; Q06 worsened. This baseline
is the printed graticule plus a median Web Mercator translation from T and
C1–C3. It is **not a measurement of the current Rumsey or published NSMtS layer**.

The fixed gate requires median error ≤100 m, maximum ≤200 m, every check inside
the source control hull, and no sampled folds. The final fit satisfies all four.
A grid at 25-source-pixel intervals found **zero folded or degenerate samples
among 45,246 locations**. This finite-difference diagnostic uses 1-pixel offsets;
it cannot rule out folding between samples. Zero fitted-control residual is
expected for an interpolating spline and is not an accuracy measurement.

Checks were chosen by the same agent, not surveyed or independently annotated.
The evidence is sparse in some outer areas. Modern waterways may have changed,
and a modern bank junction can differ from the historical river centreline.
The overlays visibly retain local stream-shape discrepancies. A 5 m raster cell
does not imply 5 m geographic accuracy.

## Delivered files and NSMtS use

- [`judique-sheet19-draft.csv`](judique-sheet19-draft.csv): editable controls and
  checks in the existing NSMtS Fletcher format, for the **10815 × 7549 native scan**.
- `judique-sheet19-draft.tif`: georeferenced RGBA GeoTIFF, **6332 × 5428**, EPSG:3857,
  5 projected metres per pixel (about 3.5 ground metres here), cubic resampling.
- `judique-overview.png`: control distribution and supported coverage.
- `judique-checks-1-4.png`, `judique-checks-5-8.png`: every scored check with modern
  water in blue, roads in pink, and historical predictions in orange.
- [`artifact-receipt.json`](artifact-receipt.json): local artifact paths, hashes,
  source references, and verification results. Historical imagery stays outside Git.

The raster is clipped to the transformed, densified convex hull of its controls.
It covers much of the sheet, but unsupported perimeter areas are transparent;
the hull is a conservative display boundary, not a guarantee of accuracy inside.

Use a separate draft map to compare in NSMtS. Importing the CSV in the
georeferencer **replaces that map's control list** (the panel supports undo).
Choose **Curved warp (TPS)** to reproduce this fit. The eight `check` rows are
kept separate and never become fitting controls. The real web parser and TPS
solver were run offline: all 15 saved rows and CSV numeric spellings survive,
and all eight web predictions agree with GDAL within **0.001 projected metre**.
This does not verify browser rendering or the app's mesh approximation; no live
browser import was performed. The GeoTIFF already contains the rendered warp.

## Reproduction and verification

Requires Python with NumPy and SciPy, plus GDAL command-line tools on `PATH`.
GDAL 3.9.0 was used. From the repository root:

```sh
python reports/fletcher/visual-expansion/build_draft.py \
  --out /tmp/judique-draft \
  --source /path/to/native-sheet19/sheet19.png
```

The script verifies the native scan SHA256 before rendering, writes a separate
CSV, score JSON, GeoTIFF, PNG, VRT, clipping polygon and raster metadata in the
output directory, and refuses any changed saved hand-control coordinates.
Use `--score-only` without imagery to replay scores and export the CSV.
Use `--observations` to replay either earlier frozen stage. Score replay
reproduced all three stages within 1 mm computational tolerance. The final
GeoTIFF and PNG reproduced byte-identically. That tolerance checks computational
reproducibility, not geographic accuracy.

With web dependencies installed, verify the actual NSMtS importer and solver:

```sh
web/node_modules/.bin/rolldown \
  reports/fletcher/visual-expansion/verify_import.ts \
  --platform node --format esm --file /tmp/judique-import.mjs
node /tmp/judique-import.mjs
```

Historical source: [David Rumsey Map Collection / David Rumsey Map Center,
Stanford University Libraries](https://www.davidrumsey.com/), native IIIF item
`RUMSEY~8~1~2644~290012`, CC BY-NC-SA 3.0; see the existing project source receipts
for separately recorded permissions. Modern reference: Nova Scotia NSTDB 1:10,000
water line and road extracts, with URLs and SHA256s in
[reference-receipts.json](../matching-benchmark/reference-receipts.json).

## Subsequent browser verification — 2026-09-05

A separate local Chromium profile exercised the actual NSMtS UI with the native
Judique PNG and draft CSV. Import retained the **10815 × 7549** coordinate frame,
loaded **39 controls**, and excluded **eight checks** from the TPS fit. The UI
reported **69 m RMS, worst 94 m** at the checks (the earlier report uses median).
After Done and reload, all 39 controls and the TPS method persisted. The stored
native scan's SHA256 remained identical to the source receipt.

This check found and repaired two import defects: the 135 MiB scan exceeded
Chromium's single serialized IndexedDB value limit, and the GeoTIFF preview
ignored alpha, making transparent hull corners black. Raster storage now splits
large values into 64 MiB entries, and GeoTIFF previews retain declared alpha.
The clipped GeoTIFF was imported separately, reloaded, and inspected on desktop
1600 × 1050 and phone 390 × 844 views. Its stored SHA256 still matches the
artifact receipt; the decoded preview has alpha 0 at the outside corner and
255 at its centre. No page errors occurred in the final GeoTIFF run.

Check points remain editing-session data: reopening the CSV restores them after
reload. The native PNG plus CSV path renders the full scan, including extrapolated
areas outside the controls; use the already clipped GeoTIFF for the supported-area
preview. The browser checks establish import, persistence and rendering behaviour,
not fresh geographic validation, browser-wide compatibility or production
publication. Geographic check observations and scores are unchanged.

Local screenshot evidence is in
`/Users/dfakkeldy/Downloads/judique-browser-verification/`, including
`import-desktop.png`, `points-mobile.png`, `clipped-geotiff-reload.png` and
`clipped-geotiff-mobile.png`. The user's existing browser records were untouched.
