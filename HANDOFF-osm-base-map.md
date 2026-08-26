# Handoff — OSM base map for the iOS app

## 2026-08-25 — worktree set up, design settled

Done: branch `claude/ios-openstreetmap-base-450614` at origin/nightly tip
(31787de18); removed merged `ios-web-map-parity-2de228` worktree + branch;
`git rm HANDOFF-ios-port.md`. Design: new `MapBaseType.openStreetMap`
(default), `OSMBaseOverlay` (canReplaceMapContent, z0–19, UA header,
URLSession.shared), print base composited via compositor's `tiles()` with
outcome id "modern" / name "OpenStreetMap base map" (web parity), attribution
"Modern map: © OpenStreetMap contributors — openstreetmap.org/copyright",
shared-vocabulary "modern" now maps to .openStreetMap (share, themes, session,
link restore drops the substitution notice), session background key v2
migration Standard→OSM.
Next: implement (MapViewState, OSMBaseOverlay, MapController,
OverlayViewModel, MapSessionStore, ActiveAttribution, MapAttributionStrip,
PrintMapCompositor, PrintExportPlan, ParcelEvidenceExport, AppContainer) +
tests; loop: NSMarksCore `swift test`, `zsh ./Scripts/typecheck-ios.sh`.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/elegant-elion-ad23d6
# branch claude/ios-openstreetmap-base-450614; implement OSM base per design
# in this file, then swift test (NSMarksCore) + zsh ./Scripts/typecheck-ios.sh
```
