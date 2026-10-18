# Sheet 126 — Point Michaud and St Esprit; Fourchu inset replacing sheet 134

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 5 | 6 | 99.94 | 87.09 | 150.69 | 162.20 |
| sheet134-inset | 3 | 3 | 62.13 | 49.90 | 88.37 | 92.65 |

Original source: https://novascotia.ca/natr/land/indexmaps/126.pdf, 5735 × 3886, 150 ppi. The complete original scan is separately accessible with marginal attribution and warning.

Complete main frame and separately displaced lower-right inset, explicitly printed as replacing sheet 134. Main includes Basque and St Esprit islands; inset includes its offshore rocks and complete coastal strip. The two original-frame masks partition all content.

Five main controls and three inset controls were reserved separately from six main and three inset checks. Similarity models were chosen before scoring to avoid unsupported affine shear from narrow coastal control distributions. Neither model was changed after scoring.

The inset has a separate physical geography and transform. The national geoname result for Red Cape supplied only a discovery translation; final ties use audited NSTDB physical shoreline features, not locality centroids.

Reference acquisition was expanded after the initial adjacent-column guide proved misplaced. All adopted points use the final complete 9429-feature, five-page extract. Two earlier query attempts remain private as discovery history.

MQ07, IQ04 and IQ05 were rejected before scoring for ambiguous small bends or smooth modern shore segments. Marie Joseph Lake is tidal: the initial shoreline filter snapped to the ocean side of its barrier; the final reviewed water-boundary vertex is on the lake side. Original and corrected packets preserve this audit.

Limitations:

- Main RMS 99.94 m is only marginally below 100 m; median 87.09 m, P95 150.69 m and maximum 162.20 m exceed companion bounds
- Inset RMS 62.13 m uses only three coastal checks; median 49.90 m and P95 88.37 m exceed companion bounds
- Both models have narrow coastal control distributions and insufficient check counts; the eastern main-map end, interior fragments and offshore rocks are not individually certified

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. Browser proof is recorded separately. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.
