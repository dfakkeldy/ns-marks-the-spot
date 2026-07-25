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
| Least-squares residual does **not** reliably identify a bad GCP | Verified: with one gross outlier at index 3, the largest fit residual was at index **0**. Leave-one-out residual correctly picked index 3. See Task 5. |
| A *conditional* `setState` during render (React's "adjust state when a prop changes") is **lint-clean** under this repo's `eslint-plugin-react-hooks` 7 | Verified: `npx eslint` on a probe using exactly the Task 7 shape exits 0. The banned pattern is `set-state-in-effect`, not this. Do not "fix" the re-seed into a `useEffect`. |
| `<fieldset disabled>` propagates to descendant inputs, and Testing Library's `toBeDisabled()` sees it | Verified by probe. Task 10's locked reference layers need no per-input `disabled`. |
| `UserMapStore.open()` + `saveUserMap(record, raster, preview)` round-trips under the global `fake-indexeddb` | Verified by probe, including `getPreviewBlob(...).text()`. Blobs survive because the store converts them to bytes first — this is why App-level tests can seed a real record instead of mocking `useUserMaps`. |

---

### Task 1: Renderer pixel tests, seam fix, `setLatLngMesh` — **ALREADY LANDED**

Committed as `5a199f76b`. Do **not** redo it; verify and move on.

**What it did:**
- Added `canvas` 3.2.3 to `devDependencies`.
- Replaced `web/src/userMaps/render/WarpedRasterLayer.test.ts` with real pixel assertions (8 tests). PR 1's four tests passed `image: {} as CanvasImageSource` and were green only because jsdom returned no 2D context, so the layer early-returned and the draw never executed. With a real context all four failed instantly with `TypeError: Image or Canvas expected`.
- Fixed a real defect the new tests exposed: adjacent clipped triangles each covered ~50% of their shared boundary pixels, compositing to ~75% alpha — a faint diagonal hairline across every mesh cell. `mesh.ts` now inflates each clip path by `CLIP_OVERDRAW_DEVICE_PX = 2`; the affine is still derived from the **original** corners so image placement is unchanged.
- Added `WarpedRasterLayer.setLatLngMesh(mesh)`, which swaps warp geometry and rebuilds the source lattice without touching `image`.

- [ ] **Step 1: Verify the landed state**

Run: `cd web && npm ci && npx vitest run src/userMaps/render/WarpedRasterLayer.test.ts`
Expected: PASS (8 tests).

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
### Task 3: Transform maths — **ALREADY LANDED**

Committed as `6c1ffd217`. Do **not** redo it; verify and move on.

**What it added** (four pure modules under `web/src/userMaps/transform/`, no Leaflet import, 43 tests green):

- `webMercator.ts` — `toMercator`, `fromMercator`, `groundMetresBetween`, `EARTH_RADIUS_METRES`, `MAX_MERCATOR_LATITUDE`. Verified against `L.Projection.SphericalMercator` to ~3e-9 m, and clamps at the Mercator latitude limit so a pole never yields `Infinity` and NaN the whole mesh.
- `affine.ts` — `type AffineParams = readonly [number, number, number, number, number, number]` (`X = p0*x + p1*y + p2`, `Y = p3*x + p4*y + p5`, pixels in, Mercator metres out), `solveAffine(pairs)`, `solveAffineFromGcps(gcps)`, `applyAffine(params, x, y)`, `MIN_GCPS_FOR_AFFINE = 3`. Solved on centred coordinates: raw pixels (~1e4) against Mercator metres (~7e6) lose precision to cancellation. Returns `null` for collinear/coincident layouts instead of dividing by a singular determinant.
- `residuals.ts` — `residualMetresFor(params, gcps)`, `rmsMetres(residuals)`, `leaveOneOutMetres(gcps)`, `residualReport(gcps, params)`, `MIN_GCPS_FOR_RESIDUALS = 4`, `type ResidualReport = { metresPerGcp: number[]; rmsMetres: number; mostInconsistentIndex: number }`. `residualReport` returns `null` below 4 GCPs.
- `gcpMesh.ts` — `buildGcpLatLngMesh(params, pixelSize, gridSize = AFFINE_GRID_SIZE)`, `AFFINE_GRID_SIZE = 1`. Row = pixel Y, col = pixel X, matching `buildLatLngMesh` in `projection.ts` so `WarpedRasterLayer` consumes either.

**Two decisions worth knowing before you build on it:**

1. **Residuals are ground metres.** A Mercator magnitude over-reports by 1/cos(latitude) — 1.4396x at 46N. `residuals.test.ts` guards this explicitly.
2. **The highlighted row is chosen by leave-one-out, not by largest residual.** Measured on the test fixture: one gross outlier at index 3 produces its *largest fit residual at index 0*. Least squares smears a bad point across its neighbours, so ranking by fit residual accuses an innocent one. The list therefore *displays* conventional fit residuals (comparable with QGIS/Allmaps) but *highlights* by `mostInconsistentIndex`.

- [ ] **Step 1: Verify the landed state**

Run: `cd web && npx vitest run src/userMaps/transform/ && npx eslint src/userMaps/transform/`
Expected: PASS (43 tests), lint silent.

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

Then replace the throwing block. Find:

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
  }
```

And change the return statement's `georef` field. Find:

```ts
    georef: { kind: "embedded", crs, geotransform },
```

Replace with:

```ts
    georef,
```

- [ ] **Step 6: Update the two tests that asserted the old rejection**

In `web/src/userMaps/parsers/geoTiffSource.test.ts`, replace the test named
`"rejects TIFFs without georeferencing as no-georeferencing"` with:

```ts
  it("returns a null georef for TIFFs without georeferencing", async () => {
    // PR 2 changed this from a hard failure: a plain TIFF scan is now a
    // georeferencer job, and geotiff.js is the only thing that can decode it.
    const buffer = await plainTiff({});
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

Read the existing file first — it already establishes the `openStore`/`parse` closure-injection seams and the record-identity assertions. Add a `parseImage` seam alongside them, then append:

```ts
  it("imports a PNG as an ungeoreferenced draft", async () => {
    const { result } = renderHook(() =>
      useUserMaps({
        openStore: () => store,
        parseImage: async () => ({
          pixelSize: { width: 1200, height: 800 },
          preview: new Blob(["preview"], { type: "image/png" }),
          previewSize: { width: 1200, height: 800 },
        }),
      }),
    );
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

  it("routes an ungeoreferenced TIFF to the georeferencer rather than failing", async () => {
    const { result } = renderHook(() =>
      useUserMaps({
        openStore: () => store,
        parse: async () => ({
          pixelSize: { width: 8, height: 6 },
          georef: null,
          preview: new Blob(["preview"], { type: "image/png" }),
          previewSize: { width: 8, height: 6 },
        }),
      }),
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
    const { result } = renderHook(() => useUserMaps({ openStore: () => store }));
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

  it("persists saved GCPs and leaves every other record's identity untouched", async () => {
    const { result } = renderHook(() => useUserMaps({ openStore: () => store }));
    await act(async () => {
      await result.current.importFiles([pngFile("a.png"), pngFile("b.png")]);
    });
    const [first, second] = result.current.records;
    const secondBefore = second;
    await act(async () => {
      await result.current.saveGcps(first.id, [
        { id: "g0", pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -61 } },
      ]);
    });
    const updated = result.current.records.find((r) => r.id === first.id);
    expect(updated?.georef).toMatchObject({ kind: "gcp", method: "affine" });
    expect((updated?.georef as GcpGeoref).gcps).toHaveLength(1);
    // The untouched record must be the SAME object, or UserMapLayers tears
    // down and rebuilds its Leaflet layer for nothing.
    expect(result.current.records.find((r) => r.id === second.id)).toBe(
      secondBefore,
    );
  });
```

Add these helpers near the top of the test file:

```ts
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

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/userMaps/useUserMaps.test.ts`
Expected: FAIL — `parseImage` option unknown, `needsGeoreferencing` undefined.

- [ ] **Step 3: Implement the hook changes** — `web/src/userMaps/useUserMaps.ts`

Add imports:

```ts
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
      let saved: UserMapRecord | null = null;
      setRecords((prev) =>
        prev.map((existing) => {
          if (existing.id !== id) {
            // Same object reference back: UserMapLayers keys its
            // layer-construction effect on record identity, so rebuilding
            // untouched records here would re-decode their bitmaps.
            return existing;
          }
          saved = {
            ...existing,
            georef: { kind: "gcp", gcps, method: "affine" },
          };
          return saved;
        }),
      );
      if (!saved) {
        return;
      }
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
  const editingMap: VisibleUserMap | null =
    editingRecord && previewUrls[editingRecord.id]
      ? {
          record: editingRecord,
          previewUrl: previewUrls[editingRecord.id],
          opacity: uiState[editingRecord.id]?.opacity ?? DEFAULT_OPACITY,
        }
      : null;
```

Add `georeferencingId`, `editingMap`, `beginGeoreference`, `endGeoreference`, `saveGcps`, and `needsGeoreferencing` to the returned object and to the `UserMapsApi` type.

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
- Modify: `web/src/userMaps/components/UserMapLayers.tsx`
- Modify: `web/src/userMaps/components/UserMapLayers.test.tsx`

**Interfaces:**
- Consumes: `buildGcpLatLngMesh` (`../transform/gcpMesh`), `solveAffineFromGcps` (`../transform/affine`), `buildLatLngMesh` (`../transform/projection`), `setLatLngMesh` on `WarpedRasterLayer` (landed in Task 1).
- Produces:
  - `meshForRecord(record: UserMapRecord): LatLngPoint[][] | null` — exported for tests.
  - `type DraftUserMap = VisibleUserMap & { mesh: LatLngPoint[][] | null }`
  - `<UserMapLayers maps={…} draft={…} />` — `draft?: DraftUserMap | null`.

- [ ] **Step 1: Add the failing tests** to `web/src/userMaps/components/UserMapLayers.test.tsx`

Keep every existing test — they pin the record-identity contract. Extend the
`WarpedRasterLayer` class mock with a `setLatLngMesh` spy:

```ts
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

```ts
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

describe("meshForRecord", () => {
  it("builds a solved mesh for a GCP record", () => {
    const mesh = meshForRecord(GCP_RECORD);
    expect(mesh).not.toBeNull();
    // AFFINE_GRID_SIZE is 1, so a GCP mesh is a single cell.
    expect(mesh).toHaveLength(2);
    expect((mesh as LatLngPoint[][])[0][0].lat).toBeCloseTo(46.1, 4);
  });

  it("returns null for a GCP record that cannot be solved", () => {
    expect(
      meshForRecord({
        ...GCP_RECORD,
        georef: { kind: "gcp", method: "affine", gcps: [] },
      }),
    ).toBeNull();
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

  it("still builds an 8x8 mesh for embedded georeferencing", () => {
    // Embedded rasters go pixel -> UTM -> WGS84 -> Mercator, and UTM curves,
    // so they keep the dense lattice. Only the GCP path is exact at 1x1.
    expect(meshForRecord(record)).toHaveLength(9);
  });
});

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
    stubBitmapLoading();
    render(
      <UserMapLayers
        maps={[]}
        draft={{
          record: GCP_RECORD,
          previewUrl: "blob:draft",
          opacity: 0.7,
          mesh: null,
        }}
      />,
    );
    await waitFor(() => expect(stubMapApi.createPane).toHaveBeenCalled());
    expect(stubMapApi.addLayer).not.toHaveBeenCalled();
  });
});
```

Add the imports the new tests need (`meshForRecord`, `LatLngPoint`).

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/userMaps/components/UserMapLayers.test.tsx`
Expected: FAIL — `meshForRecord` is not exported; `draft` prop unknown.

- [ ] **Step 3: Implement** — replace the body of `web/src/userMaps/components/UserMapLayers.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import {
  USER_MAPS_PANE,
  USER_MAPS_PANE_Z_INDEX,
} from "../../components/mapPanes";
import { solveAffineFromGcps } from "../transform/affine";
import { buildGcpLatLngMesh } from "../transform/gcpMesh";
import { buildLatLngMesh, type LatLngPoint } from "../transform/projection";
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

/**
 * Geographic lattice for a saved record, or null when it cannot be placed
 * yet (a draft with fewer than three points, or points that are collinear).
 */
export function meshForRecord(record: UserMapRecord): LatLngPoint[][] | null {
  if (record.georef.kind === "embedded") {
    return buildLatLngMesh(record.georef, record.pixelSize);
  }
  const params = solveAffineFromGcps(record.georef.gcps);
  return params ? buildGcpLatLngMesh(params, record.pixelSize) : null;
}

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
        <WarpedRasterOverlay
          key={map.record.id}
          previewUrl={map.previewUrl}
          opacity={map.opacity}
          mesh={meshForRecord(map.record)}
        />
      ))}
      {draft ? (
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
favour of `previewUrl`, which is strictly more stable — `previewUrl` is a blob
URL created once per map and only revoked on removal. The existing identity
tests still pass because they never change `previewUrl`. The `meshForRecord`
call in the render body is pure and cheap (one 3x3 solve, four projections).

- [ ] **Step 4: Run to verify they pass**

Run: `cd web && npx vitest run src/userMaps/components/UserMapLayers.test.tsx`
Expected: PASS — every pre-existing test plus the new ones.

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/components/UserMapLayers.tsx web/src/userMaps/components/UserMapLayers.test.tsx
git commit -m "feat(web): render GCP-georeferenced maps and the live georeferencing draft"
```

---

### Task 7: `useGeoreferenceSession` — state machine, undo, debounced write-through

**Files:**
- Create: `web/src/userMaps/useGeoreferenceSession.ts`
- Test: `web/src/userMaps/useGeoreferenceSession.test.ts`

**Interfaces:**
- Consumes: `Gcp` (`./types`); `solveAffineFromGcps`, `MIN_GCPS_FOR_AFFINE`, `AffineParams` (`./transform/affine`); `buildGcpLatLngMesh` (`./transform/gcpMesh`); `residualReport`, `ResidualReport`, `MIN_GCPS_FOR_RESIDUALS` (`./transform/residuals`); `PixelSize`, `LatLngPoint` (`./transform/projection`).
- Produces:
  - `type PendingPoint = { side: "scan"; pixel: { x: number; y: number } } | { side: "map"; map: LatLngPoint } | null`
  - `type GeoreferenceStatus = { kind: "awaiting-map" } | { kind: "awaiting-scan" } | { kind: "need-more"; remaining: number } | { kind: "collinear" } | { kind: "exact-fit" } | { kind: "solved"; rmsMetres: number; count: number }`
  - `type GeoreferenceSession = { gcps; pending; params; mesh; report; status; canUndo; pickScanPoint(x, y); pickMapPoint(lat, lng); cancelPending(); beginDragGcp(id); moveGcpOnScan(id, x, y); moveGcpOnMap(id, lat, lng); deleteGcp(id); undo(); flush() }`
  - `useGeoreferenceSession(options: { mapId: string | null; initialGcps: Gcp[]; pixelSize: PixelSize; onPersist: (mapId: string, gcps: Gcp[]) => void; persistDelayMs?: number }): GeoreferenceSession`
  - `UNDO_HISTORY_LIMIT = 50`, `PERSIST_DELAY_MS = 400`

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

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/useGeoreferenceSession.test.ts`:

```ts
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
    expect(result.current.mesh).not.toBeNull();
  });

  it("reports RMS from the fourth point on", () => {
    const { result } = setup([
      ...SOLVABLE,
      { id: "d", pixel: { x: 1200, y: 800 }, map: { lat: 46.0, lng: -61.0 } },
    ]);
    expect(result.current.status.kind).toBe("solved");
    expect(result.current.report).not.toBeNull();
  });

  it("reports collinear points rather than drawing a NaN drape", () => {
    const { result } = setup([
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
      { id: "b", pixel: { x: 100, y: 100 }, map: { lat: 46.1, lng: -61.1 } },
      { id: "c", pixel: { x: 200, y: 200 }, map: { lat: 46.2, lng: -61.2 } },
    ]);
    expect(result.current.status).toEqual({ kind: "collinear" });
    expect(result.current.mesh).toBeNull();
    expect(result.current.params).toBeNull();
  });

  it("lets a pending point take precedence over the count", () => {
    const { result } = setup(SOLVABLE);
    act(() => result.current.pickScanPoint(50, 50));
    expect(result.current.status).toEqual({ kind: "awaiting-map" });
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  | { kind: "collinear" }
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
  const [gcps, setGcps] = useState<Gcp[]>(options.initialGcps);
  const [pending, setPending] = useState<PendingPoint>(null);
  const [history, setHistory] = useState<Gcp[][]>([]);
  const [seededFor, setSeededFor] = useState<string | null>(mapId);

  // React's documented "adjust state when a prop changes": a CONDITIONAL
  // setState during render. Not an effect — `set-state-in-effect` is an error
  // here, and an effect would also render one frame of the previous map's
  // points over the new map. Verified lint-clean against this repo's config.
  if (mapId !== seededFor) {
    setSeededFor(mapId);
    setGcps(options.initialGcps);
    setPending(null);
    setHistory([]);
  }

  const onPersistRef = useRef(options.onPersist);
  const timerRef = useRef<number | null>(null);
  const dirtyRef = useRef<{ mapId: string; gcps: Gcp[] } | null>(null);

  useEffect(() => {
    onPersistRef.current = options.onPersist;
  }, [options.onPersist]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (dirtyRef.current) {
      // The id travels with the payload, so a flush that lands after the
      // session has moved on still writes to the right record.
      onPersistRef.current(dirtyRef.current.mapId, dirtyRef.current.gcps);
      dirtyRef.current = null;
    }
  }, []);

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
      dirtyRef.current = { mapId, gcps: next };
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (dirtyRef.current) {
          onPersistRef.current(dirtyRef.current.mapId, dirtyRef.current.gcps);
          dirtyRef.current = null;
        }
      }, persistDelay);
    },
    [mapId, persistDelay],
  );

  useEffect(() => flush, [flush]);

  const commit = useCallback(
    (next: Gcp[]) => {
      setGcps(next);
      schedulePersist(next);
    },
    [schedulePersist],
  );

  /** Snapshot BEFORE a change, so undo restores the prior state. */
  const snapshot = useCallback(() => {
    setGcps((current) => {
      setHistory((past) => [...past, current].slice(-UNDO_HISTORY_LIMIT));
      return current;
    });
  }, []);

  const pickScanPoint = useCallback(
    (x: number, y: number) => {
      setPending((current) => {
        if (current?.side === "map") {
          snapshot();
          const completed = current.map;
          setGcps((existing) => {
            const next = [
              ...existing,
              { id: nextGcpId(), pixel: { x, y }, map: completed },
            ];
            schedulePersist(next);
            return next;
          });
          return null;
        }
        return { side: "scan", pixel: { x, y } };
      });
    },
    [schedulePersist, snapshot],
  );

  const pickMapPoint = useCallback(
    (lat: number, lng: number) => {
      setPending((current) => {
        if (current?.side === "scan") {
          snapshot();
          const pixel = current.pixel;
          setGcps((existing) => {
            const next = [
              ...existing,
              { id: nextGcpId(), pixel, map: { lat, lng } },
            ];
            schedulePersist(next);
            return next;
          });
          return null;
        }
        return { side: "map", map: { lat, lng } };
      });
    },
    [schedulePersist, snapshot],
  );

  const cancelPending = useCallback(() => setPending(null), []);

  /**
   * Called on drag START only. Snapshotting per pointer move would make undo
   * useless: one drag would fill the entire history with frames that differ
   * by a pixel.
   */
  const beginDragGcp = useCallback(() => snapshot(), [snapshot]);

  const moveGcpOnScan = useCallback(
    (id: string, x: number, y: number) => {
      setGcps((existing) => {
        const next = existing.map((gcp) =>
          gcp.id === id ? { ...gcp, pixel: { x, y } } : gcp,
        );
        schedulePersist(next);
        return next;
      });
    },
    [schedulePersist],
  );

  const moveGcpOnMap = useCallback(
    (id: string, lat: number, lng: number) => {
      setGcps((existing) => {
        const next = existing.map((gcp) =>
          gcp.id === id ? { ...gcp, map: { lat, lng } } : gcp,
        );
        schedulePersist(next);
        return next;
      });
    },
    [schedulePersist],
  );

  const deleteGcp = useCallback(
    (id: string) => {
      snapshot();
      setGcps((existing) => {
        const next = existing.filter((gcp) => gcp.id !== id);
        schedulePersist(next);
        return next;
      });
    },
    [schedulePersist, snapshot],
  );

  const undo = useCallback(() => {
    setHistory((past) => {
      if (past.length === 0) {
        return past;
      }
      const restored = past[past.length - 1];
      setGcps(restored);
      schedulePersist(restored);
      return past.slice(0, -1);
    });
    setPending(null);
  }, [schedulePersist]);

  const params = useMemo(() => solveAffineFromGcps(gcps), [gcps]);
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
      return { kind: "collinear" };
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
    canUndo: history.length > 0,
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

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/userMaps/useGeoreferenceSession.test.ts`
Expected: PASS (20 tests).

If `react-hooks/set-state-in-effect` or `exhaustive-deps` complains about the
`snapshot` helper calling `setHistory` inside a `setGcps` updater, restructure
`snapshot` to take the current list as an argument from each caller instead of
reading it through an updater. Do **not** silence the rule.

- [ ] **Step 5: Lint and commit**

```bash
cd web && npx eslint src/userMaps/useGeoreferenceSession.ts
git add web/src/userMaps/useGeoreferenceSession.ts web/src/userMaps/useGeoreferenceSession.test.ts
git commit -m "feat(web): add the georeferencing session state machine with undo"
```

---
### Task 8: `ScanPane` — the scan side, on `CRS.Simple`

**Files:**
- Create: `web/src/userMaps/components/ScanPane.tsx`
- Test: `web/src/userMaps/components/ScanPane.test.tsx`

**Interfaces:**
- Produces:
  - `pixelFromLatLng(latLng: { lat: number; lng: number }): { x: number; y: number }`
  - `latLngFromPixel(pixel: { x: number; y: number }): [number, number]`
  - `scanBounds(pixelSize: PixelSize): [[number, number], [number, number]]`
  - `<ScanPane previewUrl pixelSize gcps pending onPickPoint onDragStartGcp onMoveGcp selectedGcpId />`

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

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/components/ScanPane.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { latLngFromPixel, pixelFromLatLng, scanBounds } from "./ScanPane";

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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/ScanPane.test.tsx`
Expected: FAIL — cannot resolve `./ScanPane`.

- [ ] **Step 3: Implement** — `web/src/userMaps/components/ScanPane.tsx`:

```tsx
import L from "leaflet";
import { ImageOverlay, MapContainer, Marker, useMapEvents } from "react-leaflet";
import type { PixelSize } from "../transform/projection";
import type { PendingPoint } from "../useGeoreferenceSession";
import type { Gcp } from "../types";

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

function numberedIcon(label: string, pendingHalf: boolean): L.DivIcon {
  return L.divIcon({
    className: `gcp-marker${pendingHalf ? " gcp-marker--pending" : ""}`,
    html: `<span>${label}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function ScanClickCatcher({
  onPickPoint,
}: {
  onPickPoint: (x: number, y: number) => void;
}) {
  useMapEvents({
    click: ({ latlng }) => {
      const { x, y } = pixelFromLatLng(latlng);
      onPickPoint(x, y);
    },
  });
  return null;
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
  onPickPoint,
  onDragStartGcp,
  onMoveGcp,
  selectedGcpId,
}: {
  previewUrl: string;
  pixelSize: PixelSize;
  gcps: Gcp[];
  pending: PendingPoint;
  onPickPoint: (x: number, y: number) => void;
  onDragStartGcp: (id: string) => void;
  onMoveGcp: (id: string, x: number, y: number) => void;
  selectedGcpId: string | null;
}) {
  const bounds = scanBounds(pixelSize);
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
        <ScanClickCatcher onPickPoint={onPickPoint} />
        {gcps.map((gcp, index) => (
          <Marker
            key={gcp.id}
            position={latLngFromPixel(gcp.pixel)}
            draggable
            icon={numberedIcon(
              String(index + 1),
              gcp.id === selectedGcpId,
            )}
            eventHandlers={{
              dragstart: () => onDragStartGcp(gcp.id),
              drag: (event) => {
                const { x, y } = pixelFromLatLng(
                  (event.target as L.Marker).getLatLng(),
                );
                onMoveGcp(gcp.id, x, y);
              },
            }}
          />
        ))}
        {pending?.side === "scan" ? (
          <Marker
            position={latLngFromPixel(pending.pixel)}
            icon={numberedIcon(String(gcps.length + 1), true)}
            interactive={false}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/userMaps/components/ScanPane.test.tsx`
Expected: PASS (4 tests). The helpers are pure, so this file needs no
react-leaflet mock; the component itself is covered through
`GeoreferencePanel.test.tsx` in Task 10.

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/components/ScanPane.tsx web/src/userMaps/components/ScanPane.test.tsx
git commit -m "feat(web): add the georeferencer scan pane on CRS.Simple"
```

---

### Task 9: `GcpList` — residual table

**Files:**
- Create: `web/src/userMaps/components/GcpList.tsx`
- Test: `web/src/userMaps/components/GcpList.test.tsx`

**Interfaces:**
- Produces: `<GcpList gcps report onDelete onSelect selectedGcpId />`, and `formatResidual(metres: number): string`.

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
];

describe("GcpList", () => {
  it("shows an em dash rather than a misleading 0 m at three points", () => {
    render(
      <GcpList
        gcps={GCPS.slice(0, 3)}
        report={null}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
        selectedGcpId={null}
      />,
    );
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("0 m")).toBeNull();
  });

  it("renders residuals in metres and marks the most inconsistent point", () => {
    render(
      <GcpList
        gcps={GCPS}
        report={{
          metresPerGcp: [12.4, 8.1, 40.9, 15.2],
          rmsMetres: 22.3,
          mostInconsistentIndex: 3,
        }}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
        selectedGcpId={null}
      />,
    );
    expect(screen.getByText("12 m")).toBeInTheDocument();
    expect(screen.getByText("41 m")).toBeInTheDocument();
    // Highlighted by leave-one-out (index 3), NOT by the largest displayed
    // residual (index 2) — least squares smears a bad point across its
    // neighbours, so the biggest number is often an innocent one.
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[3]).toHaveClass("gcp-row--suspect");
    expect(rows[2]).not.toHaveClass("gcp-row--suspect");
  });

  it("deletes a point by its number", async () => {
    const onDelete = vi.fn();
    render(
      <GcpList
        gcps={GCPS}
        report={null}
        onDelete={onDelete}
        onSelect={vi.fn()}
        selectedGcpId={null}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete point 2" }));
    expect(onDelete).toHaveBeenCalledWith("b");
  });

  it("says nothing at all when there are no points", () => {
    render(
      <GcpList
        gcps={[]}
        report={null}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
        selectedGcpId={null}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
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
 */
export function formatResidual(metres: number): string {
  return `${Math.round(metres)} m`;
}

export function GcpList({
  gcps,
  report,
  onDelete,
  onSelect,
  selectedGcpId,
}: {
  gcps: Gcp[];
  report: ResidualReport | null;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
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
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {gcps.map((gcp, index) => {
          const suspect = report?.mostInconsistentIndex === index;
          const rowClass = [
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

Run: `cd web && npx vitest run src/userMaps/components/GcpList.test.tsx`
Expected: PASS (4 tests). If `.visually-hidden` is not already in
`styles.css`, add it in Task 12 — the test does not depend on it.

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/components/GcpList.tsx web/src/userMaps/components/GcpList.test.tsx
git commit -m "feat(web): add the GCP residual list"
```

---
### Task 10: `GeoreferencePanel` — the shell

**Files:**
- Create: `web/src/userMaps/components/GeoreferencePanel.tsx`
- Test: `web/src/userMaps/components/GeoreferencePanel.test.tsx`

**Interfaces:**
- Consumes: `ScanPane` (Task 8), `GcpList` (Task 9), `GeoreferenceSession` and `GeoreferenceStatus` (Task 7).
- Produces:
  - `statusMessage(status: GeoreferenceStatus): string` — exported so the copy is testable without rendering Leaflet.
  - `<GeoreferencePanel record previewUrl opacity session onOpacityChange onClose onDelete referenceLayers referenceLayersLocked onToggleReferenceLayer />`
  - `type ReferenceLayerState = { aerial: boolean; parcels: boolean }`

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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// ScanPane mounts a real MapContainer, which needs a sized DOM node jsdom
// does not provide. The panel's own behaviour is what this file tests, so the
// scan side is stubbed; its coordinate maths has direct tests in Task 8.
vi.mock("./ScanPane", () => ({
  ScanPane: () => <div data-testid="scan-pane" />,
}));

import { GeoreferencePanel, statusMessage } from "./GeoreferencePanel";
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
    ...overrides,
  };
}

function renderPanel(session: GeoreferenceSession, props: Partial<Parameters<typeof GeoreferencePanel>[0]> = {}) {
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const onOpacityChange = vi.fn();
  const onToggleReferenceLayer = vi.fn();
  render(
    <GeoreferencePanel
      record={RECORD}
      previewUrl="blob:scan"
      opacity={0.7}
      session={session}
      onOpacityChange={onOpacityChange}
      onClose={onClose}
      onDelete={onDelete}
      referenceLayers={{ aerial: false, parcels: true }}
      referenceLayersLocked={false}
      onToggleReferenceLayer={onToggleReferenceLayer}
      {...props}
    />,
  );
  return { onClose, onDelete, onOpacityChange, onToggleReferenceLayer };
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

  it("explains a collinear layout in terms of what to do about it", () => {
    expect(statusMessage({ kind: "collinear" })).toBe(
      "These points are almost in a straight line — move one off the line to solve.",
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
  it("announces status politely for screen readers", () => {
    renderPanel(fakeSession());
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Place 3 points to see the map drape.");
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

  it("closes on Escape when nothing is pending", async () => {
    const { onClose } = renderPanel(fakeSession());
    await userEvent.keyboard("{Escape}");
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

  it("drives the drape opacity", async () => {
    const { onOpacityChange } = renderPanel(fakeSession());
    const slider = screen.getByRole("slider", { name: "Map opacity" });
    expect(slider).toHaveValue("70");
    await userEvent.clear(slider);
    expect(onOpacityChange).toHaveBeenCalled();
  });

  it("confirms before deleting the map", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onDelete } = renderPanel(fakeSession());
    await userEvent.click(screen.getByRole("button", { name: "Delete map" }));
    expect(onDelete).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete map" }));
    expect(onDelete).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/GeoreferencePanel.test.tsx`
Expected: FAIL — cannot resolve `./GeoreferencePanel`.

- [ ] **Step 3: Implement** — `web/src/userMaps/components/GeoreferencePanel.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { GeoreferenceSession, GeoreferenceStatus } from "../useGeoreferenceSession";
import type { UserMapRecord } from "../types";
import { GcpList } from "./GcpList";
import { ScanPane } from "./ScanPane";

export type ReferenceLayerId = "aerial" | "parcels";
export type ReferenceLayerState = Record<ReferenceLayerId, boolean>;

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
    case "collinear":
      return "These points are almost in a straight line — move one off the line to solve.";
    case "exact-fit":
      // Three points fit an affine exactly by construction, so every residual
      // is 0. Printing "0 m" would read as perfect accuracy.
      return "Exact fit — add a 4th point to check accuracy.";
    case "solved":
      return `RMS ${Math.round(status.rmsMetres)} m across ${status.count} points`;
  }
}

export function GeoreferencePanel({
  record,
  previewUrl,
  opacity,
  session,
  onOpacityChange,
  onClose,
  onDelete,
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
  onDelete: () => void;
  referenceLayers: ReferenceLayerState;
  referenceLayersLocked?: boolean;
  onToggleReferenceLayer: (id: ReferenceLayerId, enabled: boolean) => void;
}) {
  const [tab, setTab] = useState<"scan" | "map">("scan");
  const [selectedGcpId, setSelectedGcpId] = useState<string | null>(null);
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

  return (
    <section
      className={`georeference-panel georeference-panel--${tab}`}
      aria-label={`Georeferencing ${record.name}`}
    >
      <header className="georeference-header">
        <h2>{record.name}</h2>
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
        <p role="status" aria-live="polite" className="georeference-status">
          {statusMessage(session.status)}
        </p>
      </header>

      <ScanPane
        previewUrl={previewUrl}
        pixelSize={record.pixelSize}
        gcps={session.gcps}
        pending={session.pending}
        onPickPoint={session.pickScanPoint}
        onDragStartGcp={session.beginDragGcp}
        onMoveGcp={session.moveGcpOnScan}
        selectedGcpId={selectedGcpId}
      />

      <div className="georeference-points">
        <GcpList
          gcps={session.gcps}
          report={session.report}
          onDelete={session.deleteGcp}
          onSelect={setSelectedGcpId}
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

        <fieldset className="georeference-references" disabled={referenceLayersLocked}>
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
              Accept the provincial data licence in the layer list to use these.
            </small>
          ) : null}
        </fieldset>

        <div className="georeference-actions">
          <button type="button" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="georeference-done" onClick={close}>
            Done
          </button>
          <button
            type="button"
            className="georeference-delete"
            onClick={() => {
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
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/userMaps/components/GeoreferencePanel.test.tsx`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/components/GeoreferencePanel.tsx web/src/userMaps/components/GeoreferencePanel.test.tsx
git commit -m "feat(web): add the georeferencer panel shell"
```

---

### Task 11: `GeoreferenceMapLayer` and the `MapCanvas` binding

**Files:**
- Create: `web/src/userMaps/components/GeoreferenceMapLayer.tsx`
- Test: `web/src/userMaps/components/GeoreferenceMapLayer.test.tsx`
- Modify: `web/src/components/MapCanvas.tsx`
- Modify: `web/src/components/mapPanes.ts` (one constant pair)
- Test: `web/src/components/mapPanes.test.ts` (extend ordering assertions)

**Interfaces:**
- Produces:
  - `type GeoreferenceBinding = { gcps: Gcp[]; pending: PendingPoint; draft: DraftUserMap | null; onPickMapPoint: (lat: number, lng: number) => void; onDragStartGcp: (id: string) => void; onMoveGcpOnMap: (id: string, lat: number, lng: number) => void }`

**No selection state crosses to the map.** `GcpList`'s selected row is panel
state and stays there. The map markers already carry their point's number
(`numberedIcon`), which is how the user finds the row's point on the map — so
threading a selected id through `App` would buy a highlight nobody asked for
at the cost of a third owner for one piece of state.
  - `<GeoreferenceMapLayer binding={…} />`
  - `mapPanes.ts`: `GEOREFERENCE_PANE = "georeference-pane"`, `GEOREFERENCE_PANE_Z_INDEX = 700`
- `MapCanvas` gains one optional prop: `georeference?: GeoreferenceBinding | null`.

**Pane placement:** GCP markers must sit above every data overlay (waterfalls
are the current top at 250) — a control point hidden under a parcel line is
unclickable. 700 is Leaflet's own marker-pane z-index, which is the right
neighbourhood.

- [ ] **Step 1: Add the pane constants** to `web/src/components/mapPanes.ts`, following the existing shape, and extend `mapPanes.test.ts`:

```ts
  it("keeps georeferencing markers above every data overlay", () => {
    // A control point under a parcel line cannot be clicked or dragged.
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeGreaterThan(
      Math.max(...Object.values(PANE_Z_INDEXES)),
    );
  });
```

Adjust the assertion to whatever the file already exports for the z-index map.

- [ ] **Step 2: Write the failing layer test** — `web/src/userMaps/components/GeoreferenceMapLayer.test.tsx`:

Follow the mocking convention in `UserMapLayers.test.tsx` exactly: `vi.hoisted`
stubs for `useMap`, and `vi.mock("react-leaflet", …)` also supplying `Marker`
and `useMapEvents`.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({ click: null as ((e: unknown) => void) | null }));

vi.mock("react-leaflet", () => ({
  useMap: () => ({
    getPane: vi.fn(() => document.createElement("div")),
    createPane: vi.fn(() => document.createElement("div")),
  }),
  useMapEvents: (map: { click: (e: unknown) => void }) => {
    handlers.click = map.click;
    return null;
  },
  Marker: ({ position }: { position: [number, number] }) => (
    <div data-testid="gcp-marker" data-position={position.join(",")} />
  ),
}));

import { GeoreferenceMapLayer } from "./GeoreferenceMapLayer";

const BINDING = {
  gcps: [
    { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
    { id: "b", pixel: { x: 10, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
  ],
  pending: null,
  draft: null,
  onPickMapPoint: vi.fn(),
  onDragStartGcp: vi.fn(),
  onMoveGcpOnMap: vi.fn(),
};

describe("GeoreferenceMapLayer", () => {
  it("renders one marker per GCP at its stored WGS84 position", () => {
    render(<GeoreferenceMapLayer binding={BINDING} />);
    const markers = screen.getAllByTestId("gcp-marker");
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute("data-position", "46.1,-61.2");
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
});
```

- [ ] **Step 3: Implement** — `web/src/userMaps/components/GeoreferenceMapLayer.tsx`

Mirror `ScanPane`'s marker code (same `numberedIcon` helper — export it from
`ScanPane.tsx` and import it here rather than duplicating), create the
georeference pane on mount the way `UserMapLayers` creates the user-maps pane,
render a `<Marker draggable>` per GCP wired to `onDragStartGcp` / `onMoveGcpOnMap`,
render the pending marker when `pending?.side === "map"`, and mount a
`useMapEvents({ click })` catcher calling `onPickMapPoint(latlng.lat, latlng.lng)`.

- [ ] **Step 4: Wire `MapCanvas`**

Add the prop to `MapCanvasProps`:

```ts
  georeference?: GeoreferenceBinding | null;
```

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

- [ ] **Step 5: Run the affected suites**

Run: `cd web && npx vitest run src/userMaps/components/ src/components/MapCanvas.test.tsx src/components/mapPanes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/userMaps/components/GeoreferenceMapLayer.tsx web/src/userMaps/components/GeoreferenceMapLayer.test.tsx web/src/components/MapCanvas.tsx web/src/components/mapPanes.ts web/src/components/mapPanes.test.ts
git commit -m "feat(web): place and drag GCPs on the live map"
```

---

### Task 12: `App` wiring, the "Needs georeferencing" affordance, and styles

**Files:**
- Modify: `web/src/userMaps/components/UserMapRows.tsx`
- Modify: `web/src/userMaps/components/UserMapRows.test.tsx`
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

Read `web/src/userMaps/components/UserMapRows.test.tsx` first and reuse its
existing `api` factory rather than writing a new one; extend that factory with
the Task 5 additions (`beginGeoreference: vi.fn()`, `needsGeoreferencing: () =>
false`, `georeferencingId: null`, `endGeoreference: vi.fn()`, `saveGcps:
vi.fn()`, `editingMap: null`). Then append:

```tsx
const NEEDS_WORK: UserMapRecord = {
  id: "scan",
  name: "Church of Inverness 1888",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: { kind: "gcp", method: "affine", gcps: [] },
};

describe("georeferencing affordance", () => {
  it("says a scan cannot be drawn yet, and why", () => {
    render(
      <UserMapRows
        api={makeApi({ records: [NEEDS_WORK], needsGeoreferencing: () => true })}
      />,
    );
    expect(screen.getByText("Needs georeferencing")).toBeInTheDocument();
    // A checkbox that turns on a layer which then draws nothing is a lie.
    expect(
      screen.getByRole("checkbox", { name: NEEDS_WORK.name }),
    ).toBeDisabled();
  });

  it("opens the georeferencer for the map that was clicked", async () => {
    const beginGeoreference = vi.fn();
    render(
      <UserMapRows
        api={makeApi({
          records: [NEEDS_WORK],
          needsGeoreferencing: () => true,
          beginGeoreference,
        })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Georeference Church of Inverness 1888" }),
    );
    expect(beginGeoreference).toHaveBeenCalledWith("scan");
  });

  it("offers a placed map its points back rather than a fresh start", () => {
    render(
      <UserMapRows
        api={makeApi({
          records: [
            { ...NEEDS_WORK, georef: { kind: "gcp", method: "affine", gcps: PLACED_GCPS } },
          ],
          needsGeoreferencing: () => false,
        })}
      />,
    );
    expect(screen.queryByText("Needs georeferencing")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit points for Church of Inverness 1888" }),
    ).toBeInTheDocument();
  });

  it("offers no point editing for a map that carries its own georeferencing", () => {
    // An embedded GeoTIFF has a geotransform, not control points. There is
    // nothing for the GCP editor to edit.
    render(
      <UserMapRows
        api={makeApi({
          records: [
            {
              ...NEEDS_WORK,
              source: "geotiff",
              georef: { kind: "embedded", crs: "EPSG:2961", geoTransform: EMBEDDED_TRANSFORM },
            },
          ],
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: /Georeference|Edit points/ })).toBeNull();
  });
});
```

Define `PLACED_GCPS` as any three non-collinear points and `EMBEDDED_TRANSFORM`
to match whatever shape `EmbeddedGeoref` already uses in `types.ts` — read it,
do not invent it.

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

And add the button as a sibling of Remove, inside the same row `<div>` (never
inside the `<label>` — the file's own header comment explains why):

```tsx
              {isGcp ? (
                <button
                  type="button"
                  className="user-map-georeference"
                  aria-label={
                    needsWork
                      ? `Georeference ${record.name}`
                      : `Edit points for ${record.name}`
                  }
                  onClick={() => api.beginGeoreference(record.id)}
                >
                  {needsWork ? "Georeference" : "Edit points"}
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
```

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
    await seedScan();
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    expect(screen.getByTestId("scan-pane")).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: scan-1",
    );
    // The map under edit is drawn by the georeferencer's own draft, so the
    // saved-map layer must not also draw it — that would be two canvases
    // fighting, and the saved layer would rebuild on every pointer move.
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "saved user map layers: 0",
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
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    await seedScan();
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Property boundaries" }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "property boundaries: on",
    );
  });
});
```

Import `UserMapStore` from `./userMaps/store/userMapStore` and `UserMapRecord`
from `./userMaps/types` at the top of the file. The last test assumes `nsprd`
starts off; check the default in `initialProvinceLayerVisibility` and flip the
expectation (click to turn it *off*) if it starts on.

- [ ] **Step 5: Implement the `App` wiring** — `web/src/App.tsx`

Add imports beside the existing user-map imports (line ~150):

```tsx
import { useGeoreferenceSession } from "./userMaps/useGeoreferenceSession";
import { GeoreferencePanel } from "./userMaps/components/GeoreferencePanel";
import type { ReferenceLayerId } from "./userMaps/components/GeoreferencePanel";
import type { GeoreferenceBinding } from "./userMaps/components/GeoreferenceMapLayer";
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

  // A new `draft` object on every mesh change is the intended hot path:
  // UserMapLayers keys its layer build on `previewUrl` and pushes geometry
  // through `setLatLngMesh`, so this never re-decodes the bitmap (Task 6).
  const georeferenceBinding = useMemo<GeoreferenceBinding | null>(
    () =>
      editingMap
        ? {
            gcps: georeferenceGcps,
            pending: georeferencePending,
            draft: { ...editingMap, mesh: georeferenceMesh },
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
        onClose={userMapsApi.endGeoreference}
        onDelete={() => {
          if (
            window.confirm(
              `Remove "${editingMap.record.name}" from this device? The ` +
                "original file on your computer is not affected.",
            )
          ) {
            userMapsApi.endGeoreference();
            void userMapsApi.removeMap(editingMap.record.id);
          }
        }}
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

`endGeoreference` runs before `removeMap` so the panel unmounts against a
record that still exists; the reverse order renders one frame of a panel whose
record is gone.

- [ ] **Step 6: Write the failing style tests** — add to `web/src/styles.test.ts`

```ts
describe("georeferencer overlay", () => {
  it("sits above the map furniture but below the app's dialogs", () => {
    const overlay = styles.match(/\.georeference-overlay\s*\{([^}]*)\}/)?.[1];
    expect(overlay).toMatch(/position:\s*fixed/);
    const overlayZ = Number(overlay?.match(/z-index:\s*(\d+)/)?.[1]);
    const dialogZ = Number(
      styles
        .match(/\.dialog-backdrop\s*\{([^}]*)\}/)?.[1]
        ?.match(/z-index:\s*(\d+)/)?.[1],
    );
    expect(overlayZ).toBeGreaterThan(1200);
    expect(overlayZ).toBeLessThan(dialogZ);
  });

  it("stacks the split view on phones instead of squeezing both panes", () => {
    const narrowStart = styles.lastIndexOf("@media (max-width: 860px)");
    const narrow = styles.slice(narrowStart);
    const panel = narrow.match(/\.georeference-panel\s*\{([^}]*)\}/)?.[1];
    expect(panel).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it("marks the suspect control point by more than colour", () => {
    // WCAG 1.4.1: colour alone cannot be the only carrier of meaning.
    const suspect = styles.match(/\.gcp-row--suspect\s*\{([^}]*)\}/)?.[1];
    expect(suspect).toBeDefined();
    expect(suspect).toMatch(/border-inline-start|font-weight/);
  });
});
```

- [ ] **Step 7: Implement the styles** — append to `web/src/styles.css`, in the
      same "Your maps" section, keeping the file's existing formatting

```css
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

/* Georeferencer (PR 2) */
.georeference-overlay {
  position: fixed;
  z-index: 1800;
  inset: 0;
  display: grid;
  background: rgb(10 20 22 / 72%);
}

.georeference-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0;
  margin: 16px;
  overflow: hidden;
  background: var(--paper);
  border-radius: 8px;
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

.georeference-side {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  padding: 12px;
  gap: 10px;
  border-left: 1px solid rgb(10 20 22 / 12%);
  overflow-y: auto;
}

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

And inside the existing narrow breakpoint at the END of the file (the second
`@media (max-width: 860px)` block — the style test reads the last one):

```css
  .georeference-panel {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    margin: 8px;
  }

  .georeference-side {
    border-left: 0;
    border-top: 1px solid rgb(10 20 22 / 12%);
  }

  .georeference-tabs {
    display: flex;
    grid-column: 1 / -1;
    gap: 6px;
    padding: 0 14px 8px;
  }

  /* One pane at a time; the tab buttons pick which. */
  .georeference-panel[data-tab="map"] .georeference-scan,
  .georeference-panel[data-tab="scan"] .georeference-side {
    display: none;
  }
```

The `data-tab` attribute comes from Task 10's `tab` state — confirm the panel
sets it on the same element that carries `.georeference-panel`, and add it if
Task 10's implementation put it elsewhere.

- [ ] **Step 8: Run the full suite and lint**

Run: `cd web && npm test -- --run && npx tsc --noEmit && npx eslint src`
Expected: PASS, no type errors, no lint errors. Every pre-existing test must
still pass — if any `App.test.tsx` test broke, the wiring changed behaviour it
was pinning; fix the wiring, not the test, unless the test was asserting the
old "GeoTIFF only" copy.

- [ ] **Step 9: Commit**

```bash
git add web/src/App.tsx web/src/App.test.tsx web/src/userMaps/components/UserMapRows.tsx web/src/userMaps/components/UserMapRows.test.tsx web/src/styles.css web/src/styles.test.ts
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
metres, and the point flagged as suspect is chosen by leave-one-out refit
rather than by largest fit residual — least squares smears a single gross
error across every point, so the largest residual routinely lands on an
innocent one. GCP markers get their own pane (`georeference-pane`, z-700,
above every data overlay) so a control point is never buried under a parcel
line.
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
2. Open the georeferencer. The scan pane shows the whole image, pannable and
   zoomable independently of the map.
3. Place two points. The status line asks for the third; nothing drapes yet.
4. Place the third. **The scan drapes immediately**, and the status says
   "Exact fit — add a 4th point to check accuracy." No "0 m" anywhere.
5. Drag a point on the map. The drape follows **during** the drag, not on
   release, and there is no flicker (a flicker means the bitmap is being
   re-decoded — Task 6's identity contract has broken).
6. Place a 4th point deliberately wrong. Its row is flagged and the RMS jumps.
   Delete it; the flag and the RMS recover.
7. Undo (button and Cmd/Ctrl+Z) walks back point-by-point.
8. Toggle the two reference layers from the panel footer; both appear under
   the drape.
9. Close the panel, reload the page, reopen the georeferencer. The points are
   still there — this is the debounced IndexedDB write-through, and its
   flush-on-close is the part most likely to be subtly wrong.
10. Narrow the window below 860 px. The panes stack and the tab toggle appears.

Capture a screenshot of step 4 or 5 for the PR description.

- [ ] **Step 7: Open the PR into `nightly`**

```bash
git fetch origin && git rebase origin/nightly
git push -u origin claude/web-georeferencer-user-maps-76f482
gh pr create --base nightly --title "feat(web): in-browser georeferencer for user maps (PR 2 of 4)" --body-file -
```

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
      point" copy, leave-one-out suspect selection, and undo snapshotting on
      drag START rather than per pointer move.
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
