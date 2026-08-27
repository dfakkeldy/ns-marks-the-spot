# Handoff — draft-sweep-load-contract

## 2026-08-27 — fix committed, awaiting build window

Done: Diagnosed CI failure of "A draft whose map is gone is swept on the next
load" (UserMapsViewModelTests.swift:990). PR #234 made `load()`'s draft sweep a
fire-and-forget `Task.detached(.utility)`; the test checks the draft is gone
immediately after `await load()`, so it races and loses on CI. Fix committed on
this branch: await the detached task's value (IO stays off-main).
Next: Focused run of `ns-marks-the-spotTests/UserMapDisplayTests` on booted
iPhone 17 sim (24FBD923) via xcode-build-slot.sh; retry loop running in the
background until the 22:00 window admits it. Then push and PR to nightly.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/frosty-bardeen-3ffc18,
branch feature/draft-sweep-load-contract. Run the focused UserMapDisplayTests
suite through xcode-build-slot.sh; if green, push and open a PR to nightly,
deleting this handoff file in that PR.
```
