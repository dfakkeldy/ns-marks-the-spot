# Central and northern expansion of the frozen south validation

Two fresh checks extend the same unchanged affine4 batch. **Sheas Brook / Mull River misses by 353.94 m**, compared with 524.91 m on the preserved accepted-baseline TPS. **First Lake O’Law misses by 400.94 m**, versus 472.52 m. The new pair's RMS is 378.17 m; the full seven-check batch is 318.68 m and fails the 250 m working target. Both new points are outside the retained control hull. No tuning, promotion or new fitting comparison followed these results.

The new pair's median is 377.44 m, linear empirical P95 398.59 m and maximum 400.94 m. Mean residual is +200.88 m east / −146.94 m north, with 284.73 m RMS scatter about that mean. Directions are warped minus reference and distances use the same ground-metre convention as the original five. The pair spans two areas rather than providing a dense regional assessment. The original first-five observations, first scores, CSV prefix and summary snapshot remain unchanged, checked against nightly ancestry commit `a1d362790e69f7379ecbd89b0692eee033c5dae9`.

## IS25: a water junction, not the naming boundary or road fork

The source traces the eastern branch labelled East Mabou River through Brook Village and west under the road toward the tannery. It reaches a distinct water confluence north of A. McKillop's label. The southern trunk continues northwest toward Hillsboro/Mabou. The native source point is **(20900, 15333.333333333334)**; the nearby road fork lies farther east and is not the observation.

Modern Sheas Brook WARV50 278944 v51 meets the Mull River east bank at **(-61.32039452992194, 46.04085693758985)**, shared with WARV10 158574 v0 and 158575 v96. Initial name-transition coordinates were nearby but different and were not adopted. The recorded 150 m uncertainty includes the generalized source confluence and single-line/bank representation. Historical and modern branch labels are attributed as found; this does not claim a documented renaming.

The first affine residual is +338.89 m east / +102.11 m north. The actual-raster window reproduces that displacement and preserves the adjacent meanders and road context. Original observation and native/reference crosshairs are in `../observations/IS25*`; its first score is `../IS25-first.json`.

## IS26: First Lake O’Law

Native enlargement separates the long lake outline from the heavy road on its west side, labels and hill hatching. The narrow northern end, western indentations, wider southern end and connection toward the lower lakes identify the first basin. The whole outer-shore centroid is **(31053.150074553054, 5840.762442816725)** in the original scan. Its reference is the outer-shore area centroid of original WALK20 126034–126038. All **439 exterior edges** belong to those original lines; streams attached at endpoints are not incorporated in the polygon.

Both centroids use translated shoelace arithmetic checked against Shapely. The enlarged crop carries an explicit frame derived from `IS4-olaw-native.jpg`; lettering and short ink gaps are reflected in the 180 m uncertainty. The first affine residual is +62.88 m east / −395.98 m north. This is a basin-position check, not a claim of complete shoreline agreement or a centroid of the whole lake chain. The original source point, outline and reference ring are in `../observations/IS26.json`.

## Withheld searches

`withheld.json` preserves five unresolved cases: St. Rose Pond, Arsenaults Pond, MacLellans Pond, separate lower Lake O’Law bodies, and the Ryan Brook / Lake O’Law Brook confluence. Their source contexts remain here. The Ryan reference junction is known, but native road/channel ink does not support a precise source point. The other pond/body correspondences were not established. No scores, invented source coordinates or historical-absence claims were assigned to these cases.

## Raster, terrain and preservation

The retained GeoTIFF is unchanged. Two new actual-raster windows were rendered in this folder; the original five figures and their receipt were not regenerated. Both new inspected positions have nonzero alpha. Earlier full-content coverage and affine diagnostics still refer to the identical raster bytes, not a new geographic acceptance.

The real web map was reviewed in 2D and at 10× terrain with 50° tilt. At Lake O’Law the exaggerated slopes obscure the bottom, so a 0° tilt view was also inspected. These views clarify terrain context and do not supply measurement coordinates. The same imported south raster remains the sole active user raster at 70% opacity; no new import or raw-scan mesh claim is made. Browser screenshots and DOM receipts are in `browser-review.json`, with large captures stored locally.

`previous-published.json` and the shared verifier protect the first-five evidence. The shared parser probe now verifies three inventories: retained controls, all seven fresh checks, and this new pair. Reference provenance distinguishes the earlier regional extract from the western extract; no new NSTDB geometry was fetched or simplified for these two checks. Original query receipts remain attached.

Verification passed: 428 Church unit tests, 24 metric replays, three derived crop frames and three original lake exteriors. The production parser/affine probe passed for all three inventories, with GDAL differences below 0.001 projected metre. The browser returned no captured console errors.

Coverage is still insufficient for whole-panel accuracy or the 20–30 distributed-check ambition. Continue the frozen batch into other northern, eastern and intervening areas and evaluate seams separately. No accepted July baseline replacement, catalog activation, tiles or deployment occurred. Source-derived imagery retains David Rumsey Map Collection / Stanford Libraries credit and the recorded CC BY-NC-SA 3.0 terms.
