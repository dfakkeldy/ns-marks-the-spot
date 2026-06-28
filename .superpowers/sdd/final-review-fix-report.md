## 2026-06-28 07:16:46 ADT - Final Review Fixes

Base: dd962dde8
Branch: codex/v1-release-roadmap

### Fixed Findings

- Critical 1: Added first-run saved-area downloads through `OfflineAreasViewModel.downloadArea(_:)`, sharing the same download implementation as retry. Newly saved non-complete/non-downloading areas now show `Download Fletcher Tiles`; retries remain available when failures exist. Download state is persisted through downloading and final complete/partial/failed outcomes.
- Important 2: Added `SavedOfflineAreaRepository`, a small Codable JSON file repository. `OfflineAreasViewModel` now loads saved areas deterministically and persists save, download state, retry results, delete, and storage-change updates.
- Important 3: Made catalog-backed `MapKitTileLayer(descriptor:)` use `LayerDescriptor.cacheKey` as the canonical cache identifier while preserving hashed identifiers for ad-hoc layer initializers. Regression tests cover Fletcher viewed-cache reuse through the real descriptor initializer.
- Important 4: Added bundled `ProvinceRestrictedGeographicServicesLicense.md`, catalog metadata pointing at that bundled license reference, an info-sheet `Link` when resolved, and tests proving Province layers have a license URL or bundled reference.
- Minor 5: Relabeled the fixed storage-sheet flow to `Save Sample Halifax Area` so it is not confused with the real map rectangle selection path.

### Verification

- PASS: `git diff --check`
- PASS: `xcodebuild test -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:ns-marks-the-spotTests/OfflineAreasViewModelTests -only-testing:ns-marks-the-spotTests/TileDownloadManagerTests -only-testing:ns-marks-the-spotTests/AttributionTests -only-testing:ns-marks-the-spotTests/LayerInstallationTests CODE_SIGNING_ALLOWED=NO`
- PASS: `xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO`
- ATTEMPTED: `xcodebuild test -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`. Unit suites and visible UI tests passed in the log, but Xcode hung during simulator/test-session finalization and was terminated with SIGTERM. The final command result is `BUILD INTERRUPTED`.

### Notes

- v1.0 saved-area downloads remain Fletcher-only.
- SwiftUI continues to avoid MapKit imports.
- No third-party frameworks or secrets were added.
