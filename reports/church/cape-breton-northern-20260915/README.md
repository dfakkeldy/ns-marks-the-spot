# Cape Breton northern and island support — 15 September 2026

Northern and Scatarie support improve the same two selection diagnostics to
164.24 m RMS, but three new distributed checks fail at **845.17 m RMS**. The
8-control TPS is retained as a coastal refinement experiment, not an accepted
whole-panel replacement. No catalog activation, tiles or deployment occurs.
The working target remains 250 m; the stretch target remains 200 m.

Low Point CB09 is promoted in a separate northern trial. Its original 613.73 m
first failure remains in the preceding report. North Head CB13 subsequently
becomes a selection diagnostic; its original 350.70 m fresh TPS6 result remains
untouched. Neither retains a fresh-validation claim after this selection.

CB14 adds Scatarie's eastern main-island shoreline tip, distinguishing the shore
from the offshore lighthouse symbol, sea engraving contours and detached rocks.
Its original WACOIS10 vertex belongs to the previously verified Scatarie exterior.
CB01 and CB14 share the same island and are both controls; CB14 is not independent
validation of the centroid. Its unfitted TPS6 discrepancy was 527.03 m.

| Same Hay CB04 / North Head CB13 diagnostics | RMS | Hay | North Head |
| --- | ---: | ---: | ---: |
| TPS6 | 433.90 m | 503.53 m | 350.70 m |
| Northern affine 7 | 431.74 m | 415.96 m | 446.96 m |
| Northern TPS7 | 366.49 m | 514.80 m | 60.05 m |
| Northern/island affine 8 | 394.28 m | 335.72 m | 445.20 m |
| Frozen TPS8 | 164.24 m | 222.37 m | 67.07 m |

The TPS8 was frozen and rendered before these fresh physical checks:

| Fresh feature | TPS8 error | Original affine 3 error | Control hull |
| --- | ---: | ---: | --- |
| CB15 MacAdams Lake eastern connection | 1,332.28 m | 891.78 m | Inside |
| CB16 Lighthouse Point southern shore | 363.35 m | 549.00 m | Outside |
| CB17 Dalem Lake southeastern junction | 485.76 m | 704.32 m | Outside |

Fresh n=3: RMS 845.17 m, median 485.76 m, empirical P95 1,247.63 m,
maximum 1,332.28 m, mean residual −603.34 m east /−396.84 m north. The same three
checks on affine 3 have 728.64 m RMS. Coastal diagnostic improvement therefore
has not demonstrated overall geographic improvement. P95 is a sample percentile,
not a confidence bound. Exact metrics and the ground-distance convention are in
`accuracy-summary.json`, `model-comparison.json` and the individual first results.
No fit change follows these three fresh results in this report.

MacAdams was matched through the lake and brook network, not the representative
name point or proximity to a predicted position. A follow-up audit traces Bonds
Meadow Brook into the Gaspereaux River and then its connection to Salmon River,
clarifying the broadly named reach in the original observation. It supports the
connection order while leaving the historical geometry and large displacement
unresolved. Original coordinates, observation and first score are unchanged.
See `identity/macadams-network-audit.json` and its original feature extract.

Lighthouse Point uses the southern continuous shore, below the access route and
separate from the lighthouse icon. Dalem uses the southeastern lake/stream node,
not the county-line crossing below it. The physical Dalem Lake record is in
Victoria, while a similarly named community record is in Cape Breton; this check
covers the Victoria portion actually drawn in the Cape Breton geographic panel.

Blacketts Lake's outlet was withheld from matching because a pre-dam correspondence
was not established. The [federal management plan](https://www.canada.ca/en/environment-climate-change/services/species-risk-public-registry/management-plans/yellow-lampmussel-lampsilis-cariosa-proposed-2009.html)
records the 1902 Sydney River dam and altered upstream waters. This does not supply
a quantified historical shoreline correction. Other unresolved searches remain
listed in `excluded-searches.json`.

The exact TPS8 raster is 6,680×5,353, EPSG:3857, 20 projected-metre cells. The original
repaired content boundary remains byte-identical. Coverage verification finds
zero alpha holes in 23,383,761 tested interior cells, with one-cell boundary
tolerance. There are no orientation reversals among 28,735 finite samples; maximum
sampled anisotropy is 1.1288. These samples do not prove the continuous surface.
The scan is the hash-verified original Church Cape Breton TIFF; source imagery
is credited to David Rumsey Map Collection / Stanford Libraries, recorded
CC BY-NC-SA 3.0. Large rasters remain outside Git.

Thirteen actual raster/reference windows were inspected; CB15 uses a 4 km window
to retain both displaced positions, while the others use 2 km. The importer
round-trips six point inventories, and the embedded decoder/projection probe
checks 81 mesh nodes. The actual browser imported and restored the raster after
navigation, displayed the full retained content, and showed MacAdams in 2D and
10× terrain with no captured errors. The historical lake is visibly displaced
onto raised relief southwest of the modern lake. Terrain is contextual evidence;
all measured coordinates remain in native scan/reference frames.

These technical checks do not close the geographic gate. Interior, northwestern,
Louisbourg and intervening-region support and independent checks remain needed,
as does seam assessment. Preserve the first failures and role histories when
continuing refinement. Full georeferencing remains incomplete.

```sh
PYTHONPATH=. /opt/local/bin/python 3.12 reports/church/cape-breton-northern-20260915/verify_reports.py
```
