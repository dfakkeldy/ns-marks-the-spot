# Handoff — field capture W4 (snap math + parcel source)

## 2026-08-29 — W4 implemented, verified, PR opened

Done: geodesy gains localMetricProjection + nearestPointOnSegment (planar in
a local metre frame, <1 mm agreement with haversine at parcel scales, clamped
t, degenerate-segment case); services/parcelSnapSource.ts adds fetchSnapParcels
(NSPRD envelope query via the paged overlay fetcher, PID-keyed, polygons only)
and ParcelSnapCache (LRU 3000, touch-on-add, viewport selection, fail-closed
dense state over the fixture-pinned 600 cap). No UI, no schema change; query
shape validated once against the live NSPRD endpoint (90 polygons w/ PIDs).
Next: W5 (snap engine + UI: ParcelSnapTargetsLayer, snapIndicator, panel
toggles + caveat, licence intent, Geoman option stamping, real-mount pins)
per docs/field-capture-design.md, branching from nightly after this merges.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch: feature/web-field-capture-w4
Read docs/field-capture-design.md, then implement PR W5 from its roadmap
table on a fresh branch off nightly.
```
