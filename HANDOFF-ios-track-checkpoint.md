# Handoff — durable in-progress track recording (iOS)

## 2026-09-04 — checkpointing written, type-checked, gated run outstanding

Done:
- `GeoCore.TrackJournal` (append-only JSONL of recorder *inputs*; replay through
  `TrackRecording`), `TrackCheckpointStore`, `TrackRestoreNotice`.
- `TrackRecorder` writes every fix and boundary; `stop()` returns `Stopped`
  (id + result + refusal). `AppContainer` owns recorder + store, reads the
  checkpoint at launch, installs `TrackActivityActions` there.
- Save writes the layer under the walk's own id; only save or discard clears.
- 12 GeoCore tests pass (`swift test --filter TrackJournalTests`).
- `Scripts/typecheck-ios.sh` fixed (stale SwiftPM module path, missing
  `SharedActivity/`) and passes app + tests + UI tests + object emission.

Next:
- Gated app-target run. Build slot is shut (Fri 16:53; windows are 09:00-15:00
  weekdays and 22:00-07:00 daily). Nothing has been run on a device.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch feature/ios-track-checkpoint. Run the gated app-target suites:
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- ./Scripts/gated-focused-tests.sh
then open the PR to nightly.
```

## 2026-09-04 — PR open, CI running the native gate

Done:
- Committed `d49cb44ce`, pushed, PR https://github.com/dfakkeldy/ns-marks-the-spot/pull/318 -> nightly.
- Local: 701 GeoCore tests pass; `Scripts/typecheck-ios.sh` clean across app,
  unit tests, UI tests and object emission.

Next:
- Watch `Build gate + tests` on #318. The local gated app-target run was never
  made (slot shut at Fri 16:53); CI is the run of record.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch feature/ios-track-checkpoint. Check: gh pr checks 318 --repo dfakkeldy/ns-marks-the-spot
```

## 2026-09-04 — CI green

Done:
- `6840fb69f` fixed the one CI failure: the checkpoint fixture moved 44 m/s,
  which `CaptureSpec` rejects as a teleport, so `distanceM` was 0 under an
  assertion that it would not be. Walking pace now (5.6 m / 4 s, 35.2 m total).
- #318 all checks pass: Build gate + tests, Native build + tests (926 tests in
  89 suites, plus 17 XCTest), Core package tests.

Next:
- Owner review and merge to nightly. Still unverified on a device: no real
  jetsam kill mid-walk, and no Lock Screen seen on hardware (same gap as #314
  and #315).

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch feature/ios-track-checkpoint, PR #318 green and awaiting review.
```
