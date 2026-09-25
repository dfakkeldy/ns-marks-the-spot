# Sheet 058 — Tidnish, Baie Verte and the Jolicure lakes

**RMS 106.18 m exceeds 100 m; regional limitations remain.** 5 physical controls define the frozen affine; 3 excluded checks give median 84.69 m, empirical P95 153.78 m, maximum 161.45 m. Bias: -33.93 m east, +74.44 m north. Distances are WGS84 geodesic ground metres. The active fit was frozen before its reported check scoring.

Original 5274 × 3625, 140 ppi JPEG extracted from https://novascotia.ca/natr/land/indexmaps/058.pdf. All source coordinates remain in the original frame. The separately accessible complete scan retains marginal attribution and warning.

Complete original mapped frame retains the New Brunswick context and Midgic station, Large/Big Jolicure, Long and Front/Jolicure lakes, all other mapped NB ponds, Tantramar and La Coupe river context, the provincial boundary and Baie Verte Road, Hackmatack Lake Sanctuary context, Tidnish Head, Tidnish Bridge, Tidnish, Baie Verte, the complete largely blank northern area and the original grant-reference table. No displaced inset identified.

Five physical controls define the unchanged first affine fit; three checks were reserved before fitting. Front Lake extrema and Tidnish Head source location were refined before scoring. Q01 at the Large Lake northeastern outlet and Q04 at the small northern lake southwestern changed lobe were rejected before the first fit; every raw proposal remains preserved.

New Brunswick lakes use the official [New Brunswick Hydrographic Network](https://geonb.snb.ca/arcgis/rest/services/GeoNB_DNR_NBHN/MapServer/13). Nova Scotia reference uses NSTDB. Exact NB polygon rings were converted to line geometry without resampling, retaining source IDs, names and attributes. One Ocean polygon was omitted from combined review lines because its outer ring includes administrative closure edges; original data and its exact-ring conversion remain preserved.

Initial west-only neighbor spacing produced the wrong discovery window. Named NBHN Jolicure lake geometry established a revised coarse translation before any point selection, fit or check score. Both guide/reference attempts remain preserved; discovery alignment is not a control observation.

Limitations:

- Three excluded checks give RMS 106.18 m, exceeding the 100 m ceiling. Median 84.69 m also exceeds 75 m, and P95 153.78 m exceeds 150 m. Maximum is 161.45 m. The unchanged first results remain recorded.
- All three checks reuse NB lake systems with controls; this is a small highly correlated sample. Only four NB lakes and one Nova Scotia headland control the fit.
- Tidnish Head has no separate Nova Scotia check. Nova Scotia accuracy, northern blank administrative context, intervening areas and Baie Verte remain unvalidated.
- Historical NB lake shapes are strongly generalized, with changed shore/outlet configurations. Source observations use 18 px working uncertainty. NBHN reports 5 m planimetric accuracy; 20 m working modern uncertainty was retained.

The actual private raster is 6218 × 5386. Output alpha passes the independent polygon comparison with zero missing/excess cells outside the one-output-cell edge tolerance. Browser verification is recorded separately when completed. This is geographic research imagery, with no public scan upload or production activation.

Source/reference/fit/raster hashes, all proposal packets and rejected matches are retained. Raw imagery, paired native crosshairs and vector extracts remain in `.crown-grant-local/`. Canonical fit/check files identify adopted points; raw proposals are not additional controls or checks.
