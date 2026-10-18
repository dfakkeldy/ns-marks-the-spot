# Claude prompt: restore Fletcher orange balance in the Atlas Day theme

Use this checkout to locate the NS Marks The Spot repository (another agent is actively extracting labels here):

```text
/Users/dfakkeldy/.codex/worktrees/65ef/ns-marks-the-spot
```

The current product focus is the web map under `web/`. PR #347 (`feat(web): Fletcher-inspired Atlas day theme with self-hosted lettering`) is already merged into `origin/nightly`. Its visual concept came from this Claude artifact, which is a reference rather than a code source to replace the current implementation:

```text
https://claude.ai/code/artifact/eb654543-62e5-4db0-bf00-ea6e7b3f51c5
```

Inspect that checkout read-only, fetch the remotes, and create your own separate Git worktree on a fresh `codex/` feature branch from current `origin/nightly`; target `nightly` in the PR. Do not switch branches or edit files in the extraction agent’s checkout. Run all subsequent commands inside your own worktree. Preserve unrelated work. Discover the design/frontend skills actually available in this Claude environment, read the exact applicable skill before acting, and use it. Do not guess or claim a skill name that is not present.

## Objective

Refine the existing Fletcher-inspired **Day** basemap so meaningful apricot, ochre, and salmon areas are visible at ordinary regional and village views. This is the primary change. The current result is readable, but cream and olive dominate, while Fletcher's broad orange washes are barely represented except in roads and small land-use patches.

The desired result should feel recognizably related to the artifact and Fletcher's warm sheets while remaining a useful modern research map. Orange must participate in the map's colour-area balance, not appear only in roads, icons, or a key. Keep olive woodland and quieter paper areas so the map does not become a flat orange field.

Use only existing modern source classes and the existing background/land-cover hierarchy. A broad apricot land ground is a valid direction to test, as are stronger ochre farmland and salmon settlement treatments, provided the final class meanings remain clear. Do not invent land cover, copy historical geological boundaries, imply that the colours show modern or historical geology, or introduce diagonal hatching. Fletcher's historical hatching encoded geology and remains deliberately omitted.

## Read first

Read these current files before changing anything:

- `AGENTS.md`
- `web/README.md`
- `web/package.json`
- `ARCHITECTURE.md`, especially the Online Web Companion and Fletcher source/evidence sections
- `web/src/atlas/palette.ts`
- `web/src/atlas/style.ts`
- `web/src/atlas/style.test.ts`
- `web/src/atlas/AtlasStudy.tsx`
- `web/src/atlas/study.css`
- `web/src/atlas/places.ts`
- `web/src/atlas/historicalSymbols.ts`
- `docs/FLETCHER_GEOREFERENCING.md`, especially the evidence, rights, accuracy, and publication caveats
- `docs/fletcher/label-extraction/README.md`
- `docs/fletcher/label-extraction/judique-inland-review.md`
- `docs/fletcher/label-extraction/judique-south-review.md`

Also inspect PR #347's diff and its current rendered result. Treat the checked-in code as the implementation baseline; do not rebuild the Atlas from the artifact.

The concurrent extraction batch adds `docs/fletcher/label-extraction/judique-southeast.json` (Glendale/Kingsville; 40 additions, IDs F19-JUD-094–133). It may not yet be merged into your base. Read it from the extraction checkout only if useful; this theme task must not depend on it or turn it into production geography.

## Design comparison before implementation

At the same camera positions, prepare two or three credible Day-palette variants that differ mainly in colour-area balance. Include at least one version with a broad apricot ground and one with a more restrained paper ground plus stronger ochre/salmon modern land-use areas. Compare them at the same zoom and viewport so the choice is about the palette rather than geography.

Judge the variants on:

- broad warm-colour presence at regional and village scales;
- legibility of roads, water, labels, woodland, settlements, and farmland;
- clear separation among modern source classes;
- sufficient contrast for serif place/water lettering and sans road lettering;
- calm enough texture and linework for sustained map reading;
- colour-blind and grayscale/print resilience where the existing treatment depends on it.

Show the comparison evidence in screenshots or a compact contact sheet, then implement the strongest readable result. Temporary comparison controls or code should not remain in production unless they clearly improve the existing study page.

## Historical labels and symbols

Keep this task independent of the ongoing extraction. The existing `/atlas.html` study/specimen UI may be refined so it can clearly demonstrate historical lettering and the existing school/mill/mine/forge symbol states, but do not add a production label layer, renderer subsystem, data service, schema, or site coordinates.

The inventories are source-pixel transcriptions. Their `source_text` reading confidence is separate from geographic placement confidence. Existing and incoming records keep new-site geometry all-null (`historical_site_geometry: null`) and `placement_status: "unlocated"` unless a separate evidence process establishes otherwise. A clear transcription does not justify a pin. A printed symbol association does not establish a modern coordinate, ownership, continued existence, access, operation, or present site condition.

If you refine the specimen presentation:

- keep it explicitly unlocated and confined to the existing study/specimen surface;
- make transcription/reading confidence visibly distinct in language from recorded/approximate placement confidence;
- preserve shape differences for placement states rather than relying on colour alone;
- use source text only as an unlocated typography example, never as a mapped feature;
- do not imply that an all-null geometry inventory is incomplete application data that should be auto-filled.

## Scope and implementation limits

Prefer a small, direct refinement of the existing palette and MapLibre layer paint values. Reuse the current fonts, sprite, source layers, evidence wording, and MapLibre/Leaflet architecture. Do not add a map-engine facade, speculative provider abstraction, service layer, theme subsystem, or wholesale visual rebuild.

Likely files are:

- `web/src/atlas/palette.ts`
- `web/src/atlas/style.ts`
- `web/src/atlas/style.test.ts`
- `web/src/atlas/AtlasStudy.tsx`
- `web/src/atlas/study.css`
- `web/src/atlas/historicalSymbols.ts`
- `web/README.md` only if the checked-in description becomes inaccurate

Touch other files only when the rendered refinement demonstrably requires it. Preserve Night and OSM behavior unless a shared contrast fix is necessary. Keep the atlas useful on mobile browsers. Do not change Fletcher georeferencing, accepted sheet bounds, tile sources, source receipts, attribution, licensing, print/export evidence semantics, or publication state.

## Required rendered review

Run the existing app and inspect the real rendered MapLibre map, not just token swatches or unit tests. Capture before/variant/final evidence with stable cameras for:

1. Judique at a village/detail scale.
2. Glendale/Kingsville at both a regional and village/detail scale. Add a review-only bookmark if useful, but avoid permanent navigation clutter unless it earns its place.
3. Port Hawkesbury at regional and village/detail scale.
4. At least one narrow mobile viewport showing map readability and the `/atlas.html` study controls/specimen.

Verify that orange is clearly present as area, woodland remains legible, water and coastlines read immediately, road hierarchy is intact, labels do not disappear into warm fills, and the study key matches the actual map. Exercise Day versus Night and OSM at the same camera. Check the browser console for errors.

Use the repository's existing browser workflow and the applicable design/frontend skill. Add a focused automated assertion only where it protects a real class or contrast invariant; avoid tests that merely restate hex values.

Run the relevant checks, at minimum:

```sh
cd <your-separate-worktree>/web
npx vitest run src/atlas/style.test.ts
npm run lint
npm run build
npm run test:browser
```

If the full browser suite has an unrelated environmental failure, preserve the rendered screenshots and report the exact failure accurately. Do not treat a build as proof of browser behavior or deployment.

## Delivery

Commit the focused implementation, push the feature branch, and open a ready PR targeting `nightly`. The PR should lead with the concrete issue: the merged Fletcher Day theme underrepresents the broad orange/apricot washes, and the change restores warm area balance using existing modern land classes without adding geology or invented features.

Include:

- the chosen palette reasoning and the variants rejected;
- links or paths to same-camera desktop/mobile evidence;
- exact checks run and their results;
- confirmation that the console was clean or the exact errors observed;
- confirmation that no historical site pins or geometries were created;
- any remaining legibility tradeoff that a reviewer should inspect.

Do not merge or deploy. A ready PR and reviewable rendered evidence complete this task.
