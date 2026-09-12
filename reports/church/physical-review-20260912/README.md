# Church physical-feature resumption — 12 September 2026

The four-county task remains incomplete. Richmond has a new, reversible affine
GeoTIFF draft with reviewed physical controls and a larger content boundary.
No county has new geographic acceptance or publication clearance. No tiles or
catalog URLs were created. The July evidence and accepted Inverness south work
remain unchanged.

## Sources and frames

`source-verification.json` records fresh SHA256 verification of all four exact
Rumsey rasters, the Inverness working TIFF, and the original NSTDB major-water
extract against the July freeze. The direct Inverness JP2 and July working TIFF
produce byte-identical JPEGs for the inspected 1200 × 1200 Polletts Cove window;
`source-frame-comparison.json` records its original-scan origin and hashes.
This crop comparison establishes local pixel parity, not whole-image parity.

Historical imagery remains direct Rumsey material. Credit: David Rumsey Map
Collection, David Rumsey Map Center, Stanford Libraries. Historical raster crops and figures containing them retain the source scan
licence separately from the repository code licence. The recorded scan terms
are CC BY-NC-SA 3.0; retain the
[provider terms](https://www.davidrumsey.com/about/copyright-and-permissions).
Modern geometry is official NSTDB data. No OldMapsOnline data were used.
A fresh Rumsey region request timed out; preserved, hash-verified sources were
used rather than claiming a new download.

North Inverness also uses the fuller NSTDB 10k water-line extracts acquired for
Fletcher. Their paths, query extents, CRS, dates, and verified hashes are in
`reference-receipts.json`. Longitude/latitude order is explicit. Source pixels
remain in each original, unrotated archival scan. Native/display crop conversions
are recorded in the observation files and frame indexes.

## Inverness north: physical discrepancies now measurable

Three named river mouths were traced in broad source context and inspected at
native resolution. Modern endpoints were selected on the identified river/coast
geometry, not by nearest distance to the historical point. The exported
`north-diagnostic-checks.csv` contains checks only; none entered a fit.

| Diagnostic | Unchanged graticule TPS error, ground metres |
| --- | ---: |
| Polletts Cove River | 2,293 |
| Red River, Pleasant Bay | 2,013 |
| Fishing Cove River | 1,351 |

`north-diagnostic-observations.json` gives exact pixels, modern feature IDs and
vertices, feature definitions, and estimated 150–200 m placement/estuary
uncertainty. Native and modern crosshair figures are `N02`–`N04`.
These are diagnostic coast correspondences, not six distributed independent
checks. Three observations do not establish whole-panel accuracy.

The older 231 m RMS nearest-shoreline result remains a different experiment.
Distance to an unnamed nearby coastline cannot establish that the correct river
mouth is aligned, especially along a trending shore. The new measurements must
not be folded into that old shoreline score or described as a fresh validation
of a repaired fit. No northern fit was replaced.

Lowland Cove remains an unresolved outlet definition in this review. The two
older tip checks were inspected but not silently moved or relabelled. Their
source-feature definitions need a separate audit before reuse.

## Richmond: repair the correspondence set before fitting

All eleven frozen July accepted-check locations were revisited in native crops.
`richmond/july-checks.csv` preserves them exactly. Three original pixels fail the
physical-feature audit:

- `supply-02` lies on the peninsula north of Blake Island. The actual island was
  subsequently traced in a native 1:1 crop. Its corrected centroid is
  **16936.40, 14324.59**, with the original modern island identity retained.
  The unchanged four-control affine draft measures **99 m** at this corrected
  diagnostic. Both the invalid original and corrected outline are preserved.
- `supply-09` lies inside a mainland road loop near Brule Point.
- `supply-21` lies inside a road/grid enclosure near Port Hawkesbury.

An enclosed paper region was insufficient evidence of an island. None of those
original pixels enters the new fit or its retained four-check comparison.
`richmond/point-review-index.json`, `richmond/blake-correction.json`, and the
paired source/reference figures record the decisions.

The four geographically spread island controls are `supply-06`, `10`, `13`, and
`17`. These **were July checks and are now controls in a separate draft**. They
are removed from every new check set; the original July CSV and failed results
remain available. Mionas/Hook Island neighbourhood, Campbell Island/Janvrin,
Saint Esprit, Knife/Birch Island, Quetique, and the southern Barque member were
reviewed against modern island outlines and surrounding geography.

The remaining four checks (`08`, `15`, `18`, `23`) are diagnostic replays. On
exactly the same four coordinates:

| Model | Graticule baseline RMS / max | Physical draft RMS / max |
| --- | ---: | ---: |
| Affine | 741 / 1,018 m | **343 / 617 m** |
| TPS | 756 / 1,046 m | 338 / 605 m |

Affine was selected for the provisional artifact: TPS's small diagnostic gain
on four controls does not justify a curved whole-sheet warp. These scores are
not directly comparable with the old eleven-point score. The later corrected
Blake Island check is recorded separately and did not select or alter the fit.
There are four retained diagnostic checks plus one corrected post-fit diagnostic,
**zero fresh validation checks**, and no six-check geographic acceptance.

### Content and actual raster review

The old rectangular Richmond cutline includes part of the Nova Scotia locator
and Port Tupper inset and excludes mapped northern/southwestern content.
`richmond/content-boundary.json` supplies a separate expanded, provisional
boundary, informed by native north detail, the full overview, and heavy-rule
measurements. It excludes town plans and title art and retains the mapped Bras
d’Or extension and southwestern islands. Boundary provenance and geographic
support are separate: the northern extension remains unsupported by the fit.

`richmond/warped-review/` contains actual GeoTIFF windows with directly projected
NSTDB water. Chapel Island fits usefully; Barque Islands retain a substantial
shift, and the northern extension visibly disagrees. Long straight segments in
the reference are extract seams, not coastlines. They are explicitly labelled
and are not scored as physical features.

The full GeoTIFF is EPSG:3857, 26,007 × 17,753, with 5 projected-metre cells.
The affine determinant is negative throughout its domain. The shared raster
coverage verifier found **zero transparent holes in 326,248,745 interior cells**,
with a one-output-cell boundary tolerance. This is raster completeness only.
The source attribution, source URL, and provisional description are embedded in
the GeoTIFF. Editable native-frame controls/checks are `richmond/physical-draft.csv`.
The browser-ready combined file `richmond/physical-draft-with-blake-diagnostic.csv`
adds the corrected Blake diagnostic without changing any fitting control.
`north-diagnostic-review.csv` combines the unchanged northern graticule controls
and the new diagnostic checks. Check-only CSVs are retained for offline scoring;
the web importer intentionally refuses them without controls. Do not attach any
native pixel controls to the resampled GeoTIFF.

`parser-verification.json` records real web-parser round trips and affine/GDAL
agreement within 0.001 projected metre. `browser-verification.json` records the
actual 20-projected-metre review GeoTIFF file-chooser import, visible transparency,
correct dimensions and enabled state after reload, and an empty observed error
log. The full-resolution TIFF and raw-scan browser mesh are separate paths.

## Remaining counties and completion boundary

| County / panel | Current outcome and actual missing evidence |
| --- | --- |
| Inverness south | Historical July acceptance preserved; not re-fitted or newly accepted in this run. |
| Inverness north | Three diagnostic physical mouths expose large errors. A distributed physical control set and independent checks across the mapped panel are still missing. |
| Richmond | Provisional physical affine artifact. Northern/edge controls and geographically distributed fresh checks are still missing; the Barque region remains offset. |
| Victoria northwest | Two old source crosshairs were inspected and lie on drawn islands in one pond. That does not provide geographically distributed validation. No new fit or acceptance. |
| Victoria main | Exact source and existing boundary inspected; no new correspondence set or fit. |
| Cape Breton | Exact source and existing boundary inspected. The old boundary includes part of the Sydney inset and cuts southern mapped content; both a revised boundary and physical controls/checks are required. No transform produced. |

Whole-county acceptance retains the fixed minimum of six identifiable independent
checks per panel and RMS/P95/max bounds of 400/900/1500 ground metres. The CLI's
comparison gate previously accepted a numerically small score with only one to
five checks; it now enforces the documented minimum. Geographic coverage and
identity review remain necessary beyond that numerical gate.

## Reproduction and delivery

Run from the repository root:

```sh
PYTHONPATH=. python3 reports/church/physical-review-20260912/replay_scores.py
python3 -m unittest discover -s tools/church/tests -t .
PYTHONPATH=. python3 reports/church/physical-review-20260912/richmond/render_draft.py \
  --source /path/to/exact/richmond.tif --out /path/to/new/draft-directory
```

The renderer verifies the source hash. The score replay checks the frozen
physical-draft RMS and records input hashes; it does not require large imagery.
The existing `reports/fletcher/sheet14/refinement-20260909/verify_raster_coverage.py`
was reused for the full output. `richmond/review_warp.py` regenerates the actual
raster/reference figures with explicit paths.

Large artifacts are under `/var/home/dan/nsmarks-church-20260912/` on Bazzite and
`/Users/dfakkeldy/Downloads/church-georeferencing-20260912/` on the Mac. The
artifact and browser receipts identify which exact outputs were verified.
This work does not update the KinNoKi publication pin, deploy a website, or enable
any Church catalog layer.

The georeferencing skill received a Church-specific reference explaining the
closed-region false positives, same-point comparison, and along-shore diagnostic
limitation. Live sheet state remains in this report.
