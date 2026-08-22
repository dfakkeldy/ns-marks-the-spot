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

## 2026-08-13 — shared catalog + Province licence gate committed

Done: `b60b2d53e` deletes the app-local `LayerCatalog`/`LayerDescriptor`
and reads `MapCatalog` directly; `NativeLayerTraits` keeps only the
MapKit-specific facts (install order = z-order, offline policy, basemap
capability). Restricted Province layers now sit behind an acceptance
sheet, gated *before* the tile cache, with `LicenceClearanceBox` carrying
the answer to MapKit's background queues and `withObservationTracking`
mirroring the store into it. Codex adversarial review returned 5
findings; all 5 fixed (the sharpest: `setBaseMapType(.nsAerial)`
bypassed the gate entirely). App + unit-test targets both type-check
clean gate-free; 143 package tests green.
Next: the gated `xcodebuild test` run — type checking is not execution.
Then Phase 1's last item, the grouped collapsible layer panel with the
web's status vocabulary from `web/src/components/LayerRows.tsx`
(Off / Ready to load / Loading visible area… / Ready · N loaded /
Zoom to N+ to load / Source temporarily unavailable), grouped by
`GeoCore.LayerGroupID`.
Still owed beyond Phase 1: a CI job for the package tests, and a
Province-licence revoke control **with a cache sweep beside it** —
`OpacityTileOverlay` documents that debt at its pre-cache gate.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (clean, pushed).
Next action: poll /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status
every ~5 min; when admitted spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
(unit bundle only + no concurrency: the UI bundle hangs on debugger
attach and four clones exhaust memory). Read Swift Testing failures with
`xcrun xcresulttool get test-results tests --path <.xcresult>`.
```

## 2026-08-13 — Grouped layer panel with per-layer runtime status

Done: `9c03a4f6b`. Panel is now collapsible sections in catalog order
(headings from `NativeLayerTraits.title(for:)`, empty groups dropped),
each visible layer carries a status chip in the web's vocabulary, and
every row gained a "Source & scale" disclosure (source date, scale,
coverage, zoom range, official-source link) — the native app previously
showed none of that. Backed by `LayerLoadProgressBox`, which MapKit's
tile queues report into through `OpacityTileOverlay.loadTile`.
Codex adversarial review ran against the staged diff; five of its six
findings were applied, the sixth was the ordering defect already fixed:
- notifications carry only the layer id, panel re-reads the phase
- requests carry a generation, so a fetch in flight across a hide/show
  cannot settle the new cycle (`removeLayer` resets too)
- `TileLoadOutcome.cancelled` — MapKit's pan-away cancellations are no
  longer reported as "Source temporarily unavailable"
- revoking now hides refused layers as part of mirroring the clearance
- `OpacityTileOverlayProgressTests` drives the real `loadTile` against a
  stubbed session, so deleting the reporting fails the suite
Verified by gate-free `swiftc -typecheck` (app + tests) only. **No
Apple build or test run has executed against any of this work yet.**
Next: the gate has held all day (outside preferred windows). At 22:00
spend one admission on the unit bundle, and use the same run to settle
whether MapKit fetches tiles for hidden alpha-0 overlays — 6 → 21
installed layers may mean ~3.5x the tile traffic the app draws.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (clean, pushed).
Next action: poll /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status
every ~5 min; when admitted spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
(unit bundle only + no concurrency: the UI bundle hangs on debugger
attach and four clones exhaust memory). Read Swift Testing failures with
`xcrun xcresulttool get test-results tests --path <.xcresult>`.
```

## 2026-08-13 — Phase 2 parcels: identify by tap and by PID
Done: `feat(ios): find a parcel by tapping the map or typing its PID`
(ee1545998) — ParcelShape/ParcelPolygon drawing in the web's colours,
ParcelSelection (dedupes on PID+geometry), ParcelLookupMessage (the
web's strings; only a successful empty collection may say "no parcel"),
identify tap gated on layer-visible + zoom ≥ nsprd minZoom, search bar.
Plus `test(ios): key network stubs per test, not per host` (6f0ca5b0c):
both parcel suites shared one host key and clobbered each other under
Swift Testing's parallelism — they take per-test channels now.
20 new app tests (ParcelSelectionTests 9, ParcelIdentifyTests 11+3
parameterised). Package tests 164/164 gate-free. **Still no Apple build
or test run against any of this.**
Next: same as the previous entry — one gate admission on the unit
bundle, and settle the hidden alpha-0 overlay tile-fetch question with
it. Civic-address search stays unported (said in words, not faked).
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: poll `/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status`
every ~5 min; on admission run ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Civic-address search, and the transport seam under it
Done: three commits. `refactor(core): move parcel fetchers into the
package behind a transport` (e1e478fae) — `HTTPTransport` is a Sendable
struct wrapping `(URLRequest) async throws -> (Data, URLResponse)`, so
fetchers live in NSMarksCore and their tests run gate-free.
`feat(core): look up civic addresses from the Province's open data`
(775c402dd) — CivicAddressQuery/Response/Fetcher, a port of the web's
`civicAddresses.ts`; Socrata `tntn-er5g`, Open Government Licence, no
clearance (the confinement test says why in words and now also checks
mechanically that anything reading a service address from the catalog
takes a clearance). `feat(app): search civic addresses from the parcel
field` (71edee8e9) — the field stops saying "not in the app yet";
`ParcelSearchInput.classify` reads PID vs address vs too-short in the
package. Then `fix(app): keep the search field and its lookups in step`
(474eb6fce) — seven defects Codex found: unidentified boundaries
reported as "no parcel", first-of-several presented as an
identification, stale results surviving a keystroke, an invalid
submission not cancelling the parcel lookup, isSearchingAddresses stuck
true, the chosen address replaced by its PID, an all-unreadable page
reported as no-such-address. Plus the OGL-NS attribution the licence
requires. Package tests 252/252 gate-free; app + test targets typecheck
via the scratchpad scripts (run them with **zsh**, not bash).
Next: unchanged and now overdue — one gate admission on the unit bundle.
Then Phase 3's inspector UI.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: poll `/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status`
every ~5 min; on admission run ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 3 parcel inspector landed and reviewed

Done: the panel is built and reachable. `PlaceLinks` (Plus Code +
Google directions, ported from `googleMaps.ts`) and `ParcelRoads` (the
`MappedContextDetails` two-source merge) in the package (eced94ab2);
`ParcelInspection` + `ParcelInspectorView` + the `withTaskGroup` in
`refreshInspection`, presented as a bottom card in `MapContainerView`'s
`ZStack` — not a sheet, so the map stays visible under it (51d30335e).
Codex found seven more defects, all fixed in 0b900aa14: an unanswered
civic source credited in the road list's empty message; a licence
revocation that left the parcel, its panel and its NSTDB evidence on
screen; `plusCode` trapping on a finite-but-absurd coordinate;
`jsNumber` misformatting degrees near zero; the card covering the
layers button on a 667pt phone; two wordings drifted from the web.
Plus-Code and number expectations come from running the web under node.
New test fixture `HeldTransport` holds a reply until released, so the
stale-answer test arranges a genuine overlap. Package tests 265/265
gate-free; app + test targets typecheck (scripts need **zsh**).

Next: still one gate admission on the unit bundle — nothing in the app
target has ever been *run*. The gate has been BUSY/HOLD all day with
other people's builds. Then Phase 3's remaining evidence services
(PVSC assessments and dwellings, buildings, resource intersections,
zoning, flood hazard, well logs, mineral proximity, hydro potential,
old-growth policy, evidence note).

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: poll `/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status`
every ~5 min; on admission run ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — PVSC assessments and dwellings landed, review applied

Done: `e79e166de` PVSC assessment accounts (spatial match against the
parcel's rings, notice-AAN path built but unreachable until tax sales);
`611ce82b2` PVSC residential dwellings, asked only after an account
matches, plus six of seven findings from a Codex adversarial review —
unreadable-row counts on both PVSC results, a notice for a parcel only
partly drawn, `PolygonHitTest.containment` so an edge point is labelled
rather than claimed, ASCII-only AAN digits, the PVSC licence link, and
the 9e15 year cutoff explained. Package tests 310/310 gate-free; app and
test targets typecheck (scripts need **zsh**). Both pushed.

Next: the gate has still never run the app-target unit bundle — BUSY/HOLD
all day. Then the rest of Phase 3: buildings, resource intersections,
zoning, flood hazard, well logs, mineral proximity, hydro potential,
old-growth policy, evidence note. `CivicAddressFetcher` has the same
unreadable-row hole the PVSC fetchers just closed.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: continue Phase 3 with the NSTDB buildings layer in the
inspector panel; on gate admission spend it on ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 3 evidence services complete

Done: `75ba0a887` NSTDB building counts; `989fc429a` resource and geology
intersections; `9b913f2fe` published river study areas plus the three
coastal scenarios, including a deliberate correction to the web — the
coastal bbox is now fitted to the integer pixel grid, because ArcGIS
silently widens a mismatched extent and `f=image` never says so, which
made every percentage off a tall parcel a measurement of the wrong
ground. Service Nova Scotia's permission, non-endorsement and warranty
notices now render with the coastal panel; they existed nowhere in the
native app before. Codex reviewed each landing. Package tests 355/355
gate-free; app and test targets typecheck (scripts need **zsh**).

Next: Phase 3's parcel-scoped evidence is done. `evidenceNote.ts` needs
share-state and belongs with Phase 5, and zoning / well logs / hydro
potential / old-growth / mineral proximity are viewport-scoped and belong
with Phase 6 — port `arcGISFeatureOverlay.ts` first as their shared
bounds-query seam. The gate has still never run the app-target unit
bundle.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: start Phase 6 by porting web/src/services/arcGISFeatureOverlay.ts
as the shared viewport bounds-query seam; on gate admission spend it on ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 6 fetch services all ported

Done: shared viewport seam + six layers landed and pushed — zoning, well
logs, mineral occurrences/abandoned mines, old-growth policy, mineral
proximity (derived, gated on the derived layer first), and the bundled
Inverness hydro pilot (920 KB resource, strict decode). Catalog parity
now defers only legend/guidance fields. 422 package tests, gate-free;
app + test targets typecheck. Codex reviewed each landing; its two real
findings are fixed in f521c9e90 (old-growth fails closed on an
unreadable row; mineral proximity reports unreadable counts instead of
an empty result).

Next: nothing in Phase 6 is wired into the map renderer or layer panel
yet — that is the remaining work. The gate has still never run the
app-target unit bundle.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: wire the six Phase 6 layers into MapSurface + the layer panel
(viewport-driven refresh, licence gate, per-layer status); on gate admission
spend it on ONE `xcode-build-slot.sh -- xcodebuild test
-only-testing:ns-marks-the-spotTests -disable-concurrent-testing
-scheme ns-marks-the-spot -destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 6 wired end to end

Done: viewport layers now draw, order against the rasters, and have panel
rows (860c3d3c8 + the wiring commit). Unreadable rows are counted rather
than dropped; degenerate geometry fails closed. Package suite 433 green;
both app targets typecheck (0 errors). The marker/overlay plane divergence
is documented in OverlayDrawOrder.swift.

Next: Codex adversarial review of the wiring, then Phase 4 (tax sales).
The gate has still never run the app-target unit bundle.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: start Phase 4 (tax sales); on gate admission spend it on ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 6 closed; first app-target test run

Done: Codex review of the wiring found six issues; all fixed in fca2c47f3
(stale-request guard on both paths, surveyed-only wells, hydro is bundled
so no zoom gate and it counts watersheds, no opacity slider on queried
layers, empty geometry unreadable). Package 435 green. First-ever
app-target run on an iPhone 17 sim: ViewportFeaturePanelTests +
OverlayDrawOrderTests, 28 tests, TEST SUCCEEDED.

Next: Phase 4 (tax sales). The whole-bundle app test run still hangs —
task #12 — boot the sim and run focused suites until that is fixed.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: start Phase 4 (tax sales). To run app tests: xcrun simctl boot
24FBD923-387E-4B7E-9063-FCF166239B1C, then ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests/<Suite>
-scheme ns-marks-the-spot -destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-14 — Phase 4 complete in source; no simulator run yet

Done: tax-sale notices (Stage B) and the historical record set (Stage C) are
both on the native map. Historical mode switcher in the layers panel, filter
panel + record list sheet, purple parcel styling, inspector historical section.
Two Codex reviews; all eight findings fixed. Package tests 463 green; both app
targets type-check. Commits 974da2a2a, 7c6969cc1, f2008a324, e67d3db23,
75adb9fe5.

Next: run the two app-target suites (TaxSalePanelTests,
HistoricalTaxSalePanelTests) — the build gate has been HOLD all session
(swapFree ~530MB, warnMin 2048), so nothing has run on a simulator. Then
Phase 5 (field tools, share links, GeoPDF hand-off).

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: xcrun simctl boot 24FBD923-387E-4B7E-9063-FCF166239B1C, then ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests/HistoricalTaxSalePanelTests
-scheme ns-marks-the-spot -destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-14 — Phase 5: share links and evidence-note export

Done: `MapShareState` + `EvidenceNote` in NSDataServices (package tests 480
green); `ParcelEvidenceExport`, share-sheet wiring, inspector field tools,
`restore(from:)`, `MapController.center(on:zoom:)` with a pending centre for
cold launch. One Codex review, eight findings, all fixed. Commits e1c0c4273,
bcf28ae19. Both app targets type-check.

Known limits: `.onOpenURL` cannot fire — no URL scheme, no associated-domains
entitlement, so shared https links open the browser. GeoPDF hand-off moved to
Phase 7 (print), since the PDF handed off is the one the print path makes.

Next: the build gate opens at 22:00. Run the three never-run app suites
(TaxSalePanelTests, HistoricalTaxSalePanelTests, MapShareAndEvidenceTests),
then start Phase 7.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: xcrun simctl boot 24FBD923-387E-4B7E-9063-FCF166239B1C, then ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests/MapShareAndEvidenceTests
-scheme ns-marks-the-spot -destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-14 — first simulator run; Phase 7 begun

Done: the gate opened and the three never-run app suites ran on iPhone 17.
MapShareAndEvidenceTests 11/11 and TaxSalePanelTests 12/12 green;
HistoricalTaxSalePanelTests had one real failure — `aFailedLoadCanBeRetried`
was written against an ordered stub queue that does not exist (StubURLProtocol
matches by URL substring), so the failure answered forever. Fixed and
re-run 15/15 green. Swept the target for the same mistake; it was the only one.
Second Codex review of Phase 5: three findings fixed (3ec083e20), two
declined with reasons in the commit and the transcript.
Phase 7 started: frame geometry, scale bar and both page templates ported
with the web's own assertions (0477fe7af). Package tests 491 green.

Next: the GeoPDF writer. CoreGraphics cannot set /VP + /Measure or /LGIDict,
so the plan is a small hand-written one-page PDF writer in NSMarksCore
(Helvetica text, DCTDecode image XObject) rather than byte-patching a
CoreGraphics document.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: port web/src/print/pdf/geoRegistration.ts and pdfComposer.ts into
NSMarksCore/Sources/NSDataServices/Print/, with tests that parse the emitted
bytes back.
```

## 2026-08-15 — Phase 7: the whole page composes and reads as a GeoPDF

Done: PdfWriter + GeoPdfRegistration (8aa0e1f72), PdfFont/PdfContent/PdfComposer
(4cca6fb14), attribution grouping + resolution ladder (51bacdd8a). 522 package
tests pass in ~0.4 s. Checked outside the app: `gdalinfo /tmp/page.pdf` reads
ground coordinates with no warnings, `pdftotext` recovers the text, and the
rasterized page was looked at. GDAL caught three registration defects the
CoreGraphics round-trip could not see — all three are still live in the web's
geoRegistration.ts and are filed as a separate task.

Next: the app side of Phase 7. Nothing of it exists yet — the print frame
overlay on the map, capturing the map raster at the chosen dpi, the export
dialog, and sharing the finished PDF. The open question to settle first is how
the raster is captured: MKMapSnapshotter renders the base map but not overlays,
so tile and vector layers have to be drawn on top, and a page whose legend
names a layer the raster does not contain would break the evidence contract.
Build gate was GO at the time of writing.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: design the map-raster capture for print — MKMapSnapshotter for the
base plus explicit tile/vector overlay drawing — then wire the print frame,
export dialog, and share to PdfComposer.compose.
```

## 2026-08-15 — Phase 7 app side written, unbuilt

Done: `PrintMapCompositor` (MKMapSnapshotter base + tiles + parcel outlines,
per-layer drawn/partial/failed outcomes, tiles fetched through the map's own
overlays so the export cannot bypass the licence clearance),
`TileRequestFactory.exportRequest` (one whole-frame `/export` render per
Province layer instead of ~200 tile renders, size-capped and licence-gated),
`PrintExportPlan` (frame grows to the paper rather than cropping; a layer that
failed is kept out of the legend, out of the attribution strip, and named in
words under the notes), `PrintExport`, `PrintExportSheet`, and a printer button
on the map. 534 package tests pass. App-target tests written but **never
compiled** — build gate has been HOLD (outside window) all session; opens
22:00. Everything is `swiftc -parse` clean only.

Next: spend the 22:00 admission on the app test target, fix what the compiler
finds (the untested assumption is that UIKit drawing from `nonisolated static
async` passes strict concurrency), then verify a real export in the simulator.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: once xcode-build-slot.sh --status reads GO, run the app test
target through the slot wrapper and fix the compile errors in the new
ns-marks-the-spot/Print/ files.
```

## 2026-08-15 — Phase 7 export: Codex review applied

Done: read the full adversarial review and fixed what it found. The one that
mattered: `OpacityTileOverlay.loadTile` cannot throw (MapKit retries anything
that does), so a source it could not reach answers with a transparent square —
and the compositor was counting those as drawn, which would have put a legend
on a page saying a source was consulted that was never reached. `exportTile`
now returns the disposition beside the bytes. Also: roads casing fails its
layer instead of printing the base pass alone; parcel interior rings cut holes
(even-odd) instead of being filled; `exportRequest` checks both dimensions;
`OpacityTileOverlay` is `@unchecked Sendable` with `renderer` main-actor
isolated (the review's compile blocker); draw-order precondition documented.
New: `LayerState.unsupported`, so a vector layer on screen but not on the page
is named in the notes rather than leaving blank ground. Compositor tests now
read pixels back — placement, opacity, order, holes, the six-at-a-time ceiling.
535 package tests pass; the app target is still `swiftc -parse` clean only.

Next: the 22:00 admission on the app test target. Phase 8 georeferencing maths
can go in NSMarksCore meanwhile, where it is testable without the gate.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: once xcode-build-slot.sh --status reads GO, run the app test
target through the slot wrapper; expect the first errors in ns-marks-the-spot/Print/.
```

## 2026-08-15 — georeferencing maths: spline, residuals, mesh, projection

Done: Codex review 2's five print findings are fixed and committed (f5ba644a1)
— tiles now carry what is in them, so a layer that put no ink on the page is
neither legended nor credited, and the unsupported-layer disclosure moved to the
attribution strip where it cannot be silently pushed off the page. Phase 8 in
NSMarksCore: thin-plate spline (b78a61381), residuals (66ad29298), the warp
lattice (754e30ff5), and embedded-GeoTIFF placement with a hand-rolled inverse
transverse Mercator pinned against proj4 (f388ccb3f). 623 package tests pass.
The app target has still never been compiled — every app file is
`swiftc -parse` clean only, and the resource gate has read HOLD all day.

Next: Codex review 3 of the projection maths is running. Then the import
parsers, then the warped-raster renderer. The gate opens at 22:00.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: once xcode-build-slot.sh --status reads GO, run the app test
target through the slot wrapper; expect the first errors in ns-marks-the-spot/Print/.
```

## 2026-08-15 — georeferencing core complete in the package

Done: Codex review 3 acted on (0486374d0) — a UTM coordinate is now checked
against its own zone, Web Mercator ordinates are checked before `unproject`
clamps them, "EPSG:+26920" no longer parses, a sub-tolerance crop past the right
edge can no longer clamp to a negative width, and a grid size below one is
refused instead of silently becoming one cell. Three tests that compared a mesh
vertex against the expression that produced it now measure interpolation
between vertices, in Web Mercator, which exposed the honest number the old test
hid: eight cells leaves ~37 m of residual across a province-wide sheet, not
zero. Also landed: `UserMapRecord` (2a725bc88), `WarpMesh` (119953611), and the
import gate `UserMapImport` (ef0969f37). 710 package tests pass. The app target
has still never been compiled; the gate has read HOLD all day.

Next: Codex review 4 of WarpMesh/UserMapRecord/UserMapImport is running
(scratchpad/codex-review4.txt). Then the app-target work — Image I/O decode,
the Core Graphics warp draw, the georeferencer UI — none of which can be
compiled until the gate opens at 22:00.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: once xcode-build-slot.sh --status reads GO, run the app test
target through the slot wrapper; expect the first errors in ns-marks-the-spot/Print/.
```

## 2026-08-15 — user rasters draw, and persist

Done: Codex review 4 acted on in full. A geotransform whose linear part cannot
be inverted is refused (it passed every corner check and collapsed the sheet
only at draw time); `WarpMesh.transform` now verifies the transform it solved
rather than trusting a nonzero determinant; culling reads every coordinate, not
the extremes, so a NaN anywhere refuses; a walk budget of `Int.max` no longer
overflows; `chooseImage` returns nil for no images. Four weak tests replaced.
New: the MapKit warped-raster overlay and renderer (46be8c481), the saved file
format `UserMapLibrary` (7aad1f0a1), and the Image I/O importer plus on-device
store (1bad6e7d6). 728 package tests pass. The app target has still never been
compiled — the gate read HOLD all day; it opens at 22:00.

Next: the georeferencer UI and the layer-panel rows, then compile.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: once xcode-build-slot.sh --status reads GO, run the app test
target through the slot wrapper; expect the first errors in ns-marks-the-spot/Print/.
```

## 2026-08-15 — Phase 9 landed: user vector layers, drawing, editing, export

Done: import (GeoJSON/KML/KMZ/GPX/zipped shapefile) → records → map overlays →
panel rows → drawing and editing → export. `VectorFeatureStyle` renamed
`UserVectorStyle` to clear an ambiguity with `NSDataServices` at every app-target
use site. Edit operations, hit-testing and export all live in GeoCore, so they
are verified gate-free: 845 package tests in 115 suites pass. Commits e6ccaac3f,
8539f067e, 57e67cdf1, ffccd86ff, 66a8bd443, c7848796e — all pushed. Codex
adversarial review of the whole subsystem is running; review 5 before it died
unread when its own heredoc hung.

Next: triage the Codex findings, then compile. Nothing in Phases 7, 8 or 9 has
ever been through a type-checker — only `swiftc -parse`.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: once xcode-build-slot.sh --status reads GO, run the app test
target through the slot wrapper; expect the first errors in ns-marks-the-spot/Print/.
```

## 2026-08-15 — Codex review of Phase 9 acted on in full

Done: all 18 findings. GeoCore (858 tests, 119 suites): shapefile holes now
attach to the smallest containing ring rather than the previous part; unclosed
rings are closed and two-corner rings refused; taps reach an area's edge and the
tolerance is scaled by cos(lat); simplestyle width/opacity are clamped and
unparseable colours fall back to the layer's. App target: the store owns
read-modify-write behind one shared actor, geometry and revision move together,
the orphan sweep has a caller, a failed write no longer discards the edit, the
debounce flushes on backgrounding, a clean session writes nothing, and the
original imported bytes are kept and shareable. Parity gaps closed: a Draw
button, draggable vertex handles on single-part geometry, a provenance-bearing
card for every tapped feature, and visibility remembered across launches.
Commits through 2026-08-15 pushed. `renderer.lineWidth = style.weight` was the
one certain compile error Codex found; fixed.

Next: the gate is HOLD (weekend, so 22:00 only; swap is also below the floor).
Nothing in Phases 7, 8 or 9 has been type-checked. Compile first when it opens.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: once xcode-build-slot.sh --status reads GO, run the app test
target through the slot wrapper; expect the first errors in ns-marks-the-spot/Print/.
```

## 2026-08-15 — Deferred Phase 4 item: tax-sale overview markers

Done: listed parcels now show as markers at zoom 11 and below, where the
polygons are sub-pixel and the province-wide view showed nothing at all where a
sale was. `ParcelMarkers.representativePoint` in GeoCore picks the centroid of
the largest outer ring — not the mean of the parts, which lands on the road that
split them (863 tests, 120 suites). App target: `ParcelOverviewMarker`,
red for current sales and purple for historical, installed and removed only on
the zoom-11 threshold crossing; tapping one selects the parcel. The opening view
now fits the advertised parcels once, capped at zoom 13.

Next: unchanged — the gate is still HOLD and nothing in Phases 7, 8 or 9 has
been type-checked. A Codex pass looking only for compile errors across the
never-compiled files is running while the gate is shut.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: once xcode-build-slot.sh --status reads GO, run the app test
target through the slot wrapper; expect the first errors in ns-marks-the-spot/Print/.
```

## 2026-08-15 — The app target compiles, and can be checked without the gate

Done: `Scripts/typecheck-ios.sh`. It cross-compiles NSMarksCore for the
simulator triple and runs the real type-checker over the app and unit-test
sources with the six flags the target uses — `-default-isolation MainActor`
above all, without which every isolation error in the app target stays
invisible. No binary, under a minute, so it is not what the build gate exists
to serialize. Phases 7, 8 and 9 had never been type-checked at all; `-parse`
sees syntax and nothing else.

Four errors it found and fixed: `var rect = rect` shadowing its own `let` in
`focus(on:)`, a missing `import GeoCore` in MapContainerView,
`identifiedFeatures` (no such property) in `bounds(forPIDs:)`, and
`onEditLayer`/`onNewDrawingLayer` passed in the wrong order. Two expressions
also defeated the type-checker outright: MapContainerView's 520-line body, now
split into the map, its lifecycle and its sheets, and a `.secondary : .red`
ternary between a hierarchical style and a colour. App + tests: 0 errors,
8 warnings. Package: 863 tests, 120 suites.

Codex was asked for the same thing in parallel and produced nothing usable —
it read files for 27k lines and died. The compiler is the authority here.

Next: the gated `xcodebuild test` run is now worth an admission for the first
time — it will fail on behaviour, not on typos. Gate still HOLD (weekend, so
22:00; a manual Xcode build is also holding the slot).

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: run ./Scripts/typecheck-ios.sh first (seconds, no gate); then when
xcode-build-slot.sh --status reads GO, spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`.
```

## 2026-08-15 — the last three debts outside the gate

Done: three items that were owed and did not need the gate. The Province
licence can now be withdrawn (`OverlayViewModel.revokeProvinceLicence`, control
in the info sheet): requests stop, refused layers switch off, and the cached
tiles are deleted, with a failure to delete surfaced rather than swallowed. The
sweep list comes from `LayerCatalog.restrictedLayerIDs`, and an uncatalogued
layer is swept rather than kept. Saved offline areas are deliberately untouched
— `TileDownloadManager` saves Fletcher only, and Fletcher is not restricted.
The civic-address lookup now carries `unreadableRows`, so the parcel panel says
"none I could read" instead of "none" when the file sent rows this build could
not parse. And CI runs `swift test --package-path NSMarksCore` as its own
check, required whenever the native scope is.

Package: 865 tests, 120 suites. App + tests type-check with 0 errors and
0 warnings.

Next: everything still open needs the gate — the first real `xcodebuild test`
run, the hidden-overlay tile question (#11), and the whole-bundle hang (#12,
whose stated cause looks stale: `StubURLProtocol` is per-key and lock-guarded).
Gate has read HOLD all weekend; opens 22:00.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: run ./Scripts/typecheck-ios.sh (seconds, no gate); then when
xcode-build-slot.sh --status reads GO, spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`.
```

## 2026-08-15 — the parity sweep, and what it found

Done: swept `web/src/services`, `layers`, `userMaps`, `print` and the rendered
strings against the iOS tree. Services, layer catalog, inspector sections and
tax-sale filters were already at parity. Six real gaps, all now closed and
pushed: the measure tool (distance/area by tapping), the printed QR code, the
map position readout, the "Include legend" toggle, the Allmaps georeference
export, and the evidence appendix — the web's research document is its field
sheet plus that appendix, and the app had the two as separate exports. The
appendix is laid out from the evidence note's own markdown so the printed and
emailed statements cannot drift; its pages carry no viewport or LGIDict.

Codex reviewed the lot adversarially and found eight defects; six are fixed in
89d965024 (export Cancel now cancels the work, the exact link prints as text
beside the QR, the annotation names the record id and needs a solved fit, the
readout is absent until the map settles, save-area stops a live measurement).
Two left alone on purpose, with reasons in that commit message.

Deliberate non-gap: the web's `autoExport.ts` checkpoints exist because
IndexedDB is wiped by "clear site data"; iOS user maps sit in ordinary
backed-up storage.

Package: 893 tests, 124 suites. App + tests type-check clean. Gate has read
BUSY+HOLD all weekend (PID 40086 holds the slot; swap ~1.3 GB against a 2 GB
warn floor).

Next: nothing outside the gate is left on the parity list. The first real
`xcodebuild test`, the hidden-overlay tile question (#11), the whole-bundle
hang (#12), and simulator verification of the six new controls (#13) all wait
on it.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: poll `xcode-build-slot.sh --status` every ~5 min; when it reads
GO, spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`.
```

## 2026-08-15 — the evidence the note was leaving out

Done: 10b9891fd puts mapped area, mapped buildings, mapped roads and water,
and the flood screens into the exported note (and so into the printed
appendix, which is built from it), moves the panel's wording into
ParcelEvidenceWording so the screen and the document cannot drift, gives
`EvidenceNoteInput.Result` an `errorMessage` so licence-blocked, failed and
unasked stay three sentences, and gates the export on those three lookups.
85345fed4 prints each source's credit and licence beside its findings and
moves the coastal licence's three mandatory notices into CoastalFloodLicence,
shared by panel, note and appendix. Package: 897 tests, 124 suites, green.
App + tests type-check clean (`zsh ./Scripts/typecheck-ios.sh`). Codex review
#3 of 10b9891fd is still running.

Next: the gate. Saturday 17:30 reads HOLD — outside the window until 22:00,
and swapFree ~0.9 GB against a 2 GB warn floor, so 22:00 may not admit either.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: poll `xcode-build-slot.sh --status` every ~5 min; when it reads
GO, spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`.
```

## 2026-08-15 — the app target could not compile at all

Done: the first gated `xcodebuild test` failed before running a single test —
swift-frontend aborted emitting the isolated-to-`@Sendable` thunk that
`Binding(get:set:)` needs when handed a `@MainActor` callback (Swift 6.3.3,
"SmallVector unable to grow"). Both row lists did it. Fixed with
`mainActorSetter`; reproduced and confirmed gate-free first. `typecheck-ios.sh`
now emits objects for app and test sources in batch mode, so this class of
crash costs ~20 s instead of a build admission. Package: 898 tests green.
Committed as 5d0b6a164.

Next: the gated app-test run has still never executed. A retry loop is armed;
the slot is held by an unrelated Echo build and swap is at 654 MB.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228. Next action: read
scratchpad/apptests.log for TEST SUCCEEDED/FAILED; on failure extract messages
with `xcrun xcresulttool get test-results tests --path <.xcresult>`.
```

## 2026-08-16 — all twelve failures from the hung gated run accounted for

Done: A gate-free simulator probe diagnosed the last one. Nine were fixed
without a build admission: one real defect (print ignored layer opacity —
`setAlpha` does nothing to `UIImage.draw(in:)`, 9299ec0d1), eight stub races
cured by `.serialized`, and one stale expectation — `ranked` correctly drops
1236 when the user typed 1234, so the test now searches the street and a new
test pins the narrowing (357f105b4). Codex found no defect in either commit.
`Scripts/gated-focused-tests.sh` runs the eight suites one invocation at a
time, each with its own `-resultBundlePath`, because the whole bundle hangs
and a hung run finalises no bundle. Package: 900 tests green.

Next: run that script through the slot in the 22:00 window.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228. Next action: after 22:00 run
`/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh`
and read the per-suite bundles under .build/focused-tests/.
```

## 2026-08-16 — Catalogued features answer a tap, and reach the page

Done: Five commits. `f92898336` ports the web's per-layer popups into
`FeatureCallout` plus a shared screen-space hit test; `cdd241599` wires the tap;
`ff51d0565` composites the six feature-backed layers onto the printed page in
the web's mono-safe print styling, so they are `.drawn` rather than
`.unsupported`; `6f71f6041` fixes five defects Codex found in the first two
(card outliving its evidence, MapKit's caveat-free bubble over well markers,
measure/edit tap ownership, a parcel identify left pending, diverging eyebrow
wording); `d4facb0e8` adds the well accuracy filter, applied in the query rather
than after it. Closes audit gaps 2, 6, 7, 8, 14 and most of 5. Package: 917
tests green. Verified headless through the simulator probe — card contents,
selection dropping with its layer, 0.0120 ink on a page that was blank.

Next: still the gated run; then georeferencing GCP editing (#17).

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228. Next action: after 22:00 run
`/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh`
and read the per-suite bundles under .build/focused-tests/.
```

## 2026-08-16 — georeferencing editable, second Codex round closed

Done: `ab43f3901` makes the placement visible and correctable — a live warped
draft under numbered draggable markers, a zoomable/pannable scan pane, and a
method-aware per-point diagnostics list ("Off by" under affine, "If removed"
under a spline). `cb8d9a26d` closes Codex round two: a selection now carries the
geometry it was tapped on, so a redraw cannot pin a card to different ground;
each selection kind clears the others; a tap inside a drawn parcel wins over
catalogue polygons; the well legend shows the markers and the full accuracy
warning. Package: 928 tests green. Probe evidence: affine grid=1, spline
grid=32 settling and 16 mid-drag, overlay drawn in every state.

Next: the gated run; then print export frame (#18) and the remaining parity
gaps (#20).

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228. Next action: after 22:00 run
`/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh`
and read the per-suite bundles under .build/focused-tests/.
```

## 2026-08-16 — Legends landed; export frame hardened after adversarial review

Done: `36862e210` gives the four health screens, old-growth, roads and
micro-hydro a legend in the layer panel, with the province's guidance carried
in the catalog and checked against the web fixture. `e06f8fca9` closes all six
Codex findings on the export frame: north-up lock while framing, fitted-unit
resize, clamped offsets, feature card suppressed, VoiceOver adjust/move, and a
share confirmation listing the layers missing from the page. 932 package tests.
Next: task #20 parity gaps (GeoPDF import, documents, deep links, move tool,
batch import, scale readout, tile retry); gated test run after 22:00.
Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
on claude/ios-web-map-parity-2de228. Next: pick up task #20 — start with the
scale readout and tile retry, then deep links.
```

## 2026-08-16 — Four parity gaps closed; two documents, not one

Done: `6be00d6d1` approximate screen-scale readout (measured from the live map,
nominal-ppi caveat behind a tap). `d26623074` per-layer "Retry tiles" on a
broken layer. `995911950` move tool: one centre handle carries a whole feature,
multi-part included. `60d3b8929` field sheet vs research summary — the choice
picks the caveat, the appendix and the filename; the PID only names a page whose
frame actually holds that parcel; the caveat now prints on every appendix page
footer alongside the record mode; the filename is sanitised. 943 package tests,
typecheck clean. Two Codex findings knowingly not taken: the research page one
has no fact grid or evidence-status grid (that content is in the appendix, which
is deliberately sentences not tables), and the appendix is no longer optional on
a research summary. Deep links deferred: universal links need an
apple-app-site-association file on the KinNoKi-published site, outside this repo.
Next: task #20's GeoPDF import and batch import; gated test run after 22:00.
Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
on claude/ios-web-map-parity-2de228. Next: port GeoPDF import (web parsers under
web/src/userMaps/parsers/geoPdf*.ts) using PDFKit for the raster.
```

## 2026-08-16 — GeoPDF import matches the web; batch import lands

Done: `577b6d5ba` reworks the GeoPDF import against a Codex review. A PDF is
never refused over its registration any more: one frame places it, several are
the user's choice (`PdfFrameChooser`), none leaves a stated reason —
`PdfMapRegistration.selection(of:)` replacing `outcome(of:)`, with
`PdfImportMetadata` on the record so the panel can say what happened. Also
crop-box rather than media-box rendering, bounded `VP`/`LGIDict` traversal,
fractional-EPSG refusal, and a render scale that no longer exceeds the cap.
Import now takes several files, each with its own named notice. 976 package
tests, typecheck clean, and the simulator probe confirms the export round-trip,
the crop box, and both import outcomes. Task #20's open item is now only deep
links, which stay deferred (needs an apple-app-site-association file on the
KinNoKi-published site, outside this repo).
Next: read the second Codex review (task `bvzd9ltnu`), then the gated test run
after 22:00.
Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
on claude/ios-web-map-parity-2de228. Next: act on the second Codex review of
577b6d5ba, then run
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
```

## 2026-08-20 — imported PDFs were drawing upside down; six review fixes

Done: `8d0cb3b76`. `PdfMapReader.read` flipped the bitmap context before
drawing, so every imported sheet draped mirrored north to south while its
registration described top-down rows. Corner checks cannot see this, because a
mirrored rectangle has the same four corners; the new `theSheetIsNotMirrored`
measures ink position through the affine and fails against the old reader. Also
from a Codex review: unchecked `LPTS` range, TIFF Orientation applied to pixels
the geotransform does not know about, an unreadable library being overwritten by
the next import, discarded save failures shown as success, the whole file
selection held in memory at once, and `sweepOrphanedPreviews` never called. 986
package tests; typecheck clean; the simulator probe runs all eight new
app-target cases green.
Next: the gated test run after 22:00, then the remaining Phase 0 spikes.
Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
on claude/ios-web-map-parity-2de228. Next: run
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
and read the per-suite bundles under .build/focused-tests/
```

## 2026-08-20 — adversarial review 4 acted on, export chain measured end to end

Done: Codex review of the orientation fix returned seven findings; all seven
acted on in 628cd7033. The LPTS range guard was my own regression and is gone
(the web has no such check, and its regression set has a USGS quadrangle running
-0.02238 to 1.02238). Seal re-checked after the decode; damaged library now told
from a newer build's by reading the format number first, and set aside rather
than locking the user out; refused edits roll back to what disk last confirmed,
not to what each edit found; TIFF turn measured off the decoded image instead of
a tag that may sit on another subimage. Two weak tests strengthened, and the
last two untested links in the export chain measured: a hand-built /Rotate page
through PdfMapReader (all four rotations put the same quarter on the same
ground), and PrintMapCompositor (the exported page is north-up).

Next: run the gated app-target suites. The gate holds until 09:00 today
(weekday window 09:00-15:00); slot FREE, pressure 1, swapFree 1041MB.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
on claude/ios-web-map-parity-2de228. Run
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
then read each bundle under .build/focused-tests with
xcrun xcresulttool get test-results tests --path <bundle>.
```

## 2026-08-20 — QR mirror fixed, review 5 triaged, gated run started

Done: found and fixed a mirrored print QR. `QRCodeModules` turned the grid
over leaving Core Image, so every printed code carried its finder squares at
top-left, bottom-left and bottom-right. Nothing caught it because the old test
checked only the top-left corner, which survives a vertical mirror, and because
Apple's `CIDetector` reads a mirrored code either way (measured: both
orientations "READS BACK"). The new test asserts the empty fourth corner.

Codex review 5 returned nine findings against 628cd7033. One (`saved` rebuilt
from `rows` after the await) was already fixed in 594a5e679. Six accepted and
landed in aa6779155: the later-version seal moved into the store actor, a
reload no longer applied over a newer write, the sweep reads the library
itself, version <= 0 reclassified as damage, set-aside made idempotent, and the
importer's quarter turn measured against the primary rather than the decoded
overview. Two rejected with reasons: the parent-directory permission case (the
app's own Application Support is writable by construction, and the fallback is
already safe), and the LPTS magnitude gap, which the web shares by the same
code path — spawned as a separate task against the web contract.

Every fix was A/B'd through the gate-free simulator probe before it was
accepted. The seal race fails 3/3 with the store guard removed; the old
per-edit rollback strands 44.80 4/4; the four PDF rotations measure
4096x2048/2048x4096 with the ink at 0.25/0.75 as expected.

Next: read the gated bundles. Run started 09:01 on aa6779155.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
on claude/ios-web-map-parity-2de228. Read each bundle under
.build/focused-tests with
xcrun xcresulttool get test-results tests --path <bundle>
(Swift Testing Issue.record messages never reach the xcodebuild console).
```

## 2026-08-22 — two gated failures fixed, and the GeoPDF frame check tightened

Done: the gated run reached 20 of 53 suites before the host tore it down, with
two failures, both now fixed and A/B'd. `aRacingImportLosesToTheSeal` was my own
write-generation guard suppressing the seal in the later-version branch; a
refused write cannot have changed the file, so that branch no longer checks the
count. `aCardWhoseGroundMovedIsNotKept` was never a slow test: `MapController`
holds its map view weakly, and the helper built one and returned without it, so
every refresh after the first stopped at `loading` and published nothing.
Measured on the real view model: 3 runs of 3 never settled with the view
released, 3 of 3 settled in 0.49 s holding it. `FeatureIdentifyTests` now owns
its map view, and the 600 ms sleeps are `settles(_:until:)`, which records its
own timeout.

Codex review 6 (2ec5569c1..HEAD) called the seal asymmetry and the map-view
lifetime sound, and found the GeoPDF control-point guard measures against the
page rather than the frame the registration claims. Fixed on both surfaces:
half a *frame*, not half a page. Every fixture measured at three page sizes, no
real file leaves its own frame, the rotated USGS quadrangle leaves it by 2.24%.
Removing the check reproduces the acceptance on both sides. `npm test` also
runs green again — `exportSharedData.test.mjs` had been failing vitest since it
landed here.

Next: the gate is shut until 22:00 (Saturday, so no weekday window). Re-run the
focused suite from the top; suites from `OfflineAreasViewModelTests` onwards
have never run on this branch.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
on claude/ios-web-map-parity-2de228, at 6fb66c292. From 22:00 run
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
then read every bundle under .build/focused-tests with
xcrun xcresulttool get test-results tests --path <bundle>.
```

## 2026-08-22 — Codex parity audit triaged; five gaps closed gate-free

Done: Codex's read-only parity audit named 14 gaps. Closed so far, each
committed: the well-log `manualUrl` link; the opening view (the app opened on
Halifax at a province span, the web on Cape Breton at z9 — now shared through
`MapPosition.default` and applied once layout gives the map a width); the
location button's silence when permission was already refused; tapping a
mineral occurrence or mine opening, which computed a label and threw it away;
`MKScaleView` beside the position readout; and the georeferencer's fixed 70%
draft opacity, now a slider that moves the renderer's alpha.

Verified gate-free: the scratchpad probe run on the booted simulator (9/9,
span 1.069° at 390 pt confirms z9), `swift test --package-path NSMarksCore`
991/991, `Scripts/typecheck-ios.sh` clean. A `swift test` SIGSEGV during the
`manualURL` work was a stale SwiftPM test-module object file after the
`LayerDescriptor` layout changed; `swift package clean` fixes it.

Next: the audit's remaining gaps, largest first — no OSM base layer, no
reference layers in the georeferencer, no Fletcher CSV import or held-out
error, no session autosave, no unified batch import. The print seal difference
and the narrower accepted coordinate-system list look deliberate and
fail-closed; decide rather than change. Then the gated suite from 22:00.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
on claude/ios-web-map-parity-2de228, at 04ddfc5ce. From 22:00 run
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
then read every bundle under .build/focused-tests with
xcrun xcresulttool get test-results tests --path <bundle>.
```

## 2026-08-22 — Gaps 6, 9 and 4 closed; one real defect found and fixed

Done: Fletcher points file parses and serializes in Swift (all 24 emitted
sheets byte-identical), held-out accuracy shown beside the fit, import/export
and a crash-safe draft wired into the georeferencer, active-source attribution
strip under the map with MapKit's ornaments pushed above it. Codex review found
that undo after an import left the imported checks in place, so the panel
scored a restored placement against ground from a discarded file; checks now
travel in the undo step. The browser has the same defect and this does not fix
it there. 1018 package tests green, `typecheck-ios.sh` clean, `ActiveAttribution`
verified against the real catalog through the simulator probe.

Next: gate is shut until 22:00. Verify the new controls in the simulator
(attribution strip height vs the Apple logo, the georeferencer control row on a
small phone, MKScaleView's rendered size), then run the gated focused suite and
triage. Remaining audit gaps: #2 default layer stack, #3 OSM base layer,
#5 georeferencer reference layers, #11 print defaults, #12 mixed batch import.

Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
git log --oneline -1   # 7a0ed55d8
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
```

## 2026-08-22 — Gaps 5 and 11 closed

Done: the georeferencer draws the aerial and the parcel boundaries behind and
over a scan, from the catalogue, through the app's own cache and licence gate;
revoking mid-sheet retracts tiles already drawn. Print sheet defaults to the
research summary when a parcel is framed and gained appendix and aerial
switches; leaving the aerial off drops both the ink and its credit. Codex
review of gap 5 raised six findings: five applied (attribution, revocation,
below-zoom warning, seeding from the main map, Coordinator tests), one
dismissed as a criterion from my own prompt rather than from the web. It also
caught a real ordering bug: the draft was appended, so a warp rebuild put the
scan over the boundaries. `typecheck-ios.sh` clean; simulator probe confirms
order ns-aerial/scan/nsprd across toggle, rebuild and revoke, and 4224-byte
licenceRefused tiles for both layers with no acceptance.

Next: gate opens 22:00. Remaining audit gaps: #2 default layer stack (needs a
product decision), #3 OSM base layer (raises an OSM tile-usage-policy question),
#12 mixed raster/vector batch import.

Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
git log --oneline -1   # a10ed72d4
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
```

## 2026-08-22 — Gaps 3, 12 and 2 closed

Done: the base-map picker gained "None", a white `BlankBaseOverlay` installed
through the draw order at the modern-basemap slot, so a scan can be read and
printed with no modern ink under it; the printed page and the evidence note
drop the Apple credit when nothing Apple is drawn. Both Import buttons now take
a mixed selection and route each file by its bytes through `ImportRouting`,
ported from `web/src/userMaps/importRouting.ts`; the vector side reports every
refusal in a batch by name instead of overwriting one slot. Launch visibility
now reads clearance: an accepted licence opens on aerial, parcels, water and
roads as the browser does, an unanswered one still opens on the native default
alone. Two pre-existing red tests in `OverlayDrawOrderTests` were fixed: they
built layers from catalogue descriptors, which are hidden by native default and
therefore never installed, so they were asserting the order of an empty map.

Judgement call worth a second opinion: gap 3 does not ship OpenStreetMap tiles.
The OSMF tile usage policy forbids an app pulling from tile.openstreetmap.org,
and Apple Standard already supplies a modern street map, so "None" closes the
behaviour the web actually has rather than the tile source it uses.

Next: gate opens 22:00. Verify in the simulator the five-segment base-map
picker on a small phone, the attribution strip, the georeferencer control row,
and the new print controls; then run the gated focused suite and triage.
Codex review of the blank base map (task brmmejtz4) was still running.

Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228
git log --oneline -1   # b8301c53b
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
```
