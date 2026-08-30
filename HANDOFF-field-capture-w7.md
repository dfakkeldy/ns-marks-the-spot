# Handoff — field capture W7 (freeform attributes + KML ExtendedData)

## 2026-08-30 — W7 implemented, live-verified, PR opened

Done: AttributeEditor (string-valued per contract, nsmts:/name/description/
coordinateProperties hidden, reserved+duplicate add refusal, complex values
read-only, XSS-inert), session updateFeatureProperties (undefined deletes,
no aliasing), KML ExtendedData carrying every property except
name/description/coordinateProperties/nsmts:photos — nsmts provenance keys
included, values string-typed, togeojson round-trip pinned. No schema
change. Live proof: added species/stand-age on the converted polygon,
persisted as strings beside the nsmts stamps; KML export carried them plus
nsmts:createdAt/convertedFromPoints.
Next: W8 (photo storage + attach + display, DB_VERSION 3) or the iOS N1
mirror per docs/field-capture-design.md.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch: feature/web-field-capture-w7
Read docs/field-capture-design.md, then implement PR W8 from its roadmap
table on a fresh branch off nightly.
```
