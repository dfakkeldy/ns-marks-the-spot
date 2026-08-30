# Handoff — field capture N3 (snapping, photo map, bulk placement)

## 2026-08-30 — N3 implemented; stacked on `feature/ios-field-capture-n2`

N1 #281 merged to nightly. N2 #283 open, CI green at handoff time.

Verified: NSMarksCore `swift test` 651/651. Focused app suites on iPhone 17
(`FieldCapturePhotoTests` 6, `FieldCaptureStoreTests` 4, `FieldCaptureSnapTests`
1, `UserVectorEditingTests` 9) all passed. Live sim: My Maps heading counts the
catalogue-free photo-map row (`3 added` = photo-map + existing user layers).
The photo-map row itself sits below the layer-panel fold on this viewport; HID
scroll did not move that SwiftUI `ScrollView`, so granted/limited/denied and
parcel-snap haptics were not exercised live in this pass.

Done:

- GeoCore `SnapEngine` (`ownFeature | parcel` only, vertex-first, unreadable
  rings contribute nothing), `Geodesy.localMetricProjection` /
  `nearestPointOnSegment`, `BulkPhotoPlacement` (in-view default-checked,
  out-of-view checkable, untagged unselectable), `PhotoMapIndex` (z15 buckets,
  500-annotation cap with truncated note).
- NSDataServices envelope query licence-gated before URL assembly;
  `ParcelFetcher.parcels(in:)` fail-closed on `exceededTransferLimit` or >600
  (`tooManyParcels`), honest empty is a successful empty collection.
- App snapping: session-scoped toggles, 15 pt tolerance, haptic on snap,
  `nsmts:traced` / `nsmts:createdAt` stamped at event time, standing caveat,
  zoom / licence / dense / load-error / honest-empty notes. Clearance is
  read from the licence store, never fabricated.
- Photo map: PhotoKit full enumeration, `Caches/PhotoMapIndex/index.json` +
  change token, later launches apply `fetchPersistentChanges`. My Maps row
  (`.myMaps` slot, LayerCatalog untouched). MapKit clustering + 500 cap.
  Subtitle: `Your photos · never uploaded`.
- Bulk placement: PhotosPicker → classify → confirm sheet → `source: photos`
  layer, provenance `From your photos · N photos`. Library version 3 so older
  builds refuse cleanly.
- `ParcelLookupMessage` names `tooManyParcels` distinctly (not “no parcel”).

Resume (PR / CI):

```
Worktree: /Users/dfakkeldy/.t3/worktrees/ns-marks-the-spot/t3code-eaf0bbfa
Branch: feature/ios-field-capture-n3
Stacked PR onto feature/ios-field-capture-n2 (or nightly if #283 has merged).
Do not regenerate field-capture-parity.json from Swift.
```
