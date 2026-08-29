# Handoff — field capture W3 (web GPX export)

## 2026-08-29 — W3 implemented, verified, PR opened

Done: GPX 1.1 layer export (waypoints with ele/capture-time/name/desc, tracks
with per-vertex times, schema-ordered, round-trip-tested through parseGpx),
"gpx" in VectorExportFormat, GPX button on every row, and the "Raw GPX"
original-file download on recorded layers with a distinct missing-original
state. Browser-verified both paths against real stored W2 tracks. This
completes the W1–W3 points-and-tracks slice of docs/field-capture-design.md.
Next: W4 (snap math + parcel source) per the roadmap, or the iOS N1 mirror —
owner's call on ordering.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch: feature/web-field-capture-w3
Read docs/field-capture-design.md, then implement PR W4 from its roadmap
table on a fresh branch off nightly.
```
