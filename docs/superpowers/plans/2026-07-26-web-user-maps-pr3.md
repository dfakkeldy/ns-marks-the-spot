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

## ⚠ The affine solver is hardcoded in THREE places, not one

Found by the second review pass and by verifying it. The session is the
*obvious* consumer; it is not the only one, and the other two are what make the
feature actually work end to end.

| Site | What it decides | Consequence if left affine |
|---|---|---|
| `useGeoreferenceSession.ts:388-392` | the **live** drape while the panel is open | The panel shows TPS; nothing else does. |
| `recordMesh.ts:27` (`meshForRecord`) | the drape for every **saved** map — called from `UserMapLayers.tsx:133` | Edit a bent record as TPS, click Done, enable it: **the drape snaps back to affine.** Every task test stays green. |
| `useUserMaps.ts:57` (`needsGeoreferencing`) | whether a record is admitted to `visibleMaps` **at all** | A record whose points give a squashed affine but a fine spline is excluded from the layer list and badged "Needs georeferencing", so the user can never turn it on. |

**This is the non-functional-but-green category.** A plan that changed only the
session would ship a TPS toggle that works inside the panel and nowhere else.
Task 3 owns all three.

---

## File structure

| File | Responsibility |
|---|---|
| `web/src/userMaps/transform/conditioning.ts` | **Create.** `conditionRatio` extracted from `affine.ts` so both solvers share ONE gate. Two copies of a numerical threshold is how they drift. |
| `web/src/userMaps/transform/tps.ts` | **Create.** Pure TPS solve + apply, returning a discriminated result carrying the refusal *reason*. |
| `web/src/userMaps/transform/gcpMesh.ts` | **Modify.** `buildTpsLatLngMesh` + the two measured grid constants. |
| `web/src/userMaps/transform/residuals.ts` | **Modify.** `tpsResidualReport` — LOO magnitudes, affine-ranked suspect. |
| `web/src/userMaps/useGeoreferenceSession.ts` | **Modify.** `method` option, method-aware solve, new refusal state, drag-aware density. |
| `web/src/userMaps/recordMesh.ts` | **Modify.** Method-aware `meshForRecord`. **Was missing from the first draft.** |
| `web/src/userMaps/useUserMaps.ts` | **Modify.** Method-aware `needsGeoreferencing`; `saveGcps` preserves `method`; a method setter. |
| `web/src/userMaps/components/GeoreferencePanel.tsx` | **Modify.** TPS toggle, export control. |
| `web/src/userMaps/allmaps/annotation.ts` | **Create.** Pure serializer; a `.ts` file, so plain function exports are legal. |
| `web/src/userMaps/testFixtures.ts` | **Create.** `BENT`, `OUTLIER_FIXTURE`, `gcpRecord`, `argmax`, `nudgeGcpEast` — Task 1 owns it. |
| `README.md`, `ARCHITECTURE.md`, `plan.md` | **Modify.** Final task. |

---

## Task list

Eleven tasks. **Corrected twice**: once for an unassigned session dependency and an
unrepresentable refusal reason, once for two affine-hardcoded render paths the
first draft never touched.

| # | Task | Produces |
|---|---|---|
| 1 | Shared `conditionRatio` + TPS solver with typed refusals + shared fixtures | `conditionRatio`, `solveTps`, `applyTps`, `TpsSolveResult`, fixtures |
| 2 | `buildTpsLatLngMesh` + measured grid constants | `TPS_GRID_SIZE`, `TPS_DRAG_GRID_SIZE`, `buildTpsLatLngMesh` |
| 3 | **Method-aware solve in ALL THREE sites** | `method` option; method-aware `meshForRecord`, `needsGeoreferencing` |
| 4 | The `coincident-points` refusal state | new `GeoreferenceStatus` member |
| 5 | Two-tier mesh density during a drag | `endDragGcp` + wiring on **both** panes |
| 6 | TPS residuals: LOO magnitudes, affine-ranked suspect | `tpsResidualReport`, `MIN_GCPS_FOR_TPS_SUSPECT` |
| 7 | `saveGcps` preserves `method` | — |
| 8 | The TPS toggle + method persistence | `setGeorefMethod` on `UserMapsApi` |
| 9 | Allmaps annotation serializer | `georeferenceAnnotation` |
| 10 | Export control | — |
| 11 | Batched Minor fixes + docs | — |

**Dependencies:** 1 → 2, 4, 6. 2 → 3. 3 → 5, 8. 1 → 9. 9 → 10. 7 → 8. All → 11.

---

### Task 1: shared conditioning gate, TPS solver with typed refusals, shared fixtures

**Files:** create `transform/conditioning.ts` + test, `transform/tps.ts` + test, `testFixtures.ts`; modify `transform/affine.ts`.

**Produces:**
```ts
// conditioning.ts — takes PIXEL POINTS, not Gcps and not pairs.
// affine.ts's gate lives inside solveAffine(pairs: {src; dst}[]) (affine.ts:92,136),
// so a Gcp[] signature could not be called from there. Points are the common
// denominator: affine passes pairs.map(p => p.src), tps passes gcps.map(g => g.pixel).
export function conditionRatio(points: ReadonlyArray<{ x: number; y: number }>): number;

// tps.ts
export const MIN_GCPS_FOR_TPS = 3;
export const MIN_TPS_SEPARATION = 1e-6;
export type TpsParams = { /* opaque */ };
export type TpsRefusal = "too-few-points" | "coincident-points" | "ill-conditioned" | "non-finite";
export type TpsSolveResult = { ok: true; params: TpsParams } | { ok: false; reason: TpsRefusal };
export function solveTps(gcps: Gcp[]): TpsSolveResult;
export function applyTps(params: TpsParams, x: number, y: number): MercatorPoint;

// testFixtures.ts — every fixture the later tasks reference. NOTHING is left
// to an implementer to invent, and none of these names collides with an
// existing module-private helper (residuals.test.ts:30 already has a
// `nudgeEast` taking ONE Gcp — hence the different name here).
export const BENT: Gcp[];                    // irregular, NOT a lattice
export const OUTLIER_FIXTURE: Gcp[];         // affine-rank and LOO-rank disagree
export function gcpRecord(overrides?: Partial<UserMapRecord>): UserMapRecord;
export function argmax(values: number[]): number;
export function nudgeGcpEast(gcps: Gcp[], index: number, metres: number): Gcp[];
```

`nudgeGcpEast` moves **one** point by a known ground distance and returns a new
array. Translating the whole array moves every point together, so the LOO error
would not be an externally known 100 m — that is the trap the signature avoids.

- [ ] **Step 1: Extract `conditionRatio` behind a characterisation test**

Pin current behaviour first, so the extraction cannot change it:

```ts
it("scores a healthy scattered cloud above the refusal threshold", () => {
  expect(conditionRatio(BENT.map((g) => g.pixel))).toBeGreaterThan(0.3);
});

it("scores a road with 2px scatter BELOW the threshold", () => {
  // Measured: affine refuses this at 2.166e-3 while an unconditioned TPS
  // accepts it, and a 1px nudge then moves a drape corner 12.2 km.
  const road = [[100,100],[400,251],[700,399],[1100,602],[1500,798]].map(([x,y]) => ({x,y}));
  expect(conditionRatio(road)).toBeCloseTo(2.166e-3, 5);
  expect(conditionRatio(road)).toBeLessThan(MIN_CONDITION_RATIO);
});

it("scores an exactly collinear cloud at zero, at THREE orientations", () => {
  // One angle is not enough. At 45 degrees xs[i] and ys[i] are bit-identical,
  // the arithmetic cancels exactly, and a pivot-only check refuses by luck.
  // The OBLIQUE case is the one that escapes it. Measured.
  const line = (pts) => conditionRatio(pts.map(([x,y]) => ({x,y})));
  expect(line([[100,100],[400,400],[900,900]])).toBe(0);   // 45 deg
  expect(line([[100,100],[400,250],[900,500]])).toBe(0);   // oblique
  expect(line([[100,300],[500,300],[1200,300]])).toBe(0);  // horizontal
});
```

Run the **whole existing `affine.test.ts`** before and after. Identical results, or the extraction changed behaviour — revert and report.

- [ ] **Step 2: Failing TPS interpolation test**

```ts
it("passes EXACTLY through every control point — the defining property", () => {
  const result = solveTps(BENT);
  expect(result).toEqual({ ok: true, params: expect.anything() });
  if (!result.ok) return;
  for (const gcp of BENT) {
    const got = applyTps(result.params, gcp.pixel.x, gcp.pixel.y);
    const want = toMercator(gcp.map);
    expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-6);
  }
});
```

`BENT` must be **irregular**: a lattice is nearly affine by construction — measured on the real Church graticule sets, where TPS scored no better than affine at held-out check points — so it cannot distinguish a working spline from a working affine.

- [ ] **Step 3: Run — expect `Failed to resolve import "./tps"`.** Any other failure means the test is wrong; stop and report.

- [ ] **Step 4: Implement.** Kernel `U(r) = r²·log r`, `U(0)=0`, affine tail, `(n+3)×(n+3)` system, Gaussian elimination with partial pivoting over a `Float64Array`, x and y solved separately.

Conditioning is required in both senses. **Numerically:** centre sources on their centroid, scale to unit RMS, subtract the destination centroid — measured, this is what keeps the interpolation residual at 5.11e-11 m in centred space, and without it an n=500 system at Mercator magnitudes is not reliably solvable. **As a refusal:** reject `conditionRatio(gcps.map(g => g.pixel)) < MIN_CONDITION_RATIO` with `reason: "ill-conditioned"`. **Do not rely on the pivot check** — measured, an oblique collinear cloud gives a pivot of ~1e-16 and `Math.abs(1e-16) > 0` is true.

Gate order so every reason is reachable: count → coincidence → conditioning → solve → non-finite.

- [ ] **Step 5: Test EVERY refusal reason, including the two the first draft omitted**

```ts
it("names each refusal reason distinctly", () => {
  expect(solveTps(BENT.slice(0, 2))).toEqual({ ok: false, reason: "too-few-points" });

  expect(solveTps([...BENT.slice(0, 3), {
    id: "dup", pixel: { ...BENT[0].pixel }, map: { lat: 45.5, lng: -62.0 },
  }])).toEqual({ ok: false, reason: "coincident-points" });

  const line = (pts) => solveTps(pts.map(([x,y],i) => ({
    id: `l${i}`, pixel: {x,y}, map: { lat: 46 + y/20000, lng: -61 + x/20000 },
  })));
  for (const pts of [
    [[100,100],[400,400],[900,900]],
    [[100,100],[400,250],[900,500]],
    [[100,300],[500,300],[1200,300]],
  ]) {
    expect(line(pts)).toEqual({ ok: false, reason: "ill-conditioned" });
  }
  expect(line([[100,100],[400,251],[700,399],[1100,602],[1500,798]]))
    .toEqual({ ok: false, reason: "ill-conditioned" });
});

it("refuses a non-finite destination rather than returning unusable params", () => {
  // affine.ts:158 guards this explicitly; TPS must too. A healthy source
  // triangle with one NaN destination otherwise solves to garbage.
  const poisoned = [...BENT.slice(0, 3)];
  poisoned[1] = { ...poisoned[1], map: { lat: Number.NaN, lng: poisoned[1].map.lng } };
  expect(solveTps(poisoned)).toEqual({ ok: false, reason: "non-finite" });
});

it("refuses a collapsed DESTINATION even when the scan points are healthy", () => {
  // Three well-spread scan points mapped down one meridian. The source cloud
  // is fine, so the conditioning gate passes; without a destination check this
  // solves to a zero-area drape. affine.ts refuses it via MIN_ANISOTROPY_RATIO.
  const meridian: Gcp[] = [
    { id: "a", pixel: { x: 100, y: 100 }, map: { lat: 46.0, lng: -61.0 } },
    { id: "b", pixel: { x: 900, y: 150 }, map: { lat: 46.2, lng: -61.0 } },
    { id: "c", pixel: { x: 400, y: 800 }, map: { lat: 46.4, lng: -61.0 } },
  ];
  const result = solveTps(meridian);
  expect(result.ok).toBe(false);
});
```

`toEqual` on the whole result, never `toBeNull()` — it pins the reason as well as the refusal.

- [ ] **Step 6: MUTATION.** Restore **by path** from a backup taken from the CURRENT state after each; inline the mutation (the scratchpad is shared and has already been clobbered mid-run).

1. Drop the kernel loop from `applyTps` → interpolation FAILS.
2. Swap `rhsX`/`rhsY` → interpolation FAILS. **`tsc -b` still exits 0** (both `Float64Array`).
3. Swap `px`/`py` in `applyTps` → FAILS.
4. **Remove the `conditionRatio` gate** → oblique-collinear and road cases FAIL. The most important one: it is the defect a pivot-only check hides.
5. Report `"ill-conditioned"` where `"coincident-points"` is correct → reason assertion FAILS.
6. Drop the non-finite check → the NaN test FAILS.

Paste every failure message.

- [ ] **Step 7: Gate and commit.** `npx vitest run`, `npx tsc -b`, `npx eslint src`, each with `$?` captured from a redirected file — never through a pipe.

**Cut deliberately:** an earlier draft asserted the same layout at 10× pixels still interpolates, claiming it proved conditioning is real. Measured: with conditioning removed the error is **exactly 0.000e+0** at both scales, because n=5 has ample headroom. The payoff is at n=500. Test it there or not at all.

---

### Task 2: `buildTpsLatLngMesh` and the measured grid constants

**Files:** modify `transform/gcpMesh.ts` + test.
**Produces:** `TPS_GRID_SIZE = 64`, `TPS_DRAG_GRID_SIZE = 16`, `buildTpsLatLngMesh(params, pixelSize, gridSize?)`.

Mirror `buildGcpLatLngMesh` (`gcpMesh.ts:26-42`): row = pixel Y, col = pixel X. Both constants carry their measurement, including that **64 is provisional** pending a browser profile (fallback 32) and that **error is not monotone in gridSize** (measured: 12 beats 16, 24 beats 32) so no assertion may claim denser is always better.

- [ ] **Step 1: Write all three tests IN FULL.** No placeholders.

```ts
const solved = () => { const r = solveTps(BENT); if (!r.ok) throw new Error("fixture must solve"); return r.params; };

it("returns a lattice of gridSize+1 by gridSize+1 vertices", () => {
  const mesh = buildTpsLatLngMesh(solved(), { width: 2000, height: 1700 }, 4);
  expect(mesh).toHaveLength(5);
  for (const row of mesh) {
    expect(row).toHaveLength(5);          // EVERY row, not just mesh[0]
  }
});

it("spans the raster's real extent — asserted at a NON-ZERO index", () => {
  // mesh[0][0] is (0,0) for ANY pixelSize and for a transposed applyTps(y,x),
  // so it cannot catch a swapped extent. The affine sibling guards this with
  // mesh[0][1] on a non-square raster; do not drop that guard while mirroring.
  const params = solved();
  const mesh = buildTpsLatLngMesh(params, { width: 2000, height: 500 }, 2);
  const atFullWidth = fromMercator(applyTps(params, 2000, 0));
  const atFullHeight = fromMercator(applyTps(params, 0, 500));
  expect(mesh[0][2].lat).toBeCloseTo(atFullWidth.lat, 9);
  expect(mesh[0][2].lng).toBeCloseTo(atFullWidth.lng, 9);
  expect(mesh[2][0].lat).toBeCloseTo(atFullHeight.lat, 9);
  expect(mesh[2][0].lng).toBeCloseTo(atFullHeight.lng, 9);
});

it("orders the lattice row = pixel Y, col = pixel X", () => {
  const params = solved();
  const mesh = buildTpsLatLngMesh(params, { width: 2000, height: 500 }, 2);
  expect(Math.abs(mesh[0][1].lng - mesh[0][0].lng))
    .toBeGreaterThan(Math.abs(mesh[0][1].lat - mesh[0][0].lat));
  expect(Math.abs(mesh[1][0].lat - mesh[0][0].lat))
    .toBeGreaterThan(Math.abs(mesh[1][0].lng - mesh[0][0].lng));
});
```

Asserting **every** row's length matters: returning only the top row while preserving `mesh[0][2]` would otherwise leave the extent assertion green with no vertical cells rendered.

- [ ] **Steps 2–5:** run and verify failure; implement; verify; mutate — transpose `pixelSize.width`/`height` (the non-zero-index test FAILS), transpose `applyTps(x,y)` (ordering FAILS), `<=` → `<` (lattice-size FAILS), return only the first row (lattice-size FAILS); gate; commit.

---

### Task 3: method-aware solve in ALL THREE sites — **the task that makes the feature real**

**Files:** modify `useGeoreferenceSession.ts`, `recordMesh.ts`, `useUserMaps.ts` + their tests.

**Consumes:** `solveTps`, `applyTps`, `TpsSolveResult` (Task 1); `buildTpsLatLngMesh`, `TPS_GRID_SIZE` (Task 2); existing `solveAffineFromGcps`, `buildGcpLatLngMesh`, `AFFINE_GRID_SIZE`.

**Produces:** a `method` option on `useGeoreferenceSession` defaulting to `"affine"`; method-aware `meshForRecord`; method-aware `needsGeoreferencing`.

**Read `useGeoreferenceSession.test.ts` first.** The harness is `setup(initialGcps)` with `SessionProps = { mapId, initialGcps }` and **`PIXEL_SIZE = { width: 1200, height: 800 }` at line 11** — there is no `renderSession`. Extend the existing harness.

The affine path must not change: `AFFINE_GRID_SIZE = 1` is pixel-exact for an affine warp.

- [ ] **Step 1: Write the failing tests — and get the fixture pixel RIGHT**

```ts
it("solves with TPS and lattices at TPS_GRID_SIZE when method is tps", () => {
  const { result } = setup(BENT, { method: "tps" });
  expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
});

it("leaves the affine path at gridSize 1", () => {
  const { result } = setup(BENT, { method: "affine" });
  expect(result.current.mesh!.length - 1).toBe(AFFINE_GRID_SIZE);
});

it("actually uses the SPLINE, not an affine fit lattice-d at 64", () => {
  // Compare the two solvers AT THE SAME PIXEL. An earlier draft compared the
  // mesh midpoint against affine evaluated at (1000, 900) while the harness
  // raster is 1200x800 — so the midpoint is (600, 400) and the assertion
  // compared two DIFFERENT points. It passed whether or not TPS was used.
  const { result } = setup(BENT, { method: "tps" });
  const mesh = result.current.mesh!;
  const mid = mesh.length >> 1;                                  // row index
  const pixelX = (PIXEL_SIZE.width * mid) / (mesh.length - 1);
  const pixelY = (PIXEL_SIZE.height * mid) / (mesh.length - 1);
  const affineAt = fromMercator(applyAffine(solveAffineFromGcps(BENT)!, pixelX, pixelY));
  expect(groundMetresBetween(mesh[mid][mid], affineAt)).toBeGreaterThan(100);
});

it("draws a SAVED tps record through the spline too", () => {
  // recordMesh.ts is what UserMapLayers actually calls (UserMapLayers.tsx:133).
  // Without this, the panel shows TPS and the saved layer snaps back to affine
  // the moment the user clicks Done — with every other test still green.
  const record = gcpRecord({ georef: { kind: "gcp", gcps: BENT, method: "tps" } });
  const mesh = meshForRecord(record)!;
  expect(mesh.length - 1).toBe(TPS_GRID_SIZE);
  const affineMesh = meshForRecord(gcpRecord({
    georef: { kind: "gcp", gcps: BENT, method: "affine" },
  }))!;
  expect(affineMesh.length - 1).toBe(AFFINE_GRID_SIZE);
});

it("does not badge a tps-solvable record as needing georeferencing", () => {
  // needsGeoreferencing (useUserMaps.ts:57) gates admission to visibleMaps.
  // Affine refuses a transform squashed past MIN_ANISOTROPY_RATIO; TPS has no
  // such concept, so an affine-only check would exclude a record whose spline
  // is fine and the user could never switch it on.
  const record = gcpRecord({ georef: { kind: "gcp", gcps: BENT, method: "tps" } });
  expect(needsGeoreferencing(record)).toBe(false);
});
```

The third test is what stops this task being satisfiable by wiring the grid size alone; the fourth and fifth are what stop it being satisfiable inside the panel only.

- [ ] **Steps 2–5:** run and verify failure; implement (branch on `method` **outside** every setState updater — StrictMode double-invokes them and `App` always has queued work, so React defers them); verify; mutate — make `method: "tps"` still call `solveAffineFromGcps` while lattice-ing at 64 (third test FAILS); leave `meshForRecord` affine-only (fourth FAILS); leave `needsGeoreferencing` affine-only (fifth FAILS); gate; commit.

---

### Task 4: the `coincident-points` refusal state

**Files:** `useGeoreferenceSession.ts`, `components/georeferenceStatus.ts` + tests.
**Consumes:** `TpsRefusal` (Task 1), the `method` option (Task 3).

Four affine refusals collapse into one `degenerate`, whose message deliberately avoids claiming "collinear". TPS adds one the user can act on *specifically* — two points on the same spot, remedy "move or delete one". **Do not split the other three**; they share the remedy "spread your points out".

Copy proposed for review: `Two points are on the same spot — move or delete one.`

- [ ] **Step 1:** The baseline failure is **not** `degenerate`. Measured on a 4-point fixture with two coincident points, the affine `condRatio` is **0.7750**, far above `5e-3`, so the affine solve succeeds and 4 ≥ `MIN_GCPS_FOR_RESIDUALS` — the status is `{ kind: "solved", … }`. Expect that; a step predicting the wrong failure cannot detect its own failure.

- [ ] **Steps 2–5:** implement; verify; mutate — map `"coincident-points"` to `degenerate` (new test FAILS); confirm `statusMessage`'s `switch` has no `default` so `tsc -b` flags the unhandled member; gate; commit.

---

### Task 5: two-tier mesh density during a drag

**Files:** `useGeoreferenceSession.ts`, `components/ScanPane.tsx`, `components/GeoreferenceMapLayer.tsx`, `components/GeoreferencePanel.tsx`, `App.tsx` + tests including `ScanPane.realMount.test.tsx`.
**Produces:** `endDragGcp: (id: string) => void`.

Bind Leaflet's real `dragend`. Do **not** infer drag-end from a timer or from "no move for N ms" — a drag ending without a final move would leave the mesh permanently coarse.

**⚠ Two wiring hazards, both silent.**
1. `onDragEndGcp` and `onDragStartGcp` are both `(id: string) => void`, so `onDragEndGcp={session.beginDragGcp}` passes `tsc -b` and `eslint` — and session tests calling `result.current.endDragGcp("a")` **directly** still pass, while every real drag leaves the drape coarse *and* pushes a second undo snapshot.
2. **There are TWO panes.** `ScanPane.tsx:98-111` and `GeoreferenceMapLayer.tsx:71-80` have separate handler objects and separate `App.tsx:864` bindings. Wiring one and not the other means releasing a marker on *that* pane misbehaves while all scan-side tests pass.

- [ ] **Required:** wiring assertions for **both** panes, exercising the real event rather than the session API. `ScanPane.realMount.test.tsx` already drives a genuine Leaflet drag; `GeoreferenceMapLayer.realMount.test.tsx` is the map-side equivalent. Assert `dragend` reaches `onDragEndGcp` and **not** `onDragStartGcp`, on each.

- [ ] **Steps:** failing tests → implement → verify → mutate (no-op `endDragGcp`; swap the two grid constants; **transpose `onDragEndGcp` to `beginDragGcp` at each wiring site in turn** — report whether anything catches each) → gate → commit.

---

### Task 6: TPS residuals — LOO magnitudes, affine-ranked suspect

**Read the reconciliation block above first.** This re-introduces an approach deleted in `11780341f`, for one job only, and deliberately not for the other.

**Files:** `transform/residuals.ts` + test.
**Consumes:** `solveTps`, `applyTps`, `MIN_GCPS_FOR_TPS`, and `BENT` / `OUTLIER_FIXTURE` / `argmax` / `nudgeGcpEast` (Task 1); existing `solveAffineFromGcps`, `residualMetresFor`, `rmsMetres`, `groundMetresBetween`.
**Produces:** `MIN_GCPS_FOR_TPS_SUSPECT = 5` (measured), `tpsResidualReport(gcps): ResidualReport | null` returning the **same `ResidualReport` shape**, so `GcpList` needs no change.

- `metresPerGcp` / `rmsMetres` → **leave-one-out**, ground metres. The only non-zero signal; overstates true error 1.8×–3.7× and is never optimistic, so it is a conservative upper bound.
- `mostInconsistentIndex` → the **affine fit residual**. Measured decisively better (62.9% vs 46.8% at n=8, z = −18.3) and cheaper.

- [ ] **Step 1: Failing tests — with an EXTERNALLY KNOWN displacement and no `undefined` escape**

```ts
it("reports one NON-ZERO error per point, unlike the TPS fit residual", () => {
  const report = tpsResidualReport(BENT);
  expect(report).not.toBeNull();
  // Length pinned: an empty array would satisfy a bare for-loop, and GcpList
  // indexes metresPerGcp for every row (GcpList.tsx:111) — it would render NaN.
  expect(report!.metresPerGcp).toHaveLength(BENT.length);
  for (const metres of report!.metresPerGcp) {
    expect(metres).toBeGreaterThan(0);
  }
});

it("reports GROUND metres, not the 1.4396x-inflated Mercator figure", () => {
  // The expected value comes from a displacement WE choose. An earlier draft
  // asserted `rms < rms * 1.4396 * 0.75`, i.e. `rms < rms * 1.0797` — true for
  // any positive value, so it passed against raw Mercator metres.
  const displaced = nudgeGcpEast(BENT, 2, 100);       // ONE point, 100 ground m
  const worst = Math.max(...tpsResidualReport(displaced)!.metresPerGcp);
  expect(worst).toBeCloseTo(100, 0);
  expect(worst).not.toBeCloseTo(143.96, 1);           // the Mercator figure
});

it("brackets the point-count floor from BOTH sides", () => {
  // A single assertion at 3 points cannot distinguish the guard from its
  // absence: with `< MIN_GCPS_FOR_TPS` the loop still runs, the inner solve on
  // 2 points refuses, and the function returns null anyway.
  expect(tpsResidualReport(BENT.slice(0, 3))).toBeNull();
  // `.not.toBeNull()` would accept `undefined`; assert the shape instead.
  expect(tpsResidualReport(BENT.slice(0, 4))!.metresPerGcp).toHaveLength(4);
});

it("ranks the suspect by the AFFINE fit residual, not by the LOO magnitude", () => {
  const report = tpsResidualReport(OUTLIER_FIXTURE)!;
  const affineRanked = argmax(
    residualMetresFor(solveAffineFromGcps(OUTLIER_FIXTURE)!, OUTLIER_FIXTURE),
  );
  expect(report.mostInconsistentIndex).toBe(affineRanked);
  expect(report.mostInconsistentIndex).not.toBe(argmax(report.metresPerGcp));
});
```

`OUTLIER_FIXTURE` must be one where the two rankings genuinely disagree. **Find it by measurement** (Task 1 owns it); if no such fixture exists, report that rather than weakening the assertion.

- [ ] **Step 2: Decide the cost cap and state your choice.** Measured: LOO is *n* solves, each O(n³) — 0.021 ms at n=30, 0.462 at n=100, **10.34 at n=300**, **56.15 at n=500**, so LOO at n=300 is ~3.1 s while `residualReport` runs from a `useMemo` on every pointer move. Skip LOO above a threshold and report RMS only, compute on pointer-up only, or refuse the suspect above a cap. **Test the boundary from both sides, and never return an empty `metresPerGcp` — return `null` or a full array.**

- [ ] **Steps 3–5:** verify; mutate — replace the LOO body with `applyTps` against a **full-set** solve (non-zero test FAILS; note `residualMetresFor` takes `AffineParams` and would not typecheck here); return raw Mercator magnitudes (ground-metres FAILS); rank by LOO (ranking FAILS); return `undefined` at 4 points (boundary FAILS); gate; commit.

---

### Task 7: `saveGcps` preserves `method`

**Files:** `useUserMaps.ts` (~line 443) + test.

`saveGcps` builds `method: "affine"` as a **literal** and runs from the debounced write on every drag, so a TPS map silently reverts on the next pointer move — invisible to `tsc -b` and to every existing test.

Preserve the existing record's method; guard `existing.georef.kind !== "gcp"`. Keep the "built OUTSIDE the updater" comment and behaviour — load-bearing.

- [ ] **Steps:** failing test asserting the **persisted record** → implement → verify → mutate (restore the literal; then hardcode `"tps"` and confirm an affine map still saves as affine — a fix that flips the constant passes the new test and breaks everything else) → gate → commit.

---

### Task 8: the TPS toggle **and method persistence**

**Files:** `GeoreferencePanel.tsx`, `useUserMaps.ts` + tests.
**Consumes:** Task 3's `method` option, Task 7's preserving `saveGcps`.
**Produces:** `setGeorefMethod(id, method)` on `UserMapsApi`.

`UserMapsApi` currently exposes only `saveGcps` (`useUserMaps.ts:74`), which saves **points**. A toggle that only flips session-local state would pass an opposite-value mutation test and still lose the choice on reopen — so the setter is part of this task, not an afterthought.

Spec: *"At 4+ points a TPS toggle appears."* Below that it is **absent**, not disabled. The gate is `MIN_GCPS_FOR_TPS + 1`, and **Task 10 must use the same expression**.

Follow FU4's accessibility pattern: visually-conveyed state needs a text carrier; `.visually-hidden` exists. Accuracy copy must present the LOO figure as an **upper bound** — it is measured to overstate by 1.8×–3.7×.

Copy proposed for review: `Curved warp (TPS)` / `Passes exactly through every point. Better for hand-drawn maps that don't sit flat.`

- [ ] **Required test:** toggle to TPS, unmount, remount from the persisted record, and assert the method survived. Then mutate: point `onChange` at the opposite value (both are valid union members, `tsc -b` exits 0) — report whether anything catches it.

---

### Task 9: Allmaps annotation serializer

**Files:** create `allmaps/annotation.ts` + test.
**Produces:** `georeferenceAnnotation(record: UserMapRecord): object | null` — `null` when `georef.kind !== "gcp"`.

All verified: `transformation` on the **body FeatureCollection**, not the root; TPS is `"thinPlateSpline"` with **no** `options` (affine is `{"type":"polynomial","options":{"order":1}}`); `resourceCoords` is `[x, y]` while `coordinates` is `[lon, lat]` — **opposite orders**, both number pairs, so a transposition survives `tsc -b`; `target` is `urn:uuid:<record.id>`, `type: "Canvas"`, with the **ORIGINAL** `record.pixelSize`.

Fixtures must make transposition unpassable: lng negative and lat positive, pixel `x ≠ y`, `width ≠ height`.

- [ ] **Mutations:** swap `[lon, lat]`; move `transformation` to the root; emit `"tps"` instead of `"thinPlateSpline"`; use preview dimensions. Each must FAIL.

---

### Task 10: export control

**Files:** `GeoreferencePanel.tsx` + tests.

Download as `<record.name>.georef.json` via an object URL. Visible on the **same** gate as the toggle (`MIN_GCPS_FOR_TPS + 1`).

- [ ] **Four assertions required**, not one — payload equality alone leaves three ways to ship a broken export:
  1. the serialized payload equals `georeferenceAnnotation(record)`;
  2. the **filename** is `<record.name>.georef.json`;
  3. `URL.revokeObjectURL` is called with the URL that was created (spy on both; `useUserMaps` has the existing revoke convention) — otherwise every export leaks;
  4. the control is **absent** below the gate and present at it.

---

### Task 11: batched Minor fixes and documentation

Fix the Minor findings in `.superpowers/sdd/pr3-progress.md`. **M5 is must-fix:** `userMapStore.ts:150-158` claims an orphan is "permanent" and "the layer row can never be enabled" — both factually wrong (`UserMapRows` renders a `Remove` button for every record; a `kind:"embedded"` orphan's checkbox toggles fine and simply draws nothing). Also correct `GeoreferencePanel.tsx:329-345`.

- [ ] **Verification required.** Comment corrections have no code gate, so nothing would notice if they were skipped. Grep for the removed phrasings and assert they are gone:

```bash
grep -c "orphan is permanent\|can never be enabled" web/src/userMaps/store/userMapStore.ts   # must be 0
```

**Documentation** (required by the project's `CLAUDE.md`): `README.md` gains TPS + Allmaps export; `ARCHITECTURE.md` gains `transform/tps.ts`, `transform/conditioning.ts`, `allmaps/`; `plan.md` ticks the PR 3 items.

---

## Revision record

**Revised twice before any code was written, from two independent adversarial passes.**

**Pass 1 (Claude)** — 4 Critical, 4 Important, 5 Minor. The most consequential was reproduced independently: `solveTps` had no equivalent of `solveAffine`'s `MIN_CONDITION_RATIO`, so five points along a road — refused by affine at `condRatio 2.166e-3` — produced a confident drape where a 1-px nudge moved a corner **12.2 km**. The original collinear fixture *hid* it: at 45° the arithmetic cancels bit-exactly and it refuses; rotated oblique the same degenerate line solves. Also: a tautological ground-metres assertion (`rms < rms × 1.0797`); two tasks depending on a method-aware session no task built; and `TpsParams | null` unable to carry the refusal reason a later task needed.

**Pass 2 (Codex, gpt-5.6-sol)** — 2 Critical, 7 Important, 2 Minor, **almost entirely non-overlapping with pass 1**. The decisive finding: **`recordMesh.ts` was absent from the plan entirely**, and it is what `UserMapLayers.tsx:133` calls for every saved map — so the panel would show TPS and the saved layer would snap back to affine the moment the user clicked Done, with every proposed test green. Verifying it surfaced a third hardcoded site, `needsGeoreferencing` (`useUserMaps.ts:57`), which gates admission to `visibleMaps` at all. Also: a TPS-vs-affine assertion comparing two *different* pixels (the harness raster is 1200×800, so the midpoint is (600,400), not the (1000,900) the draft used) and passing regardless; a `conditionRatio(gcps)` signature uncallable from `solveAffine(pairs)`; two Task 2 tests left as **empty bodies**; scan-side-only drag wiring; undefined fixtures colliding with an existing module-private `nudgeEast`; `.not.toBeNull()` admitting `undefined` and an empty `metresPerGcp` that would render `NaN`; a toggle with no persistence interface; an export test blind to URL leaks; and a must-fix comment correction with no verification.

**Also revised from measurement, not review:** the suspect highlight ranks by the **affine fit residual** — 62.9% vs 46.8% at n=8, z = −18.3, and cheaper. A spline interpolates exactly, so an outlier is absorbed into its shape and corrupts its neighbours' LOO scores. LOO keeps the magnitude job as a conservative upper bound. `MIN_GCPS_FOR_TPS_SUSPECT = 5`, derived independently — n=4 is a wash at 32,000 pooled trials (24.98% against a 25.00% baseline).
