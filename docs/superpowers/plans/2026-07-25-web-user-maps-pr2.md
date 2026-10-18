# Web "Your Maps" PR 2 — In-Browser Georeferencer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user opens a plain scan (JPG/PNG), clicks matching points on the scan and on the live map, and watches an affine warp solve in real time and drape onto Nova Scotia — saved as a `kind:"gcp"` layer that survives reloads.

**Architecture:** The georeferencer reuses the app's own Leaflet map as the live pane and opens the scan in a `CRS.Simple` Leaflet map beside it. All transform maths is hand-rolled and pure (`web/src/userMaps/transform/`): solve in Web Mercator metres, store GCPs in WGS84, report residuals in ground metres. The live drape flows through the existing `WarpedRasterLayer` via `setLatLngMesh()`, so a GCP drag re-solves without re-decoding the bitmap. Spec: `docs/superpowers/specs/2026-07-24-web-user-maps-design.md` (the "PR 2 — In-browser georeferencer" section).

**Tech Stack:** React 19, Leaflet 1.9 + react-leaflet 5, Vite 8, TypeScript 5.9, Vitest 4 (jsdom), `canvas` 3.2.3 (dev-only), proj4, geotiff **2.1.3 (exact pin — do not upgrade)**.

## Global Constraints

- **No new runtime dependency.** The `geotiff` / `proj4` / `pdf.js` lock stands. `canvas` is dev-only and already installed (Task 1). Nothing in `web/dist` grows.
- **`geotiff` stays pinned at exactly `2.1.3`.** 3.x rewrote the read API. Migrating is a separate tracked task; do not upgrade it to fix anything.
- **Fresh worktrees have stale `node_modules`.** Run `npm ci` in `web/` before the first test run or the whole suite fails to resolve `fake-indexeddb/auto`.
- **GCP pixel coordinates are ORIGINAL image pixel space, never preview space.** Changing preview resolution must never invalidate a GCP.
- **Solve in projected Web Mercator metres, never raw lat/lng degrees.** Degrees skew east–west against north–south by ~cos(45°) at NS latitudes. GCPs are *stored* WGS84 for portability and converted before solving.
- **Residuals are reported in GROUND metres, not Mercator metres.** A raw Mercator residual over-reports by 1/cos(latitude) — measured at exactly 1.4396× at 46°N.
- **Record identity is load-bearing.** `UserMapLayers`' layer-construction effect keys on the `record` object reference; churning it re-decodes the bitmap. `useUserMaps.test.ts` and `UserMapLayers.test.tsx` pin this. Keep them passing. The map under edit must never enter `records` as a churning object.
- **Lint is strict** (`eslint-plugin-react-hooks` 7 flat recommended): `react-hooks/set-state-in-effect` and ref-writes-during-render are ERRORS. When a ref must be current before an in-flight promise resolves, use `useLayoutEffect`, not `useEffect` — a passive effect is scheduled asynchronously and reintroduces the race. `UserMapLayers.tsx` has a worked example with a comment explaining exactly this.
- **No side effects inside a `setState` updater.** `main.tsx:8` wraps `<App/>` in `StrictMode` and React 19 double-invokes updaters there (verified: 2 invocations per dispatch). An updater that also snapshots undo history, mints an id, or calls another setter runs that twice in the browser while every bare `renderHook` test stays green. Updaters compute the next value and nothing else; branch on a ref *outside* the updater instead. Task 7 is written this way and has a StrictMode-wrapped test.
- **Exports from a `.tsx` file must be components or constants.** `react-refresh/only-export-components` is an ERROR here (`allowConstantExport: true`, so `export const X = 1` is fine and `export function helper()` is not). Shared pure helpers live in `.ts` modules — which also lets their tests drop React entirely.
- **Privacy copy, verbatim:** `Files stay on this device — nothing is uploaded.`
- **Preview cap** stays `PREVIEW_MAX_DIMENSION = 4096`.
- **Conventional Commits; commit after every task.** Branch `claude/web-georeferencer-user-maps-76f482` (based on `origin/nightly`); final PR targets `nightly` — **never** `main`.
- Commands run from `web/`; single-file tests via `npx vitest run <path>`.

## Verified library facts (do not re-derive; do not "correct" these)

Each was checked against the real API before this plan was written. PR 1's plan
was confidently wrong about library behaviour five times; these are the
load-bearing assumptions for PR 2.

| Claim | Status |
|---|---|
| `L.CRS.Simple.project(latLng, zoom)` returns raw LonLat `{x: lng, y: lat}` and **ignores `zoom`** | Verified. Returns `{x:8, y:-6}` for `latLng(-6, 8)`. |
| `map.project(latLng, zoom)` applies `Transformation(1, 0, -1, 0)` — the y-flip | Verified. Returns `{x:4, y:3}` for `latLng(-3, 4)` at zoom 0. **Use the Map methods, never the CRS methods**, or every GCP lands on a mirrored pixel row. |
| Hand-rolled spherical Mercator matches `L.Projection.SphericalMercator` | Verified to ~3e-9 m. `transform/` stays Leaflet-free at no cost. |
| `canvas` + jsdom yields a real `CanvasRenderingContext2D` | Verified: `save`/`beginPath`/`clip`/`setTransform`/`drawImage`/`restore` all produce correct pixels including clip boundaries. |
| `createImageBitmap` does **not** exist in jsdom | Verified — the suite stubs it (`UserMapLayers.test.tsx`). Any new decode path needs an injectable seam. |
| Canvas `drawImage` upscaling blends toward transparency at source edges | Verified. Pixel assertions must sample at **source-texel centres**, not arbitrary interior points, or alpha reads 191/205 instead of 255. |
| Least-squares residual does **not** reliably identify a bad GCP | ~~Verified~~ — **downgraded 2026-07-25. This was one fixture, generalised too far.** A 1104-trial sweep (outlier index × magnitude × direction) has leave-one-out winning 147 and losing 150 against the plain fit residual: a wash. At n = 4 — exactly `MIN_GCPS_FOR_RESIDUALS`, where the old design started accusing a row — four points fitting three parameters leave a **one-dimensional residual space**, so every residual vector is a multiple of one direction fixed by the pixel layout, and `e`, `e/(1−h)` and `e/√(1−h)` all rank *identically* while naming the same row whoever is actually wrong; measured 24% correct against a 25% chance baseline. (This row previously argued from all four leverages being 0.75. That is true only of a symmetric layout — a scalene quad gives `[0.871, 0.954, 0.918, 0.258]` — so it proved the point for one rectangle. Conclusion unchanged, reason corrected 2026-07-25.) `leaveOneOutMetres` was deleted in `11780341f`. The list now highlights the largest fit residual and accuses nobody below `MIN_GCPS_FOR_SUSPECT = 5`, where the same sweep reaches 60% against a 20% baseline. |
| A *conditional* `setState` during render (React's "adjust state when a prop changes") is **lint-clean** under this repo's `eslint-plugin-react-hooks` 7 | Verified: `npx eslint` on a probe using exactly the Task 7 shape exits 0. The banned pattern is `set-state-in-effect`, not this. Do not "fix" the re-seed into a `useEffect`. |
| React 19 **double-invokes state updater functions under `StrictMode`** | Verified by probe: `renderHook(hook, { wrapper: StrictMode })`, one dispatch, updater body ran **2** times (final state still correct). `main.tsx:8` wraps `<App/>` in `StrictMode`, so an updater that does anything besides compute the next value runs its side effect twice in the browser — while a bare `renderHook` test stays green. Task 7 is built around this. |
| React **defers a `setState` updater** whenever the owning fiber already has queued work | Verified: assigning to an outer variable inside an updater and reading it on the next line yields `null`. `App` always has queued work, so this is not a corner case. Build the next value *outside* the updater and hand the finished object in (Task 5's `saveGcps`). |
| `<fieldset disabled>` propagates to descendant inputs, and Testing Library's `toBeDisabled()` sees it | Verified by probe. Task 10's locked reference layers need no per-input `disabled`. |
| `UserMapStore.open(factory?)` + `saveUserMap(record, raster, preview)` round-trips under the global `fake-indexeddb` | Verified by probe, including `getPreviewBlob(...).text()`. Blobs survive because the store converts them to bytes first — this is why App-level tests can seed a real record instead of mocking `useUserMaps`. |
| `userEvent.clear()` **throws** on `<input type="range">` | Verified by probe: `` clear()` is only supported on editable elements. `` Use `fireEvent.change(slider, { target: { value: "40" } })`, which fires exactly one `change`. |
| `react-refresh/only-export-components` is an **error** in this repo | Verified: `eslint-plugin-react-refresh`'s `configs.vite` sets `["error", { allowConstantExport: true }]`, and `eslint.config.js` extends it. A probe `.tsx` exporting one plain function alongside a component exits 1. Constants are allowed; **functions and hooks are not**. Put shared helpers in a `.ts` module, or use the existing disable-comment precedent (`components/MineralProximityParcelLayer.tsx:17`). |
| Leaflet's built-in pane z-indexes | Verified from `leaflet/dist/leaflet.css`: tile 200, overlay 400, shadow 500, **marker 600**, tooltip 650, **popup 700**. 700 is the *popup* pane, not the marker pane — see Task 11. |
| `useMapEvents(handlers)` re-subscribes whenever the handlers **object identity** changes | Verified from `react-leaflet/lib/hooks.js`: its effect deps are `[map, handlers]`, so an inline object literal calls `map.off()`/`map.on()` on every render — once per pointer move during a drag. `useMapEvent(type, handler)` has deps `[map, type, handler]`, so a `useCallback`'d handler subscribes once. |
| `geotiff@2.1.3`'s `writeArrayBuffer` **auto-injects a whole-globe WGS84 georeference** | Verified, and documented at length in `geoTiffSource.test.ts`: unless `GeographicTypeGeoKey` or `ProjectedCSTypeGeoKey` is an own property of the metadata, it adds `GeographicTypeGeoKey 4326` + a `ModelTiepoint`. `plainTiff({})` therefore round-trips as a *georeferenced* file. The un-georeferenced fixture is `plainTiff({ ProjectedCSTypeGeoKey: 0 })`. |
| `initialProvinceLayerVisibility.nsprd` defaults to **`true`** | Verified at `layers/layerCatalog.ts`. So does `ns-aerial`. Task 12's App test must click to turn a reference layer **off**, not on. |
| `npx tsc --noEmit` from `web/` type-checks **nothing** | Verified: `web/tsconfig.json` is a solution file — `"files": []` plus two `references`. Run **`npx tsc -b`**, which is what Task 4 already uses and what actually reports errors (confirmed against a live arity error: `tsc --noEmit` exited 0, `tsc -b` printed both `TS2554`s). `tsc -b` **does** signal failure properly — measured exit code 2, and 2 again on repeated incremental runs with the error still present, 0 once clean — so chaining it with `&&` is safe. (An earlier revision of this row claimed it exits 0 while printing errors; that reading came from a `\| head` pipeline, where `$?` is the exit code of `head`, not of `tsc`.) |

---

### Task 1: Renderer pixel tests, seam fix, `setLatLngMesh` — **ALREADY LANDED**

Committed as `5a199f76b`. Do **not** redo it; verify and move on.

**What it did:**
- Added `canvas` 3.2.3 to `devDependencies`.
- Replaced `web/src/userMaps/render/WarpedRasterLayer.test.ts` with real pixel assertions (8 tests). PR 1's four tests passed `image: {} as CanvasImageSource` and were green only because jsdom returned no 2D context, so the layer early-returned and the draw never executed. With a real context all four failed instantly with `TypeError: Image or Canvas expected`.
- Fixed a real defect the new tests exposed: adjacent clipped triangles each covered ~50% of their shared boundary pixels, compositing to ~75% alpha — a faint diagonal hairline across every mesh cell. `mesh.ts` now inflates each clip path by `CLIP_OVERDRAW_DEVICE_PX = 2`; the affine is still derived from the **original** corners so image placement is unchanged.
- Added `WarpedRasterLayer.setLatLngMesh(mesh)`, which swaps warp geometry and rebuilds the source lattice without touching `image`.

**Then amended by `11780341f`:** the layer projected through
`map.latLngToContainerPoint`, which is `project()._round()` inside Leaflet
(`leaflet-src.js:4117`) and snapped every mesh vertex to a whole CSS pixel —
up to 166 m of ground error at zoom 8, a >1 px break along the cell diagonal
because the four corners round independently, and 1-px stepped jitter during a
drag. It now takes the unrounded `map.project()` route and subtracts the pane
offset itself. One test was added for it.

- [ ] **Step 1: Verify the landed state**

Run: `cd web && npm ci && npx vitest run src/userMaps/render/WarpedRasterLayer.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 2: Confirm the seam test is a real guard, then restore**

Run:
```bash
cd web && sed -i.bak 's/CLIP_OVERDRAW_DEVICE_PX = 2/CLIP_OVERDRAW_DEVICE_PX = 0/' src/userMaps/render/mesh.ts && npx vitest run src/userMaps/render/WarpedRasterLayer.test.ts; mv src/userMaps/render/mesh.ts.bak src/userMaps/render/mesh.ts
```
Expected: 1 failed ("draws no seam where the two clipped triangles meet"), 7 passed — then the file is restored. Re-run the suite to confirm 8 pass again. If the seam test passes at 0, the assertion has gone vacuous — stop and report.

---

### Task 2: PR-1 test-coverage sweeps

Two gaps deferred from PR 1, cheap to close while in the area.

**Files:**
- Test: `web/src/userMaps/errors.test.ts` (create)
- Test: `web/src/userMaps/parsers/geoTiffSource.test.ts` (modify — append one test)

**Interfaces:**
- Consumes: `UserMapImportError`, `UserMapImportErrorCode` from `web/src/userMaps/errors.ts`; `parseGeoTiff` from `web/src/userMaps/parsers/geoTiffSource.ts`.
- Produces: nothing. Test-only task.

- [ ] **Step 1: Write `web/src/userMaps/errors.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { UserMapImportError } from "./errors";

describe("UserMapImportError", () => {
  it("keeps the user message separate from the developer message", () => {
    const error = new UserMapImportError(
      "too-large",
      "This file is over 500 MB.",
    );
    expect(error.userMessage).toBe("This file is over 500 MB.");
    // The Error message prefixes the code so console/stack output is
    // diagnosable, while userMessage stays clean enough to render.
    expect(error.message).toBe("too-large: This file is over 500 MB.");
  });

  it("is a real Error subclass so instanceof and catch work", () => {
    const error = new UserMapImportError("quota", "Storage is full.");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UserMapImportError);
    expect(error.name).toBe("UserMapImportError");
  });

  it("carries the code through a throw/catch round trip", () => {
    try {
      throw new UserMapImportError("unsupported-crs", "Reproject and retry.");
    } catch (caught) {
      expect(caught).toBeInstanceOf(UserMapImportError);
      expect((caught as UserMapImportError).code).toBe("unsupported-crs");
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd web && npx vitest run src/userMaps/errors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Append the multi-tiepoint coverage test**

`geotransformFrom` in `geoTiffSource.ts` returns `null` when `ModelTiepoint`
holds more than one tiepoint (6 doubles) without a `ModelTransformation` —
irregular georeferencing this app does not support. That branch has zero
coverage. Add this test inside the existing `describe("parseGeoTiff", ...)`
block in `web/src/userMaps/parsers/geoTiffSource.test.ts`, directly after the
`"rejects a truncated ModelTransformation as no-georeferencing"` test:

```ts
  it("rejects multiple tiepoints without a transformation matrix", async () => {
    // Two tiepoints (12 doubles) and no ModelTransformation describes an
    // irregularly warped raster, not an affine one. Reading only the first
    // tiepoint would silently mis-place the map, so the parser refuses.
    const buffer = await plainTiff({
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [
        0, 0, 0, 500000, 5000000, 0,
        8, 6, 0, 500080, 4999940, 0,
      ],
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    });
    await expect(
      parseGeoTiff(buffer, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "no-georeferencing" });
  });
```

- [ ] **Step 4: Run the parser tests**

Run: `cd web && npx vitest run src/userMaps/parsers/geoTiffSource.test.ts`
Expected: PASS — one more test than before.

If it instead fails because the fixture writer rejects a 12-element
`ModelTiepoint`, drop to asserting `geotransformFrom` through a direct unit
test rather than a written TIFF, and note the change in the PR description.
Do not weaken the assertion to make it pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/errors.test.ts web/src/userMaps/parsers/geoTiffSource.test.ts
git commit -m "test(web): cover import errors and the multi-tiepoint GeoTIFF branch"
```

---
### Task 3: Transform maths — **ALREADY LANDED** (and since amended)

Committed as `6c1ffd217`, then substantially corrected by `11780341f` after the
adversarial review. **The signatures below are the ones in the tree now** — an
earlier draft of this plan described the pre-`11780341f` API, and every
downstream task has been updated to match. Do **not** redo the task; verify and
move on.

**What is there** (four pure modules under `web/src/userMaps/transform/`, no Leaflet import, 47 tests green):

- `webMercator.ts` — `toMercator`, `fromMercator`, `groundMetresBetween`, `EARTH_RADIUS_METRES`, `MAX_MERCATOR_LATITUDE`. Verified against `L.Projection.SphericalMercator` to ~3e-9 m, and clamps at the Mercator latitude limit so a pole never yields `Infinity` and NaN the whole mesh. One radius (6378137) is used for both the projection and the ground haversine, and the header comment says so.
- `affine.ts` — `type AffineParams = readonly [number, number, number, number, number, number]` (`X = p0*x + p1*y + p2`, `Y = p3*x + p4*y + p5`, pixels in, Mercator metres out), **`solveAffine(pairs)`**, **`solveAffineFromGcps(gcps)`** — *both take no size argument*, `applyAffine(params, x, y)`, `MIN_GCPS_FOR_AFFINE = 3`, **`MIN_CONDITION_RATIO = 5e-3`**, **`MIN_ANISOTROPY_RATIO = 1/50`**. Solved on centred coordinates: raw pixels (~1e4) against Mercator metres (~7e6) lose precision to cancellation.
- `residuals.ts` — `residualMetresFor(params, gcps)`, `rmsMetres(residuals)`, `residualReport(gcps, params)`, `MIN_GCPS_FOR_RESIDUALS = 4`, **`MIN_GCPS_FOR_SUSPECT = 5`**, `type ResidualReport = { metresPerGcp: number[]; rmsMetres: number; mostInconsistentIndex: number | null }`. `residualReport` returns `null` below 4 GCPs. **`leaveOneOutMetres` no longer exists** — do not import it, do not reintroduce it.
- `gcpMesh.ts` — `buildGcpLatLngMesh(params, pixelSize, gridSize = AFFINE_GRID_SIZE)`, `AFFINE_GRID_SIZE = 1`. Row = pixel Y, col = pixel X, matching `buildLatLngMesh` in `projection.ts` so `WarpedRasterLayer` consumes either.

**Four decisions worth knowing before you build on it:**

1. **Residuals are ground metres.** A Mercator magnitude over-reports by 1/cos(latitude) — 1.4396x at 46N. `residuals.test.ts` guards this explicitly. Note this makes the figure *not* directly comparable to QGIS's, which reports in the target CRS's own units.
2. **The highlighted row is the largest fit residual, and there is no highlight below five points.** The original design used a leave-one-out refit, on the reasoning that least squares smears a gross error across every point. The premise holds; the conclusion does not, because the outlier corrupts every refit that still contains it. A 1104-trial sweep put leave-one-out at 147 wins to 150 losses — a wash — for an extra affine solve per point on every pointer move. At four points it is arithmetically hopeless, and for a reason that needs no symmetry assumption: four points fitting three parameters leave a **one-dimensional residual space**, so every residual vector is a multiple of one direction fixed by the pixel layout. Displacing a different point rescales that vector but cannot rotate it, so the largest residual names the same index whoever is actually wrong — verified across a rectangle, a scalene quad and a lopsided quad, all three giving an identical *normalised* residual pattern under all four displacements. (An earlier revision argued this from all four leverages being exactly 0.75. That is true only of the symmetric fixture — a scalene quad gives `[0.871, 0.954, 0.918, 0.258]` — so it proved the claim for one rectangle.) `MIN_GCPS_FOR_SUSPECT = 5` is where the sweep reaches 60% against a 20% baseline. **`mostInconsistentIndex` is therefore `number | null`, and every consumer must handle `null`.**
3. **`solveAffine` takes no pixel extent**, and must not be given one. The acceptance gate is the point cloud's narrowest RMS extent over its *own widest* — `sqrt(lambdaMin/lambdaMax)`, the reciprocal condition number, `MIN_CONDITION_RATIO`. Normalising against the image instead folded a *coverage* question into what claims to be a *rank* question, and the two disagree: a 1000x100 px control corridor on a 24000x18000 scan is full rank with 10:1 anisotropy, yet scored 1.7e-3 against the image and was refused as "too close to a straight line" — false about that layout. The older determinant-over-diagonal test was worse still: it reduced to `1 − r²` for the Pearson correlation of the centred pixels and went blind whenever the points lay near a coordinate axis, i.e. exactly along a scan's neatline.
4. **`solveAffine` returns `null` for more than collinearity now.** Three cases: a source cloud too thin (`MIN_CONDITION_RATIO`); a non-finite coefficient, checked **per coefficient rather than on their sum** — `1e200 + -1e200 + -1e200 + 1e200` is a finite `0`, so a summed guard admitted an exactly singular matrix; and a solved linear part squashing one axis more than 50:1 (`MIN_ANISOTROPY_RATIO`) — three map clicks down a meridian are exactly collinear in Mercator while the *source* points look textbook, producing a zero-area drape whose residuals all read zero. Both threshold comparisons are written **negated** (`!(ratio > MIN)`) so a `NaN` falls into the rejection; written the obvious way round, `NaN < MIN` is `false` and the transform sails through. This is why the session's failure status is called `degenerate` rather than `collinear` (Task 7).

**Known gap, deliberately not covered — clustered control points.** Three
points inside 200 px of a 4096 px scan have a perfectly healthy condition
ratio of 5.8e-1 and are accepted: their *shape* is fine, the fit is just being
extrapolated ~20x beyond them, so a 1 px click slip moves the far corner about
a kilometre. This is a *coverage* problem, and the gate is deliberately not a
coverage test — trying to make one threshold do both jobs is precisely what
produced the corridor bug in decision 3. The right answer is a warning on the
reported accuracy, not a refusal to solve. It is **not implemented in PR 2**;
the spec records it as a known gap and `affine.ts`'s own header comment says
the gate is about rank, not extrapolation. Do not read a passing condition
gate as coverage. See the follow-up note at the end of Task 9.

**The acceptance-gate rework has LANDED.** It was uncommitted and in flight
while this plan was being revised; it is now in the tree and green
(`tsc -b` 0, `eslint` 0, 616 tests). The notes above already reflect it:
`MIN_CONDITION_RATIO = 5e-3` replaces the old `MIN_SPREAD_RATIO`, and **both
`solveAffine` and `solveAffineFromGcps` lost their size parameter.** Any task
below still passing a second argument to `solveAffineFromGcps` is stale — it
takes only `gcps` now. `pixelSize` is still needed for
`buildGcpLatLngMesh`, so do not remove it from the surrounding scope.

- [ ] **Step 1: Verify the landed state**

Run: `cd web && npx vitest run src/userMaps/transform/ && npx tsc -b && npx eslint src/userMaps/transform/`
Expected: PASS (47 tests), no type errors printed, lint silent. If the count
is 43 you are on `6c1ffd217` without `11780341f` — stop and rebase, because
every downstream task calls the post-`11780341f` signatures. If `tsc -b`
prints `TS2554` in `affine.test.ts` or `residuals.test.ts`, the in-flight
gate rework above is half-applied in your worktree; resolve that before
starting Task 4.

---

### Task 4: Plain-image parser, and "no georeferencing" stops being an error

Two changes that together make a scan importable.

**Files:**
- Create: `web/src/userMaps/parsers/imageSource.ts`
- Test: `web/src/userMaps/parsers/imageSource.test.ts`
- Modify: `web/src/userMaps/parsers/geoTiffSource.ts`
- Modify: `web/src/userMaps/parsers/geoTiffSource.test.ts`
- Modify: `web/src/userMaps/parsers/geoTiffWorker.ts` (type only)

**Interfaces:**
- Consumes: `UserMapImportError` (`../errors`), `PixelSize` (`../transform/projection`), `PREVIEW_MAX_DIMENSION` (`./geoTiffSource`).
- Produces:
  - `type DecodedImage = { width: number; height: number; source: CanvasImageSource; close: () => void }`
  - `type DecodeImage = (blob: Blob) => Promise<DecodedImage>`
  - `type RescaleImage = (decoded: DecodedImage, size: PixelSize) => Promise<Blob>`
  - `type ParsedImage = { pixelSize: PixelSize; preview: Blob; previewSize: PixelSize }`
  - `parseImage(blob: Blob, options?: { decode?: DecodeImage; rescale?: RescaleImage }): Promise<ParsedImage>`
  - **Changed:** `ParsedGeoTiff.georef` becomes `EmbeddedGeoref | null`; `parseGeoTiff` no longer throws `"no-georeferencing"`.

**Why the parser change:** a TIFF without georeferencing still has to reach the georeferencer, and browsers cannot decode TIFF — only `geotiff.js` can. Throwing away a fully decoded preview because the geo tags were missing would make "TIFF scans go to the georeferencer" impossible. So the parser reports what it found and `useUserMaps` decides. `"no-georeferencing"` stays in `UserMapImportErrorCode` (unused now, still valid for PR 4's GeoPDF path).

- [ ] **Step 1: Write the failing image-parser test** — `web/src/userMaps/parsers/imageSource.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { UserMapImportError } from "../errors";
import { parseImage, type DecodedImage } from "./imageSource";

/** jsdom has no createImageBitmap, so both seams are always injected here. */
function fakeDecode(width: number, height: number) {
  const close = vi.fn();
  const decoded: DecodedImage = {
    width,
    height,
    source: {} as CanvasImageSource,
    close,
  };
  return { decode: vi.fn(async () => decoded), close, decoded };
}

const fakeRescale = () =>
  vi.fn(async () => new Blob(["rescaled"], { type: "image/png" }));

describe("parseImage", () => {
  it("reports ORIGINAL pixel dimensions, which are GCP space", async () => {
    const { decode } = fakeDecode(1200, 800);
    const blob = new Blob(["png-bytes"], { type: "image/png" });
    const parsed = await parseImage(blob, { decode, rescale: fakeRescale() });
    expect(parsed.pixelSize).toEqual({ width: 1200, height: 800 });
  });

  it("reuses the original blob when the image is already small enough", async () => {
    // Re-encoding a 1200px PNG through a canvas would cost memory and a
    // generation of quality for nothing. Under the cap, the file IS the
    // preview.
    const { decode } = fakeDecode(1200, 800);
    const rescale = fakeRescale();
    const blob = new Blob(["png-bytes"], { type: "image/png" });
    const parsed = await parseImage(blob, { decode, rescale });
    expect(parsed.preview).toBe(blob);
    expect(parsed.previewSize).toEqual({ width: 1200, height: 800 });
    expect(rescale).not.toHaveBeenCalled();
  });

  it("downsamples past the preview cap, preserving aspect ratio", async () => {
    const { decode } = fakeDecode(8192, 4096);
    const rescale = fakeRescale();
    const parsed = await parseImage(new Blob(["big"]), { decode, rescale });
    expect(parsed.pixelSize).toEqual({ width: 8192, height: 4096 });
    expect(parsed.previewSize).toEqual({ width: 4096, height: 2048 });
    expect(rescale).toHaveBeenCalledTimes(1);
    expect(rescale.mock.calls[0][1]).toEqual({ width: 4096, height: 2048 });
  });

  it("caps on the LONGEST edge, whichever way the image is oriented", async () => {
    const { decode } = fakeDecode(2048, 8192);
    const parsed = await parseImage(new Blob(["tall"]), {
      decode,
      rescale: fakeRescale(),
    });
    expect(parsed.previewSize).toEqual({ width: 1024, height: 4096 });
  });

  it("never produces a zero-size preview for an extreme aspect ratio", async () => {
    const { decode } = fakeDecode(40000, 3);
    const parsed = await parseImage(new Blob(["strip"]), {
      decode,
      rescale: fakeRescale(),
    });
    expect(parsed.previewSize.width).toBe(4096);
    expect(parsed.previewSize.height).toBeGreaterThanOrEqual(1);
  });

  it("releases the decoded image even when rescaling throws", async () => {
    const { decode, close } = fakeDecode(8192, 4096);
    const rescale = vi.fn(async () => {
      throw new Error("canvas exploded");
    });
    await expect(
      parseImage(new Blob(["big"]), { decode, rescale }),
    ).rejects.toBeInstanceOf(UserMapImportError);
    expect(close).toHaveBeenCalled();
  });

  it("surfaces a decode failure as corrupt-file", async () => {
    const decode = vi.fn(async () => {
      throw new Error("not an image");
    });
    await expect(
      parseImage(new Blob(["junk"]), { decode, rescale: fakeRescale() }),
    ).rejects.toMatchObject({ code: "corrupt-file" });
  });

  it("closes the decoded image on the happy path too", async () => {
    const { decode, close } = fakeDecode(1200, 800);
    await parseImage(new Blob(["png"]), { decode, rescale: fakeRescale() });
    expect(close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/parsers/imageSource.test.ts`
Expected: FAIL — cannot resolve `./imageSource`.

- [ ] **Step 3: Implement** — `web/src/userMaps/parsers/imageSource.ts`:

```ts
import { UserMapImportError } from "../errors";
import type { PixelSize } from "../transform/projection";
import { PREVIEW_MAX_DIMENSION } from "./geoTiffSource";

export type DecodedImage = {
  width: number;
  height: number;
  source: CanvasImageSource;
  close: () => void;
};

export type DecodeImage = (blob: Blob) => Promise<DecodedImage>;
export type RescaleImage = (decoded: DecodedImage, size: PixelSize) => Promise<Blob>;

export type ParsedImage = {
  /** ORIGINAL dimensions. GCPs live in this space, never in preview space. */
  pixelSize: PixelSize;
  preview: Blob;
  previewSize: PixelSize;
};

/** jsdom has neither createImageBitmap nor a canvas by default, so both
 * halves are injectable seams — the same closure-injection convention
 * `geoTiffSource.ts` uses for `makePreview`. */
async function decodeWithImageBitmap(blob: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(blob);
  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    close: () => bitmap.close(),
  };
}

async function rescaleWithCanvas(
  decoded: DecodedImage,
  size: PixelSize,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  }
  ctx.drawImage(decoded.source, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(
          new UserMapImportError(
            "corrupt-file",
            "This browser could not prepare the map preview.",
          ),
        );
      }
    }, "image/png");
  });
}

/**
 * Decodes a plain scan for the georeferencer. Unlike the GeoTIFF path there
 * is no georeferencing to extract — only pixels and a display-sized preview.
 */
export async function parseImage(
  blob: Blob,
  options: { decode?: DecodeImage; rescale?: RescaleImage } = {},
): Promise<ParsedImage> {
  const decode = options.decode ?? decodeWithImageBitmap;
  const rescale = options.rescale ?? rescaleWithCanvas;

  let decoded: DecodedImage;
  try {
    decoded = await decode(blob);
  } catch {
    throw new UserMapImportError(
      "corrupt-file",
      "This image could not be read. It may be truncated or in an " +
        "unsupported format.",
    );
  }

  try {
    const pixelSize: PixelSize = {
      width: decoded.width,
      height: decoded.height,
    };
    const longestEdge = Math.max(pixelSize.width, pixelSize.height);
    if (longestEdge <= PREVIEW_MAX_DIMENSION) {
      // Already display-sized: the uploaded file is its own preview. Avoids a
      // pointless re-encode and a second full-resolution copy in memory.
      return { pixelSize, preview: blob, previewSize: pixelSize };
    }
    const scale = PREVIEW_MAX_DIMENSION / longestEdge;
    const previewSize: PixelSize = {
      // Math.max(1, ...) guards extreme aspect ratios: a 40000x3 strip would
      // otherwise round its height to 0 and produce an unusable canvas.
      width: Math.max(1, Math.round(pixelSize.width * scale)),
      height: Math.max(1, Math.round(pixelSize.height * scale)),
    };
    const preview = await rescale(decoded, previewSize);
    return { pixelSize, preview, previewSize };
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  } finally {
    // Always release the decoded bitmap: on iOS Safari these count against an
    // aggregate canvas-memory budget, and leaking one per failed import is a
    // fast route to a blank map.
    decoded.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/parsers/imageSource.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Make `parseGeoTiff` report missing georeferencing instead of throwing**

In `web/src/userMaps/parsers/geoTiffSource.ts`, change the `ParsedGeoTiff` type:

```ts
export type ParsedGeoTiff = {
  pixelSize: PixelSize;
  /** null when the file carries no usable georeferencing — the caller then
   * routes it to the georeferencer as a plain scan. */
  georef: EmbeddedGeoref | null;
  preview: Blob;
  previewSize: PixelSize;
};
```

Then replace the throwing block **and the corner-projection loop below it in
one go**. The file already declares `const georef` at line 183 and
dereferences it at line 197, so a replacement that stops at
`validateCrs(crs);` produces `TS2451: Cannot redeclare block-scoped variable
'georef'` plus an unguarded null deref on exactly the plain-TIFF path this
task enables. Find this whole run (lines 171–198 as of `11780341f`):

```ts
  const pixelIsPoint = geoKeys.GTRasterTypeGeoKey === 2;
  const geotransform = geotransformFrom(directory, pixelIsPoint);
  const crs = crsFrom(geoKeys);
  if (!geotransform || !crs) {
    throw new UserMapImportError(
      "no-georeferencing",
      "No georeferencing found in this file. The georeferencer (next update) " +
        "will handle plain scans.",
    );
  }
  validateCrs(crs); // throws unsupported-crs with the CRS in the message

  const georef: EmbeddedGeoref = { kind: "embedded", crs, geotransform };
  // A CRS can pass validateCrs yet still be paired with a geotransform whose
  // tiepoint doesn't actually fall inside that CRS's domain (e.g. an
  // out-of-zone UTM tiepoint) — proj4 doesn't throw for that, it silently
  // returns non-finite coordinates (see pixelToLatLng). Project the four
  // raster corners now, at import time, so that failure aborts the import
  // instead of surfacing as triangles stretched across the globe at render
  // time.
  for (const [cx, cy] of [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const) {
    pixelToLatLng(georef, cx, cy); // throws invalid-georeferencing on failure
  }
```

Replace with:

```ts
  const pixelIsPoint = geoKeys.GTRasterTypeGeoKey === 2;
  const geotransform = geotransformFrom(directory, pixelIsPoint);
  const crs = crsFrom(geoKeys);
  // A TIFF with no geo tags is not an error any more: it is a scan, and only
  // geotiff.js can decode its pixels, so the preview below still gets built
  // and the caller sends the map to the georeferencer.
  const georef: EmbeddedGeoref | null =
    geotransform && crs ? { kind: "embedded", crs, geotransform } : null;
  if (georef) {
    // An unreadable CRS is still a hard failure: we would be guessing where
    // on Earth the raster belongs. Georeferencing it by hand remains an
    // option, but silently doing that would hide a fixable export mistake.
    validateCrs(georef.crs);
    // A CRS can pass validateCrs yet still be paired with a geotransform
    // whose tiepoint doesn't actually fall inside that CRS's domain (e.g. an
    // out-of-zone UTM tiepoint) — proj4 doesn't throw for that, it silently
    // returns non-finite coordinates (see pixelToLatLng). Project the four
    // raster corners now, at import time, so that failure aborts the import
    // instead of surfacing as triangles stretched across the globe at render
    // time. Nothing to check on the null branch: there is no transform yet.
    for (const [cx, cy] of [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ] as const) {
      pixelToLatLng(georef, cx, cy); // throws invalid-georeferencing on failure
    }
  }
```

The return statement already reads `georef,` (it was hoisted into a variable
by `11780341f`), so it needs no change — confirm that before moving on rather
than assuming it.

- [ ] **Step 6: Update the two tests that asserted the old rejection**

In `web/src/userMaps/parsers/geoTiffSource.test.ts`, replace the test named
`"rejects TIFFs without georeferencing as no-georeferencing"` with:

```ts
  it("returns a null georef for TIFFs without georeferencing", async () => {
    // PR 2 changed this from a hard failure: a plain TIFF scan is now a
    // georeferencer job, and geotiff.js is the only thing that can decode it.
    // ProjectedCSTypeGeoKey: 0 is load-bearing, and is why the old test used
    // it too: geotiff@2.1.3's writer auto-injects a whole-globe WGS84
    // georeference unless one of the CRS geokeys is an own property, so
    // plainTiff({}) round-trips as a GEOREFERENCED file and this assertion
    // would fail. Keep the argument exactly as the replaced test had it.
    const buffer = await plainTiff({ ProjectedCSTypeGeoKey: 0 });
    const parsed = await parseGeoTiff(buffer, { makePreview: fakePreview() });
    expect(parsed.georef).toBeNull();
    expect(parsed.preview.type).toBe("image/png");
  });
```

Replace the test named `"rejects a truncated ModelTransformation as no-georeferencing"` with:

```ts
  it("returns a null georef for a truncated ModelTransformation", async () => {
    const buffer = await plainTiff({
      ModelTransformation: [1, 0, 0, 0, 0, 1, 0, 0], // 8 of 16 doubles
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    });
    const parsed = await parseGeoTiff(buffer, { makePreview: fakePreview() });
    expect(parsed.georef).toBeNull();
  });
```

And the Task 2 multi-tiepoint test becomes:

```ts
  it("returns a null georef for multiple tiepoints without a matrix", async () => {
    const buffer = await plainTiff({
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [
        0, 0, 0, 500000, 5000000, 0,
        8, 6, 0, 500080, 4999940, 0,
      ],
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    });
    const parsed = await parseGeoTiff(buffer, { makePreview: fakePreview() });
    expect(parsed.georef).toBeNull();
  });
```

- [ ] **Step 7: Run the parser tests**

Run: `cd web && npx vitest run src/userMaps/parsers/`
Expected: PASS. `tsc` will also flag `geoTiffWorker.ts` if its `WorkerReply` type narrows `georef`; it re-exports `ParsedGeoTiff` so no change should be needed — confirm with `npx tsc -b`.

- [ ] **Step 8: Typecheck and lint**

Run: `cd web && npx tsc -b && npx eslint src/userMaps`
Expected: both silent. If `tsc` reports that `UserMapLayers.tsx` can no longer narrow `record.georef.kind`, leave it — Task 6 rewrites that file.

- [ ] **Step 9: Commit**

```bash
git add web/src/userMaps/parsers
git commit -m "feat(web): decode plain scans and treat missing georeferencing as a scan"
```

---
### Task 5: `useUserMaps` accepts scans, creates drafts, owns the session id

**Files:**
- Modify: `web/src/userMaps/useUserMaps.ts`
- Modify: `web/src/userMaps/useUserMaps.test.ts`

**Interfaces:**
- Consumes: `parseImage`, `ParsedImage` (`./parsers/imageSource`); `MIN_GCPS_FOR_AFFINE` (`./transform/affine`); `ParsedGeoTiff` with the nullable `georef` (Task 4).
- Produces, added to `UserMapsApi`:
  - `georeferencingId: string | null`
  - `beginGeoreference: (id: string) => void`
  - `endGeoreference: () => void`
  - `saveGcps: (id: string, gcps: Gcp[]) => Promise<void>`
  - `editingMap: VisibleUserMap | null` — the map under edit, excluded from `visibleMaps`
  - `needsGeoreferencing: (record: UserMapRecord) => boolean`
- `ImportOutcome` gains an optional `needsGeoreferencing?: boolean` on the `ok` variant so the UI can auto-open the panel.

- [ ] **Step 1: Add the failing tests** to `web/src/userMaps/useUserMaps.test.ts`

Read the existing file first. **It has no `store` variable** — an earlier draft
of this plan invented one. What it has is a module-level `let factory:
IDBFactory` (freshly constructed per test) and an `options(overrides)` helper
that supplies `openStore: () => UserMapStore.open(factory)` and `parse:
testParse()`. Every new test goes through that helper; none of them may
construct its own options object, or it loses the isolated database.

Extend the file's existing helpers — add `parseImage` to `options()` so no
test can accidentally reach the real `createImageBitmap` (which jsdom does not
have), and add the two magic-byte file helpers:

```ts
/**
 * jsdom has no createImageBitmap, so parseImage is injected everywhere the
 * same way `parse` already is. Every PNG/JPEG test MUST go through
 * `options()` — a bare `useUserMaps({...})` would take the real decode path
 * and reject on a missing global.
 */
function testParseImage() {
  return async () => ({
    pixelSize: { width: 1200, height: 800 },
    preview: new Blob(["p"], { type: "image/png" }),
    previewSize: { width: 1200, height: 800 },
  });
}

function pngFile(name: string): File {
  // Real PNG magic bytes: sniffFileType reads them, so a placeholder blob
  // would take the "unrecognized" branch and never reach parseImage.
  const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([magic], name, { type: "image/png" });
}

function tiffFile(name: string): File {
  const magic = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  return new File([magic], name, { type: "image/tiff" });
}
```

…and add `parseImage: testParseImage(),` to the object `options()` returns,
beside `parse: testParse()`.

Add `import type { Gcp, GcpGeoref } from "./types";` to the file's imports —
the assertions below name both.

Then append:

```ts
  it("imports a PNG as an ungeoreferenced draft", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("church-1888.png")]);
    });
    expect(result.current.records).toHaveLength(1);
    const [record] = result.current.records;
    expect(record.source).toBe("image");
    expect(record.georef).toEqual({ kind: "gcp", gcps: [], method: "affine" });
    expect(result.current.needsGeoreferencing(record)).toBe(true);
    expect(result.current.outcomes[0]).toMatchObject({
      ok: true,
      needsGeoreferencing: true,
    });
  });

  it("opens the georeferencer for a freshly imported scan", async () => {
    // Spec: an imported scan opens the panel. Without this the outcome's
    // needsGeoreferencing flag is produced and never consumed, and the user
    // has to find the new row and click Georeference themselves.
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("church-1888.png")]);
    });
    expect(result.current.georeferencingId).toBe(result.current.records[0].id);
    expect(result.current.editingMap?.record.id).toBe(
      result.current.records[0].id,
    );
  });

  it("does not open the georeferencer for a map that arrives already placed", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.georeferencingId).toBeNull();
  });

  it("routes an ungeoreferenced TIFF to the georeferencer rather than failing", async () => {
    const { result } = renderHook(() =>
      useUserMaps(
        options({
          parse: async () => ({
            pixelSize: { width: 8, height: 6 },
            georef: null,
            preview: new Blob(["preview"], { type: "image/png" }),
            previewSize: { width: 8, height: 6 },
          }),
        }),
      ),
    );
    await act(async () => {
      await result.current.importFiles([tiffFile("scan.tif")]);
    });
    const [record] = result.current.records;
    expect(record.source).toBe("geotiff");
    expect(record.georef).toEqual({ kind: "gcp", gcps: [], method: "affine" });
  });

  it("hides the map under edit from visibleMaps and exposes it as editingMap", async () => {
    // The georeferencer drapes the draft itself, through a mesh that changes
    // on every pointer move. If the same map were ALSO in visibleMaps it
    // would be drawn twice and the saved-map layer would rebuild on every
    // drag frame.
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("scan.png")]);
    });
    const id = result.current.records[0].id;
    await act(async () => {
      result.current.setEnabled(id, true);
      result.current.beginGeoreference(id);
    });
    expect(result.current.georeferencingId).toBe(id);
    expect(result.current.visibleMaps.map((m) => m.record.id)).not.toContain(id);
    expect(result.current.editingMap?.record.id).toBe(id);
    await act(async () => {
      result.current.endGeoreference();
    });
    expect(result.current.editingMap).toBeNull();
  });

  it("keeps editingMap referentially stable across an unrelated re-render", async () => {
    // App memoizes the georeference binding on `editingMap`. A fresh literal
    // every render busts that memo, hands MapCanvas a new `draft` object on
    // every unrelated state change, and defeats the whole hot path Task 6
    // exists to protect.
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("scan.png")]);
    });
    const before = result.current.editingMap;
    expect(before).not.toBeNull();
    // An unrelated import failure: new outcomes, importing/importingLabel
    // toggling, no change to the map under edit.
    await act(async () => {
      await result.current.importFiles([
        new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "plan.pdf"),
      ]);
    });
    expect(result.current.editingMap).toBe(before);
  });

  it("persists saved GCPs to IndexedDB and leaves every other record's identity untouched", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([pngFile("a.png"), pngFile("b.png")]);
    });
    const [first, second] = result.current.records;
    const secondBefore = second;
    const saved: Gcp[] = [
      { id: "g0", pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -61 } },
    ];
    await act(async () => {
      await result.current.saveGcps(first.id, saved);
    });
    const updated = result.current.records.find((r) => r.id === first.id);
    expect(updated?.georef).toMatchObject({ kind: "gcp", method: "affine" });
    expect((updated?.georef as GcpGeoref).gcps).toHaveLength(1);
    // The untouched record must be the SAME object, or UserMapLayers tears
    // down and rebuilds its Leaflet layer for nothing.
    expect(result.current.records.find((r) => r.id === second.id)).toBe(
      secondBefore,
    );

    // The half that had zero coverage, and was broken: a round trip through
    // the actual database. The first implementation assigned the new record
    // inside a setRecords updater and read it back on the next line, so the
    // write silently never happened whenever React deferred the updater —
    // which App always makes it do. In-memory `records` looked perfect.
    const reopened = await UserMapStore.open(factory);
    const persisted = await reopened.listUserMaps();
    const persistedGeoref = persisted.find((r) => r.id === first.id)
      ?.georef as GcpGeoref;
    expect(persistedGeoref.gcps).toEqual(saved);
    // …and the raster the metadata-only write must NOT have touched.
    expect(await (await reopened.getPreviewBlob(first.id))?.text()).toBe("p");
  });

  it("keeps points for the session when the metadata write fails", async () => {
    const failingStore = {
      listUserMaps: async () => [],
      saveUserMap: async () => {},
      putUserMapRecord: async () => {
        throw new Error("quota");
      },
      getPreviewBlob: async () => null,
      deleteUserMap: async () => {},
      close: () => {},
    } as unknown as UserMapStore;
    const { result } = renderHook(() =>
      useUserMaps(options({ openStore: async () => failingStore })),
    );
    await act(async () => {
      await result.current.importFiles([pngFile("a.png")]);
    });
    await act(async () => {
      await result.current.saveGcps(result.current.records[0].id, [
        { id: "g0", pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -61 } },
      ]);
    });
    expect(
      (result.current.records[0].georef as GcpGeoref).gcps,
    ).toHaveLength(1);
    expect(result.current.storageError).toContain("close the tab");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/userMaps/useUserMaps.test.ts`
Expected: FAIL — `parseImage` option unknown, `needsGeoreferencing` undefined.

- [ ] **Step 3: Implement the hook changes** — `web/src/userMaps/useUserMaps.ts`

Add imports (note `useLayoutEffect` and `useMemo` join the existing React
import):

```ts
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseImage, type ParsedImage } from "./parsers/imageSource";
import { MIN_GCPS_FOR_AFFINE } from "./transform/affine";
import type { Gcp, GcpGeoref, UserMapRecord, UserMapSource } from "./types";
```

Add to the options object and refs:

```ts
  parseImage?: (blob: Blob) => Promise<ParsedImage>;
```

```ts
  const parseImageRef = useRef(options.parseImage ?? parseImage);
  const [georeferencingId, setGeoreferencingId] = useState<string | null>(null);
```

And a mirror of `records`, which `saveGcps` reads:

```ts
  // `saveGcps` has to build the updated record BEFORE handing it to
  // setRecords (see below), so it needs the current list without capturing it
  // in a closure — capturing it would either go stale or churn saveGcps's
  // identity on every import. Layout, not passive: saveGcps is called from a
  // debounce timer that can fire in the same frame as a record change.
  const recordsRef = useRef(records);
  useLayoutEffect(() => {
    recordsRef.current = records;
  }, [records]);
```

Add the module-level helper (above the hook):

```ts
const EMPTY_GCP_GEOREF: GcpGeoref = { kind: "gcp", gcps: [], method: "affine" };

/**
 * A GCP map with fewer than three points has no solvable transform, so it
 * cannot be drawn anywhere yet. The layer row shows a Georeference button
 * instead of an opacity slider for exactly this set.
 */
export function needsGeoreferencing(record: UserMapRecord): boolean {
  return (
    record.georef.kind === "gcp" &&
    record.georef.gcps.length < MIN_GCPS_FOR_AFFINE
  );
}
```

Replace the type-rejection block inside `importFiles`. Find:

```ts
            if (type === "pdf" || type === "png" || type === "jpeg") {
              throw new UserMapImportError("unsupported-type", COMING_SOON_MESSAGE);
            }
            if (type !== "geotiff") {
```

Replace with:

```ts
            if (type === "pdf") {
              throw new UserMapImportError("unsupported-type", PDF_MESSAGE);
            }
            if (type !== "geotiff" && type !== "png" && type !== "jpeg") {
```

Update the two message constants at module scope:

```ts
const PDF_MESSAGE =
  "PDF maps arrive in a later update. Convert with " +
  "`gdal_translate in.pdf out.tif`, or export the page as a PNG and " +
  "georeference that.";

const UNRECOGNIZED_MESSAGE =
  "Not a recognized map file. GeoTIFF, PNG, and JPEG all work.";
```

…and use `UNRECOGNIZED_MESSAGE` in the `type !== …` branch. Delete `COMING_SOON_MESSAGE`.

Replace the parse-and-build-record block. Find the section from
`const parsed = await parseRef.current(buffer);` through the `const record: UserMapRecord = { … };` literal, and replace with:

```ts
            const isImage = type === "png" || type === "jpeg";
            // parseGeoTiff may transfer `buffer` to a worker, so this is the
            // last use of it on this thread. parseImage reads the File
            // directly, which is why the two branches take different inputs.
            const parsed = isImage
              ? await parseImageRef.current(file)
              : await parseRef.current(buffer);
            const source: UserMapSource = isImage ? "image" : "geotiff";
            const embedded = isImage ? null : (parsed as ParsedGeoTiff).georef;
            const record: UserMapRecord = {
              id: generateId(),
              name: stripExtension(file.name),
              source,
              createdAt: new Date().toISOString(),
              pixelSize: parsed.pixelSize,
              // No embedded georeferencing means this is a scan: it starts
              // life as an empty GCP record and opens in the georeferencer.
              georef: embedded ?? EMPTY_GCP_GEOREF,
            };
```

In the success push, add the flag:

```ts
            batch.push({
              fileName: file.name,
              ok: true,
              id: record.id,
              note,
              needsGeoreferencing: needsGeoreferencing(record),
            });
```

And consume that flag, in the `finally` block, immediately after
`setOutcomes(batch);`:

```ts
        // Spec: an imported scan opens the panel. Only the FIRST draft of a
        // batch — the panel edits one map at a time, and the rest keep their
        // "Needs georeferencing" rows in the layer list. Without this the
        // flag above is produced and never consumed.
        for (const outcome of batch) {
          if (outcome.ok && outcome.needsGeoreferencing) {
            setGeoreferencingId(outcome.id);
            break;
          }
        }
```

Add the session and persistence callbacks (after `setOpacity`):

```ts
  const beginGeoreference = useCallback((id: string) => {
    setGeoreferencingId(id);
  }, []);

  const endGeoreference = useCallback(() => {
    setGeoreferencingId(null);
  }, []);

  const saveGcps = useCallback(
    async (id: string, gcps: Gcp[]) => {
      // Built OUTSIDE the updater, deliberately. An earlier version assigned
      // `saved` inside the setRecords updater and read it on the next line;
      // React defers an updater whenever the owning fiber already has queued
      // work — which `App` always does — so `saved` was still null and the
      // IndexedDB write never ran. Measured: "captured after save (with a
      // prior queued update): null". The in-memory list still looked right,
      // which is why the original test caught nothing.
      const existing = recordsRef.current.find((record) => record.id === id);
      if (!existing) {
        return;
      }
      const saved: UserMapRecord = {
        ...existing,
        georef: { kind: "gcp", gcps, method: "affine" },
      };
      // The updater is now pure: it maps one entry to an already-built
      // object and returns every other entry BY REFERENCE, because
      // UserMapLayers keys its layer-construction effect on record identity
      // and rebuilding untouched records would re-decode their bitmaps.
      // Being pure also makes it safe under StrictMode's double invocation.
      setRecords((prev) =>
        prev.map((record) => (record.id === id ? saved : record)),
      );
      try {
        await (await store()).putUserMapRecord(saved);
      } catch {
        // Same contract as import: a storage failure keeps the map usable
        // for this session rather than discarding the user's points.
        setStorageError(
          "Couldn't save these points — they stay available until you close " +
            "the tab.",
        );
      }
    },
    [store],
  );
```

Update the derived values and the return object:

```ts
  const visibleMaps: VisibleUserMap[] = records
    .filter(
      (r) =>
        r.id !== georeferencingId &&
        (uiState[r.id]?.enabled ?? false) &&
        previewUrls[r.id] &&
        !needsGeoreferencing(r),
    )
    .map((r) => ({
      record: r,
      previewUrl: previewUrls[r.id],
      opacity: uiState[r.id]?.opacity ?? DEFAULT_OPACITY,
    }));

  const editingRecord = records.find((r) => r.id === georeferencingId) ?? null;
  const editingPreviewUrl = editingRecord ? previewUrls[editingRecord.id] : undefined;
  const editingOpacity = editingRecord
    ? (uiState[editingRecord.id]?.opacity ?? DEFAULT_OPACITY)
    : DEFAULT_OPACITY;
  // Memoized, unlike visibleMaps. App keys its georeference-binding memo on
  // this object, so a fresh literal per render would hand MapCanvas a new
  // `draft` on every unrelated state change and defeat the hot path Task 6
  // exists to protect. The three inputs are a stable record reference, a blob
  // URL string, and a number, so the memo actually holds.
  const editingMap: VisibleUserMap | null = useMemo(
    () =>
      editingRecord && editingPreviewUrl
        ? {
            record: editingRecord,
            previewUrl: editingPreviewUrl,
            opacity: editingOpacity,
          }
        : null,
    [editingRecord, editingPreviewUrl, editingOpacity],
  );
```

Add `georeferencingId`, `editingMap`, `beginGeoreference`, `endGeoreference`, `saveGcps`, and `needsGeoreferencing` to the returned object and to the `UserMapsApi` type:

```ts
  georeferencingId: string | null;
  editingMap: VisibleUserMap | null;
  beginGeoreference: (id: string) => void;
  endGeoreference: () => void;
  saveGcps: (id: string, gcps: Gcp[]) => Promise<void>;
  needsGeoreferencing: (record: UserMapRecord) => boolean;
```

…and widen `ImportOutcome`'s `ok` variant:

```ts
export type ImportOutcome =
  | {
      fileName: string;
      ok: true;
      id: string;
      note?: string;
      /** Set when the import produced an empty GCP draft; App opens the panel. */
      needsGeoreferencing?: boolean;
    }
  | { fileName: string; ok: false; message: string };
```

- [ ] **Step 4: Add `putUserMapRecord` to the store** — `web/src/userMaps/store/userMapStore.ts`

```ts
  /**
   * Metadata-only write. Saving GCPs must not rewrite the raster and preview
   * blobs — during a georeferencing session this runs every time the user
   * finishes a drag, and re-storing tens of megabytes each time would stall
   * the main thread and burn through the origin's quota.
   */
  async putUserMapRecord(record: UserMapRecord): Promise<void> {
    const tx = this.db.transaction(MAPS, "readwrite");
    tx.objectStore(MAPS).put(record);
    await transactionDone(tx);
  }
```

Add a store test alongside the existing ones:

```ts
  it("updates a record without touching its blobs", async () => {
    const raster = new Blob(["raster-bytes"]);
    const preview = new Blob(["preview-bytes"], { type: "image/png" });
    await store.saveUserMap(record("a", "2026-07-25T00:00:00.000Z"), raster, preview);
    await store.putUserMapRecord({
      ...record("a", "2026-07-25T00:00:00.000Z"),
      georef: {
        kind: "gcp",
        method: "affine",
        gcps: [{ id: "g0", pixel: { x: 1, y: 2 }, map: { lat: 46, lng: -61 } }],
      },
    });
    const [listed] = await store.listUserMaps();
    expect(listed.georef).toMatchObject({ kind: "gcp" });
    expect(await (await store.getRasterBlob("a"))?.text()).toBe("raster-bytes");
  });
```

- [ ] **Step 5: Run the hook and store tests**

Run: `cd web && npx vitest run src/userMaps/useUserMaps.test.ts src/userMaps/store/`
Expected: PASS, including every pre-existing record-identity assertion. **If a record-identity test now fails, do not relax it** — it is guarding a real re-decode regression. Find the `setRecords` call that stopped reusing object references.

- [ ] **Step 6: Commit**

```bash
git add web/src/userMaps/useUserMaps.ts web/src/userMaps/useUserMaps.test.ts web/src/userMaps/store
git commit -m "feat(web): import plain scans as georeferencing drafts"
```

---
### Task 6: `UserMapLayers` renders GCP maps and the live draft

**Files:**
- Create: `web/src/userMaps/recordMesh.ts`
- Test: `web/src/userMaps/recordMesh.test.ts`
- Modify: `web/src/userMaps/components/UserMapLayers.tsx`
- Modify: `web/src/userMaps/components/UserMapLayers.test.tsx`

**Interfaces:**
- Consumes: `buildGcpLatLngMesh` (`./transform/gcpMesh`), `solveAffineFromGcps` (`./transform/affine`), `buildLatLngMesh` (`./transform/projection`), `setLatLngMesh` on `WarpedRasterLayer` (landed in Task 1).
- Produces:
  - `meshForRecord(record: UserMapRecord): LatLngPoint[][] | null`, from **`recordMesh.ts`**, not from the component.
  - `type DraftUserMap = VisibleUserMap & { mesh: LatLngPoint[][] | null }`
  - `<UserMapLayers maps={…} draft={…} />` — `draft?: DraftUserMap | null`.

**Why `meshForRecord` gets its own `.ts` module.** Exporting a plain function
from a `.tsx` file is a `react-refresh/only-export-components` **error** in
this repo (verified — see the facts table), and `npx eslint src` is clean
today, so putting it in `UserMapLayers.tsx` would introduce a new lint failure
that Task 12's gate catches four tasks later. Splitting it out is also the
cheaper test: `recordMesh.test.ts` needs no React, no jsdom canvas, and no
react-leaflet mock.

- [ ] **Step 1: Write the failing mesh test** — `web/src/userMaps/recordMesh.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { meshForRecord } from "./recordMesh";
import type { UserMapRecord } from "./types";

const GCP_RECORD: UserMapRecord = {
  id: "g",
  name: "Church scan",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: {
    kind: "gcp",
    method: "affine",
    gcps: [
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
      { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
      { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
    ],
  },
};

const EMBEDDED_RECORD: UserMapRecord = {
  id: "e",
  name: "Fixture map",
  source: "geotiff",
  createdAt: "2026-07-24T00:00:00.000Z",
  pixelSize: { width: 8, height: 6 },
  georef: {
    kind: "embedded",
    crs: "EPSG:26920",
    geotransform: [500000, 10, 0, 5000000, 0, -10],
  },
};

describe("meshForRecord", () => {
  it("builds a solved mesh for a GCP record", () => {
    const mesh = meshForRecord(GCP_RECORD);
    expect(mesh).not.toBeNull();
    // AFFINE_GRID_SIZE is 1, so a GCP mesh is a single cell.
    expect(mesh).toHaveLength(2);
    expect(mesh![0][0].lat).toBeCloseTo(46.1, 4);
  });

  it("returns null below the three-point minimum", () => {
    expect(
      meshForRecord({
        ...GCP_RECORD,
        georef: { kind: "gcp", method: "affine", gcps: [] },
      }),
    ).toBeNull();
  });

  it("returns null for points too close to a straight line on the SCAN", () => {
    expect(
      meshForRecord({
        ...GCP_RECORD,
        georef: {
          kind: "gcp",
          method: "affine",
          gcps: [
            { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -61 } },
            { id: "b", pixel: { x: 10, y: 10 }, map: { lat: 46.1, lng: -61.1 } },
            { id: "c", pixel: { x: 20, y: 20 }, map: { lat: 46.2, lng: -61.2 } },
          ],
        },
      }),
    ).toBeNull();
  });

  it("returns null for points on one meridian, where only the SOLVE is degenerate", () => {
    // The case that motivated MIN_ANISOTROPY_RATIO: the scan points are a
    // textbook triangle, but three map clicks down a meridian are exactly
    // collinear in Mercator, so the linear part is singular, the drape has
    // zero area, and every residual reads a perfect 0 m.
    expect(
      meshForRecord({
        ...GCP_RECORD,
        georef: {
          kind: "gcp",
          method: "affine",
          gcps: [
            { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
            { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
            { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.2, lng: -61.0 } },
          ],
        },
      }),
    ).toBeNull();
  });

  it("still builds an 8x8 mesh for embedded georeferencing", () => {
    // Embedded rasters go pixel -> UTM -> WGS84 -> Mercator, and UTM curves,
    // so they keep the dense lattice. Only the GCP path is exact at 1x1.
    expect(meshForRecord(EMBEDDED_RECORD)).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Implement** — `web/src/userMaps/recordMesh.ts`:

```ts
import { solveAffineFromGcps } from "./transform/affine";
import { buildGcpLatLngMesh } from "./transform/gcpMesh";
import { buildLatLngMesh, type LatLngPoint } from "./transform/projection";
import type { UserMapRecord } from "./types";

/**
 * Geographic lattice for a saved record, or null when the record cannot be
 * placed yet: fewer than three points, a point cloud too thin to determine a
 * transform, or a solved transform the acceptance gates in `affine.ts`
 * refuse (non-finite, or squashed past MIN_ANISOTROPY_RATIO). Callers treat
 * null as "draw nothing", never as "draw at the origin".
 *
 * Its own module rather than part of UserMapLayers.tsx: exporting a function
 * from a .tsx file is a react-refresh/only-export-components error here.
 */
export function meshForRecord(record: UserMapRecord): LatLngPoint[][] | null {
  if (record.georef.kind === "embedded") {
    return buildLatLngMesh(record.georef, record.pixelSize);
  }
  // pixelSize is the ORIGINAL raster's size, which is the space GCP pixels
  // live in — and is what solveAffine's spread gate normalises against, so
  // passing the preview size here would silently change what gets accepted.
  const params = solveAffineFromGcps(record.georef.gcps);
  return params ? buildGcpLatLngMesh(params, record.pixelSize) : null;
}
```

- [ ] **Step 3: Run the mesh test**

Run: `cd web && npx vitest run src/userMaps/recordMesh.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 4: Add the failing layer tests** to `web/src/userMaps/components/UserMapLayers.test.tsx`

Keep every existing test — they pin the record-identity contract. Extend both
the hoisted `layerInstances` type **and** the `WarpedRasterLayer` class mock
with `setLatLngMesh`; the type is easy to miss and `tsc -b` only fails
about it several tasks later:

```ts
const layerInstances = vi.hoisted(
  () =>
    [] as Array<{
      options: unknown;
      setOpacity: ReturnType<typeof vi.fn>;
      setLatLngMesh: ReturnType<typeof vi.fn>;
    }>,
);

vi.mock("../render/WarpedRasterLayer", () => ({
  WarpedRasterLayer: class {
    options: unknown;
    setOpacity = vi.fn();
    setLatLngMesh = vi.fn();
    constructor(options: unknown) {
      this.options = options;
      layerInstances.push(this as never);
    }
    addTo(map: { addLayer: (l: unknown) => void }) {
      map.addLayer(this);
      return this;
    }
    remove() {
      stubMapApi.removeLayer(this);
    }
  },
}));
```

Then append:

```tsx
const GCP_RECORD: UserMapRecord = {
  id: "g",
  name: "Church scan",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: {
    kind: "gcp",
    method: "affine",
    gcps: [
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
      { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
      { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
    ],
  },
};

describe("UserMapLayers draft overlay", () => {
  it("updates the draft mesh without rebuilding the layer or re-decoding", async () => {
    // The whole point of the draft path: a GCP drag re-solves on every
    // pointer move, and rebuilding the layer would re-run createImageBitmap
    // on a multi-megapixel preview each frame.
    const createImageBitmapMock = vi.fn(async () => ({
      width: 1200,
      height: 800,
      close: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);

    const meshA = [
      [{ lat: 46.1, lng: -61.2 }, { lat: 46.1, lng: -61.0 }],
      [{ lat: 46.0, lng: -61.2 }, { lat: 46.0, lng: -61.0 }],
    ];
    const meshB = [
      [{ lat: 46.2, lng: -61.2 }, { lat: 46.2, lng: -61.0 }],
      [{ lat: 46.1, lng: -61.2 }, { lat: 46.1, lng: -61.0 }],
    ];
    const draft = {
      record: GCP_RECORD,
      previewUrl: "blob:draft",
      opacity: 0.7,
      mesh: meshA,
    };
    const { rerender } = render(<UserMapLayers maps={[]} draft={draft} />);
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));

    rerender(<UserMapLayers maps={[]} draft={{ ...draft, mesh: meshB }} />);
    await waitFor(() =>
      expect(layerInstances[0].setLatLngMesh).toHaveBeenCalledWith(meshB),
    );
    expect(layerInstances).toHaveLength(1);
    expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1);
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
  });

  it("draws nothing while the draft has too few points to solve", async () => {
    // Anchor the wait on something that DOES happen. An earlier draft of this
    // test waited for `createPane`, which the null-mesh branch never reaches:
    // `ensurePane` lives inside the bitmap `.then()`, past the `hasMesh` early
    // return, so the assertion could only ever time out. Rendering a saved map
    // alongside the draft gives a real event to wait for, and makes the
    // "exactly one layer" assertion meaningful rather than vacuous.
    stubBitmapLoading();
    render(
      <UserMapLayers
        maps={[{ record, previewUrl: "blob:saved", opacity: 0.7 }]}
        draft={{
          record: GCP_RECORD,
          previewUrl: "blob:draft",
          opacity: 0.3,
          mesh: null,
        }}
      />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    expect(layerInstances).toHaveLength(1);
    // The one layer built is the saved map's, not the draft's.
    expect((layerInstances[0].options as { opacity: number }).opacity).toBe(0.7);
  });

  it("does not re-push geometry when a saved map re-renders unchanged", async () => {
    // `useUserMaps` rebuilds its VisibleUserMap wrappers every render, so the
    // wrapper object is always new while `record` stays referentially stable.
    // Deriving the mesh in the render body returns a fresh array each time,
    // and the geometry layout effect is keyed on it — measured 3 setLatLngMesh
    // calls after 3 identical re-renders. During a drag that is every saved
    // layer rebuilding its lattice and repainting on every pointer move.
    stubBitmapLoading();
    const { rerender } = render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    const pushesAfterMount = layerInstances[0].setLatLngMesh.mock.calls.length;
    // Fresh wrapper object each time, same `record` reference — exactly what
    // useUserMaps hands down on an unrelated state change.
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    expect(layerInstances[0].setLatLngMesh.mock.calls.length).toBe(
      pushesAfterMount,
    );
  });
});
```

`UserMapRecord` is already imported by the file; nothing else is needed.

- [ ] **Step 5: Run to verify they fail**

Run: `cd web && npx vitest run src/userMaps/components/UserMapLayers.test.tsx`
Expected: FAIL — `draft` prop unknown.

- [ ] **Step 6: Implement** — replace the body of `web/src/userMaps/components/UserMapLayers.tsx`:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import {
  USER_MAPS_PANE,
  USER_MAPS_PANE_Z_INDEX,
} from "../../components/mapPanes";
import { meshForRecord } from "../recordMesh";
import type { LatLngPoint } from "../transform/projection";
import { WarpedRasterLayer } from "../render/WarpedRasterLayer";
import type { UserMapRecord } from "../types";

export type VisibleUserMap = {
  record: UserMapRecord;
  previewUrl: string;
  opacity: number;
};

/** The map being georeferenced. Its mesh is owned by the session, not derived
 * from the record, because it changes on every pointer move during a drag. */
export type DraftUserMap = VisibleUserMap & { mesh: LatLngPoint[][] | null };

/** Idempotent: Leaflet keeps panes for the map's lifetime. */
function ensurePane(map: ReturnType<typeof useMap>): void {
  if (!map.getPane(USER_MAPS_PANE)) {
    const pane = map.createPane(USER_MAPS_PANE);
    pane.style.zIndex = String(USER_MAPS_PANE_Z_INDEX);
  }
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  return createImageBitmap(await response.blob());
}

/**
 * One Leaflet layer per raster. `mesh` is passed separately from `record`
 * rather than derived inside the build effect, so the draft can re-warp
 * without the effect's dependencies changing.
 */
function WarpedRasterOverlay({
  previewUrl,
  opacity,
  mesh,
}: {
  previewUrl: string;
  opacity: number;
  mesh: LatLngPoint[][] | null;
}) {
  const leafletMap = useMap();
  const layerRef = useRef<WarpedRasterLayer | null>(null);
  const opacityRef = useRef(opacity);
  const meshRef = useRef(mesh);
  const hasMesh = mesh !== null;

  useEffect(() => {
    if (!leafletMap || !hasMesh) {
      return;
    }
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void loadBitmap(previewUrl)
      .then((loaded) => {
        if (cancelled) {
          loaded.close();
          return;
        }
        const currentMesh = meshRef.current;
        if (!currentMesh) {
          loaded.close();
          return;
        }
        bitmap = loaded;
        ensurePane(leafletMap);
        const layer = new WarpedRasterLayer({
          paneName: USER_MAPS_PANE,
          // Read both through refs: opacity or mesh may have changed while
          // the bitmap was decoding, and a stale closure would build the
          // layer with whatever was current when the effect first ran.
          opacity: opacityRef.current,
          image: loaded,
          imageSize: { width: loaded.width, height: loaded.height },
          latLngMesh: currentMesh,
        });
        layer.addTo(leafletMap);
        layerRef.current = layer;
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error("user map preview failed to load", error);
      });
    return () => {
      cancelled = true;
      layerRef.current?.remove();
      layerRef.current = null;
      bitmap?.close();
    };
    // Deliberately NOT depending on `mesh`: a georeferencing drag changes it
    // dozens of times a second, and rebuilding here would re-decode the
    // bitmap every frame. Geometry updates go through the layout effect
    // below instead.
  }, [leafletMap, previewUrl, hasMesh]);

  useLayoutEffect(() => {
    // Layout, not passive: passive effects are scheduled asynchronously, so a
    // pending createImageBitmap could resolve and read a stale ref first.
    // Layout effects flush during commit, before any yield to the event loop.
    // (PR 1 hit exactly this bug with opacity; the same ordering applies to
    // the mesh, which changes far more often.)
    opacityRef.current = opacity;
    meshRef.current = mesh;
    layerRef.current?.setOpacity(opacity);
    if (mesh) {
      layerRef.current?.setLatLngMesh(mesh);
    }
  }, [opacity, mesh]);

  return null;
}

/**
 * A saved map derives its mesh from its record — and MUST memoize it on the
 * record's object identity. `useUserMaps` rebuilds its VisibleUserMap
 * wrappers on every render, so calling meshForRecord in the parent's render
 * body would hand this overlay a brand-new array each time and re-trigger the
 * geometry layout effect below. During a georeferencing drag that is every
 * saved layer rebuilding its lattice and repainting on every pointer move.
 * The memo can only live in a component, not in a `.map()` callback, which is
 * the entire reason this wrapper exists.
 */
function SavedMapOverlay({ map }: { map: VisibleUserMap }) {
  const mesh = useMemo(() => meshForRecord(map.record), [map.record]);
  return (
    <WarpedRasterOverlay
      previewUrl={map.previewUrl}
      opacity={map.opacity}
      mesh={mesh}
    />
  );
}

/** Sole mount point MapCanvas needs. */
export function UserMapLayers({
  maps,
  draft = null,
}: {
  maps: VisibleUserMap[];
  draft?: DraftUserMap | null;
}) {
  return (
    <>
      {maps.map((map) => (
        <SavedMapOverlay key={map.record.id} map={map} />
      ))}
      {draft ? (
        // The draft's mesh comes from the session, not from the record: it
        // changes on every pointer move, and the record is only updated on
        // the debounced write-through.
        <WarpedRasterOverlay
          key={`draft-${draft.record.id}`}
          previewUrl={draft.previewUrl}
          opacity={draft.opacity}
          mesh={draft.mesh}
        />
      ) : null}
    </>
  );
}
```

**Note for the reviewer:** this drops the old `record`-identity dependency in
the layer-construction effect in favour of `previewUrl`, which is strictly
more stable — `previewUrl` is a blob URL created once per map and only revoked
on removal. The existing identity tests still pass because they never change
`previewUrl`. Record identity still matters, just one level up: it is the
`SavedMapOverlay` memo key.

- [ ] **Step 7: Run to verify they pass**

Run: `cd web && npx vitest run src/userMaps/recordMesh.test.ts src/userMaps/components/UserMapLayers.test.tsx`
Expected: PASS — every pre-existing test plus the new ones.

- [ ] **Step 8: Commit**

```bash
git add web/src/userMaps/recordMesh.ts web/src/userMaps/recordMesh.test.ts web/src/userMaps/components/UserMapLayers.tsx web/src/userMaps/components/UserMapLayers.test.tsx
git commit -m "feat(web): render GCP-georeferenced maps and the live georeferencing draft"
```

---

### Task 7: `useGeoreferenceSession` — state machine, undo, debounced write-through

**Files:**
- Create: `web/src/userMaps/useGeoreferenceSession.ts`
- Test: `web/src/userMaps/useGeoreferenceSession.test.ts`

**Interfaces:**
- Consumes: `Gcp` (`./types`); `solveAffineFromGcps`, `MIN_GCPS_FOR_AFFINE`, `AffineParams` (`./transform/affine`); `buildGcpLatLngMesh` (`./transform/gcpMesh`); `residualReport`, `ResidualReport` (`./transform/residuals`); `PixelSize`, `LatLngPoint` (`./transform/projection`).
- Produces:
  - `type PendingPoint = { side: "scan"; pixel: { x: number; y: number } } | { side: "map"; map: LatLngPoint } | null`
  - `type GeoreferenceStatus = { kind: "awaiting-map" } | { kind: "awaiting-scan" } | { kind: "need-more"; remaining: number } | { kind: "degenerate" } | { kind: "exact-fit" } | { kind: "solved"; rmsMetres: number; count: number }`
  - `type GeoreferenceSession = { gcps; pending; params; mesh; report; status; canUndo; pickScanPoint(x, y); pickMapPoint(lat, lng); cancelPending(); beginDragGcp(id); moveGcpOnScan(id, x, y); moveGcpOnMap(id, lat, lng); deleteGcp(id); undo(); flush() }`
  - `useGeoreferenceSession(options: { mapId: string | null; initialGcps: Gcp[]; pixelSize: PixelSize; onPersist: (mapId: string, gcps: Gcp[]) => void; persistDelayMs?: number }): GeoreferenceSession`
  - `UNDO_HISTORY_LIMIT = 50`, `PERSIST_DELAY_MS = 400`

**Why the failure status is `degenerate`, not `collinear`.** After
`11780341f`, `solveAffineFromGcps` returns `null` in three distinct
situations, only one of which is a straight line on the scan: a source cloud
narrower than `MIN_CONDITION_RATIO`; a non-finite destination; and a solved
linear part squashed past `MIN_ANISOTROPY_RATIO`, which is what three map
clicks down a meridian produce even from a textbook triangle on the scan.
Calling the status `collinear` and telling the user "these points are almost
in a straight line" would be wrong advice in two of the three, so both the
name and the copy changed. The copy lives in Task 10's `statusMessage`.

**Why `mapId` is an argument and why `onPersist` takes it back.** The hook is
mounted unconditionally in `App` (hooks cannot be conditional) and stays
mounted while the user opens map A, closes it, then opens map B — so it has to
re-seed itself rather than relying on a remount. Carrying the id through to
`onPersist` closes the matching race: a debounced write in flight when the
session switches must land on the map it came from, not on whatever is open
400 ms later. `App` wires it straight to `saveGcps(id, gcps)` from Task 5.

Re-seeding uses React's documented "adjust state when a prop changes"
pattern — a *conditional* `setState` during render, not an effect. This is
deliberate: `set-state-in-effect` is an ESLint **error** in this repo, and the
render-time form is the officially supported alternative. Verified against
this repo's actual config (`npx eslint` on a probe file using exactly this
shape): exit 0, no warnings. Do not "fix" it into a `useEffect`.

**The shape everything else follows from: no side effects inside a `setState`
updater.** `main.tsx:8` wraps `<App/>` in `StrictMode`, and React 19
double-invokes updaters there (verified: 2 invocations per dispatch). An
earlier version of this hook did its history snapshot, its id mint and its
`setGcps` call from *inside* `setPending`'s updater — so in the browser one
completed pair produced **two coincident GCPs** and every action needed two
Undo presses, while every test here (bare `renderHook`, no StrictMode) stayed
green. Because the duplicates were coincident, the affine still solved and it
looked nearly right.

So: state that a handler needs to *read* is mirrored into a ref, every mutator
branches on the ref outside any updater, and every write goes through one
`commit(next)`. Updaters compute a value and nothing else. There is a
StrictMode-wrapped test below that fails against the old shape.

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/useGeoreferenceSession.test.ts`:

```ts
import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PERSIST_DELAY_MS,
  UNDO_HISTORY_LIMIT,
  useGeoreferenceSession,
} from "./useGeoreferenceSession";
import type { Gcp } from "./types";

const PIXEL_SIZE = { width: 1200, height: 800 };

/** Three points that solve, laid out as a proper triangle. */
const SOLVABLE: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
  { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
];

function setup(initialGcps: Gcp[] = []) {
  const onPersist = vi.fn();
  const hook = renderHook(
    (props: { mapId: string | null; initialGcps: Gcp[] }) =>
      useGeoreferenceSession({ ...props, pixelSize: PIXEL_SIZE, onPersist }),
    { initialProps: { mapId: "map-a", initialGcps } },
  );
  return { ...hook, onPersist };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pairing", () => {
  it("completes a GCP scan-first", () => {
    const { result } = setup();
    act(() => result.current.pickScanPoint(100, 200));
    expect(result.current.pending).toEqual({
      side: "scan",
      pixel: { x: 100, y: 200 },
    });
    expect(result.current.status).toEqual({ kind: "awaiting-map" });

    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.pending).toBeNull();
    expect(result.current.gcps).toHaveLength(1);
    expect(result.current.gcps[0]).toMatchObject({
      pixel: { x: 100, y: 200 },
      map: { lat: 46.05, lng: -61.1 },
    });
  });

  it("completes a GCP map-first", () => {
    const { result } = setup();
    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.status).toEqual({ kind: "awaiting-scan" });
    act(() => result.current.pickScanPoint(100, 200));
    expect(result.current.gcps).toHaveLength(1);
    expect(result.current.gcps[0].pixel).toEqual({ x: 100, y: 200 });
  });

  it("moves the pending point when the same side is clicked twice", () => {
    const { result } = setup();
    act(() => result.current.pickScanPoint(100, 200));
    act(() => result.current.pickScanPoint(300, 400));
    expect(result.current.pending).toEqual({
      side: "scan",
      pixel: { x: 300, y: 400 },
    });
    expect(result.current.gcps).toHaveLength(0);
  });

  it("cancels a pending point", () => {
    const { result } = setup();
    act(() => result.current.pickScanPoint(100, 200));
    act(() => result.current.cancelPending());
    expect(result.current.pending).toBeNull();
    expect(result.current.gcps).toHaveLength(0);
  });
});

describe("status", () => {
  it("counts down to the three-point minimum", () => {
    const { result } = setup();
    expect(result.current.status).toEqual({ kind: "need-more", remaining: 3 });
    act(() => result.current.pickScanPoint(0, 0));
    act(() => result.current.pickMapPoint(46.1, -61.2));
    expect(result.current.status).toEqual({ kind: "need-more", remaining: 2 });
  });

  it("reports an exact fit at three points instead of a misleading 0 m", () => {
    const { result } = setup(SOLVABLE);
    expect(result.current.status).toEqual({ kind: "exact-fit" });
    expect(result.current.report).toBeNull();
    // Not `.not.toBeNull()`: that passes on `undefined` too, so it would go
    // green against a hook that never returned a mesh at all. Assert the
    // shape — AFFINE_GRID_SIZE is 1, so a solved mesh is a single cell.
    expect(result.current.mesh).toHaveLength(2);
  });

  it("reports RMS from the fourth point on", () => {
    const { result } = setup([
      ...SOLVABLE,
      { id: "d", pixel: { x: 1200, y: 800 }, map: { lat: 46.0, lng: -61.0 } },
    ]);
    expect(result.current.status.kind).toBe("solved");
    // The test is named for the RMS, so assert the RMS. `.not.toBeNull()`
    // passes on `undefined`, and on a report whose numbers are all missing.
    expect(result.current.report?.rmsMetres).toBeGreaterThanOrEqual(0);
    expect(result.current.report?.metresPerGcp).toHaveLength(4);
  });

  it("reports a degenerate SCAN layout rather than drawing a NaN drape", () => {
    const { result } = setup([
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
      { id: "b", pixel: { x: 100, y: 100 }, map: { lat: 46.1, lng: -61.1 } },
      { id: "c", pixel: { x: 200, y: 200 }, map: { lat: 46.2, lng: -61.2 } },
    ]);
    expect(result.current.status).toEqual({ kind: "degenerate" });
    expect(result.current.mesh).toBeNull();
    expect(result.current.params).toBeNull();
  });

  it("reports a degenerate SOLVE when the map clicks share a meridian", () => {
    // The case source-side checking cannot see: the scan points are a proper
    // triangle, but three map clicks down one meridian are exactly collinear
    // in Mercator, so the linear part is singular, the drape has zero area,
    // and every residual reads a perfect 0 m. MIN_ANISOTROPY_RATIO catches
    // it — which is why this status is not called "collinear".
    const { result } = setup([
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
      { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
      { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.2, lng: -61.0 } },
    ]);
    expect(result.current.status).toEqual({ kind: "degenerate" });
    expect(result.current.mesh).toBeNull();
  });

  it("lets a pending point take precedence over the count", () => {
    const { result } = setup(SOLVABLE);
    act(() => result.current.pickScanPoint(50, 50));
    expect(result.current.status).toEqual({ kind: "awaiting-map" });
  });
});

describe("StrictMode", () => {
  it("creates exactly one control point per completed pair", () => {
    // `main.tsx` wraps <App/> in StrictMode and React 19 double-invokes state
    // updaters there. The first version of this hook snapshotted history,
    // minted an id and called setGcps from inside setPending's updater, so a
    // single pair produced TWO coincident GCPs and every action needed two
    // Undo presses — in the browser only. Every other test in this file uses
    // a bare renderHook and passed throughout. This one is the guard.
    const onPersist = vi.fn();
    const { result } = renderHook(
      () =>
        useGeoreferenceSession({
          mapId: "map-a",
          initialGcps: [],
          pixelSize: PIXEL_SIZE,
          onPersist,
        }),
      { wrapper: StrictMode },
    );
    act(() => result.current.pickScanPoint(100, 200));
    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.gcps).toHaveLength(1);
    // One undo, not two: the history got exactly one snapshot.
    act(() => result.current.undo());
    expect(result.current.gcps).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });
});

describe("undo", () => {
  it("cannot undo an untouched session", () => {
    expect(setup(SOLVABLE).result.current.canUndo).toBe(false);
  });

  it("undoes an added point", () => {
    const { result } = setup(SOLVABLE);
    act(() => result.current.pickScanPoint(600, 400));
    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.gcps).toHaveLength(4);
    act(() => result.current.undo());
    expect(result.current.gcps).toHaveLength(3);
    expect(result.current.canUndo).toBe(false);
  });

  it("undoes a delete", () => {
    const { result } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("b"));
    expect(result.current.gcps).toHaveLength(2);
    act(() => result.current.undo());
    expect(result.current.gcps.map((g) => g.id)).toEqual(["a", "b", "c"]);
  });

  it("collapses a whole drag into ONE undo step", () => {
    // The subtlety that makes undo usable: a marker drag emits state on every
    // pointer move. Snapshotting per move would bury the history under fifty
    // indistinguishable frames.
    const { result } = setup(SOLVABLE);
    act(() => result.current.beginDragGcp("a"));
    act(() => result.current.moveGcpOnMap("a", 46.11, -61.21));
    act(() => result.current.moveGcpOnMap("a", 46.12, -61.22));
    act(() => result.current.moveGcpOnMap("a", 46.13, -61.23));
    expect(result.current.gcps[0].map).toEqual({ lat: 46.13, lng: -61.23 });
    act(() => result.current.undo());
    expect(result.current.gcps[0].map).toEqual({ lat: 46.1, lng: -61.2 });
    expect(result.current.canUndo).toBe(false);
  });

  it("caps history so a long session cannot grow without bound", () => {
    const { result } = setup(SOLVABLE);
    for (let i = 0; i < UNDO_HISTORY_LIMIT + 10; i += 1) {
      act(() => result.current.deleteGcp("a"));
      act(() => result.current.beginDragGcp("b"));
    }
    let undos = 0;
    while (result.current.canUndo && undos < UNDO_HISTORY_LIMIT + 20) {
      act(() => result.current.undo());
      undos += 1;
    }
    expect(undos).toBeLessThanOrEqual(UNDO_HISTORY_LIMIT);
  });
});

describe("persistence", () => {
  it("debounces writes instead of hitting IndexedDB every pointer move", () => {
    const { result, onPersist } = setup(SOLVABLE);
    act(() => result.current.beginDragGcp("a"));
    act(() => result.current.moveGcpOnMap("a", 46.11, -61.21));
    act(() => result.current.moveGcpOnMap("a", 46.12, -61.22));
    expect(onPersist).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0][0]).toBe("map-a");
    expect(onPersist.mock.calls[0][1][0].map).toEqual({
      lat: 46.12,
      lng: -61.22,
    });
  });

  it("does not persist the initial state", () => {
    const { onPersist } = setup(SOLVABLE);
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS * 3);
    });
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("flushes a pending write immediately on demand", () => {
    const { result, onPersist } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    act(() => result.current.flush());
    expect(onPersist).toHaveBeenCalledTimes(1);
  });

  it("flushes on unmount so closing the panel never loses the last edit", () => {
    const { result, unmount, onPersist } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    unmount();
    expect(onPersist).toHaveBeenCalledTimes(1);
  });

  it("writes a late flush to the map it came from, not the map now open", () => {
    // The hook lives in App and outlives any one panel. Without the id on the
    // dirty entry, opening map B within the debounce window would save map
    // A's control points onto map B.
    const { result, rerender, onPersist } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    rerender({ mapId: "map-b", initialGcps: [] });
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0][0]).toBe("map-a");
  });

  it("keeps BOTH maps' edits when the session switches mid-debounce", () => {
    // The test above only covers a *late* flush, not an *interrupted* one.
    // With a single dirty slot and a single timer, the first edit on map B
    // overwrites map A's pending write and the timer restarts: measured
    // `persist calls: [["map-b", 1]]` — map A's deletion silently gone. One
    // dirty entry per map id is what fixes it.
    const { result, rerender, onPersist } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    rerender({ mapId: "map-b", initialGcps: [] });
    act(() => result.current.pickScanPoint(10, 20));
    act(() => result.current.pickMapPoint(46.0, -61.0));
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    expect(onPersist).toHaveBeenCalledTimes(2);
    const byMap = new Map(
      onPersist.mock.calls.map(([id, gcps]) => [id as string, gcps as Gcp[]]),
    );
    expect(byMap.get("map-a")).toHaveLength(2); // "a" removed from three
    expect(byMap.get("map-b")).toHaveLength(1);
  });
});

describe("switching maps", () => {
  it("re-seeds from the new map instead of carrying the old one's points", () => {
    const { result, rerender } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    expect(result.current.gcps).toHaveLength(2);

    rerender({ mapId: "map-b", initialGcps: [] });
    expect(result.current.gcps).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it("drops a half-finished pair so it cannot bridge two maps", () => {
    // A scan pixel from map A paired with a map click made while map B is
    // open would be a control point belonging to neither.
    const { result, rerender } = setup(SOLVABLE);
    act(() => result.current.pickScanPoint(10, 20));
    expect(result.current.pending).not.toBeNull();
    rerender({ mapId: "map-b", initialGcps: [] });
    expect(result.current.pending).toBeNull();
  });

  it("re-seeds when the same map is reopened after an outside edit", () => {
    const { result, rerender } = setup(SOLVABLE);
    rerender({ mapId: null, initialGcps: [] });
    expect(result.current.gcps).toEqual([]);
    rerender({ mapId: "map-a", initialGcps: SOLVABLE });
    expect(result.current.gcps).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/userMaps/useGeoreferenceSession.test.ts`
Expected: FAIL — cannot resolve `./useGeoreferenceSession`.

- [ ] **Step 3: Implement** — `web/src/userMaps/useGeoreferenceSession.ts`:

```ts
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MIN_GCPS_FOR_AFFINE,
  solveAffineFromGcps,
  type AffineParams,
} from "./transform/affine";
import { buildGcpLatLngMesh } from "./transform/gcpMesh";
import type { LatLngPoint, PixelSize } from "./transform/projection";
import { residualReport, type ResidualReport } from "./transform/residuals";
import type { Gcp } from "./types";

export const UNDO_HISTORY_LIMIT = 50;
export const PERSIST_DELAY_MS = 400;

export type PendingPoint =
  | { side: "scan"; pixel: { x: number; y: number } }
  | { side: "map"; map: LatLngPoint }
  | null;

export type GeoreferenceStatus =
  | { kind: "awaiting-map" }
  | { kind: "awaiting-scan" }
  | { kind: "need-more"; remaining: number }
  /** The solve was refused: thin point cloud, non-finite result, or a
   * transform that squashes one axis past MIN_ANISOTROPY_RATIO. Not
   * "collinear" — two of those three are not straight lines on the scan. */
  | { kind: "degenerate" }
  | { kind: "exact-fit" }
  | { kind: "solved"; rmsMetres: number; count: number };

export type GeoreferenceSession = {
  gcps: Gcp[];
  pending: PendingPoint;
  params: AffineParams | null;
  mesh: LatLngPoint[][] | null;
  report: ResidualReport | null;
  status: GeoreferenceStatus;
  canUndo: boolean;
  pickScanPoint: (x: number, y: number) => void;
  pickMapPoint: (lat: number, lng: number) => void;
  cancelPending: () => void;
  beginDragGcp: (id: string) => void;
  moveGcpOnScan: (id: string, x: number, y: number) => void;
  moveGcpOnMap: (id: string, lat: number, lng: number) => void;
  deleteGcp: (id: string) => void;
  undo: () => void;
  flush: () => void;
};

let gcpCounter = 0;

/** Ids only need to be unique within one session's list. */
function nextGcpId(): string {
  gcpCounter += 1;
  return `gcp-${gcpCounter}`;
}

export function useGeoreferenceSession(options: {
  mapId: string | null;
  initialGcps: Gcp[];
  pixelSize: PixelSize;
  onPersist: (mapId: string, gcps: Gcp[]) => void;
  persistDelayMs?: number;
}): GeoreferenceSession {
  const { mapId, pixelSize } = options;
  const persistDelay = options.persistDelayMs ?? PERSIST_DELAY_MS;
  const [gcps, setGcpsState] = useState<Gcp[]>(options.initialGcps);
  const [pending, setPendingState] = useState<PendingPoint>(null);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [seededFor, setSeededFor] = useState<string | null>(mapId);

  // React's documented "adjust state when a prop changes": a CONDITIONAL
  // setState during render. Not an effect — `set-state-in-effect` is an error
  // here, and an effect would also render one frame of the previous map's
  // points over the new map. Verified lint-clean against this repo's config.
  // Only STATE is reset here; the ref mirrors below cannot be written during
  // render (also a lint error) and are reconciled in layout effects instead.
  if (mapId !== seededFor) {
    setSeededFor(mapId);
    setGcpsState(options.initialGcps);
    setPendingState(null);
    setHistoryDepth(0);
  }

  // --- Ref mirrors --------------------------------------------------------
  //
  // Every mutator reads the current points and the pending half-point from
  // these, never from a setState updater. That is what keeps updaters pure,
  // which is what makes StrictMode's double invocation harmless. They are
  // written eagerly by the writers below (so two mutations in one tick see
  // each other) and reconciled from state in a layout effect (so the
  // render-time re-seed above lands before any handler can run — layout
  // effects flush during commit, before the browser yields to events).
  const gcpsRef = useRef(gcps);
  const pendingRef = useRef<PendingPoint>(null);
  const historyRef = useRef<Gcp[][]>([]);

  useLayoutEffect(() => {
    gcpsRef.current = gcps;
    pendingRef.current = pending;
  }, [gcps, pending]);

  useLayoutEffect(() => {
    // Undo history belongs to one map. Its DEPTH is reset in the re-seed
    // branch above; its contents are cleared here, for the same
    // no-ref-writes-during-render reason.
    historyRef.current = [];
  }, [seededFor]);

  const onPersistRef = useRef(options.onPersist);
  const timerRef = useRef<number | null>(null);
  // One dirty entry PER MAP, not one slot. A single slot only survives a
  // *late* flush, not an *interrupted* one: the first edit on map B
  // overwrites map A's pending payload and restarts the shared timer, so A's
  // write is simply lost (measured: `persist calls: [["map-b", 1]]`). Keyed
  // by id, every map touched inside the window still gets exactly one write.
  const dirtyRef = useRef(new Map<string, Gcp[]>());

  useLayoutEffect(() => {
    // Layout, not passive, per the Global Constraint on refs read by
    // in-flight work: the debounce timer can fire in the same frame as a
    // re-render, and a passive effect is scheduled asynchronously.
    onPersistRef.current = options.onPersist;
  }, [options.onPersist]);

  const writeDirty = useCallback(() => {
    const dirty = dirtyRef.current;
    if (dirty.size === 0) {
      return;
    }
    // Snapshot and clear BEFORE calling out: onPersist re-enters React state
    // (App's saveGcps), and anything it schedules must not be dropped here.
    const entries = [...dirty.entries()];
    dirty.clear();
    for (const [id, next] of entries) {
      // The id travels with the payload, so a write that lands after the
      // session has moved on still goes to the right record.
      onPersistRef.current(id, next);
    }
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    writeDirty();
  }, [writeDirty]);

  /**
   * IndexedDB writes are debounced because a marker drag changes state on
   * every pointer move; committing each one would put a transaction on the
   * main thread dozens of times a second. `flush` covers the two moments
   * where losing the tail would be visible: closing the panel, and unmount.
   */
  const schedulePersist = useCallback(
    (next: Gcp[]) => {
      if (mapId === null) {
        return;
      }
      dirtyRef.current.set(mapId, next);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        writeDirty();
      }, persistDelay);
    },
    [mapId, persistDelay, writeDirty],
  );

  useEffect(() => flush, [flush]);

  /** The single write path: mirror, render, schedule. */
  const commit = useCallback(
    (next: Gcp[]) => {
      gcpsRef.current = next;
      setGcpsState(next);
      schedulePersist(next);
    },
    [schedulePersist],
  );

  const setPending = useCallback((next: PendingPoint) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  /** Snapshot BEFORE a change, so undo restores the prior state. */
  const snapshot = useCallback(() => {
    historyRef.current = [...historyRef.current, gcpsRef.current].slice(
      -UNDO_HISTORY_LIMIT,
    );
    setHistoryDepth(historyRef.current.length);
  }, []);

  const pickScanPoint = useCallback(
    (x: number, y: number) => {
      // Read the pending half-point from the ref and branch OUT HERE. Doing
      // this inside setPending's updater is what produced two coincident
      // GCPs per pair under StrictMode.
      const current = pendingRef.current;
      if (current?.side === "map") {
        snapshot();
        commit([
          ...gcpsRef.current,
          { id: nextGcpId(), pixel: { x, y }, map: current.map },
        ]);
        setPending(null);
        return;
      }
      setPending({ side: "scan", pixel: { x, y } });
    },
    [commit, setPending, snapshot],
  );

  const pickMapPoint = useCallback(
    (lat: number, lng: number) => {
      const current = pendingRef.current;
      if (current?.side === "scan") {
        snapshot();
        commit([
          ...gcpsRef.current,
          { id: nextGcpId(), pixel: current.pixel, map: { lat, lng } },
        ]);
        setPending(null);
        return;
      }
      setPending({ side: "map", map: { lat, lng } });
    },
    [commit, setPending, snapshot],
  );

  const cancelPending = useCallback(() => setPending(null), [setPending]);

  /**
   * Called on drag START only. Snapshotting per pointer move would make undo
   * useless: one drag would fill the entire history with frames that differ
   * by a pixel.
   */
  const beginDragGcp = useCallback(() => snapshot(), [snapshot]);

  const moveGcpOnScan = useCallback(
    (id: string, x: number, y: number) => {
      commit(
        gcpsRef.current.map((gcp) =>
          gcp.id === id ? { ...gcp, pixel: { x, y } } : gcp,
        ),
      );
    },
    [commit],
  );

  const moveGcpOnMap = useCallback(
    (id: string, lat: number, lng: number) => {
      commit(
        gcpsRef.current.map((gcp) =>
          gcp.id === id ? { ...gcp, map: { lat, lng } } : gcp,
        ),
      );
    },
    [commit],
  );

  const deleteGcp = useCallback(
    (id: string) => {
      snapshot();
      commit(gcpsRef.current.filter((gcp) => gcp.id !== id));
    },
    [commit, snapshot],
  );

  const undo = useCallback(() => {
    const past = historyRef.current;
    if (past.length === 0) {
      return;
    }
    historyRef.current = past.slice(0, -1);
    setHistoryDepth(historyRef.current.length);
    commit(past[past.length - 1]);
    setPending(null);
  }, [commit, setPending]);

  // pixelSize is the ORIGINAL raster's size and is load-bearing, not
  // decoration: solveAffine normalises its acceptance gate against the image
  // diagonal (Task 3), so passing preview dimensions here would silently
  // change which layouts are accepted.
  const params = useMemo(
    () => solveAffineFromGcps(gcps),
    [gcps, pixelSize],
  );
  const mesh = useMemo(
    () => (params ? buildGcpLatLngMesh(params, pixelSize) : null),
    [params, pixelSize],
  );
  const report = useMemo(
    () => (params ? residualReport(gcps, params) : null),
    [gcps, params],
  );

  const status = useMemo<GeoreferenceStatus>(() => {
    // A pending half-point is the most urgent thing to tell the user about,
    // so it outranks the point count.
    if (pending?.side === "scan") {
      return { kind: "awaiting-map" };
    }
    if (pending?.side === "map") {
      return { kind: "awaiting-scan" };
    }
    if (gcps.length < MIN_GCPS_FOR_AFFINE) {
      return { kind: "need-more", remaining: MIN_GCPS_FOR_AFFINE - gcps.length };
    }
    if (!params) {
      // Three different refusals arrive here, only one of which is a straight
      // line on the scan — see the type's comment and Task 3.
      return { kind: "degenerate" };
    }
    if (!report) {
      // Enough points to solve, too few for residuals to mean anything: an
      // affine passes exactly through three points by construction.
      return { kind: "exact-fit" };
    }
    return {
      kind: "solved",
      rmsMetres: report.rmsMetres,
      count: gcps.length,
    };
  }, [gcps.length, params, pending, report]);

  return {
    gcps,
    pending,
    params,
    mesh,
    report,
    status,
    canUndo: historyDepth > 0,
    pickScanPoint,
    pickMapPoint,
    cancelPending,
    beginDragGcp,
    moveGcpOnScan,
    moveGcpOnMap,
    deleteGcp,
    undo,
    flush,
  };
}
```

**Identity note, which Task 8 and Task 11 depend on.** Every mutator's
`useCallback` deps are other callbacks, never `gcps` — that is the other
reason the ref mirrors exist. If `moveGcpOnMap` changed identity on every
point move, `useMapEvent`'s effect would tear down and re-register its Leaflet
handler on every pointer move of a drag. The only thing that churns these is
`mapId` changing, i.e. switching maps.

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/userMaps/useGeoreferenceSession.test.ts`
Expected: PASS (25 tests). Count them rather than trusting that number — an
earlier draft of this plan claimed 20 for a 22-test file.

- [ ] **Step 5: Lint and commit**

```bash
cd web && npx eslint src/userMaps/useGeoreferenceSession.ts
git add web/src/userMaps/useGeoreferenceSession.ts web/src/userMaps/useGeoreferenceSession.test.ts
git commit -m "feat(web): add the georeferencing session state machine with undo"
```

---
### Task 8: `ScanPane` — the scan side, on `CRS.Simple`

**Files:**
- Create: `web/src/userMaps/components/scanGeometry.ts`
- Test: `web/src/userMaps/components/scanGeometry.test.ts`
- Create: `web/src/userMaps/components/gcpIcon.ts`
- Test: `web/src/userMaps/components/gcpIcon.test.ts`
- Create: `web/src/userMaps/components/ScanPane.tsx`
- Test: `web/src/userMaps/components/ScanPane.test.tsx`

**Interfaces:**
- Produces, from `scanGeometry.ts`:
  - `pixelFromLatLng(latLng: { lat: number; lng: number }): { x: number; y: number }`
  - `latLngFromPixel(pixel: { x: number; y: number }): [number, number]`
  - `scanBounds(pixelSize: PixelSize): [[number, number], [number, number]]`
  - `clampToRaster(pixel: { x: number; y: number }, pixelSize: PixelSize): { x: number; y: number }`
- Produces, from `gcpIcon.ts`:
  - `numberedIcon(label: string, state?: { pending?: boolean; selected?: boolean }): L.DivIcon`
- Produces, from `ScanPane.tsx`:
  - `type ScanFocusRequest = { pixel: { x: number; y: number }; requestId: number }`
  - `<ScanPane previewUrl pixelSize gcps pending focus onPickPoint onDragStartGcp onMoveGcp selectedGcpId />`

**Why three files instead of one.** `react-refresh/only-export-components` is
an **error** here, so a `.tsx` file may export components and constants but
not functions. The two pure helper modules also earn their keep on their own:
`scanGeometry.test.ts` needs no React at all, and `numberedIcon` has two
consumers (this pane and Task 11's map layer), so giving it a home now avoids
Task 11 having to reach back into `ScanPane.tsx` for it — a forward edit that
an earlier draft of this plan left out of every Files list and every `git
add`, so the branch compiled locally and not once pushed.

**The coordinate rule — read this before writing any of it.** Under
`L.CRS.Simple` the transformation is `(1, 0, -1, 0)`, so image pixel `(x, y)`
is `latLng(-y, x)`. Verified: `map.project(latLng(-3, 4), 0)` returns
`{x: 4, y: 3}`.

**Do not use `L.CRS.Simple.project()` / `.unproject()` to do this.** Those are
the *projection* methods: they return raw LonLat (`{x: lng, y: lat}`) and
**ignore the zoom argument entirely** — verified,
`L.CRS.Simple.project(latLng(-6, 8), 0)` returns `{x: 8, y: -6}`. Using them
puts every GCP on a mirrored pixel row. The two helpers below do the
conversion directly and are unit-tested, so no component ever has to
re-derive it.

**The overlay is stretched to ORIGINAL pixel dimensions, not preview
dimensions.** GCPs live in original pixel space; making the map's coordinate
space match means a click needs no rescaling and a preview-resolution change
never moves a point.

**`maxBounds` does not keep clicks on the raster — clamp them.** `maxBounds`
constrains the *view*, and Leaflet's installed `maxBoundsViscosity` default is
`0.0`, which explicitly permits dragging outside at normal speed. Independently:
with `minZoom={-4}` there is letterboxed map area outside the image overlay in
virtually any viewport, so clicking off the scan is trivially easy. Nothing
downstream rejects a negative or over-width pixel — the affine solver takes it
as ordinary input and it persists to IndexedDB. So both the click path and the
drag path run their pixel through `clampToRaster` before it leaves this file.

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/components/scanGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clampToRaster,
  latLngFromPixel,
  pixelFromLatLng,
  scanBounds,
} from "./scanGeometry";

describe("scan coordinate helpers", () => {
  it("maps image pixels onto CRS.Simple's y-flipped space", () => {
    // Verified against Leaflet: map.project(latLng(-3, 4), 0) === {x: 4, y: 3}.
    expect(latLngFromPixel({ x: 4, y: 3 })).toEqual([-3, 4]);
    expect(pixelFromLatLng({ lat: -3, lng: 4 })).toEqual({ x: 4, y: 3 });
  });

  it("round-trips every corner of a raster", () => {
    for (const pixel of [
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 0, y: 800 },
      { x: 1200, y: 800 },
      { x: 637, y: 415 },
    ]) {
      const [lat, lng] = latLngFromPixel(pixel);
      expect(pixelFromLatLng({ lat, lng })).toEqual(pixel);
    }
  });

  it("bounds the overlay by ORIGINAL pixel dimensions", () => {
    // south-west is the bottom-left of the image, which is pixel (0, height).
    expect(scanBounds({ width: 1200, height: 800 })).toEqual([
      [-800, 0],
      [0, 1200],
    ]);
  });

  it("never returns -0 for a top-left corner", () => {
    // Object.is(-0, 0) is false, so a stray -0 breaks toEqual comparisons in
    // every downstream test and any Map keyed on the value.
    const [lat, lng] = latLngFromPixel({ x: 0, y: 0 });
    expect(Object.is(lat, -0)).toBe(false);
    expect(Object.is(lng, -0)).toBe(false);
  });

  it("clamps a point outside the raster back onto it", () => {
    // maxBounds constrains the VIEW, not the coordinate: viscosity defaults
    // to 0 and minZoom={-4} leaves letterboxed map outside the image, so a
    // click off the scan is easy and nothing downstream refuses it.
    const size = { width: 1200, height: 800 };
    expect(clampToRaster({ x: -40, y: -12 }, size)).toEqual({ x: 0, y: 0 });
    expect(clampToRaster({ x: 1400, y: 950 }, size)).toEqual({
      x: 1200,
      y: 800,
    });
    expect(clampToRaster({ x: 637, y: 415 }, size)).toEqual({
      x: 637,
      y: 415,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/scanGeometry.test.ts`
Expected: FAIL — cannot resolve `./scanGeometry`.

- [ ] **Step 3: Implement the geometry** — `web/src/userMaps/components/scanGeometry.ts`:

```ts
import type { PixelSize } from "../transform/projection";

/**
 * L.CRS.Simple applies Transformation(1, 0, -1, 0), so image pixel (x, y) is
 * latLng(-y, x). Doing the flip here, once, keeps it out of every component —
 * and keeps anyone from reaching for L.CRS.Simple.project(), which returns
 * raw LonLat and ignores its zoom argument.
 *
 * The `|| 0` guards normalise -0 to 0: Object.is(-0, 0) is false, so a -0
 * latitude silently breaks equality checks downstream.
 */
export function latLngFromPixel(pixel: { x: number; y: number }): [number, number] {
  return [-pixel.y || 0, pixel.x || 0];
}

export function pixelFromLatLng(latLng: { lat: number; lng: number }): {
  x: number;
  y: number;
} {
  return { x: latLng.lng || 0, y: -latLng.lat || 0 };
}

/** Bounds in ORIGINAL pixel space: GCPs live there, so the map does too. */
export function scanBounds(
  pixelSize: PixelSize,
): [[number, number], [number, number]] {
  return [
    [-pixelSize.height, 0],
    [0, pixelSize.width],
  ];
}

/**
 * Keeps a picked or dragged point on the raster. `maxBounds` cannot do this:
 * it constrains the VIEW, its viscosity defaults to 0, and minZoom={-4}
 * leaves letterboxed map outside the image in almost any viewport. An
 * off-image pixel is not rejected anywhere downstream — the affine solver
 * consumes a negative x as ordinary input and it persists.
 *
 * Math.max(-0, 0) is +0 by spec, so this also cannot reintroduce the -0 that
 * latLngFromPixel goes out of its way to avoid.
 */
export function clampToRaster(
  pixel: { x: number; y: number },
  pixelSize: PixelSize,
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(pixel.x, 0), pixelSize.width),
    y: Math.min(Math.max(pixel.y, 0), pixelSize.height),
  };
}
```

- [ ] **Step 4: Write the icon test** — `web/src/userMaps/components/gcpIcon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { numberedIcon } from "./gcpIcon";

describe("numberedIcon", () => {
  it("distinguishes a half-placed point from a completed one", () => {
    // Spec: markers are hollow while pending and solid once paired. The two
    // states must not share a class, or "click the other side" has no visual
    // acknowledgement at all.
    expect(numberedIcon("1").options.className).toBe("gcp-marker");
    expect(numberedIcon("1", { pending: true }).options.className).toContain(
      "gcp-marker--pending",
    );
  });

  it("marks the selected point separately from the pending one", () => {
    // These were conflated once: the list's hovered row was passed as the
    // `pendingHalf` argument, so hovering a finished row drew its marker in
    // the "still waiting for its other half" style.
    const icon = numberedIcon("2", { selected: true });
    expect(icon.options.className).toContain("gcp-marker--selected");
    expect(icon.options.className).not.toContain("gcp-marker--pending");
  });

  it("carries the point number as its label", () => {
    expect(numberedIcon("3").options.html).toContain("3");
  });
});
```

- [ ] **Step 5: Implement the icon** — `web/src/userMaps/components/gcpIcon.ts`:

```ts
import L from "leaflet";

/**
 * One numbered marker style, shared by the scan pane and the live map so a
 * point looks the same on both sides — which is how the user matches a list
 * row to a marker (Task 11 deliberately threads no selection state to the
 * map; the number is the correspondence).
 *
 * `pending` and `selected` are separate flags on purpose. An earlier draft
 * had a single `pendingHalf` boolean and passed `selectedGcpId` into it, so
 * hovering a completed row rendered its marker in the pending style.
 */
export function numberedIcon(
  label: string,
  state: { pending?: boolean; selected?: boolean } = {},
): L.DivIcon {
  const classNames = ["gcp-marker"];
  if (state.pending) {
    classNames.push("gcp-marker--pending");
  }
  if (state.selected) {
    classNames.push("gcp-marker--selected");
  }
  return L.divIcon({
    className: classNames.join(" "),
    html: `<span>${label}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
```

- [ ] **Step 6: Write the failing pane test** — `web/src/userMaps/components/ScanPane.test.tsx`:

**This file is not optional, and it is not covered elsewhere.** An earlier
revision of this plan asserted that `ScanPane` was "covered through
`GeoreferencePanel.test.tsx` in Task 10" — but Task 10 does
`vi.mock("./ScanPane", …)` and Task 12 stubs it again, so the component owning
the click→pixel path was executed by no test at all. An implementation
returning the wrong root class, omitting `ScanClickCatcher`, omitting every
marker, dropping `draggable`, dropping `dragstart` (which silently escapes
undo), or returning `null` outright passed the whole suite, plus `tsc -b` and
`eslint`.

The mock records the props that carry the behaviour — `draggable`, `icon`,
`pane`, and the `eventHandlers` *keys* — because a `<Marker>` that renders at
the right position while carrying none of them is exactly the survivor this
file exists to kill.

```tsx
import { render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gcp } from "../types";

type MarkerCall = {
  position: [number, number];
  draggable?: boolean;
  interactive?: boolean;
  pane?: string;
  icon: { options: { className?: string; html?: string } };
  eventHandlers?: {
    dragstart?: () => void;
    drag?: (event: {
      target: { getLatLng: () => { lat: number; lng: number } };
    }) => void;
  };
};

const markerCalls = vi.hoisted(() => [] as MarkerCall[]);
const scanHandlers = vi.hoisted(() => ({
  click: null as ((event: { latlng: { lat: number; lng: number } }) => void) | null,
}));
const stubMap = vi.hoisted(() => ({ setView: vi.fn(), getZoom: vi.fn(() => 0) }));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: PropsWithChildren) => (
    <div data-testid="scan-map">{children}</div>
  ),
  ImageOverlay: ({ url }: { url: string }) => (
    <div data-testid="scan-image" data-url={url} />
  ),
  Marker: (props: MarkerCall) => {
    markerCalls.push(props);
    return (
      <div
        data-testid="scan-marker"
        data-position={props.position.join(",")}
        data-draggable={String(props.draggable ?? false)}
        data-interactive={String(props.interactive ?? true)}
        data-icon-class={props.icon.options.className ?? ""}
        data-handlers={Object.keys(props.eventHandlers ?? {}).sort().join(",")}
      />
    );
  },
  useMap: () => stubMap,
  useMapEvent: (
    type: string,
    handler: (event: { latlng: { lat: number; lng: number } }) => void,
  ) => {
    if (type === "click") {
      scanHandlers.click = handler;
    }
    return stubMap;
  },
}));

import { ScanPane } from "./ScanPane";

const PIXEL_SIZE = { width: 1200, height: 800 };
const GCPS: Gcp[] = [
  { id: "a", pixel: { x: 637, y: 415 }, map: { lat: 46.1, lng: -61.2 } },
];

function renderPane(props: Partial<Parameters<typeof ScanPane>[0]> = {}) {
  const onPickPoint = vi.fn();
  const onDragStartGcp = vi.fn();
  const onMoveGcp = vi.fn();
  const utils = render(
    <ScanPane
      previewUrl="blob:scan"
      pixelSize={PIXEL_SIZE}
      gcps={GCPS}
      pending={null}
      focus={null}
      onPickPoint={onPickPoint}
      onDragStartGcp={onDragStartGcp}
      onMoveGcp={onMoveGcp}
      selectedGcpId={null}
      {...props}
    />,
  );
  return { ...utils, onPickPoint, onDragStartGcp, onMoveGcp };
}

describe("ScanPane", () => {
  beforeEach(() => {
    markerCalls.length = 0;
    scanHandlers.click = null;
  });

  it("renders under the root class the stylesheet targets", () => {
    // styles.css builds the panel's grid around `.georeference-scan` and the
    // narrow breakpoint keys off it. Renaming it would kill those rules
    // silently — the style tests regex the CSS and cannot see the DOM, and
    // Task 10's panel test asserts a class its own ScanPane mock invents.
    const { container } = renderPane();
    expect(container.querySelector(".georeference-scan")).not.toBeNull();
  });

  it("turns a click into ORIGINAL image pixels", () => {
    // CRS.Simple: pixel (x, y) is latLng(-y, x).
    const { onPickPoint } = renderPane();
    scanHandlers.click?.({ latlng: { lat: -415, lng: 637 } });
    expect(onPickPoint).toHaveBeenCalledWith(637, 415);
  });

  it("clamps a click made off the raster", () => {
    // maxBounds constrains the view, not the coordinate; letterboxed map is
    // clickable at minZoom={-4}. An unclamped -40 persists to IndexedDB.
    const { onPickPoint } = renderPane();
    scanHandlers.click?.({ latlng: { lat: 12, lng: -40 } });
    expect(onPickPoint).toHaveBeenCalledWith(0, 0);
    scanHandlers.click?.({ latlng: { lat: -950, lng: 1400 } });
    expect(onPickPoint).toHaveBeenLastCalledWith(1200, 800);
  });

  it("makes every placed point draggable and numbered", () => {
    renderPane();
    expect(markerCalls).toHaveLength(1);
    expect(markerCalls[0].draggable).toBe(true);
    expect(markerCalls[0].position).toEqual([-415, 637]);
    expect(markerCalls[0].icon.options.className).toBe("gcp-marker");
    expect(markerCalls[0].icon.options.html).toContain("1");
  });

  it("snapshots undo on dragstart, not only on drag", () => {
    // useGeoreferenceSession's beginDragGcp is the ONLY scan-side entry into
    // undo history. Wire `drag` and forget `dragstart` and every test still
    // passes, while one Ctrl+Z leaps back past the whole drag.
    const { onDragStartGcp, onMoveGcp } = renderPane();
    expect(Object.keys(markerCalls[0].eventHandlers ?? {}).sort()).toEqual([
      "drag",
      "dragstart",
    ]);
    markerCalls[0].eventHandlers?.dragstart?.();
    expect(onDragStartGcp).toHaveBeenCalledWith("a");
    markerCalls[0].eventHandlers?.drag?.({
      target: { getLatLng: () => ({ lat: -300, lng: 500 }) },
    });
    expect(onMoveGcp).toHaveBeenCalledWith("a", 500, 300);
  });

  it("clamps a drag that leaves the raster", () => {
    const { onMoveGcp } = renderPane();
    markerCalls[0].eventHandlers?.drag?.({
      target: { getLatLng: () => ({ lat: 30, lng: 1500 }) },
    });
    expect(onMoveGcp).toHaveBeenCalledWith("a", 1200, 0);
  });

  it("keeps a marker's icon and handlers stable across re-renders", () => {
    // react-leaflet calls marker.setIcon() when `icon` changes identity and
    // re-runs off()/on() when `eventHandlers` does — its deps are
    // `[element, eventHandlers]`. Fresh literals do both on every render,
    // i.e. once per pointer move of a drag.
    const { rerender, onPickPoint, onDragStartGcp, onMoveGcp } = renderPane();
    rerender(
      <ScanPane
        previewUrl="blob:scan"
        pixelSize={PIXEL_SIZE}
        gcps={GCPS}
        pending={null}
        focus={null}
        onPickPoint={onPickPoint}
        onDragStartGcp={onDragStartGcp}
        onMoveGcp={onMoveGcp}
        selectedGcpId={null}
      />,
    );
    expect(markerCalls).toHaveLength(2);
    expect(markerCalls[1].icon).toBe(markerCalls[0].icon);
    expect(markerCalls[1].eventHandlers).toBe(markerCalls[0].eventHandlers);
  });

  it("draws the pending half-point hollow and out of the way", () => {
    renderPane({
      gcps: [],
      pending: { side: "scan", pixel: { x: 10, y: 20 } },
    });
    expect(markerCalls).toHaveLength(1);
    expect(markerCalls[0].icon.options.className).toContain(
      "gcp-marker--pending",
    );
    // Non-interactive: a pending marker under the cursor must not swallow the
    // click that is trying to move it.
    expect(markerCalls[0].interactive).toBe(false);
  });
});
```

- [ ] **Step 7: Implement the pane** — `web/src/userMaps/components/ScanPane.tsx`:

```tsx
import { useCallback, useEffect, useMemo } from "react";
import L from "leaflet";
import {
  ImageOverlay,
  MapContainer,
  Marker,
  useMap,
  useMapEvent,
} from "react-leaflet";
import type { PixelSize } from "../transform/projection";
import type { PendingPoint } from "../useGeoreferenceSession";
import type { Gcp } from "../types";
import { numberedIcon } from "./gcpIcon";
import {
  clampToRaster,
  latLngFromPixel,
  pixelFromLatLng,
  scanBounds,
} from "./scanGeometry";

/**
 * A request to recentre the scan on one point. Carries a monotonic
 * `requestId` so asking for the SAME point twice still moves the map — the
 * effect below keys on the object, and a plain pixel would be `===` equal the
 * second time and do nothing.
 */
export type ScanFocusRequest = {
  pixel: { x: number; y: number };
  requestId: number;
};

function ScanClickCatcher({
  pixelSize,
  onPickPoint,
}: {
  pixelSize: PixelSize;
  onPickPoint: (x: number, y: number) => void;
}) {
  const handleClick = useCallback(
    (event: L.LeafletMouseEvent) => {
      // Clamped, not trusted: maxBounds constrains the view, not the click,
      // and minZoom={-4} leaves letterboxed map outside the image.
      const { x, y } = clampToRaster(pixelFromLatLng(event.latlng), pixelSize);
      onPickPoint(x, y);
    },
    [onPickPoint, pixelSize],
  );
  // useMapEvent, NOT useMapEvents: react-leaflet keys useMapEvents' effect on
  // the handlers OBJECT (deps `[map, handlers]`), so an inline literal calls
  // map.off()/map.on() on every render — once per pointer move during a drag.
  // A useCallback'd handler with useMapEvent subscribes once.
  useMapEvent("click", handleClick);
  return null;
}

/** Recentres the scan when the GCP list asks to zoom to a point. */
function ScanFocusController({ focus }: { focus: ScanFocusRequest | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) {
      return;
    }
    // Zoom in only if the user is further out than 1 (roughly "pixels are
    // visible"); never zoom them back OUT of a closer inspection.
    map.setView(latLngFromPixel(focus.pixel), Math.max(map.getZoom(), 1));
  }, [focus, map]);
  return null;
}

/**
 * One draggable control point, as its own component so the icon and the
 * handler object can be memoised PER POINT. Inline `icon={numberedIcon(…)}`
 * mints a fresh `L.DivIcon` every render, and react-leaflet answers that with
 * `marker.setIcon()`; an inline `eventHandlers` object literal re-runs
 * `off()`/`on()` for the same reason (its effect deps are
 * `[element, eventHandlers]`). Both fire once per pointer move of a drag.
 */
function ScanGcpMarker({
  gcp,
  label,
  selected,
  pixelSize,
  onDragStartGcp,
  onMoveGcp,
}: {
  gcp: Gcp;
  label: string;
  selected: boolean;
  pixelSize: PixelSize;
  onDragStartGcp: (id: string) => void;
  onMoveGcp: (id: string, x: number, y: number) => void;
}) {
  const icon = useMemo(
    () => numberedIcon(label, { selected }),
    [label, selected],
  );
  const position = useMemo(() => latLngFromPixel(gcp.pixel), [gcp.pixel]);
  const eventHandlers = useMemo(
    () => ({
      // dragstart is the ONLY scan-side entry into undo history. Without it
      // one Ctrl+Z walks back past the entire drag.
      dragstart: () => onDragStartGcp(gcp.id),
      drag: (event: L.LeafletEvent) => {
        const { x, y } = clampToRaster(
          pixelFromLatLng((event.target as L.Marker).getLatLng()),
          pixelSize,
        );
        onMoveGcp(gcp.id, x, y);
      },
    }),
    [gcp.id, onDragStartGcp, onMoveGcp, pixelSize],
  );
  return (
    <Marker
      position={position}
      draggable
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
}

/**
 * The scan side of the georeferencer. A second Leaflet map rather than a
 * hand-rolled pan/zoom surface: Leaflet is already bundled and already gives
 * pinch-zoom, draggable markers, and hit testing, none of which is worth
 * re-implementing.
 */
export function ScanPane({
  previewUrl,
  pixelSize,
  gcps,
  pending,
  focus,
  onPickPoint,
  onDragStartGcp,
  onMoveGcp,
  selectedGcpId,
}: {
  previewUrl: string;
  pixelSize: PixelSize;
  gcps: Gcp[];
  pending: PendingPoint;
  focus: ScanFocusRequest | null;
  onPickPoint: (x: number, y: number) => void;
  onDragStartGcp: (id: string) => void;
  onMoveGcp: (id: string, x: number, y: number) => void;
  selectedGcpId: string | null;
}) {
  // Memoised because `ImageOverlay` compares `bounds` by REFERENCE: a fresh
  // array every render calls setBounds()/_reset() on every pointer move of a
  // drag. `pixelSize` is a stable reference off the record.
  const bounds = useMemo(() => scanBounds(pixelSize), [pixelSize]);
  // Same reason as the per-marker memo: a fresh DivIcon means setIcon() on
  // every render. Computed unconditionally — hooks cannot be conditional —
  // and only mounted while a scan-side half-point is waiting.
  const pendingIcon = useMemo(
    () => numberedIcon(String(gcps.length + 1), { pending: true }),
    [gcps.length],
  );
  return (
    <div className="georeference-scan" data-testid="georeference-scan">
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        maxBounds={bounds}
        // Whole-image zoom levels only; the scan has no tile pyramid and
        // over-zooming a preview just shows interpolation.
        minZoom={-4}
        maxZoom={4}
        zoomSnap={0.25}
        attributionControl={false}
        className="georeference-scan-map"
      >
        <ImageOverlay url={previewUrl} bounds={bounds} />
        <ScanClickCatcher pixelSize={pixelSize} onPickPoint={onPickPoint} />
        <ScanFocusController focus={focus} />
        {gcps.map((gcp, index) => (
          <ScanGcpMarker
            key={gcp.id}
            gcp={gcp}
            label={String(index + 1)}
            selected={gcp.id === selectedGcpId}
            pixelSize={pixelSize}
            onDragStartGcp={onDragStartGcp}
            onMoveGcp={onMoveGcp}
          />
        ))}
        {pending?.side === "scan" ? (
          <Marker
            position={latLngFromPixel(pending.pixel)}
            icon={pendingIcon}
            interactive={false}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd web && npx vitest run src/userMaps/components/scanGeometry.test.ts src/userMaps/components/gcpIcon.test.ts src/userMaps/components/ScanPane.test.tsx && npx tsc -b && npx eslint src/userMaps/components`
Expected: PASS (5 + 3 + 8 tests), no type errors, lint silent. The two helper
modules are pure, so their tests need no react-leaflet mock; `ScanPane` has
its own mocked-Leaflet test above, because nothing else in this plan executes
it — Task 10 and Task 12 both stub the module.

**`tsc -b`, not `tsc --noEmit`.** `web/tsconfig.json` is a solution file with
`"files": []`, so the root `--noEmit` form checks nothing at all; `-b` compiles
the referenced projects and exits 2 on error. Never measure it through a pipe.

- [ ] **Step 9: Commit**

```bash
git add web/src/userMaps/components/ScanPane.tsx web/src/userMaps/components/ScanPane.test.tsx web/src/userMaps/components/scanGeometry.ts web/src/userMaps/components/scanGeometry.test.ts web/src/userMaps/components/gcpIcon.ts web/src/userMaps/components/gcpIcon.test.ts
git commit -m "feat(web): add the georeferencer scan pane on CRS.Simple"
```

---

### Task 9: `GcpList` — residual table

**Files:**
- Create: `web/src/userMaps/components/GcpList.tsx`
- Test: `web/src/userMaps/components/GcpList.test.tsx`

**Interfaces:**
- Produces: `<GcpList gcps report onDelete onSelect onZoomTo selectedGcpId />`. `formatResidual` stays module-private — nothing else needs it, and exporting a function from a `.tsx` file is a lint error here.

**`mostInconsistentIndex` is `number | null`.** `residualReport` returns
residuals from four points but accuses nobody below five (`MIN_GCPS_FOR_SUSPECT`),
because four points fitting three parameters leave a **one-dimensional**
residual space (`I − H` has rank 1 at n = 4): every residual vector is a
multiple of one direction fixed by the pixel layout, so raw, leave-one-out and
studentized residuals all rank identically and name the same row whoever is
actually wrong — measured 24% correct against a 25% baseline. (Do **not**
restate this as a claim about all four leverages being equal: that holds only
for a symmetric layout, and `residuals.ts:34–37` plus the verified-facts row at
the top of this plan both record the retraction and the measured
counter-example.) So the four-point table shows
real metres with **no row highlighted**, and that state has its own test below.

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/components/GcpList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GcpList } from "./GcpList";
import type { Gcp } from "../types";

const GCPS: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
  { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
  { id: "d", pixel: { x: 1200, y: 800 }, map: { lat: 46.0, lng: -61.0 } },
  { id: "e", pixel: { x: 600, y: 400 }, map: { lat: 46.05, lng: -61.1 } },
];

function renderList(props: Partial<Parameters<typeof GcpList>[0]> = {}) {
  const onDelete = vi.fn();
  const onSelect = vi.fn();
  const onZoomTo = vi.fn();
  render(
    <GcpList
      gcps={GCPS.slice(0, 4)}
      report={null}
      onDelete={onDelete}
      onSelect={onSelect}
      onZoomTo={onZoomTo}
      selectedGcpId={null}
      {...props}
    />,
  );
  return { onDelete, onSelect, onZoomTo };
}

describe("GcpList", () => {
  it("shows an em dash rather than a misleading 0 m at three points", () => {
    renderList({ gcps: GCPS.slice(0, 3) });
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("0 m")).toBeNull();
  });

  it("renders residuals in metres but accuses nobody at four points", () => {
    // residualReport hands back mostInconsistentIndex: null below five
    // points. The numbers are real and worth showing; the accusation is not
    // — at four points the residual space is one-dimensional (I − H has rank
    // 1), so raw, leave-one-out and studentized residuals rank identically
    // and all three are at chance.
    renderList({
      report: {
        metresPerGcp: [12.4, 8.1, 40.9, 15.2],
        rmsMetres: 22.3,
        mostInconsistentIndex: null,
      },
    });
    expect(screen.getByText("12 m")).toBeInTheDocument();
    expect(screen.getByText("41 m")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    for (const row of rows) {
      expect(row).not.toHaveClass("gcp-row--suspect");
    }
  });

  it("marks the worst-fitting point from the fifth point on", () => {
    renderList({
      gcps: GCPS,
      report: {
        metresPerGcp: [12.4, 8.1, 40.9, 15.2, 9.7],
        rmsMetres: 22.3,
        mostInconsistentIndex: 2,
      },
    });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[2]).toHaveClass("gcp-row--suspect");
    expect(rows[3]).not.toHaveClass("gcp-row--suspect");
  });

  it("deletes a point by its number", async () => {
    const { onDelete } = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Delete point 2" }));
    expect(onDelete).toHaveBeenCalledWith("b");
  });

  it("navigates to a point by its number", async () => {
    // The list is the stated debugging tool: seeing a 400 m residual is only
    // half of it if you cannot get to the point that caused it.
    const { onZoomTo } = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Zoom to point 3" }));
    expect(onZoomTo).toHaveBeenCalledWith("c");
  });

  it("says nothing at all when there are no points", () => {
    renderList({ gcps: [] });
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("reports the hovered row and marks the selected one", async () => {
    // Neither `onSelect` nor `selectedGcpId` was asserted anywhere. Delete
    // both props and every other test in this file and in
    // GeoreferencePanel.test.tsx still passes — while `.gcp-row--selected`,
    // `.gcp-marker--selected`, ScanPane's `selectedGcpId` prop and
    // numberedIcon's `selected` branch all go dead at once.
    const { onSelect } = renderList({ selectedGcpId: "c" });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[2]).toHaveClass("gcp-row--selected");
    expect(rows[0]).not.toHaveClass("gcp-row--selected");
    await userEvent.hover(rows[0]);
    expect(onSelect).toHaveBeenCalledWith("a");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/GcpList.test.tsx`
Expected: FAIL — cannot resolve `./GcpList`.

- [ ] **Step 3: Implement** — `web/src/userMaps/components/GcpList.tsx`:

```tsx
import type { ResidualReport } from "../transform/residuals";
import type { Gcp } from "../types";

/**
 * Sub-metre precision would be false confidence: a hand-clicked point on a
 * 19th-century scan is not accurate to a centimetre, and trailing decimals
 * invite the user to chase noise.
 *
 * Module-private: nothing else needs it, and exporting a plain function from
 * a .tsx file is a react-refresh/only-export-components error here.
 */
function formatResidual(metres: number): string {
  return `${Math.round(metres)} m`;
}

export function GcpList({
  gcps,
  report,
  onDelete,
  onSelect,
  onZoomTo,
  selectedGcpId,
}: {
  gcps: Gcp[];
  report: ResidualReport | null;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onZoomTo: (id: string) => void;
  selectedGcpId: string | null;
}) {
  if (gcps.length === 0) {
    return null;
  }
  return (
    <table className="gcp-list">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Scan</th>
          <th scope="col">Map</th>
          <th scope="col">Off by</th>
          <th scope="col">
            {/* Defined in styles.css (Task 12). Without that rule a literal
                "Actions" heading shows up in the table. */}
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {gcps.map((gcp, index) => {
          // mostInconsistentIndex is `number | null` — null below five
          // points, where no statistic beats chance. A strict === against a
          // number index handles both null and a missing report, so this
          // needs no extra guard, but it does need to stay strict.
          const suspect = report?.mostInconsistentIndex === index;
          // "gcp-row" is not decorative: styles.css targets `.gcp-row td` for
          // cell padding, and it was missing from the DOM in an earlier draft.
          const rowClass = [
            "gcp-row",
            suspect ? "gcp-row--suspect" : "",
            gcp.id === selectedGcpId ? "gcp-row--selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <tr
              key={gcp.id}
              className={rowClass}
              onMouseEnter={() => onSelect(gcp.id)}
            >
              <td>{index + 1}</td>
              <td>
                {Math.round(gcp.pixel.x)}, {Math.round(gcp.pixel.y)}
              </td>
              <td>
                {gcp.map.lat.toFixed(4)}, {gcp.map.lng.toFixed(4)}
              </td>
              <td
                className="gcp-residual"
                title={
                  suspect
                    ? "Disagrees most with the other points"
                    : undefined
                }
              >
                {report ? formatResidual(report.metresPerGcp[index]) : "—"}
              </td>
              <td>
                <button
                  type="button"
                  className="gcp-zoom"
                  aria-label={`Zoom to point ${index + 1}`}
                  onClick={() => onZoomTo(gcp.id)}
                >
                  Zoom to
                </button>
                <button
                  type="button"
                  className="gcp-delete"
                  aria-label={`Delete point ${index + 1}`}
                  onClick={() => onDelete(gcp.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/userMaps/components/GcpList.test.tsx && npx tsc -b`
Expected: PASS (7 tests), no type errors. (`tsc -b` is the only form that
type-checks anything here — see the verified-facts table.)
`.visually-hidden` does **not** exist in
`styles.css` today — Task 12 adds it, along with a style test. The unit tests
here do not depend on it, but the rendered page does: without it the header
cell reads a literal "Actions".

**Follow-up, deliberately not in PR 2: warn on clustered control points.**
This table is where the warning belongs when it is built. Three points inside
200 px of a 4096 px scan pass every acceptance gate — their shape is fine —
but the fit is extrapolated roughly 20x beyond their hull, so a 1 px click
slip moves the far corner about a kilometre, and at three points there is no
residual report to hint at it either. The spread gate in `affine.ts`
deliberately does **not** reject this, because no single threshold separates a
huddle from an honestly elongated map (a river-corridor strip scores lower
than the huddle does). The fix is a caveat on the reported accuracy — e.g.
comparing the GCP hull's diagonal to the image diagonal and saying so when the
ratio is small — not a refusal to solve. Do not read the passing gate as
coverage; the spec records this as a known gap.

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/components/GcpList.tsx web/src/userMaps/components/GcpList.test.tsx
git commit -m "feat(web): add the GCP residual list"
```

---
### Task 10: `GeoreferencePanel` — the shell

**Files:**
- Create: `web/src/userMaps/components/georeferenceStatus.ts`
- Create: `web/src/userMaps/components/GeoreferencePanel.tsx`
- Test: `web/src/userMaps/components/GeoreferencePanel.test.tsx`

**Interfaces:**
- Consumes: `ScanPane` and `ScanFocusRequest` (Task 8), `GcpList` (Task 9), `GeoreferenceSession` and `GeoreferenceStatus` (Task 7).
- Produces:
  - `statusMessage(status: GeoreferenceStatus): string`, from **`georeferenceStatus.ts`** — a `.ts` module both because the copy is worth testing without rendering Leaflet and because a function export from a `.tsx` file is a lint error here.
  - `<GeoreferencePanel record previewUrl opacity session onOpacityChange onClose onDelete onFocusGcpOnMap referenceLayers referenceLayersLocked onToggleReferenceLayer />`
  - `type ReferenceLayerState = { aerial: boolean; parcels: boolean }`

**The overlay is a frame, not a modal.** The user's very next action is a
click on the app's own map, which is *behind* this component. So
`.georeference-overlay` is `position: fixed; inset: 0` with **no scrim and
`pointer-events: none`**, and only its interactive children take
`pointer-events: auto`. The panel itself is a left-anchored ~45vw column, per
`docs/superpowers/specs/2026-07-24-web-user-maps-design.md:189–194`: panel left
~45%, the app map keeps the right ~55%. An earlier draft made the overlay an
opaque full-bleed card over a dark scrim, which meant `MapClickCatcher` never
saw a click and **no control point could ever be completed** — while the status
line instructed the user to "click the same spot on the map". Task 12 carries
the CSS; this task must render markup that CSS can actually work with.

**The panel renders its own overlay wrapper, and the class names are a
contract with Task 12's stylesheet.** `.georeference-overlay` (fixed, `inset:
0`), `.georeference-panel` carrying `data-tab`, `.georeference-scan` (from
`ScanPane`), `.georeference-side`, `.georeference-tabs` — as a *direct child
of the panel*, not nested in the header, because the narrow breakpoint places
it in its own grid row — and `.georeference-map-bar`, a **sibling of the
panel** (see below). An earlier draft rendered none of these: the CSS
targeted `.georeference-overlay`, `.georeference-side` and `[data-tab]` while
the DOM had `georeference-panel--scan`, so the panel landed in normal document
flow at the end of the page, both breakpoints were dead, and the `Scan | Map`
toggle did nothing. Every style test still passed, because they regex the
stylesheet rather than the rendered DOM. There is a rendered-DOM test below
for exactly this class of bug, and it is not optional.

**The floating bar is the narrow Map tab's entire UI.** Spec: on a narrow
viewport, choosing *Map* "hides the panel entirely and leaves a floating bar
carrying the prompt and a *Back to scan* button". So the bar is a sibling of
`.georeference-panel` inside the overlay — not a child, because Task 12 sets
`display: none` on the panel at that breakpoint, and a child would go with it.
It is rendered unconditionally and revealed by CSS alone: the panel already
carries `data-tab`, the bar carries the same attribute, and no JS needs to know
the viewport width.

**Deletion is confirmed here and nowhere else.** `App`'s `onDelete` handler
must call `removeMap` straight out, with no second `window.confirm` — two
confirms for one button is a bug the user experiences as the dialog "not
working".

**`referenceLayersLocked` is a licence gate, not decoration.** Both reference
layers (`ns-aerial`, `nsprd`) are `province-restricted` in
`layers/layerCatalog.ts`, and everywhere else in the app `LayerToggle` refuses
to enable a restricted layer until the user has accepted the provincial
licence (`App.tsx` keeps `licenceAccepted` and calls `disabledProvinceLayers()`
otherwise). A panel that flipped `provinceLayers` directly would be a hole
straight through that gate. The panel does not need to understand licensing —
it takes one boolean and renders the checkboxes disabled with a short reason.

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/components/GeoreferencePanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// ScanPane mounts a real MapContainer, which needs a sized DOM node jsdom
// does not provide. The panel's own behaviour is what this file tests, so the
// scan side is stubbed; its coordinate maths, its click/drag wiring AND its
// root class have direct tests in Task 8's ScanPane.test.tsx.
//
// The stub renders `.georeference-scan` so the layout test below can assert
// the panel's grid children. That is only honest because ScanPane.test.tsx
// pins the same class on the REAL component — without it this assertion would
// be checking a class invented three lines up, and renaming the real one
// would kill three CSS rules with the whole suite green.
vi.mock("./ScanPane", () => ({
  ScanPane: () => <div className="georeference-scan" data-testid="scan-pane" />,
}));

import { GeoreferencePanel } from "./GeoreferencePanel";
import { statusMessage } from "./georeferenceStatus";
import type { GeoreferenceSession } from "../useGeoreferenceSession";
import type { UserMapRecord } from "../types";

const RECORD: UserMapRecord = {
  id: "m",
  name: "Church of Inverness 1888",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: { kind: "gcp", method: "affine", gcps: [] },
};

function fakeSession(overrides: Partial<GeoreferenceSession> = {}): GeoreferenceSession {
  return {
    gcps: [],
    pending: null,
    params: null,
    mesh: null,
    report: null,
    status: { kind: "need-more", remaining: 3 },
    canUndo: false,
    pickScanPoint: vi.fn(),
    pickMapPoint: vi.fn(),
    cancelPending: vi.fn(),
    beginDragGcp: vi.fn(),
    moveGcpOnScan: vi.fn(),
    moveGcpOnMap: vi.fn(),
    deleteGcp: vi.fn(),
    undo: vi.fn(),
    flush: vi.fn(),
    // Task 12 adds this to GeoreferenceSession (a delete has to cancel its
    // pending write, not flush it). The factory returns the full type, so a
    // missing field is a `tsc -b` error, not a silent gap.
    discardPendingWrite: vi.fn(),
    ...overrides,
  };
}

function renderPanel(session: GeoreferenceSession, props: Partial<Parameters<typeof GeoreferencePanel>[0]> = {}) {
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const onOpacityChange = vi.fn();
  const onToggleReferenceLayer = vi.fn();
  const onFocusGcpOnMap = vi.fn();
  const utils = render(
    <GeoreferencePanel
      record={RECORD}
      previewUrl="blob:scan"
      opacity={0.7}
      session={session}
      onOpacityChange={onOpacityChange}
      onClose={onClose}
      onDelete={onDelete}
      onFocusGcpOnMap={onFocusGcpOnMap}
      referenceLayers={{ aerial: false, parcels: true }}
      referenceLayersLocked={false}
      onToggleReferenceLayer={onToggleReferenceLayer}
      {...props}
    />,
  );
  return {
    ...utils,
    onClose,
    onDelete,
    onOpacityChange,
    onToggleReferenceLayer,
    onFocusGcpOnMap,
  };
}

describe("statusMessage", () => {
  it("asks for a fourth point rather than reporting a fake 0 m", () => {
    expect(statusMessage({ kind: "exact-fit" })).toBe(
      "Exact fit — add a 4th point to check accuracy.",
    );
  });

  it("counts down to the minimum", () => {
    expect(statusMessage({ kind: "need-more", remaining: 3 })).toBe(
      "Place 3 points to see the map drape.",
    );
    expect(statusMessage({ kind: "need-more", remaining: 1 })).toBe(
      "Place 1 more point to see the map drape.",
    );
  });

  it("explains a refused solve without claiming it is always a straight scan line", () => {
    // The status covers three refusals, only one of which is "the points on
    // the SCAN are nearly collinear": a non-finite result and a 50:1 axis
    // squash also land here, and the squash is what three map clicks down a
    // meridian produce from a perfectly good scan triangle. Copy that said
    // "move one off the line" would be wrong advice in two cases out of
    // three, so it names both sides.
    expect(statusMessage({ kind: "degenerate" })).toBe(
      "These points can't pin the map down — check that neither the scan " +
        "points nor the map points sit on a straight line.",
    );
  });

  it("reports RMS with the point count", () => {
    expect(statusMessage({ kind: "solved", rmsMetres: 42.4, count: 5 })).toBe(
      "RMS 42 m across 5 points",
    );
  });

  it("prompts for the other half of a pending pair", () => {
    expect(statusMessage({ kind: "awaiting-map" })).toBe(
      "Now click the same spot on the map. (Esc to cancel)",
    );
    expect(statusMessage({ kind: "awaiting-scan" })).toBe(
      "Now click the same spot on the scan. (Esc to cancel)",
    );
  });
});

describe("GeoreferencePanel", () => {
  it("renders a full-viewport overlay whose class names match the stylesheet", () => {
    // Asserts the RENDERED DOM, not the CSS text. Task 12's style tests regex
    // styles.css, so they pass whether or not anything ever renders these
    // class names — which is how an earlier draft shipped a stylesheet
    // targeting .georeference-overlay, .georeference-side and [data-tab]
    // against a DOM that had none of them. The panel landed in normal
    // document flow at the end of the page, and every style test was green.
    const { container } = renderPanel(fakeSession());
    const overlay = container.querySelector(".georeference-overlay");
    expect(overlay).not.toBeNull();
    const panel = overlay?.querySelector(".georeference-panel");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-tab", "scan");
    // The narrow breakpoint puts the tabs in their own grid ROW, so they have
    // to be a direct child of the panel, not nested inside the header.
    expect(panel?.querySelector(":scope > .georeference-tabs")).not.toBeNull();
    expect(panel?.querySelector(":scope > .georeference-scan")).not.toBeNull();
    expect(panel?.querySelector(":scope > .georeference-side")).not.toBeNull();
  });

  it("leaves the app's own map reachable behind it", () => {
    // The critical one. The next thing the user must do is click the map
    // BEHIND this component. An earlier draft rendered an opaque full-bleed
    // card over a scrim, so MapClickCatcher never received a click and no
    // control point could ever be completed. jsdom does no layout, so this
    // asserts the two structural facts that make the CSS possible: the
    // overlay is not a scrim-and-card pair, and the narrow Map tab's floating
    // bar is a SIBLING of the panel (Task 12 hides the panel outright there,
    // and a child would be hidden with it). The declarations themselves are
    // pinned by styles.test.ts in Task 12; neither half substitutes for the
    // other.
    const { container } = renderPanel(fakeSession());
    const overlay = container.querySelector(".georeference-overlay");
    const bar = overlay?.querySelector(":scope > .georeference-map-bar");
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute("data-tab", "scan");
    expect(
      container.querySelector(".georeference-panel .georeference-map-bar"),
    ).toBeNull();
  });

  it("switches which pane the narrow layout shows, and offers the way back", async () => {
    const { container } = renderPanel(fakeSession());
    await userEvent.click(screen.getByRole("tab", { name: "Map" }));
    expect(container.querySelector(".georeference-panel")).toHaveAttribute(
      "data-tab",
      "map",
    );
    // The panel is display:none at this breakpoint, so the bar is the only
    // thing carrying the prompt — and the only way back to the scan.
    expect(container.querySelector(".georeference-map-bar")).toHaveAttribute(
      "data-tab",
      "map",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Back to scan" }),
    );
    expect(container.querySelector(".georeference-panel")).toHaveAttribute(
      "data-tab",
      "scan",
    );
  });

  it("announces status politely for screen readers", () => {
    renderPanel(fakeSession());
    // TWO live regions on purpose: the panel header, and the floating bar
    // that is the only visible prompt on the narrow Map tab, where CSS hides
    // the panel outright. Both must carry the same text — a bar showing a
    // stale prompt is worse than no bar.
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    for (const status of statuses) {
      expect(status).toHaveTextContent("Place 3 points to see the map drape.");
    }
  });

  it("names the map being georeferenced", () => {
    renderPanel(fakeSession());
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Church of Inverness 1888",
    );
  });

  it("cancels a pending point on Escape, and only closes when none is pending", async () => {
    const pending = fakeSession({
      pending: { side: "scan", pixel: { x: 1, y: 2 } },
      status: { kind: "awaiting-map" },
    });
    const { onClose } = renderPanel(pending);
    await userEvent.keyboard("{Escape}");
    expect(pending.cancelPending).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("flushes pending writes before closing on Escape", async () => {
    // Both halves, in one test, because asserting only `onClose` lets an
    // implementation drop `flush()` from this branch and stay green: writes
    // are debounced 400 ms, so an edit made inside that window and closed
    // with Escape is simply lost on reload. Done had this assertion; Escape
    // did not, and Escape is the faster habit.
    const session = fakeSession();
    const { onClose } = renderPanel(session);
    await userEvent.keyboard("{Escape}");
    expect(session.flush).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("flushes pending writes before closing", async () => {
    const session = fakeSession();
    renderPanel(session);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(session.flush).toHaveBeenCalled();
  });

  it("undoes with the keyboard shortcut", async () => {
    const session = fakeSession({ canUndo: true });
    renderPanel(session);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(session.undo).toHaveBeenCalled();
  });

  it("disables Undo when there is nothing to undo", () => {
    renderPanel(fakeSession());
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("offers the reference layers the hidden rail would otherwise strand", async () => {
    const { onToggleReferenceLayer } = renderPanel(fakeSession());
    const aerial = screen.getByRole("checkbox", { name: "Aerial imagery" });
    expect(aerial).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Property boundaries" })).toBeChecked();
    await userEvent.click(aerial);
    expect(onToggleReferenceLayer).toHaveBeenCalledWith("aerial", true);
  });

  it("will not switch on restricted layers the user has not licensed", async () => {
    // The rest of the app gates ns-aerial and nsprd behind licence
    // acceptance. A panel that flipped them anyway would be a way around it.
    const { onToggleReferenceLayer } = renderPanel(fakeSession(), {
      referenceLayersLocked: true,
    });
    const aerial = screen.getByRole("checkbox", { name: "Aerial imagery" });
    expect(aerial).toBeDisabled();
    await userEvent.click(aerial);
    expect(onToggleReferenceLayer).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Accept the provincial data licence in the layer list to use these.",
      ),
    ).toBeInTheDocument();
  });

  it("drives the drape opacity", () => {
    const { onOpacityChange } = renderPanel(fakeSession());
    const slider = screen.getByRole("slider", { name: "Map opacity" });
    expect(slider).toHaveValue("70");
    // NOT userEvent.clear(): verified to throw "clear() is only supported on
    // editable elements" against an input[type=range]. fireEvent.change is
    // how a slider is moved in jsdom, and fires exactly one change event.
    fireEvent.change(slider, { target: { value: "40" } });
    expect(onOpacityChange).toHaveBeenCalledWith(0.4);
  });

  it("asks App to move the live map when a row asks to zoom to its point", async () => {
    // The scan side is stubbed in this file, so only the App-facing half is
    // observable here; the scan half is a setView inside ScanPane and is
    // covered by the live check in Task 13.
    const session = fakeSession({
      gcps: [{ id: "a", pixel: { x: 10, y: 20 }, map: { lat: 46, lng: -61 } }],
    });
    const { onFocusGcpOnMap } = renderPanel(session);
    await userEvent.click(
      screen.getByRole("button", { name: "Zoom to point 1" }),
    );
    expect(onFocusGcpOnMap).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
    );
  });

  it("confirms before deleting the map, and is the only place that asks", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onDelete } = renderPanel(fakeSession());
    await userEvent.click(screen.getByRole("button", { name: "Delete map" }));
    expect(onDelete).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete map" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    // One prompt per click. App's handler must not wrap this in a second
    // window.confirm — the user reads a dialog that reappears as broken.
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/GeoreferencePanel.test.tsx`
Expected: FAIL — cannot resolve `./GeoreferencePanel`.

- [ ] **Step 3: Implement the copy** — `web/src/userMaps/components/georeferenceStatus.ts`:

```ts
import type { GeoreferenceStatus } from "../useGeoreferenceSession";

export function statusMessage(status: GeoreferenceStatus): string {
  switch (status.kind) {
    case "awaiting-map":
      return "Now click the same spot on the map. (Esc to cancel)";
    case "awaiting-scan":
      return "Now click the same spot on the scan. (Esc to cancel)";
    case "need-more":
      return status.remaining === 3
        ? "Place 3 points to see the map drape."
        : `Place ${status.remaining} more point${
            status.remaining === 1 ? "" : "s"
          } to see the map drape.`;
    case "degenerate":
      // Names BOTH sides on purpose. Three different refusals arrive here and
      // only one of them is a straight line on the scan: a non-finite result,
      // and a solved transform squashing one axis past 50:1 — which is what
      // three map clicks down a meridian produce from an ideal scan triangle.
      return (
        "These points can't pin the map down — check that neither the scan " +
        "points nor the map points sit on a straight line."
      );
    case "exact-fit":
      // Three points fit an affine exactly by construction, so every residual
      // is 0. Printing "0 m" would read as perfect accuracy.
      return "Exact fit — add a 4th point to check accuracy.";
    case "solved":
      return `RMS ${Math.round(status.rmsMetres)} m across ${status.count} points`;
  }
}
```

- [ ] **Step 4: Implement the panel** — `web/src/userMaps/components/GeoreferencePanel.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { GeoreferenceSession } from "../useGeoreferenceSession";
import type { Gcp, UserMapRecord } from "../types";
import { GcpList } from "./GcpList";
import { statusMessage } from "./georeferenceStatus";
import { ScanPane, type ScanFocusRequest } from "./ScanPane";

export type ReferenceLayerId = "aerial" | "parcels";
export type ReferenceLayerState = Record<ReferenceLayerId, boolean>;

export function GeoreferencePanel({
  record,
  previewUrl,
  opacity,
  session,
  onOpacityChange,
  onClose,
  onDelete,
  onFocusGcpOnMap,
  referenceLayers,
  referenceLayersLocked = false,
  onToggleReferenceLayer,
}: {
  record: UserMapRecord;
  previewUrl: string;
  opacity: number;
  session: GeoreferenceSession;
  onOpacityChange: (opacity: number) => void;
  onClose: () => void;
  /** Deletes the map. Already confirmed here — do NOT confirm again. */
  onDelete: () => void;
  /** The panel moves its own scan pane; only App can move the live map. */
  onFocusGcpOnMap: (gcp: Gcp) => void;
  referenceLayers: ReferenceLayerState;
  referenceLayersLocked?: boolean;
  onToggleReferenceLayer: (id: ReferenceLayerId, enabled: boolean) => void;
}) {
  const [tab, setTab] = useState<"scan" | "map">("scan");
  const [selectedGcpId, setSelectedGcpId] = useState<string | null>(null);
  const [scanFocus, setScanFocus] = useState<ScanFocusRequest | null>(null);
  const focusRequestId = useRef(0);
  const { cancelPending, flush, undo } = session;
  const hasPending = session.pending !== null;
  const canUndo = session.canUndo;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Escape unwinds one level at a time: an in-progress pair first, the
        // panel only once there is nothing half-placed to lose.
        if (hasPending) {
          cancelPending();
        } else {
          flush();
          onClose();
        }
        return;
      }
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (canUndo) {
          undo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, cancelPending, flush, hasPending, onClose, undo]);

  function close() {
    // Writes are debounced, so the tail of a session would otherwise be lost
    // between the last edit and the panel unmounting.
    flush();
    onClose();
  }

  function zoomToGcp(id: string) {
    const gcp = session.gcps.find((candidate) => candidate.id === id);
    if (!gcp) {
      return;
    }
    // Both panes move. The scan is this component's own child, so it takes a
    // focus request directly; the live map is inside MapContainer and only
    // reachable through App's binding, so that half goes up as a callback.
    // The request carries a monotonic id so asking for the SAME point twice
    // still moves the map — an equal object would be a no-op to the effect.
    focusRequestId.current += 1;
    setScanFocus({ pixel: gcp.pixel, requestId: focusRequestId.current });
    onFocusGcpOnMap(gcp);
  }

  const status = statusMessage(session.status);

  return (
    // The overlay is a fixed, full-viewport FRAME, not a modal: it carries
    // `pointer-events: none` and no scrim, so the app's own map behind it
    // stays visible and clickable — which is the whole interaction. The panel
    // is a left-anchored ~45vw column inside it, and takes back
    // `pointer-events: auto`. Both class names, `data-tab`, and the floating
    // bar below are what styles.css targets — see the rendered-DOM tests.
    <div className="georeference-overlay">
      <section
        className="georeference-panel"
        data-tab={tab}
        aria-label={`Georeferencing ${record.name}`}
      >
        <header className="georeference-header">
          <h2>{record.name}</h2>
          <p role="status" aria-live="polite" className="georeference-status">
            {status}
          </p>
        </header>

        {/* A DIRECT child of the panel, not of the header: the narrow
            breakpoint gives the tabs their own grid row. Hidden by CSS on
            wide screens, where both panes are visible at once. */}
        <div className="georeference-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "scan"}
            onClick={() => setTab("scan")}
          >
            Scan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "map"}
            onClick={() => setTab("map")}
          >
            Map
          </button>
        </div>

        <ScanPane
          previewUrl={previewUrl}
          pixelSize={record.pixelSize}
          gcps={session.gcps}
          pending={session.pending}
          focus={scanFocus}
          onPickPoint={session.pickScanPoint}
          onDragStartGcp={session.beginDragGcp}
          onMoveGcp={session.moveGcpOnScan}
          selectedGcpId={selectedGcpId}
        />

        <div className="georeference-side">
          <div className="georeference-points">
            <GcpList
              gcps={session.gcps}
              report={session.report}
              onDelete={session.deleteGcp}
              onSelect={setSelectedGcpId}
              onZoomTo={zoomToGcp}
              selectedGcpId={selectedGcpId}
            />
          </div>

          <footer className="georeference-footer">
            <label className="georeference-opacity">
              <span>Map opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Map opacity"
                value={Math.round(opacity * 100)}
                onChange={(event) =>
                  onOpacityChange(Number(event.target.value) / 100)
                }
              />
            </label>

            <fieldset
              className="georeference-references"
              disabled={referenceLayersLocked}
            >
              <legend>Reference layers</legend>
              <label>
                <input
                  type="checkbox"
                  checked={referenceLayers.aerial}
                  onChange={(event) =>
                    onToggleReferenceLayer("aerial", event.target.checked)
                  }
                />
                Aerial imagery
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={referenceLayers.parcels}
                  onChange={(event) =>
                    onToggleReferenceLayer("parcels", event.target.checked)
                  }
                />
                Property boundaries
              </label>
              {referenceLayersLocked ? (
                <small className="georeference-references-locked">
                  Accept the provincial data licence in the layer list to use
                  these.
                </small>
              ) : null}
            </fieldset>

            <div className="georeference-actions">
              <button type="button" onClick={undo} disabled={!canUndo}>
                Undo
              </button>
              <button
                type="button"
                className="georeference-done"
                onClick={close}
              >
                Done
              </button>
              <button
                type="button"
                className="georeference-delete"
                onClick={() => {
                  // The ONLY confirm for this action. App's onDelete removes
                  // the map directly; a second prompt there reads as a broken
                  // dialog.
                  if (
                    window.confirm(
                      `Remove "${record.name}" from this device? The original ` +
                        "file on your computer is not affected.",
                    )
                  ) {
                    onDelete();
                  }
                }}
              >
                Delete map
              </button>
            </div>
          </footer>
        </div>
      </section>

      {/* A SIBLING of the panel, not a child. On a narrow viewport the Map
          tab sets `display: none` on the panel — that is the point of the tab,
          per the spec — so anything nested inside it would vanish too. This
          bar is what is left: the live prompt, and the way back. CSS shows it
          only at that breakpoint and only on that tab, so no JS here needs to
          know the viewport width. */}
      <div className="georeference-map-bar" data-tab={tab}>
        <p
          role="status"
          aria-live="polite"
          className="georeference-map-bar-status"
        >
          {status}
        </p>
        <button
          type="button"
          className="georeference-map-bar-back"
          onClick={() => setTab("scan")}
        >
          Back to scan
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd web && npx vitest run src/userMaps/components/GeoreferencePanel.test.tsx && npx tsc -b && npx eslint src/userMaps/components`
Expected: PASS (20 tests — 5 `statusMessage`, 15 panel), no type errors, lint
silent. (`tsc -b` is the only form that type-checks anything here — see the
verified-facts table.)

- [ ] **Step 6: Commit**

```bash
git add web/src/userMaps/components/GeoreferencePanel.tsx web/src/userMaps/components/GeoreferencePanel.test.tsx web/src/userMaps/components/georeferenceStatus.ts
git commit -m "feat(web): add the georeferencer panel shell"
```

---

### Task 11: `GeoreferenceMapLayer` and the `MapCanvas` binding

**Files:**
- Create: `web/src/userMaps/components/GeoreferenceMapLayer.tsx`
- Test: `web/src/userMaps/components/GeoreferenceMapLayer.test.tsx`
- Modify: `web/src/components/MapCanvas.tsx`
- Test: `web/src/components/MapCanvas.test.tsx` (probe mocks + binding assertions)
- Modify: `web/src/components/mapPanes.ts` (one constant pair)
- Test: `web/src/components/mapPanes.test.ts` (extend ordering assertions)

**Interfaces:**
- Produces:
  - `type MapFocusRequest = { lat: number; lng: number; requestId: number }`
  - `type GeoreferenceBinding = { gcps: Gcp[]; pending: PendingPoint; draft: DraftUserMap | null; focus: MapFocusRequest | null; onPickMapPoint: (lat: number, lng: number) => void; onDragStartGcp: (id: string) => void; onMoveGcpOnMap: (id: string, lat: number, lng: number) => void }`
  - `<GeoreferenceMapLayer binding={…} />`
  - `mapPanes.ts`: `GEOREFERENCE_PANE = "georeference-pane"`, `GEOREFERENCE_PANE_Z_INDEX = 660`
- `MapCanvas` gains one optional prop: `georeference?: GeoreferenceBinding | null`.
- Consumes `numberedIcon` from `components/gcpIcon.ts` (created in Task 8, so nothing here edits `ScanPane.tsx`).

**No selection state crosses to the map.** `GcpList`'s selected row is panel
state and stays there. The map markers already carry their point's number
(`numberedIcon`), which is how the user finds the row's point on the map — so
threading a selected id through `App` would buy a highlight nobody asked for
at the cost of a third owner for one piece of state. The *focus* request is
different and does cross: only App can move the live map, and the panel's
zoom-to control has to reach it.

**Pane placement, corrected.** GCP markers must sit above every data overlay —
a control point hidden under a parcel line is unclickable — and the app's own
data panes top out at 430 (`MEASURE_PANE_Z_INDEX`), with `PROVINCE_LAYER_Z_INDEXES`
topping out at 250 (waterfalls). They also need to clear Leaflet's *built-in*
panes, and this is where an earlier draft got its reasoning wrong: 700 is
Leaflet's **popup** pane, not its marker pane. Verified from
`leaflet/dist/leaflet.css` — tile 200, overlay 400, shadow 500, **marker 600**,
tooltip 650, **popup 700**. So 660 is the value: above every data pane, above
Leaflet's marker and tooltip panes so a GCP marker is never buried under an
app marker, and *below* the popup pane, so a parcel-identify popup still reads
on top rather than sharing a stacking level with the control points. (Task 11
also suppresses parcel identify during a session, so the popup case is
belt-and-braces — but equal z-indexes resolve by DOM order, which is not
something to leave to chance.)

- [ ] **Step 1: Add the pane constants** to `web/src/components/mapPanes.ts`, following the existing shape and comment style:

```ts
/**
 * Georeferencing control points sit above every data overlay — the app's own
 * panes top out at MEASURE_PANE_Z_INDEX (430) — and above Leaflet's built-in
 * marker (600) and tooltip (650) panes, because a control point buried under
 * a parcel marker cannot be clicked or dragged. Deliberately BELOW Leaflet's
 * popup pane (700): a parcel-identify popup should still read on top, and
 * matching 700 exactly would leave the order to DOM insertion.
 */
export const GEOREFERENCE_PANE = "georeference-pane";
export const GEOREFERENCE_PANE_Z_INDEX = 660;
```

…and extend `web/src/components/mapPanes.test.ts`. **There is no
`PANE_Z_INDEXES` export** — an earlier draft invented it. The real map is
`PROVINCE_LAYER_Z_INDEXES`, and it covers only the province raster layers, so
asserting against it alone is much weaker than the comment claims. Name the
standalone pane constants explicitly:

```ts
  it("keeps georeferencing markers above every data overlay", () => {
    // A control point under a parcel line, a measurement, or a selected
    // parcel outline cannot be clicked or dragged.
    const dataPaneMax = Math.max(
      ...Object.values(PROVINCE_LAYER_Z_INDEXES),
      ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX,
      ZONING_PANE_Z_INDEX,
      MINERAL_PROXIMITY_PANE_Z_INDEX,
      WELL_LOG_PANE_Z_INDEX,
      ESTABLISHED_PARCEL_PANE_Z_INDEX,
      MEASURE_PANE_Z_INDEX,
      USER_MAPS_PANE_Z_INDEX,
    );
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeGreaterThan(dataPaneMax);
  });

  it("keeps georeferencing markers clear of Leaflet's own panes", () => {
    // Verified from leaflet/dist/leaflet.css: marker 600, tooltip 650,
    // popup 700. Above the first two, below the last.
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeGreaterThan(650);
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeLessThan(700);
    // NOT `expect(GEOREFERENCE_PANE).not.toBe(USER_MAPS_PANE)` — two
    // different string literals can never be equal, so that assertion can
    // never fail. What actually matters is the ORDER: the control points must
    // outrank the drape they are placed on.
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeGreaterThan(USER_MAPS_PANE_Z_INDEX);
  });
```

Add `GEOREFERENCE_PANE_Z_INDEX` and `ZONING_PANE_Z_INDEX` to the test file's
import list — read it first: `USER_MAPS_PANE_Z_INDEX` and the rest are already
there. `GEOREFERENCE_PANE` (the name, not the index) is asserted by the layer
test below, which proves `createPane` is called with that exact string; a
constants file cannot check that on its own.

- [ ] **Step 2: Write the failing layer test** — `web/src/userMaps/components/GeoreferenceMapLayer.test.tsx`:

Follow the mocking convention in `UserMapLayers.test.tsx` exactly: `vi.hoisted`
stubs for `useMap`, and `vi.mock("react-leaflet", …)` also supplying `Marker`
and **`useMapEvent`** (singular — see the implementation note below).

**The `Marker` stub must record `draggable`, `pane` and the handler keys, not
just `position`.** A stub that destructures `position` alone passes every test
in this file against a `<Marker>` carrying none of the rest: markers that
cannot be dragged, markers in Leaflet's default marker pane at 600 (below the
tooltip pane at 650, voiding this task's entire pane rationale — which Task 13
then writes into `ARCHITECTURE.md` as shipped fact), and — subtlest — a marker
wired to `drag` but not `dragstart`. That last one loses nothing visible:
`useGeoreferenceSession`'s `beginDragGcp` is the ONLY map-side entry into undo
history, so one Ctrl+Z leaps back past the whole drag.

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GEOREFERENCE_PANE, GEOREFERENCE_PANE_Z_INDEX } from "../../components/mapPanes";

type MarkerCall = {
  position: [number, number];
  draggable?: boolean;
  pane?: string;
  icon: { options: { className?: string; html?: string } };
  eventHandlers?: {
    dragstart?: () => void;
    drag?: (event: {
      target: { getLatLng: () => { lat: number; lng: number } };
    }) => void;
  };
};

const markerCalls = vi.hoisted(() => [] as MarkerCall[]);
const handlers = vi.hoisted(() => ({ click: null as ((e: unknown) => void) | null }));
const stubMap = vi.hoisted(() => ({
  getPane: vi.fn(() => undefined as HTMLElement | undefined),
  createPane: vi.fn(() => document.createElement("div")),
  setView: vi.fn(),
  // ABOVE the 15 floor on purpose. At 12 — below it — `Math.max(getZoom(), 15)`
  // and a hardcoded `15` are indistinguishable, so the "only zooms in" test
  // would pass against an implementation that always yanks the user to 15.
  getZoom: vi.fn(() => 17),
}));

vi.mock("react-leaflet", () => ({
  useMap: () => stubMap,
  useMapEvent: (type: string, handler: (e: unknown) => void) => {
    if (type === "click") {
      handlers.click = handler;
    }
    return stubMap;
  },
  Marker: (props: MarkerCall) => {
    markerCalls.push(props);
    return (
      <div
        data-testid="gcp-marker"
        data-position={props.position.join(",")}
        data-draggable={String(props.draggable ?? false)}
        data-pane={props.pane ?? ""}
        data-handlers={Object.keys(props.eventHandlers ?? {}).sort().join(",")}
      />
    );
  },
}));

import { GeoreferenceMapLayer } from "./GeoreferenceMapLayer";

const BINDING = {
  gcps: [
    { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
    { id: "b", pixel: { x: 10, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
  ],
  pending: null,
  draft: null,
  focus: null,
  onPickMapPoint: vi.fn(),
  onDragStartGcp: vi.fn(),
  onMoveGcpOnMap: vi.fn(),
};

describe("GeoreferenceMapLayer", () => {
  beforeEach(() => {
    markerCalls.length = 0;
    stubMap.createPane.mockClear();
    stubMap.setView.mockClear();
  });

  it("renders one marker per GCP at its stored WGS84 position", () => {
    render(<GeoreferenceMapLayer binding={BINDING} />);
    const markers = screen.getAllByTestId("gcp-marker");
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute("data-position", "46.1,-61.2");
  });

  it("puts the control points in their own pane, above every overlay", () => {
    // `mapPanes.test.ts` asserts the constants relate correctly; only this
    // proves the layer USES them. Without both, markers land in Leaflet's
    // default marker pane at 600 — under the tooltip pane — and the pane
    // rationale Task 13 documents is fiction.
    render(<GeoreferenceMapLayer binding={BINDING} />);
    expect(stubMap.createPane).toHaveBeenCalledWith(GEOREFERENCE_PANE);
    for (const marker of screen.getAllByTestId("gcp-marker")) {
      expect(marker).toHaveAttribute("data-pane", GEOREFERENCE_PANE);
    }
    // The pane element's z-index is set from the constant, not a literal.
    const pane = stubMap.createPane.mock.results[0]?.value as HTMLElement;
    expect(pane.style.zIndex).toBe(String(GEOREFERENCE_PANE_Z_INDEX));
  });

  it("snapshots undo on dragstart, then follows the drag", () => {
    // dragstart is the only map-side entry into undo history. Wire `drag`
    // alone and every assertion except this one still passes.
    const onDragStartGcp = vi.fn();
    const onMoveGcpOnMap = vi.fn();
    render(
      <GeoreferenceMapLayer
        binding={{ ...BINDING, onDragStartGcp, onMoveGcpOnMap }}
      />,
    );
    expect(markerCalls[0].draggable).toBe(true);
    expect(Object.keys(markerCalls[0].eventHandlers ?? {}).sort()).toEqual([
      "drag",
      "dragstart",
    ]);
    markerCalls[0].eventHandlers?.dragstart?.();
    expect(onDragStartGcp).toHaveBeenCalledWith("a");
    markerCalls[0].eventHandlers?.drag?.({
      target: { getLatLng: () => ({ lat: 45.9, lng: -61.4 }) },
    });
    expect(onMoveGcpOnMap).toHaveBeenCalledWith("a", 45.9, -61.4);
  });

  it("turns a map click into a picked point", () => {
    const onPickMapPoint = vi.fn();
    render(
      <GeoreferenceMapLayer binding={{ ...BINDING, onPickMapPoint }} />,
    );
    handlers.click?.({ latlng: { lat: 45.9, lng: -61.5 } });
    expect(onPickMapPoint).toHaveBeenCalledWith(45.9, -61.5);
  });

  it("shows the pending half-point waiting for its scan match", () => {
    render(
      <GeoreferenceMapLayer
        binding={{
          ...BINDING,
          gcps: [],
          pending: { side: "map", map: { lat: 45.9, lng: -61.5 } },
        }}
      />,
    );
    expect(screen.getAllByTestId("gcp-marker")).toHaveLength(1);
  });

  it("recentres on a focus request, and only zooms in", () => {
    const { rerender } = render(<GeoreferenceMapLayer binding={BINDING} />);
    expect(stubMap.setView).not.toHaveBeenCalled();
    rerender(
      <GeoreferenceMapLayer
        binding={{
          ...BINDING,
          focus: { lat: 46.1, lng: -61.2, requestId: 1 },
        }}
      />,
    );
    // The fixture sits at zoom 17, ABOVE the 15 floor, so this distinguishes
    // `Math.max(getZoom(), 15)` from a hardcoded 15 — at a fixture zoom of 12
    // the two are identical and the test's own name is unearned. Never zoom
    // the user back OUT of a closer inspection.
    expect(stubMap.setView).toHaveBeenCalledWith([46.1, -61.2], 17);
  });
});
```

- [ ] **Step 3: Implement** — `web/src/userMaps/components/GeoreferenceMapLayer.tsx`

Import `numberedIcon` from `./gcpIcon` (Task 8 put it there precisely so this
file does not have to reach into `ScanPane.tsx` — an earlier draft told the
executor to add an export to `ScanPane.tsx` from here, and then listed that
file in no task's Files block and no `git add`, so the branch compiled locally
and failed on the pushed commit). Declare `MapFocusRequest` and
`GeoreferenceBinding` here — both `export type`, which the react-refresh rule
allows, unlike a function. Create the georeference pane on mount the way
`UserMapLayers` creates the user-maps pane (`ensurePane`, idempotent, setting
`pane.style.zIndex = String(GEOREFERENCE_PANE_Z_INDEX)`); render one marker per
GCP wired to `onDragStartGcp` / `onMoveGcpOnMap`; render the pending marker
when `pending?.side === "map"`; and mount the click catcher and the focus
controller.

**Every marker takes `pane={GEOREFERENCE_PANE}`.** Omitting it is the failure
this task's 14 lines of pane reasoning exist to prevent: the marker silently
lands in Leaflet's default marker pane at 600, under the tooltip pane at 650,
and Task 13 documents a stacking order the app does not have.

**Give each marker its own component, exactly as `ScanGcpMarker` does in Task
8**, for the same reason: an inline `icon={numberedIcon(…)}` mints a new
`L.DivIcon` every render (react-leaflet answers with `marker.setIcon()`) and an
inline `eventHandlers` object literal re-runs `off()`/`on()` (its effect deps
are `[element, eventHandlers]`) — both once per pointer move of a drag, on the
hottest path in the feature:

```tsx
function GeoreferenceGcpMarker({
  gcp,
  label,
  onDragStartGcp,
  onMoveGcpOnMap,
}: {
  gcp: Gcp;
  label: string;
  onDragStartGcp: (id: string) => void;
  onMoveGcpOnMap: (id: string, lat: number, lng: number) => void;
}) {
  const icon = useMemo(() => numberedIcon(label), [label]);
  const position = useMemo<[number, number]>(
    () => [gcp.map.lat, gcp.map.lng],
    [gcp.map.lat, gcp.map.lng],
  );
  const eventHandlers = useMemo(
    () => ({
      // The ONLY map-side entry into undo history.
      dragstart: () => onDragStartGcp(gcp.id),
      drag: (event: L.LeafletEvent) => {
        const { lat, lng } = (event.target as L.Marker).getLatLng();
        onMoveGcpOnMap(gcp.id, lat, lng);
      },
    }),
    [gcp.id, onDragStartGcp, onMoveGcpOnMap],
  );
  return (
    <Marker
      position={position}
      draggable
      pane={GEOREFERENCE_PANE}
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
}
```

The click catcher and the focus controller:

```tsx
function MapClickCatcher({
  onPickMapPoint,
}: {
  onPickMapPoint: (lat: number, lng: number) => void;
}) {
  const handleClick = useCallback(
    (event: L.LeafletMouseEvent) => {
      onPickMapPoint(event.latlng.lat, event.latlng.lng);
    },
    [onPickMapPoint],
  );
  // useMapEvent, NOT useMapEvents: useMapEvents' effect deps are
  // `[map, handlers]`, so an inline handlers object re-runs map.off()/on()
  // on every render — once per pointer move during a GCP drag.
  useMapEvent("click", handleClick);
  return null;
}

/** Recentres the live map when the GCP list asks to zoom to a point. */
function MapFocusController({ focus }: { focus: MapFocusRequest | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) {
      return;
    }
    // requestId makes a repeat request a new object, so asking twice for the
    // same point still moves the map. Zoom in only; never pull the user back
    // out of a closer look.
    map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 15));
  }, [focus, map]);
  return null;
}
```

- [ ] **Step 4: Wire `MapCanvas`**

Add the prop to `MapCanvasProps`:

```ts
  georeference?: GeoreferenceBinding | null;
```

**And add it to the component's explicit destructuring** — `MapCanvas.tsx`
destructures every prop by name (read the parameter list, it runs from
`parcels` to `fitBounds`), so a prop added to the type alone is invisible
inside the body and `tsc -b` says nothing, because an unread optional prop is
perfectly legal:

```tsx
  georeference = null,
```

Give the map a crosshair while a session is open (spec:201–204: "a crosshair
cursor" on the map pane). The root element is
`<div className="map-canvas" aria-label="Nova Scotia municipal parcel map">` —
make its class conditional:

```tsx
    <div
      className={`map-canvas${georeference ? " map-canvas--georeferencing" : ""}`}
      aria-label="Nova Scotia municipal parcel map"
    >
```

Task 12 adds the matching `cursor: crosshair` rule.

Suppress parcel identify while georeferencing — find the existing line:

```tsx
          <ParcelIdentifyController
            enabled={provinceLayers.nsprd && !measuring}
```

and replace with:

```tsx
          <ParcelIdentifyController
            // A click during georeferencing places a control point; letting
            // it also open the parcel inspector would fight the user for the
            // same gesture. Same reasoning as the measure tool above.
            enabled={provinceLayers.nsprd && !measuring && !georeference}
```

Pass the draft through and mount the marker layer — find:

```tsx
        <UserMapLayers maps={userMaps} />
```

replace with:

```tsx
        <UserMapLayers maps={userMaps} draft={georeference?.draft ?? null} />
        {georeference ? <GeoreferenceMapLayer binding={georeference} /> : null}
```

Add the import next to the existing `UserMapLayers` import.

- [ ] **Step 5: Prove `MapCanvas` actually consumes the binding** — add to
      `web/src/components/MapCanvas.test.tsx`

Nothing so far can tell the difference between the wiring above and a
`MapCanvas` that accepts `georeference`, destructures it, and leaves
`<UserMapLayers maps={userMaps} />` exactly as it was. The layer tests in this
task mount `GeoreferenceMapLayer` directly; Task 12's App tests read
`georeferencing: scan-1` out of a **mocked** `MapCanvas`; and `tsc -b` is
content with an optional prop nobody reads. Two probe mocks close it.

Add them beside the file's existing `vi.mock` calls. `UserMapLayers` is
currently real here — the `paneElements` comment at the top of the file
explains why the map stub has `createPane`/`getPane` — but no test asserts
anything about the user-maps pane, so a probe is safe:

```tsx
vi.mock("../userMaps/components/UserMapLayers", () => ({
  UserMapLayers: ({
    maps,
    draft,
  }: {
    maps: Array<{ record: { id: string } }>;
    draft?: { record: { id: string } } | null;
  }) => (
    <div
      data-testid="user-map-layers"
      data-count={maps.length}
      data-draft={draft?.record.id ?? "none"}
    />
  ),
}));

vi.mock("../userMaps/components/GeoreferenceMapLayer", () => ({
  GeoreferenceMapLayer: ({
    binding,
  }: {
    binding: { gcps: Array<{ id: string }> };
  }) => (
    <div data-testid="georeference-map-layer" data-gcps={binding.gcps.length} />
  ),
}));
```

Then the tests. **There is no shared render helper in this file** — each suite
builds a local `const props = { … }` and spreads it (the mineral-proximity
suite near line ~1573 is the closest model, and `hiddenResourceLayers` is
already defined at the top of the file). Copy that fixture rather than
inventing a helper:

```tsx
describe("georeference binding", () => {
  const props = {
    parcels: { type: "FeatureCollection" as const, features: [] },
    taxSalePids: new Set<string>(),
    historicalTaxSalePids: new Set<string>(),
    selectedPid: null,
    provinceLayers: {
      "ns-aerial": false,
      nsprd: false,
      "crown-lands": false,
      "flood-risk": false,
      waterfalls: false,
      "water-features": false,
      roads: false,
      buildings: false,
      contours: false,
    },
    resourceLayers: hiddenResourceLayers,
    showModernMap: false,
    showTaxSale: false,
    showHistoricalTaxSales: false,
    onSelectPid: vi.fn(),
    onIdentifyParcel: vi.fn(),
  };

  const BINDING = {
    gcps: [{ id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } }],
    pending: null,
    draft: {
      record: { id: "scan-1" },
      previewUrl: "blob:scan",
      opacity: 0.7,
      mesh: null,
    },
    focus: null,
    onPickMapPoint: vi.fn(),
    onDragStartGcp: vi.fn(),
    onMoveGcpOnMap: vi.fn(),
  } as unknown as GeoreferenceBinding;

  it("mounts nothing georeferencing-related when no session is open", () => {
    render(<MapCanvas {...props} />);
    expect(screen.queryByTestId("georeference-map-layer")).toBeNull();
    expect(screen.getByTestId("user-map-layers")).toHaveAttribute(
      "data-draft",
      "none",
    );
    expect(document.querySelector(".map-canvas--georeferencing")).toBeNull();
  });

  it("mounts the marker layer and hands the draft to the raster layer", () => {
    render(<MapCanvas {...props} georeference={BINDING} />);
    expect(screen.getByTestId("georeference-map-layer")).toHaveAttribute(
      "data-gcps",
      "1",
    );
    // The live drape. Without this the map under edit simply never draws —
    // and the App-level test that reads "georeferencing: scan-1" out of a
    // mocked MapCanvas would not notice.
    expect(screen.getByTestId("user-map-layers")).toHaveAttribute(
      "data-draft",
      "scan-1",
    );
    // Spec: a crosshair cursor on the map pane while georeferencing.
    expect(
      document.querySelector(".map-canvas--georeferencing"),
    ).not.toBeNull();
  });
});
```

Import `GeoreferenceBinding` as a type from
`../userMaps/components/GeoreferenceMapLayer`. The `as unknown as` cast is
deliberate and confined to the fixture: the probe mock only reads two fields,
and spelling out a full `DraftUserMap` here would pin the test to a shape it
does not exercise.

- [ ] **Step 6: Run the affected suites**

Run: `cd web && npx vitest run src/userMaps/components/ src/components/MapCanvas.test.tsx src/components/mapPanes.test.ts && npx tsc -b && npx eslint src`
Expected: PASS, no type errors, lint silent. If
`react-refresh/only-export-components` fires, a helper landed in a `.tsx`
file — move it, do not disable the rule.

- [ ] **Step 7: Commit**

```bash
git add web/src/userMaps/components/GeoreferenceMapLayer.tsx web/src/userMaps/components/GeoreferenceMapLayer.test.tsx web/src/components/MapCanvas.tsx web/src/components/MapCanvas.test.tsx web/src/components/mapPanes.ts web/src/components/mapPanes.test.ts
git commit -m "feat(web): place and drag GCPs on the live map"
```

---

### Task 12: `App` wiring, the "Needs georeferencing" affordance, and styles

**Files:**
- Modify: `web/src/userMaps/components/UserMapRows.tsx`
- Modify: `web/src/userMaps/components/UserMapRows.test.tsx`
- Modify: `web/src/userMaps/useGeoreferenceSession.ts` (one `discardPendingWrite` method)
- Modify: `web/src/userMaps/useGeoreferenceSession.test.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/styles.test.ts`

**Interfaces:**
- Consumes everything built so far. Produces no new exported types — this is
  the task that connects them.
- `UserMapRows` keeps its single `api: UserMapsApi` prop; the new behaviour
  rides on `beginGeoreference` / `needsGeoreferencing` from Task 5.

**Where the session lives, and why it is mounted unconditionally.** `App` owns
the one `useGeoreferenceSession`, because two siblings need it: the panel
(outside the map) and `GeoreferenceMapLayer` (inside `MapContainer`, reachable
only through `MapCanvas` props). Hooks cannot be conditional, so it is mounted
always and idles when `mapId` is `null` — which is exactly why Task 7 gave it
`mapId` and a render-time re-seed instead of relying on a remount.

- [ ] **Step 1: Write the failing `UserMapRows` tests**

Read `web/src/userMaps/components/UserMapRows.test.tsx` first. **The factory is
called `api(overrides)`, not `makeApi`** — an earlier draft of this plan
invented the second name — and **it already carries every Task 5 field**,
including the real `needsGeoreferencing`. Add nothing to it.

**Do not replace `needsGeoreferencing` with a stub.** The factory imports the
real predicate and says why, in a comment at `UserMapRows.test.tsx:38–41`:
*"The real predicate, not a stub … a fake here would let a wrong one pass."*
An earlier draft of this plan added `needsGeoreferencing: () => false` to the
factory anyway, under which an implementation testing `gcps.length === 0`
(correct is `< 3`) passes every test below, while a half-placed 1–2 point draft
renders an enabled visibility checkbox for a map `visibleMaps` refuses to draw.
The same reasoning rules out per-test `needsGeoreferencing: () => true`
overrides, which is why the tests below have none: each fixture's own GCP
count decides its row, and the half-placed fixture is there precisely to
separate `< MIN_GCPS_FOR_AFFINE` from `=== 0`. Then append:

```tsx
const NEEDS_WORK: UserMapRecord = {
  id: "scan",
  name: "Church of Inverness 1888",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: { kind: "gcp", method: "affine", gcps: [] },
};

const PLACED_GCPS: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
  { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
];

describe("georeferencing affordance", () => {
  it("says a scan cannot be drawn yet, and why", () => {
    render(<UserMapRows api={api({ records: [NEEDS_WORK] })} />);
    expect(screen.getByText("Needs georeferencing")).toBeInTheDocument();
    // A checkbox that turns on a layer which then draws nothing is a lie.
    expect(
      screen.getByRole("checkbox", { name: NEEDS_WORK.name }),
    ).toBeDisabled();
    // …and neither is an opacity slider for a map with no placement. The
    // spec puts the Georeference button exactly where that slider sits.
    expect(
      screen.queryByLabelText(`${NEEDS_WORK.name} opacity`),
    ).toBeNull();
  });

  it("opens the georeferencer for the map that was clicked", async () => {
    const beginGeoreference = vi.fn();
    render(
      <UserMapRows
        api={api({ records: [NEEDS_WORK], beginGeoreference })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Georeference Church of Inverness 1888" }),
    );
    expect(beginGeoreference).toHaveBeenCalledWith("scan");
  });

  it("still refuses to draw a half-placed draft", () => {
    // The test that separates the real predicate (< MIN_GCPS_FOR_AFFINE) from
    // a plausible `gcps.length === 0`. Two points solve nothing, so the row
    // must stay in the needs-work state — otherwise its checkbox turns on a
    // layer that `visibleMaps` refuses to include and nothing is drawn.
    render(
      <UserMapRows
        api={api({
          records: [
            {
              ...NEEDS_WORK,
              georef: {
                kind: "gcp",
                method: "affine",
                gcps: PLACED_GCPS.slice(0, 2),
              },
            },
          ],
          uiState: { scan: { enabled: true, opacity: 0.7 } },
        })}
      />,
    );
    expect(screen.getByText("Needs georeferencing")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: NEEDS_WORK.name }),
    ).toBeDisabled();
  });

  it("offers a placed map its points back rather than a fresh start", () => {
    // Copy matches the spec: "Adjust points", not "Edit points".
    render(
      <UserMapRows
        api={api({
          records: [
            { ...NEEDS_WORK, georef: { kind: "gcp", method: "affine", gcps: PLACED_GCPS } },
          ],
          uiState: { scan: { enabled: true, opacity: 0.7 } },
        })}
      />,
    );
    expect(screen.queryByText("Needs georeferencing")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adjust points for Church of Inverness 1888" }),
    ).toBeInTheDocument();
    // A placed map draws, so it keeps its slider.
    expect(
      screen.getByLabelText("Church of Inverness 1888 opacity"),
    ).toBeInTheDocument();
  });

  it("offers no point editing for a map that carries its own georeferencing", () => {
    // An embedded GeoTIFF has a geotransform, not control points. There is
    // nothing for the GCP editor to edit. The field is `geotransform`
    // (lower-case, a 6-tuple) — read types.ts / projection.ts, and note the
    // fixture at the top of this very file already has one to copy.
    render(
      <UserMapRows
        api={api({
          records: [
            {
              ...NEEDS_WORK,
              source: "geotiff",
              georef: {
                kind: "embedded",
                crs: "EPSG:26920",
                geotransform: [500000, 10, 0, 5000000, 0, -10],
              },
            },
          ],
        })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Georeference|Adjust points/ }),
    ).toBeNull();
  });
});
```

Add `import type { Gcp } from "../types";` to the test file.

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/UserMapRows.test.tsx`
Expected: FAIL — no "Needs georeferencing" text, no Georeference button.

- [ ] **Step 3: Implement the row changes** — `web/src/userMaps/components/UserMapRows.tsx`

Inside the `api.records.map` callback, above the returned JSX:

```tsx
          const isGcp = record.georef.kind === "gcp";
          const needsWork = isGcp && api.needsGeoreferencing(record);
```

Change the checkbox to refuse a map it cannot draw:

```tsx
                <input
                  type="checkbox"
                  aria-label={record.name}
                  checked={ui.enabled && !needsWork}
                  disabled={needsWork}
                  onChange={(event) =>
                    api.setEnabled(record.id, event.target.checked)
                  }
                />
```

Replace the `<small>` size line with one that carries the status:

```tsx
                  <small>
                    Your file · {record.pixelSize.width.toLocaleString("en-CA")}×
                    {record.pixelSize.height.toLocaleString("en-CA")} px
                    {needsWork ? (
                      <>
                        {" · "}
                        <span className="user-map-needs-georeference">
                          Needs georeferencing
                        </span>
                      </>
                    ) : null}
                  </small>
```

Replace the opacity `<label>` so the two are alternatives rather than both
showing. The spec puts the Georeference button **where the opacity slider
sits**, and a live slider on a row whose checkbox is simultaneously disabled
drives an opacity nothing can display:

```tsx
              {needsWork ? null : (
                <label className="user-map-opacity">
                  <small>Opacity</small>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    aria-label={`${record.name} opacity`}
                    value={Math.round(ui.opacity * 100)}
                    onChange={(event) =>
                      api.setOpacity(record.id, Number(event.target.value) / 100)
                    }
                  />
                </label>
              )}
```

And add the button as a sibling of Remove, inside the same row `<div>` (never
inside the `<label>` — the file's own header comment explains why). Copy is
from the spec: **"Adjust points"**, not "Edit points":

```tsx
              {isGcp ? (
                <button
                  type="button"
                  className="user-map-georeference"
                  aria-label={
                    needsWork
                      ? `Georeference ${record.name}`
                      : `Adjust points for ${record.name}`
                  }
                  onClick={() => api.beginGeoreference(record.id)}
                >
                  {needsWork ? "Georeference" : "Adjust points"}
                </button>
              ) : null}
```

- [ ] **Step 4: Write the failing `App` tests** — add to `web/src/App.test.tsx`

The suite is already set up for this and needs no new infrastructure:
`src/test/setup.ts` installs `fake-indexeddb/auto` globally, and the file's own
`beforeEach` (line ~345) already defines `URL.createObjectURL`. So a real
record can be seeded through the store's own API and `useUserMaps` will list it
on mount — no hand-rolled IndexedDB, no mocking of `useUserMaps`.

First extend the existing `MapCanvas` mock. It reports props as rendered text
rather than capturing them in an object; follow that convention. Add
`georeference` and `userMaps` to the destructured props and their types, and
append two fields to the returned text, next to `focus request`:

```tsx
      ; georeferencing: {georeference?.draft?.record.id ?? "none"}
      ; saved user map layers: {userMaps?.length ?? 0}
      ; georeference focus:{" "}
      {georeference?.focus
        ? `${georeference.focus.lat},${georeference.focus.lng}`
        : "none"}
```

The focus line is not decoration: it is the only way to see, from outside,
that App clears its focus state when a session ends (see the two-map test
below).

`ScanPane` mounts a real `MapContainer`, which needs a sized node jsdom does
not give it, so stub it beside the other `vi.mock` calls at the top:

```tsx
vi.mock("./userMaps/components/ScanPane", () => ({
  ScanPane: () => <div data-testid="scan-pane" />,
}));
```

Then append the suite:

```tsx
describe("georeferencer", () => {
  const SCAN: UserMapRecord = {
    id: "scan-1",
    name: "Church of Inverness 1888",
    source: "image",
    createdAt: "2026-07-25T00:00:00.000Z",
    pixelSize: { width: 1200, height: 800 },
    georef: { kind: "gcp", method: "affine", gcps: [] },
  };

  /** Same scan, already placed: three non-collinear points that solve. */
  const PLACED: UserMapRecord = {
    ...SCAN,
    id: "placed-1",
    name: "Placed scan",
    georef: {
      kind: "gcp",
      method: "affine",
      gcps: [
        { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
        { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
        { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
      ],
    },
  };

  /** A second placed map, somewhere else entirely — for the focus-leak test. */
  const PLACED_B: UserMapRecord = {
    ...PLACED,
    id: "placed-2",
    name: "Second placed scan",
    georef: {
      kind: "gcp",
      method: "affine",
      gcps: [
        { id: "p", pixel: { x: 0, y: 0 }, map: { lat: 44.6, lng: -63.6 } },
        { id: "q", pixel: { x: 1200, y: 0 }, map: { lat: 44.6, lng: -63.4 } },
        { id: "r", pixel: { x: 0, y: 800 }, map: { lat: 44.5, lng: -63.6 } },
      ],
    },
  };

  async function seedScan(record: UserMapRecord = SCAN) {
    const store = await UserMapStore.open();
    await store.saveUserMap(
      record,
      new Blob(["raster"], { type: "image/jpeg" }),
      new Blob(["preview"], { type: "image/png" }),
    );
  }

  it("stays closed until a map is opened for georeferencing", async () => {
    await seedScan();
    render(<App />);
    expect(
      await screen.findByRole("button", { name: /^Georeference / }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("scan-pane")).toBeNull();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: none",
    );
  });

  it("hands the map under edit to the panel and the map at once", async () => {
    // Seed a SECOND, already-placed and enabled map. Without it the
    // "saved user map layers: 0" assertion is vacuous — it reads 0 whether
    // or not the exclusion filter exists, because a fresh draft has no GCPs
    // and would never be in visibleMaps anyway.
    await seedScan();
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({
        "scan-1": { enabled: true, opacity: 0.7 },
        "placed-1": { enabled: true, opacity: 0.7 },
      }),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("map-canvas")).toHaveTextContent(
        "saved user map layers: 1",
      ),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Georeference Church of Inverness 1888" }),
    );
    expect(screen.getByTestId("scan-pane")).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: scan-1",
    );
    // Spec: the georeferencer hides the layer rail so the panel can take the
    // left ~45% and the app map keep the right ~55%. styles.test.ts pins the
    // RULE; this pins the class actually being on the element, because a rule
    // with nothing to match is invisible to every test in this repo.
    expect(document.querySelector(".app-shell.georeferencing")).not.toBeNull();
    // Still 1, not 2: the map under edit is drawn by the georeferencer's own
    // draft, so the saved-map layer must not also draw it — that would be two
    // canvases fighting, and the saved layer would rebuild on every pointer
    // move. Opening a DIFFERENT map must not disturb the placed one.
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "saved user map layers: 1",
    );
  });

  it("takes the map under edit out of the saved layers", async () => {
    // The other half of the same contract, with the placed map itself opened.
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ "placed-1": { enabled: true, opacity: 0.7 } }),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("map-canvas")).toHaveTextContent(
        "saved user map layers: 1",
      ),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Adjust points for Placed scan" }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "saved user map layers: 0",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: placed-1",
    );
  });

  it("closes back to the map without leaving the draft behind", async () => {
    await seedScan();
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("scan-pane")).toBeNull();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: none",
    );
    expect(document.querySelector(".app-shell.georeferencing")).toBeNull();
  });

  it("does not carry one map's zoom-to focus into the next session", async () => {
    // Zoom to on map A, close A, open map B. `georeferenceFocus` is App
    // state, not session state, so nothing resets it on its own: leave it set
    // and GeoreferenceMapLayer mounts for B with A's focus still non-null and
    // immediately recentres B's session on a point belonging to another map.
    // The bug needs two maps to show, which is why no existing test sees it.
    await seedScan(PLACED);
    await seedScan(PLACED_B);
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Adjust points for Placed scan" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Zoom to point 1" }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeference focus: 46.1,-61.2",
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await userEvent.click(
      screen.getByRole("button", {
        name: "Adjust points for Second placed scan",
      }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeference focus: none",
    );
  });

  it("will not switch on restricted reference layers without the licence", async () => {
    // `afterEach` in setup.ts clears localStorage and this suite never
    // accepts by default — the file's other tests opt in explicitly with
    // localStorage.setItem("ns-marks-the-spot:province-license:v1",
    // "accepted"), so rendering plain gives the un-accepted state.
    await seedScan();
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Aerial imagery" }),
    ).toBeDisabled();
  });

  it("drives the real province layers once the licence is accepted", async () => {
    // The other half of the gate: proves the footer toggle is wired to the
    // app's actual layer state and not to a copy that goes nowhere.
    // `initialProvinceLayerVisibility.nsprd` is TRUE (verified in
    // layerCatalog.ts), so the click here turns property boundaries OFF —
    // an earlier draft asserted this backwards and would have passed only by
    // accident if the default ever flipped.
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    await seedScan();
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "property boundaries: on",
    );
    const parcels = screen.getByRole("checkbox", { name: "Property boundaries" });
    expect(parcels).toBeChecked();
    await userEvent.click(parcels);
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "property boundaries: off",
    );
  });

  it("opens the panel straight from an import, without a second click", async () => {
    // Spec: an imported scan opens the panel. `useUserMaps` consumes the
    // outcome flag (Task 5); this is the App-level proof that the flag
    // actually reaches the UI rather than being produced and dropped.
    render(<App />);
    const input = await screen.findByLabelText("Add a map file");
    const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await userEvent.upload(
      input,
      new File([magic], "church-1888.png", { type: "image/png" }),
    );
    expect(await screen.findByTestId("scan-pane")).toBeInTheDocument();
  });
});
```

Import `UserMapStore` from `./userMaps/store/userMapStore` and `UserMapRecord`
from `./userMaps/types` at the top of the file.

The import test needs the real decode path stubbed, because jsdom has no
`createImageBitmap`. `useUserMaps` takes no options at App's call site, so
stub the module instead, beside the `ScanPane` mock:

```tsx
vi.mock("./userMaps/parsers/imageSource", () => ({
  parseImage: async () => ({
    pixelSize: { width: 1200, height: 800 },
    preview: new Blob(["preview"], { type: "image/png" }),
    previewSize: { width: 1200, height: 800 },
  }),
}));
```

If mocking that module turns out to break `useUserMaps`'s own import of
`PREVIEW_MAX_DIMENSION` or similar, drop this one test and note it in the PR
description rather than weakening the others — the hook-level test in Task 5
already covers the flag; this one only covers the wiring.

- [ ] **Step 5: Let a delete cancel its own pending write** —
      `web/src/userMaps/useGeoreferenceSession.ts` and its test

Task 7 landed the debounced write-through with `flush` as its only escape
hatch, and `flush` **writes**. A delete needs the opposite: drop the queued
payload without performing it.

Verified mechanism, not a hunch: `useUserMaps.removeMap` does `await (await
store()).deleteUserMap(id)` **before** `setRecords(prev => prev.filter(…))`,
and `saveGcps` resolves its record from `recordsRef.current`. So a 400 ms timer
that fires inside that await finds the record still present, builds a `saved`
object and calls `putUserMapRecord` — landing a metadata row behind the
deletion, for a map whose raster and preview blobs are gone.

Add next to `flush`:

```ts
  /**
   * Drops the queued write for one map WITHOUT performing it — the delete
   * counterpart to `flush`. Keyed, not a blanket clear: `dirtyRef` holds one
   * entry per map precisely so an interrupted session does not lose another
   * map's write, and deleting map A must not cancel map B's.
   */
  const discardPendingWrite = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    if (dirtyRef.current.size === 0 && timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
```

Add `discardPendingWrite: (mapId: string) => void;` to the
`GeoreferenceSession` type and return it beside `flush`. **Task 10's
`fakeSession` factory must gain it too**, or `tsc -b` fails on the test file.

Then append to `web/src/userMaps/useGeoreferenceSession.test.ts`, following the
file's existing `setup()` helper and its global `vi.useFakeTimers()`:

```ts
  it("drops a queued write when its map is deleted", () => {
    const { result, onPersist } = setup(SOLVABLE);
    act(() => {
      result.current.moveGcpOnScan("a", 10, 20);
    });
    act(() => {
      result.current.discardPendingWrite("map-a");
    });
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS * 2);
    });
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("keeps another map's queued write when one map is discarded", () => {
    // dirtyRef is keyed per map on purpose (Task 7). A blanket clear() would
    // pass the test above and silently lose the OTHER map's edits — exactly
    // the bug the per-map keying was introduced to fix.
    const { result, rerender, onPersist } = setup(SOLVABLE);
    act(() => {
      result.current.moveGcpOnScan("a", 10, 20);
    });
    rerender({ mapId: "map-b", initialGcps: SOLVABLE });
    act(() => {
      result.current.moveGcpOnScan("a", 30, 40);
    });
    act(() => {
      result.current.discardPendingWrite("map-b");
    });
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS * 2);
    });
    expect(onPersist.mock.calls.map(([id]) => id)).toEqual(["map-a"]);
  });
```

- [ ] **Step 6: Implement the `App` wiring** — `web/src/App.tsx`

Add imports beside the existing user-map imports (line ~150):

```tsx
import { useGeoreferenceSession } from "./userMaps/useGeoreferenceSession";
import { GeoreferencePanel } from "./userMaps/components/GeoreferencePanel";
import type { ReferenceLayerId } from "./userMaps/components/GeoreferencePanel";
import type {
  GeoreferenceBinding,
  MapFocusRequest,
} from "./userMaps/components/GeoreferenceMapLayer";
import type { Gcp } from "./userMaps/types";
```

Add module-level constants next to the file's other module constants:

```tsx
/**
 * Stable identities for the idle session. Fresh literals here would give the
 * session a new `initialGcps`/`pixelSize` every render, and the mesh memo
 * downstream would rebuild on each one.
 */
const NO_GCPS: Gcp[] = [];
const IDLE_PIXEL_SIZE = { width: 1, height: 1 };
```

Immediately after `const userMapsApi = useUserMaps();` (line ~785):

```tsx
  const editingMap = userMapsApi.editingMap;
  const editingGeoref = editingMap?.record.georef;
  const georeferenceSession = useGeoreferenceSession({
    mapId: editingMap?.record.id ?? null,
    initialGcps:
      editingGeoref?.kind === "gcp" ? editingGeoref.gcps : NO_GCPS,
    pixelSize: editingMap?.record.pixelSize ?? IDLE_PIXEL_SIZE,
    // Recreated every render on purpose: the hook keeps it in a ref, so its
    // identity is free, and pinning it with useCallback would only add a
    // dependency list to get wrong.
    onPersist: (id, gcps) => {
      void userMapsApi.saveGcps(id, gcps);
    },
  });

  const {
    gcps: georeferenceGcps,
    pending: georeferencePending,
    mesh: georeferenceMesh,
    pickMapPoint,
    beginDragGcp,
    moveGcpOnMap,
  } = georeferenceSession;

  // The panel can move its own scan pane, but only App can move the live map,
  // so the GCP list's zoom-to control comes up here and goes back down through
  // the binding. The monotonic id makes a repeat request a new object, so
  // asking twice for the same point still recentres.
  const [georeferenceFocus, setGeoreferenceFocus] =
    useState<MapFocusRequest | null>(null);
  const georeferenceFocusId = useRef(0);
  const focusGcpOnMap = useCallback((gcp: Gcp) => {
    georeferenceFocusId.current += 1;
    setGeoreferenceFocus({
      lat: gcp.map.lat,
      lng: gcp.map.lng,
      requestId: georeferenceFocusId.current,
    });
  }, []);

  // Focus belongs to ONE session. `userMapsApi.endGeoreference` only clears
  // the map id, so closing without clearing this leaves the next map's layer
  // mounting with the previous map's focus and recentring on a point that is
  // not its own. Every close path goes through here — the panel's onClose and
  // its Delete both.
  const { endGeoreference } = userMapsApi;
  const endGeoreferencing = useCallback(() => {
    setGeoreferenceFocus(null);
    endGeoreference();
  }, [endGeoreference]);

  // A new `draft` object on every mesh change is the intended hot path:
  // UserMapLayers keys its layer build on `previewUrl` and pushes geometry
  // through `setLatLngMesh`, so this never re-decodes the bitmap (Task 6).
  // The memo is only worth having because `editingMap` is itself memoized in
  // useUserMaps (Task 5) — a fresh literal there would bust this every render.
  const georeferenceBinding = useMemo<GeoreferenceBinding | null>(
    () =>
      editingMap
        ? {
            gcps: georeferenceGcps,
            pending: georeferencePending,
            draft: { ...editingMap, mesh: georeferenceMesh },
            focus: georeferenceFocus,
            onPickMapPoint: pickMapPoint,
            onDragStartGcp: beginDragGcp,
            onMoveGcpOnMap: moveGcpOnMap,
          }
        : null,
    [
      editingMap,
      georeferenceGcps,
      georeferencePending,
      georeferenceMesh,
      georeferenceFocus,
      pickMapPoint,
      beginDragGcp,
      moveGcpOnMap,
    ],
  );
```

Pass the binding to the map — find `userMaps={userMapsApi.visibleMaps}` (line
~2777) and add directly below it:

```tsx
            georeference={georeferenceBinding}
```

Mark the shell so the stylesheet can hide the layer rail (spec:189 — the panel
takes the left ~45% and the app map keeps the right ~55%; leaving a 288–320 px
rail up would push the live map under the panel). Find the root element and
extend the template literal it already uses:

```tsx
    <div
      className={`app-shell${headerCollapsed ? " header-collapsed" : ""}${
        editingMap ? " georeferencing" : ""
      }`}
    >
```

Render the panel as a sibling of `PrintPreview`, at the very end of the
returned fragment — outside the app `<div>`, where the other full-viewport
overlays live:

```tsx
    {editingMap ? (
      <GeoreferencePanel
        record={editingMap.record}
        previewUrl={editingMap.previewUrl}
        opacity={editingMap.opacity}
        session={georeferenceSession}
        onOpacityChange={(opacity) =>
          userMapsApi.setOpacity(editingMap.record.id, opacity)
        }
        onClose={endGeoreferencing}
        onDelete={() => {
          // NO window.confirm here. The panel's Delete map button already
          // asks, and wrapping it again produced two prompts for one click —
          // which reads to the user as a dialog that does not work.
          //
          // The discard is not optional. Writes are debounced 400 ms, and
          // `removeMap` AWAITS the IndexedDB delete before dropping the
          // record from state — so a timer that fires inside that await still
          // finds the record in `recordsRef` and queues a metadata `put`
          // behind the deletion, resurrecting a record whose raster and
          // preview blobs are gone. Cancel first, then delete.
          const id = editingMap.record.id;
          georeferenceSession.discardPendingWrite(id);
          endGeoreferencing();
          void userMapsApi.removeMap(id);
        }}
        onFocusGcpOnMap={focusGcpOnMap}
        referenceLayers={{
          aerial: provinceLayers["ns-aerial"],
          parcels: provinceLayers.nsprd,
        }}
        referenceLayersLocked={!licenceAccepted}
        onToggleReferenceLayer={(id: ReferenceLayerId, enabled) =>
          setProvinceLayerVisibility(
            id === "aerial" ? "ns-aerial" : "nsprd",
            enabled,
          )
        }
      />
    ) : null}
```

The delete order is load-bearing in both directions: `discardPendingWrite`
first (so no timer can resurrect the record mid-delete), then
`endGeoreferencing` (so the panel unmounts against a record that still exists —
the reverse renders one frame of a panel whose record is gone), then
`removeMap`.

- [ ] **Step 7: Write the failing style tests** — add to `web/src/styles.test.ts`

**These tests regex the stylesheet, and that is their limit.** They cannot see
whether anything renders the class names they check — an earlier draft of this
plan shipped a stylesheet targeting `.georeference-overlay`,
`.georeference-side` and `[data-tab]` against a DOM containing none of them,
and every one of these passed. The rendered-DOM assertion in Task 10 is the
other half; neither one substitutes for the other.

```ts
describe("georeferencer overlay", () => {
  it("sits above the map furniture but below the app's dialogs", () => {
    const overlay = styles.match(/\.georeference-overlay\s*\{([^}]*)\}/)?.[1];
    expect(overlay).toMatch(/position:\s*fixed/);
    expect(overlay).toMatch(/inset:\s*0/);
    const overlayZ = Number(overlay?.match(/z-index:\s*(\d+)/)?.[1]);
    const dialogZ = Number(
      styles
        .match(/\.dialog-backdrop\s*\{([^}]*)\}/)?.[1]
        ?.match(/z-index:\s*(\d+)/)?.[1],
    );
    expect(overlayZ).toBeGreaterThan(1200);
    expect(overlayZ).toBeLessThan(dialogZ);
  });

  it("leaves the app's own map visible and clickable", () => {
    // THE regression test for this feature. An earlier draft made the overlay
    // a full-bleed opaque card over a 72%-black scrim, so the app's map — the
    // thing the user must click to complete every control point — was both
    // dimmed and pointer-blocked. No GCP could ever be finished, while the
    // status line said "Now click the same spot on the map."
    //
    // jsdom does no layout, so a rendered-DOM test cannot see occlusion:
    // these three declarations are what make the difference, so they are what
    // gets asserted. Task 10's DOM test pins the matching structure.
    const overlay = styles.match(/\.georeference-overlay\s*\{([^}]*)\}/)?.[1];
    expect(overlay).toMatch(/pointer-events:\s*none/);
    expect(overlay).not.toMatch(/background/);
    const panel = styles.match(/\.georeference-panel\s*\{([^}]*)\}/)?.[1];
    expect(panel).toMatch(/pointer-events:\s*auto/);
    // Spec: panel left ~45%, app map keeps the right ~55%.
    expect(panel).toMatch(/width:\s*45vw/);
  });

  it("hides the layer rail and crosshairs the map during a session", () => {
    // Both are spec (189 and 201–204) and both are pure CSS, so nothing else
    // in the suite would notice their absence.
    expect(styles).toMatch(
      /\.app-shell\.georeferencing\s+\.layer-rail\s*\{[^}]*display:\s*none/,
    );
    expect(styles).toMatch(
      /\.map-canvas--georeferencing\s+\.leaflet-container\s*\{[^}]*cursor:\s*crosshair/,
    );
  });

  it("stacks the split view on phones instead of squeezing both panes", () => {
    // Anchored to the LAST @media (max-width: 860px) block, which Step 8
    // appends at the very END of the file. Two traps live here, both measured:
    //
    // 1. `/grid-template-columns:\s*minmax\(0,\s*1fr\)/` unanchored also
    //    matches the WIDE rule `minmax(0, 1fr) minmax(320px, 380px)` — so
    //    deleting the narrow override entirely left this test green. The
    //    trailing `;` is what pins it to a SINGLE column.
    // 2. An earlier draft told the executor to append into the pre-existing
    //    860px block at styles.css:2722 while the "Your maps" section it also
    //    named starts at 3767 — so `lastIndexOf` spanned the base rules and
    //    matched the wide rule anyway. The narrow rules go last, full stop.
    const narrowStart = styles.lastIndexOf("@media (max-width: 860px)");
    const narrow = styles.slice(narrowStart);
    expect(narrow).toContain(".georeference-panel");
    const panel = narrow.match(/\.georeference-panel\s*\{([^}]*)\}/)?.[1];
    expect(panel).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
    // Full-bleed here, not the wide 45vw column — and `max-width` has to be
    // released explicitly or the base rule keeps clamping it.
    expect(panel).toMatch(/width:\s*auto\s*;/);
    expect(panel).toMatch(/max-width:\s*none\s*;/);
    // …and the tab toggle only exists at this breakpoint.
    expect(narrow).toMatch(/\.georeference-tabs\s*\{[^}]*display:\s*flex/);
  });

  it("hides the PANEL on the narrow Map tab, not just the scan", () => {
    // Spec: choosing Map "hides the panel entirely and leaves a floating bar
    // carrying the prompt and a Back to scan button". An earlier draft hid
    // only `.georeference-scan`, leaving the opaque panel over the very map
    // the tab exists to expose — and its own comment claimed the opposite of
    // what the CSS did.
    const narrow = styles.slice(styles.lastIndexOf("@media (max-width: 860px)"));
    expect(narrow).toMatch(
      /\.georeference-panel\[data-tab="map"\]\s*\{[^}]*display:\s*none/,
    );
    expect(narrow).toMatch(
      /\.georeference-map-bar\[data-tab="map"\]\s*\{[^}]*display:\s*flex/,
    );
    // The bar is hidden everywhere else, including wide screens.
    const bar = styles.match(/\.georeference-map-bar\s*\{([^}]*)\}/)?.[1];
    expect(bar).toMatch(/display:\s*none/);
    expect(bar).toMatch(/pointer-events:\s*auto/);
  });

  it("marks the suspect control point by more than colour", () => {
    // WCAG 1.4.1: colour alone cannot be the only carrier of meaning.
    const suspect = styles.match(/\.gcp-row--suspect\s*\{([^}]*)\}/)?.[1];
    expect(suspect).toBeDefined();
    expect(suspect).toMatch(/border-inline-start|font-weight/);
  });

  it("styles the numbered GCP markers, and distinguishes a pending one", () => {
    // Without these the spec's hollow-then-solid numbered markers render as
    // unstyled bare text on both panes — the markers ARE the interaction.
    expect(styles).toMatch(/\.gcp-marker\s*\{/);
    const pending = styles.match(/\.gcp-marker--pending\s*\{([^}]*)\}/)?.[1];
    expect(pending).toBeDefined();
    // Hollow vs solid, not just a different hue.
    expect(pending).toMatch(/background|border-style/);
    expect(styles).toMatch(/\.gcp-marker--selected\s*\{/);
  });

  it("defines the visually-hidden helper the GCP list header uses", () => {
    // GcpList renders <span className="visually-hidden">Actions</span>. With
    // no rule for it, a literal "Actions" heading appears in the table.
    const hidden = styles.match(/\.visually-hidden\s*\{([^}]*)\}/)?.[1];
    expect(hidden).toBeDefined();
    // Clipped, not display:none — display:none removes it from the
    // accessibility tree, which defeats the point of the label.
    expect(hidden).toMatch(/clip-path|clip:/);
    expect(hidden).not.toMatch(/display:\s*none/);
  });
});
```

- [ ] **Step 8: Implement the styles** — append to `web/src/styles.css`, in the
      same "Your maps" section, keeping the file's existing formatting

Every selector below has a matching element in Task 9's and Task 10's markup —
check that as you go, because a rule with no element is invisible to every
test in this repo.

```css
/* Screen-reader-only text. Clipped rather than display:none, which would
   remove it from the accessibility tree and defeat the point. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.user-map-needs-georeference {
  color: #a2600f;
  font-weight: 700;
}

.user-map-georeference {
  margin: 6px 10px 0 54px;
  padding: 0;
  color: var(--survey-blue);
  font-size: 0.72rem;
  font-weight: 700;
  background: none;
  border: 0;
  cursor: pointer;
  text-decoration: underline;
}

/* Georeferencer (PR 2).

   The overlay is a NON-BLOCKING FRAME, not a modal. The whole interaction is
   "click the scan, then click the same spot on the app's own map" — and that
   map is behind this element. So: no scrim (it would dim the very target the
   user is aiming at) and `pointer-events: none`, with `auto` handed back only
   to the panel and the floating bar. An earlier draft was a full-bleed opaque
   card over a 72%-black scrim: MapClickCatcher never saw a click, and no
   control point could be completed at all. */
.georeference-overlay {
  position: fixed;
  z-index: 1800;
  inset: 0;
  pointer-events: none;
}

/* Spec: the panel takes the left ~45% of the viewport and the app map keeps
   the right ~55%. The scan needs room for accurate clicking, so it gets close
   to half the screen rather than a rail-width column. `width` and `max-width`
   are both set because the narrow breakpoint releases both — a lone
   `max-width` would keep clamping the full-bleed phone layout. */
.georeference-panel {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 8px;
  width: 45vw;
  max-width: 45vw;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  pointer-events: auto;
  background: var(--paper);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgb(10 20 22 / 28%);
}

/* The layer rail is hidden for the duration (spec): at 288–320px it would
   push the live map out from under the right-hand 55% the panel leaves free.
   The panel's own footer carries the two reference-layer toggles the rail
   would otherwise strand. */
.app-shell.georeferencing .layer-rail {
  display: none;
}

.app-shell.georeferencing .map-layout {
  grid-template-columns: minmax(0, 1fr);
}

/* Spec: a crosshair cursor on the map pane while georeferencing. Set on the
   MapCanvas root (Task 11) so it survives every child layer. */
.map-canvas--georeferencing .leaflet-container {
  cursor: crosshair;
}

/* The narrow Map tab's entire UI: the panel is display:none there, so this is
   the only thing left carrying the prompt and the way back. Hidden at every
   other size and tab — on a wide screen the panel and the map are both
   visible and there is nothing to go back from. */
.georeference-map-bar {
  display: none;
  position: absolute;
  inset: auto 8px 8px;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  pointer-events: auto;
  background: var(--paper);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgb(10 20 22 / 28%);
}

.georeference-map-bar-status {
  flex: 1;
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.georeference-map-bar-back {
  padding: 0;
  color: var(--survey-blue);
  font-size: 0.76rem;
  font-weight: 700;
  background: none;
  border: 0;
  cursor: pointer;
  text-decoration: underline;
}

.georeference-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid rgb(10 20 22 / 12%);
}

.georeference-status {
  color: var(--muted);
  font-size: 0.78rem;
}

.georeference-scan {
  position: relative;
  min-height: 0;
  background: rgb(10 20 22 / 6%);
}

/* The MapContainer inside ScanPane; Leaflet needs an explicitly sized box. */
.georeference-scan-map {
  width: 100%;
  height: 100%;
}

.georeference-side {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  padding: 12px;
  gap: 10px;
  border-left: 1px solid rgb(10 20 22 / 12%);
}

/* The list scrolls, the footer does not — losing Done off the bottom of a
   long point list would be the worst possible thing to lose. */
.georeference-points {
  min-height: 0;
  overflow-y: auto;
}

.georeference-footer {
  display: grid;
  gap: 10px;
}

/* Wide screens show both panes at once, so the toggle has nothing to do. */
.georeference-tabs {
  display: none;
}

.gcp-list {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.76rem;
}

.gcp-list th {
  color: var(--muted);
  font-weight: 600;
  text-align: left;
}

.gcp-row td {
  padding: 3px 0;
}

.gcp-residual {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  text-align: right;
}

.gcp-row--suspect {
  border-inline-start: 3px solid #a2600f;
  font-weight: 700;
}

.gcp-row--selected {
  background: rgb(47 128 237 / 10%);
}

.gcp-zoom,
.gcp-delete {
  padding: 0 6px 0 0;
  color: var(--survey-blue);
  font-size: 0.72rem;
  background: none;
  border: 0;
  cursor: pointer;
  text-decoration: underline;
}

/* Numbered control-point markers, shared by the scan pane and the live map
   (components/gcpIcon.ts). Solid once a pair is complete. */
.gcp-marker {
  display: grid;
  place-items: center;
  color: var(--white);
  font-size: 0.68rem;
  font-weight: 700;
  background: var(--survey-blue);
  border: 2px solid var(--white);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgb(10 20 22 / 45%);
}

/* Hollow while the point is waiting for its match on the other side. The
   difference is fill and border style, not hue — a colour-only distinction
   would not survive WCAG 1.4.1 or a monochrome scan underneath. */
.gcp-marker--pending {
  color: var(--survey-blue);
  background: transparent;
  border-style: dashed;
  border-color: var(--survey-blue);
}

/* The row currently under the pointer in the GCP list. */
.gcp-marker--selected {
  outline: 2px solid #a2600f;
  outline-offset: 1px;
}

.georeference-references {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid rgb(10 20 22 / 12%);
  border-radius: 6px;
  font-size: 0.74rem;
}

.georeference-references-locked {
  color: var(--muted);
}

.georeference-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.georeference-done {
  font-weight: 700;
}
```

Then open a **new** `@media (max-width: 860px)` block at the very END of the
file, after everything above.

**Not the existing block.** An earlier draft said to append "inside the second
`@media (max-width: 860px)` block — the style test reads the last one", which
is wrong twice over: the last such block starts at `styles.css:2722` of ~3865
lines, while the "Your maps" section it also names starts at 3767. So
`styles.slice(lastIndexOf(…))` spanned the base rules too, and the narrow
assertions matched the WIDE `.georeference-panel` rule. Putting these last is
what makes the anchored assertions in Step 7 mean anything.

```css
@media (max-width: 860px) {
  /* Full-bleed here: no room to keep the map beside the panel, so the tab
     toggle switches between them instead. Both `width` and `max-width` must
     be released — the base rule pins the panel to a 45vw column. */
  .georeference-panel {
    top: 8px;
    right: 8px;
    bottom: 8px;
    left: 8px;
    width: auto;
    max-width: none;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr) auto;
  }

  .georeference-side {
    max-height: 45vh;
    overflow-y: auto;
    border-left: 0;
    border-top: 1px solid rgb(10 20 22 / 12%);
  }

  .georeference-tabs {
    display: flex;
    grid-column: 1 / -1;
    gap: 6px;
    padding: 0 14px 8px;
  }

  /* The Map tab hides the PANEL, not merely the scan inside it. Giving the
     user the app's own map is the entire point of that tab, and a full-screen
     card in front of it is the bug this replaced — the earlier rule hid
     `.georeference-scan` alone and left an opaque panel over the map, with a
     comment claiming it did the opposite.

     The scan tab keeps everything: scan on top, list and footer (with Done)
     stacked beneath it, because with the panel gone on the Map tab this is
     the only place they can live. */
  .georeference-panel[data-tab="map"] {
    display: none;
  }

  .georeference-map-bar[data-tab="map"] {
    display: flex;
  }
}
```

`data-tab` is set by Task 10 on the same element that carries
`.georeference-panel`, and on the floating bar — which is a **sibling** of the
panel, not a child, precisely so `display: none` on the panel does not take it
down too. `.georeference-tabs` is a **direct child** of the panel so it can
occupy the second grid row here. Task 10's rendered-DOM tests pin all three; if
you find yourself moving the attribute elsewhere to make this work, the panel
markup drifted — fix the markup, not the selector.

- [ ] **Step 9: Run the full suite and lint**

Run: `cd web && npm test -- --run && npx tsc -b && npx eslint src`

**`tsc -b`, not `tsc --noEmit`.** `web/tsconfig.json` is a solution file with
`"files": []`, so `tsc --noEmit` at the root checks nothing at all and exits 0
over genuinely broken code (verified against a deliberate `TS2322`). `tsc -b`
compiles the referenced projects and exits **2** on error — including on
repeated incremental runs while the error is still present — so the `&&` chain
above is a real gate. Beware measuring this through a pipe: `npx tsc -b | head`
reports `head`'s exit code, which is what made an earlier revision of this plan
claim `tsc -b` exits 0 on failure.

Expected: full suite green, no type errors printed, no lint errors. Every
pre-existing test must still pass — if any `App.test.tsx` test broke, the
wiring changed behaviour it was pinning; fix the wiring, not the test, unless
the test was asserting the old "GeoTIFF only" copy.

- [ ] **Step 10: Commit**

```bash
git add web/src/App.tsx web/src/App.test.tsx web/src/userMaps/components/UserMapRows.tsx web/src/userMaps/components/UserMapRows.test.tsx web/src/userMaps/useGeoreferenceSession.ts web/src/userMaps/useGeoreferenceSession.test.ts web/src/styles.css web/src/styles.test.ts
git commit -m "feat(web): open the georeferencer from the layer list"
```

---

### Task 13: Docs, live verification, and the PR

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `plan.md`
- Modify: `web/README.md` (only if it enumerates accepted file types)

This task ships nothing executable. Its point is that the repo's own rule —
"when you add a feature or change a data model, the docs get updated in the
same change" — is not satisfied by the code alone. PR 2 changes what file
types the app accepts, adds a persisted georeferencing method, and adds a new
Leaflet pane; all three are documented facts that are now wrong.

- [ ] **Step 1: `README.md`** — the "Your maps" bullet (line ~52) currently
      says GeoTIFFs only. Replace with:

```markdown
- **Your maps** — load your own GeoTIFFs (georeferenced scans, orthophotos) and
  drape them over Nova Scotia with an opacity slider. Plain JPEG and PNG scans
  can be georeferenced in the browser: click a landmark on the scan, then the
  same landmark on the map, and from three points on the scan drapes live.
  Files never leave your device: parsing, warping, georeferencing, and storage
  are all in-browser.
```

- [ ] **Step 2: `ARCHITECTURE.md`** — extend the `web/src/userMaps/` paragraph
      (line ~483). Keep the existing text and replace its last sentence ("The
      PR-2 georeferencer builds on the same mesh renderer…") with:

```markdown
The PR-2 georeferencer (`useGeoreferenceSession.ts`, `components/Georeference*`)
solves a least-squares affine from ground control points and drapes through the
same mesh renderer. Control points are stored as WGS84 for portability but
solved in Web Mercator **metres** — at Nova Scotia's latitude a degree of
longitude is ~0.69 of a degree of latitude on the ground, so a degree-space fit
would shear every map east-west. Pixel coordinates are always in the ORIGINAL
raster's pixel space, never the downsampled preview's, so changing the preview
cap never invalidates saved points. Accuracy is reported as per-point ground
metres (not Mercator metres, which over-report by 1/cos φ — 1.44x here, so the
figure is deliberately *not* the one QGIS shows for an EPSG:3857 target), and
the worst-fitting row is flagged only from five points up: four points fitting
three parameters leave a one-dimensional residual space (`I − H` has rank 1),
so raw, leave-one-out and studentized residuals rank identically and a
1104-trial sweep put all three at chance. A solve is
refused outright when the control points are too thin to determine a transform,
when any coordinate comes out non-finite, or when the solved transform squashes
one axis more than 50:1 — the last being what three map clicks down a meridian
produce, complete with zero-area drape and a perfect 0 m residual. GCP markers
get their own pane (`georeference-pane`, z-660: above every data overlay and
above Leaflet's marker and tooltip panes, below its popup pane at 700) so a
control point is never buried under a parcel line.
```

- [ ] **Step 3: `plan.md`** — tick the PR-2 line:

```markdown
- [x] In-browser georeferencer for plain scans (PR 2)
```

- [ ] **Step 4: Update the spec's status line** in
      `docs/superpowers/specs/2026-07-24-web-user-maps-design.md` so the PR-2
      amendment section is marked as shipped rather than proposed.

- [ ] **Step 5: Commit the docs**

```bash
git add README.md ARCHITECTURE.md plan.md docs/superpowers/specs/2026-07-24-web-user-maps-design.md
git commit -m "docs: record the in-browser georeferencer"
```

- [ ] **Step 6: Verify it live in the browser**

Automated tests cannot prove the warp looks right — that is precisely the gap
that let PR 1 ship a seam bug. Run the dev server and check, in order:

1. Import a plain JPEG scan. The row says "Needs georeferencing", its checkbox
   is disabled, and a "Georeference" button is offered.
2. Open the georeferencer. **The app's own map is still visible and still
   clickable to the right of the panel** — no dimming scrim, no full-width
   card, layer rail hidden, crosshair cursor over the map. If a click on the
   map does nothing, stop: the overlay is intercepting pointer events and no
   control point can ever be completed. The scan pane shows the whole image,
   pannable and zoomable independently of the map.
3. Place two points, one click per side. The status line asks for the third;
   nothing drapes yet.
4. Place the third. **The scan drapes immediately**, and the status says
   "Exact fit — add a 4th point to check accuracy." No "0 m" anywhere.
5. Drag a point on the map. The drape follows **during** the drag, not on
   release, and there is no flicker (a flicker means the bitmap is being
   re-decoded — Task 6's identity contract has broken).
6. Place a 4th point deliberately wrong. Real metres appear in the Off-by
   column and **no row is highlighted yet** — that is correct, not a bug.
   Place a 5th; the wrong point's row is now flagged and the RMS jumps.
   Delete it; the flag and the RMS recover.
7. Click **Zoom to** on a row. Both the scan pane and the live map recentre on
   that point, and neither zooms back out if you were already closer in.
8. Undo (button and Cmd/Ctrl+Z) walks back point-by-point. Crucially: **one
   press per action.** Two presses per action means a state updater is doing
   side-effect work and StrictMode is running it twice (Task 7).
9. Toggle the two reference layers from the panel footer; both appear under
   the drape. Close the panel and confirm the layer rail agrees — these are
   the rail's own toggles, not a copy.
10. Press Escape with nothing half-placed, straight after a drag. Reload: the
    edit survived. (Escape closes through the same flush as Done — dropping it
    there loses anything inside the 400 ms debounce window.)
11. Drag a point, then within half a second click **Delete map**. Exactly
    **one** confirmation dialog appears. Reload: the map is gone and does
    **not** reappear as a nameless row — a write that outlives the delete
    resurrects the metadata without its raster or preview.
12. Close the panel, reload the page, reopen the georeferencer. The points are
    still there — this is the debounced IndexedDB write-through, and its
    flush-on-close is the part most likely to be subtly wrong. Then open map
    A, edit it, and within half a second open map B and edit that: reload and
    check **both** kept their edits.
13. Use **Zoom to** on map A, close it, then open map B. B's map must NOT jump
    to A's control point.
14. Narrow the window below 860 px. On the Scan tab the panel is a full-screen
    overlay (not a block at the bottom of a scrolled page) with the scan, the
    point list and Done all reachable. Choose **Map**: the panel disappears
    entirely, the app's map fills the screen, and a floating bar shows the live
    prompt plus **Back to scan**, which returns. Placing a point from the Map
    tab works.

Capture a screenshot of step 4 or 5 for the PR description.

- [ ] **Step 7: Open the PR into `nightly`**

```bash
git fetch origin && git rebase origin/nightly
cd web && npx vitest run && npx tsc -b && npx eslint src && cd ..
git push -u origin claude/web-georeferencer-user-maps-76f482
gh pr create --base nightly --title "feat(web): in-browser georeferencer for user maps (PR 2 of 4)" --body-file -
```

**The gate runs again AFTER the rebase, not only at Task 12's Step 9.** A rebase
that merges cleanly can still be semantically broken — `nightly` may have moved
`MapCanvas`, `styles.css` or `useUserMaps` under this branch — and the plan's
final commanded state would otherwise be "push and open a PR" with the last
verification predating the merge. Then check the hosted result for the PR head:

```bash
gh pr checks --watch
```

Red CI here is this task's problem, not the next PR's.

The body should lead with the risks and behavioural changes, per the repo's
response rules: JPEG/PNG are now accepted; `parseGeoTiff` no longer throws on
an ungeoreferenced TIFF (it returns `georef: null` and routes to the
georeferencer); a shipped seam bug in `mesh.ts` is fixed; and
`WarpedRasterLayer` now has real pixel tests, closing the PR-1 gap.

---

## Self-Review

- [ ] **Spec coverage.** Walk the PR-2 amendment in
      `docs/superpowers/specs/2026-07-24-web-user-maps-design.md` line by line
      and confirm every locked decision has a task that implements it and a
      test that pins it. The decisions most likely to be quietly dropped are:
      solving in metres, original-pixel-space coordinates, the "add a 4th
      point" copy, **no highlighted row at four points**, the GCP list's
      zoom-to control, the **"Adjust points"** button label, undo
      snapshotting on drag START rather than per pointer move, and the layout
      contract at spec:189–194 — **panel left ~45%, the app's own map live and
      clickable on the right ~55%, hidden layer rail, crosshair cursor, and a
      narrow Map tab that hides the PANEL and leaves a floating bar.**
- [ ] **The live map is reachable.** The single most expensive way to be wrong
      in this PR is an overlay that covers the pane the user has to click:
      every control point needs one click on each side, so an occluding or
      pointer-eating overlay makes the whole feature inoperable while every
      unit test stays green (jsdom does no layout). `.georeference-overlay`
      must carry `pointer-events: none` and no background; the panel and the
      floating bar take `pointer-events: auto`; the narrow Map tab hides
      `.georeference-panel` itself. Confirm it in the browser, not just in the
      regexes.
- [ ] **Rendered DOM, not just stylesheet text.** `styles.test.ts` regexes
      `styles.css` and cannot tell whether any element carries the class names
      it checks. For every new rule, confirm a component actually renders the
      selector — `.georeference-overlay`, `.georeference-side`,
      `.georeference-points`, `.georeference-map-bar`, `[data-tab]`,
      `.gcp-row`, `.gcp-residual`, `.gcp-marker`, `.visually-hidden`,
      `.app-shell.georeferencing`, `.map-canvas--georeferencing`. This exact
      gap shipped a stylesheet whose two breakpoints and pane toggle were
      entirely dead, with every style test green.
- [ ] **No component is covered only by its own stub.** Every new component
      must be executed by at least one test that does not mock it:
      `ScanPane.test.tsx` for the scan side, `MapCanvas.test.tsx` for the
      georeference binding, `GeoreferenceMapLayer.test.tsx` for the marker
      layer. A `vi.mock` in a sibling suite is not coverage — an earlier
      revision claimed `ScanPane` was "covered through
      `GeoreferencePanel.test.tsx`", which mocks it.
- [ ] **StrictMode.** Nothing in `useGeoreferenceSession` or `useUserMaps`
      does work inside a `setState` updater. `main.tsx` wraps the app in
      `StrictMode`, updaters run twice there, and a bare `renderHook` test
      will not notice.
- [ ] **Lint gate.** `npx eslint src` is clean. In particular no `.tsx` file
      exports a function: `react-refresh/only-export-components` is an error
      here, and four of this plan's new modules exist specifically to keep
      helpers out of component files.
- [ ] **Placeholder scan.** Grep the finished branch for `TODO`, `FIXME`,
      `any`, and `@ts-expect-error`. PR 1 shipped none; PR 2 should not start.
- [ ] **Type consistency across tasks.** `Gcp`, `PixelSize`, `LatLngPoint`,
      `AffineParams`, `DraftUserMap`, `GeoreferenceBinding`, and
      `ReferenceLayerState` each have exactly one definition site, imported
      everywhere else. No structural duplicates.
- [ ] **Persisted-schema stability.** `GcpGeoref` and `Gcp` in `types.ts` are
      unchanged from PR 1. If a task needed to change them, that is a
      migration, and this plan has no migration step — stop and re-plan.
- [ ] **The PR-1 warning holds.** Every library assumption in this plan that
      was not verified against the real API is marked as unverified. Anything
      a task discovers to be wrong gets reported, not silently worked around.
