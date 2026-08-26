# Handoff — OpenStreetMap ground in the georeference pane

## 2026-08-25 — decision made, implemented, core loop green

Done: decided yes — the pane draws the OSM ground the placed scan is shown
over (web parity, Apple-vs-OSM survey offsets in rural NS). Branch
`claude/optimistic-kalam-9dad56` fast-forwarded onto
`claude/ios-openstreetmap-base-450614` (PR #228, open) which owns
`OSMBaseOverlay`. Pane installs `OSMBaseOverlay` + tile renderer branch;
`GeoreferenceReferenceServices.credits` → `credits(for:baseMap:)`; credit
strip moved out of the licence-locked branch; nil-services fallback still
credits OSM. Tests updated/added in GeoreferenceReferencesTests.
NSMarksCore swift test 1139 pass; typecheck-ios.sh clean.
Next: focused GeoreferenceReferencesTests run through the build slot; commit,
push, PR stacked on #228 (retargets to nightly when #228 merges).
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/optimistic-kalam-9dad56
# focused suite green? commit, push, gh pr create --base claude/ios-openstreetmap-base-450614
```
