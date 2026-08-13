# Handoff — iOS web-map parity port

## 2026-08-12 — Phase 0 mainline code complete, unbuilt

Done: 5 commits on `claude/ios-web-map-parity-a66e38` (e88ffb4..43ecae0):
MapEngine→MapSurface collapse, dead-code removal, @Observable +
NavigationModel/SheetRoute, Swift 6 flip with isolation fixes,
ARCHITECTURE.md rewrite. Nothing compiled yet — the single Apple build slot
was owned by other sessions (Echo, then Burly) all evening.
Next: slot-wrapped `xcodebuild test` (unit then UI bundles), fix what
surfaces (watch: @Observable on NSObject subclass, @Sendable loadTile
override, UIGraphicsImageRenderer off-main under Swift 6), simulator check,
push, PR to `nightly`.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/map-portfolio-improvements-fa1f45,
branch claude/ios-web-map-parity-a66e38. Run via xcode-build-slot.sh:
xcodebuild test -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot
-destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:ns-marks-the-spotTests
CODE_SIGNING_ALLOWED=NO, fix failures, then UI tests, then PR to nightly.
```
