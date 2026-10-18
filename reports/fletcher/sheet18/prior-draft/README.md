# Fletcher Sheet 18 — exploratory manual draft

Status: **not accepted for production**. This attempt does not establish a correction for the mountainous interior or an improvement over the currently published layer.

The NSMtS web map was used to select and refine four correspondences against NS Marks Atlas / OpenStreetMap: the hooked eastern peninsula of Big Harbour Island, the northern headland beside Black Pond on the southern shore, Calder Island’s northern tip, and the narrow River Denys estuary crossing. The result is an affine transform, not a curved warp.

The browser reports approximately 17 m control RMS. A separately observed Crane Island northern-tip checkpoint is approximately **67 m** from the four-control fit. It was temporarily entered to measure its coordinates, then removed from the fit. The check was not used to select or tune a transform. One island check cannot establish sheet-wide accuracy.

Mountain streams visibly diverge in places even where the estuary shoreline agrees. A candidate round feature near the mountain lakes was rejected because its shape and drainage could not be confidently reconciled. No inland correspondence was invented to force a warp. The northern and western margins remain unvalidated.

## Files and precision

- `sheet18-rumsey-half-resolution.jpg`: Rumsey image requested at 5416 × 3842 pixels. These are the pixel dimensions the CSV uses.
- `manifest.json`: Rumsey IIIF metadata, original canvas 10832 × 7683.
- `sheet18-draft-rounded-controls-and-check.csv`: four controls and one separate check. Import it with **Load a Fletcher points file**, using the supplied JPEG only.
- `draft-validation.json`: affine calculation and errors from the CSV; control RMS 16.2 m, check 67.2 m.

The CSV is transcribed from the rendered table (integer pixels, four decimal places for latitude/longitude). It is **not an exact session export**. Browser export was attempted but no retrievable download or browser download event was obtained. The original four placements remain in the live browser’s local map named `sheet18-rumsey-half-resolution`; the fifth measurement was removed. Reopening **My Maps → Adjust points** accesses that session. The retained browser view shows the Crane Island discrepancy at 45% opacity.

No product code, production tiles, user hand-referenced sheets, repository branches, or deployment pins were changed. Browser display scaling and map inertia caused placement attempts to land incorrectly; those candidates were cancelled or removed. Returning to native browser sizing made the final checkpoint refinement reliable. No application-console warnings or errors were reported in the inspected log sample.

## Source and attribution

[David Rumsey IIIF manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2643~290011/manifest)

David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. Imagery is separate from the repository’s MIT software licence. [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); this draft identifies the project’s resizing and georeferencing changes. Modern reference: NS Marks Atlas, OpenFreeMap, OpenMapTiles, and © OpenStreetMap contributors. This is historical research context, not survey or access evidence.
