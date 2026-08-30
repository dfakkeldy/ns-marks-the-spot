# Handoff — field capture W6 (points→line/polygon)

## 2026-08-30 — W6 implemented, live-verified, PR opened

Done: pointsToPath (stored array order, dedupe, ring closure, O(n²)
self-intersection warning, traced/createdAt/convertedFromPoints stamps),
session convertPoints + one-shot undoConversion through the single write
path, numbered dashed ConversionPreviewLayer, panel section with stats and
keep-source default, App/MapCanvas threading. Also fixed the session's
missing third writer path: draft-ADDED features (conversion output, undo
restores, mid-session GPS marks) are now materialized into the Geoman group
so the next gesture can't publish them away (realMount regression test).
Live proof: 4 clicked points → previewed ring with badges 1-4 → create →
undo → destructive re-convert persisted one closed Polygon with stamps.
Next: W7 (freeform attributes + KML ExtendedData) or the iOS N1 mirror.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch: feature/web-field-capture-w6
Read docs/field-capture-design.md, then implement PR W7 from its roadmap
table on a fresh branch off nightly.
```
