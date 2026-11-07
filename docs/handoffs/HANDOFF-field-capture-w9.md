# Handoff — field-capture W9 (KMZ interchange + bulk EXIF placement)

## 2026-08-30 — W9 implemented, verified, PR open

Done: KMZ profile pinned in captureSpec (fixture regenerated); kmz export
(buildKmzBlob: doc.kml DEFLATE + stored jpgs, missing-blob drop with honest
count); import re-link (relinkKmzPhotos: re-minted ids, distinct
missing/undecodable/capped counts, img-appendix strip; gate on references,
not archive size); bulk EXIF placement (bulkPlacement + BulkPhotoImportDialog
+ createPhotoLayer, "photos" source, photo-import origin/provenance); honest
GeoJSON/KML titles + KMZ + "Add photos to map" buttons. Gates: 1794 tests,
lint, build. Browser-verified: real KMZ import→re-link→export round trip,
exifr GPS classification, layer-removal photo sweep.
Next: after merge — iOS mirror N1 (recording core + parity fixture Swift test)
per docs/field-capture-design.md; builds via xcode-build-slot.sh.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7,
branch feature/web-field-capture-w9. W9 PR open to nightly; watch CI, then
start iOS N1 per docs/field-capture-design.md.
```
