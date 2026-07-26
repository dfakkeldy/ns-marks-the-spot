## Task 11 Report

### Scope completed

- Created `InfoSheetView` as a sheet-ready SwiftUI surface with a visible `Data Sources & Licenses` section.
- Added a lightweight info button to `MapContainerView` so the licensing UI is reachable from the existing map controls without changing the map-first layout.
- Listed Fletcher and all province-backed layers from `LayerCatalog.all`, including provider, optional copyright, optional license title, disclaimer text, and per-layer caveats.
- Added the required not-navigation-grade messaging plus the v1.0 offline availability note that only Fletcher tiles are downloadable for saved areas.
- Added focused attribution regression coverage in `ns-marks-the-spotTests/Layers/AttributionTests.swift`.

### Implementation notes

- `InfoSheetView` keeps SwiftUI free of `MapKit` imports and relies entirely on `LayerCatalog` metadata that already exists in the shared layer model.
- The sheet uses a small `NavigationStack` wrapper with a `Done` action so it behaves like a self-contained modal from the map surface.
- Province rows intentionally show `licenseTitle` but no license link because `licenseURL` is `nil` in the catalog and this task should not invent one.
- The exact province attribution string is rendered from `LayerCatalog` metadata rather than duplicated in a second source of truth.
- The new info control cancels any in-progress save-area selection before presenting the sheet, matching the existing safeguards around other modal flows.

### Verification

1. Ran the focused attribution tests:
   - `xcodebuild test -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:ns-marks-the-spotTests/AttributionTests CODE_SIGNING_ALLOWED=NO`
   - Result: passed.
2. Ran whitespace and patch validation:
   - `git diff --check`
   - Result: passed.
3. Ran app build:
   - `xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO`
   - Result: passed.

### Notes

- This report file did not exist in the worktree when Task 11 started, so it was created before appending the implementation record.
- Existing warnings remain for the app icon SVG asset filenames and for skipped App Intents metadata extraction because `AppIntents.framework` is not linked.
