# Sheet 11 completion attempt — 11 September 2026

**Provisional; geography is not accepted.** This packet preserves the prior 25
controls, adds one western support point, records two rounds of failed independent
validation, and verifies a complete raster in the web app. It does not activate
tiles or authorize production label projection.

## Frozen trials and independent failures

The prior `refinement-20260910/central-fit.json` was frozen before selecting V04
and V05. Original native-pixel crosshairs and modern junction topology were
inspected before scoring. Initial proposals and corrected final selections are
both retained. V05's initial crosshair was on the intervening reach; the final
selection identifies the first southwestern fork, using the second fork and road
crossings as context.

| Fit | Check | Result, approximate ground metres |
| --- | --- | ---: |
| Prior 25 controls | V04 Tompkins southern tributary | 98.912 |
| Prior 25 controls | V05 western interior fork | 226.186 |
| New 26 controls | V06 western interior eastern tributary | 154.079 |
| New 26 controls | V07 eastern river-bank tributary north of Tompkins | 408.093 |

Failed V05 was explicitly converted to control W03 at the same source and modern
coordinates. Its original failure remains in `validation-scores.json`. All prior
25 controls remain exactly unchanged. W03 and earlier converted control T01 are
excluded from independent checks. The new fit was frozen in `western-freeze.json`
**before** selecting V06 and V07; these checks have not been moved or promoted.

The new fresh-check median is **281.086 m**, worst **408.093 m**, failing the
predeclared 100 m median / 200 m worst goals. V07's historical and modern
island/channel configurations differ. Its identity or historical-change question
remains unresolved; the residual is retained, not interpreted as a clean estimate
of transform error. The ten reused diagnostics (prior nine plus V04) have median
**100.488 m**, worst **174.240 m**. They are not independent acceptance evidence,
and their median must not be rounded down to a passing result. Q03's Grey headwater
fork remains ambiguous.

## Full-sheet artifact and review

`western-fit.json` is the active 26-control trial. Its SHA-256 is
`18157a6f3361eeb1a9be31c476769796d4ea0705bdb82ea87645289634b7264f`.
The original 10771 × 7551 source scan is unchanged. Both original boundary
components are retained: main sheet with western mapped extension, and separate
Sea Wolf/Margaree Island including its printed name.

`render.py` reuses the existing boundary helper and runs exact GDAL TPS (`-et 0`),
EPSG:3857, 5 projected metre cells, cubic sampling and alpha. The resulting
9365 × 5983 RGBA GeoTIFF is outside Git:

`/Users/dfakkeldy/Downloads/fletcher-sheet11/completion-20260911/sheet-11-exact.tif`

SHA-256: `8721b668ddcb7fac3bfa8bbf3bb29fec7351483d62893ffe1f0a787a8b70acda`.
`raster-receipt.json` records the exact command, inputs, bounds and hashes.
`coverage.json` finds zero alpha holes among 48,953,848 interior pixels after the
stated one-cell boundary tolerance. All 73,418 sampled Jacobian determinants
are negative; this is a sampled orientation check, not a continuous proof.

All eight actual warped region pairs in `warped-review/` were inspected, with
cyan modern water and magenta modern roads. The island and extension are present.
Main river/brook networks align unevenly; headwaters, bank geometry and some
tributary shapes remain displaced. Control-supported proximity is not withheld
validation. Both actual Sheet 11–14 coastal and western-interior pairs were
inspected in `sheet14-feature-join/`. Sheet 11's coast sits east of the modern
coastline in this sector; border coverage and brook approaches remain discontinuous.
No cosmetic stretching or seamless-join claim is made. `join-provenance.json`
pins both raster hashes. This packet does not supersede Sheet 9's separate draft
or claim its northern join accepted.

## Import and browser verification

The controls-only CSV contains 26 controls. Diagnostic and validation CSVs retain
roles and contain 26+10 and 26+2 rows respectively. `verify_import.ts` exercises
the actual web CSV parser, serialization and TPS solver: semantic roundtrip passes,
with maximum web/GDAL difference 8.59e-9 projected metres. These checks establish
implementation consistency, not source accuracy.

`verify-browser.mjs` imports the actual GeoTIFF through My Maps in an isolated
Chromium profile against this checkout's Vite server on port 4198. Stored bytes,
embedded georeference, alpha and enabled state survive reload. Desktop 1440×1000
and mobile 390×844 screenshots were inspected; both render the map. No captured
page or console errors. Compact evidence is in `browser-verification.json`; full
screenshots and browser output remain outside Git in the artifact's `browser/`
directory. The existing tile revision and user-owned browser records are unchanged.

Reference geometry hashes were reverified against `../reference-receipts.json`.
Modern NSTDB geometry is reference evidence, not ground truth for every historical
channel. Historical provenance, source pixel coordinates, frozen transform and
remaining blockers are recorded in `handoff.json`. No labels were projected.

## Remaining work

Resolve V07's bank/junction identity or document unsupported historical change,
then obtain defensible replacement evidence without erasing these failures.
Investigate western-interior and Grey headwater discrepancies and coastal joins.
Any further control repair requires a newly frozen fit and fresh independent
checks across the affected regions. Current geographic evidence does not justify
promotion. Continue to the adjacent-sheet queue while this draft preserves the
complete, reproducible attempt.
