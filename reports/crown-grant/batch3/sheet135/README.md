# Sheet 135 — Cape St Lawrence, Cape North and St Paul Island

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 7 | 6 | 92.12 | 51.23 | 149.71 | 153.19 |
| stpaul-inset | 4 | 4 | 94.09 | 83.28 | 131.96 | 140.33 |

Original source: https://novascotia.ca/natr/land/indexmaps/135.pdf, 5746 × 3965, 150 ppi. The complete original scan is separately accessible with marginal attribution and warning.

Complete original mapped frame from Pollett Cove and the western interior through Cape St Lawrence, Meat Cove, Bay St Lawrence and Cape North, with all offshore rocks and Atlantic area retained. The true displaced St Paul Island inset, including its northern island, is separately fitted. Its native mask exactly fills the hole in the main source mask.

Native borders, inset corners, paired source/reference crosshairs and broad topology were inspected before fitting. Main uses an affine; the narrow island inset uses a constrained similarity supported by four coastal controls. No score-driven fit or point changes followed.

The ambiguous southwest lake corner and Atlantic Cove inner bend were rejected before fitting; raw proposals and corrections remain recorded. The originally audited St Paul northwest control was retained after a revised source proposal was seen off shore.

Modern reference retrieval yielded 4068 features over 3 pages with explicit St Paul coverage. Discovery guides derive from adjacent placement and island bounds; neither supplies fitting observations.

Mean ground residual bias: main +30.53 m east / -33.29 m north; St Paul +37.34 m east / +63.07 m north.

Limitations:

- Main: seven controls and six independent checks, RMS92.12 m, median 51.23 m, P95149.71 m and maximum 153.19 m. The 100 m RMS ceiling passes; sparse coastal/pond samples do not validate all parcel interiors, eastern slopes or southern edge.
- St Paul inset: four controls and four independent checks, RMS94.09 m, median 83.28 m, P95131.96 m and maximum 140.33 m. RMS passes, but median exceeds suggested 75 m and four coastal checks give limited coverage; north island has a control but no separate excluded check.
- Both components retain first fits and scores; source working uncertainty 12 px, modern 25 m. Generalized shores and changed channels remain limitations.
- Check counts and scores are not pooled across components.

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. Browser proof is recorded separately. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.
