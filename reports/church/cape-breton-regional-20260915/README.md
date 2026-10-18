# Cape Breton regional support — 15 September 2026

The current provisional review is an eleven-control TPS. Fresh checks at the
island off Fraser Point and Green Island give **161.16 m** and **186.79 m** errors,
while Stewarts Lake still fails at **867.77 m**. These three checks have
**520.86 m RMS**, versus 869.46 m on the original affine using the exact same
features. The 250 m working target and whole-panel acceptance remain unmet.
No tiles, catalog activation or deployment follows.

The previous MacAdams, Dalem and Lighthouse first failures are unchanged.
Separate trials promote MacAdams and Dalem to regional controls, then Lighthouse
to southern coastal support. Each promoted feature and its aliases are excluded
from later checks. The intermediate Lighthouse diagnostic grew to 490.13 m after
the interior correction; that result is preserved alongside its original 363.35 m
fresh failure. The ten-control trial was not presented as geographic acceptance.

| Same Hay / North Head / Lighthouse diagnostics | RMS |
| --- | ---: |
| TPS8 | 248.98 m |
| TPS9 with MacAdams | 318.65 m |
| TPS9 with Dalem | 246.69 m |
| TPS10 with both | 313.36 m |
| Affine10 | 397.57 m |

After Lighthouse is promoted, the remaining **Hay / North Head pair** gives
164.86 m on TPS10, 210.28 m on TPS11, and 419.11 m on affine11. This two-point
set is different from the table's three-point set. TPS11 was selected for the
additional verified regional support and then frozen before fresh validation.
CB01 and CB14 remain two controls on the same Scatarie Island, not independent
island evidence. All earlier controls, observations and artifacts remain retained.

| Fresh check of frozen TPS11 | TPS11 | Original affine3 | Hull |
| --- | ---: | ---: | --- |
| CB18 Stewarts Lake northeastern Six Mile Brook junction | 867.77 m | 940.45 m | Inside |
| CB19 Closed island immediately off Fraser Point | 161.16 m | 1,061.59 m | Outside |
| CB20 Green Island south of Louisbourg Harbour | 186.79 m | 506.43 m | Outside |

For these three fresh checks: median 186.79 m, empirical P95
799.67 m, maximum 867.77 m; mean residual
-304.06 m east / -139.56 m north.
Distances are horizontal ground metres using the retained mean-latitude cosine
convention. P95 is a sample percentile, not a confidence guarantee. No tuning
follows these three results. They are not pooled with selection diagnostics or
previously promoted checks, and three features do not establish whole-panel accuracy.

Stewarts is matched through its labelled lake, adjacent Morrison Lake and paired
northern brook connections. The source and modern lake outlines differ. A
[municipal watershed plan](https://cbrm.ns.ca/wp-content/uploads/2025/11/Kelly-Lake-Source-Water-Protection-Plan-2013.pdf)
confirms two outlets and documents beaver-related water-level variation, but does
not establish the historical horizontal shoreline change. The first failed check
and original coordinates are retained unchanged; no causal correction is inferred.

The Fraser Point observation uses a visibly closed offshore island, separated
from the mainland and matched to original WACOIS10 feature 17044. Kempt Head's
nearly straight western shore was withheld instead of selecting an ambiguous
extremum. Green Island is distinguished from Battery and Rocky Islands through
the three-island arrangement below Lighthouse Point. Source outlines and exact
modern exteriors are retained; translated-coordinate centroid arithmetic agrees
with Shapely. The point centroids do not establish exact entire-shore agreement.

Belfry's headland/channel/barrier correspondence and White Point's rocky extension
remain unresolved. The southern extension is still unvalidated. No whole
Boularderie outline centroid was adopted without a complete audited source trace.
`search-decisions.json` preserves these limits and the corresponding local searches.

The GeoTIFF retains the unchanged full-content cutline: 6,716×5,374 pixels,
EPSG:3857, 20 projected-metre cells. It has zero alpha holes in 23,417,439 tested
interior cells, with one-cell edge tolerance. All 33,778 sampled orientation
determinants are negative; maximum sampled anisotropy is 1.15014. Finite samples
do not prove the continuous surface. Historical imagery retains David Rumsey /
Stanford attribution and recorded CC BY-NC-SA 3.0 terms; large rasters stay outside Git.

Sixteen actual raster/reference windows were inspected. MacAdams, Dalem and
Lighthouse coincide at their now-fitted points, while surrounding outlines can
still differ. The fresh island centroids improve and Stewarts remains visibly off.
The production parser round-trips ten inventories; the decoder/projection probe
checks 81 mesh nodes. Actual browser import, reload, full overview, and MacAdams
and Stewarts terrain views at 10× were inspected without captured errors.
These are artifact checks and regional observations, not geographic acceptance.

The next work is broader independent coverage, the Stewarts discrepancy, withheld
southern features and seams. Preserve first failures and role changes in any
subsequent repair. Full georeferencing remains incomplete.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/cape-breton-regional-20260915/verify_reports.py
```
