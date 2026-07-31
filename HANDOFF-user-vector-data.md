# Handoff — user vector data (import / export / edit)

## 2026-07-30 — Phase 1 shipped: GeoJSON import + "Your data" layers

Done: Parallel vector subsystem under `web/src/userMaps/vector/` — GeoJSON
import through the shared drop zone (content routing, not extensions), an
IndexedDB `vectors` store on a shared v2 schema owner (`store/database.ts`),
canvas-rendered layers in `user-vector-pane` (z 425), textContent-only popups,
and a "Your data" layer group. Excluded from print/share by construction.
Gates green: 1143 tests, lint, build; browser-verified (render, popup XSS
safety, persistence across reload, mobile).

Next: Phase 2 — KML/KMZ/GPX import plus GeoJSON/KML export. Adds
`@tmcw/togeojson` and `fflate`; export needs `services/downloadFile.ts`
extracted from the anchor idiom in `GeoreferencePanel.tsx:301` and
`App.tsx:~2233`. Parsers plug into `normalizeCollection` in
`vector/parsers/geojsonSource.ts`; the hook's sniff branches for
`xml-candidate` / `zip` currently throw "later update" and become real
dispatch. Phases 3 (zipped shapefile, fail-closed on missing `.prj`) and 4
(Geoman editing) follow. Full plan: `~/.claude/plans/yeah-that-sounds-great-fuzzy-spark.md`.

Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/wizardly-liskov-4b89a9, branch claude/kml-shapefile-import-export-06a9f9. Phase 1 (GeoJSON import) is merged/open as a PR to nightly. Start Phase 2: KML/KMZ/GPX import and GeoJSON/KML export, TDD, following the plan file.
```
