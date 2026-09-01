# Handoff — PID info sheet formatting

## 2026-08-31 — layers-panel overflow fixed and verified in the simulator

Done: Found the cause of the mis-formatted parcel card — the layers panel was
laid out in the same row as the search column and the control rail (260 + 300 +
44 pt plus padding), which cannot fit a phone. The row overflowed, which grew
the `ZStack` every map overlay is measured against, so the card, the
attribution strip and the readouts were laid out wider than the screen and
centred. Panel now floats over the map, trailing-anchored, capped at 300 pt and
held clear of the measured rail width. Reproduced and re-verified on iPhone 17
(iOS 26.5); added `testTheMapChromeStaysOnScreenWithTheLayersPanelOpen`, which
fails on the old layout (strip at x = -10 on a 402 pt screen) and passes on the
new one, alongside the three reachability tests.

Next: open the PR to `nightly`, then delete this note in the same PR.

Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/pid-info-sheet-formatting-02daa6
on branch claude/pid-info-sheet-formatting-02daa6. Push the branch and open a
ready PR to nightly for the layers-panel layout fix.
```
