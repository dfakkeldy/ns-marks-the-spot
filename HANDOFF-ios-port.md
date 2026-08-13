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

## 2026-08-13 — Phase 0 green and verified in the simulator

Done: 113 unit tests / 19 suites and 9 UI tests pass on iPhone 17. Swift 6
surfaced four isolation classes (commit d4404f3): nonisolated annotation
bridging, async `loadTile(at:)` replacing the closure form the 6.0
region-isolation checker cannot analyze, a lock-guarded POIFetcher stub, and
`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` on the unit target only (the UI
target keeps the default because XCTestCase overrides are nonisolated).
Simulator run confirms launch + POI fetch, layers panel, base-map picker,
opacity slider, layer toggle, POI/info/offline sheets, and bounds-drag →
save-area draft. Offline sheet shows Fletcher/NS Aerial tiles cached under
unchanged cache keys.
Next: PR to `nightly`, then Phase 0 spikes on throwaway branches (GeoTIFF IFD
reader, MKMultiPolygon scale, TPS warp tile, CGPDF /VP walk, Mac smoke).
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/map-portfolio-improvements-fa1f45,
branch claude/ios-web-map-parity-a66e38 (pushed, PR open to nightly).
Next action: start Phase 0 spike 1 — GeoTIFF IFD tag reader vs repo fixtures —
on a throwaway branch off nightly.
```
