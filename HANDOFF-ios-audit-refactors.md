# Handoff — ios-audit-refactors

## 2026-08-27 — deferred audit items implemented, awaiting 22:00 build window

Done: On `claude/ios-audit-refactors` (stacked on `claude/ios-audit-fixes`,
PR #234): §8.2 MapController per-field observable storage (state is now
composed, applyStorage writes only changed fields); §9.3 first tranche —
ParcelEvidencePanel collaborator extracted (~430 lines) + print/export query
surface moved to OverlayViewModel+PrintQueries.swift (core 3,244 → 2,500
lines); §7.3 preview eviction (visible rows only, on-demand for sheets);
H.4 share/print/info folded into a More menu (2 UI tests updated); §7.16
catalog statics warmed off-main. Not yet compiled — window closed at 15:00.
Next: background pipeline bkggd8e0o builds + runs all suites at 22:00; then
sim-verify the More menu and evidence panel, commit, push, PR.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
# branch claude/ios-audit-refactors; check scratchpad r-bft.log / r-test-g*.log, fix, commit, PR
```

## 2026-08-27 — verified green, committing and opening PR

Done: 22:00 window build compiled the refactor first try; 697 tests passed,
0 failed (g1 209, g2 121, g3 73, g4 288, UI 6). Simulator verification on
iPhone 17: More menu opens with all three actions (routing to the sources
sheet proven by MapChromeUITests), evidence panel fills through
ParcelEvidencePanel on session restore, parcels and base map draw through the
per-field MapController storage. PR #234 merged into nightly at 16:10, so
this branch PRs to nightly directly.
Next: push, open PR to nightly noting the remaining §9.3 follow-ups
(SessionAndShare + MapSetup collaborators; Licence stays coordinator-owned).
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
# branch claude/ios-audit-refactors; commits done — push and gh pr create --base nightly
```
