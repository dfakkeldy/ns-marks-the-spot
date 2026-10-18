# Sheet 120 — Cheticamp and Grand Etang; Gray Point and Whale Cove inset

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 7 | 6 | 248.95 | 169.26 | 433.99 | 511.83 |
| gray-point-inset | 2 | 3 | 74.66 | 73.70 | 76.39 | 76.69 |

Original source: https://novascotia.ca/natr/land/indexmaps/120.pdf, 5618 × 3842, 150 ppi. The complete original scan is separately accessible with marginal attribution and warning.

Complete main frame and full boxed northwestern Gray Point–Whale Cove inset. The displaced coastal inset has its own transform. Main includes inland park lakes, Pembroke/Delaney lake group, Cheticamp Island fragment and the southwestern Margaree fringe.

Seven physical main controls and six excluded main checks were frozen before the first affine score. Two separate physical headlands define the inset similarity; three different coastal points were reserved as checks. All adopted native crosshairs and broad shapes were reviewed before scoring.

The original 5618 by 3842, 150 ppi source frame is preserved. The fully paginated NSTDB extract contains 15805 features across eight pages. The Grey Point and Pembroke Lake geoname results establish discovery/locality context only; no centroid was used as a GCP.

A bounded same-control similarity diagnostic after the failed main result also fails: RMS 263.24 m on diagnostic reuse of the six checks, maximum 576.62 m. It does not provide a defensible replacement. The original affine and its first independent result are retained unchanged; model-comparison.json records the decision. No TPS or invented separate lake displacement is introduced to force a pass.

The generalized Pembroke southern bays and an indistinct Cheticamp shoulder were not adopted as precise checks before the first fit. The retained Pembroke northern control and western satellite check remain in the assessment despite large disagreement. MC03 uses the unambiguous northern St Joseph pond apex; MC05 was corrected to the actual LeBlanc lake neck after complete-outline review.

Limitations:

- Main affine first result RMS 248.95 m, median 169.26 m, P95 433.99 m and maximum 511.83 m exceed the 100 m RMS ceiling and companion bounds; main geography is not accepted
- The Pembroke/Delaney group has a substantial local mismatch; its control and independent satellite-pond check are retained, not discarded as outliers
- Inset RMS 74.66 m uses only three nearby coastal checks and two controls; median 73.70 m exceeds the companion bound and the exact two-point control fit is not an accuracy result
- Six main checks and three inset checks give sparse coverage; eastern/southern interiors, barrier shores and offshore fragments remain provisional

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. Browser proof is recorded separately. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.
