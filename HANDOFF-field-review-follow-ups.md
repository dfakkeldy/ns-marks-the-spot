# Handoff — field-review follow-ups (artifact 20c8ef7f), PRs A–I

Review text (plain): scratchpad `review.txt`; regenerate from the artifact
with the Artifact tool (`action: read`) if the scratchpad is gone.

## 2026-09-03 — PR C (#297) rebased onto nightly after G (#301)

Done: `feature/ios-vertex-drag-handles` rebased onto origin/nightly
(`d11a92e4`, #301). Only conflict was this handoff note (add/add); the iOS
drag-handle commit applied cleanly, including `VectorHandleViewTests` and
the UserVectorEditing coverage.

## 2026-09-02 — PR G opened (web mark and locate parity)

Done: #301 to nightly from feature/web-mark-locate-parity (4 commits). Closes
review 2.3 and 2.9: the browser one-shot names its failure by
GeolocationPositionError code, is held to the mark's own 10 s / 50 m rule,
stamps nsmts:capturedAt from the position's timestamp, and reports a write
that did not reach the device; the locate keeps a zoom already closer than 14
and flies only to a fix off screen; Reduce Motion is honoured. Four Codex
rounds also brought: one shared fix rule for both paths, a moved point giving
up its fix provenance, the popup naming the device rather than GPS and staying
silent for a malformed pair, the watch telling timeout from unavailable, and a
mark keeping the session it was aimed at. Gates: npm test 1826, lint, build,
all clean; verified in the running app (zoom kept from 16, fly to 14 from 9,
the three failure sentences, "±7.4 m").
Deferred to PR I: an edit write that fails after Done has no always-mounted
place to be shown, and a late failure can appear in the next layer's panel.
Next: PR H (web evidence-contract highs, section 11), then PR I, then PR J.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
git fetch origin && git checkout -b feature/web-evidence-contract origin/nightly
# PR H: review section 11, web/src/userMaps and web/src/services evidence states
```

## 2026-09-02 — PR A written, tests not yet run

Done: branch `feature/ios-location-button-follow` from origin/nightly
(c131013e9, #292 merged). MapController: locate keeps zoom when closer than
5 km (`keepsZoom`/`locateZoom`), centre offset by half the bottom card
(`setBottomCardHeight` → layoutMargins), fix gate (`isFixGoodEnoughToCentreOn`
100 m / 30 s), 10 s deadline (`locateDeadlineElapsed`), `.follow` armed after
the flight settles, second tap `.followWithHeading`, `didChange mode` mirror,
`didFailToLocateUserWithError`, message lifetimes (`lifetime(of:)`),
`dismissLocationMessage`. Container: `LocationButtonIcon` states, layers
panel closed on locate, `OpenSettingsButton` on locate banner, mark toast,
recorder HUD; `coversMapBottom` on parcel/edit/callout cards. 16 new tests in
`MapOpeningAndLocationTests`.
Next: 09:00 build window → run `MapOpeningAndLocationTests`,
`MapControllerTests`, `MarkLocationTests` via the build slot; simulator check
of follow + margins with `simctl location`; Codex review; commit; PR to nightly.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e,
branch feature/ios-location-button-follow. Run
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- xcodebuild test -scheme ns-marks-the-spot
-destination 'platform=iOS Simulator,id=24FBD923-387E-4B7E-9063-FCF166239B1C'
-only-testing:ns-marks-the-spotTests/MapOpeningAndLocationTests
-only-testing:ns-marks-the-spotTests/MapControllerTests (nohup, log to scratchpad),
fix failures, then Codex review and PR A to nightly.
```

## 2026-09-02 — PR B written (stacked on A), tests not yet run

Done: branch `feature/ios-drawing-drafts-points-snapping` from PR A's branch.
`VectorEditSession.settleDraft(droppingPartial:)`/`discardDraft()`; Done, tool
switch, re-tap and Erase finish a finishable draft; panel confirms a partial
one (`pendingDraftAction` alert), prominent "Finish line · n"; `snapNotice`
+ `noteSnap`; `isOwnFeatureSnapTarget` excludes points under the Point tool
(container `snapHit` uses it); `layerIsHidden`/`showLayer`, `end()` switches an
edited hidden layer on; `recentlyCommittedFeatureID` halo; `UserVectorMarkerImage`
20 pt solid disc + white casing + camera badge on a 30 pt canvas; layers
button disabled while editing; mark into a hidden layer switches it on
(`Outcome.marked(layerShown:)`). Doc row in field-capture-design snap table.
11 new tests in `UserVectorEditingTests`.
Next: build window → run A's suites on A's branch, then B's suites
(UserVectorEditingTests, FieldCaptureSnapTests, MarkLocationTests) here;
simulator look at the new marker; Codex; PRs A then B (B based on A's branch).

## 2026-09-02 — A and B green locally; PR C written (stacked on B)

Done: A `MapOpeningAndLocationTests`+`MapControllerTests`+`MarkLocationTests`
37/37 (slot, XBG_ALLOW_NOW typed by user); MapKit centres `setCenter` inside
layoutMargins (measured: manual offset double-counted, removed). B: 59/59 in
UserVectorEditingTests, FieldCaptureSnapTests, MarkLocationTests,
UserVectorShapeTests, MapOpeningAndLocationTests. C on
`feature/ios-vertex-drag-handles`: `VectorHandleAnnotationView` (drag-state
contract), 44 pt `VectorVertexHandleImage`/move handle, corner stepper +
"Move corner to map centre" (`visibleCentre`/`pan(to:)`), hint text, line/area
Finish → Select; `VectorHandleViewTests`.
Next: run C suites, simulator drag check with temp prints, Codex A/B/C, PRs.

## 2026-09-02 — A, B green after Codex round 1 fixes; C fixed after round 1; PRs not yet opened

Done: A (`feature/ios-location-button-follow`, 42/42) and B (stacked, 66/66)
re-tested after their Codex round-1 fixes; C rebased and fixed (GPS provenance
stripped on hand moves, whole-feature move button, handle accessibility,
non-animated corner pan). Simulator evidence for A (keep zoom, follow, pan
releases, deadline with stale fix) and C (two drags, full drag-state contract)
in scratchpad `drag-check-evidence.log` and `pr/pr*-body.md`. This file lives
only on the tip branch of the stack; A and B carry none.
Next: C suites → Codex round 2 for C; read A/B round-2 verdicts; open PRs A
(→ nightly), B (→ A), C (→ B) with `scratchpad/open-prs.sh`; then PR D from
`scratchpad/apply_prD.py` (drafted, unapplied).
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e,
branch feature/ios-vertex-drag-handles. Run C's suites (VectorHandleViewTests,
UserVectorEditingTests, UserVectorShapeTests) via the build slot, then Codex round 2 on C,
then open PRs A/B/C with scratchpad/open-prs.sh A|B|C.
```

## 2026-09-02 09:35 — A/B/C green after Codex rounds; final Codex rounds running; PRs next

Done: stack A 2ca392093 (49/49) → B a2ee0542a (75/75) → C ad42f96b4 (43/43),
all via the build slot. Codex round-1 and round-2 claims fixed/refuted/deferred
(tables in scratchpad `pr/pr*-body.md`). Round 3 (A, B) and round 2 (C) launched
09:35 with `scratchpad/codex/round.sh`; outputs `codex/out-*-r3-*.md`,
`out-C-r2-*.md`. Handoff lives only on the tip branch.
Next: read those verdicts, fix Highs, then `scratchpad/open-prs.sh A|B|C`;
then PR D (`apply_prD.py`, drafted) on a branch from C.

## 2026-09-02 09:50 — D green (53/53); C round-2 fixes applied

Done: D `feature/ios-photo-map-states` 53/53 (PhotoMapViewModelTests etc.);
merged Info.plist moved to `Config/NSMarksTheSpot-Info.plist` (a plist inside
the synced folder is copied twice). C round 2: photo-location offer routed
through `moveVertex` (GPS keys stripped), no-op moves ignored, whole-feature
move button independent of the corner cap, ordinal handle labels, lone point
gets one handle. PR E script drafted (`apply_prE.py`, unapplied).
Next: C suites → rebase D → D suites; read A r3 / B r3 verdicts; open PRs.
## 2026-09-02 09:37 — PR D applied (stacked on C), not yet built

Done: `feature/ios-photo-map-states`: PhotoMapViewModel rewritten (State
off/requestingAccess/indexing/on, intent counter, single-flight refresh,
`snapshotGeneration`, incremental `PhotoKitIndexer.applyChanges`, awaited
`imageData` with progress + cancellation, limited-library picker, cluster
callout); PhotoMapIndex bucketed + most-recent cap + width/height; PhotoMapRow
lines + Open Settings; MapController cluster inseparable → `.clusterSelected`,
`.defaultHigh`, annotation-level diff for points-only layers; container wiring;
Info.plist merged file with PHPhotoLibraryPreventAutomaticLimitedAccessAlert;
purpose string; PhotoMapViewModelTests + PhotoMapIndexBucketTests (package).
Next: build+test D (PhotoMapViewModelTests, UserVectorShapeTests, MapControllerTests)
and `swift test --filter PhotoMapIndex` via the slot once Codex runs finish; Codex D.

## 2026-09-02 10:05 — stack green after Codex round 3 (A, B) / round 2 (C); D green; final rounds launched

Done: A 2c867c55b 53/53, B 5e74f7f10 80/80, C 22b6d4e2a 44/44, D bf378c5dc
91/91 (all via the slot). Dispositions for every Codex claim so far are in
`scratchpad/pr/pr{A,B,C}-body.md`. Final Codex rounds launched 10:05 (A r4,
B r4, C r3, D r1; outputs `codex/out-*-r4-*`, `out-C-r3-*`, `out-D-r1-*`).
Next: read verdicts, fix only Highs that hold, then `open-prs.sh A|B|C|D`
(D's base is C's branch); then PR E from `apply_prE.py` on a branch from D.

## 2026-09-02 10:07 — PR E applied (stacked on D), not yet built

Done: `feature/ios-crosshair-placement`: `MapController.reticlePoint`/
`reticleCoordinate` (armed while a drawing tool is up; the middle of the map
above the bottom layout margin, the same spot `visibleCentre()` now uses),
`PlacementReticle` overlay with "Place here" and a coordinate readout, a
press-and-hold recognizer (`handlePlaceLongPress`, refused over annotation
views via `longPressMayBegin`) → `.mapLongPressed` → `handleEditTap`;
`PlacementReticleTests`; provenance test for reticle-placed points.
Next: build+test E (PlacementReticleTests, UserVectorEditingTests,
MapControllerTests), Codex E, then open PRs A–E.

## 2026-09-02 10:50 — Codex rounds addressed on A–D, E rebased, F applied; nothing rebuilt yet

Done: A r4 (Precise-Location-off message, stale-fix deadline leaves the map,
camera taken by search/link/frame, rotated keep-zoom, follow-time failures,
refusals persist with Dismiss), B r4 (Done drains photo attachments,
per-vertex snap provenance, lines may revisit corners, stale parcel catches
guarded, drafts settle only on .background, mark refused while ending,
Finish 44 pt, traced note in panel), C r3 (altitude and photo capture date
kept on move, moves refused while ending, exact snap-back records the trace,
handle reinstall, move outcomes announced), D r2 (PhotoKit id folding,
per-layer clusters + merged stored-layer card, scope-aware index with
downgrade clear, continuation owned by the request, MultiPoint diff guard,
restricted/unavailable access, album-only changes, notices yield, copy),
F on `feature/ios-field-review-highs` (§3.1 recorder refusals at start,
§3.2 sealed library, §7.1 never-asked PVSC evidence, §6.2 cards clear of the
rail and rail at 16 pt, §7.2 KMZ inflation caps).
Stack: A 67c97f5b1 → B f9a8e8dfe → C 4fb6c5646 → D 7e8d31714 → E c096804b0 → F.
Next: `queue.sh` in the scratchpad runs each branch's suites through the
slot (logs/queue-*.log); fix failures; `swift test` for NSMarksCore on F;
Codex rounds A r5, B r5, C r4, D r2, E r1, F r1 (round.sh now passes
`-c mcp_servers={}` so Codex no longer holds the build slot); then open PRs
A→nightly, B→A, C→B, D→C, E→D, F→E with `open-prs.sh`.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
git checkout feature/ios-field-review-highs
# read scratchpad logs/queue-*.log; fix red suites on the owning branch and
# rebase the branches above it; then Codex rounds, then open-prs.sh A..F
```

## 2026-09-02 11:46 — Whole stack green on its final commits; one more Codex round running

Done: two more review rounds folded in (A r5, B r5, C r4, D r2, E r1, F r1:
camera ownership for the automatic parcel fit, signal-recovery caveats,
session operations drained by Done, GPS-mark predicate, scope-tagged photo
index, reticle margins and snap preview, KMZ referenced-only inflation,
sealed-library gating and set-aside). Per-branch suites pass through the
slot: A 67/3, B 50/4, C 49/4, D 74/4, E 58/3, F 153/5; `swift test`
NSMarksCore 24/2 + 35/6. PR bodies drafted in the scratchpad `pr/` with
every round's disposition table (`RESULT_ROUND_FINAL` awaits this round).
Stack: A a6368badd → B 5a40ee299 → C f3768a2e3 → D 392c7dbd6 → E 6d5a7f229 → F (this commit).
Next: read `codex/out-{A-r6,B-r6,C-r5,D-r3,E-r2,F-r2}-*.md`; fix only Highs
that hold (then rerun the owning branch's suites and rebase above), fill
`RESULT_ROUND_FINAL`, then `open-prs.sh A B C D E F` (bases: nightly, A, B,
C, D, E). Web clusters G/H/I follow.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
git checkout feature/ios-field-review-highs
# triage the latest Codex verdicts in the scratchpad, then open-prs.sh A..F
```

## 2026-09-02 12:35 — Second full review pass folded in; whole stack green; final Codex round running

Done: A r6, B r6, C r5, D r3, E r2, F r2 addressed (camera-claim generation,
refusal reclassification, suspension drains, shared GPS predicate and the
contract-true `nsmts:traced` retention, scope-tagged photo index with
synchronous persistence, reticle candidate committed as shown, streaming KMZ
assets with archive caps, refused recording is not a recording). Per-branch
suites through the slot: A 70/3, B 51/4, C 50/4, D 77/4, E 61/3, F 161/5;
`swift test` 24/2 + 38/6. Stack: A b96470aec → B 46841083c → C 1d7c4b37b →
D 509f17387 → E a6a3b2881 → F (this commit).
Next: triage `codex/out-{A-r7,B-r7,C-r6,D-r4,E-r3,F-r3}-*.md` (fix only Highs
that hold), fill `RESULT_ROUND_FINAL` in the six bodies, then
`open-all.sh` (pushes and opens A→nightly, B→A, C→B, D→C, E→D, F→E and
rewrites the #PR_X placeholders). Web clusters G/H/I follow.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
git checkout feature/ios-field-review-highs
# triage the latest Codex verdicts in the scratchpad, then open-all.sh
```

## 2026-09-02 — Ten review rounds landed, stack rebased on nightly, PRs opened
Done: applied Codex rounds through A r10, B r10, C r8, D r6, E r5, F r5 plus a
three-agent triage pass over the last verdicts (`apply_pr*.py` in the
scratchpad). Rebased the stack onto origin/nightly df7763dd5. Suites through the
build slot: A 77/3, B 58/4, C 56/4, D 89/4, E 69/3, F 179/5; `swift test`
NSMarksCore 25/2 + 42/6. Stack: A 45c85f7a7 -> B f05646032 -> C 10cd9771f ->
D 132a7d33f -> E a74fca0f2 -> F (this commit). PRs #295-#300, A to nightly.
CI's first run found two things the focused suites could not: unit tests asking
CoreLocation for permission left a system alert that hung the UI suite
(`MapController.isRunningUnitTests` now suppresses it in a test host only), and
`UIColor(featureHex:)` had lost bare-hex parsing. The full bundle — 859 unit
tests in 82 suites plus the UI suite — now passes on the tip against a freshly
installed app. Everything raised is fixed,
refuted with a citation, or deferred in the PR bodies to PR K (iOS HIG and
concurrency mediums), PR L (performance) or PR G/H (web).
Next: PR G (web mark/locate parity, section 2.3 and 2.9) from origin/nightly:
keep the zoom on the first fix, gate flyTo on reduced motion, classify one-shot
geolocation errors, apply the age and accuracy gate to the one-shot, stamp
nsmts:capturedAt from position.timestamp, surface the storage failure, and keep
the layer's own points out of the Geoman snap targets while Marker is armed.
Then H, I, J.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
git fetch origin && git checkout -b feature/web-mark-locate-parity origin/nightly
# PR G: web/src/components/MapCanvas.tsx ~1913-1984, web/src/location/browserLocation.ts, web/src/App.tsx:1517-1550
```

## 2026-09-03 — PR H ready (web evidence contract, section 11)
Done: 12 commits on feature/web-evidence-contract, rebased onto nightly after
PR G merged as d11a92e47. Closes review 11.2-11.7, 11.9, 11.11, 11.12: an
unreadable civic row is no longer an absence, a coastal scenario that sampled
nothing is not a miss, a dwelling dataset that was never asked does not answer,
a point reply gives three states instead of two, the coastal licence's three
notices reach every surface and the parity fixture, a partial civic answer no
longer completes a road list, and print keeps unavailable, unanswered and
not-asked apart. Four Codex rounds also brought: containment before counting,
canonical PIDs only, a parcel with no queryable polygon asking nothing at all,
traced provenance only for the value the spec declares, and a receipt that can
say partly. Gates: npm test 1879, lint, build, NSMarksCore swift test 671, all
clean; verified in the running app at 1024x768 and 375x812.
Next: open the PR, then PR I (web correctness/mobile, section 8 and 10, plus
PR G's and PR H's deferrals), then PR J.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
git fetch origin && git checkout -b feature/web-correctness-mobile origin/nightly
# PR I: review sections 8 and 10, plus the deferrals listed in PR G and PR H
```

## 2026-09-03 — PR I round-1 fixes landed (web correctness/mobile, sections 8 and 10)
Done: 14 commits on feature/web-quick-wins (stacked on feature/web-evidence-contract,
PR H #304). Latest f223395a1 closes Codex round 1: a failed draft read is no longer an
empty device, Record waits for that read, a refused track save is retried onto the same
layer, this tab's own removal is not blamed on another tab, a `storage` listener merges
cross-tab UI state, a pre-fix POSITION_UNAVAILABLE run ends a non-recording watch, a
refused clear() is reported with a retry, the alert stack clears the home indicator, and
Escape from a text field closes the inspector. Gates: npm test 1980, lint, build all
clean; Escape-from-search verified in the running app; fresh-tab console clean.
Codex round 2 launched (logs in scratchpad/codex/out-I-r2-*.md).
Uncommitted and NOT part of PR I: the PR J iOS quick wins under ns-marks-the-spot*/
(patch also saved at scratchpad/prj/ios-quick-wins.patch).
Next: read Codex round 2, fix or defer, re-run gates, push and open PR I to nightly.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
cat /private/tmp/claude-501/-Users-dfakkeldy-Developer-ns-marks-the-spot--claude-worktrees-ns-marks-follow-ups-98d95e/77e085cc-8a4d-4472-812b-39b4fa75268b/scratchpad/codex/out-I-r2-correctness.md
```

## 2026-09-03 — PR I open (#305), web correctness/mobile
Done: 17 commits on feature/web-quick-wins, stacked on feature/web-evidence-contract (PR H #304,
all five checks green). Closes review §8, §10.1, §10.2, §10.5 and §13.3/13.7/13.11. Two Codex
rounds (31 findings) fixed or deferred by name; round 3 running. Gates: npm test 2010, lint,
build, swift test 675, all clean. CI on #305: Change classification, Core package tests and Web
tests + build green; Native build + tests running.
Next: read Codex round 3, fix or defer, push. Then PR J (iOS §13 quick wins) on a branch from
origin/nightly — the patch is uncommitted in this worktree and saved at
scratchpad/prj/ios-quick-wins.patch. PR M's six plans are already written and adversarially
verified in scratchpad/plans-m/ and must branch from PR I's head, not nightly, because their
anchors are in PR I's commits.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
cat /private/tmp/claude-501/-Users-dfakkeldy-Developer-ns-marks-the-spot--claude-worktrees-ns-marks-follow-ups-98d95e/77e085cc-8a4d-4472-812b-39b4fa75268b/scratchpad/codex/out-I-r3-correctness.md
```

## 2026-09-03 — PR H and PR I merged; round 4 and PR J opened
Done: #304 and #305 both merged into nightly (21:28 and 22:08 UTC) while round 4 was running, so
the round-4 fixes missed #305's squash. They are re-applied on feature/web-review-round4 from the
new nightly and open as #307 (Change classification green; Core package tests and Native build +
tests skip on a web-only change). Gates: npm test 2029, lint, build clean. PR J's four iOS
quick-win commits (13.9, 13.4, 13.2, 13.8, one per item) are on feature/ios-quick-wins from
nightly; the app-target and UI test run is going through the build slot now (XBG_ALLOW_NOW=1,
XBG_QUIT_CHROME=0, iPhone 17 24FBD923). User picks recorded: Liquid Glass YES behind
#available(iOS 26); PR N is all four of §12.2, §12.7, §12.4 and §12.11.
Plans already written and adversarially verified, in scratchpad/: plans-m (six §10 a11y, 84 of 87
anchors still match), plans-k4 (six §4 iOS), plans-k6 (§11.8 licences plus six §6 HIG groups).
Next: when the native run passes, open PR J to nightly; then PR K (§4 + §6 + §11.8 + Liquid
Glass), PR L (§5 perf, measured first), PR M (§10 a11y — branch from nightly now that PR I is in),
PR N (the four §12 items).
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
tail -40 /tmp/ios-quick-wins-test.log
```
