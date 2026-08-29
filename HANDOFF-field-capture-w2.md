# Handoff — field capture W2 (web track recording)

## 2026-08-29 — W2 implemented, verified, PR opened

Done: foreground track recording per docs/field-capture-design.md — contract
filter (gate/teleport/EMA/spacing), segments on pause/resume, DP simplify with
preset picker, raw GPX as the layer original, recording HUD + SaveTrackDialog,
wake lock, recorded layers via createRecordedLayer. Browser-verified end to
end (record → pause → resume → stop → save; IndexedDB record + raw GPX
checked). Found+fixed live: stale-fix re-consumption on resume.
Next: W3 (GPX export + "Raw recording (GPX)" row button) per the roadmap,
branching from nightly after this PR merges.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch: feature/web-field-capture-w2
Read docs/field-capture-design.md, then implement PR W3 from its roadmap
table on a fresh branch off nightly.
```
