# Sheet 114 — Inverness, Broad Cove and Cape Mabou inset

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 5 | 6 | 168.85 | 161.28 | 237.72 | 242.59 |
| cape-mabou-inset | 2 | 4 | 93.43 | 95.17 | 121.40 | 124.61 |

Original source: https://novascotia.ca/natr/land/indexmaps/114.pdf, 5959 × 4077, 160 ppi. The complete original scan is separately accessible with marginal attribution and warning.

The complete main map includes Sea Wolf Island. The boxed Cape Mabou/Sight Point inset uses its own constrained similarity transform at its actual location. Its lower annotation extension is retained; complementary masks preserve the entire mapped source footprint without overlap.

Main controls include the Sea Wolf northeastern tip, Marsh Point, Chimney Corner, Inverness pond and a Deepdale tributary junction. A geoname locality corroborated the identity of Marsh Point after its relatively large fitting residual was observed; no geoname centroid was substituted for a physical tie, and the frozen fit was unchanged during checking.

The inset locality guide from Cape Mabou/Sight Point geonames was only a discovery aid. Native shoreline topology identified two distinct physical ties: the Sight Point shoulder and a northeastern coastal notch. A constrained similarity was selected to avoid unsupported affine shear; four additional shoreline checks were finalized and scored against that frozen fit. A proposed smooth Cape Mabou shore bend was rejected as a control for lacking a precise shared definition.

Three main-sheet candidates were rejected before first scoring for ambiguous coast/road/stream definitions. Historic Margaree Forks/Gillisdale channel and island configurations were inspected but did not supply a secure fixed bank/confluence tie. All proposals and corrections are preserved, with canonical adopted roles in the fit/check records.

Both scan and source coordinates remain in the original 5959 × 4077 pixel frame. The inset mask includes the black circled reference below its lower border, inspected in a native crop with origin [1500, 1100]. The complete source union is checked independently of output rasterization.

Main-map island and mainland subregion scores are reported in regional-scores.json. This is a geographic assessment with stated failures, not a claim that successful rendering meets the accuracy gate.

Limitations:

- Main map RMS 168.85 m exceeds 100 m; six independent checks are limited to island/coastal features
- Inset RMS 93.43 m passes 100 m, but four coast checks and only two controls leave its interior and far edges unsupported
- Inset median/P95/maximum and main companion bounds exceed the retained criteria
- Eastern main-sheet terrain and changing Margaree channel configurations are not independently validated
- Two-point similarity fitting residuals are essentially zero by construction and are not accuracy evidence

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. Browser proof is recorded separately. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.
