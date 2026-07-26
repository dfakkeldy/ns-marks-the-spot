# Web "Your Maps" PR 3 — TPS Warp + Allmaps Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user with a geometrically distorted scan — an A.F. Church county map, not a Fletcher grid sheet — switches that map to a thin-plate-spline warp, watches it sit flat on Nova Scotia, sees an honest per-point accuracy figure, and exports the georeferencing as a IIIF Georeference Annotation.

**Architecture:** TPS lives beside the existing affine solver in `web/src/userMaps/transform/`, hand-rolled and pure, solving in Web Mercator metres exactly as `affine.ts` does. `UserMapRecord.georef.method` already carries `"affine" | "tps"`, so the persisted shape does not change and there is no migration. The warp reaches the screen through the existing `WarpedRasterLayer.setLatLngMesh()` at a **two-tier** mesh density — coarse while a control point is being dragged, fine once the pointer settles. Allmaps export is a pure serializer with no new dependency.

**Tech Stack:** React 19, Leaflet 1.9 + react-leaflet 5, Vite 8, TypeScript 5.9, Vitest 4 (jsdom), `canvas` 3.2.3 (dev-only), proj4, geotiff **2.1.3 (exact pin — do not upgrade)**.

**Spec:** `docs/superpowers/specs/2026-07-24-web-user-maps-design.md`, and specifically its three **Amended 2026-07-26** blocks (TPS grid size; TPS residuals; PR 3 scope and decisions).

---

## Global Constraints

PR 2's Global Constraints **all still bind**. Repeated here in full because a task implementer sees only their own task.

- **No new runtime dependency.** The `geotiff` / `proj4` / `pdf.js` lock stands. `canvas` is dev-only. Nothing in `web/dist` grows. **This explicitly rules out `@allmaps/annotation`** — see Task 8.
- **`geotiff` stays pinned at exactly `2.1.3`.**
- **Fresh worktrees have stale `node_modules`.** Run `npm ci` in `web/` before the first test run.
- **GCP pixel coordinates are ORIGINAL image pixel space, never preview space.**
- **Solve in projected Web Mercator metres, never raw lat/lng degrees.**
- **Residuals are reported in GROUND metres, not Mercator metres.** A raw Mercator residual over-reports by 1/cos(latitude) — measured at exactly 1.4396× at 46°N. Use `groundMetresBetween` from `webMercator.ts`; never a Mercator magnitude.
- **Record identity is load-bearing.** `UserMapLayers`' layer-construction effect keys on the `record` object reference; churning it re-decodes the bitmap.
- **Lint is strict.** `react-hooks/set-state-in-effect`, `purity`, `immutability`, `refs`, `set-state-in-render` are all ERRORS. When a ref must be current before in-flight work resolves, use `useLayoutEffect`, not `useEffect`.
- **No side effects inside a `setState` updater.** React 19 double-invokes updaters under `StrictMode` (2 invocations per dispatch, measured), and defers them whenever the owning fiber has queued work — which `App` always does. Build the value outside and hand it in.
- **A *conditional* `setState` during render is the intended re-seed pattern and is lint-clean.** Do not "fix" it into a `useEffect`; that is the banned rule.
- **Exports from a `.tsx` file must be components or constants.** `react-refresh/only-export-components` is an ERROR (`allowConstantExport: true`). Shared pure helpers go in `.ts` modules.
- **Privacy copy, verbatim:** `Files stay on this device — nothing is uploaded.`
- **Preview cap** stays `PREVIEW_MAX_DIMENSION = 4096`.
- **Conventional Commits; commit after every task.** Branch `claude/web-your-maps-pr3-75b34a` (based on `origin/nightly`); final PR targets `nightly` — **never** `main`.
- Commands run from `web/`. **The gate is `npx vitest run && npx tsc -b && npx eslint src`.**

### PR 3 additions

- **`npx tsc --noEmit` type-checks NOTHING** (`web/tsconfig.json` is a solution file, `"files": []`). Use **`npx tsc -b`**, which exits 2 on error.
- **Never measure a command's exit status through `| head` / `| tail` / `| grep`** — that reports the pipe's status. Redirect to a file and capture `$?`.
- **Do not run vitest concurrently in this worktree.** Overlapping runs produce spurious exit 1, observed repeatedly.
- **Known pre-existing flake, confirmed unrelated:** `src/components/MapCanvas.test.tsx > "loads the checked-in pilot only when its independent layer is visible"` intermittently exceeds RTL's 1000 ms `waitFor` (measured 1075 ms on 1 of 8 runs) awaiting a lazy `import()` of a 920 KB JSON under fork load. **If you see that specific failure, re-run.** Any other failure is real.
- **The session scratchpad is shared between concurrently running agents.** An agent's mutation-testing helper script was overwritten mid-round. Inline your mutations; do not shell out to a script another agent can clobber. `diff -q` after every restore.
- **When reverting, revert THAT PATH only.** A working-tree-wide `git restore .` has destroyed uncommitted work here. Take backups from the **current** state, not from a pre-fix copy.

---

## Verified facts and measurements — do not re-derive, do not "correct"

Every row was measured before this plan was written. PR 1's plan was confidently wrong about library behaviour five times; PR 2's was wrong until an adversarial review caught a Critical. **A number asserted without measurement is the failure mode this table exists to prevent.**

| Claim | Status |
|---|---|
| A IIIF Georeference Annotation is plain JSON; **no dependency is needed** | Verified against <https://iiif.io/api/extension/georef/>. `@allmaps/annotation` exists but is built around IIIF URIs and would breach the no-new-runtime-dependency constraint for ~30 lines of object construction. |
| `transformation` lives on the **body FeatureCollection**, not the annotation root | Verified. Placing it at the root produces a silently invalid annotation. |
| The TPS transformation type is spelled **`thinPlateSpline`** and takes **no `options`** | Verified. (`polynomial` is the other type; its `options.order` is 1/2/3.) |
| `properties.resourceCoords` is `[x, y]`; GeoJSON `geometry.coordinates` is `[lon, lat]` | Verified — the spec says `resourceCoords` *must* be exactly x-then-y. **These are opposite orders.** Both are number pairs, so a transposition survives `tsc -b`. NS lon ≈ −61 and lat ≈ 46 differ in sign, so the fixture must exploit that. |
| The extension has **no provision** for an image with no IIIF service or public URL | Verified: *"The value for `target` must either be a single and full IIIF resource, or a single region within a IIIF resource."* Our maps are local files. Decision recorded in the spec: a `urn:uuid:` target. |
| `gridSize` is **cells per axis**, not vertices | Verified at `render/mesh.ts:29-39` (`gridSize + 1` vertices per axis) and `:84-97` (`length - 1` cells, two triangles each) → cost is `2 · gridSize²`. |
| The triangulation diagonal is the **anti-diagonal, top-right ↔ bottom-left** | Verified at `mesh.ts:94-95`, where `s10` is top-right and `s01` bottom-left — the naming inverts the usual reading. **Measured: the other diagonal changes max error by up to 15%**, and not consistently in `mesh.ts`'s favour. |
| Each triangle calls `ctx.drawImage(image, 0, 0)` on the **entire** source image under a clip | Verified at `mesh.ts:67-69`. `2·gridSize²` is not "N cheap quads". |
| TPS mesh error, measured on all three real Church control sets | gridSize 8 → 94.7 / 26.2 / 65.9 m; 16 → 44.3 / 10.9 / 15.9; **64 → 6.0 / 1.1 / 2.0**; 128 → 1.9 / 0.29 / 0.55 (ground metres, max, north/south/richmond). Sampled at strictly interior points; converged <0.2% by 1024 samples/axis. |
| Render cost is **sublinear**: `T ∝ triangles^0.29–0.40` | Measured on node-canvas. Total painted area is fixed however finely the mesh is cut, so 4× the triangles costs ~1.6×. gridSize 8→16 is **1.1–1.7×**. |
| **Error is NOT monotone in gridSize** | Measured: 12 (43.87 m) beats 16 (44.28 m); 24 (17.70) beats 32 (17.78); 1 (240) beats 2 (309). Lattice vertices landing near control points locally cancel error. **No test may assert "denser is always better".** |
| Max error converges ≈`h^1.7`, not `h²`; RMS converges `h²` (1.94–1.98) | Measured and explained: the TPS kernel `r²·log r` has a logarithmically unbounded Hessian at each control point. The argmax sits 0.02–0.33 cell diagonals from the nearest control point at every gridSize. |
| `gridSize = 256` is **out regardless of rasterizer** | Measured: **19.65 ms of pure JavaScript** per redraw before a pixel is touched (10 context calls/triangle at ~0.15 µs). And 256 is exactly what the worst sheet needs for half-a-CSS-pixel at native zoom — so that target is unreachable by mesh refinement. |
| Plain-JS TPS solve is **O(n³)**, confirmed | Measured (hand-rolled Gaussian elimination, `Float64Array`, centred+scaled, node v22): n=30 → 0.021 ms; n=100 → **0.462 ms**; n=200 → 3.29; n=300 → **10.34**; n=500 → **56.15**. 100→200 is ×7.1. |
| TPS evaluation at mesh vertices is linear in n and vertex count | Measured: at gridSize 64 (4 225 vertices), n=30 → 1.30 ms; n=100 → 4.12; n=300 → 12.05; n=500 → 20.52. |
| Largest n inside a 16 ms frame (solve + evaluate) | Measured: gridSize 12/16 → **n = 300**; gridSize 64 → **n = 200**. |
| The measured error numbers are a **LOWER BOUND** for the real Church case | Measured: on these graticule-fitted control sets, TPS is **not** better than affine at held-out check points (RMS 803 vs 802 m north, 330 vs 333 south, 621 vs 630 richmond) — a fitted lattice is nearly affine by construction (affine residual at control is only 87–109 m RMS). Real anchors carry shorter-wavelength structure, and required cell size scales with control-point spacing. |
| Web Mercator curvature is a **red herring** at any useful density | Measured: 51–55% of the error at gridSize 1, but **0.5–3.7% at gridSize 64**. Whatever gridSize PR 3 picks is set by TPS bending, not by the reason `projection.ts` uses 8. |
| **Browser rasterization cost is UNMEASURED** | Two methodologies failed for identified reasons (harness tab reports `visibilityState: "hidden"`, 0 rAF callbacks in 2 s; `getImageData` sync demotes an accelerated canvas to software). node-canvas puts the **already-shipping** gridSize 8 at 90 ms/redraw (11 fps) — were that true in a browser the existing feature would be visibly broken, so cairo overstates by a large but **uncalibrated** factor. **`gridSize 64` for settled redraws is provisional pending a real browser profile; the 12–16 drag tier is safe either way.** |
| `L.CRS.Simple.project()` and `map.project()` are different functions | Verified in PR 2. The CRS method returns raw LonLat and ignores its zoom argument; the Map method applies `Transformation(1,0,-1,0)`. Using the CRS method mirrors every GCP's pixel row. Now also pinned by `ScanPane.realMount.test.tsx`. |
| Hand-rolled spherical Mercator matches `L.Projection.SphericalMercator` to ~3e-9 m | Verified in PR 2. `transform/` stays Leaflet-free. |
| `canvas` + jsdom yields a real `CanvasRenderingContext2D` | Verified in PR 2, including clip boundaries. |
| **`solveAffine` refuses on a RATIO, not on exact singularity** | Verified: `affine.ts:59` `MIN_CONDITION_RATIO = 5e-3`, applied at `:146-150` to the centred scatter matrix's narrowest RMS extent. It therefore rejects **thin** clouds, not just degenerate ones. Any TPS gate must match it or the two paths disagree about the same points. |
| **Measured divergence when TPS has no conditioning gate** | 5 GCPs along a road with ±2 px scatter → affine `condRatio` **2.166e-3** (refused, `degenerate`) while an unconditioned TPS **accepts** and a 1-px nudge moves a drape corner **12.2 km**. Reproduced independently. |
| **A single collinear fixture cannot certify the refusal** | Measured: `(100,100) (400,400) (900,900)` — the 45° diagonal — refuses, because `xs[i]` and `ys[i]` are **bit-identical**, two matrix rows are identical, and the pivot cancels to *exactly* 0. Rotate the same degenerate line oblique — `(100,100) (400,250) (900,500)` — and the pivot lands at ~1e-16, `Math.abs(1e-16) > 0` is true, and it **solves**. Test at least three orientations. |
| **TPS LOO ranking beats chance from n = 5, never at n = 4** | Measured, 4 000 trials per n on Poisson-disk irregular layouts (never a lattice): n=4 → 25.1% vs 25.0% chance, CI [23.7, 26.4]; **n=4 pooled over 8 fixture conditions, 32 000 trials → 24.98%, CI [24.50, 25.45]** — dead on chance, flat across every displacement band including 2–4 km. n=5 → 32.4% vs 20.0%; n=8 → 46.8% vs 12.5%; n=12 → 52.8% vs 8.3%. **`MIN_GCPS_FOR_TPS_SUSPECT = 5`**, independently derived. At n=5 the signal comes entirely from errors ≳125 m. |
| **The AFFINE fit residual outranks TPS LOO at finding the outlier** | Measured, paired on identical trials: n=8 → affine **62.9%** vs LOO **46.8%**, 943 affine-only wins vs 299 LOO-only, **z = −18.3**; holds in all three truth conditions (n=12 affine-only truth: 91.7% vs 69.9%). **Mechanism:** a TPS interpolates exactly, so an outlier left in a refit is absorbed into the spline's shape and bends the surface around itself, corrupting its neighbours' LOO scores far more than least-squares smearing does. |
| **LOO magnitude IS a usable accuracy figure, but biased high** | Measured on undisplaced sets, 60 held-out check points, 1 200 trials per n: Spearman 0.63 (n=4) → 0.79 (n=8). median(LOO/true) = **3.71 (n=4), 2.20 (n=8), 1.77 (n=12)**, p10 ≥ 1.09 everywhere. Identical with sheet scale held fixed, so the correlation is not an artefact of scale variation. **It overstates and is never optimistic — ship it as a conservative upper bound, and say so in the copy.** |

### ⚠ Reconciliation: leave-one-out was implemented, measured, and DELETED in PR 2 — and the measurement now SPLITS it

**Read this before Task 6.** `leaveOneOutMetres` existed in `transform/residuals.ts` and was removed in commit **`11780341f`**. The comment that replaced it survives at `residuals.ts:81-91`: *"Measured over 1104 trials, leave-one-out won 147 times and lost 150 — a wash — while costing an extra affine solve per point on every pointer move of a drag. It was dropped for the plain fit residual."*

PR 3 re-introduces leave-one-out **for one job only**, and drops it for the other. Both halves are measured.

**Where LOO is the ONLY option — the displayed accuracy number.** A TPS passes through its control points exactly, so `residualMetresFor` returns ~0 for every point at any count. There is no competing signal. LOO correlates 0.63–0.79 with true warp error, so it is informative — but it **overstates true error by 1.8×–3.7× and is never optimistic**, so the UI must present it as an upper bound rather than as the error.

**Where LOO LOSES, and PR 2's instinct is vindicated — the highlighted row.** Measured: the plain **affine** fit residual identifies the displaced point better than TPS LOO at every n ≥ 5, decisively (62.9% vs 46.8% at n=8, z = −18.3). It is also cheaper — one affine solve per pointer move instead of *n* TPS solves. So the suspect highlight ranks by the affine fit residual **even while a TPS warp is displayed**.

This is consistent with the copy already shipping. The row's text carrier reads *"Disagrees most with the other points"* — a **consistency** claim, not a largest-error claim — so the highlight not always sitting on the largest displayed number is exactly what the wording describes. Do not "fix" that by re-ranking to match.

**The threshold is measured, not inherited.** `MIN_GCPS_FOR_TPS_SUSPECT = 5`. It lands on the same value as the affine constant, but was derived independently: n=4 is a wash at 32 000 pooled trials (24.98% against a 25.00% baseline), confirming that the rank argument in the existing `MIN_GCPS_FOR_SUSPECT` comment carries over to TPS LOO intact.

---

## File structure

| File | Responsibility |
|---|---|
| `web/src/userMaps/transform/conditioning.ts` | **Create.** `conditionRatio(gcps)` extracted from `affine.ts` so both solvers share ONE gate. Two independent copies of a numerical threshold is how they drift. |
| `web/src/userMaps/transform/tps.ts` | **Create.** Pure TPS solve + apply in Web Mercator metres, returning a discriminated result that carries the refusal *reason*. |
| `web/src/userMaps/transform/gcpMesh.ts` | **Modify.** `buildTpsLatLngMesh` + the two measured grid constants. |
| `web/src/userMaps/transform/residuals.ts` | **Modify.** `tpsResidualReport` — LOO magnitudes, affine-ranked suspect. |
| `web/src/userMaps/useGeoreferenceSession.ts` | **Modify.** A `method` option, a method-aware solve, the new refusal state, drag-aware mesh density. |
| `web/src/userMaps/useUserMaps.ts` | **Modify.** `saveGcps` stops hardcoding `method: "affine"`. |
| `web/src/userMaps/components/GeoreferencePanel.tsx` | **Modify.** TPS toggle, export control. |
| `web/src/userMaps/allmaps/annotation.ts` | **Create.** Pure serializer. A `.ts` file, so plain function exports are legal. |
| `web/src/userMaps/testFixtures.ts` | **Create.** `BENT` and `gcpRecord` shared across transform tests — Task 1 owns it. |
| `README.md`, `ARCHITECTURE.md`, `plan.md` | **Modify.** Final task. |

---

## Task list

Eleven tasks. **This graph was corrected after review**: the original assigned "method-aware solve" to no task while two tasks depended on it, and gave `solveTps` a `TpsParams | null` signature that could not carry the refusal reason a later task needed.

| # | Task | Produces |
|---|---|---|
| 1 | Shared `conditionRatio` + TPS solver with typed refusals + shared fixtures | `conditionRatio`, `solveTps`, `applyTps`, `TpsSolveResult`, `BENT`, `gcpRecord` |
| 2 | `buildTpsLatLngMesh` + measured grid constants | `TPS_GRID_SIZE`, `TPS_DRAG_GRID_SIZE`, `buildTpsLatLngMesh` |
| 3 | **Method-aware session** (NEW — was missing) | `method` option; method-aware `params`/`mesh` |
| 4 | The `coincident-points` refusal state | new `GeoreferenceStatus` member |
| 5 | Two-tier mesh density during a drag | `endDragGcp` + wiring |
| 6 | TPS residuals: LOO magnitudes, affine-ranked suspect | `tpsResidualReport`, `MIN_GCPS_FOR_TPS_SUSPECT` |
| 7 | `saveGcps` preserves `method` | — |
| 8 | The TPS toggle | — |
| 9 | Allmaps annotation serializer | `georeferenceAnnotation` |
| 10 | Export control | — |
| 11 | Batched Minor fixes + docs | — |

**Dependencies:** 1 → 2, 4, 6. 2 → 3. 3 → 5, 8. 1 → 9. 9 → 10. 7 independent. All → 11.

**Task 3 must land before Tasks 4 and 5.** Both assert on a session that solves with TPS; today `useGeoreferenceSession` has no `method` option and hardcodes `solveAffineFromGcps` (`:388-392`) with options `{ mapId, initialGcps, pixelSize, onPersist, persistDelayMs? }` (`:83-89`).

---

### Task 1: shared conditioning gate, TPS solver with typed refusals, shared fixtures

**Files:**
- Create: `web/src/userMaps/transform/conditioning.ts` + `.test.ts`
- Create: `web/src/userMaps/transform/tps.ts` + `.test.ts`
- Create: `web/src/userMaps/testFixtures.ts`
- Modify: `web/src/userMaps/transform/affine.ts` (use the extracted helper; behaviour must not change)

**Interfaces — Produces:**
```ts
// conditioning.ts
export function conditionRatio(gcps: Gcp[]): number;   // sqrt(lambda_min/lambda_max) of the centred pixel scatter

// tps.ts
export const MIN_GCPS_FOR_TPS = 3;
export const MIN_TPS_SEPARATION = 1e-6;
export type TpsParams = { /* opaque to callers; see implementation */ };
export type TpsRefusal =
  | "too-few-points"
  | "coincident-points"
  | "ill-conditioned"
  | "non-finite";
export type TpsSolveResult =
  | { ok: true; params: TpsParams }
  | { ok: false; reason: TpsRefusal };
export function solveTps(gcps: Gcp[]): TpsSolveResult;
export function applyTps(params: TpsParams, x: number, y: number): MercatorPoint;

// testFixtures.ts
export const BENT: Gcp[];                       // irregular, NOT a lattice
export function gcpRecord(overrides?: Partial<...>): UserMapRecord;
```

**Why a result union, not `TpsParams | null`.** Task 4 must tell the user *"Two points are on the same spot"* as distinct from *"These points can't pin the map down"*. A `null` collapses all four refusals, and re-detecting coincidence in the session would put a second threshold beside the solver's own — measured to diverge: `solveTps` rejects at scaled distance < 1e-6, i.e. ~0.0007 raw px on a 2 000 px cloud, so any plausible session-side pixel threshold disagrees in both directions.

**Why extract `conditionRatio`.** `solveAffine` refuses on a *ratio* (`MIN_CONDITION_RATIO = 5e-3`), so it rejects thin clouds, not just singular ones. TPS needs the same test or the two paths disagree about the same points — measured: 5 points along a road with ±2 px scatter give `condRatio = 2.166e-3`, refused by affine and accepted by an unconditioned TPS, where a 1-px nudge moves a drape corner **12.2 km**. Extract rather than duplicate.

- [ ] **Step 1: Extract `conditionRatio` with a characterisation test FIRST**

Before moving anything, pin the current behaviour so the extraction cannot change it:

```ts
// conditioning.test.ts — these values are MEASURED against the current affine.ts
it("scores a healthy scattered cloud well above the refusal threshold", () => {
  expect(conditionRatio(BENT)).toBeGreaterThan(0.3);
});

it("scores a road with 2px of scatter BELOW the affine refusal threshold", () => {
  // The measured case: affine refuses this at 2.166e-3, and an unconditioned
  // TPS accepts it. Both solvers must agree.
  const road = mk([[100,100],[400,251],[700,399],[1100,602],[1500,798]]);
  expect(conditionRatio(road)).toBeCloseTo(2.166e-3, 5);
  expect(conditionRatio(road)).toBeLessThan(MIN_CONDITION_RATIO);
});

it("scores an exactly collinear cloud at zero, at THREE orientations", () => {
  // One angle is not enough: at 45 degrees xs[i] and ys[i] are bit-identical
  // and the arithmetic cancels exactly, which hides a gate that only works
  // there. Measured — the oblique case is the one that escapes.
  expect(conditionRatio(mk([[100,100],[400,400],[900,900]]))).toBe(0);   // 45 deg
  expect(conditionRatio(mk([[100,100],[400,250],[900,500]]))).toBe(0);   // oblique
  expect(conditionRatio(mk([[100,300],[500,300],[1200,300]]))).toBe(0);  // horizontal
});
```

Run the **whole existing** `affine.test.ts` before and after the extraction and confirm identical results. If any affine test changes, the extraction changed behaviour — revert and report.

- [ ] **Step 2: Write the failing TPS interpolation test**

```ts
it("passes EXACTLY through every control point — the defining property", () => {
  const result = solveTps(BENT);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  for (const gcp of BENT) {
    const got = applyTps(result.params, gcp.pixel.x, gcp.pixel.y);
    const want = toMercator(gcp.map);
    // 1e-6 m is far below anything perceivable and far above the ~1e-11 m the
    // implementation achieves in centred space, so this is a real gate.
    expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-6);
  }
});
```

`BENT` lives in `testFixtures.ts` and must be **irregular**. A regular lattice is nearly affine by construction — measured on this project's real Church graticule sets, where TPS scored no better than affine at held-out check points — so a lattice fixture cannot distinguish a working spline from a working affine.

- [ ] **Step 3: Run, verify it fails on the import, not on an assertion**

Run: `cd web && npx vitest run src/userMaps/transform/tps.test.ts`
Expected: FAIL — `Failed to resolve import "./tps"`. Any other failure means the test is wrong; stop and report.

- [ ] **Step 4: Implement `tps.ts`**

Standard 2D thin-plate spline: kernel `U(r) = r²·log r` with `U(0) = 0`, plus an affine tail, as an `(n+3)×(n+3)` system with the three side conditions, x and y solved separately by Gaussian elimination with partial pivoting over a `Float64Array`.

**Conditioning is mandatory, in both senses:**
1. **Numerically** — centre source coordinates on their centroid and scale to unit RMS, and subtract the destination centroid, before assembling. Measured: without it an n=500 system at Mercator magnitudes (~6.77e6 m) is not reliably solvable; with it the interpolation residual is 5.11e-11 m in centred space.
2. **As a refusal** — reject `conditionRatio(gcps) < MIN_CONDITION_RATIO` with `reason: "ill-conditioned"`, using the shared helper. **Do not rely on the pivot check for this**: measured, an oblique collinear cloud produces a pivot of ~1e-16, and `Math.abs(1e-16) > 0` is true, so it solves.

Order the gates so each reason is reachable: count → coincidence → conditioning → solve → non-finite.

- [ ] **Step 5: Add the refusal tests — every reason, and collinearity at three orientations**

```ts
it("names each refusal reason distinctly", () => {
  expect(solveTps(BENT.slice(0, 2))).toEqual({ ok: false, reason: "too-few-points" });

  const duplicated = [...BENT.slice(0, 3), {
    id: "dup", pixel: { ...BENT[0].pixel }, map: { lat: 45.5, lng: -62.0 },
  }];
  expect(solveTps(duplicated)).toEqual({ ok: false, reason: "coincident-points" });

  // THREE orientations. The 45-degree case refuses even without a conditioning
  // gate, because the arithmetic cancels bit-exactly; the oblique case is the
  // one that escapes a pivot-only check. Measured.
  for (const line of [
    mk([[100,100],[400,400],[900,900]]),
    mk([[100,100],[400,250],[900,500]]),
    mk([[100,300],[500,300],[1200,300]]),
  ]) {
    expect(solveTps(line)).toEqual({ ok: false, reason: "ill-conditioned" });
  }

  // The measured road case: affine refuses it, so TPS must too.
  const road = mk([[100,100],[400,251],[700,399],[1100,602],[1500,798]]);
  expect(solveTps(road)).toEqual({ ok: false, reason: "ill-conditioned" });
});
```

`toEqual` on the whole result object, not `toBeNull()` — it pins the reason as well as the refusal.

- [ ] **Step 6: MUTATION — prove each assertion bites**

Restore **by path** from a backup taken from the CURRENT state after each. Inline the mutation; do not shell out to a shared script (the scratchpad is shared between agents and one has already been clobbered mid-run).

1. Drop the kernel loop from `applyTps`, keeping only the affine tail → the interpolation test must FAIL.
2. Swap `rhsX`/`rhsY` in `solveTps` → interpolation must FAIL. **`tsc -b` will still exit 0** — both are `Float64Array`.
3. Swap `px`/`py` in `applyTps` → must FAIL.
4. **Remove the `conditionRatio` gate** → the oblique-collinear and road cases must FAIL. This is the mutation that matters most; it is the defect a pivot-only check hides.
5. Report `"ill-conditioned"` where `"coincident-points"` is correct → the reason assertion must FAIL.

Paste every failure message.

- [ ] **Step 7: Gate and commit**

```bash
cd web && npx vitest run > /tmp/v.txt 2>&1; echo "VITEST=$?"; npx tsc -b > /tmp/t.txt 2>&1; echo "TSC=$?"; npx eslint src > /tmp/e.txt 2>&1; echo "ESLINT=$?"
```
All three must be `=0`. Then:
```bash
git add web/src/userMaps/transform/conditioning.ts web/src/userMaps/transform/conditioning.test.ts web/src/userMaps/transform/tps.ts web/src/userMaps/transform/tps.test.ts web/src/userMaps/transform/affine.ts web/src/userMaps/testFixtures.ts
git commit -m "feat(web): thin-plate-spline solver sharing the affine conditioning gate"
```

**Note on the conditioning test that was cut.** An earlier draft asserted that the same layout at 10× the pixel coordinates still interpolates exactly, claiming it proved the conditioning step is real. Measured: with conditioning removed entirely the error is **exactly 0.000e+0** at 1× and 10× alike, because at n=5 an unconditioned system has ample double-precision headroom. The conditioning payoff is at **n=500**. If you want that covered, test it at a point count where it can fail — not at five.

---

### Task 2: `buildTpsLatLngMesh` and the measured grid constants

**Files:** Modify `web/src/userMaps/transform/gcpMesh.ts` + `.test.ts`.

**Produces:** `TPS_GRID_SIZE = 64`, `TPS_DRAG_GRID_SIZE = 16`, `buildTpsLatLngMesh(params, pixelSize, gridSize?)`.

Mirror `buildGcpLatLngMesh` (`gcpMesh.ts:26-42`) exactly — same row/col order (row = pixel Y, col = pixel X). Both constants carry their measurement in a comment, including that **`64` is provisional pending a browser profile with `32` as the documented fallback**, and that **error is NOT monotone in gridSize** (measured: 12 beats 16, 24 beats 32), so no assertion may claim denser is always better.

- [ ] **Step 1: Write the failing tests — and assert a NON-ZERO index**

```ts
it("returns a lattice of gridSize+1 by gridSize+1 vertices", () => { /* 5x5 at gridSize 4 */ });

it("spans the raster's real extent — asserted at a non-zero index", () => {
  // mesh[0][0] is (0,0) for ANY pixelSize and for a transposed applyTps(y,x),
  // so it cannot catch a swapped extent. The affine sibling test guards this
  // with mesh[0][1] on a non-square raster; mirror that, do not drop it.
  const result = solveTps(BENT);
  if (!result.ok) throw new Error("fixture must solve");
  const mesh = buildTpsLatLngMesh(result.params, { width: 2000, height: 500 }, 2);
  const atFullWidth = fromMercator(applyTps(result.params, 2000, 0));
  expect(mesh[0][2].lat).toBeCloseTo(atFullWidth.lat, 9);
  expect(mesh[0][2].lng).toBeCloseTo(atFullWidth.lng, 9);
});

it("orders the lattice row = pixel Y, col = pixel X", () => { /* non-square raster */ });
```

- [ ] **Steps 2–5:** run and verify failure; implement; verify; mutate — transpose `pixelSize.width`/`height` in the loop (the non-zero-index test must FAIL), transpose `applyTps(x,y)` (ordering test must FAIL), change `<=` to `<` (lattice-size test must FAIL); gate; commit.

---

### Task 3: method-aware session — **NEW, and Tasks 4, 5, 8 depend on it**

**Files:** Modify `web/src/userMaps/useGeoreferenceSession.ts` + `.test.ts`.

**Consumes:** `solveTps`, `applyTps`, `TpsSolveResult` (Task 1); `buildTpsLatLngMesh`, `TPS_GRID_SIZE` (Task 2); existing `solveAffineFromGcps`, `buildGcpLatLngMesh`, `AFFINE_GRID_SIZE`.

**Produces:** a `method: "affine" | "tps"` option on `useGeoreferenceSession`, defaulting to `"affine"`; `params`/`mesh` derived through the matching solver.

**Read `useGeoreferenceSession.test.ts` first.** The harness is `setup(initialGcps)` with `SessionProps = { mapId, initialGcps }` — **there is no `renderSession`**. Extend the existing harness rather than inventing one.

The affine path must be untouched: `AFFINE_GRID_SIZE = 1` is pixel-exact for an affine warp and raising it would cost draws for nothing.

- [ ] **Step 1: Write the failing tests**

```ts
it("solves with TPS and lattices at TPS_GRID_SIZE when method is tps", () => {
  const { result } = setup(BENT, { method: "tps" });
  expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
});

it("leaves the affine path at gridSize 1", () => {
  const { result } = setup(BENT, { method: "affine" });
  expect(result.current.mesh!.length - 1).toBe(AFFINE_GRID_SIZE);
});

it("actually uses the SPLINE, not an affine fit, when method is tps", () => {
  // The two solvers produce measurably different meshes on a bent fixture
  // (~1 km at interior points, measured). Without this, a session that
  // silently kept solving affine while lattice-ing at 64 would pass the
  // gridSize assertions above.
  const tps = setup(BENT, { method: "tps" }).result.current.mesh!;
  const affineParams = solveAffineFromGcps(BENT)!;
  const affineAt = fromMercator(applyAffine(affineParams, 1000, 900));
  const mid = tps[Math.floor(tps.length / 2)][Math.floor(tps.length / 2)];
  expect(groundMetresBetween(mid, affineAt)).toBeGreaterThan(100);
});
```

The third test is the one that stops this task from being satisfiable by wiring the grid size alone.

- [ ] **Steps 2–5:** run and verify failure; implement (branch on `method` **outside** any setState updater — StrictMode double-invokes them, and `App` always has queued work so React defers them); verify; mutate — make `method: "tps"` still call `solveAffineFromGcps` while lattice-ing at 64 (the third test must FAIL); gate; commit.

---

### Task 4: the `coincident-points` refusal state

**Files:** Modify `useGeoreferenceSession.ts` (the `GeoreferenceStatus` union and `status` memo), `components/georeferenceStatus.ts`; tests in both plus `GeoreferencePanel.test.tsx`.

**Consumes:** `TpsSolveResult`, `TpsRefusal` (Task 1); the `method` option (Task 3).

Today four affine refusals collapse into one `degenerate`, and its message deliberately avoids claiming "collinear". TPS adds one refusal the user can act on *specifically* — two points on the same spot, remedy "move or delete one". That one gets its own state. **Do not split the other three**; they share the remedy "spread your points out", so a finer taxonomy would be one the user cannot act on differently.

Copy proposed for review, not invented silently: `Two points are on the same spot — move or delete one.`

- [ ] **Step 1: Write the failing test — and note the CORRECT baseline**

The baseline failure is **not** `degenerate`. Measured on a 4-point fixture with two coincident points: the affine `condRatio` is **0.7750**, far above `5e-3`, so `solveAffineFromGcps` succeeds and 4 points ≥ `MIN_GCPS_FOR_RESIDUALS`, giving `{ kind: "solved", … }`. Expect that, not `degenerate` — a step that predicts the wrong failure cannot detect its own failure.

- [ ] **Steps 2–5:** implement; verify; mutate — map `"coincident-points"` to `degenerate` (the new test must FAIL); confirm `statusMessage`'s `switch` has no `default`, so `tsc -b` flags the unhandled member; gate; commit.

---

### Task 5: two-tier mesh density during a drag

**Files:** Modify `useGeoreferenceSession.ts`, `components/ScanPane.tsx`, `components/GeoreferenceMapLayer.tsx`, `components/GeoreferencePanel.tsx`, `App.tsx`; tests including `ScanPane.realMount.test.tsx`.

**Produces:** `endDragGcp: (id: string) => void`.

The session has `beginDragGcp` but **no** drag-end signal, and Leaflet's `dragend` is bound nowhere. Bind the real event — do **not** infer drag-end from a timer or from "no move for N ms", which would leave the mesh permanently coarse after a drag that ends without a final move.

**⚠ The transposition hazard, named because it is silent.** `onDragEndGcp` and `onDragStartGcp` are both `(id: string) => void`. Wiring `onDragEndGcp={session.beginDragGcp}` passes `tsc -b` and `eslint`, and session-level tests that call `result.current.endDragGcp("a")` **directly** would still pass — while in the real app every drag leaves the drape permanently at `TPS_DRAG_GRID_SIZE` *and* pushes a second undo snapshot, breaking the one-drag-one-undo property the spec locks.

- [ ] **Required:** at least one assertion must exercise the **wiring**, not the session API. `ScanPane.realMount.test.tsx` already drives a genuine Leaflet drag (real `mousedown`/`mousemove` with `which: 1`, dispatched on the marker icon) and is the only place this seam is observable. Extend it to assert a real `dragend` reaches `onDragEndGcp` and **not** `onDragStartGcp`.

- [ ] **Steps:** failing test → implement → verify → mutate (no-op `endDragGcp`; swap the two grid constants; **transpose `onDragEndGcp` to `beginDragGcp` at the wiring site** — report whether anything catches it) → gate → commit.

---

### Task 6: TPS residuals — LOO magnitudes, affine-ranked suspect

**Read the reconciliation block above first.** This re-introduces an approach deleted in `11780341f`, for one job only, and deliberately does **not** use it for the other.

**Files:** Modify `web/src/userMaps/transform/residuals.ts` + `.test.ts`.

**Consumes:** `solveTps`, `applyTps`, `MIN_GCPS_FOR_TPS` (Task 1); existing `solveAffineFromGcps`, `residualMetresFor`, `rmsMetres`, `groundMetresBetween`.

**Produces:** `MIN_GCPS_FOR_TPS_SUSPECT = 5` (measured — see the facts table), `tpsResidualReport(gcps): ResidualReport | null` returning the **same `ResidualReport` shape** so `GcpList` needs no change.

**The two signals, and why they differ:**
- `metresPerGcp` / `rmsMetres` → **leave-one-out**, in ground metres. The only non-zero signal available. Overstates true error by 1.8×–3.7× and is never optimistic, so it is a conservative upper bound.
- `mostInconsistentIndex` → the **affine fit residual** over the same points. Measured decisively better at finding the outlier (62.9% vs 46.8% at n=8, z = −18.3) and cheaper.

- [ ] **Step 1: Write the failing tests — with an EXTERNALLY KNOWN displacement**

```ts
it("reports NON-ZERO per-point error, unlike the TPS fit residual", () => {
  const report = tpsResidualReport(BENT);
  expect(report).not.toBeNull();
  for (const metres of report!.metresPerGcp) {
    expect(metres).toBeGreaterThan(0);
  }
});

it("reports GROUND metres, not the 1.4396x-inflated Mercator figure", () => {
  // The expected value comes from a displacement WE choose, never from the
  // measured result. An earlier draft asserted `rms < rms * 1.4396 * 0.75`,
  // which reduces to `rms < rms * 1.0797` and is true for any positive value —
  // it would have passed against raw Mercator metres. Mirror the affine guard
  // at residuals.test.ts:51-60 instead.
  const displaced = nudgeEast(BENT, 100);           // exactly 100 ground metres
  const report = tpsResidualReport(displaced)!;
  const worst = Math.max(...report.metresPerGcp);
  expect(worst).toBeCloseTo(100, 0);
  expect(worst).not.toBeCloseTo(143.96, 1);         // the Mercator figure
});

it("brackets the point-count floor", () => {
  // BOTH sides. A single assertion at 3 points cannot distinguish the guard
  // from its absence: with `< MIN_GCPS_FOR_TPS` the loop still runs, the inner
  // solveTps on 2 points refuses, and the function returns null anyway.
  expect(tpsResidualReport(BENT.slice(0, 3))).toBeNull();
  expect(tpsResidualReport(BENT.slice(0, 4))).not.toBeNull();
});

it("ranks the suspect by the AFFINE fit residual, not by the LOO magnitude", () => {
  // Measured: a spline absorbs an outlier into its own shape, corrupting its
  // neighbours' LOO scores. Construct a fixture where the two signals disagree
  // and pin which one wins.
  const report = tpsResidualReport(OUTLIER_FIXTURE)!;
  const affineRanked = argmax(residualMetresFor(solveAffineFromGcps(OUTLIER_FIXTURE)!, OUTLIER_FIXTURE));
  expect(report.mostInconsistentIndex).toBe(affineRanked);
  expect(report.mostInconsistentIndex).not.toBe(argmax(report.metresPerGcp));
});
```

The last test needs a fixture where the two rankings genuinely disagree. **Find one by measurement**, not by assumption — if you cannot construct one, say so and report it rather than weakening the assertion.

- [ ] **Step 2: Decide and implement the cost cap, and state your choice**

Measured: LOO is *n* solves and a single solve is O(n³) — 0.021 ms at n=30, 0.462 at n=100, **10.34 at n=300**, **56.15 at n=500**. So LOO at n=300 is ~3.1 s, far past interactive, and `residualReport` is called from a `useMemo` on every pointer move.

Pick one and justify it: skip LOO above a threshold and report RMS only; compute LOO on pointer-up only; or refuse the suspect highlight above a cap. **Test the boundary from both sides.**

- [ ] **Steps 3–5:** verify; mutate — replace the LOO body with `applyTps` against a **full-set** solve (the non-zero test must FAIL; note the earlier draft's mutation used `residualMetresFor`, which takes `AffineParams` and would not typecheck); return raw Mercator magnitudes (the ground-metres test must FAIL); rank by LOO instead of affine (the ranking test must FAIL); gate; commit.

---

### Task 7: `saveGcps` preserves `method`

**Files:** Modify `useUserMaps.ts` (`saveGcps`, ~line 443) + `useUserMaps.test.ts`.

`saveGcps` builds `method: "affine"` as a **literal** and runs from the debounced write on every drag, so a TPS map silently reverts on the next pointer move — invisible to `tsc -b` (a valid union member) and to every existing test (none asserts the persisted `method`).

Preserve the existing record's method rather than adding a parameter; `saveGcps(id, gcps)` is called from the debounce and the session does not own the method. Guard `existing.georef.kind !== "gcp"`. Keep the "built OUTSIDE the updater" comment and behaviour — that is load-bearing.

- [ ] **Steps:** failing test asserting the **persisted record**, not the call → implement → verify → mutate (restore the literal; then hardcode `"tps"` instead and confirm an affine map still saves as affine — a fix that flips the constant passes the new test and breaks everything else) → gate → commit.

---

### Task 8: the TPS toggle

**Files:** `GeoreferencePanel.tsx`, `useGeoreferenceSession.ts`, `useUserMaps.ts` + tests.

Spec: *"At 4+ points a TPS toggle appears."* Below that it is **absent**, not disabled-and-present. The gate is therefore `MIN_GCPS_FOR_TPS + 1`, and **Task 10 must use the same expression** — an earlier draft had the export button at `MIN_GCPS_FOR_TPS` (3), one point out of step with the toggle.

Follow FU4's accessibility pattern: state conveyed visually needs a text carrier; `.visually-hidden` already exists.

Copy proposed for review: label `Curved warp (TPS)`; helper text `Passes exactly through every point. Better for hand-drawn maps that don't sit flat.` Accuracy copy must present the LOO figure as an **upper bound**, since it is measured to overstate by 1.8×–3.7×.

- [ ] **Mutation that must be run:** point the toggle's `onChange` at the opposite method value. Both are valid union members, so `tsc -b` exits 0. Report whether the test catches it.

---

### Task 9: Allmaps annotation serializer

**Files:** Create `web/src/userMaps/allmaps/annotation.ts` + `.test.ts`.

**Produces:** `georeferenceAnnotation(record: UserMapRecord): object | null` — `null` when `record.georef.kind !== "gcp"`.

Four things a hand-written serializer must get right, all verified:
1. `transformation` goes on the **body FeatureCollection**, not the annotation root.
2. TPS is `"thinPlateSpline"` with **no** `options`; affine is `{"type":"polynomial","options":{"order":1}}`.
3. `properties.resourceCoords` is `[x, y]`; `geometry.coordinates` is `[lon, lat]`. **Opposite orders**, both number pairs, so a transposition survives `tsc -b`.
4. `target` is `urn:uuid:<record.id>`, `type: "Canvas"`, with the **ORIGINAL** `record.pixelSize`.

Fixtures must make transposition impossible to pass: lng negative and lat positive, pixel `x ≠ y`, and `width ≠ height`.

- [ ] **Mutations:** swap `[lon, lat]` → must FAIL; move `transformation` to the root → must FAIL; emit `"tps"` instead of `"thinPlateSpline"` → must FAIL; use preview dimensions → must FAIL.

---

### Task 10: export control

**Files:** `GeoreferencePanel.tsx` + tests.

Download as `<record.name>.georef.json` via an object URL, and **revoke it** — follow `useUserMaps`' existing revoke convention. Visible on the **same** gate as the toggle (`MIN_GCPS_FOR_TPS + 1`).

Assert the **effect**: the serialized payload handed to the blob equals `georeferenceAnnotation(record)`, not merely that a handler fired.

---

### Task 11: batched Minor fixes and documentation

Fix the Minor findings recorded in `.superpowers/sdd/pr3-progress.md`. **M5 is must-fix, not polish:** `userMapStore.ts:150-158` claims an orphan record is "permanent" and that "the layer row can never be enabled" — both factually wrong (`UserMapRows` renders a `Remove` button for every record, and a `kind:"embedded"` orphan's checkbox toggles fine and simply draws nothing). It reads as a stronger safety guarantee than the code provides. Also correct `GeoreferencePanel.tsx:329-345`, inaccurate as written.

**Documentation** — required by the project's `CLAUDE.md`, not optional: `README.md` (web feature list gains TPS + Allmaps export), `ARCHITECTURE.md` (`userMaps` gains `transform/tps.ts`, `transform/conditioning.ts`, `allmaps/`), `plan.md` (tick PR 3 items).

---

## Revision record

**Revised 2026-07-26 after an adversarial plan review, before any code was written.** The review returned 4 Critical, 4 Important and 5 Minor; the most consequential was reproduced independently before acting on it. What changed:

- **A missing conditioning gate (Critical).** `solveTps` had no equivalent of `solveAffine`'s `MIN_CONDITION_RATIO`, so five points along a road — refused by affine at `condRatio 2.166e-3` — produced a confident drape where a 1-px nudge moved a corner 12.2 km. `conditionRatio` is now extracted and shared. The original collinear fixture *hid* this: at 45° the arithmetic cancels bit-exactly, so it refused; rotated oblique the same degenerate line solves. Now tested at three orientations.
- **A tautological assertion (Critical).** `expect(rms).toBeLessThan(rms * 1.4396 * 0.75)` reduces to `rms < rms * 1.0797` — true for any positive value, and it would have passed against raw Mercator metres while the plan claimed a mutation would catch it. Replaced with an externally-known displacement, mirroring the affine guard.
- **An unassigned dependency (Critical).** Two tasks assumed a method-aware session that no task built. Task 3 is new; the graph is renumbered.
- **An unrepresentable refusal reason (Critical).** `TpsParams | null` could not carry *why* a solve failed, but a later task had to distinguish coincident points. `solveTps` now returns a discriminated union.
- **Four Important fixes:** a null-boundary assertion that could not fail (now bracketed from both sides); a stated expected-failure that was simply wrong (`solved`, not `degenerate` — `condRatio 0.7750`); a mesh assertion at `mesh[0][0]`, which is `(0,0)` for any `pixelSize` (now at a non-zero index, restoring a guard the affine sibling has); and the `onDragEndGcp`/`onDragStartGcp` transposition, now requiring a real-mount wiring assertion.
- **Minors:** undefined fixtures and a non-existent test harness named (`setup`, not `renderSession`); an off-by-one between the toggle and export gates; a mutation that would not typecheck; and a conditioning-test rationale that measurement disproved.

**Also revised from measurement, not from review:** the suspect highlight ranks by the **affine fit residual** rather than TPS leave-one-out — measured 62.9% vs 46.8% at n=8 (z = −18.3), and cheaper. LOO keeps the magnitude job, shipped as a conservative upper bound.

**Second review pass not obtained.** A Codex pass was dispatched and ran ~58 minutes without producing findings; it read the plan and supporting files, then stalled without emitting a structured report. Nothing was inferred from its partial trace. The findings above are from a single independent pass plus direct reproduction.
