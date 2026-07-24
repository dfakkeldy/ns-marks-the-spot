# Web "Your Maps" PR 1 — GeoTIFF End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user opens a GeoTIFF from their device and it renders warped onto the web map as a toggleable, opacity-adjustable "Your maps" layer that survives reloads — fully client-side.

**Architecture:** New self-contained `web/src/userMaps/` feature folder (parsers / transform / render / store / components). `App.tsx` and `MapCanvas.tsx` gain only mounting points. Rendering is a single custom canvas Leaflet layer (`WarpedRasterLayer`) that draws the decoded raster through a projected mesh; persistence is IndexedDB. Spec: `docs/superpowers/specs/2026-07-24-web-user-maps-design.md`.

**Tech Stack:** React 19, Leaflet 1.9 + react-leaflet 5, Vite 8, TypeScript 5.9, Vitest 4 (jsdom), geotiff.js, proj4.

## Global Constraints

- Runtime dependencies added in this PR: `geotiff`, `proj4` — **nothing else** (pdf.js is PR 4).
- Dev dependencies added: `@types/proj4`, `fake-indexeddb`. **`fake-indexeddb` was not in the approved dep list** (it is dev-only, for IndexedDB tests) — surface it to the maintainer at execution start before installing.
- `App.tsx` / `MapCanvas.tsx` receive mounting points only: one hook call + one JSX element in App; one prop + one JSX element in MapCanvas.
- Preview raster cap: `PREVIEW_MAX_DIMENSION = 4096` px (iOS Safari canvas safety).
- Pane: name `user-maps-pane`, z-index `260` (above waterfalls 250, below zoning 300).
- Privacy copy, verbatim: `Files stay on this device — nothing is uploaded.`
- Hard file-size refusal above 500 MB; files over 150 MB import with the note `Large file — displayed at reduced resolution.`
- PDF / PNG / JPEG are *recognized* by the sniffer but rejected in PR 1 with: `This file type arrives with the georeferencer in the next update. GeoTIFF works today.`
- GeoTIFFs without georeferencing metadata are rejected with: `No georeferencing found in this file. The georeferencer (next update) will handle plain scans.`
- Supported CRSs (locked in spec): EPSG 26920, 2961, 2962, 4617, 4326, 3857. Anything else: `Unsupported coordinate system (EPSG:XXXX). Reproject to UTM zone 20N (EPSG:26920) or WGS84 and re-import.`
- Conventional Commits (`feat(web):`, `test(web):`, `docs(web):`, `chore(web):`). Commit after every task.
- Work on the current branch `claude/web-map-custom-uploads-cde085` (already based on `origin/nightly`, spec committed). Final PR targets `nightly` — never `main`.
- All commands below run from the repo root. Tests: `cd web && npx vitest run <path>`.

---

### Task 1: Dependencies, feature-folder scaffold, file sniffing

**Files:**
- Modify: `web/package.json` (via npm install)
- Create: `web/src/userMaps/errors.ts`
- Create: `web/src/userMaps/parsers/sniff.ts`
- Test: `web/src/userMaps/parsers/sniff.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sniffFileType(bytes: Uint8Array): SniffedType` where `type SniffedType = "geotiff" | "pdf" | "png" | "jpeg" | "unknown"`; `class UserMapImportError extends Error { code: UserMapImportErrorCode; userMessage: string }` with `type UserMapImportErrorCode = "unsupported-type" | "corrupt-file" | "unsupported-crs" | "no-georeferencing" | "too-large" | "quota"`.

- [ ] **Step 1: Flag `fake-indexeddb` to the maintainer** (it is outside the approved dependency list; dev-only). If the human is unavailable, proceed — it never ships in the bundle — and note it in the PR description.

- [ ] **Step 2: Install dependencies**

```bash
cd web && npm install geotiff proj4 && npm install -D @types/proj4 fake-indexeddb
```

Expected: `package.json` gains the four entries; `npm install` exits 0.

- [ ] **Step 3: Write the error type** — `web/src/userMaps/errors.ts`:

```ts
export type UserMapImportErrorCode =
  | "unsupported-type"
  | "corrupt-file"
  | "unsupported-crs"
  | "no-georeferencing"
  | "too-large"
  | "quota";

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

### Task 2: Projection module (proj4 registry, pixel→LatLng, mesh builder)

**Files:**
- Create: `web/src/userMaps/transform/projection.ts`
- Test: `web/src/userMaps/transform/projection.test.ts`

**Interfaces:**
- Consumes: `UserMapImportError` from Task 1.
- Produces:
  - `type EmbeddedGeoref = { kind: "embedded"; crs: string; geotransform: [number, number, number, number, number, number] }` (GDAL order: originX, xRes, xRot, originY, yRot, yRes).
  - `type PixelSize = { width: number; height: number }`
  - `type LatLngPoint = { lat: number; lng: number }`
  - `pixelToLatLng(georef: EmbeddedGeoref, x: number, y: number): LatLngPoint` — throws `UserMapImportError("unsupported-crs", …)` for unknown CRS.
  - `buildLatLngMesh(georef: EmbeddedGeoref, pixelSize: PixelSize, gridSize?: number): LatLngPoint[][]` — `(gridSize+1)²` rows×cols, default `gridSize = 8`.
  - `SUPPORTED_EPSG_CODES: readonly number[]`

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/transform/projection.test.ts`:

```ts
import proj4 from "proj4";
import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../errors";
import {
  buildLatLngMesh,
  pixelToLatLng,
  type EmbeddedGeoref,
} from "./projection";

/** 10 m pixels, origin on the UTM 20N central meridian (easting 500 000). */
const UTM20_GEOREF: EmbeddedGeoref = {
  kind: "embedded",
  crs: "EPSG:26920",
  geotransform: [500000, 10, 0, 5000000, 0, -10],
};

describe("pixelToLatLng", () => {
  it("maps the origin pixel of a UTM 20N raster onto the central meridian", () => {
    const { lat, lng } = pixelToLatLng(UTM20_GEOREF, 0, 0);
    // Easting 500 000 is the central meridian of zone 20 by definition.
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
    const [expectedEasting, expectedNorthing] = [500000 + 45 * 10, 5000000 - 120 * 10];
    const { lat, lng } = pixelToLatLng(rotated, 120, 45);
    const [easting, northing] = proj4("EPSG:4326", "EPSG:26920", [lng, lat]);
    expect(easting).toBeCloseTo(expectedEasting, 3);
    expect(northing).toBeCloseTo(expectedNorthing, 3);
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

  it("rejects unknown CRSs with a user-facing message", () => {
    const bad: EmbeddedGeoref = { ...UTM20_GEOREF, crs: "EPSG:32633" };
    expect(() => pixelToLatLng(bad, 0, 0)).toThrowError(UserMapImportError);
    try {
      pixelToLatLng(bad, 0, 0);
    } catch (error) {
      expect((error as UserMapImportError).code).toBe("unsupported-crs");
      expect((error as UserMapImportError).userMessage).toContain("EPSG:32633");
    }
  });
});

describe("buildLatLngMesh", () => {
  it("returns a (grid+1) x (grid+1) lattice covering the full raster", () => {
    const mesh = buildLatLngMesh(
      UTM20_GEOREF,
      { width: 800, height: 400 },
      8,
    );
    expect(mesh).toHaveLength(9);
    expect(mesh[0]).toHaveLength(9);
    // Corner checks: mesh[row][col]; row 0 = pixel y 0, col 0 = pixel x 0.
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
Expected: PASS (6 tests).

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
- Consumes: nothing (standalone node script using the `geotiff` package).
- Produces: an 8×6 px RGB GeoTIFF, EPSG:26920, origin (500000, 5000000), 10 m pixels, red-to-blue gradient. Tests in Task 4 read it via `node:fs`.

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
Expected: `wrote …/web/src/test/fixtures/utm20-8x6.tif`; file is roughly 1 KB.

- [ ] **Step 3: Verify the fixture parses** (throwaway check, not committed as a test)

Run: `cd web && node -e "import('geotiff').then(async g => { const fs = await import('node:fs'); const b = fs.readFileSync('src/test/fixtures/utm20-8x6.tif'); const t = await g.fromArrayBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); const i = await t.getImage(); console.log(i.getWidth(), i.getHeight(), i.getGeoKeys().ProjectedCSTypeGeoKey); })"`
Expected output: `8 6 26920`. If `writeArrayBuffer` did not encode the geokeys (older geotiff versions), stop and report — do not hand-edit the binary.

- [ ] **Step 4: Commit**

```bash
git add web/scripts/generateGeoTiffFixture.mjs web/src/test/fixtures/utm20-8x6.tif
git commit -m "test(web): add deterministic GeoTIFF fixture and generator"
```

---

### Task 4: GeoTIFF parser

**Files:**
- Create: `web/src/userMaps/types.ts`
- Create: `web/src/userMaps/parsers/geoTiffSource.ts`
- Test: `web/src/userMaps/parsers/geoTiffSource.test.ts`

**Interfaces:**
- Consumes: `UserMapImportError` (Task 1); `EmbeddedGeoref`, `PixelSize`, `SUPPORTED_EPSG_CODES` (Task 2).
- Produces:
  - `web/src/userMaps/types.ts`:
    - `type Gcp = { id: string; pixel: { x: number; y: number }; map: { lat: number; lng: number } }`
    - `type GcpGeoref = { kind: "gcp"; gcps: Gcp[]; method: "affine" | "tps" }` (schema stability for PR 2+; nothing produces it in PR 1)
    - `type UserMapGeoref = EmbeddedGeoref | GcpGeoref`
    - `type UserMapSource = "geotiff" | "geopdf" | "image"`
    - `type UserMapRecord = { id: string; name: string; source: UserMapSource; createdAt: string; pixelSize: PixelSize; georef: UserMapGeoref }`
  - `parseGeoTiff(buffer: ArrayBuffer, options?: { makePreview?: MakePreview }): Promise<ParsedGeoTiff>` where `type ParsedGeoTiff = { pixelSize: PixelSize; georef: EmbeddedGeoref; preview: Blob; previewSize: PixelSize }` and `type MakePreview = (rgb: Uint8Array, width: number, height: number) => Promise<Blob>`.
  - `PREVIEW_MAX_DIMENSION = 4096`

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
import { parseGeoTiff } from "./geoTiffSource";

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

describe("parseGeoTiff", () => {
  it("extracts pixel size, CRS, and geotransform from the fixture", async () => {
    const makePreview = fakePreview();
    const parsed = await parseGeoTiff(fixtureBuffer(), { makePreview });
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
    // Fixture gradient: top-left pixel is pure black-red corner (r=0),
    // top-right has r=255, bottom-left has b=255.
    expect(rgb[0]).toBe(0);
    expect(rgb[(8 - 1) * 3]).toBe(255);
    expect(parsed.previewSize).toEqual({ width: 8, height: 6 });
    expect(parsed.preview.type).toBe("image/png");
  });

  it("rejects TIFFs without georeferencing as no-georeferencing", async () => {
    // A structurally valid single-pixel TIFF with no geo tags, generated in
    // memory via geotiff's writer.
    const { writeArrayBuffer } = await import("geotiff");
    const plain = writeArrayBuffer(new Uint8Array([1, 2, 3]), {
      width: 1,
      height: 1,
      SamplesPerPixel: 3,
      BitsPerSample: [8, 8, 8],
      PhotometricInterpretation: 2,
    }) as ArrayBuffer;
    await expect(
      parseGeoTiff(plain, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "no-georeferencing" });
  });

  it("rejects garbage bytes as corrupt-file", async () => {
    const garbage = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff, 0xff]).buffer;
    await expect(
      parseGeoTiff(garbage, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "corrupt-file" });
  });

  it("surfaces unsupported CRS with the EPSG code in the message", async () => {
    const { writeArrayBuffer } = await import("geotiff");
    const utm33 = writeArrayBuffer(new Uint8Array([1, 2, 3]), {
      width: 1,
      height: 1,
      SamplesPerPixel: 3,
      BitsPerSample: [8, 8, 8],
      PhotometricInterpretation: 2,
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
      ProjectedCSTypeGeoKey: 32633,
      GTModelTypeGeoKey: 1,
    }) as ArrayBuffer;
    try {
      await parseGeoTiff(utm33, { makePreview: fakePreview() });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UserMapImportError);
      expect((error as UserMapImportError).code).toBe("unsupported-crs");
      expect((error as UserMapImportError).userMessage).toContain("32633");
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/parsers/geoTiffSource.test.ts`
Expected: FAIL — cannot resolve `./geoTiffSource`.

- [ ] **Step 4: Implement** — `web/src/userMaps/parsers/geoTiffSource.ts`:

```ts
import { fromArrayBuffer } from "geotiff";
import { UserMapImportError } from "../errors";
import {
  SUPPORTED_EPSG_CODES,
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
 * Default preview maker: RGB → RGBA → canvas → PNG blob. Kept as a thin,
 * injectable seam because jsdom has no canvas; tests inject a fake, and the
 * browser uses this implementation.
 */
async function canvasPreview(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i];
    rgba[j + 1] = rgb[i + 1];
    rgba[j + 2] = rgb[i + 2];
    rgba[j + 3] = 255;
  }
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
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
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

type GeoTiffDirectory = {
  ModelPixelScale?: number[];
  ModelTiepoint?: number[];
  ModelTransformation?: number[];
};

function geotransformFrom(
  directory: GeoTiffDirectory,
): EmbeddedGeoref["geotransform"] | null {
  const { ModelPixelScale: scale, ModelTiepoint: tie, ModelTransformation: m } =
    directory;
  if (m && m.length >= 8) {
    // Row-major 4x4 affine: x' = m0·x + m1·y + m3; y' = m4·x + m5·y + m7.
    return [m[3], m[0], m[1], m[7], m[4], m[5]];
  }
  if (scale && scale.length >= 2 && tie && tie.length >= 6) {
    // Tiepoint maps raster (tie0, tie1) to model (tie3, tie4); the common
    // case ties raster origin (0,0). North-up: y resolution is negative.
    const originX = tie[3] - tie[0] * scale[0];
    const originY = tie[4] + tie[1] * scale[1];
    return [originX, scale[0], 0, originY, 0, -scale[1]];
  }
  return null;
}

export async function parseGeoTiff(
  buffer: ArrayBuffer,
  options: { makePreview?: MakePreview } = {},
): Promise<ParsedGeoTiff> {
  const makePreview = options.makePreview ?? canvasPreview;

  let width: number;
  let height: number;
  let geoKeys: { ProjectedCSTypeGeoKey?: number; GeographicTypeGeoKey?: number };
  let directory: GeoTiffDirectory;
  let readRGB: (opts: {
    interleave: true;
    width: number;
    height: number;
  }) => Promise<ArrayLike<number>>;
  try {
    const tiff = await fromArrayBuffer(buffer);
    const image = await tiff.getImage();
    width = image.getWidth();
    height = image.getHeight();
    geoKeys = image.getGeoKeys() ?? {};
    directory = image.getFileDirectory() as GeoTiffDirectory;
    readRGB = image.readRGB.bind(image);
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    throw new UserMapImportError(
      "corrupt-file",
      "This file could not be read as a GeoTIFF. It may be truncated or corrupt.",
    );
  }

  const geotransform = geotransformFrom(directory);
  const epsg = geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey;
  if (!geotransform || !epsg) {
    throw new UserMapImportError(
      "no-georeferencing",
      "No georeferencing found in this file. The georeferencer (next update) " +
        "will handle plain scans.",
    );
  }
  if (!SUPPORTED_EPSG_CODES.includes(epsg as never)) {
    throw new UserMapImportError(
      "unsupported-crs",
      `Unsupported coordinate system (EPSG:${epsg}). Reproject to UTM zone ` +
        "20N (EPSG:26920) or WGS84 and re-import.",
    );
  }

  // Decode at capped resolution: geotiff resamples during the read, so a
  // huge raster never materializes at full size in memory.
  const downScale = Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(width, height));
  const previewSize: PixelSize = {
    width: Math.max(1, Math.round(width * downScale)),
    height: Math.max(1, Math.round(height * downScale)),
  };

  let rgb: Uint8Array;
  try {
    const raw = await readRGB({
      interleave: true,
      width: previewSize.width,
      height: previewSize.height,
    });
    rgb = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
  } catch {
    throw new UserMapImportError(
      "corrupt-file",
      "The image data in this GeoTIFF could not be decoded.",
    );
  }

  const preview = await makePreview(rgb, previewSize.width, previewSize.height);

  return {
    pixelSize: { width, height },
    georef: { kind: "embedded", crs: `EPSG:${epsg}`, geotransform },
    preview,
    previewSize,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/userMaps/parsers/geoTiffSource.test.ts`
Expected: PASS (5 tests). If `readRGB` rejects the `width`/`height` resample options in the installed geotiff version, replace that call with `image.readRasters({ interleave: true, width, height })` and re-run — the fixture is plain RGB, so the two are equivalent for it.

- [ ] **Step 6: Commit**

```bash
git add web/src/userMaps/types.ts web/src/userMaps/parsers/geoTiffSource.ts web/src/userMaps/parsers/geoTiffSource.test.ts
git commit -m "feat(web): parse user GeoTIFFs with capped-resolution previews"
```

---

### Task 5: IndexedDB store

**Files:**
- Create: `web/src/userMaps/store/userMapStore.ts`
- Test: `web/src/userMaps/store/userMapStore.test.ts`

**Interfaces:**
- Consumes: `UserMapRecord` (Task 4), `UserMapImportError` (Task 1).
- Produces: `class UserMapStore` with `static open(factory?: IDBFactory): Promise<UserMapStore>`, `saveUserMap(record: UserMapRecord, raster: Blob, preview: Blob): Promise<void>`, `listUserMaps(): Promise<UserMapRecord[]>` (sorted by `createdAt` ascending), `getPreviewBlob(id: string): Promise<Blob | null>`, `getRasterBlob(id: string): Promise<Blob | null>`, `renameUserMap(id: string, name: string): Promise<void>`, `deleteUserMap(id: string): Promise<void>`, `close(): void`.

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

    const previewBack = await store.getPreviewBlob("a");
    expect(await previewBack?.text()).toBe("preview-bytes");
    const rasterBack = await store.getRasterBlob("a");
    expect(await rasterBack?.text()).toBe("raster-bytes");
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
    const listed = await store.listUserMaps();
    expect(listed[0].name).toBe("Church survey 1888");
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
      openRequest.onsuccess = () => resolve(new UserMapStore(openRequest.result));
      openRequest.onerror = () => reject(openRequest.error);
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
      throw new UserMapImportError(
        "quota",
        "Couldn't save this map — it will stay available until you close the tab.",
      );
      void error;
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
  - `mesh.ts`: `type XY = { x: number; y: number }`; `affineFromTriangles(s0: XY, s1: XY, s2: XY, d0: XY, d1: XY, d2: XY): [number, number, number, number, number, number]` (canvas `setTransform(a, b, c, d, e, f)` order); `buildSrcMesh(width: number, height: number, gridSize?: number): XY[][]`; `drawWarpedImage(ctx: CanvasRenderingContext2D, image: CanvasImageSource, srcMesh: XY[][], dstMesh: XY[][]): void`.
  - `WarpedRasterLayer.ts`: `class WarpedRasterLayer extends L.Layer` with `constructor(options: WarpedRasterLayerOptions)` where `type WarpedRasterLayerOptions = { paneName: string; opacity: number; image: CanvasImageSource; imageSize: { width: number; height: number }; latLngMesh: LatLngPoint[][] }`; methods `setOpacity(opacity: number): void`, plus Leaflet's `onAdd`/`onRemove`.
  - `mapPanes.ts`: `USER_MAPS_PANE = "user-maps-pane"`, `USER_MAPS_PANE_Z_INDEX = 260`.

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
    const dst = buildSrcMesh(100, 100, 2); // identity-shaped destination
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

- [ ] **Step 5: Append pane constants** to `web/src/components/mapPanes.ts` (after the `MEASURE_PANE` block at the end of the file):

```ts
/**
 * User-loaded rasters sit above every Province raster (waterfalls, 250) so a
 * draped historical scan is what the user sees, and below zoning (300) and
 * all vector overlays so parcels and inspection tools stay interactive on top.
 */
export const USER_MAPS_PANE = "user-maps-pane";
export const USER_MAPS_PANE_Z_INDEX = 260;
```

Add to `web/src/components/mapPanes.test.ts` (new test appended inside the existing describe block, or a new describe if the file is organized per-constant):

```ts
it("stacks user maps above Province rasters and below zoning", () => {
  expect(USER_MAPS_PANE_Z_INDEX).toBeGreaterThan(
    PROVINCE_LAYER_Z_INDEXES.waterfalls,
  );
  expect(USER_MAPS_PANE_Z_INDEX).toBeLessThan(ZONING_PANE_Z_INDEX);
});
```

(Import `USER_MAPS_PANE_Z_INDEX` alongside the file's existing imports; check the file's current import list and match its style.)

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
    const map = stubMap(pane);
    makeLayer().onAdd(map);
    const canvas = pane.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.style.opacity).toBe("0.7");
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
    const map = stubMap(pane);
    const layer = makeLayer();
    layer.onAdd(map);
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
 * viewport-sized and repositioned after each view change (the Leaflet.heat
 * pattern): during a drag the pane carries the canvas, and on moveend we snap
 * it back to the viewport and redraw. Zoom animations therefore jump rather
 * than scale — an accepted v1 trade-off, noted in the spec.
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
    canvas.width = size.x;
    canvas.height = size.y;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint(new L.Point(0, 0)));
    // jsdom (tests) has no 2D context; drawing is a no-op there by design.
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dstMesh = this.rasterOptions.latLngMesh.map((row) =>
      row.map((ll) => {
        const p = map.latLngToContainerPoint(new L.LatLng(ll.lat, ll.lng));
        return { x: p.x, y: p.y };
      }),
    );
    drawWarpedImage(ctx, this.rasterOptions.image, this.srcMesh, dstMesh);
  }
}
```

- [ ] **Step 9: Run all new tests plus mapPanes**

Run: `cd web && npx vitest run src/userMaps/render src/components/mapPanes.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/src/userMaps/render web/src/components/mapPanes.ts web/src/components/mapPanes.test.ts
git commit -m "feat(web): render user rasters through a warped canvas mesh layer"
```

---

### Task 7: React bridge — UserMapLayers + WarpedRasterOverlay

**Files:**
- Create: `web/src/userMaps/components/UserMapLayers.tsx`
- Test: `web/src/userMaps/components/UserMapLayers.test.tsx`

**Interfaces:**
- Consumes: `WarpedRasterLayer` (Task 6), `buildLatLngMesh` + `EmbeddedGeoref` (Task 2), `UserMapRecord` (Task 4), `USER_MAPS_PANE` constants (Task 6), react-leaflet's `useMap`.
- Produces: `type VisibleUserMap = { record: UserMapRecord; previewUrl: string; opacity: number }`; `function UserMapLayers({ maps }: { maps: VisibleUserMap[] }): ReactNode`. **PR-1 constraint honored here:** only `kind: "embedded"` georefs render; `kind: "gcp"` records are skipped (none can exist yet).

- [ ] **Step 1: Write the failing test** — `web/src/userMaps/components/UserMapLayers.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserMapRecord } from "../types";

const stubMapApi = vi.hoisted(() => ({
  createPane: vi.fn(() => document.createElement("div")),
  getPane: vi.fn(() => undefined as HTMLElement | undefined),
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
  vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 8, height: 6 })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  layerInstances.length = 0;
  stubMapApi.createPane.mockClear();
  stubMapApi.addLayer.mockClear();
  stubMapApi.removeLayer.mockClear();
});

describe("UserMapLayers", () => {
  it("creates the user-maps pane once", () => {
    stubBitmapLoading();
    render(<UserMapLayers maps={[]} />);
    expect(stubMapApi.createPane).toHaveBeenCalledWith("user-maps-pane");
  });

  it("adds a warped layer per visible map and removes it on unmount", async () => {
    stubBitmapLoading();
    const { unmount } = render(
      <UserMapLayers
        maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]}
      />,
    );
    await waitFor(() => expect(stubMapApi.addLayer).toHaveBeenCalledTimes(1));
    unmount();
    expect(stubMapApi.removeLayer).toHaveBeenCalledTimes(1);
  });

  it("updates opacity without rebuilding the layer", async () => {
    stubBitmapLoading();
    const { rerender } = render(
      <UserMapLayers
        maps={[{ record, previewUrl: "blob:fake", opacity: 0.7 }]}
      />,
    );
    await waitFor(() => expect(layerInstances).toHaveLength(1));
    rerender(
      <UserMapLayers
        maps={[{ record, previewUrl: "blob:fake", opacity: 0.3 }]}
      />,
    );
    await waitFor(() =>
      expect(layerInstances[0].setOpacity).toHaveBeenCalledWith(0.3),
    );
    expect(layerInstances).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/userMaps/components/UserMapLayers.test.tsx`
Expected: FAIL — cannot resolve `./UserMapLayers`.

- [ ] **Step 3: Implement** — `web/src/userMaps/components/UserMapLayers.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
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

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  return createImageBitmap(await response.blob());
}

function WarpedRasterOverlay({ map }: { map: VisibleUserMap }) {
  const leafletMap = useMap();
  const layerRef = useRef<WarpedRasterLayer | null>(null);
  const { record, previewUrl, opacity } = map;

  useEffect(() => {
    if (!leafletMap || record.georef.kind !== "embedded") {
      return;
    }
    const georef = record.georef;
    let cancelled = false;
    void (async () => {
      const bitmap = await loadBitmap(previewUrl);
      if (cancelled) {
        return;
      }
      const layer = new WarpedRasterLayer({
        paneName: USER_MAPS_PANE,
        opacity,
        image: bitmap,
        imageSize: { width: bitmap.width, height: bitmap.height },
        latLngMesh: buildLatLngMesh(georef, record.pixelSize),
      });
      layer.addTo(leafletMap);
      layerRef.current = layer;
    })();
    return () => {
      cancelled = true;
      layerRef.current?.remove();
      layerRef.current = null;
    };
    // opacity is intentionally absent: it updates in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletMap, record, previewUrl]);

  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  return null;
}

/** Sole mount point MapCanvas needs: creates the pane, renders the overlays. */
export function UserMapLayers({ maps }: { maps: VisibleUserMap[] }) {
  const leafletMap = useMap();
  const [paneReady, setPaneReady] = useState(false);

  useEffect(() => {
    if (!leafletMap) {
      return;
    }
    if (!leafletMap.getPane(USER_MAPS_PANE)) {
      const pane = leafletMap.createPane(USER_MAPS_PANE);
      pane.style.zIndex = String(USER_MAPS_PANE_Z_INDEX);
    }
    setPaneReady(true);
  }, [leafletMap]);

  if (!paneReady) {
    return null;
  }
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
Expected: PASS (3 tests). Note the test's stub map has `getPane` returning `undefined`, so `createPane` is exercised; the real map takes the same path on first mount.

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
- Consumes: `UserMapStore` (Task 5), `sniffFileType` (Task 1), `parseGeoTiff` (Task 4), `UserMapImportError` (Task 1), `VisibleUserMap` (Task 7).
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
  outcomes: ImportOutcome[];          // most recent import batch, newest first
  importFiles: (files: ArrayLike<File>) => Promise<void>;
  removeMap: (id: string) => Promise<void>;
  renameMap: (id: string, name: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => void;
  setOpacity: (id: string, opacity: number) => void;
};

function useUserMaps(options?: { openStore?: () => Promise<UserMapStore> }): UserMapsApi;
```

Constants: `DEFAULT_OPACITY = 0.7`, `HARD_LIMIT_BYTES = 500 * 1024 * 1024`, `LARGE_FILE_BYTES = 150 * 1024 * 1024`, localStorage key `user-map-ui-state-v1`.

- [ ] **Step 1: Write the failing hook test** — `web/src/userMaps/useUserMaps.ts` is exercised through `renderHook`. Create `web/src/userMaps/useUserMaps.test.ts`:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserMapStore } from "./store/userMapStore";
import { useUserMaps } from "./useUserMaps";

// Tiny real GeoTIFF fixture keeps the hook test end-to-end through the parser.
import { readFileSync } from "node:fs";
import { join } from "node:path";

function fixtureFile(name = "survey.tif"): File {
  const raw = readFileSync(
    join(__dirname, "..", "test", "fixtures", "utm20-8x6.tif"),
  );
  return new File([raw], name);
}

let factory: IDBFactory;

function options() {
  return { openStore: () => UserMapStore.open(factory) };
}

beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:fake"),
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

  it("reports a friendly outcome for unsupported types", async () => {
    const { result } = renderHook(() => useUserMaps(options()));
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

  it("removes a map everywhere", async () => {
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
    expect(result.current.visibleMaps).toHaveLength(0);
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
import { parseGeoTiff } from "./parsers/geoTiffSource";
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
 * lazily on first use; openStore is injectable for tests (per the project's
 * closure-injection convention — no protocols until a second impl exists).
 */
export function useUserMaps(
  options: { openStore?: () => Promise<UserMapStore> } = {},
): UserMapsApi {
  const openStore = options.openStore ?? (() => UserMapStore.open());
  const storeRef = useRef<Promise<UserMapStore> | null>(null);
  const [records, setRecords] = useState<UserMapRecord[]>([]);
  const [uiState, setUiState] = useState<UserMapUiState>(loadUiState);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);

  const store = useCallback(() => {
    storeRef.current ??= openStore();
    return storeRef.current;
    // openStore is stable per mount in practice (App passes nothing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistUiState = useCallback((next: UserMapUiState) => {
    setUiState(next);
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
  }, []);

  const refreshPreviewUrl = useCallback(
    async (id: string) => {
      const blob = await (await store()).getPreviewBlob(id);
      if (blob) {
        setPreviewUrls((prev) => ({ ...prev, [id]: URL.createObjectURL(blob) }));
      }
    },
    [store],
  );

  // Initial load of persisted maps.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await (await store()).listUserMaps();
      if (cancelled) {
        return;
      }
      setRecords(loaded);
      await Promise.all(loaded.map((r) => refreshPreviewUrl(r.id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [store, refreshPreviewUrl]);

  const importFiles = useCallback(
    async (files: ArrayLike<File>) => {
      setImporting(true);
      const batch: ImportOutcome[] = [];
      try {
        for (const file of Array.from(files)) {
          try {
            if (file.size > HARD_LIMIT_BYTES) {
              throw new UserMapImportError(
                "too-large",
                "This file is over 500 MB. Export a smaller area or lower " +
                  "resolution and re-import.",
              );
            }
            const buffer = await file.arrayBuffer();
            const type = sniffFileType(new Uint8Array(buffer, 0, 16));
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
            const parsed = await parseGeoTiff(buffer);
            const record: UserMapRecord = {
              id: crypto.randomUUID(),
              name: stripExtension(file.name),
              source: "geotiff",
              createdAt: new Date().toISOString(),
              pixelSize: parsed.pixelSize,
              georef: parsed.georef,
            };
            await (await store()).saveUserMap(record, file, parsed.preview);
            setRecords((prev) => [...prev, record]);
            persistUiState({
              ...loadUiState(),
              [record.id]: { enabled: true, opacity: DEFAULT_OPACITY },
            });
            await refreshPreviewUrl(record.id);
            batch.unshift({
              fileName: file.name,
              ok: true,
              id: record.id,
              note:
                file.size > LARGE_FILE_BYTES
                  ? "Large file — displayed at reduced resolution."
                  : undefined,
            });
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
      }
    },
    [persistUiState, refreshPreviewUrl, store],
  );

  const removeMap = useCallback(
    async (id: string) => {
      await (await store()).deleteUserMap(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setPreviewUrls((prev) => {
        const { [id]: removed, ...rest } = prev;
        if (removed) {
          URL.revokeObjectURL(removed);
        }
        return rest;
      });
      const next = { ...loadUiState() };
      delete next[id];
      persistUiState(next);
    },
    [persistUiState, store],
  );

  const renameMap = useCallback(
    async (id: string, name: string) => {
      await (await store()).renameUserMap(id, name);
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
Expected: PASS (6 tests).

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
- Produces: `function UserMapRows({ api }: { api: UserMapsApi }): ReactNode` — the single element App mounts. `ImportDialog` (an inline import area — named per spec; PR 2 evolves it into the georeferencer entry point) renders the file input, drop handling, progress, outcome list, and the privacy line.

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
    const file = new File(["x"], "survey.tif");
    await userEvent.upload(input, file);
    expect(testApi.importFiles).toHaveBeenCalledTimes(1);
  });

  it("renders a toggle and opacity slider per map", () => {
    const testApi = api({
      records: [record],
      uiState: { a: { enabled: true, opacity: 0.7 } },
    });
    render(<UserMapRows api={testApi} />);

    const toggle = screen.getByRole("checkbox", { name: "Church survey" });
    fireEvent.click(toggle);
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
    const testApi = api({
      outcomes: [
        { fileName: "plan.pdf", ok: false, message: "Coming with the georeferencer." },
      ],
    });
    render(<UserMapRows api={testApi} />);
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
import { useRef } from "react";
import type { ImportOutcome } from "../useUserMaps";

/**
 * Inline import area (named per spec; the PR-2 georeferencer flow grows out
 * of it). Chose an inline section over a modal so the layer list stays the
 * single place a user manages layers.
 */
export function ImportDialog({
  importing,
  outcomes,
  onImportFiles,
}: {
  importing: boolean;
  outcomes: ImportOutcome[];
  onImportFiles: (files: ArrayLike<File>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="user-map-import">
      <input
        ref={inputRef}
        type="file"
        accept=".tif,.tiff,.pdf,.png,.jpg,.jpeg"
        multiple
        aria-label="Add a map file"
        onChange={(event) => {
          if (event.target.files?.length) {
            onImportFiles(event.target.files);
            event.target.value = "";
          }
        }}
      />
      <small className="user-map-privacy">
        Files stay on this device — nothing is uploaded.
      </small>
      {importing ? <small role="status">Reading map…</small> : null}
      {outcomes.length > 0 ? (
        <ul className="user-map-outcomes">
          {outcomes.map((outcome) => (
            <li
              key={outcome.fileName}
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
                <small>Transparency</small>
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

- [ ] **Step 5: Append styles** to `web/src/styles.css` (end of file; match the file's existing custom-property usage when executing — these class names are referenced above):

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
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add web/src/userMaps/components/ImportDialog.tsx web/src/userMaps/components/UserMapRows.tsx web/src/userMaps/components/UserMapRows.test.tsx web/src/styles.css
git commit -m "feat(web): add Your maps layer-list section with import and opacity"
```

---

### Task 10: Mount in App + MapCanvas, docs, full verification, PR

**Files:**
- Modify: `web/src/App.tsx` (two lines: hook call + `<UserMapRows>`; one prop on `<MapCanvas>`)
- Modify: `web/src/components/MapCanvas.tsx` (one prop + one child)
- Modify: `README.md`, `ARCHITECTURE.md`, `plan.md`
- Test: existing suites must stay green; manual browser verification.

**Interfaces:**
- Consumes: `useUserMaps` (Task 8), `UserMapRows` (Task 9), `UserMapLayers` + `VisibleUserMap` (Task 7).
- Produces: the shipped feature.

- [ ] **Step 1: Mount in MapCanvas** — three edits to `web/src/components/MapCanvas.tsx`:

In `MapCanvasProps` (after `wellLogAccuracyFilter?: WellLogAccuracyFilter;` around line 120):

```ts
  userMaps?: VisibleUserMap[];
```

With the other type imports near the top:

```ts
import {
  UserMapLayers,
  type VisibleUserMap,
} from "../userMaps/components/UserMapLayers";
```

In the destructured parameters (after `wellLogAccuracyFilter = "surveyed",`):

```ts
  userMaps = EMPTY_USER_MAPS,
```

with this module-level constant near the other `HIDDEN_*` constants (a stable reference so a missing prop never re-renders the layer bridge):

```ts
const EMPTY_USER_MAPS: VisibleUserMap[] = [];
```

Inside `<MapContainer>`, directly after `<MapSizeController />` (line ~1561):

```tsx
        <UserMapLayers maps={userMaps} />
```

- [ ] **Step 2: Mount in App** — three edits to `web/src/App.tsx`:

Imports:

```ts
import { useUserMaps } from "./userMaps/useUserMaps";
import { UserMapRows } from "./userMaps/components/UserMapRows";
```

In the App component body, alongside the other layer-state hooks (near the `floodHazardLayers` state around line 741):

```ts
  const userMapsApi = useUserMaps();
```

In the layer list, directly after the Modern map row's closing `</label>` (line ~2183):

```tsx
            <UserMapRows api={userMapsApi} />
```

And on the `<MapCanvas` element (line ~2760), with the other layer props:

```tsx
            userMaps={userMapsApi.visibleMaps}
```

- [ ] **Step 3: Run the full web suite**

Run: `cd web && npx vitest run`
Expected: PASS. If `MapCanvas.test.tsx` or `App.test.tsx` fail on the new elements, the likely causes are: (a) the react-leaflet mock's `useMap` returning something without `getPane`/`createPane` — extend that mock with `getPane: () => undefined, createPane: () => document.createElement("div"), addLayer: () => {}, removeLayer: () => {}`; (b) App tests using `getAllByRole("checkbox")` counts — update counts for the new section. Do not weaken assertions; extend them to cover the new UI.

- [ ] **Step 4: Lint and build**

Run: `cd web && npm run lint && npm run build`
Expected: both exit 0. Fix any errors (typical: unused imports, exhaustive-deps on the two intentionally-suppressed effects — the suppressions carry comments already).

- [ ] **Step 5: Manual browser verification** (dev server + Browser pane, per repo verification norms): start the web dev server, generate a throwaway GeoTIFF (`cd web && node scripts/generateGeoTiffFixture.mjs` output works), import it via the "Your maps" section, and confirm: it renders as a small warped square near 45.1°N 63°W (zoom there via search or double-click), the opacity slider changes it live, the toggle hides it, and it survives a reload. Screenshot for the PR.

- [ ] **Step 6: Update docs**

`README.md` — under `## Online companion`, add to the feature list:

```markdown
- **Your maps** — load your own GeoTIFFs (georeferenced scans, orthophotos) and
  drape them over Nova Scotia with a transparency slider. Files never leave
  your device: parsing, warping, and storage are all in-browser.
```

`ARCHITECTURE.md` — under `## Online Web Companion` (line ~87), append:

```markdown
### User-loaded maps (`web/src/userMaps/`)

A self-contained feature folder: `parsers/` (magic-byte sniffing + geotiff.js
decode at capped resolution), `transform/` (proj4 registry for NS CRSs,
pixel→WGS84, mesh building), `render/` (`WarpedRasterLayer`, a canvas layer
drawing rasters through a projected triangle mesh in the `user-maps-pane` at
z-index 260), `store/` (IndexedDB: metadata and blobs in separate object
stores), and `components/` (layer-list rows + react-leaflet bridge).
`App.tsx`/`MapCanvas.tsx` hold mounting points only. Everything is
client-side; nothing is uploaded. The PR-2 georeferencer builds on the same
mesh renderer with GCP-derived (affine/TPS) meshes instead of embedded
geotransforms.
```

`plan.md` — under `## Online Companion` (line ~42), add:

```markdown
- [x] "Your maps": user-loaded GeoTIFFs rendered client-side with opacity control (spec `docs/superpowers/specs/2026-07-24-web-user-maps-design.md`, PR 1 of 4)
- [ ] In-browser georeferencer for plain scans (PR 2)
- [ ] TPS warping + Allmaps annotation export (PR 3)
- [ ] GeoPDF import (PR 4)
```

- [ ] **Step 7: Commit**

```bash
git add web/src/App.tsx web/src/components/MapCanvas.tsx README.md ARCHITECTURE.md plan.md
git commit -m "feat(web): mount Your maps in the layer list and map canvas"
```

(Include any test-mock extensions from Step 3 in this commit.)

- [ ] **Step 8: Adversarial review gate (maintainer requirement — do not skip)**

Before pushing, run a full adversarial review of the implemented branch via the
Codex plugin (`/codex:rescue`, model `gpt-5.6-sol` per maintainer preference)
covering the whole `web/src/userMaps/` diff. Fix confirmed findings and re-run
the suite. Only proceed to Step 9 once the review reports no unresolved
correctness findings.

- [ ] **Step 9: Push and open the PR against nightly**

```bash
git push -u origin claude/web-map-custom-uploads-cde085
gh pr create --base nightly --title "feat(web): user-loaded GeoTIFF layers (Your maps, PR 1 of 4)" --body "$(cat <<'EOF'
## Summary
- New `web/src/userMaps/` feature: open a GeoTIFF from your device, see it
  warped onto the map with a transparency slider, persisted in IndexedDB.
- Fully client-side (privacy + licensing posture: nothing is uploaded).
- Spec: docs/superpowers/specs/2026-07-24-web-user-maps-design.md (PR 1 of 4;
  georeferencer, TPS/Allmaps, and GeoPDF follow).
- New runtime deps: geotiff, proj4 (approved). Dev deps: @types/proj4,
  fake-indexeddb (flagged in-plan).

## Test plan
- [ ] `cd web && npx vitest run` green (new: sniff, projection, parser, store,
      mesh, layer, bridge, hook, rows)
- [ ] `npm run lint && npm run build` green
- [ ] Manual: fixture GeoTIFF imports, renders warped near 45.1°N 63°W,
      opacity live-updates, survives reload (screenshot attached)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed; `Build gate + tests` check runs. Watch it to green.

---

## Plan Self-Review (completed at write time)

- **Spec coverage (PR-1 slice):** sniffing ✔ (T1), CRS registry + reprojection ✔ (T2), capped-resolution decode ✔ (T4), IndexedDB persistence ✔ (T5), mesh warp render in pane 260 ✔ (T6–T7), import UX + privacy copy + outcomes + size caps ✔ (T8–T9), mounting-points-only integration ✔ (T10), docs ✔ (T10). Deferred per spec: workers for decode (geotiff resampled-read keeps memory bounded; a dedicated worker moves to PR 2 polish if import stutters on large files — noted deviation), soft-warn copy shown as an outcome note rather than a pre-parse warning.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `VisibleUserMap` defined in T7, consumed in T8/T10; `UserMapsApi` defined in T8, consumed in T9/T10; `EmbeddedGeoref` geotransform order is GDAL-style everywhere (T2 test asserts it); mesh row/col order matched between `buildLatLngMesh` (T2) and `buildSrcMesh` (T6) by mirrored tests.
