# Handoff — await-orphan-sweep

## 2026-08-27 — fix committed, local test held until build window

Done: `feature/await-orphan-sweep` (from origin/nightly) commit 5dda2f23 joins
the detached orphan-draft sweep at the end of `UserMapsViewModel.load()`,
fixing the CI race in `UserMapDisplayTests` "A draft whose map is gone is swept
on the next load". Build-slot wrapper held the focused test run (exit 75,
outside windows; next window 22:00). Background retry loop is running the suite
via the wrapper on iPhone 17 Pro sim 0C646763, log in session scratchpad.

Next: once `UserMapDisplayTests` passes, delete this file, push the branch, and
open a PR to `nightly`. After that PR merges and nightly is green, re-run PR
#230's checks (its failure is inherited from nightly).

Resume:

```
In worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/quizzical-lichterman-4ae7d8
on branch feature/await-orphan-sweep: run
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- xcodebuild test -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,id=0C646763-8698-4E61-995A-71A07C1BF738' -only-testing:'ns-marks-the-spotTests/UserMapDisplayTests'
(boot the sim first); when green, delete HANDOFF-await-orphan-sweep.md, push, and open a PR to nightly.
```
