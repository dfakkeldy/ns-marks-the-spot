# Sheet 112 — Chedabucto Bay, Queensport, Arichat and Petit-de-Grat inset

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 8 | 9 | 105.24 | 83.37 | 183.81 | 206.32 |
| petit-inset | 4 | 5 | 90.87 | 54.74 | 154.43 | 175.14 |

Original source: https://novascotia.ca/natr/land/indexmaps/112.pdf, 6029 × 4090, 160 ppi. The complete original scan is separately accessible with marginal attribution and warning.

Entire mapped original frame retains the northern Porper/Grady coast fragment, Arichat and Cape au Guet corner, Queensport-to-Canso mainland, all offshore islands and the whole Chedabucto Bay. The displaced Petit-de-Grat inset, including its mainland fragment and Green Island, is fitted separately; its original-frame mask exactly fills the main-map hole.

Both component role plans and audited point sets were fixed before first scoring: affine for the broad main frame, constrained similarity for the displaced inset. All first scores and transforms are retained unchanged.

Native border and inset-corner audits distinguish the boxed Petit-de-Grat content from true-position Arichat imagery. No source coordinates were rebased; the original 6,029 × 4,090 scan and inset notes remain available privately.

Fully paginated NSTDB reference contains 6,192 features over four pages, with an eastern extent chosen to include the displaced inset geography. Adjacent sheet fits and visible topology supplied discovery guides only.

Mean ground residual bias: main +34.84 m east / -23.72 m north; inset -22.70 m east / +18.00 m north.

Limitations:

- Main: eight controls and nine excluded checks give RMS 105.24 m, exceeding the 100 m ceiling. Median 83.37 m and P95 183.81 m also exceed suggested 75/150 m bounds; maximum 206.32 m. The failed first result is retained without tuning.
- Petit-de-Grat inset: four controls and five checks give RMS 90.87 m, median 54.74 m, P95 154.43 m and maximum 175.14 m. RMS passes, while P95 exceeds the suggested 150 m companion bound.
- Northwestern mainland fragment has one control and one check; Jerseymans, Fox and Green Island endpoint samples are correlated. Broad parcel interiors, engineered harbour details, many minor islands and urban areas remain insufficiently validated.
- Working source uncertainty is 12 px, raised to 18 px for selected generalized/harbour shores. Main and inset counts are not pooled.

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. Browser proof is recorded separately. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.
