# Web "Your Maps" PR 1 — GeoTIFF End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 2 (2026-07-24):** rewritten after a full adversarial review by
> Codex `gpt-5.6-sol` (15 findings, 4 blockers). Key changes: geotiff pinned
> to 2.1.3 (the 3.x rewrite changed `getFileDirectory()`), decode moved into a
> web worker with a main-thread fallback, pane moved to z-160, quota failures
> keep the map in memory, 16-bit scaling, PixelIsPoint, overview selection,
> WKT-citation best-effort, lint-fatal patterns removed, and the test suite
> reworked so every "Expected: PASS" is true for the planned diff.

**Goal:** A user opens a GeoTIFF from their device and it renders warped onto the web map as a toggleable, opacity-adjustable "Your maps" layer that survives reloads — fully client-side.

**Architecture:** New self-contained `web/src/userMaps/` feature folder (parsers / transform / render / store / components). `App.tsx` and `MapCanvas.tsx` gain only mounting points. Rendering is a single custom canvas Leaflet layer (`WarpedRasterLayer`) drawing through a projected mesh; decode runs in a web worker (OffscreenCanvas) with a main-thread fallback; persistence is IndexedDB. Spec: `docs/superpowers/specs/2026-07-24-web-user-maps-design.md`.

**Tech Stack:** React 19, Leaflet 1.9 + react-leaflet 5, Vite 8, TypeScript 5.9, Vitest 4 (jsdom), geotiff.js **2.1.3 (exact pin)**, proj4.

## Global Constraints

- Runtime dependencies: `geotiff@2.1.3` (**exact pin** — 3.x changed the read API; migrating is a tracked follow-up, not a drive-by) and `proj4` — nothing else. **No `@types/proj4`** (proj4 ships its own `dist/index.d.ts`).
- Dev dependency: `fake-indexeddb` (dev-only, for IndexedDB in jsdom). Not in the originally approved dep list — surface to the maintainer at execution start.
- `App.tsx` / `MapCanvas.tsx` receive mounting points only.
- Preview raster cap: `PREVIEW_MAX_DIMENSION = 4096` px. Memory honesty: decoding still materializes source tiles transiently at full resolution inside the worker; the cap bounds the *retained* output, and WebKit budgets canvas memory in aggregate — noted, accepted for PR 1.
- Pane: `user-maps-pane`, z-index **160** (above aerial 150, below environmental health 165 and every data overlay — parcels/roads/waterfalls stay readable on top).
- Privacy copy, verbatim: `Files stay on this device — nothing is uploaded.`
- Hard refusal above 500 MB; files over 150 MB show `Large file — displayed at reduced resolution.` and a size-aware "Reading large map…" status *during* the parse.
- PDF/PNG/JPEG recognized but rejected in PR 1 with: `This file type arrives with the georeferencer in the next update. GeoTIFF works today.`
- No georeferencing: `No georeferencing found in this file. The georeferencer (next update) will handle plain scans.`
- CRSs: EPSG 26920, 2961, 2962, 4617, 4326, 3857, plus best-effort proj4 parse of the citation string when the CRS key is user-defined (32767). Otherwise: `Unsupported coordinate system (<crs>). Reproject to UTM zone 20N (EPSG:26920) or WGS84 and re-import.`
- ESLint gotchas this repo enforces (react-hooks 7 flat recommended + js recommended): no synchronous `setState` in effects (`react-hooks/set-state-in-effect`), no unreachable code. The planned code below is written to pass both — do not reintroduce those patterns.
- Conventional Commits; commit after every task. Branch `claude/web-map-custom-uploads-cde085` (based on `origin/nightly`); final PR targets `nightly` — never `main`.
- Commands run from repo root; tests via `cd web && npx vitest run <path>`.

---

### Task 1: Dependencies, feature-folder scaffold, file sniffing

**Files:**
- Modify: `web/package.json` (via npm install)
- Create: `web/src/userMaps/errors.ts`
- Create: `web/src/userMaps/parsers/sniff.ts`
- Test: `web/src/userMaps/parsers/sniff.test.ts`

**Interfaces:**
- Produces: `sniffFileType(bytes: Uint8Array): SniffedType` with `type SniffedType = "geotiff" | "pdf" | "png" | "jpeg" | "unknown"`; `class UserMapImportError extends Error { code: UserMapImportErrorCode; userMessage: string }` with `type UserMapImportErrorCode = "unsupported-type" | "corrupt-file" | "unsupported-crs" | "no-georeferencing" | "too-large" | "quota" | "storage-failed"`.

- [ ] **Step 1: Flag `fake-indexeddb` to the maintainer** (dev-only test dependency outside the approved list). If unavailable, proceed and note it in the PR description.

- [ ] **Step 2: Install dependencies**

```bash
cd web && npm install --save-exact geotiff@2.1.3 && npm install proj4 && npm install -D fake-indexeddb
```

Expected: `package.json` shows `"geotiff": "2.1.3"` (no caret), `proj4` with caret, `fake-indexeddb` in devDependencies. Exit 0.

- [ ] **Step 3: Write the error type** — `web/src/userMaps/errors.ts`:

```ts
export type UserMapImportErrorCode =
  | "unsupported-type"
  | "corrupt-file"
  | "unsupported-crs"
  | "no-georeferencing"
  | "too-large"
  | "quota"
  | "storage-failed";

/**
 * Import failures are expected user events, not bugs, so every one carries a
 * message written for the UI rather than the console.
 */
export class UserMapImportError extends Error {
  readonly code: UserMapImportErrorCode;
  readonly userMessage: string;

  constructor(code: UserMapImportErrorCode, userMessage: string) {
    super(`${code}: ${userMessage}`);
    this.name = "UserMapImportError";
    this.code = code;
    this.userMessage = userMessage;
  }
}
```

- [ ] **Step 4: Write the failing sniff test** — `web/src/userMaps/parsers/sniff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sniffFileType } from "./sniff";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("sniffFileType", () => {
  it("detects little-endian TIFF (II*\\0)", () => {
    expect(sniffFileType(bytes(0x49, 0x49, 0x2a, 0x00, 0x08))).toBe("geotiff");
  });

  it("detects big-endian TIFF (MM\\0*)", () => {
    expect(sniffFileType(bytes(0x4d, 0x4d, 0x00, 0x2a, 0x00))).toBe("geotiff");
  });

  it("detects little-endian BigTIFF (II+\\0)", () => {
    expect(sniffFileType(bytes(0x49, 0x49, 0x2b, 0x00))).toBe("geotiff");
  });

  it("detects PDF (%PDF)", () => {
    expect(sniffFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("pdf");
  });

  it("detects PNG", () => {
    expect(
      sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe("png");
  });

  it("detects JPEG", () => {
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
  });

  it("returns unknown for anything else", () => {
    expect(sniffFileType(bytes(0x00, 0x01, 0x02, 0x03))).toBe("unknown");
  });

  it("returns unknown for a buffer shorter than any signature", () => {
    expect(sniffFileType(bytes(0x49))).toBe("unknown");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/parsers/sniff.test.ts`
Expected: FAIL — cannot resolve `./sniff`.

- [ ] **Step 6: Implement** — `web/src/userMaps/parsers/sniff.ts`:

```ts
export type SniffedType = "geotiff" | "pdf" | "png" | "jpeg" | "unknown";

type Signature = { type: SniffedType; magic: number[] };

/**
 * File extensions are user-editable, so type detection reads magic bytes.
 * TIFF covers classic (42) and BigTIFF (43) in both byte orders; GeoTIFF is
 * plain TIFF plus geo tags, which the parser (not the sniffer) verifies.
 */
const SIGNATURES: Signature[] = [
  { type: "geotiff", magic: [0x49, 0x49, 0x2a, 0x00] },
  { type: "geotiff", magic: [0x4d, 0x4d, 0x00, 0x2a] },
  { type: "geotiff", magic: [0x49, 0x49, 0x2b, 0x00] },
  { type: "geotiff", magic: [0x4d, 0x4d, 0x00, 0x2b] },
  { type: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { type: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: "jpeg", magic: [0xff, 0xd8, 0xff] },
];

export function sniffFileType(bytes: Uint8Array): SniffedType {
  for (const { type, magic } of SIGNATURES) {
    if (bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b)) {
      return type;
    }
  }
  return "unknown";
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/parsers/sniff.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/src/userMaps
git commit -m "feat(web): add user-map file sniffing and import error types"
```

---

### Task 2: Projection module (proj4 registry, CRS validation, pixel→LatLng, mesh builder)

**Files:**
- Create: `web/src/userMaps/transform/projection.ts`
- Test: `web/src/userMaps/transform/projection.test.ts`

**Interfaces:**
- Consumes: `UserMapImportError` (Task 1).
- Produces:
  - `type EmbeddedGeoref = { kind: "embedded"; crs: string; geotransform: [number, number, number, number, number, number] }` (GDAL order). `crs` is either `"EPSG:xxxx"` or a raw proj4-parseable definition/WKT string (citation fallback).
  - `type PixelSize = { width: number; height: number }`, `type LatLngPoint = { lat: number; lng: number }`
  - `validateCrs(crs: string): void` — throws `UserMapImportError("unsupported-crs", …)`.
  - `pixelToLatLng(georef: EmbeddedGeoref, x: number, y: number): LatLngPoint`
  - `buildLatLngMesh(georef: EmbeddedGeoref, pixelSize: PixelSize, gridSize?: number): LatLngPoint[][]` — default `gridSize = 8`.
  - `SUPPORTED_EPSG_CODES: readonly number[]`

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/transform/projection.test.ts`:

```ts
import proj4 from "proj4";
import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../errors";
import {
  buildLatLngMesh,
  pixelToLatLng,
  validateCrs,
  type EmbeddedGeoref,
} from "./projection";

/** 10 m pixels, origin on the UTM 20N central meridian (easting 500 000). */
const UTM20_GEOREF: EmbeddedGeoref = {
  kind: "embedded",
  crs: "EPSG:26920",
  geotransform: [500000, 10, 0, 5000000, 0, -10],
};

describe("validateCrs", () => {
  it("accepts every locked EPSG code", () => {
    for (const code of [26920, 2961, 2962, 4617, 4326, 3857]) {
      expect(() => validateCrs(`EPSG:${code}`)).not.toThrow();
    }
  });

  it("accepts a raw proj4 definition string (WKT-citation fallback)", () => {
    expect(() =>
      validateCrs("+proj=utm +zone=20 +datum=NAD83 +units=m +no_defs"),
    ).not.toThrow();
  });

  it("rejects unknown CRSs with the code in the message", () => {
    try {
      validateCrs("EPSG:32633");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UserMapImportError);
      expect((error as UserMapImportError).code).toBe("unsupported-crs");
      expect((error as UserMapImportError).userMessage).toContain("EPSG:32633");
    }
  });
});

describe("pixelToLatLng", () => {
  it("maps the origin pixel of a UTM 20N raster onto the central meridian", () => {
    const { lat, lng } = pixelToLatLng(UTM20_GEOREF, 0, 0);
    expect(lng).toBeCloseTo(-63, 6);
    expect(lat).toBeGreaterThan(45);
    expect(lat).toBeLessThan(45.3);
  });

  it("round-trips through proj4 to within a millimetre", () => {
    const { lat, lng } = pixelToLatLng(UTM20_GEOREF, 120, 45);
    const [easting, northing] = proj4("EPSG:4326", "EPSG:26920", [lng, lat]);
    expect(easting).toBeCloseTo(500000 + 120 * 10, 3);
    expect(northing).toBeCloseTo(5000000 - 45 * 10, 3);
  });

  it("applies rotation terms of the geotransform", () => {
    const rotated: EmbeddedGeoref = {
      kind: "embedded",
      crs: "EPSG:26920",
      geotransform: [500000, 0, 10, 5000000, -10, 0],
    };
    const { lat, lng } = pixelToLatLng(rotated, 120, 45);
    const [easting, northing] = proj4("EPSG:4326", "EPSG:26920", [lng, lat]);
    expect(easting).toBeCloseTo(500000 + 45 * 10, 3);
    expect(northing).toBeCloseTo(5000000 - 120 * 10, 3);
  });

  it("passes WGS84 rasters through untouched", () => {
    const geographic: EmbeddedGeoref = {
      kind: "embedded",
      crs: "EPSG:4326",
      geotransform: [-63.5, 0.001, 0, 46, 0, -0.001],
    };
    const { lat, lng } = pixelToLatLng(geographic, 100, 200);
    expect(lng).toBeCloseTo(-63.4, 9);
    expect(lat).toBeCloseTo(45.8, 9);
  });
});

describe("buildLatLngMesh", () => {
  it("returns a (grid+1) x (grid+1) lattice covering the full raster", () => {
    const mesh = buildLatLngMesh(UTM20_GEOREF, { width: 800, height: 400 }, 8);
    expect(mesh).toHaveLength(9);
    expect(mesh[0]).toHaveLength(9);
    expect(mesh[0][0]).toEqual(pixelToLatLng(UTM20_GEOREF, 0, 0));
    expect(mesh[8][8]).toEqual(pixelToLatLng(UTM20_GEOREF, 800, 400));
    expect(mesh[4][2]).toEqual(pixelToLatLng(UTM20_GEOREF, 200, 200));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/transform/projection.test.ts`
Expected: FAIL — cannot resolve `./projection`.

- [ ] **Step 3: Implement** — `web/src/userMaps/transform/projection.ts`:

```ts
import proj4 from "proj4";
import { UserMapImportError } from "../errors";

export type EmbeddedGeoref = {
  kind: "embedded";
  /** "EPSG:xxxx" or a raw proj4-parseable definition (citation fallback). */
  crs: string;
  /** GDAL order: [originX, xRes, xRot, originY, yRot, yRes]. */
  geotransform: [number, number, number, number, number, number];
};

export type PixelSize = { width: number; height: number };
export type LatLngPoint = { lat: number; lng: number };

/**
 * The CRSs Nova Scotia rasters actually ship in (spec-locked list). proj4
 * knows 4326/3857 natively; the rest are registered here so imports never
 * depend on a network CRS lookup.
 */
export const SUPPORTED_EPSG_CODES = [26920, 2961, 2962, 4617, 4326, 3857] as const;

const PROJ_DEFS: Record<string, string> = {
  "EPSG:26920": "+proj=utm +zone=20 +datum=NAD83 +units=m +no_defs",
  "EPSG:2961":
    "+proj=utm +zone=20 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  "EPSG:2962":
    "+proj=utm +zone=21 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  "EPSG:4617": "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs",
};

let registered = false;

function ensureProjectionsRegistered(): void {
  if (registered) {
    return;
  }
  for (const [code, def] of Object.entries(PROJ_DEFS)) {
    proj4.defs(code, def);
  }
  registered = true;
}

function converterFor(crs: string): proj4.Converter {
  ensureProjectionsRegistered();
  try {
    return proj4(crs, "EPSG:4326");
  } catch {
    throw new UserMapImportError(
      "unsupported-crs",
      `Unsupported coordinate system (${crs}). Reproject to UTM zone 20N ` +
        "(EPSG:26920) or WGS84 and re-import.",
    );
  }
}

/** Import-time gate so a bad CRS fails the import, not the first render. */
export function validateCrs(crs: string): void {
  converterFor(crs);
}

export function pixelToLatLng(
  georef: EmbeddedGeoref,
  x: number,
  y: number,
): LatLngPoint {
  const [ox, xRes, xRot, oy, yRot, yRes] = georef.geotransform;
  const projX = ox + x * xRes + y * xRot;
  const projY = oy + x * yRot + y * yRes;
  const [lng, lat] = converterFor(georef.crs).forward([projX, projY]);
  return { lat, lng };
}

/**
 * A lattice of geographic positions over the raster. Drawing through a grid
 * rather than one rectangle absorbs the curvature that UTM→WebMercator
 * reprojection introduces across county-scale rasters, and is the same code
 * path the PR-3 thin-plate-spline warp will feed.
 */
export function buildLatLngMesh(
  georef: EmbeddedGeoref,
  pixelSize: PixelSize,
  gridSize = 8,
): LatLngPoint[][] {
  const mesh: LatLngPoint[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: LatLngPoint[] = [];
    const y = (pixelSize.height * row) / gridSize;
    for (let col = 0; col <= gridSize; col += 1) {
      const x = (pixelSize.width * col) / gridSize;
      line.push(pixelToLatLng(georef, x, y));
    }
    mesh.push(line);
  }
  return mesh;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/transform/projection.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/transform
git commit -m "feat(web): add user-map projection module with NS CRS registry"
```

---

### Task 3: GeoTIFF test fixture (script + committed binary)

**Files:**
- Create: `web/scripts/generateGeoTiffFixture.mjs`
- Create: `web/src/test/fixtures/utm20-8x6.tif` (generated, committed)

**Interfaces:**
- Produces: an 8×6 px RGB GeoTIFF, EPSG:26920, origin (500000, 5000000), 10 m pixels, red/blue gradient. Written with the pinned geotiff 2.1.3 writer.

- [ ] **Step 1: Write the generator** — `web/scripts/generateGeoTiffFixture.mjs`:

```js
// Regenerates web/src/test/fixtures/utm20-8x6.tif. Deterministic on purpose:
// tests assert exact metadata, so the fixture must never drift silently.
// Run: node web/scripts/generateGeoTiffFixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeArrayBuffer } from "geotiff";

const WIDTH = 8;
const HEIGHT = 6;

const values = new Uint8Array(WIDTH * HEIGHT * 3);
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const i = (y * WIDTH + x) * 3;
    values[i] = Math.round((x / (WIDTH - 1)) * 255); // red ramps west→east
    values[i + 1] = 0;
    values[i + 2] = Math.round((y / (HEIGHT - 1)) * 255); // blue ramps north→south
  }
}

const metadata = {
  width: WIDTH,
  height: HEIGHT,
  SamplesPerPixel: 3,
  BitsPerSample: [8, 8, 8],
  PhotometricInterpretation: 2,
  ModelPixelScale: [10, 10, 0],
  ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
  ProjectedCSTypeGeoKey: 26920,
  GTModelTypeGeoKey: 1,
  GTRasterTypeGeoKey: 1,
};

const buffer = writeArrayBuffer(values, metadata);
const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "test",
  "fixtures",
  "utm20-8x6.tif",
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(buffer));
console.log(`wrote ${out}`);
```

- [ ] **Step 2: Generate the fixture**

Run: `cd web && node scripts/generateGeoTiffFixture.mjs`
Expected: `wrote …/web/src/test/fixtures/utm20-8x6.tif`; roughly 1 KB.

- [ ] **Step 3: Verify the fixture parses under the pinned version**

Run: `cd web && node -e "import('geotiff').then(async g => { const fs = await import('node:fs'); const b = fs.readFileSync('src/test/fixtures/utm20-8x6.tif'); const t = await g.fromArrayBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); const i = await t.getImage(); console.log(i.getWidth(), i.getHeight(), i.getGeoKeys().ProjectedCSTypeGeoKey, JSON.stringify(i.getFileDirectory().ModelPixelScale)); })"`
Expected output: `8 6 26920 [10,10,0]` — the last value also proves `getFileDirectory()` returns a plain tag bag on 2.1.3 (the reason for the pin). If this fails, stop and report; do not upgrade geotiff to "fix" it.

- [ ] **Step 4: Commit**

```bash
git add web/scripts/generateGeoTiffFixture.mjs web/src/test/fixtures/utm20-8x6.tif
git commit -m "test(web): add deterministic GeoTIFF fixture and generator"
```

---

### Task 4: GeoTIFF parser + worker

**Files:**
- Create: `web/src/userMaps/types.ts`
- Create: `web/src/userMaps/parsers/geoTiffSource.ts`
- Create: `web/src/userMaps/parsers/geoTiffWorker.ts`
- Create: `web/src/userMaps/parsers/parseInWorker.ts`
- Test: `web/src/userMaps/parsers/geoTiffSource.test.ts`

**Interfaces:**
- Consumes: `UserMapImportError` (Task 1); `EmbeddedGeoref`, `PixelSize`, `SUPPORTED_EPSG_CODES`, `validateCrs` (Task 2).
- Produces:
  - `types.ts`: `Gcp`, `GcpGeoref`, `UserMapGeoref`, `UserMapSource`, `UserMapRecord` (schema-stable for PR 2+).
  - `geoTiffSource.ts`: `parseGeoTiff(buffer: ArrayBuffer, options?: { makePreview?: MakePreview }): Promise<ParsedGeoTiff>` with `type ParsedGeoTiff = { pixelSize: PixelSize; georef: EmbeddedGeoref; preview: Blob; previewSize: PixelSize }`, `type MakePreview = (rgb: Uint8Array, width: number, height: number) => Promise<Blob>`, `chooseImageIndex(sizes: PixelSize[], target: number): number` (pure, exported for tests), `PREVIEW_MAX_DIMENSION = 4096`.
  - `parseInWorker.ts`: `parseGeoTiffAuto(buffer: ArrayBuffer): Promise<ParsedGeoTiff>` — worker when `Worker`+`OffscreenCanvas` exist, else main-thread fallback.

- [ ] **Step 1: Write the shared types** — `web/src/userMaps/types.ts`:

```ts
import type { EmbeddedGeoref, PixelSize } from "./transform/projection";

export type Gcp = {
  id: string;
  /** Original-image pixel space, so preview resolution never invalidates GCPs. */
  pixel: { x: number; y: number };
  /** WGS84 for portability; solves run in Web Mercator metres (see spec). */
  map: { lat: number; lng: number };
};

/** Produced by the PR-2 georeferencer; defined now so the store schema is stable. */
export type GcpGeoref = { kind: "gcp"; gcps: Gcp[]; method: "affine" | "tps" };

export type UserMapGeoref = EmbeddedGeoref | GcpGeoref;

export type UserMapSource = "geotiff" | "geopdf" | "image";

export type UserMapRecord = {
  id: string;
  name: string;
  source: UserMapSource;
  createdAt: string;
  /** Original raster dimensions — GCP space, not preview space. */
  pixelSize: PixelSize;
  georef: UserMapGeoref;
};
```

- [ ] **Step 2: Write the failing parser test** — `web/src/userMaps/parsers/geoTiffSource.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { UserMapImportError } from "../errors";
import { chooseImageIndex, parseGeoTiff } from "./geoTiffSource";

function fixtureBuffer(): ArrayBuffer {
  const raw = readFileSync(
    join(__dirname, "..", "..", "test", "fixtures", "utm20-8x6.tif"),
  );
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
}

/** jsdom has no canvas, so tests always inject a fake preview maker. */
const fakePreview = () =>
  vi.fn(async (rgb: Uint8Array, width: number, height: number) => {
    void rgb;
    void width;
    void height;
    return new Blob(["fake-preview"], { type: "image/png" });
  });

async function plainTiff(metadata: Record<string, unknown>): Promise<ArrayBuffer> {
  const { writeArrayBuffer } = await import("geotiff");
  return writeArrayBuffer(new Uint8Array([1, 2, 3]), {
    width: 1,
    height: 1,
    SamplesPerPixel: 3,
    BitsPerSample: [8, 8, 8],
    PhotometricInterpretation: 2,
    ...metadata,
  }) as ArrayBuffer;
}

describe("chooseImageIndex", () => {
  it("picks the smallest overview still covering the target", () => {
    const sizes = [
      { width: 20000, height: 15000 },
      { width: 10000, height: 7500 },
      { width: 5000, height: 3750 },
      { width: 2500, height: 1875 },
    ];
    // Target 4096: 5000x3750 is the smallest whose max dimension >= 4096.
    expect(chooseImageIndex(sizes, 4096)).toBe(2);
  });

  it("falls back to the smallest image when none covers the target", () => {
    const sizes = [
      { width: 3000, height: 2000 },
      { width: 1500, height: 1000 },
    ];
    expect(chooseImageIndex(sizes, 4096)).toBe(0);
  });

  it("uses the sole image when there are no overviews", () => {
    expect(chooseImageIndex([{ width: 8, height: 6 }], 4096)).toBe(0);
  });
});

describe("parseGeoTiff", () => {
  it("extracts pixel size, CRS, and geotransform from the fixture", async () => {
    const parsed = await parseGeoTiff(fixtureBuffer(), {
      makePreview: fakePreview(),
    });
    expect(parsed.pixelSize).toEqual({ width: 8, height: 6 });
    expect(parsed.georef).toEqual({
      kind: "embedded",
      crs: "EPSG:26920",
      geotransform: [500000, 10, 0, 5000000, 0, -10],
    });
  });

  it("feeds full-resolution RGB to the preview maker for a small raster", async () => {
    const makePreview = fakePreview();
    const parsed = await parseGeoTiff(fixtureBuffer(), { makePreview });
    expect(makePreview).toHaveBeenCalledTimes(1);
    const [rgb, width, height] = makePreview.mock.calls[0];
    expect(width).toBe(8);
    expect(height).toBe(6);
    expect(rgb).toHaveLength(8 * 6 * 3);
    expect(rgb[0]).toBe(0); // top-left red
    expect(rgb[(8 - 1) * 3]).toBe(255); // top-right red
    expect(parsed.previewSize).toEqual({ width: 8, height: 6 });
    expect(parsed.preview.type).toBe("image/png");
  });

  it("applies the half-pixel shift for PixelIsPoint rasters", async () => {
    const buffer = await plainTiff({
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
      GTRasterTypeGeoKey: 2, // PixelIsPoint
    });
    const parsed = await parseGeoTiff(buffer, { makePreview: fakePreview() });
    // Tiepoint marks the CENTRE of pixel (0,0), so the area origin shifts
    // back half a pixel: x - 5, y + 5 (north-up negative y resolution).
    expect(parsed.georef.geotransform[0]).toBeCloseTo(499995, 6);
    expect(parsed.georef.geotransform[3]).toBeCloseTo(5000005, 6);
  });

  it("rejects TIFFs without georeferencing as no-georeferencing", async () => {
    const buffer = await plainTiff({});
    await expect(
      parseGeoTiff(buffer, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "no-georeferencing" });
  });

  it("rejects a truncated ModelTransformation as no-georeferencing", async () => {
    const buffer = await plainTiff({
      ModelTransformation: [1, 0, 0, 0, 0, 1, 0, 0], // 8 of 16 doubles
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    });
    await expect(
      parseGeoTiff(buffer, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "no-georeferencing" });
  });

  it("rejects garbage bytes as corrupt-file", async () => {
    const garbage = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff, 0xff]).buffer;
    await expect(
      parseGeoTiff(garbage, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "corrupt-file" });
  });

  it("surfaces unsupported CRS with the EPSG code in the message", async () => {
    const buffer = await plainTiff({
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
      ProjectedCSTypeGeoKey: 32633,
      GTModelTypeGeoKey: 1,
    });
    try {
      await parseGeoTiff(buffer, { makePreview: fakePreview() });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UserMapImportError);
      expect((error as UserMapImportError).code).toBe("unsupported-crs");
      expect((error as UserMapImportError).userMessage).toContain("32633");
    }
  });

  it("scales 16-bit samples into the 8-bit preview instead of truncating", async () => {
    const { writeArrayBuffer } = await import("geotiff");
    // One pixel, RGB, 16-bit: mid-grey 0x8000 must become ~0x80, not 0x00.
    const buffer = writeArrayBuffer(new Uint16Array([0x8000, 0x8000, 0x8000]), {
      width: 1,
      height: 1,
      SamplesPerPixel: 3,
      BitsPerSample: [16, 16, 16],
      PhotometricInterpretation: 2,
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    }) as ArrayBuffer;
    const makePreview = fakePreview();
    await parseGeoTiff(buffer, { makePreview });
    const [rgb] = makePreview.mock.calls[0];
    expect(rgb[0]).toBe(0x80);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/parsers/geoTiffSource.test.ts`
Expected: FAIL — cannot resolve `./geoTiffSource`.

- [ ] **Step 4: Implement the parser** — `web/src/userMaps/parsers/geoTiffSource.ts`:

```ts
import { fromArrayBuffer } from "geotiff";
import { UserMapImportError } from "../errors";
import {
  validateCrs,
  type EmbeddedGeoref,
  type PixelSize,
} from "../transform/projection";

export const PREVIEW_MAX_DIMENSION = 4096;

export type MakePreview = (
  rgb: Uint8Array,
  width: number,
  height: number,
) => Promise<Blob>;

export type ParsedGeoTiff = {
  pixelSize: PixelSize;
  georef: EmbeddedGeoref;
  preview: Blob;
  previewSize: PixelSize;
};

/**
 * Smallest image (base or overview) whose longest edge still covers the
 * preview target, so huge rasters decode from an overview instead of the
 * base image. Falls back to index 0 (the base) when nothing covers it —
 * upscaling an overview would fabricate detail.
 */
export function chooseImageIndex(sizes: PixelSize[], target: number): number {
  let best = 0;
  let bestMax = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sizes.length; i += 1) {
    const max = Math.max(sizes[i].width, sizes[i].height);
    if (max >= target && max < bestMax) {
      best = i;
      bestMax = max;
    }
  }
  return best;
}

type GeoTiffDirectory = {
  ModelPixelScale?: number[];
  ModelTiepoint?: number[];
  ModelTransformation?: number[];
};

type GeoKeyBag = {
  ProjectedCSTypeGeoKey?: number;
  GeographicTypeGeoKey?: number;
  GTRasterTypeGeoKey?: number;
  GTCitationGeoKey?: string;
  PCSCitationGeoKey?: string;
};

function geotransformFrom(
  directory: GeoTiffDirectory,
  pixelIsPoint: boolean,
): EmbeddedGeoref["geotransform"] | null {
  const { ModelPixelScale: scale, ModelTiepoint: tie, ModelTransformation: m } =
    directory;
  if (m) {
    if (m.length < 16) {
      // The tag is defined as a full 4x4 matrix; anything shorter is broken.
      return null;
    }
    // Row-major 4x4 affine: x' = m0·x + m1·y + m3; y' = m4·x + m5·y + m7.
    return [m[3], m[0], m[1], m[7], m[4], m[5]];
  }
  if (scale && scale.length >= 2 && tie && tie.length >= 6) {
    if (tie.length > 6) {
      // Multiple tiepoints without a transformation matrix = irregular
      // georeferencing we do not support; treat as ungeoreferenced.
      return null;
    }
    let originX = tie[3] - tie[0] * scale[0];
    let originY = tie[4] + tie[1] * scale[1];
    if (pixelIsPoint) {
      // PixelIsPoint ties the CENTRE of the pixel; area semantics shift the
      // origin back half a pixel (north-up: y resolution is negative).
      originX -= scale[0] / 2;
      originY += scale[1] / 2;
    }
    return [originX, scale[0], 0, originY, 0, -scale[1]];
  }
  return null;
}

function crsFrom(geoKeys: GeoKeyBag): string | null {
  const epsg = geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey;
  if (epsg && epsg !== 32767) {
    return `EPSG:${epsg}`;
  }
  // User-defined CRS: best-effort — some producers put a proj4/WKT string in
  // the citation keys, which proj4 can parse directly. validateCrs decides.
  const citation = geoKeys.PCSCitationGeoKey ?? geoKeys.GTCitationGeoKey;
  return citation ?? null;
}

/** 16-bit samples scale down (>>8); anything else clamps into 8-bit. */
function toUint8Rgb(raw: ArrayLike<number>): Uint8Array {
  if (raw instanceof Uint8Array) {
    return raw;
  }
  const out = new Uint8Array(raw.length);
  const shift = raw instanceof Uint16Array;
  for (let i = 0; i < raw.length; i += 1) {
    const v = shift ? raw[i] >> 8 : raw[i];
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

export async function parseGeoTiff(
  buffer: ArrayBuffer,
  options: { makePreview?: MakePreview } = {},
): Promise<ParsedGeoTiff> {
  const makePreview = options.makePreview ?? domCanvasPreview;

  let width: number;
  let height: number;
  let geoKeys: GeoKeyBag;
  let directory: GeoTiffDirectory;
  let imageSizes: PixelSize[];
  let getImage: (index: number) => Promise<{
    readRGB: (opts: {
      interleave: true;
      width: number;
      height: number;
    }) => Promise<ArrayLike<number>>;
  }>;
  try {
    const tiff = await fromArrayBuffer(buffer);
    const count = await tiff.getImageCount();
    const images = [];
    for (let i = 0; i < count; i += 1) {
      images.push(await tiff.getImage(i));
    }
    const base = images[0];
    width = base.getWidth();
    height = base.getHeight();
    geoKeys = (base.getGeoKeys() ?? {}) as GeoKeyBag;
    directory = base.getFileDirectory() as GeoTiffDirectory;
    imageSizes = images.map((img) => ({
      width: img.getWidth(),
      height: img.getHeight(),
    }));
    getImage = async (index) => images[index];
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    throw new UserMapImportError(
      "corrupt-file",
      "This file could not be read as a GeoTIFF. It may be truncated or corrupt.",
    );
  }

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

  const downScale = Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(width, height));
  const previewSize: PixelSize = {
    width: Math.max(1, Math.round(width * downScale)),
    height: Math.max(1, Math.round(height * downScale)),
  };

  let rgb: Uint8Array;
  try {
    // Decode from the smallest sufficient overview. Note: geotiff still
    // materializes that image's source tiles transiently during the read;
    // the cap bounds the RETAINED output, not the decode peak.
    const source = await getImage(chooseImageIndex(imageSizes, PREVIEW_MAX_DIMENSION));
    const raw = await source.readRGB({
      interleave: true,
      width: previewSize.width,
      height: previewSize.height,
    });
    rgb = toUint8Rgb(raw);
  } catch {
    throw new UserMapImportError(
      "corrupt-file",
      "The image data in this GeoTIFF could not be decoded.",
    );
  }

  const preview = await makePreview(rgb, previewSize.width, previewSize.height);

  return {
    pixelSize: { width, height },
    georef: { kind: "embedded", crs, geotransform },
    preview,
    previewSize,
  };
}

/** RGB → RGBA bytes; shared by both preview implementations. */
export function rgbToRgba(rgb: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i];
    rgba[j + 1] = rgb[i + 1];
    rgba[j + 2] = rgb[i + 2];
    rgba[j + 3] = 255;
  }
  return rgba;
}

/** Main-thread fallback preview maker (DOM canvas). Workers use OffscreenCanvas. */
async function domCanvasPreview(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  }
  ctx.putImageData(new ImageData(rgbToRgba(rgb, width, height), width, height), 0, 0);
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
```

- [ ] **Step 5: Run parser test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/parsers/geoTiffSource.test.ts`
Expected: PASS (11 tests). If geotiff 2.1.3's `readRGB` rejects the `width`/`height` resample options, switch that call to `source.readRasters({ interleave: true, width, height })` and re-run — for RGB content they are equivalent.

- [ ] **Step 6: Implement the worker + auto wrapper.**

`web/src/userMaps/parsers/geoTiffWorker.ts`:

```ts
/// <reference lib="webworker" />
import { UserMapImportError } from "../errors";
import { parseGeoTiff, rgbToRgba, type ParsedGeoTiff } from "./geoTiffSource";

export type WorkerReply =
  | { ok: true; parsed: ParsedGeoTiff }
  | { ok: false; code: UserMapImportError["code"]; userMessage: string };

/** OffscreenCanvas preview maker — the worker-side counterpart of the DOM path. */
async function offscreenPreview(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  }
  ctx.putImageData(new ImageData(rgbToRgba(rgb, width, height), width, height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const parsed = await parseGeoTiff(event.data, { makePreview: offscreenPreview });
    self.postMessage({ ok: true, parsed } satisfies WorkerReply);
  } catch (error) {
    const reply: WorkerReply =
      error instanceof UserMapImportError
        ? { ok: false, code: error.code, userMessage: error.userMessage }
        : {
            ok: false,
            code: "corrupt-file",
            userMessage: "Something went wrong reading this file.",
          };
    self.postMessage(reply);
  }
};
```

`web/src/userMaps/parsers/parseInWorker.ts`:

```ts
import { UserMapImportError } from "../errors";
import { parseGeoTiff, type ParsedGeoTiff } from "./geoTiffSource";
import type { WorkerReply } from "./geoTiffWorker";

/**
 * Decode off the main thread when the browser can (spec requirement: the UI
 * never blocks on a parse). jsdom and pre-16.4 Safari lack Worker-side
 * OffscreenCanvas 2D, so those fall back to the main-thread DOM-canvas path.
 */
export function parseGeoTiffAuto(buffer: ArrayBuffer): Promise<ParsedGeoTiff> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    return parseGeoTiff(buffer);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./geoTiffWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.parsed);
      } else {
        reject(new UserMapImportError(event.data.code, event.data.userMessage));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(
        new UserMapImportError(
          "corrupt-file",
          "Something went wrong reading this file.",
        ),
      );
    };
    // Transfer, don't copy: the buffer is not reused by the caller.
    worker.postMessage(buffer, [buffer]);
  });
}
```

No dedicated test for these two files: both are thin wiring around `parseGeoTiff` (which is fully tested), the worker cannot run under jsdom, and the fallback branch of `parseGeoTiffAuto` is exercised by every hook test (jsdom has no `Worker`). The browser path is covered by Task 10's manual verification.

- [ ] **Step 7: Commit**

```bash
git add web/src/userMaps/types.ts web/src/userMaps/parsers
git commit -m "feat(web): parse user GeoTIFFs in a worker with capped previews"
```

---

### Task 5: IndexedDB store

**Files:**
- Create: `web/src/userMaps/store/userMapStore.ts`
- Test: `web/src/userMaps/store/userMapStore.test.ts`

**Interfaces:**
- Consumes: `UserMapRecord` (Task 4), `UserMapImportError` (Task 1).
- Produces: `class UserMapStore` with `static open(factory?: IDBFactory): Promise<UserMapStore>`, `saveUserMap(record, raster: Blob, preview: Blob): Promise<void>` (throws `UserMapImportError` code `"quota"` on `QuotaExceededError`, `"storage-failed"` otherwise), `listUserMaps(): Promise<UserMapRecord[]>` (createdAt ascending), `getPreviewBlob(id): Promise<Blob | null>`, `getRasterBlob(id): Promise<Blob | null>`, `renameUserMap(id, name): Promise<void>`, `deleteUserMap(id): Promise<void>`, `close(): void`.

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/store/userMapStore.test.ts`:

```ts
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserMapRecord } from "../types";
import { UserMapStore } from "./userMapStore";

function record(id: string, createdAt: string): UserMapRecord {
  return {
    id,
    name: `Map ${id}`,
    source: "geotiff",
    createdAt,
    pixelSize: { width: 8, height: 6 },
    georef: {
      kind: "embedded",
      crs: "EPSG:26920",
      geotransform: [500000, 10, 0, 5000000, 0, -10],
    },
  };
}

describe("UserMapStore", () => {
  let store: UserMapStore;

  beforeEach(async () => {
    // A fresh factory per test = a fresh, isolated database.
    store = await UserMapStore.open(new IDBFactory());
  });

  it("round-trips a record with its blobs", async () => {
    const raster = new Blob(["raster-bytes"]);
    const preview = new Blob(["preview-bytes"], { type: "image/png" });
    await store.saveUserMap(record("a", "2026-07-24T00:00:00.000Z"), raster, preview);

    const listed = await store.listUserMaps();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("Map a");

    expect(await (await store.getPreviewBlob("a"))?.text()).toBe("preview-bytes");
    expect(await (await store.getRasterBlob("a"))?.text()).toBe("raster-bytes");
  });

  it("lists maps oldest-first by createdAt", async () => {
    await store.saveUserMap(record("b", "2026-07-24T02:00:00.000Z"), new Blob(), new Blob());
    await store.saveUserMap(record("a", "2026-07-24T01:00:00.000Z"), new Blob(), new Blob());
    const listed = await store.listUserMaps();
    expect(listed.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("renames a map", async () => {
    await store.saveUserMap(record("a", "2026-07-24T00:00:00.000Z"), new Blob(), new Blob());
    await store.renameUserMap("a", "Church survey 1888");
    expect((await store.listUserMaps())[0].name).toBe("Church survey 1888");
  });

  it("deletes a map and its blobs", async () => {
    await store.saveUserMap(record("a", "2026-07-24T00:00:00.000Z"), new Blob(), new Blob());
    await store.deleteUserMap("a");
    expect(await store.listUserMaps()).toEqual([]);
    expect(await store.getPreviewBlob("a")).toBeNull();
    expect(await store.getRasterBlob("a")).toBeNull();
  });

  it("returns null blobs for unknown ids", async () => {
    expect(await store.getPreviewBlob("missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/store/userMapStore.test.ts`
Expected: FAIL — cannot resolve `./userMapStore`.

- [ ] **Step 3: Implement** — `web/src/userMaps/store/userMapStore.ts`:

```ts
import { UserMapImportError } from "../errors";
import type { UserMapRecord } from "../types";

const DB_NAME = "ns-marks-the-spot-user-maps";
const DB_VERSION = 1;
const MAPS = "maps";
const BLOBS = "blobs";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}

/**
 * Two stores: `maps` holds small metadata records (listed on every load),
 * `blobs` holds the heavy binaries keyed `${id}:raster` / `${id}:preview` so
 * listing never deserializes megabytes of image data.
 */
export class UserMapStore {
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<UserMapStore> {
    return new Promise((resolve, reject) => {
      const openRequest = factory.open(DB_NAME, DB_VERSION);
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result;
        if (!db.objectStoreNames.contains(MAPS)) {
          db.createObjectStore(MAPS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(BLOBS)) {
          db.createObjectStore(BLOBS);
        }
      };
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        // If another tab upgrades the schema, release our handle.
        db.onversionchange = () => db.close();
        resolve(new UserMapStore(db));
      };
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onblocked = () =>
        reject(new Error("user-map database blocked by another tab"));
    });
  }

  async saveUserMap(
    record: UserMapRecord,
    raster: Blob,
    preview: Blob,
  ): Promise<void> {
    const tx = this.db.transaction([MAPS, BLOBS], "readwrite");
    tx.objectStore(MAPS).put(record);
    tx.objectStore(BLOBS).put(raster, `${record.id}:raster`);
    tx.objectStore(BLOBS).put(preview, `${record.id}:preview`);
    try {
      await transactionDone(tx);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new UserMapImportError(
          "quota",
          "Storage is full — this map stays available until you close the tab.",
        );
      }
      throw new UserMapImportError(
        "storage-failed",
        "Couldn't save this map — it stays available until you close the tab.",
      );
    }
  }

  async listUserMaps(): Promise<UserMapRecord[]> {
    const tx = this.db.transaction(MAPS, "readonly");
    const all = await request(
      tx.objectStore(MAPS).getAll() as IDBRequest<UserMapRecord[]>,
    );
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async getBlob(key: string): Promise<Blob | null> {
    const tx = this.db.transaction(BLOBS, "readonly");
    const result = await request(
      tx.objectStore(BLOBS).get(key) as IDBRequest<Blob | undefined>,
    );
    return result ?? null;
  }

  getPreviewBlob(id: string): Promise<Blob | null> {
    return this.getBlob(`${id}:preview`);
  }

  getRasterBlob(id: string): Promise<Blob | null> {
    return this.getBlob(`${id}:raster`);
  }

  async renameUserMap(id: string, name: string): Promise<void> {
    const tx = this.db.transaction(MAPS, "readwrite");
    const store = tx.objectStore(MAPS);
    const existing = await request(
      store.get(id) as IDBRequest<UserMapRecord | undefined>,
    );
    if (existing) {
      store.put({ ...existing, name });
    }
    await transactionDone(tx);
  }

  async deleteUserMap(id: string): Promise<void> {
    const tx = this.db.transaction([MAPS, BLOBS], "readwrite");
    tx.objectStore(MAPS).delete(id);
    tx.objectStore(BLOBS).delete(`${id}:raster`);
    tx.objectStore(BLOBS).delete(`${id}:preview`);
    await transactionDone(tx);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/store/userMapStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/store
git commit -m "feat(web): persist user maps in IndexedDB"
```

---

### Task 6: Mesh math + WarpedRasterLayer + pane constants

**Files:**
- Create: `web/src/userMaps/render/mesh.ts`
- Create: `web/src/userMaps/render/WarpedRasterLayer.ts`
- Modify: `web/src/components/mapPanes.ts` (append two constants)
- Test: `web/src/userMaps/render/mesh.test.ts`
- Test: `web/src/userMaps/render/WarpedRasterLayer.test.ts`
- Test: `web/src/components/mapPanes.test.ts` (add ordering assertions)

**Interfaces:**
- Consumes: `LatLngPoint` (Task 2).
- Produces:
  - `mesh.ts`: `type XY = { x: number; y: number }`; `affineFromTriangles(s0, s1, s2, d0, d1, d2): [number, number, number, number, number, number]` (canvas `setTransform` order); `buildSrcMesh(width, height, gridSize?): XY[][]`; `drawWarpedImage(ctx, image, srcMesh, dstMesh): void`.
  - `WarpedRasterLayer.ts`: `class WarpedRasterLayer extends L.Layer` with `constructor(options: WarpedRasterLayerOptions)`, `setOpacity(opacity: number): void`, `onAdd`/`onRemove`. `type WarpedRasterLayerOptions = { paneName: string; opacity: number; image: CanvasImageSource; imageSize: PixelSize-shaped; latLngMesh: LatLngPoint[][] }`.
  - `mapPanes.ts`: `USER_MAPS_PANE = "user-maps-pane"`, `USER_MAPS_PANE_Z_INDEX = 160`.

- [ ] **Step 1: Write the failing mesh test** — `web/src/userMaps/render/mesh.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { affineFromTriangles, buildSrcMesh, drawWarpedImage } from "./mesh";

describe("affineFromTriangles", () => {
  it("recovers a pure scale+translate mapping", () => {
    const [a, b, c, d, e, f] = affineFromTriangles(
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 },
      { x: 10, y: 20 }, { x: 12, y: 20 }, { x: 10, y: 23 },
    );
    expect([a, b, c, d, e, f]).toEqual([2, 0, 0, 3, 10, 20]);
  });

  it("maps every source vertex exactly onto its destination", () => {
    const s = [{ x: 3, y: 7 }, { x: 90, y: 12 }, { x: 40, y: 80 }];
    const t = [{ x: -5, y: 4 }, { x: 55, y: -9 }, { x: 31, y: 66 }];
    const [a, b, c, d, e, f] = affineFromTriangles(s[0], s[1], s[2], t[0], t[1], t[2]);
    for (let i = 0; i < 3; i += 1) {
      expect(a * s[i].x + c * s[i].y + e).toBeCloseTo(t[i].x, 9);
      expect(b * s[i].x + d * s[i].y + f).toBeCloseTo(t[i].y, 9);
    }
  });
});

describe("buildSrcMesh", () => {
  it("builds a lattice matching buildLatLngMesh's row/col order", () => {
    const mesh = buildSrcMesh(800, 400, 8);
    expect(mesh).toHaveLength(9);
    expect(mesh[0][0]).toEqual({ x: 0, y: 0 });
    expect(mesh[8][8]).toEqual({ x: 800, y: 400 });
    expect(mesh[4][2]).toEqual({ x: 200, y: 200 });
  });
});

describe("drawWarpedImage", () => {
  it("draws two clipped triangles per mesh cell", () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(),
      setTransform: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const src = buildSrcMesh(10, 10, 2); // 2x2 cells = 8 triangles
    const dst = buildSrcMesh(100, 100, 2);
    drawWarpedImage(ctx, {} as CanvasImageSource, src, dst);
    expect(ctx.drawImage).toHaveBeenCalledTimes(8);
    expect(ctx.clip).toHaveBeenCalledTimes(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/render/mesh.test.ts`
Expected: FAIL — cannot resolve `./mesh`.

- [ ] **Step 3: Implement** — `web/src/userMaps/render/mesh.ts`:

```ts
export type XY = { x: number; y: number };

/**
 * Exact affine transform mapping source triangle → destination triangle,
 * returned in canvas setTransform(a, b, c, d, e, f) order:
 *   x' = a·x + c·y + e;  y' = b·x + d·y + f
 */
export function affineFromTriangles(
  s0: XY, s1: XY, s2: XY,
  d0: XY, d1: XY, d2: XY,
): [number, number, number, number, number, number] {
  const u1 = s1.x - s0.x;
  const v1 = s1.y - s0.y;
  const u2 = s2.x - s0.x;
  const v2 = s2.y - s0.y;
  const det = u1 * v2 - u2 * v1;
  const a = ((d1.x - d0.x) * v2 - (d2.x - d0.x) * v1) / det;
  const c = ((d2.x - d0.x) * u1 - (d1.x - d0.x) * u2) / det;
  const b = ((d1.y - d0.y) * v2 - (d2.y - d0.y) * v1) / det;
  const d = ((d2.y - d0.y) * u1 - (d1.y - d0.y) * u2) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;
  return [a, b, c, d, e, f];
}

/** Pixel-space lattice in the same row/col order as buildLatLngMesh. */
export function buildSrcMesh(width: number, height: number, gridSize = 8): XY[][] {
  const mesh: XY[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: XY[] = [];
    for (let col = 0; col <= gridSize; col += 1) {
      line.push({ x: (width * col) / gridSize, y: (height * row) / gridSize });
    }
    mesh.push(line);
  }
  return mesh;
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  s0: XY, s1: XY, s2: XY,
  d0: XY, d1: XY, d2: XY,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(...affineFromTriangles(s0, s1, s2, d0, d1, d2));
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/**
 * Draws `image` through the mesh: each cell splits into two triangles, each
 * drawn with an exact affine transform under a clip path. Grid density (not
 * this function) controls how closely the warp tracks projection curvature.
 */
export function drawWarpedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  srcMesh: XY[][],
  dstMesh: XY[][],
): void {
  for (let row = 0; row < srcMesh.length - 1; row += 1) {
    for (let col = 0; col < srcMesh[row].length - 1; col += 1) {
      const s00 = srcMesh[row][col];
      const s10 = srcMesh[row][col + 1];
      const s01 = srcMesh[row + 1][col];
      const s11 = srcMesh[row + 1][col + 1];
      const d00 = dstMesh[row][col];
      const d10 = dstMesh[row][col + 1];
      const d01 = dstMesh[row + 1][col];
      const d11 = dstMesh[row + 1][col + 1];
      drawTriangle(ctx, image, s00, s10, s01, d00, d10, d01);
      drawTriangle(ctx, image, s10, s11, s01, d10, d11, d01);
    }
  }
}
```

- [ ] **Step 4: Run mesh test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/render/mesh.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Append pane constants** to `web/src/components/mapPanes.ts` (after the `MEASURE_PANE` block):

```ts
/**
 * User-loaded rasters sit directly above the aerial imagery (150) and below
 * every data overlay (environmental health 165, contours 180, parcels 200,
 * roads 235, waterfalls 250) so parcel lines and roads stay readable on top
 * of a draped scan. The scan is context, not the subject of inspection.
 */
export const USER_MAPS_PANE = "user-maps-pane";
export const USER_MAPS_PANE_Z_INDEX = 160;
```

Add to `web/src/components/mapPanes.test.ts` (match the file's existing import style):

```ts
it("stacks user maps above aerial imagery and below data overlays", () => {
  expect(USER_MAPS_PANE_Z_INDEX).toBeGreaterThan(
    PROVINCE_LAYER_Z_INDEXES["ns-aerial"],
  );
  expect(USER_MAPS_PANE_Z_INDEX).toBeLessThan(
    ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX,
  );
  expect(USER_MAPS_PANE_Z_INDEX).toBeLessThan(PROVINCE_LAYER_Z_INDEXES.nsprd);
});
```

- [ ] **Step 6: Write the failing layer test** — `web/src/userMaps/render/WarpedRasterLayer.test.ts`:

```ts
import L from "leaflet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WarpedRasterLayer } from "./WarpedRasterLayer";

function stubMap(paneEl: HTMLElement) {
  return {
    getPane: vi.fn(() => paneEl),
    getSize: vi.fn(() => new L.Point(800, 600)),
    latLngToContainerPoint: vi.fn(
      (ll: { lat: number; lng: number }) => new L.Point(ll.lng * 10, ll.lat * 10),
    ),
    containerPointToLayerPoint: vi.fn(() => new L.Point(0, 0)),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as L.Map;
}

function makeLayer() {
  return new WarpedRasterLayer({
    paneName: "user-maps-pane",
    opacity: 0.7,
    image: {} as CanvasImageSource,
    imageSize: { width: 8, height: 6 },
    latLngMesh: [
      [{ lat: 46, lng: -63.1 }, { lat: 46, lng: -63 }],
      [{ lat: 45.9, lng: -63.1 }, { lat: 45.9, lng: -63 }],
    ],
  });
}

describe("WarpedRasterLayer", () => {
  let pane: HTMLElement;

  beforeEach(() => {
    pane = document.createElement("div");
  });

  it("adds a canvas to its pane with the configured opacity", () => {
    makeLayer().onAdd(stubMap(pane));
    const canvas = pane.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.style.opacity).toBe("0.7");
  });

  it("sizes the canvas backing store by devicePixelRatio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    makeLayer().onAdd(stubMap(pane));
    const canvas = pane.querySelector("canvas");
    expect(canvas?.width).toBe(1600);
    expect(canvas?.style.width).toBe("800px");
    vi.unstubAllGlobals();
  });

  it("subscribes to map view changes and unsubscribes on remove", () => {
    const map = stubMap(pane);
    const layer = makeLayer();
    layer.onAdd(map);
    expect(map.on).toHaveBeenCalledWith(
      "moveend zoomend viewreset resize",
      expect.any(Function),
      layer,
    );
    layer.onRemove(map);
    expect(map.off).toHaveBeenCalledWith(
      "moveend zoomend viewreset resize",
      expect.any(Function),
      layer,
    );
    expect(pane.querySelector("canvas")).toBeNull();
  });

  it("updates opacity in place", () => {
    const layer = makeLayer();
    layer.onAdd(stubMap(pane));
    layer.setOpacity(0.25);
    expect(pane.querySelector("canvas")?.style.opacity).toBe("0.25");
  });
});
```

- [ ] **Step 7: Run layer test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/render/WarpedRasterLayer.test.ts`
Expected: FAIL — cannot resolve `./WarpedRasterLayer`.

- [ ] **Step 8: Implement** — `web/src/userMaps/render/WarpedRasterLayer.ts`:

```ts
import L from "leaflet";
import type { LatLngPoint } from "../transform/projection";
import { buildSrcMesh, drawWarpedImage, type XY } from "./mesh";

export type WarpedRasterLayerOptions = {
  paneName: string;
  opacity: number;
  image: CanvasImageSource;
  imageSize: { width: number; height: number };
  latLngMesh: LatLngPoint[][];
};

/**
 * Canvas overlay that draws a raster through a projected mesh. The canvas is
 * viewport-sized and repositioned after each completed view change (the
 * Leaflet.heat pattern): during a drag the pane carries the canvas, and on
 * moveend it snaps back to the viewport and redraws. Zoom animations jump
 * rather than scale — the spec's accepted v1 trade-off.
 */
export class WarpedRasterLayer extends L.Layer {
  private readonly rasterOptions: WarpedRasterLayerOptions;
  private readonly srcMesh: XY[][];
  private canvas: HTMLCanvasElement | null = null;
  private map: L.Map | null = null;

  constructor(options: WarpedRasterLayerOptions) {
    super();
    this.rasterOptions = options;
    const rows = options.latLngMesh.length - 1;
    this.srcMesh = buildSrcMesh(
      options.imageSize.width,
      options.imageSize.height,
      rows,
    );
  }

  onAdd(map: L.Map): this {
    this.map = map;
    const pane = map.getPane(this.rasterOptions.paneName);
    if (!pane) {
      return this;
    }
    this.canvas = document.createElement("canvas");
    this.canvas.style.opacity = String(this.rasterOptions.opacity);
    this.canvas.style.pointerEvents = "none";
    pane.appendChild(this.canvas);
    map.on("moveend zoomend viewreset resize", this.redraw, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off("moveend zoomend viewreset resize", this.redraw, this);
    this.canvas?.remove();
    this.canvas = null;
    this.map = null;
    return this;
  }

  setOpacity(opacity: number): void {
    this.rasterOptions.opacity = opacity;
    if (this.canvas) {
      this.canvas.style.opacity = String(opacity);
    }
  }

  private redraw(): void {
    const { canvas, map } = this;
    if (!canvas || !map) {
      return;
    }
    const size = map.getSize();
    const dpr = globalThis.devicePixelRatio || 1;
    // Backing store at device resolution, CSS box at layout resolution, and
    // destination points scaled by dpr — keeps previews sharp on Retina.
    canvas.width = Math.round(size.x * dpr);
    canvas.height = Math.round(size.y * dpr);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint(new L.Point(0, 0)));
    // jsdom (tests) has no 2D context; drawing is a no-op there by design.
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dstMesh = this.rasterOptions.latLngMesh.map((row) =>
      row.map((ll) => {
        const p = map.latLngToContainerPoint(new L.LatLng(ll.lat, ll.lng));
        return { x: p.x * dpr, y: p.y * dpr };
      }),
    );
    drawWarpedImage(ctx, this.rasterOptions.image, this.srcMesh, dstMesh);
  }
}
```

- [ ] **Step 9: Run all Task-6 tests**

Run: `cd web && npx vitest run src/userMaps/render src/components/mapPanes.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/src/userMaps/render web/src/components/mapPanes.ts web/src/components/mapPanes.test.ts
git commit -m "feat(web): render user rasters through a warped canvas mesh layer"
```

---

### Task 7: React bridge — UserMapLayers

**Files:**
- Create: `web/src/userMaps/components/UserMapLayers.tsx`
- Test: `web/src/userMaps/components/UserMapLayers.test.tsx`

**Interfaces:**
- Consumes: `WarpedRasterLayer` (Task 6), `buildLatLngMesh` (Task 2), `UserMapRecord` (Task 4), pane constants (Task 6), react-leaflet `useMap`.
- Produces: `type VisibleUserMap = { record: UserMapRecord; previewUrl: string; opacity: number }`; `function UserMapLayers({ maps }: { maps: VisibleUserMap[] })`. Only `kind: "embedded"` georefs render in PR 1. **No `useState` in effects** (lint constraint): pane creation happens idempotently inside each overlay's effect; there is no readiness state.

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/components/UserMapLayers.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserMapRecord } from "../types";

const paneEl = vi.hoisted(() => ({ current: null as HTMLElement | null }));

const stubMapApi = vi.hoisted(() => ({
  createPane: vi.fn(() => {
    paneEl.current = document.createElement("div");
    return paneEl.current;
  }),
  getPane: vi.fn(() => paneEl.current ?? undefined),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
}));

vi.mock("react-leaflet", () => ({
  useMap: () => stubMapApi,
}));

const layerInstances = vi.hoisted(
  () => [] as Array<{ options: unknown; setOpacity: ReturnType<typeof vi.fn> }>,
);

vi.mock("../render/WarpedRasterLayer", () => ({
  WarpedRasterLayer: class {
    options: unknown;
    setOpacity = vi.fn();
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

import { UserMapLayers } from "./UserMapLayers";

const record: UserMapRecord = {
  id: "a",
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

function stubBitmapLoading() {
  const bitmap = { width: 8, height: 6, close: vi.fn() };
  vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  return bitmap;
}

afterEach(() => {
  vi.unstubAllGlobals();
  layerInstances.length = 0;
  paneEl.current = null;
  stubMapApi.createPane.mockClear();
  stubMapApi.addLayer.mockClear();
  stubMapApi.removeLayer.mockClear();
});

describe("UserMapLayers", () => {
  it("creates the user-maps pane once per map set", async () => {
    stubBitmapLoading();
    render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    expect(stubMapApi.createPane).toHaveBeenCalledWith("user-maps-pane");
  });

  it("adds a warped layer per visible map, closes its bitmap on unmount", async () => {
    const bitmap = stubBitmapLoading();
    const { unmount } = render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    unmount();
    expect(stubMapApi.removeLayer).toHaveBeenCalledTimes(1);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("applies the LATEST opacity even when it changes during bitmap load", async () => {
    // Deliberate race: opacity changes before createImageBitmap resolves.
    let resolveBitmap!: (b: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => new Promise((resolve) => { resolveBitmap = resolve; })),
    );
    const { rerender } = render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]} />,
    );
    rerender(
      <UserMapLayers maps={[{ record, previewUrl: "blob:fake", opacity: 0.2 }]} />,
    );
    resolveBitmap({ width: 8, height: 6, close: vi.fn() });
    await waitFor(() => expect(layerInstances).toHaveLength(1));
    const built = layerInstances[0].options as { opacity: number };
    // Either constructed with 0.2 or corrected via setOpacity(0.2) — assert the outcome.
    const corrected = layerInstances[0].setOpacity.mock.calls.some(
      (c) => c[0] === 0.2,
    );
    expect(built.opacity === 0.2 || corrected).toBe(true);
  });

  it("survives a failed bitmap load without an unhandled rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("gone"); }));
    vi.stubGlobal("createImageBitmap", vi.fn());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:dead", opacity: 0.7 }]} />,
    );
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(stubMapApi.addLayer).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/UserMapLayers.test.tsx`
Expected: FAIL — cannot resolve `./UserMapLayers`.

- [ ] **Step 3: Implement** — `web/src/userMaps/components/UserMapLayers.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import {
  USER_MAPS_PANE,
  USER_MAPS_PANE_Z_INDEX,
} from "../../components/mapPanes";
import { buildLatLngMesh } from "../transform/projection";
import { WarpedRasterLayer } from "../render/WarpedRasterLayer";
import type { UserMapRecord } from "../types";

export type VisibleUserMap = {
  record: UserMapRecord;
  previewUrl: string;
  opacity: number;
};

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

function WarpedRasterOverlay({ map }: { map: VisibleUserMap }) {
  const leafletMap = useMap();
  const layerRef = useRef<WarpedRasterLayer | null>(null);
  const opacityRef = useRef(map.opacity);
  opacityRef.current = map.opacity;
  const { record, previewUrl } = map;

  useEffect(() => {
    if (!leafletMap || record.georef.kind !== "embedded") {
      return;
    }
    const georef = record.georef;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void loadBitmap(previewUrl)
      .then((loaded) => {
        if (cancelled) {
          loaded.close();
          return;
        }
        bitmap = loaded;
        ensurePane(leafletMap);
        const layer = new WarpedRasterLayer({
          paneName: USER_MAPS_PANE,
          // Read through the ref so an opacity change during the async load
          // is not lost to a stale closure.
          opacity: opacityRef.current,
          image: loaded,
          imageSize: { width: loaded.width, height: loaded.height },
          latLngMesh: buildLatLngMesh(georef, record.pixelSize),
        });
        layer.addTo(leafletMap);
        layerRef.current = layer;
      })
      .catch((error: unknown) => {
        // A missing/revoked blob URL is recoverable (map re-enable reloads
        // it); surface for diagnosis without crashing the tree.
        console.error("user map preview failed to load", error);
      });
    return () => {
      cancelled = true;
      layerRef.current?.remove();
      layerRef.current = null;
      bitmap?.close();
    };
  }, [leafletMap, record, previewUrl]);

  useEffect(() => {
    layerRef.current?.setOpacity(map.opacity);
  }, [map.opacity]);

  return null;
}

/** Sole mount point MapCanvas needs. */
export function UserMapLayers({ maps }: { maps: VisibleUserMap[] }) {
  return (
    <>
      {maps.map((map) => (
        <WarpedRasterOverlay key={map.record.id} map={map} />
      ))}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/components/UserMapLayers.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/components/UserMapLayers.tsx web/src/userMaps/components/UserMapLayers.test.tsx
git commit -m "feat(web): mount warped user-map layers via react-leaflet bridge"
```

---

### Task 8: State hook — useUserMaps

**Files:**
- Create: `web/src/userMaps/useUserMaps.ts`
- Test: `web/src/userMaps/useUserMaps.test.ts`

**Interfaces:**
- Consumes: `UserMapStore` (Task 5), `sniffFileType` (Task 1), `parseGeoTiffAuto` (Task 4), `UserMapImportError` (Task 1), `VisibleUserMap` (Task 7).
- Produces:

```ts
type ImportOutcome =
  | { fileName: string; ok: true; id: string; note?: string }
  | { fileName: string; ok: false; message: string };

type UserMapsApi = {
  records: UserMapRecord[];
  uiState: Record<string, { enabled: boolean; opacity: number }>;
  visibleMaps: VisibleUserMap[];
  importing: boolean;
  importingLabel: string | null;   // e.g. "Reading large map…"
  storageError: string | null;     // set when the saved-maps DB cannot open
  outcomes: ImportOutcome[];
  importFiles: (files: ArrayLike<File>) => Promise<void>;
  removeMap: (id: string) => Promise<void>;
  renameMap: (id: string, name: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => void;
  setOpacity: (id: string, opacity: number) => void;
};

function useUserMaps(options?: {
  openStore?: () => Promise<UserMapStore>;
  parse?: (buffer: ArrayBuffer) => Promise<ParsedGeoTiff>;
}): UserMapsApi;
```

Constants: `DEFAULT_OPACITY = 0.7`, `HARD_LIMIT_BYTES = 500 * 1024 * 1024`, `LARGE_FILE_BYTES = 150 * 1024 * 1024`, localStorage key `user-map-ui-state-v1`. Behavior contracts: quota/storage save failures **keep the imported map in memory** for the session (spec promise); records loaded from the store **merge by id** with any imported during the load; object URLs are revoked on unmount and on remove.

- [ ] **Step 1: Write the failing hook test** — `web/src/userMaps/useUserMaps.test.ts`:

```ts
import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UserMapImportError } from "./errors";
import { UserMapStore } from "./store/userMapStore";
import { useUserMaps } from "./useUserMaps";

function fixtureFile(name = "survey.tif"): File {
  const raw = readFileSync(
    join(__dirname, "..", "test", "fixtures", "utm20-8x6.tif"),
  );
  return new File([raw], name);
}

/** jsdom has no canvas, so every test injects a parse with a fake preview. */
function testParse() {
  return async (buffer: ArrayBuffer) => {
    const { parseGeoTiff } = await import("./parsers/geoTiffSource");
    return parseGeoTiff(buffer, {
      makePreview: async () => new Blob(["p"], { type: "image/png" }),
    });
  };
}

let factory: IDBFactory;

function options(overrides: Record<string, unknown> = {}) {
  return {
    openStore: () => UserMapStore.open(factory),
    parse: testParse(),
    ...overrides,
  };
}

beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => `blob:fake-${Math.random()}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("useUserMaps", () => {
  it("imports a GeoTIFF, enables it by default, and exposes it as visible", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.records[0].name).toBe("survey");
    expect(result.current.outcomes[0]).toMatchObject({ ok: true });
    expect(result.current.visibleMaps).toHaveLength(1);
    expect(result.current.visibleMaps[0].opacity).toBe(0.7);
  });

  it("reloads persisted maps on a fresh mount", async () => {
    const first = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await first.result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(first.result.current.records).toHaveLength(1));
    first.unmount();

    const second = renderHook(() => useUserMaps(options()));
    await waitFor(() => expect(second.result.current.records).toHaveLength(1));
  });

  it("reports the georeferencer message for PDFs, even tiny ones", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    // 5 bytes on purpose: regression guard for the Uint8Array(buffer, 0, 16)
    // RangeError the review caught.
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "plan.pdf");
    await act(async () => {
      await result.current.importFiles([pdf]);
    });
    expect(result.current.outcomes[0]).toMatchObject({ ok: false });
    expect((result.current.outcomes[0] as { message: string }).message).toContain(
      "georeferencer",
    );
    expect(result.current.records).toHaveLength(0);
  });

  it("refuses files over the hard limit without reading them", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    const huge = new File([new Uint8Array(8)], "huge.tif");
    Object.defineProperty(huge, "size", { value: 501 * 1024 * 1024 });
    await act(async () => {
      await result.current.importFiles([huge]);
    });
    expect(result.current.outcomes[0]).toMatchObject({ ok: false });
  });

  it("keeps the map available in memory when saving fails (spec promise)", async () => {
    const failingStore = {
      listUserMaps: async () => [],
      saveUserMap: async () => {
        throw new UserMapImportError(
          "quota",
          "Storage is full — this map stays available until you close the tab.",
        );
      },
      getPreviewBlob: async () => null,
      deleteUserMap: async () => {},
      renameUserMap: async () => {},
      close: () => {},
    } as unknown as UserMapStore;
    const { result } = renderHook(() =>
      useUserMaps(options({ openStore: async () => failingStore })),
    );
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.visibleMaps).toHaveLength(1);
    expect(result.current.outcomes[0]).toMatchObject({ ok: true });
    expect((result.current.outcomes[0] as { note?: string }).note).toContain(
      "close the tab",
    );
  });

  it("surfaces a storage error when the database cannot open", async () => {
    const { result } = renderHook(() =>
      useUserMaps(
        options({
          openStore: async () => {
            throw new Error("blocked");
          },
        }),
      ),
    );
    await waitFor(() => expect(result.current.storageError).not.toBeNull());
    // Importing still works — maps just live in memory for this session.
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
  });

  it("toggles visibility and persists opacity to localStorage", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    const id = result.current.records[0].id;

    act(() => result.current.setEnabled(id, false));
    expect(result.current.visibleMaps).toHaveLength(0);

    act(() => result.current.setOpacity(id, 0.4));
    const stored = JSON.parse(
      localStorage.getItem("user-map-ui-state-v1") ?? "{}",
    ) as Record<string, { enabled: boolean; opacity: number }>;
    expect(stored[id]).toEqual({ enabled: false, opacity: 0.4 });
  });

  it("removes a map everywhere and revokes its preview URL", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    const id = result.current.records[0].id;
    await act(async () => {
      await result.current.removeMap(id);
    });
    expect(result.current.records).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("revokes all preview URLs on unmount", async () => {
    const { result, unmount } = renderHook(() => useUserMaps(options()));
    await act(async () => {
      await result.current.importFiles([fixtureFile()]);
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/useUserMaps.test.ts`
Expected: FAIL — cannot resolve `./useUserMaps`.

- [ ] **Step 3: Implement** — `web/src/userMaps/useUserMaps.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { UserMapImportError } from "./errors";
import { parseGeoTiffAuto } from "./parsers/parseInWorker";
import type { ParsedGeoTiff } from "./parsers/geoTiffSource";
import { sniffFileType } from "./parsers/sniff";
import { UserMapStore } from "./store/userMapStore";
import type { UserMapRecord } from "./types";
import type { VisibleUserMap } from "./components/UserMapLayers";

export const DEFAULT_OPACITY = 0.7;
export const HARD_LIMIT_BYTES = 500 * 1024 * 1024;
export const LARGE_FILE_BYTES = 150 * 1024 * 1024;
const UI_STATE_KEY = "user-map-ui-state-v1";

const COMING_SOON_MESSAGE =
  "This file type arrives with the georeferencer in the next update. " +
  "GeoTIFF works today.";

export type ImportOutcome =
  | { fileName: string; ok: true; id: string; note?: string }
  | { fileName: string; ok: false; message: string };

export type UserMapUiState = Record<string, { enabled: boolean; opacity: number }>;

export type UserMapsApi = {
  records: UserMapRecord[];
  uiState: UserMapUiState;
  visibleMaps: VisibleUserMap[];
  importing: boolean;
  importingLabel: string | null;
  storageError: string | null;
  outcomes: ImportOutcome[];
  importFiles: (files: ArrayLike<File>) => Promise<void>;
  removeMap: (id: string) => Promise<void>;
  renameMap: (id: string, name: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => void;
  setOpacity: (id: string, opacity: number) => void;
};

function loadUiState(): UserMapUiState {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) ?? "{}") as UserMapUiState;
  } catch {
    return {};
  }
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Owns all user-map state so App.tsx stays a mounting point. The store opens
 * lazily; openStore and parse are injectable seams for tests (closure
 * injection per project convention — no protocols until a second impl
 * exists). Storage failures degrade to session-only maps rather than losing
 * the import.
 */
export function useUserMaps(
  options: {
    openStore?: () => Promise<UserMapStore>;
    parse?: (buffer: ArrayBuffer) => Promise<ParsedGeoTiff>;
  } = {},
): UserMapsApi {
  const openStoreRef = useRef(options.openStore ?? (() => UserMapStore.open()));
  const parseRef = useRef(options.parse ?? parseGeoTiffAuto);
  const storeRef = useRef<Promise<UserMapStore> | null>(null);
  const previewUrlsRef = useRef<Record<string, string>>({});
  const [records, setRecords] = useState<UserMapRecord[]>([]);
  const [uiState, setUiState] = useState<UserMapUiState>(loadUiState);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importingLabel, setImportingLabel] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);

  const store = useCallback((): Promise<UserMapStore> => {
    storeRef.current ??= openStoreRef.current();
    return storeRef.current;
  }, []);

  const persistUiState = useCallback((next: UserMapUiState) => {
    setUiState(next);
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
  }, []);

  const registerPreviewUrl = useCallback((id: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    previewUrlsRef.current[id] = url;
    setPreviewUrls((prev) => ({ ...prev, [id]: url }));
  }, []);

  // Initial load of persisted maps; merge by id so a fast import that lands
  // before this list resolves is never overwritten.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opened = await store();
        const loaded = await opened.listUserMaps();
        if (cancelled) {
          return;
        }
        setRecords((prev) => {
          const known = new Set(prev.map((r) => r.id));
          const merged = [...loaded.filter((r) => !known.has(r.id)), ...prev];
          return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        for (const record of loaded) {
          const blob = await opened.getPreviewBlob(record.id);
          if (!cancelled && blob) {
            registerPreviewUrl(record.id, blob);
          }
        }
      } catch {
        if (!cancelled) {
          setStorageError(
            "Saved maps are unavailable in this browser session. Imports " +
              "still work, but only until you close the tab.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [registerPreviewUrl, store]);

  // Revoke every preview URL when the owning component unmounts.
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      for (const url of Object.values(urls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const importFiles = useCallback(
    async (files: ArrayLike<File>) => {
      setImporting(true);
      const batch: ImportOutcome[] = [];
      try {
        for (const file of Array.from(files)) {
          setImportingLabel(
            file.size > LARGE_FILE_BYTES
              ? `Reading large map "${file.name}" — this can take a minute…`
              : `Reading "${file.name}"…`,
          );
          try {
            if (file.size > HARD_LIMIT_BYTES) {
              throw new UserMapImportError(
                "too-large",
                "This file is over 500 MB. Export a smaller area or lower " +
                  "resolution and re-import.",
              );
            }
            const buffer = await file.arrayBuffer();
            const type = sniffFileType(
              new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength)),
            );
            if (type === "pdf" || type === "png" || type === "jpeg") {
              throw new UserMapImportError("unsupported-type", COMING_SOON_MESSAGE);
            }
            if (type !== "geotiff") {
              throw new UserMapImportError(
                "unsupported-type",
                "Not a recognized map file. GeoTIFF works today; PDF and " +
                  "plain scans arrive with the georeferencer.",
              );
            }
            // parse may transfer the buffer to a worker — pass a copy of the
            // File-backed buffer, which we no longer need afterwards.
            const parsed = await parseRef.current(buffer);
            const record: UserMapRecord = {
              id: crypto.randomUUID(),
              name: stripExtension(file.name),
              source: "geotiff",
              createdAt: new Date().toISOString(),
              pixelSize: parsed.pixelSize,
              georef: parsed.georef,
            };
            let note =
              file.size > LARGE_FILE_BYTES
                ? "Large file — displayed at reduced resolution."
                : undefined;
            try {
              await (await store()).saveUserMap(record, file, parsed.preview);
            } catch (saveError) {
              // Spec promise: a save failure never discards the import; the
              // map lives in memory for this session.
              note =
                saveError instanceof UserMapImportError
                  ? saveError.userMessage
                  : "Couldn't save this map — it stays available until you " +
                    "close the tab.";
            }
            setRecords((prev) => [...prev, record]);
            registerPreviewUrl(record.id, parsed.preview);
            persistUiState({
              ...loadUiState(),
              [record.id]: { enabled: true, opacity: DEFAULT_OPACITY },
            });
            batch.unshift({ fileName: file.name, ok: true, id: record.id, note });
          } catch (error) {
            const message =
              error instanceof UserMapImportError
                ? error.userMessage
                : "Something went wrong reading this file.";
            batch.unshift({ fileName: file.name, ok: false, message });
          }
        }
      } finally {
        setOutcomes(batch);
        setImporting(false);
        setImportingLabel(null);
      }
    },
    [persistUiState, registerPreviewUrl, store],
  );

  const removeMap = useCallback(
    async (id: string) => {
      try {
        await (await store()).deleteUserMap(id);
      } catch {
        // Deleting an unsaved (in-memory) map from a broken store is fine.
      }
      setRecords((prev) => prev.filter((r) => r.id !== id));
      const url = previewUrlsRef.current[id];
      if (url) {
        URL.revokeObjectURL(url);
        delete previewUrlsRef.current[id];
      }
      setPreviewUrls((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const nextUi = { ...loadUiState() };
      delete nextUi[id];
      persistUiState(nextUi);
    },
    [persistUiState, store],
  );

  const renameMap = useCallback(
    async (id: string, name: string) => {
      try {
        await (await store()).renameUserMap(id, name);
      } catch {
        // In-memory-only map; rename still applies below.
      }
      setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    },
    [store],
  );

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const current = loadUiState();
      persistUiState({
        ...current,
        [id]: { opacity: DEFAULT_OPACITY, ...current[id], enabled },
      });
    },
    [persistUiState],
  );

  const setOpacity = useCallback(
    (id: string, opacity: number) => {
      const current = loadUiState();
      persistUiState({
        ...current,
        [id]: { enabled: true, ...current[id], opacity },
      });
    },
    [persistUiState],
  );

  const visibleMaps: VisibleUserMap[] = records
    .filter((r) => (uiState[r.id]?.enabled ?? false) && previewUrls[r.id])
    .map((r) => ({
      record: r,
      previewUrl: previewUrls[r.id],
      opacity: uiState[r.id]?.opacity ?? DEFAULT_OPACITY,
    }));

  return {
    records,
    uiState,
    visibleMaps,
    importing,
    importingLabel,
    storageError,
    outcomes,
    importFiles,
    removeMap,
    renameMap,
    setEnabled,
    setOpacity,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/useUserMaps.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/userMaps/useUserMaps.ts web/src/userMaps/useUserMaps.test.ts
git commit -m "feat(web): add useUserMaps state hook with import pipeline"
```

---

### Task 9: Layer-list UI — UserMapRows + ImportDialog

**Files:**
- Create: `web/src/userMaps/components/ImportDialog.tsx`
- Create: `web/src/userMaps/components/UserMapRows.tsx`
- Modify: `web/src/styles.css` (append user-maps styles)
- Test: `web/src/userMaps/components/UserMapRows.test.tsx`

**Interfaces:**
- Consumes: `UserMapsApi`, `ImportOutcome` (Task 8), `UserMapRecord` (Task 4).
- Produces: `function UserMapRows({ api }: { api: UserMapsApi })` — the single element App mounts. `ImportDialog` (inline import area per spec naming; PR 2 evolves it) renders the file input, **drag-and-drop target**, progress label, outcome list, storage banner, and the privacy line. The per-map slider is labelled **Opacity** (its value raises opacity; calling it "Transparency" would invert the meaning).

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/components/UserMapRows.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UserMapsApi } from "../useUserMaps";
import type { UserMapRecord } from "../types";
import { UserMapRows } from "./UserMapRows";

const record: UserMapRecord = {
  id: "a",
  name: "Church survey",
  source: "geotiff",
  createdAt: "2026-07-24T00:00:00.000Z",
  pixelSize: { width: 8, height: 6 },
  georef: {
    kind: "embedded",
    crs: "EPSG:26920",
    geotransform: [500000, 10, 0, 5000000, 0, -10],
  },
};

function api(overrides: Partial<UserMapsApi> = {}): UserMapsApi {
  return {
    records: [],
    uiState: {},
    visibleMaps: [],
    importing: false,
    importingLabel: null,
    storageError: null,
    outcomes: [],
    importFiles: vi.fn(async () => {}),
    removeMap: vi.fn(async () => {}),
    renameMap: vi.fn(async () => {}),
    setEnabled: vi.fn(),
    setOpacity: vi.fn(),
    ...overrides,
  };
}

describe("UserMapRows", () => {
  it("shows the privacy promise verbatim", () => {
    render(<UserMapRows api={api()} />);
    expect(
      screen.getByText("Files stay on this device — nothing is uploaded."),
    ).toBeInTheDocument();
  });

  it("imports the chosen files", async () => {
    const testApi = api();
    render(<UserMapRows api={testApi} />);
    const input = screen.getByLabelText("Add a map file");
    await userEvent.upload(input, new File(["x"], "survey.tif"));
    expect(testApi.importFiles).toHaveBeenCalledTimes(1);
  });

  it("imports files dropped onto the import area", () => {
    const testApi = api();
    render(<UserMapRows api={testApi} />);
    const dropZone = screen.getByTestId("user-map-drop-zone");
    const file = new File(["x"], "survey.tif");
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(testApi.importFiles).toHaveBeenCalledWith([file]);
  });

  it("shows the storage banner when persistence is unavailable", () => {
    render(
      <UserMapRows
        api={api({ storageError: "Saved maps are unavailable in this browser session." })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
  });

  it("renders a toggle and an Opacity slider per map", () => {
    const testApi = api({
      records: [record],
      uiState: { a: { enabled: true, opacity: 0.7 } },
    });
    render(<UserMapRows api={testApi} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Church survey" }));
    expect(testApi.setEnabled).toHaveBeenCalledWith("a", false);

    const slider = screen.getByLabelText("Church survey opacity");
    fireEvent.change(slider, { target: { value: "30" } });
    expect(testApi.setOpacity).toHaveBeenCalledWith("a", 0.3);
  });

  it("asks for confirmation before deleting", () => {
    const testApi = api({
      records: [record],
      uiState: { a: { enabled: true, opacity: 0.7 } },
    });
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<UserMapRows api={testApi} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Church survey" }));
    expect(testApi.removeMap).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("lists import failures with their messages", () => {
    render(
      <UserMapRows
        api={api({
          outcomes: [
            { fileName: "plan.pdf", ok: false, message: "Coming with the georeferencer." },
          ],
        })}
      />,
    );
    expect(screen.getByText(/plan\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Coming with the georeferencer\./)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/UserMapRows.test.tsx`
Expected: FAIL — cannot resolve `./UserMapRows`.

- [ ] **Step 3: Implement ImportDialog** — `web/src/userMaps/components/ImportDialog.tsx`:

```tsx
import type { DragEvent } from "react";
import type { ImportOutcome } from "../useUserMaps";

/**
 * Inline import area (named per spec; the PR-2 georeferencer flow grows out
 * of it). Chose an inline section over a modal so the layer list stays the
 * single place a user manages layers.
 */
export function ImportDialog({
  importing,
  importingLabel,
  storageError,
  outcomes,
  onImportFiles,
}: {
  importing: boolean;
  importingLabel: string | null;
  storageError: string | null;
  outcomes: ImportOutcome[];
  onImportFiles: (files: ArrayLike<File>) => void;
}) {
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
      onImportFiles(Array.from(event.dataTransfer.files));
    }
  }

  return (
    <div
      className="user-map-import"
      data-testid="user-map-drop-zone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".tif,.tiff,.pdf,.png,.jpg,.jpeg"
        multiple
        aria-label="Add a map file"
        onChange={(event) => {
          if (event.target.files?.length) {
            onImportFiles(Array.from(event.target.files));
            event.target.value = "";
          }
        }}
      />
      <small className="user-map-privacy">
        Files stay on this device — nothing is uploaded.
      </small>
      {storageError ? (
        <small role="alert" className="user-map-error">
          {storageError}
        </small>
      ) : null}
      {importing && importingLabel ? (
        <small role="status">{importingLabel}</small>
      ) : null}
      {outcomes.length > 0 ? (
        <ul className="user-map-outcomes">
          {outcomes.map((outcome, index) => (
            <li
              key={`${index}-${outcome.fileName}`}
              className={outcome.ok ? "user-map-ok" : "user-map-error"}
            >
              {outcome.ok
                ? `${outcome.fileName} added${outcome.note ? ` — ${outcome.note}` : ""}`
                : `${outcome.fileName}: ${outcome.message}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement UserMapRows** — `web/src/userMaps/components/UserMapRows.tsx`:

```tsx
import type { UserMapsApi } from "../useUserMaps";
import { DEFAULT_OPACITY } from "../useUserMaps";
import { ImportDialog } from "./ImportDialog";

/** The one element App.tsx mounts in the layer list. */
export function UserMapRows({ api }: { api: UserMapsApi }) {
  return (
    <details className="resource-layer-group user-map-group" open>
      <summary>
        <span>Your maps</span>
        <small>
          {api.records.length === 0
            ? "Load your own GeoTIFF"
            : `${api.records.length} loaded`}
        </small>
      </summary>
      <div className="resource-layer-controls">
        <ImportDialog
          importing={api.importing}
          importingLabel={api.importingLabel}
          storageError={api.storageError}
          outcomes={api.outcomes}
          onImportFiles={(files) => void api.importFiles(files)}
        />
        {api.records.map((record) => {
          const ui = api.uiState[record.id] ?? {
            enabled: false,
            opacity: DEFAULT_OPACITY,
          };
          return (
            <div className="layer-control user-map-row" key={record.id}>
              <label className="layer-row">
                <input
                  type="checkbox"
                  aria-label={record.name}
                  checked={ui.enabled}
                  onChange={(event) =>
                    api.setEnabled(record.id, event.target.checked)
                  }
                />
                <span className="switch" aria-hidden="true" />
                <span>
                  <strong>{record.name}</strong>
                  <small>
                    Your file · {record.pixelSize.width.toLocaleString("en-CA")}
                    ×{record.pixelSize.height.toLocaleString("en-CA")} px
                  </small>
                </span>
              </label>
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
              <button
                type="button"
                className="user-map-remove"
                aria-label={`Remove ${record.name}`}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove "${record.name}" from this device? The original ` +
                        "file on your computer is not affected.",
                    )
                  ) {
                    void api.removeMap(record.id);
                  }
                }}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </details>
  );
}
```

- [ ] **Step 5: Append styles** to `web/src/styles.css` (end of file; match existing custom-property usage when executing):

```css
/* Your maps (user-loaded rasters) */
.user-map-import {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.4rem 0;
}
.user-map-privacy {
  opacity: 0.75;
}
.user-map-outcomes {
  margin: 0;
  padding-left: 1.1rem;
}
.user-map-error {
  color: #b3261e;
}
.user-map-opacity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 2.4rem;
}
.user-map-opacity input[type="range"] {
  flex: 1;
}
.user-map-remove {
  margin-left: 2.4rem;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/components/UserMapRows.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add web/src/userMaps/components/ImportDialog.tsx web/src/userMaps/components/UserMapRows.tsx web/src/userMaps/components/UserMapRows.test.tsx web/src/styles.css
git commit -m "feat(web): add Your maps layer-list section with import and opacity"
```

---

### Task 10: Mount in App + MapCanvas, test-harness updates, docs, verification, review gate, PR

**Files:**
- Modify: `web/src/test/setup.ts` (fake-indexeddb for App-level tests)
- Modify: `web/src/components/MapCanvas.test.tsx` (extend the react-leaflet mock)
- Modify: `web/src/App.tsx`, `web/src/components/MapCanvas.tsx` (mounting points)
- Modify: `README.md`, `ARCHITECTURE.md`, `plan.md`

- [ ] **Step 1: Test-harness prerequisites (do these BEFORE mounting, or the suite breaks).**

(a) `web/src/test/setup.ts` — add as the FIRST import, with the comment:

```ts
// App-level tests mount the real useUserMaps hook, which opens IndexedDB;
// jsdom has none, so the whole suite gets an in-memory implementation.
import "fake-indexeddb/auto";
```

(b) `web/src/components/MapCanvas.test.tsx` — the react-leaflet `vi.mock` factory's map stub (returned by its `useMap`) must also satisfy `UserMapLayers`. Locate the existing mock (top of file, around lines 15–140) and merge these members into the object its `useMap` returns (create `useMap` in the mock if absent), reusing one shared stub object:

```ts
getPane: (name: string) => paneElements.get(name),
createPane: (name: string) => {
  const el = document.createElement("div");
  paneElements.set(name, el);
  return el;
},
addLayer: () => {},
removeLayer: () => {},
```

with `const paneElements = vi.hoisted(() => new Map<string, HTMLElement>());` alongside the mock's other hoisted state. Follow the file's existing style for hoisted stubs.

- [ ] **Step 2: Mount in MapCanvas** — `web/src/components/MapCanvas.tsx`:

In `MapCanvasProps` (after `wellLogAccuracyFilter?: WellLogAccuracyFilter;`, ~line 120):

```ts
  userMaps?: VisibleUserMap[];
```

With the other imports:

```ts
import {
  UserMapLayers,
  type VisibleUserMap,
} from "../userMaps/components/UserMapLayers";
```

Module-level constant near the `HIDDEN_*` constants (stable reference — a fresh `[]` default would re-render the bridge every MapCanvas render):

```ts
const EMPTY_USER_MAPS: VisibleUserMap[] = [];
```

Destructured parameters (after `wellLogAccuracyFilter = "surveyed",`):

```ts
  userMaps = EMPTY_USER_MAPS,
```

Inside `<MapContainer>`, directly after `<MapSizeController />` (~line 1561):

```tsx
        <UserMapLayers maps={userMaps} />
```

- [ ] **Step 3: Mount in App** — `web/src/App.tsx`:

Imports:

```ts
import { useUserMaps } from "./userMaps/useUserMaps";
import { UserMapRows } from "./userMaps/components/UserMapRows";
```

In the App component body, alongside the other layer-state hooks (near `floodHazardLayers`, ~line 741):

```ts
  const userMapsApi = useUserMaps();
```

In the layer list, directly after the Modern map row's closing `</label>` (~line 2183):

```tsx
            <UserMapRows api={userMapsApi} />
```

On the `<MapCanvas` element (~line 2760):

```tsx
            userMaps={userMapsApi.visibleMaps}
```

- [ ] **Step 4: Run the full web suite**

Run: `cd web && npx vitest run`
Expected: PASS. Step 1 removed the two known breakages (IndexedDB, `useMap` pane methods). If `App.test.tsx` assertions count checkboxes or rows, update the counts for the new section — extend assertions, never weaken them.

- [ ] **Step 5: Lint and build**

Run: `cd web && npm run lint && npm run build`
Expected: both exit 0. The planned code avoids the two lint tripwires (`set-state-in-effect`, `no-unreachable`); anything else that surfaces, fix properly.

- [ ] **Step 6: Manual browser verification** (dev server + Browser pane): import `web/src/test/fixtures/utm20-8x6.tif` via "Your maps", confirm it renders as a small warped square near 45.1°N 63°W, the opacity slider live-updates, parcels/roads render **on top** of it (pane 160), drag-drop import works, and it survives a reload. On a throttled/large file, confirm the "Reading large map…" status appears and the page stays responsive (worker path). Screenshot for the PR.

- [ ] **Step 7: Update docs**

`README.md` — under `## Online companion`, add:

```markdown
- **Your maps** — load your own GeoTIFFs (georeferenced scans, orthophotos) and
  drape them over Nova Scotia with an opacity slider. Files never leave your
  device: parsing, warping, and storage are all in-browser.
```

`ARCHITECTURE.md` — under `## Online Web Companion`, append:

```markdown
### User-loaded maps (`web/src/userMaps/`)

A self-contained feature folder: `parsers/` (magic-byte sniffing; geotiff.js
2.1.3 — pinned, the 3.x read API differs — decoding in a web worker with
OffscreenCanvas and a main-thread fallback, overview-aware, capped at 4096 px),
`transform/` (proj4 registry for NS CRSs plus WKT-citation best-effort,
pixel→WGS84, mesh building), `render/` (`WarpedRasterLayer`: a
device-pixel-ratio-aware canvas layer drawing through a projected triangle
mesh in `user-maps-pane`, z-160 — above aerial imagery, below all data
overlays), `store/` (IndexedDB; metadata and blobs in separate object stores;
save failures degrade to session-only maps), and `components/` (layer-list
rows + react-leaflet bridge). `App.tsx`/`MapCanvas.tsx` hold mounting points
only. Everything is client-side; nothing is uploaded. The PR-2 georeferencer
builds on the same mesh renderer with GCP-derived (affine/TPS) meshes.
```

`plan.md` — under `## Online Companion`, add:

```markdown
- [x] "Your maps": user-loaded GeoTIFFs rendered client-side with opacity control (spec `docs/superpowers/specs/2026-07-24-web-user-maps-design.md`, PR 1 of 4)
- [ ] In-browser georeferencer for plain scans (PR 2)
- [ ] TPS warping + Allmaps annotation export (PR 3)
- [ ] GeoPDF import (PR 4)
- [ ] Evaluate geotiff.js 3.x migration (pinned to 2.1.3 in PR 1; read API changed)
```

- [ ] **Step 8: Commit**

```bash
git add web/src/test/setup.ts web/src/components/MapCanvas.test.tsx web/src/App.tsx web/src/components/MapCanvas.tsx README.md ARCHITECTURE.md plan.md
git commit -m "feat(web): mount Your maps in the layer list and map canvas"
```

- [ ] **Step 9: Adversarial review gate (maintainer requirement — do not skip)**

Run a full adversarial review of the implemented branch via the Codex plugin
(`/codex:rescue`, model `gpt-5.6-sol` per maintainer preference) covering the
whole `web/src/userMaps/` diff. Fix confirmed findings and re-run the suite.
Only proceed once the review reports no unresolved correctness findings.

- [ ] **Step 10: Push and open the PR against nightly**

```bash
git push -u origin claude/web-map-custom-uploads-cde085
gh pr create --base nightly --title "feat(web): user-loaded GeoTIFF layers (Your maps, PR 1 of 4)" --body "$(cat <<'EOF'
## Summary
- New `web/src/userMaps/` feature: open a GeoTIFF from your device, see it
  warped onto the map with an opacity slider, persisted in IndexedDB.
- Fully client-side (privacy + licensing posture: nothing is uploaded).
- Decode runs in a web worker (OffscreenCanvas) with main-thread fallback.
- geotiff pinned to 2.1.3 (3.x read-API rewrite tracked as a follow-up);
  proj4 (bundled types). Dev dep: fake-indexeddb.
- Spec: docs/superpowers/specs/2026-07-24-web-user-maps-design.md (PR 1 of 4).
- Plan revised after adversarial review (gpt-5.6-sol, 15 findings) before
  implementation; a second review gated this push.

## Test plan
- [ ] `cd web && npx vitest run` green (sniff, projection, parser incl.
      16-bit/PixelIsPoint/overviews, store, mesh, layer incl. DPR, bridge
      incl. opacity race + load failure, hook incl. quota degrade, rows)
- [ ] `npm run lint && npm run build` green
- [ ] Manual: fixture GeoTIFF imports (picker + drag-drop), renders warped
      near 45.1°N 63°W under parcels/roads, opacity live-updates, survives
      reload (screenshot attached)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed; `Build gate + tests` check runs. Watch it to green.

---

## Plan Self-Review (rev 2, completed at write time)

- **Adversarial findings coverage:** geotiff pinned (F1) ✔ T1/T3; worker decode + honest memory language (F2) ✔ T4; hook tests use injected parse, PDF sniff slice guarded, setup.ts gets fake-indexeddb, MapCanvas mock extended proactively (F3) ✔ T8/T10; `void error` gone, no `setState`-in-effect anywhere (F4) ✔ T5/T7; pane z-160 (F5) ✔ T6; quota keeps map in memory + storage/quota distinguished (F6) ✔ T5/T8; WKT-citation best-effort (F7) ✔ T2/T4; 16-bit scaling tested, alpha/nodata explicitly out of scope in the spec (F8) ✔ T4; bitmap close, URL revocation, load-failure catch, opacity race tested (F9) ✔ T7/T8; spec cadence language fixed + DPR rendering (F10) ✔ spec/T6; overview selection (F11) ✔ T4; PixelIsPoint, 16-double transformation validation, multi-tiepoint rejection (F12) ✔ T4; drag-drop, Opacity label, pre-parse size-aware status, indexed outcome keys (F13) ✔ T8/T9; store-open failure state, merge-by-id load, onversionchange/onblocked (F14) ✔ T5/T8; spec status/mesh/test-convention wording amended (F15) ✔ spec.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `VisibleUserMap` (T7) consumed in T8/T10; `UserMapsApi` (T8) consumed in T9/T10; `ParsedGeoTiff`/`MakePreview`/`chooseImageIndex`/`rgbToRgba` (T4) consumed in T4 worker + T8; geotransform stays GDAL-ordered everywhere; mesh row/col order mirrored between `buildLatLngMesh` (T2) and `buildSrcMesh` (T6) by tests.
- **Known accepted limits (documented in spec):** alpha/nodata ignored in PR 1; zoom-animation jump; decode peak memory inside the worker; overview fallback upscales nothing.
