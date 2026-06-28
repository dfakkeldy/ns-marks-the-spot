## Task 9 - 2026-06-28

Summary:
- Added a fixed-bounds Save Area draft screen inside the Offline Maps sheet.
- Wired the estimate action to `estimateDraft(...)` and persisted the estimated draft with `saveDraft(...)` so it appears in Saved Areas.
- Added a focused UI test for the Offline Maps -> Save Area entry point.

Files changed:
- `ns-marks-the-spot/Offline/Views/SaveAreaDraftView.swift`
- `ns-marks-the-spot/Offline/Views/OfflineStorageView.swift`
- `ns-marks-the-spotUITests/OfflineFlowUITests.swift`
- `.superpowers/sdd/task-9-report.md`

Commands and outcomes:
- `git diff --check`
  - Passed with no whitespace or patch format issues.
- `xcodebuild test -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:ns-marks-the-spotUITests/OfflineFlowUITests CODE_SIGNING_ALLOWED=NO`
  - Build succeeded, but simulator test launch wedged and ended with `NSMachErrorDomain Code=-308` after the simulator launcher died.
- `xcodebuild build-for-testing -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
  - Passed with `** TEST BUILD SUCCEEDED **`.

Concerns:
- The draft screen intentionally uses the fixed Halifax-area rectangle from the task brief; map-based selection and download-start controls remain for Task 10.
- The requested UI test did not complete in this environment because the simulator launcher died during test start; the fallback build-for-testing path verified the new UI test target compiles cleanly.

## Task 9 - 2026-06-28 follow-up

Fix:
- Changed `SaveAreaDraftView` so `Estimate Fletcher Tiles` only generates a local preview draft.
- Added an explicit `Save Area` confirmation button that persists the draft only after an estimate exists.

Verification status:
- `git diff --check`
  - Passed with no whitespace or patch format issues.
- `xcodebuild build-for-testing -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
  - Passed with `** TEST BUILD SUCCEEDED **`.
- `xcodebuild test -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:ns-marks-the-spotUITests/OfflineFlowUITests CODE_SIGNING_ALLOWED=NO`
  - Build completed, but simulator launch still failed/interrupted with `FBSOpenApplicationServiceErrorDomain Code=1` / `SBMainWorkspace` denial after about 110 seconds.
