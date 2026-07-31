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

## 2026-07-31 — Phase 2 shipped: KML/KMZ/GPX import + GeoJSON/KML export

Done: KML/GPX via `@tmcw/togeojson` (main thread — no DOMParser in workers),
KMZ via `fflate`, dispatch by XML root element. Export as GeoJSON or KML
(hand-written writer, structural escaping) on user layers only, through a new
shared `services/downloadFile.ts`. Two defects found and fixed in browser
verification: togeojson's `{"@type":"html"}` description wrapper (would have
dropped Google Earth descriptions silently) and a phase-1 fit effect that
gave up when the request preceded the layer. Gates green (1195 tests, lint,
build); browser-verified KML style carry-through, popup safety, export
round-trip, and area fit.

Next: Phase 3 — zipped shapefile import via `shpjs`. Entry names already
classify KMZ vs shapefile zip in `parsers/kmzSource.ts::archiveHoldsKml`;
`.prj` is required (fail closed with `missing-crs`), sanity-checked through
the existing `proj4` dep, and shpjs runs in a worker per `parseInWorker.ts`.
Then Phase 4 (Geoman editing). Plan: `~/.claude/plans/yeah-that-sounds-great-fuzzy-spark.md`.

Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/wizardly-liskov-4b89a9, branch claude/vector-kml-gpx-export-phase2 (PR to nightly). Start Phase 3: zipped shapefile import, TDD, fail-closed on a missing .prj, following the plan file.
```

## 2026-07-31 — Phase 3 shipped: zipped shapefile import

Done: `shpjs` in a worker, one layer per `.shp`, named after the shapefile.
`.prj` gate runs before shpjs (which otherwise treats a missing `.prj` as
"already degrees") — absent is `missing-crs`, unparseable is
`unsupported-crs`, and one bad `.shp` refuses the whole archive.
`classifyZipEntries` picks KMZ vs shapefile from entry names, skipping
`__MACOSX` forks. Import loop now handles one file producing several layers.
Fixtures include a minimal SHP/DBF writer so reprojection is tested against
real bytes, not a stub. Gates green (1216 tests, lint, build);
browser-verified UTM 20N → WGS84 through the worker, the no-`.prj` refusal,
and multi-layer naming.

Next: Phase 4 — drawing and editing with `@geoman-io/leaflet-geoman-free`.
Spike Geoman against the canvas-rendered pane FIRST (fallback: SVG renderer
for the layer under edit only). Then `useVectorEditSession`, an imperative
`EditableVectorLayer` bridge with debounced `putVectorLayer`, a custom
toolbar, and a "New layer" button creating `origin: {kind:"drawn"}`. Export
and provenance already handle drawn layers. Delete `HANDOFF-user-vector-data.md`
in that PR — it closes the task. Plan: `~/.claude/plans/yeah-that-sounds-great-fuzzy-spark.md`.

Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/wizardly-liskov-4b89a9, branch claude/vector-shapefile-import-phase3 (PR to nightly). Start Phase 4: drawing and editing with Leaflet-Geoman, spiking canvas-renderer compatibility first, following the plan file.
```
