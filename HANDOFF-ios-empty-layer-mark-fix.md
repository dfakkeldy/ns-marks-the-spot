# Handoff — iOS: empty layers unreadable after relaunch, Mark My Location ignores the map's fix

## 2026-09-02 — implemented, focused tests running

Done: `UserVectorParse.parseGeoJson(_:allowingEmpty:)`; the store reads its own
files allowing an empty collection; `loadedRow` reports an unreadable geometry
file as a storage refusal; `MarkLocation.acquireFix(preferring: [candidates])`
tries the recorder's fix then the map's own user-location fix
(`MapController.userLocationFix()`), asks CoreLocation at ten-metre accuracy
only as a fallback, shows "Finding your position…" while waiting, and reports
a layer refusal in the store's words (`Outcome.storageFailed`) instead of the
GPS message. Tests: `UserVectorParseTests`, `FieldCaptureStoreTests` (relaunch
round-trip, unreadable file), new `MarkLocationTests`. Review findings §2.1,
§2.2, §2.5 of the field review (artifact 20c8ef7f).
Next: confirm focused suites pass through `xcode-build-slot.sh`, commit, push,
open PR to `nightly`, delete this file in the PR that closes the task.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-review-88eda8,
branch feature/ios-empty-layer-readback-and-mark-fix. Run the focused app suites
FieldCaptureStoreTests, MarkLocationTests, UserVectorEditingTests on iPhone 17
(id 24FBD923-387E-4B7E-9063-FCF166239B1C) via the build slot, then commit and PR to nightly.
```

## 2026-09-02 — committed, pushed, PR #292 open to nightly

Done: commit 129af0a24 on `feature/ios-empty-layer-readback-and-mark-fix`;
package suite 22/22 and app suites 25/25 passed locally through the build slot;
PR https://github.com/dfakkeldy/ns-marks-the-spot/pull/292 open against `nightly`.
Next: watch the `Build gate + tests` check; on green, drop this file and merge.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-review-88eda8,
branch feature/ios-empty-layer-readback-and-mark-fix. Check `gh pr checks 292`; if green,
remove HANDOFF-ios-empty-layer-mark-fix.md in a final commit and merge to nightly.
```
