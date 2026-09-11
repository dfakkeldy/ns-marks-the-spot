# Fletcher Sheet 13 — full-neatline provisional trial

**Geography is not accepted.** The current 11-control TPS retains the entire
mapped neatline, but fresh checks fail the declared 100 m median / 200 m worst
criteria. This packet preserves the initial fit, original proposals, rejected
match, failed checks, repaired fit, actual rasters and remaining work. It does
not activate tiles, merge adjacent sheets or authorize production label projection.

## Source and correspondence review

The source is the native IIIF mosaic of Rumsey item
`RUMSEY~8~1~2638~290006`, 10872 × 7682 pixels, SHA-256
`48474fe1e8762d5c07c79cf05b59918e429bd41a6cc2a6fe1a568dd89b84c72f`.
`source-receipt.json` preserves manifest identity, attribution, native region
rectangles and hashes. Every mosaic region was compared pixel-for-pixel with its
cached native JPEG. Large scans and rasters remain outside Git.

The older graticule observations remain unchanged. Their different scan hash is
not treated as interchangeable with this source. Their approximate affine is used
only to search for physical features. No fitting control uses a predicted guide
location as its modern identity. NSTDB references use longitude/latitude in
EPSG:4326; source IDs and verified hashes are in `reference-receipts.json`.
The empty rail response is recorded as returned-empty.

Broad source/modern context and original native crosshairs were inspected before
scoring. `control-proposals.json` and `control-proposal-review/` preserve initial
placements. Final corrected figures are in `control-final-review/`. Several
initial pixels fell on a nearby reach rather than the junction. C05's initial
southern tributary contradicted the modern branch directions; its upstream
northwestern tributary was identified and reviewed before fitting. C06 was
rejected entirely: its historical major channel merger is not modern J0910.
`rejected-candidates.json` retains that failed correspondence.

The initial eight physical controls were frozen before selecting seven diagnostic
checks. Checks received the same native crosshair review and source-only
corrections before scoring. Q04's initial bend was corrected to the visible eastern
tributary entry. Its detailed correspondence remains a limitation because the
modern branch hierarchy differs. Q07 has an additional modern parallel downstream
branch not clearly represented historically. Neither ambiguity is clean
acceptance evidence.

## Frozen fits and errors

All errors below are approximate spherical ground metres, not projected cell size.

| Trial and check set | Median | Worst |
| --- | ---: | ---: |
| Eight controls, affine, seven diagnostics | 253.674 | 396.238 |
| Eight controls, TPS, same seven diagnostics | 242.918 | 368.276 |
| Eleven controls, TPS, four reused diagnostics | 159.063 | 268.669 |
| Eleven controls, TPS, four fresh validation features | **115.492** | **245.573** |

Failed Q02 (Mount Pleasant), Q05 (mill-brook fork) and Q06 (North Brook eastern
fork) became C10, C11 and C12 explicitly. Their original failures remain intact;
they are excluded from all subsequent checks. All original eight controls are
unchanged. `regional-freeze.json` precedes selection of fresh V01–V04. The current
fit hash is `3d4a6d192eb87a343b649941518538f2ca108a25e20182055eadccfba2ff7981`.

The seven- and four-diagnostic summaries are not directly comparable. On the same
remaining four diagnostics, the old TPS median was 171.972 m and worst 368.276 m;
the repaired fit is 159.063 m / 268.669 m and still fails. Fresh checks are:

| Check | Feature | Ground error |
| --- | --- | ---: |
| V01 | Mount Pleasant southern tributary | 99.660 m |
| V02 | North Brook northern-arm tributary | 245.573 m |
| V03 | McDonald Brook upstream fork | 131.294 m |
| V04 | Northernmost turn of mill-brook headwater loop | 99.689 m |

V04 is a bend extremum, with 15-pixel source uncertainty, rather than a sharply
defined junction. The two near-100 m results should not imply high precision.
These fresh failures have not been moved, discarded or converted to controls.

## Actual raster, coverage and adjacent sheets

`boundary-overview.jpg`, native corner crops and frame metadata document the
complete mapped rectangle with a thin frame margin. No mapped extension outside
it was visible in the inspected full scan. All lake, river and island geometry
inside the neatline remains. This is not a corridor or control-hull crop.

The existing `full-sheets/render.py` produced exact GDAL TPS rasters in EPSG:3857
with `-et 0`, cubic resampling, 5 projected metre cells and alpha. Both trials are
preserved. The current 8695 × 5806 RGBA artifact is:

`/Users/dfakkeldy/Downloads/fletcher-sheet13/regional-eleven/sheet-13-full-sheet.tif`

SHA-256: `178cf532aee8967ee38cc3cc76a29a691e8310a08ac49afe3944916e442e5a91`.
`raster-receipt.json` and `render-provenance.json` pin inputs, output and tool.
There are zero alpha holes among 48,235,612 interior pixels with the stated
one-cell boundary tolerance. All 71,721 sampled Jacobians are negative; this is
sampled orientation evidence, not a continuous no-fold proof.

All nine actual warped regional pairs were inspected in `warped-review/`. Main
networks align unevenly. The northwestern valley, North Brook northern arm,
southern interior and southeast estuary remain visibly displaced. Lake Ainslie's
western peninsula and parts of its east shore differ from modern geometry. The
historical mill-brook outlet runs differently from its modern course even where
the upper loop and fork can be identified. More control interpolation alone
cannot establish whether these differences reflect mapping or landscape change.

All four actual adjacent-sheet pairs were inspected in `adjacent-sheet-review/`:
Sheet 11 at Margaree and Middle River, and Sheet 14 at the western interior and
lake shore. Offsets and incomplete coverage continuity remain. No stretching or
seamless mosaic acceptance is claimed. `join-provenance.json` pins all three
raster hashes; these figures do not promote either adjacent draft.

## App verification and reproduction

The three CSVs contain 11 controls, 11+4 diagnostic rows and 11+4 fresh validation
rows, with roles preserved. The actual web parser rejected an initial wrong CSV
header; it was corrected to the established Fletcher format. Parser/serialization
roundtrip now passes and the web/GDAL TPS solutions agree within 5.97e-9 projected
metres (`import-verification.json`).

`verify-browser.mjs` imported the actual GeoTIFF through My Maps in an isolated
Chromium profile. Desktop 1440×1000 and mobile 390×844 reload screenshots were
inspected. Stored raster bytes, embedded georeference, transparency and enabled
state survive reload, with no captured browser errors. Full screenshots remain
beside the raster; compact receipts are in `browser-verification.json`. This does
not establish geographic acceptance or production deployment.

Run report Python commands from the repository root with the existing benchmark
Python and GDAL CLI on PATH. The existing renderer accepts `--source`, `--fit`,
`--boundary`, `--checks` and `--out`; use `regional-fit.json`, `boundary.json` and
`validation-checks.json` for this trial. `review_warp.py` and `review_join.py`
reproduce geographic raster windows. `review_points.py RECORD OUTPUT IDS...`
wraps the existing native-point review helper. `search_context.py NAME X0 Y0 X1 Y1`
reproduces the approximate search panels. Parser verification is bundled with
`web/node_modules/.bin/rolldown` and run with Node. The browser script takes the
raster path and external output directory and expects the local app on port 4198.

## Precise remaining work

Preserve the fresh North Brook failure while resolving its northern-arm shape and
Q07's extra modern parallel branch. Audit Q04's Coopers junction identity before
using it as support. Resolve Middle River bank/centreline correspondence; C06
must not be silently reinstated. Establish defensible shoreline and valley
correspondences in the sparsely supported regions, distinguishing historical
change from registration error. Any repair needs a new freeze and replacement
independent checks. The current evidence blocks whole-sheet acceptance.

`handoff.json` records source-native pixels, transform identity, editable inputs,
artifact receipts and the label-draft contract. No labels were projected. Continue
with adjacent Sheet 15 while retaining this reproducible provisional attempt.
