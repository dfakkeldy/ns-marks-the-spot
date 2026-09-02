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
