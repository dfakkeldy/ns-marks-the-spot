# Handoff — field capture W5 (snap engine + UI)

## 2026-08-30 — W5 implemented, live-verified, PR opened

Done: parcel snap targets (ParcelSnapTargetsLayer, snapIgnore semantics
source-verified + pinned by realMount tests), snapTracker (indicator +
event-time nsmts:traced stamping, copy-on-write), contract snap options in
the Geoman bridge, panel snapping group w/ licence-gated parcels toggle +
pinned caveat, snap-intent licence flow, zoning snapIgnore pin, my-features
target stamping, identify quiet during edit, traced-provenance notes in
GeoJSON/KML/GPX exports. ALSO fixes a pre-existing PRODUCTION crash: the
lazy Geoman chunk never gave the app's map a .pm, so "New drawing layer"
crashed the live site — regression test added; merging to nightly repairs
production via the hourly auto-promotion.
Live proof: snapped a drawn point to PID 50007079's published corner vertex
(coords match to 6 decimals) with both stamps persisted.
Next: W6 (points→line/polygon conversion) per docs/field-capture-design.md.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch: feature/web-field-capture-w5
Read docs/field-capture-design.md, then implement PR W6 from its roadmap
table on a fresh branch off nightly.
```
