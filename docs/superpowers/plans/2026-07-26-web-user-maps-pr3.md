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

### ⚠ Reconciliation: leave-one-out was implemented, measured, and DELETED in PR 2

**Read this before Task 5. A reviewer who does not have this context will — correctly — reject Task 5 as re-introducing deleted code against measured evidence.**

`leaveOneOutMetres` existed in `transform/residuals.ts` and was removed in commit **`11780341f`**. The comment that replaced it is still in the file (`residuals.ts:81-91`) and reads, in part: *"Measured over 1104 trials, leave-one-out won 147 times and lost 150 — a wash — while costing an extra affine solve per point on every pointer move of a drag. It was dropped for the plain fit residual."*

**That measurement does not transfer to TPS, and the reason is precise.**

PR 2 asked: *for an **affine** fit, does LOO rank the bad GCP better than the plain fit residual?* Two signals were available and LOO was not better, so it lost on cost. For **TPS**, the plain fit residual is **identically zero at every control point** — that is the spline's defining property. LOO is not competing with a better signal; it is competing with **no signal at all**. Different question, so PR 2's answer does not apply.

**What DOES transfer is the cautionary half, and Task 5 must honour it.** PR 2 also measured that ranking is unreliable at low point counts: at n = 4, four points fitting three parameters leave a one-dimensional residual space, and ranking scored **24% correct against a 25% chance baseline**. `MIN_GCPS_FOR_SUSPECT = 5` was set from a sweep reaching 60% against a 20% baseline.

**Task 5 therefore must NOT inherit `MIN_GCPS_FOR_SUSPECT = 5` for TPS.** It must measure the equivalent threshold for TPS and set its own constant from that measurement. A TPS-specific threshold copied from the affine one is an unmeasured number, which is the exact failure mode this plan is built to avoid.

---

## File structure

| File | Responsibility |
|---|---|
| `web/src/userMaps/transform/tps.ts` | **Create.** Pure TPS solve + apply, Web Mercator metres. Mirrors `affine.ts`'s shape and conventions. |
| `web/src/userMaps/transform/tps.test.ts` | **Create.** Interpolation property, golden fixture, every refusal path. |
| `web/src/userMaps/transform/gcpMesh.ts` | **Modify.** Add `buildTpsLatLngMesh` + the two grid-size constants. |
| `web/src/userMaps/transform/residuals.ts` | **Modify.** Add the TPS residual path (leave-one-out) alongside the existing affine one. |
| `web/src/userMaps/useGeoreferenceSession.ts` | **Modify.** Method-aware solve, two-tier mesh density, drag-state awareness. |
| `web/src/userMaps/useUserMaps.ts` | **Modify.** `saveGcps` must stop hardcoding `method: "affine"`. |
| `web/src/userMaps/components/GeoreferencePanel.tsx` | **Modify.** The TPS toggle and the export control. |
| `web/src/userMaps/allmaps/annotation.ts` | **Create.** Pure serializer: `UserMapRecord` → Georeference Annotation. A `.ts` file, so it may export plain functions. |
| `web/src/userMaps/allmaps/annotation.test.ts` | **Create.** |
| `README.md`, `ARCHITECTURE.md`, `plan.md` | **Modify.** Final task. |

---

## Task list

Ten tasks. Each ends with an independently testable deliverable and its own commit.

| # | Task | Why it is its own task |
|---|---|---|
| 1 | TPS solver (`tps.ts`) — solve, apply, refusal paths | Pure maths, no React, no UI. The whole PR rests on it being right. |
| 2 | TPS refusal states in `GeoreferenceStatus` | Today four affine refusals collapse into one `degenerate`. TPS fails differently and a reviewer could reject the taxonomy while accepting the solver. |
| 3 | `buildTpsLatLngMesh` + measured grid constants | The mesh is the only consumer of the solver; separable from the session. |
| 4 | Two-tier mesh density (coarse during drag) | Needs a drag-active signal the session does not have today. |
| 5 | TPS residuals via leave-one-out, with a **measured** threshold | Carries a measurement step of its own; see the reconciliation above. |
| 6 | `saveGcps` stops hardcoding `method: "affine"` | A one-line trap with a silent failure mode; deserves its own gate. |
| 7 | The TPS toggle in the panel | First user-visible task; depends on 1–6. |
| 8 | Allmaps annotation serializer | Pure, independent of everything above except `types.ts`. |
| 9 | Export control in the panel | UI for Task 8. |
| 10 | Batched Minor fixes from STEP 1 + docs | Housekeeping the whole-branch review requires. |

**Dependencies:** 1 → 2, 3. 3 → 4. 1 → 5. 6 independent. 1,3,4,5,6 → 7. 8 independent. 8 → 9. All → 10.

---

### Task 1: TPS solver

**Files:**
- Create: `web/src/userMaps/transform/tps.ts`
- Test: `web/src/userMaps/transform/tps.test.ts`

**Interfaces:**
- Consumes: `Gcp` from `../types`; `toMercator`, `fromMercator`, `type MercatorPoint` from `./webMercator`.
- Produces:
  ```ts
  export const MIN_GCPS_FOR_TPS = 3;
  export type TpsParams = {
    /** Control points in CENTRED, SCALED source space — never raw pixels. */
    readonly centreX: number;
    readonly centreY: number;
    readonly scale: number;
    readonly xs: readonly number[];
    readonly ys: readonly number[];
    /** Kernel weights then the affine tail [a0, a1, a2], for each output axis. */
    readonly wx: readonly number[];
    readonly wy: readonly number[];
    readonly originX: number;
    readonly originY: number;
  };
  export function solveTps(gcps: Gcp[]): TpsParams | null;
  export function applyTps(params: TpsParams, x: number, y: number): MercatorPoint;
  ```

**Why centred and scaled:** measured — an uncentred `(n+3)×(n+3)` system at n = 500 is not reliably solvable in double precision at Mercator magnitudes (~6.77e6 m). Centring source coordinates on their centroid and scaling to unit RMS, and subtracting the destination centroid, is what keeps the interpolation residual at 1 ULP.

- [ ] **Step 1: Write the failing test — the defining property**

```ts
// web/src/userMaps/transform/tps.test.ts
import { describe, expect, it } from "vitest";
import { MIN_GCPS_FOR_TPS, applyTps, solveTps } from "./tps";
import { toMercator } from "./webMercator";
import type { Gcp } from "../types";

/**
 * Deliberately NOT a grid, and deliberately not symmetric. A regular lattice
 * is nearly affine by construction — measured on the real Church graticule
 * sets, where TPS scored no better than affine at held-out check points — so
 * a lattice fixture cannot tell a working spline from a working affine.
 */
const BENT: Gcp[] = [
  { id: "a", pixel: { x: 120, y: 90 }, map: { lat: 46.31, lng: -61.42 } },
  { id: "b", pixel: { x: 1840, y: 210 }, map: { lat: 46.28, lng: -60.83 } },
  { id: "c", pixel: { x: 300, y: 1490 }, map: { lat: 45.87, lng: -61.51 } },
  { id: "d", pixel: { x: 1720, y: 1610 }, map: { lat: 45.79, lng: -60.74 } },
  { id: "e", pixel: { x: 910, y: 780 }, map: { lat: 46.09, lng: -61.02 } },
];

describe("solveTps", () => {
  it("passes EXACTLY through every control point — the defining property", () => {
    const params = solveTps(BENT);
    expect(params).not.toBeNull();
    for (const gcp of BENT) {
      const got = applyTps(params!, gcp.pixel.x, gcp.pixel.y);
      const want = toMercator(gcp.map);
      // 1e-6 m is far below anything a user can perceive and far above the
      // ~1e-9 m the measured implementation achieves, so this is a real gate
      // rather than a tautology. Mercator metres here, not ground: this
      // asserts the SOLVER, not a reported accuracy figure.
      expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-6);
    }
  });
});
```

- [ ] **Step 2: Run it and verify it fails for the right reason**

Run: `cd web && npx vitest run src/userMaps/transform/tps.test.ts`
Expected: FAIL — `Failed to resolve import "./tps"`. **Not** an assertion failure. If it fails any other way, stop and report.

- [ ] **Step 3: Implement `tps.ts`**

Mirror `affine.ts`'s file conventions: a doc comment explaining *why*, exported constants, no default export.

```ts
import type { Gcp } from "../types";
import { toMercator, type MercatorPoint } from "./webMercator";

/** Three points define the affine tail; below that the system is rank-deficient. */
export const MIN_GCPS_FOR_TPS = 3;

/**
 * Two control points closer than this in CENTRED, SCALED source space make two
 * rows of the kernel matrix effectively identical and the system singular.
 * Set from the scaled space rather than pixels so the gate is resolution-
 * independent: after scaling, unit distance is the cloud's own RMS extent.
 */
export const MIN_TPS_SEPARATION = 1e-6;

export type TpsParams = {
  readonly centreX: number;
  readonly centreY: number;
  readonly scale: number;
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  readonly wx: readonly number[];
  readonly wy: readonly number[];
  readonly originX: number;
  readonly originY: number;
};

/** U(r) = r^2 * log(r), with U(0) = 0. Uses log(r^2)/2 to avoid a sqrt. */
function kernel(r2: number): number {
  return r2 <= 0 ? 0 : 0.5 * r2 * Math.log(r2);
}

/** Gaussian elimination with partial pivoting over a dense Float64Array. */
function solveDense(a: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row * n + col]) > Math.abs(a[pivot * n + col])) {
        pivot = row;
      }
    }
    if (!(Math.abs(a[pivot * n + col]) > 0)) {
      return null; // singular, or NaN — `>` is false for NaN, deliberately
    }
    if (pivot !== col) {
      for (let k = 0; k < n; k += 1) {
        const t = a[col * n + k];
        a[col * n + k] = a[pivot * n + k];
        a[pivot * n + k] = t;
      }
      const t = b[col];
      b[col] = b[pivot];
      b[pivot] = t;
    }
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row * n + col] / a[col * n + col];
      if (factor === 0) continue;
      for (let k = col; k < n; k += 1) {
        a[row * n + k] -= factor * a[col * n + k];
      }
      b[row] -= factor * b[col];
    }
  }
  const out = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let k = row + 1; k < n; k += 1) {
      sum -= a[row * n + k] * out[k];
    }
    out[row] = sum / a[row * n + row];
  }
  return out;
}

/**
 * Solve a thin-plate spline from GCPs, in Web Mercator metres.
 *
 * Returns null — never throws, never NaN — for four distinct reasons, all of
 * which the caller currently surfaces through the status taxonomy in Task 2:
 * too few points, coincident (or near-coincident) control points, a control
 * cloud whose affine block is singular (all points collinear), and a
 * non-finite result.
 *
 * Source coordinates are centred on their centroid and scaled to unit RMS, and
 * the destination centroid is subtracted, before the system is assembled.
 * Measured: without that conditioning an n=500 system at Mercator magnitudes
 * (~6.77e6 m) is not reliably solvable in double precision; with it the
 * interpolation residual is one ULP.
 */
export function solveTps(gcps: Gcp[]): TpsParams | null {
  const n = gcps.length;
  if (n < MIN_GCPS_FOR_TPS) {
    return null;
  }

  let sx = 0;
  let sy = 0;
  for (const gcp of gcps) {
    sx += gcp.pixel.x;
    sy += gcp.pixel.y;
  }
  const centreX = sx / n;
  const centreY = sy / n;

  let sumSq = 0;
  for (const gcp of gcps) {
    const dx = gcp.pixel.x - centreX;
    const dy = gcp.pixel.y - centreY;
    sumSq += dx * dx + dy * dy;
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(rms > 0)) {
    return null; // every control point at the same pixel
  }
  const scale = 1 / rms;

  const xs = new Array<number>(n);
  const ys = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    xs[i] = (gcps[i].pixel.x - centreX) * scale;
    ys[i] = (gcps[i].pixel.y - centreY) * scale;
  }

  // Reject coincident control points explicitly rather than relying on the
  // pivot check: two identical rows can still produce a finite-but-garbage
  // solution when the destinations differ, and the user needs a specific
  // message, not "degenerate".
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dx = xs[i] - xs[j];
      const dy = ys[i] - ys[j];
      if (Math.hypot(dx, dy) < MIN_TPS_SEPARATION) {
        return null;
      }
    }
  }

  const dest = gcps.map((gcp) => toMercator(gcp.map));
  let ox = 0;
  let oy = 0;
  for (const point of dest) {
    ox += point.x;
    oy += point.y;
  }
  const originX = ox / n;
  const originY = oy / n;

  const size = n + 3;
  const base = new Float64Array(size * size);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const dx = xs[i] - xs[j];
      const dy = ys[i] - ys[j];
      base[i * size + j] = kernel(dx * dx + dy * dy);
    }
    base[i * size + n] = 1;
    base[i * size + n + 1] = xs[i];
    base[i * size + n + 2] = ys[i];
    base[n * size + i] = 1;
    base[(n + 1) * size + i] = xs[i];
    base[(n + 2) * size + i] = ys[i];
  }

  const rhsX = new Float64Array(size);
  const rhsY = new Float64Array(size);
  for (let i = 0; i < n; i += 1) {
    rhsX[i] = dest[i].x - originX;
    rhsY[i] = dest[i].y - originY;
  }

  // solveDense destroys its inputs, so each axis gets its own copy.
  const wx = solveDense(base.slice(), rhsX, size);
  if (!wx) return null;
  const wy = solveDense(base.slice(), rhsY, size);
  if (!wy) return null;

  for (let i = 0; i < size; i += 1) {
    if (!Number.isFinite(wx[i]) || !Number.isFinite(wy[i])) {
      return null;
    }
  }

  return {
    centreX, centreY, scale,
    xs, ys,
    wx: Array.from(wx),
    wy: Array.from(wy),
    originX, originY,
  };
}

/** Evaluate the spline at one ORIGINAL-image pixel. Returns Mercator metres. */
export function applyTps(params: TpsParams, x: number, y: number): MercatorPoint {
  const px = (x - params.centreX) * params.scale;
  const py = (y - params.centreY) * params.scale;
  const n = params.xs.length;
  let dx = params.wx[n] + params.wx[n + 1] * px + params.wx[n + 2] * py;
  let dy = params.wy[n] + params.wy[n + 1] * px + params.wy[n + 2] * py;
  for (let i = 0; i < n; i += 1) {
    const ex = px - params.xs[i];
    const ey = py - params.ys[i];
    const u = kernel(ex * ex + ey * ey);
    dx += params.wx[i] * u;
    dy += params.wy[i] * u;
  }
  return { x: params.originX + dx, y: params.originY + dy };
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd web && npx vitest run src/userMaps/transform/tps.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Add the refusal-path tests**

Each must assert `toBeNull()` — **exactly null**, not `.toBeFalsy()`, which `undefined` and `0` also satisfy.

```ts
describe("solveTps refusals", () => {
  it("refuses below three points", () => {
    expect(solveTps(BENT.slice(0, 2))).toBeNull();
    expect(solveTps(BENT.slice(0, 3))).not.toBeNull();
  });

  it("refuses coincident control points, which make the kernel singular", () => {
    const duplicated: Gcp[] = [
      ...BENT.slice(0, 3),
      { id: "dup", pixel: { ...BENT[0].pixel }, map: { lat: 45.5, lng: -62.0 } },
    ];
    expect(solveTps(duplicated)).toBeNull();
  });

  it("refuses control points that are collinear on the scan", () => {
    const line: Gcp[] = [
      { id: "p", pixel: { x: 100, y: 100 }, map: { lat: 46.3, lng: -61.4 } },
      { id: "q", pixel: { x: 400, y: 400 }, map: { lat: 46.1, lng: -61.1 } },
      { id: "r", pixel: { x: 900, y: 900 }, map: { lat: 45.8, lng: -60.7 } },
    ];
    expect(solveTps(line)).toBeNull();
  });

  it("refuses when every point is at the same pixel", () => {
    const stacked: Gcp[] = BENT.slice(0, 3).map((gcp, index) => ({
      ...gcp,
      id: `s${index}`,
      pixel: { x: 500, y: 500 },
    }));
    expect(solveTps(stacked)).toBeNull();
  });
});
```

- [ ] **Step 6: Verify the interpolation test BITES — mutation**

The interpolation assertion is the whole task. Prove it can fail.

Run, one at a time, restoring **by path** from a backup you take first:
1. In `applyTps`, drop the kernel loop (keep only the affine tail).
   Expected: the interpolation test FAILS.
2. In `solveTps`, swap `rhsX` and `rhsY`.
   Expected: the interpolation test FAILS. **`tsc -b` will still exit 0** — both are `Float64Array`.
3. In `applyTps`, swap `px` and `py`.
   Expected: FAILS.

**Paste all three failure messages into your report.** If any mutation passes, the assertion is not guarding what the task claims.

- [ ] **Step 7: Add a scale-invariance test**

TPS is not scale-invariant in general, but *this* implementation centres and scales, so the same relative layout at 10× the pixel coordinates must still interpolate exactly. This is what proves the conditioning step is real rather than decorative.

```ts
it("still interpolates exactly when the same layout is 10x larger in pixels", () => {
  const scaled = BENT.map((gcp) => ({
    ...gcp,
    pixel: { x: gcp.pixel.x * 10, y: gcp.pixel.y * 10 },
  }));
  const params = solveTps(scaled);
  expect(params).not.toBeNull();
  for (const gcp of scaled) {
    const got = applyTps(params!, gcp.pixel.x, gcp.pixel.y);
    const want = toMercator(gcp.map);
    expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-6);
  }
});
```

- [ ] **Step 8: Run the full gate**

Run each separately, capturing `$?` — never through a pipe:
```bash
cd web && npx vitest run > /tmp/v.txt 2>&1; echo "VITEST=$?"; npx tsc -b > /tmp/t.txt 2>&1; echo "TSC=$?"; npx eslint src > /tmp/e.txt 2>&1; echo "ESLINT=$?"
```
Expected: all three `=0`.

- [ ] **Step 9: Commit**

```bash
git add web/src/userMaps/transform/tps.ts web/src/userMaps/transform/tps.test.ts
git commit -m "feat(web): hand-rolled thin-plate-spline solver for GCP warps"
```

---

### Task 2: TPS refusal states

**Files:**
- Modify: `web/src/userMaps/useGeoreferenceSession.ts` (the `GeoreferenceStatus` union and the `status` memo)
- Modify: `web/src/userMaps/components/georeferenceStatus.ts` (the message table)
- Test: `web/src/userMaps/useGeoreferenceSession.test.ts`, `web/src/userMaps/components/GeoreferencePanel.test.tsx`

**Interfaces:**
- Consumes: `solveTps`, `MIN_GCPS_FOR_TPS` from `./transform/tps`.
- Produces: one new member on `GeoreferenceStatus`:
  ```ts
  | { kind: "coincident-points" }
  ```

**The decision, and its reasoning.** Today `solveAffineFromGcps` returns null for four reasons and all four surface as `degenerate`, whose message deliberately avoids claiming "collinear" (see the type's comment and `georeferenceStatus.ts`). TPS shares three of those reasons and adds one the user can act on *specifically*: **two control points placed on the same spot**. That one gets its own state because the remedy is different and concrete — "move or delete one of them" — whereas the other three share the remedy "spread your points out". Do **not** split the other three; that would be a taxonomy the user cannot act on differently.

- [ ] **Step 1: Write the failing test**

```ts
it("names coincident points specifically, not just 'degenerate'", () => {
  const { result } = renderSession({
    initialGcps: [
      { id: "a", pixel: { x: 120, y: 90 }, map: { lat: 46.31, lng: -61.42 } },
      { id: "b", pixel: { x: 1840, y: 210 }, map: { lat: 46.28, lng: -60.83 } },
      { id: "c", pixel: { x: 300, y: 1490 }, map: { lat: 45.87, lng: -61.51 } },
      { id: "d", pixel: { x: 120, y: 90 }, map: { lat: 45.50, lng: -62.00 } },
    ],
    method: "tps",
  });
  expect(result.current.status).toEqual({ kind: "coincident-points" });
});
```

Use whatever harness name `useGeoreferenceSession.test.ts` already defines; read the top of that file rather than inventing one.

- [ ] **Step 2: Run and verify it fails**

Run: `cd web && npx vitest run src/userMaps/useGeoreferenceSession.test.ts`
Expected: FAIL — the status is `{ kind: "degenerate" }` (or a type error if `method` is not yet a session option; that is expected and Task 7 formalises it).

- [ ] **Step 3: Implement**

Add to the union in `useGeoreferenceSession.ts`, with a comment stating why this one is split out and the others are not. Add the message to `georeferenceStatus.ts`. **Copy for review, not invented silently:**

> `Two points are on the same spot — move or delete one.`

- [ ] **Step 4: Verify, and check the exhaustiveness**

Run: `cd web && npx vitest run src/userMaps/components/GeoreferencePanel.test.tsx src/userMaps/useGeoreferenceSession.test.ts`
Expected: PASS. Then confirm `statusMessage` handles the new member — if it uses a `switch` with no `default`, `tsc -b` will have told you; if it uses a lookup object, add a test that the message is non-empty.

- [ ] **Step 5: Mutation — prove the new state is reachable and distinct**

Change the coincidence gate in `tps.ts` to `return null` *without* the specific path (i.e. let it fall through to the generic refusal). Expected: the new test FAILS with `{ kind: "degenerate" }`. Restore by path.

- [ ] **Step 6: Gate and commit**

```bash
git add web/src/userMaps/useGeoreferenceSession.ts web/src/userMaps/components/georeferenceStatus.ts web/src/userMaps/useGeoreferenceSession.test.ts web/src/userMaps/components/GeoreferencePanel.test.tsx
git commit -m "feat(web): name coincident control points as their own refusal"
```

---

### Task 3: `buildTpsLatLngMesh` and the measured grid constants

**Files:**
- Modify: `web/src/userMaps/transform/gcpMesh.ts`
- Test: `web/src/userMaps/transform/gcpMesh.test.ts`

**Interfaces:**
- Consumes: `applyTps`, `type TpsParams` from `./tps`.
- Produces:
  ```ts
  export const TPS_GRID_SIZE = 64;
  export const TPS_DRAG_GRID_SIZE = 16;
  export function buildTpsLatLngMesh(
    params: TpsParams,
    pixelSize: PixelSize,
    gridSize?: number,
  ): LatLngPoint[][];
  ```

Mirror `buildGcpLatLngMesh` exactly — same row/col order (row = pixel Y, col = pixel X) so `WarpedRasterLayer` consumes either without caring which produced it.

**Both constants carry their measurement in a comment.** `64` → max 6.0 / 1.1 / 2.0 ground m on the three Church sets, 8 192 draws, below one CSS px through zoom 14. `16` → 44.3 / 10.9 / 15.9 m, 512 draws, 1.1–1.7× the shipping gridSize-8 cost, clears half a CSS px at z10 which is where a user is while dragging. **The comment must also record that `64` is provisional pending a browser profile, with `32` as the documented fallback.**

- [ ] **Step 1: Write the failing tests**

```ts
it("returns a lattice of gridSize+1 by gridSize+1 vertices", () => {
  const params = solveTps(BENT)!;
  const mesh = buildTpsLatLngMesh(params, { width: 2000, height: 1700 }, 4);
  expect(mesh).toHaveLength(5);
  expect(mesh[0]).toHaveLength(5);
});

it("passes through a control point that sits exactly on a lattice vertex", () => {
  // The lattice corner (0,0) is the raster origin. Put a control point there
  // so the mesh vertex and the spline's own interpolation must agree — this
  // catches a mesh built from the wrong pixel extent or a transposed row/col.
  const withCorner: Gcp[] = [
    { id: "corner", pixel: { x: 0, y: 0 }, map: { lat: 46.4, lng: -61.6 } },
    ...BENT.slice(1),
  ];
  const params = solveTps(withCorner)!;
  const mesh = buildTpsLatLngMesh(params, { width: 2000, height: 1700 }, 4);
  expect(mesh[0][0].lat).toBeCloseTo(46.4, 9);
  expect(mesh[0][0].lng).toBeCloseTo(-61.6, 9);
});

it("orders the lattice row = pixel Y, col = pixel X, matching buildGcpLatLngMesh", () => {
  // A transposed mesh is the classic silent bug here: both axes are numbers,
  // both meshes are LatLngPoint[][], and a square gridSize hides it. Use a
  // NON-SQUARE raster so a transposition changes the geometry, not just the
  // indices.
  const params = solveTps(BENT)!;
  const mesh = buildTpsLatLngMesh(params, { width: 2000, height: 500 }, 2);
  // Moving one step along a ROW must move mostly in longitude; one step down
  // a COLUMN must move mostly in latitude, for this control layout.
  const alongRow = Math.abs(mesh[0][1].lng - mesh[0][0].lng);
  const downCol = Math.abs(mesh[1][0].lat - mesh[0][0].lat);
  expect(alongRow).toBeGreaterThan(Math.abs(mesh[0][1].lat - mesh[0][0].lat));
  expect(downCol).toBeGreaterThan(Math.abs(mesh[1][0].lng - mesh[0][0].lng));
});
```

- [ ] **Step 2: Run, verify failure**

Run: `cd web && npx vitest run src/userMaps/transform/gcpMesh.test.ts`
Expected: FAIL — `buildTpsLatLngMesh is not a function`.

- [ ] **Step 3: Implement**

```ts
/**
 * Lattice density for a settled TPS redraw.
 *
 * MEASURED against all three real Church control sets in `tools/church/gcps/`,
 * sampling strictly inside cells (never at vertices, where error is zero by
 * construction) and triangulating exactly as `render/mesh.ts` does — including
 * its ANTI-diagonal, which is worth up to 15%. Max ground error at 64 is
 * 6.0 / 1.1 / 2.0 m (inverness-north / inverness-south / richmond), below one
 * CSS pixel on all three sheets through zoom 14. Cost is 2*64^2 = 8192 clipped
 * drawImage calls, each of which redraws the WHOLE source image under a clip.
 *
 * PROVISIONAL: the browser rasterization term could not be measured (the
 * harness browser tab reports visibilityState "hidden" and fires no rAF
 * callbacks). node-canvas overstates by a large uncalibrated factor — it puts
 * the already-shipping gridSize 8 at 11 fps. If a real browser profile says 64
 * is too slow, the documented fallback is 32 (max 17.8 / 2.9 / 5.8 m).
 *
 * Do NOT assume denser is always better: measured, gridSize 12 beats 16 and 24
 * beats 32, because lattice vertices landing near control points locally
 * cancel error.
 */
export const TPS_GRID_SIZE = 64;

/**
 * Lattice density WHILE a control point is being dragged.
 *
 * MEASURED: max ground error 44.3 / 10.9 / 15.9 m — which clears half a CSS
 * pixel at zoom 10, and z10 is where a user actually is while dragging (these
 * panels are ~77 km across an 800 px viewport). Cost is 512 draws, only
 * 1.1-1.7x the gridSize 8 that already ships, because render cost is
 * SUBLINEAR in triangle count (T proportional to triangles^0.29-0.40): total
 * painted area is fixed however finely the mesh is cut.
 */
export const TPS_DRAG_GRID_SIZE = 16;

export function buildTpsLatLngMesh(
  params: TpsParams,
  pixelSize: PixelSize,
  gridSize: number = TPS_GRID_SIZE,
): LatLngPoint[][] {
  const mesh: LatLngPoint[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: LatLngPoint[] = [];
    const y = (pixelSize.height * row) / gridSize;
    for (let col = 0; col <= gridSize; col += 1) {
      const x = (pixelSize.width * col) / gridSize;
      line.push(fromMercator(applyTps(params, x, y)));
    }
    mesh.push(line);
  }
  return mesh;
}
```

- [ ] **Step 4: Verify, then mutate**

Run the file. Then, restoring by path each time:
1. Transpose `x` and `y` in the `applyTps` call. Expected: the ordering test FAILS.
2. Change `<=` to `<` in the row loop. Expected: the lattice-size test FAILS.

- [ ] **Step 5: Gate and commit**

```bash
git add web/src/userMaps/transform/gcpMesh.ts web/src/userMaps/transform/gcpMesh.test.ts
git commit -m "feat(web): TPS lattice with measured grid density"
```

---

### Task 4: Two-tier mesh density during a drag

**Files:**
- Modify: `web/src/userMaps/useGeoreferenceSession.ts`
- Test: `web/src/userMaps/useGeoreferenceSession.test.ts`

**The problem this solves, stated precisely.** A settled TPS redraw at `TPS_GRID_SIZE` is 8 192 clipped full-image draws. A drag emits state on every pointer move. Redrawing 8 192 triangles per pointer move is not viable; `TPS_DRAG_GRID_SIZE` (512 draws) is, and is measured to clear half a CSS pixel at the zoom a user occupies while dragging.

**The obstacle.** The session has `beginDragGcp` but **no `endDragGcp`** — FU1 established this explicitly and chose an approach that did not need one. Task 4 needs one, so it must add the signal and wire it through **both** consumers: `ScanPane.tsx` (`ScanGcpMarker`'s `eventHandlers`, which already binds `dragstart` and `drag`) and `GeoreferenceMapLayer.tsx`. Leaflet fires `dragend`; it is not currently bound anywhere.

**The trap, and it is the same shape as FU1's.** `dragEnd` must not be inferred from a timer or from "no move for N ms" — a drag that ends without a final move would leave the mesh permanently coarse. Bind the real `dragend` event.

**Interfaces:**
- Produces, added to `GeoreferenceSession`:
  ```ts
  endDragGcp: (id: string) => void;
  ```
  Mirror `beginDragGcp`'s existing signature convention. **`beginDragGcp` ignores its `id` argument today** — if `endDragGcp` also ignores it, say so in a comment deliberately rather than leaving a reader to wonder.

- [ ] **Step 1: Write the failing test**

Assert the **effect** — which grid size the emitted mesh actually has — not that a callback was called.

```ts
it("drops to the coarse lattice during a drag and restores it on drag end", () => {
  const { result } = renderSession({ initialGcps: BENT, method: "tps" });
  const settled = result.current.mesh;
  expect(settled).not.toBeNull();
  expect(settled!.length - 1).toBe(TPS_GRID_SIZE);

  act(() => result.current.beginDragGcp("a"));
  act(() => result.current.moveGcpOnScan("a", 130, 95));
  expect(result.current.mesh!.length - 1).toBe(TPS_DRAG_GRID_SIZE);

  act(() => result.current.endDragGcp("a"));
  expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
});

it("leaves the AFFINE path at gridSize 1 — the two-tier switch is TPS-only", () => {
  // affine at gridSize 1 is pixel-exact; raising it would cost draws for
  // nothing. This is the assertion that stops the drag tier leaking across.
  const { result } = renderSession({ initialGcps: BENT, method: "affine" });
  act(() => result.current.beginDragGcp("a"));
  act(() => result.current.moveGcpOnScan("a", 130, 95));
  expect(result.current.mesh!.length - 1).toBe(AFFINE_GRID_SIZE);
});
```

- [ ] **Step 2: Run, verify failure**

Expected: FAIL — `endDragGcp is not a function`.

- [ ] **Step 3: Implement**

Hold drag-active in a **ref**, and derive the grid size outside any updater. The mesh `useMemo` gains the grid size as a dependency; because a ref change does not re-render, the drag-active flag must also be mirrored into state — **or**, simpler and preferred here, `moveGcpOn*` and `endDragGcp` set a `dragging` state value directly. Whichever you choose:

- The updater must compute the next value and nothing else (StrictMode double-invokes).
- Do not write a ref during render (lint ERROR).
- Do not introduce `set-state-in-effect`.

Then bind `dragend` in `ScanPane.tsx`'s `eventHandlers` memo and in `GeoreferenceMapLayer.tsx`, adding `onDragEndGcp` to each component's props and threading it from `GeoreferencePanel.tsx` / `App.tsx`'s binding.

- [ ] **Step 4: Verify, then mutate**

Restoring by path each time:
1. Make `endDragGcp` a no-op. Expected: the restore assertion FAILS.
2. Swap the two grid constants. Expected: both assertions FAIL.
3. Remove the `dragend` binding from `ScanPane.tsx` only. Expected: **report whether anything catches it.** If nothing does, add a real-mount assertion to `ScanPane.realMount.test.tsx` — that file already drives a genuine Leaflet drag and is the only place this seam is observable.

- [ ] **Step 5: Gate and commit**

```bash
git add web/src/userMaps web/src/App.tsx
git commit -m "feat(web): coarse TPS lattice while dragging, fine when settled"
```

---

### Task 5: TPS residuals via leave-one-out, with a MEASURED threshold

**Read the reconciliation block above before starting.** `leaveOneOutMetres` was deleted in `11780341f` after measurement. Re-introducing it for TPS is justified, but the justification must be written into the code comment, citing that commit — otherwise the next reader will delete it again.

**Files:**
- Modify: `web/src/userMaps/transform/residuals.ts`
- Test: `web/src/userMaps/transform/residuals.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MIN_GCPS_FOR_TPS_SUSPECT: number; // set by Step 1's measurement
  export function tpsResidualReport(gcps: Gcp[]): ResidualReport | null;
  ```
  Returns the **same `ResidualReport` shape** the affine path returns, so `GcpList` needs no change.

- [ ] **Step 1: MEASURE the suspect threshold before writing the constant**

This step produces a number. Do not skip it and do not copy `MIN_GCPS_FOR_SUSPECT = 5` from the affine path — that constant was measured for a different estimator on a different failure mode.

Write a throwaway script in the scratchpad (plain `node`, **not** vitest, and **inline it** rather than shelling out to a shared script another agent could clobber). For n from 4 to 12:
1. Generate a non-degenerate control layout of n points.
2. Displace exactly one point by a known error.
3. Run leave-one-out and record whether the displaced point ranks worst.
4. Repeat over many trials, varying which point, the magnitude, and the direction.

Report the hit rate against the `1/n` chance baseline at each n, and set `MIN_GCPS_FOR_TPS_SUSPECT` to the smallest n that clearly beats chance. **Paste the table into your report.** PR 2's equivalent sweep used 1104 trials; match that order of magnitude.

If **no** n beats chance, that is a real and reportable result: set the constant so no row is ever accused for TPS, and say so in the comment. Do not manufacture a threshold.

- [ ] **Step 2: Write the failing tests**

```ts
it("reports NON-ZERO per-point error for a TPS fit, unlike the fit residual", () => {
  // The whole reason this function exists. A TPS passes through its control
  // points exactly, so residualMetresFor() would return ~0 for every point and
  // the UI would show a meaningless "RMS 0 m".
  const report = tpsResidualReport(BENT);
  expect(report).not.toBeNull();
  expect(report!.metresPerGcp).toHaveLength(BENT.length);
  for (const metres of report!.metresPerGcp) {
    expect(metres).toBeGreaterThan(0);
  }
});

it("reports GROUND metres, not the 1.4396x-inflated Mercator figure", () => {
  // Guard shaped exactly like the affine path's, because the inflation is the
  // single easiest thing to get wrong here and it is invisible without it.
  const report = tpsResidualReport(BENT)!;
  const inflated = report.rmsMetres * 1.4396;
  expect(report.rmsMetres).toBeLessThan(inflated * 0.75);
});

it("returns null when dropping one point leaves too few to solve", () => {
  expect(tpsResidualReport(BENT.slice(0, 3))).toBeNull();
});
```

**Note on the second test:** it must compare against a value derived from the *measured* inflation, not merely assert "less than some constant". Read `residuals.test.ts`'s existing affine guard and mirror its shape — do not invent a weaker one.

- [ ] **Step 3: Implement**

```ts
/**
 * Per-point accuracy for a TPS fit, by leave-one-out cross-validation.
 *
 * A thin-plate spline passes through its control points EXACTLY — that is its
 * defining property — so `residualMetresFor` returns ~0 for every point and
 * says nothing at all about accuracy. Dropping each point, re-solving on the
 * rest, and measuring how far the remaining points' spline misses it is the
 * only honest number available. `tools/church/gcps.py` makes the same argument
 * for the Python pipeline, where it is solved with an explicit control/check
 * split; leave-one-out gets the same honesty without asking the user to
 * designate check points.
 *
 * This deliberately re-introduces an approach removed in 11780341f. That
 * removal was correct AND does not apply here: it measured leave-one-out
 * against the plain fit residual FOR AN AFFINE FIT, where both signals exist
 * and LOO was a wash (147 wins, 150 losses over 1104 trials) so it lost on
 * cost. For TPS the plain fit residual is identically zero, so LOO is not
 * competing with a cheaper signal — it is competing with no signal.
 *
 * Cost is n solves of an (n-1)-point system, and the solve is O(n^3):
 * measured 0.021 ms at n=30 and 0.462 ms at n=100, so LOO is ~1 ms at
 * hand-clicked point counts. It is NOT viable at the 300-500 anchors a dense
 * Church georeference would use (10.3 ms and 56 ms per single solve), which is
 * why <see the cap you implement> exists.
 */
export function tpsResidualReport(gcps: Gcp[]): ResidualReport | null {
  if (gcps.length < MIN_GCPS_FOR_TPS + 1) {
    return null; // dropping one must still leave enough to solve
  }
  const metresPerGcp: number[] = [];
  for (let index = 0; index < gcps.length; index += 1) {
    const rest = gcps.filter((_, other) => other !== index);
    const params = solveTps(rest);
    if (!params) {
      return null;
    }
    const held = gcps[index];
    const predicted = fromMercator(applyTps(params, held.pixel.x, held.pixel.y));
    metresPerGcp.push(groundMetresBetween(predicted, held.map));
  }
  let mostInconsistentIndex: number | null = null;
  if (gcps.length >= MIN_GCPS_FOR_TPS_SUSPECT) {
    let worst = 0;
    for (let index = 1; index < metresPerGcp.length; index += 1) {
      if (metresPerGcp[index] > metresPerGcp[worst]) {
        worst = index;
      }
    }
    mostInconsistentIndex = worst;
  }
  return { metresPerGcp, rmsMetres: rmsMetres(metresPerGcp), mostInconsistentIndex };
}
```

**You must also decide and implement the cap** for large n, and state your choice. The measured budget: LOO at n = 300 is 300 × 10.34 ms ≈ 3.1 s — far past interactive. Options: skip the suspect highlight above a threshold; compute LOO only when the pointer is up; or refuse LOO above a cap and report the RMS only. Pick one, justify it, and test the boundary.

- [ ] **Step 4: Verify, then mutate**

Restoring by path each time:
1. Replace the LOO body with `residualMetresFor(...)` against a full-set solve. Expected: the non-zero test FAILS (every residual ~0). **This is the single most important mutation in the task.**
2. Return raw Mercator magnitudes instead of `groundMetresBetween`. Expected: the ground-metres test FAILS.
3. Change `MIN_GCPS_FOR_TPS + 1` to `MIN_GCPS_FOR_TPS`. Expected: the null test FAILS.

- [ ] **Step 5: Gate and commit**

```bash
git add web/src/userMaps/transform/residuals.ts web/src/userMaps/transform/residuals.test.ts
git commit -m "feat(web): honest TPS accuracy by leave-one-out cross-validation"
```

---

### Task 6: `saveGcps` must stop hardcoding `method: "affine"`

**Files:**
- Modify: `web/src/userMaps/useUserMaps.ts` (`saveGcps`, around line 443)
- Test: `web/src/userMaps/useUserMaps.test.ts`

**The defect, precisely.** `saveGcps` builds `georef: { kind: "gcp", gcps, method: "affine" }` with the method as a **literal**, and it runs from the debounced write on **every drag**. A map switched to TPS silently reverts to affine on the next pointer move. `tsc -b` cannot catch it (the literal is a valid union member) and **no existing test asserts the persisted `method`**.

- [ ] **Step 1: Write the failing test**

Assert the **persisted record**, not the call.

```ts
it("preserves a map's TPS method across a points save", async () => {
  // The failure this guards is silent: the map keeps working, keeps drawing,
  // and quietly stops passing through its control points.
  const { result } = renderUserMaps(/* seed a record with method: "tps" */);
  await act(async () => {
    await result.current.saveGcps("map-1", MOVED_GCPS);
  });
  const saved = result.current.records.find((r) => r.id === "map-1")!;
  expect(saved.georef).toEqual({
    kind: "gcp",
    gcps: MOVED_GCPS,
    method: "tps",
  });
});
```

Read the existing `useUserMaps.test.ts` harness and follow its seeding convention rather than inventing one.

- [ ] **Step 2: Run, verify it fails with `method: "affine"`**

Expected: FAIL showing `"affine"` where `"tps"` was expected. If it passes, the defect is already fixed — stop and report.

- [ ] **Step 3: Implement**

Preserve the existing record's method rather than adding a parameter — `saveGcps(id, gcps)` is called from the debounce and the session does not own the method. Guard the case where `existing.georef.kind !== "gcp"`.

```ts
const existingMethod =
  existing.georef.kind === "gcp" ? existing.georef.method : "affine";
const saved: UserMapRecord = {
  ...existing,
  georef: { kind: "gcp", gcps, method: existingMethod },
};
```

Keep the surrounding "built OUTSIDE the updater" comment and behaviour intact — that is load-bearing (React defers updaters when the fiber has queued work, and `App` always does).

- [ ] **Step 4: Verify, then mutate**

Restore the literal `"affine"`. Expected: the new test FAILS. Also confirm an **affine** map still saves as affine — a fix that hardcodes `"tps"` instead passes the new test and breaks everything else.

- [ ] **Step 5: Gate and commit**

```bash
git add web/src/userMaps/useUserMaps.ts web/src/userMaps/useUserMaps.test.ts
git commit -m "fix(web): stop reverting a TPS map to affine on every points save"
```

---

### Task 7: The TPS toggle

**Files:**
- Modify: `web/src/userMaps/components/GeoreferencePanel.tsx`, `web/src/userMaps/useGeoreferenceSession.ts`, `web/src/userMaps/useUserMaps.ts`
- Test: `web/src/userMaps/components/GeoreferencePanel.test.tsx`

**Spec behaviour:** *"At 4+ points a TPS toggle appears (phase 3)."* Below that it is absent, not disabled-and-present.

**Requirements:**
- The toggle reflects and sets `record.georef.method`, persisting through the same debounced path.
- Switching method re-solves and redraws without re-decoding the bitmap — the `draft`/`previewUrl` split in `UserMapLayers` already guarantees this; do not disturb it.
- **Accessibility follows the pattern FU4 established**: any state conveyed visually must have a text carrier, and `.visually-hidden` already exists.
- Copy is the maintainer's call. Proposed, for review: label `Curved warp (TPS)`, with helper text `Passes exactly through every point. Better for hand-drawn maps that don't sit flat.`

- [ ] **Step 1–5:** Write the failing test (toggle absent at 3 points, present at 4, flips the persisted method, re-solves); run it; implement; verify; mutate (make the toggle read the method but not write it — a same-type no-op that `tsc -b` accepts); gate; commit.

**Mutation that must be run:** point the toggle's `onChange` at the *opposite* method value. Both are valid union members, so `tsc -b` exits 0. Report whether the test catches it.

---

### Task 8: Allmaps annotation serializer

**Files:**
- Create: `web/src/userMaps/allmaps/annotation.ts`, `web/src/userMaps/allmaps/annotation.test.ts`

**Interfaces:**
```ts
export function georeferenceAnnotation(record: UserMapRecord): object | null;
```
Returns `null` when `record.georef.kind !== "gcp"` — an embedded-georeference raster has no GCPs to serialize.

**No dependency.** `@allmaps/annotation` is IIIF-URI-shaped and would breach the Global Constraint for ~30 lines of object construction.

**The four things a hand-written serializer must get right** (all verified — see the facts table):
1. `transformation` goes on the **body FeatureCollection**, not the annotation root.
2. TPS is `"thinPlateSpline"` with **no** `options`; affine is `{"type":"polynomial","options":{"order":1}}`.
3. `properties.resourceCoords` is `[x, y]`; `geometry.coordinates` is `[lon, lat]`. **Opposite orders.**
4. `target` uses `urn:uuid:<record.id>`, `type: "Canvas"`, and the **ORIGINAL** `record.pixelSize` — never preview dimensions.

- [ ] **Step 1: Write the failing test, with a fixture that catches transposition**

```ts
it("emits lon/lat in geometry and x/y in resourceCoords — opposite orders", () => {
  // The fixture is chosen so a transposition CANNOT pass: lng is negative and
  // lat positive, and pixel x != pixel y. Any swap changes a sign or a value.
  const record = gcpRecord({
    pixelSize: { width: 2000, height: 1700 },
    gcps: [{ id: "a", pixel: { x: 120, y: 90 }, map: { lat: 46.31, lng: -61.42 } }],
    method: "tps",
  });
  const annotation = georeferenceAnnotation(record) as any;
  expect(annotation.body.features[0].geometry.coordinates).toEqual([-61.42, 46.31]);
  expect(annotation.body.features[0].properties.resourceCoords).toEqual([120, 90]);
});

it("puts transformation on the body, not the annotation root", () => {
  const annotation = georeferenceAnnotation(gcpRecord({ method: "tps" })) as any;
  expect(annotation.body.transformation).toEqual({ type: "thinPlateSpline" });
  expect(annotation).not.toHaveProperty("transformation");
});

it("targets the ORIGINAL pixel size, never the preview", () => {
  const annotation = georeferenceAnnotation(
    gcpRecord({ pixelSize: { width: 34427, height: 34543 } }),
  ) as any;
  expect(annotation.target.width).toBe(34427);
  expect(annotation.target.height).toBe(34543);
});
```

- [ ] **Steps 2–5:** Run and verify failure; implement; verify; **mutate** — swap `[lon, lat]` to `[lat, lng]` (must FAIL), move `transformation` to the root (must FAIL), emit `"tps"` instead of `"thinPlateSpline"` (must FAIL); gate; commit.

---

### Task 9: Export control

**Files:** Modify `web/src/userMaps/components/GeoreferencePanel.tsx`; test in `GeoreferencePanel.test.tsx`.

Download the annotation as `<record.name>.georef.json` via an object URL. **Revoke the URL** — `useUserMaps` already has the revoke convention for preview URLs; follow it. The button is absent below `MIN_GCPS_FOR_TPS` points, matching the toggle's rule.

Assert the **effect**: that the serialized payload handed to the blob matches `georeferenceAnnotation(record)`, not merely that a click handler fired.

---

### Task 10: Batched Minor fixes and documentation

**Fix the Minor findings recorded during STEP 1** — they are listed in `.superpowers/sdd/pr3-progress.md`. **M5 is must-fix, not polish**: `userMapStore.ts:150-158` claims an orphan record is "permanent" and that "the layer row can never be enabled", both of which are factually wrong (`UserMapRows` renders a `Remove` button for every record, and a `kind:"embedded"` orphan's checkbox toggles fine and simply draws nothing). It reads as a stronger safety guarantee than the code provides. Also correct `GeoreferencePanel.tsx:329-345`, which is factually inaccurate as written.

**Documentation** — the project's `CLAUDE.md` requires this and it is not optional:
- `README.md` — the web feature list gains TPS warping and Allmaps export.
- `ARCHITECTURE.md` — the `userMaps` section gains `transform/tps.ts` and `allmaps/`.
- `plan.md` — tick the PR 3 checklist items.

---

## Self-review

**Spec coverage.** TPS mesh → Tasks 1, 3, 4. TPS residual honesty → Task 5. Per-map `method` → Tasks 6, 7. Allmaps export → Tasks 8, 9. Import → explicitly deferred by the spec's 2026-07-26 amendment. Grid size → Task 3, carrying the measurement. Docs → Task 10.

**Placeholders.** Tasks 7 and 9 are specified at a lower code density than 1–6 and 8, deliberately: both are UI wiring over interfaces the earlier tasks fully define, and both name the exact mutation that must be run. Their implementers must still write the failing test first.

**Type consistency.** `TpsParams` is produced by Task 1 and consumed by Tasks 3 and 5. `ResidualReport` is reused unchanged from `residuals.ts`, so `GcpList` needs no edit. `TPS_GRID_SIZE` / `TPS_DRAG_GRID_SIZE` are produced by Task 3 and consumed by Task 4. `endDragGcp` is produced by Task 4 and consumed by `ScanPane` / `GeoreferenceMapLayer`. `MIN_GCPS_FOR_TPS` is produced by Task 1 and consumed by Tasks 2, 5, 7, 9.

**Known open item carried into execution.** `TPS_GRID_SIZE = 64` is provisional pending a real browser profile; `32` is the documented fallback. The drag tier is safe either way.
