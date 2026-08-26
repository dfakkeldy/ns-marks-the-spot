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

## 2026-08-25 — implementation committed, gate-free loop green

Done: 83953f140 implements the whole scope (overlay + default, UA, screen
strip, print composite via tile machinery with "modern" outcome, attribution
parity, session v2 migration, link/theme/session "modern" remap, substitution
notice retired) with focused tests; NSMarksCore swift test 1139 pass;
typecheck-ios.sh "app, tests and UI tests type-check clean and compile".
Next: codex exec adversarial review of the diff; fix findings; push branch,
watch "Build gate + tests"; open PR to nightly.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/elegant-elion-ad23d6
# review done? then: git push -u origin claude/ios-openstreetmap-base-450614
# gh pr create --base nightly; watch "Build gate + tests"
```

## 2026-08-25 — reviewed, pushed, PR #228 open

Done: 8-angle adversarial review (codex exec unusable — ChatGPT account
rejects every model on CLI 0.148.0/0.149.1; substituted multi-agent review);
7 findings fixed in 8cb1464b2 (template source, framing credit, info-sheet
OSM row, MIME check, migration settle-on-read, dead base-name case, Apple
literal dedupe); typecheck clean; pushed; PR #228 → nightly.
Next: watch "Build gate + tests" on PR #228; merge when green; delete this
handoff in the closing PR. Known accepted tradeoffs (offline blank ground,
unsized URLCache, no 429 backoff) are in the PR body.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/elegant-elion-ad23d6
gh pr checks 228 --watch   # then merge when green
```
