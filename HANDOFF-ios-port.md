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

## 2026-08-13 — Phase 0 spikes 1, 3, 4: mac-native legs done; device legs blocked

Done: spikes 1 (GeoTIFF tags), 3 (TPS warp cost) and 4 (CGPDF GeoPDF) complete
and written up in `docs/spikes/`. Reader is 282 LOC / 15 tests; CGPDF needs no
PDF dependency; warp cost tracks minification, not source size, so a per-zoom
scale-matched mip drops an 8192px source from 1310 to 2.8 ms/tile — this
retires the plan's "cap sources at 4096 px" performance constraint and composes
with spike 1's thumbnail path. Spike code on `spike/geotiff-ifd-reader`
(83a17a0, pushed); writeups on this branch (387636f).
Next: spike 1's iOS leg, spike 2, spike 3's device leg, spike 5 — all need
Xcode. Blocked on host memory, not slot contention: the slot reports FREE while
the gate holds at pressure 2 with 1.27 GB free swap against a 2 GB floor.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/map-portfolio-improvements-fa1f45,
branch claude/ios-web-map-parity-a66e38.
Next action: check `~/.claude/bin/xcode-build-slot.sh --status`; when the gate
admits, run the iOS ImageIO tiled-TIFF test on the spike branch and replace the
"Pending" block in docs/spikes/ios-port-spike-1-geotiff-tags.md.
```

## 2026-08-13 — Spike 1 closed: iOS confirms the tiled+compressed ImageIO hole

Done: iPhone 17 simulator (iOS 26.5) reproduces the macOS result exactly —
tiled+DEFLATE gives properties=nil and image=nil, striped+DEFLATE control
passes. Spike 1 is complete; the fail-closed + hand-rolled DEFLATE/LZW
recommendation is no longer contingent. Spikes 1, 3 and 4 all written up.
Next: spikes 2 (MKMultiPolygon paging), 3's device leg, 5 (Designed-for-iPad).
Pre-flight every queued Swift file with `xcrun swiftc -parse` first: a syntax
error cost a two-hour gate wait on this one.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/map-portfolio-improvements-fa1f45,
branch claude/ios-web-map-parity-a66e38.
Next action: write Phase 0 spike 2 (10x2k-parcel MKMultiPolygon paging, z>=15
restyle, tap hit-test) on the spike branch, parse-check it, then queue it
through xcode-build-slot.sh.
```

## 2026-08-13 — Phase 1 opened; NSMarksCore lands, logic tests leave the build gate

Done: worktree moved to `ios-web-map-parity-2de228` on
`claude/ios-web-map-parity-2de228`, reset onto `nightly` (5a677c8) — the old
worktree's branch merged as PR #216, verified as a real merge, spike docs
included. Key finding: the RAM-gate hook only intercepts
`xcodebuild`/`fastlane`/`make`, so `swift test` over a pure SPM package is
ungated. Four commits: NSMarksCore package + GeoCore geodesy (12 tests),
point-in-polygon with holes (10), Web Mercator + slippy tile maths (10, with a
cross-check tying the two ported halves together), and the web-side
`exportSharedData.mjs` + repo-root `SharedData/` with a SHA-256 manifest
(12 node tests; wired into `npm run test:scripts`). All 32 package tests and
24 web script tests green. Zero Apple builds consumed.
Next: layer-catalog parity, licence gate, Fletcher direct-Rumsey switch — a
6-agent parity extraction over the web sources is synthesising the spec.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (4 commits ahead of nightly, unpushed).
Next action: implement Phase 1 layer catalog + licence gate from the parity
spec; keep pure logic in NSMarksCore (`swift test`, ungated) and let only the
app-target wiring wait on xcode-build-slot.sh.
```
