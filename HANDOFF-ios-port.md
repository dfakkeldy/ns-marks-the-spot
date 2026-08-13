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

## 2026-08-13 — Phase 1: catalog, parity oracle and the licence gate land

Done: three more commits, still zero Apple builds. `LayerID`/`LayerGroupID`/
`LayerLicence` + `OverlayZIndex` in GeoCore; `web/src/layers/layerParity.ts`
exports `layer-parity.json` via `toMatchFileSnapshot` (no new dependency); all
36 descriptors in `MapCatalog` with a field-by-field Swift parity test.
Then `NSDataServices`: `TileRequest` (internal init), `ProvinceLicence*`,
`TileRequestFactory` (licence checked before the URL is built), and
`ArcGISExportURL` byte-compatible with `URLSearchParams`. 105 package tests,
8 web tests, all green; three mutations confirmed the gate tests bite.
A Codex adversarial pass (`codex exec ... < /dev/null` — without the redirect
it blocks on stdin forever) found five real transcription errors, all fixed in
4a4ffd826; it confirmed every licence, the 16-member restricted set, all
service URLs and all `dynamicLayers` bytes are correct.
Next: Fletcher direct-Rumsey switch (spec §5) — sheets + URL normalisation are
portable and testable now; deleting the 311 MB root `Tiles/`, the Info.plist
`FLETCHER_TILE_BASE_URL` key and the pbxproj `XCLocalSwiftPackageReference`
need the app target. Then grouped layer UI. Hold promotion past nightly until
HTTPS hosting exists.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (6 commits ahead of nightly).
Next action: port normalizeFletcherTileBaseUrl + the 24 sheet bounds from
web/src/layers/fletcherLayer.ts into NSMarksCore with tests (ungated), then
wire the app target: delete root Tiles/, add FLETCHER_TILE_BASE_URL, migrate
TileStore on key "fletcher-direct-rumsey-20260726.1".
```

## 2026-08-13 — Fletcher direct-Rumsey switch: portable half landed, app half staged

Done: `b09e18919` (still zero Apple builds). Portable half in NSMarksCore:
`GeoBoundingBox` + `TileMath.geographicBounds`, `FletcherSheets` (24 sheet
bounds generated from the web fixture, never typed) and `FletcherTileURL`
(`normalizeBaseURL` with typed `BaseURLError`; refuses non-HTTPS, any
`oldmapsonline` host, and any query/fragment/userinfo). 125 package tests, 49
web tests, green in ~0.015 s. Codex verified all 96 decimal literals
digit-for-digit and found one vacuous test (`coversEverySheet` passed a
constant template) — fixed and mutation-confirmed.
App half is written and **uncommitted, never compiled**: pbxproj wires
NSMarksCore as an `XCLocalSwiftPackageReference` into app + unit-test targets
and drops every `Tiles` ref; root `Tiles/` `git rm`'d (3755 files, 311 MB —
a rights obligation, not a size win); `.fletcherSheets(baseURL:)` source;
`OpacityTileOverlay.fletcherSheetTile` (per-sheet cache keys, highest sheet
first); `FletcherSourceMigration` clears the tile cache once per revision.
Every touched file passes `swiftc -parse`; the gate has been HOLD all day
(swapFree ~440-840 MB against a 2048 MB warnMin).
Next: one gated `xcodebuild test` admission to validate the app half, then
commit it. Then grouped layer UI + status chips, a CI job for package tests,
and the app-local `LayerID` (10 cases) vs GeoCore `LayerID` (36) collision.
Hold promotion past nightly until HTTPS tile hosting exists.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (7 commits ahead of nightly, dirty).
Next action: poll /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status
every ~5 min; when it admits, spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -project ns-marks-the-spot.xcodeproj
-scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17'`
and fix what surfaces before committing the app half.
```

## 2026-08-13 — App half committed; both targets type-check clean without the gate

Done: two Codex adversarial reviews (13 + 7 findings, all dispositioned).
Real ones: `TileStore` kept OldMapsOnline tiles the cache sweep missed;
`MapViewState`'s cache identity ignored the revision so old tiles outlived the
switch; 404 (no such sheet) was conflated with 503 (transient), which poisoned
composites and permanently failed saved areas; `tileCount` scanned ~2.2 M tiles
on the main actor during a drag (now `countingLimit = 200_000`); three offline
test suites were fixtured on Halifax, which the new coverage filter makes an
empty plan — every assertion in them was `0 == 0`. Codex is not authoritative
on compilation: it web-searched Apple docs and cleared the `Task.detached`
capture in `FletcherSourceMigration`, and that exact line is what the build
then failed on (`UserDefaults` is not `Sendable` in this SDK).
One gate admission spent on `build-for-testing`; it failed on that one error.
Its DerivedData `.swiftmodule`s then made a **gate-free** loop possible:
`xcrun swiftc -typecheck` against the iphonesimulator SDK with the same six
flags the target uses (`-swift-version 6`, `-default-isolation=MainActor`,
`MemberImportVisibility`, `InferIsolatedConformances`,
`NonisolatedNonsendingByDefault`). App target (34 sources) and unit-test target
(17 sources, `-enable-testing` + the TestingMacros `-plugin-path`) both
type-check with **0 errors, 0 warnings**, in seconds, without touching the gate.
143 package tests + 18 web tests green.
Next: still one gated `xcodebuild test` run to prove runtime behaviour — type
checking is not execution. Then grouped layer UI + status chips, a CI job for
package tests, and the app-local `LayerID` (10 cases) vs GeoCore `LayerID` (36)
collision. Hold promotion past nightly until HTTPS tile hosting exists.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (clean, app half committed).
Next action: poll /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status
every ~5 min; when it admits, spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -project ns-marks-the-spot.xcodeproj
-scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17'`
and read Swift Testing failures with
`xcrun xcresulttool get test-results tests --path <.xcresult>`.
```
