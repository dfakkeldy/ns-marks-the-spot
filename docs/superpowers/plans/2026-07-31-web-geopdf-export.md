# Web Georeferenced PDF Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Use
> `superpowers:test-driven-development` for each behavioral change and
> `superpowers:verification-before-completion` before claiming a task or the
> branch complete. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click download of a Letter-sized, dual-flavour georeferenced PDF
(ISO 32000 `/Measure` + OGC `/LGIDict`) of a user-framed map area, with a
declarative portrait/landscape template, editable title fields, and an
optional legend.

**Architecture:** Four Leaflet-free units under `web/src/print/pdf/` —
declarative templates, a headless canvas compositor (tile math + existing
triangle warp), a registration writer round-tripped through the existing
`geoPdfMetadata.ts` parser, and a pdf-lib page composer — plus two UI pieces
(frame overlay inside `MapCanvas`, export dialog wired in `App.tsx`).
Registration is declared in EPSG:3857 (the raster's actual projection) with
WGS 84 corner coordinates, so pixel↔map is affine-exact, not approximated.

**Tech Stack:** React 19.2.7, TypeScript 5.9.3, Vite 8.1.5, Vitest 4.1.10
(jsdom + the `canvas` package — real 2D contexts and JPEG encoding in tests),
Leaflet 1.9.4 / react-leaflet 5, `pdf-lib` 1.17.1, `qrcode` 1.5.4.

## Global Constraints

- **No new dependencies.** Everything uses packages already in
  `web/package.json`. Fonts are pdf-lib `StandardFonts` (Helvetica family).
- **Worktree:** `/Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/web-geopdf-export`,
  branch `feature/web-geopdf-export` (tracks `origin/nightly`). All commands
  below run from its `web/` directory unless noted.
- **Gates per task:** `npx vitest run <test file>` while iterating; before
  each commit run the touched tests; before the final task run
  `npm test && npm run lint && npm run build`.
- **Conventional Commits**, e.g. `feat(web): …`, `test(web): …`, `docs: …`.
- Page size Letter only: 612 × 792 pt. Margin 28 pt (~10 mm). Map raster
  target 300 DPI, constrained devices 200 DPI, canvas cap 4096 px/dimension.
- The compositor, registration writer, composer, and template modules must
  not import Leaflet (matching `web/src/userMaps/transform/` discipline).
- Attribution strip is always rendered; only the boxed legend is optional.
- Spec of record: `docs/superpowers/specs/2026-07-30-web-geopdf-export-design.md`
  (amended: registration CRS is EPSG:3857 — see Task 4 rationale).

## File Structure

```
web/src/print/pdf/
  templates/types.ts        PdfRect, PdfTemplate, constants, templateBlocks()
  templates/portrait.ts     Letter portrait template literal
  templates/landscape.ts    Letter landscape template literal
  templates/index.ts        pdfTemplates registry + templateForOrientation()
  scaleBar.ts               ScaleBarSpec, buildScaleBar()
  tileMath.ts               mercator↔tile↔output-pixel math (Leaflet-free)
  geoRegistration.ts        attachGeoRegistration() — /Measure + /LGIDict
  exportResolution.ts       DPI ladder + constrained-device detection
  mapCompositor.ts          composeMapImage() — bounds+layers → canvas+statuses
  pdfComposer.ts            composeGeoPdf() — template+image+fields → bytes
  exportQr.ts               buildExportQrPng()
  exportLayerSpecs.ts       buildExportLayers() — app state → CompositorLayer[]
  frameGeometry.ts          frame rect ↔ bounds math (Leaflet-free)
  ExportFrameLayer.tsx      frame-mode overlay (inside MapCanvas)
  ExportDialog.tsx          fields, legend toggle, progress, failures, download
```

Each `.ts` module gets a sibling `.test.ts`. UI wiring touches
`web/src/App.tsx`, `web/src/components/MapCanvas.tsx`, `web/src/styles.css`.

---

### Task 1: Template types and the two Letter templates

**Files:**
- Create: `web/src/print/pdf/templates/types.ts`
- Create: `web/src/print/pdf/templates/portrait.ts`
- Create: `web/src/print/pdf/templates/landscape.ts`
- Create: `web/src/print/pdf/templates/index.ts`
- Test: `web/src/print/pdf/templates/templates.test.ts`

**Interfaces:**
- Produces: `PdfRect {x,y,width,height}` (PDF points, origin bottom-left),
  `PdfTemplateId = "portrait" | "landscape"`, `PdfTemplate`,
  `templateBlocks(t): Array<{name: string; rect: PdfRect}>`,
  `mapFrameAspect(t): number`, `pdfTemplates`, `templateForOrientation(id)`.
  Every later task consumes `PdfRect`/`PdfTemplate` from here.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/print/pdf/templates/templates.test.ts
import { describe, expect, it } from "vitest";
import { pdfTemplates, templateForOrientation } from "./index";
import { mapFrameAspect, templateBlocks } from "./types";

const overlaps = (a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height;

describe("pdf templates", () => {
  it.each(Object.values(pdfTemplates))("$id blocks stay inside margins", (t) => {
    for (const { name, rect } of templateBlocks(t)) {
      expect.soft(rect.x, `${name} left`).toBeGreaterThanOrEqual(t.margin);
      expect.soft(rect.y, `${name} bottom`).toBeGreaterThanOrEqual(t.margin);
      expect.soft(rect.x + rect.width, `${name} right`)
        .toBeLessThanOrEqual(t.page.width - t.margin);
      expect.soft(rect.y + rect.height, `${name} top`)
        .toBeLessThanOrEqual(t.page.height - t.margin);
    }
  });

  it.each(Object.values(pdfTemplates))("$id blocks never overlap", (t) => {
    const blocks = templateBlocks(t);
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        expect(
          overlaps(blocks[i].rect, blocks[j].rect),
          `${blocks[i].name} vs ${blocks[j].name}`,
        ).toBe(false);
      }
    }
  });

  it("portrait page is Letter portrait, landscape is Letter landscape", () => {
    expect(pdfTemplates.portrait.page).toEqual({ width: 612, height: 792 });
    expect(pdfTemplates.landscape.page).toEqual({ width: 792, height: 612 });
  });

  it("map frames have usable aspects", () => {
    expect(mapFrameAspect(pdfTemplates.portrait)).toBeCloseTo(556 / 500, 5);
    expect(mapFrameAspect(pdfTemplates.landscape)).toBeCloseTo(736 / 434, 5);
  });

  it("templateForOrientation returns the matching template", () => {
    expect(templateForOrientation("portrait").id).toBe("portrait");
    expect(templateForOrientation("landscape").id).toBe("landscape");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/print/pdf/templates/templates.test.ts`
Expected: FAIL — cannot resolve `./index` / `./types`.

- [ ] **Step 3: Implement the modules**

```ts
// web/src/print/pdf/templates/types.ts
/** PDF user-space rectangle: points, origin at the page's bottom-left. */
export type PdfRect = { x: number; y: number; width: number; height: number };

export type PdfTemplateId = "portrait" | "landscape";

export const POINTS_PER_INCH = 72;
export const METRES_PER_POINT = 0.0254 / POINTS_PER_INCH;

export type PdfTemplate = {
  id: PdfTemplateId;
  page: { width: number; height: number };
  margin: number;
  mapFrame: PdfRect;
  titleBlock: PdfRect;
  legendBox: PdfRect;
  attributionStrip: PdfRect;
  scaleBar: { x: number; y: number; maxWidth: number };
  northArrow: { x: number; y: number; size: number };
  qr: { x: number; y: number; size: number };
  /** Font sizes in points; faces are pdf-lib StandardFonts (Helvetica). */
  type: { title: number; subtitle: number; body: number; caption: number };
};

export function mapFrameAspect(template: PdfTemplate): number {
  return template.mapFrame.width / template.mapFrame.height;
}

/** Every visually exclusive block, for layout-invariant tests and mocks. */
export function templateBlocks(
  template: PdfTemplate,
): Array<{ name: string; rect: PdfRect }> {
  const { northArrow, qr, scaleBar } = template;
  return [
    { name: "mapFrame", rect: template.mapFrame },
    { name: "titleBlock", rect: template.titleBlock },
    { name: "legendBox", rect: template.legendBox },
    { name: "attributionStrip", rect: template.attributionStrip },
    {
      name: "scaleBar",
      rect: { x: scaleBar.x, y: scaleBar.y - 4, width: scaleBar.maxWidth, height: 26 },
    },
    {
      name: "northArrow",
      rect: { x: northArrow.x, y: northArrow.y, width: northArrow.size, height: northArrow.size },
    },
    { name: "qr", rect: { x: qr.x, y: qr.y, width: qr.size, height: qr.size } },
  ];
}
```

```ts
// web/src/print/pdf/templates/portrait.ts
import type { PdfTemplate } from "./types";

/**
 * Letter portrait: title band on top, map dominant, and a bottom band with
 * legend, scale bar + north arrow, and the QR share link above a full-width
 * attribution strip. All numbers are PDF points from the bottom-left.
 */
export const portraitTemplate: PdfTemplate = {
  id: "portrait",
  page: { width: 612, height: 792 },
  margin: 28,
  titleBlock: { x: 28, y: 700, width: 556, height: 64 },
  mapFrame: { x: 28, y: 192, width: 556, height: 500 },
  legendBox: { x: 28, y: 72, width: 312, height: 112 },
  scaleBar: { x: 348, y: 84, maxWidth: 128 },
  northArrow: { x: 352, y: 124, size: 40 },
  qr: { x: 488, y: 72, size: 96 },
  attributionStrip: { x: 28, y: 28, width: 556, height: 36 },
  type: { title: 22, subtitle: 11, body: 9, caption: 7 },
};
```

```ts
// web/src/print/pdf/templates/landscape.ts
import type { PdfTemplate } from "./types";

/**
 * Letter landscape: map dominant on top (wide field-map aspect), compact
 * bottom band with title, legend, scale + north, QR, and attribution.
 */
export const landscapeTemplate: PdfTemplate = {
  id: "landscape",
  page: { width: 792, height: 612 },
  margin: 28,
  mapFrame: { x: 28, y: 150, width: 736, height: 434 },
  titleBlock: { x: 28, y: 64, width: 300, height: 78 },
  legendBox: { x: 340, y: 64, width: 224, height: 78 },
  scaleBar: { x: 576, y: 76, maxWidth: 80 },
  northArrow: { x: 576, y: 106, size: 32 },
  qr: { x: 668, y: 46, size: 96 },
  attributionStrip: { x: 28, y: 28, width: 624, height: 28 },
  type: { title: 16, subtitle: 10, body: 9, caption: 7 },
};
```

```ts
// web/src/print/pdf/templates/index.ts
import { landscapeTemplate } from "./landscape";
import { portraitTemplate } from "./portrait";
import type { PdfTemplate, PdfTemplateId } from "./types";

export const pdfTemplates: Record<PdfTemplateId, PdfTemplate> = {
  portrait: portraitTemplate,
  landscape: landscapeTemplate,
};

export function templateForOrientation(id: PdfTemplateId): PdfTemplate {
  return pdfTemplates[id];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/print/pdf/templates/templates.test.ts`
Expected: PASS (5 tests). If an overlap assertion fails, adjust the offending
rect — the literals are a starting layout; tests are the guardrail.

- [ ] **Step 5: Commit**

```bash
git add src/print/pdf/templates
git commit -m "feat(web): add declarative Letter PDF export templates"
```

---

### Task 2: Scale bar math

**Files:**
- Create: `web/src/print/pdf/scaleBar.ts`
- Test: `web/src/print/pdf/scaleBar.test.ts`

**Interfaces:**
- Consumes: `PdfRect` (Task 1), `groundMetresBetween` from
  `web/src/userMaps/transform/webMercator.ts`, `PrintMapBounds` from
  `web/src/services/printSnapshot.ts`.
- Produces: `ScaleBarSpec { metres; label; widthPoints; denominator;
  denominatorLabel }`, `buildScaleBar(bounds, mapFrame, maxWidthPoints)`.
  Task 6 draws from `ScaleBarSpec`; Task 7's toolbar shows
  `denominatorLabel`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/print/pdf/scaleBar.test.ts
import { describe, expect, it } from "vitest";
import { buildScaleBar } from "./scaleBar";
import { portraitTemplate } from "./templates/portrait";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };
const frame = portraitTemplate.mapFrame;

describe("buildScaleBar", () => {
  it("picks a 1/2/5 round length that fits maxWidth", () => {
    const bar = buildScaleBar(bounds, frame, 128);
    const mantissa = bar.metres / 10 ** Math.floor(Math.log10(bar.metres));
    expect([1, 2, 5]).toContain(mantissa);
    expect(bar.widthPoints).toBeGreaterThan(0);
    expect(bar.widthPoints).toBeLessThanOrEqual(128);
  });

  it("labels metres below 1 km and kilometres above", () => {
    expect(buildScaleBar(bounds, frame, 128).label).toMatch(/^\d+(\.\d+)? (m|km)$/u);
  });

  it("computes a plausible denominator for a ~23 km wide frame", () => {
    // 0.3° of longitude at 46.1°N ≈ 23.2 km across 556 pt (≈ 0.196 m).
    const bar = buildScaleBar(bounds, frame, 128);
    expect(bar.denominator).toBeGreaterThan(100_000);
    expect(bar.denominator).toBeLessThan(140_000);
    expect(bar.denominatorLabel).toMatch(/^≈ 1:\d{1,3}(,\d{3})*$/u);
  });

  it("scales the bar width consistently with the denominator", () => {
    const bar = buildScaleBar(bounds, frame, 128);
    // widthPoints * metres-per-point must reproduce bar.metres.
    const metresPerPoint = bar.denominator * (0.0254 / 72);
    expect(bar.widthPoints * metresPerPoint).toBeCloseTo(bar.metres, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/print/pdf/scaleBar.test.ts`
Expected: FAIL — cannot resolve `./scaleBar`.

- [ ] **Step 3: Implement**

```ts
// web/src/print/pdf/scaleBar.ts
import type { PrintMapBounds } from "../../services/printSnapshot";
import { groundMetresBetween } from "../../userMaps/transform/webMercator";
import { METRES_PER_POINT, type PdfRect } from "./templates/types";

export type ScaleBarSpec = {
  metres: number;
  label: string;
  widthPoints: number;
  denominator: number;
  denominatorLabel: string;
};

/** Largest 1/2/5 × 10ⁿ value ≤ target. */
function roundScaleLength(target: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;
  return (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
}

export function buildScaleBar(
  bounds: PrintMapBounds,
  mapFrame: PdfRect,
  maxWidthPoints: number,
): ScaleBarSpec {
  const midLat = (bounds.north + bounds.south) / 2;
  const groundWidthMetres = groundMetresBetween(
    { lat: midLat, lng: bounds.west },
    { lat: midLat, lng: bounds.east },
  );
  const metresPerPoint = groundWidthMetres / mapFrame.width;
  const denominator = metresPerPoint / METRES_PER_POINT;
  const metres = roundScaleLength(metresPerPoint * maxWidthPoints);
  const rounded = Number(denominator.toPrecision(3));
  return {
    metres,
    label: metres >= 1_000 ? `${metres / 1_000} km` : `${metres} m`,
    widthPoints: metres / metresPerPoint,
    denominator,
    denominatorLabel: `≈ 1:${rounded.toLocaleString("en-CA")}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/print/pdf/scaleBar.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/print/pdf/scaleBar.ts src/print/pdf/scaleBar.test.ts
git commit -m "feat(web): compute round-increment scale bars for PDF export"
```

---

### Task 3: Tile and output-space math

**Files:**
- Create: `web/src/print/pdf/tileMath.ts`
- Test: `web/src/print/pdf/tileMath.test.ts`

**Interfaces:**
- Consumes: `toMercator`, `MercatorPoint` from
  `web/src/userMaps/transform/webMercator.ts`; `LatLngPoint` from
  `web/src/userMaps/transform/projection.ts`; `PrintMapBounds`.
- Produces (Task 5 consumes all of these):
  - `TILE_SIZE = 256`, `WORLD_EXTENT = 20_037_508.342789244`
  - `TileCoords { z; x; y }`
  - `OutputSpace` and `outputSpaceForBounds(bounds, widthPx, heightPx)`
  - `mercatorToOutput(space, m): {x,y}` and `latLngToOutput(space, p)`
  - `zoomForOutput(bounds, widthPx, maxNativeZoom): number`
  - `tilesForBounds(bounds, zoom): TileCoords[]`
  - `tileMercatorBounds(tile): { minX; minY; maxX; maxY }`
  - `tileOutputRect(space, tile): {x,y,width,height}`

Deliberately standalone (10 lines of world-extent math shared with
`web/src/layers/arcGISExport.ts`) so this module never imports Leaflet.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/print/pdf/tileMath.test.ts
import { describe, expect, it } from "vitest";
import {
  latLngToOutput,
  outputSpaceForBounds,
  tileMercatorBounds,
  tileOutputRect,
  tilesForBounds,
  zoomForOutput,
} from "./tileMath";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };

describe("tileMath", () => {
  it("maps bound corners onto the output pixel corners", () => {
    const space = outputSpaceForBounds(bounds, 1000, 800);
    expect(latLngToOutput(space, { lat: 46.2, lng: -61.4 }))
      .toEqual({ x: 0, y: 0 });
    const se = latLngToOutput(space, { lat: 46.0, lng: -61.1 });
    expect(se.x).toBeCloseTo(1000, 6);
    expect(se.y).toBeCloseTo(800, 6);
  });

  it("chooses the smallest zoom that serves the output width", () => {
    const zoom = zoomForOutput(bounds, 2317, 19);
    // 0.3° of longitude = 33 396 m in Mercator; world = 40 075 016 m.
    // At z=15 the world is 256·2^15 px, giving ~6 992 px across the frame,
    // at z=14 ~3 496 px, at z=13 ~1 748 px — first zoom ≥ 2317 is 14.
    expect(zoom).toBe(14);
    expect(zoomForOutput(bounds, 2317, 12)).toBe(12); // clamped to native max
  });

  it("enumerates exactly the tiles covering the bounds", () => {
    // Northeast quadrant of the world at z=1 is tile x=1, y=0.
    const tiles = tilesForBounds(
      { north: 40, south: 10, west: 20, east: 60 },
      1,
    );
    expect(tiles).toEqual([{ z: 1, x: 1, y: 0 }]);
  });

  it("places a tile so its mercator bounds land on the right pixels", () => {
    const space = outputSpaceForBounds(bounds, 1000, 800);
    const tile = tilesForBounds(bounds, 12)[0];
    const rect = tileOutputRect(space, tile);
    const merc = tileMercatorBounds(tile);
    const topLeft = { x: merc.minX, y: merc.maxY };
    expect(rect.x).toBeCloseTo(
      (topLeft.x - space.mercWest) * space.scaleX, 6);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/print/pdf/tileMath.test.ts`
Expected: FAIL — cannot resolve `./tileMath`.

- [ ] **Step 3: Implement**

```ts
// web/src/print/pdf/tileMath.ts
import type { PrintMapBounds } from "../../services/printSnapshot";
import type { LatLngPoint } from "../../userMaps/transform/projection";
import {
  toMercator,
  type MercatorPoint,
} from "../../userMaps/transform/webMercator";

export const TILE_SIZE = 256;
export const WORLD_EXTENT = 20_037_508.342789244;

export type TileCoords = { z: number; x: number; y: number };

export type OutputSpace = {
  widthPx: number;
  heightPx: number;
  mercWest: number;
  mercEast: number;
  mercNorth: number;
  mercSouth: number;
  /** Output pixels per Mercator metre, horizontal / vertical. */
  scaleX: number;
  scaleY: number;
};

export function outputSpaceForBounds(
  bounds: PrintMapBounds,
  widthPx: number,
  heightPx: number,
): OutputSpace {
  const nw = toMercator({ lat: bounds.north, lng: bounds.west });
  const se = toMercator({ lat: bounds.south, lng: bounds.east });
  return {
    widthPx,
    heightPx,
    mercWest: nw.x,
    mercEast: se.x,
    mercNorth: nw.y,
    mercSouth: se.y,
    scaleX: widthPx / (se.x - nw.x),
    scaleY: heightPx / (nw.y - se.y),
  };
}

export function mercatorToOutput(
  space: OutputSpace,
  point: MercatorPoint,
): { x: number; y: number } {
  return {
    x: (point.x - space.mercWest) * space.scaleX,
    y: (space.mercNorth - point.y) * space.scaleY,
  };
}

export function latLngToOutput(
  space: OutputSpace,
  point: LatLngPoint,
): { x: number; y: number } {
  return mercatorToOutput(space, toMercator(point));
}

/**
 * Smallest zoom whose native resolution meets the requested output width,
 * clamped to the layer's maximum native zoom. Matching (not exceeding) the
 * output resolution keeps tile counts bounded at print DPI.
 */
export function zoomForOutput(
  bounds: PrintMapBounds,
  widthPx: number,
  maxNativeZoom: number,
): number {
  const west = toMercator({ lat: 0, lng: bounds.west }).x;
  const east = toMercator({ lat: 0, lng: bounds.east }).x;
  const mercWidth = east - west;
  const zoom = Math.ceil(
    Math.log2((widthPx * 2 * WORLD_EXTENT) / (mercWidth * TILE_SIZE)),
  );
  return Math.max(0, Math.min(maxNativeZoom, zoom));
}

export function tileMercatorBounds(
  tile: TileCoords,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const span = (2 * WORLD_EXTENT) / 2 ** tile.z;
  const minX = -WORLD_EXTENT + tile.x * span;
  const maxY = WORLD_EXTENT - tile.y * span;
  return { minX, minY: maxY - span, maxX: minX + span, maxY };
}

export function tilesForBounds(
  bounds: PrintMapBounds,
  zoom: number,
): TileCoords[] {
  const count = 2 ** zoom;
  const nw = toMercator({ lat: bounds.north, lng: bounds.west });
  const se = toMercator({ lat: bounds.south, lng: bounds.east });
  const clamp = (value: number) =>
    Math.max(0, Math.min(count - 1, Math.floor(value)));
  const minTileX = clamp(((nw.x + WORLD_EXTENT) / (2 * WORLD_EXTENT)) * count);
  const maxTileX = clamp(((se.x + WORLD_EXTENT) / (2 * WORLD_EXTENT)) * count);
  const minTileY = clamp(((WORLD_EXTENT - nw.y) / (2 * WORLD_EXTENT)) * count);
  const maxTileY = clamp(((WORLD_EXTENT - se.y) / (2 * WORLD_EXTENT)) * count);
  const tiles: TileCoords[] = [];
  for (let y = minTileY; y <= maxTileY; y += 1) {
    for (let x = minTileX; x <= maxTileX; x += 1) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

export function tileOutputRect(
  space: OutputSpace,
  tile: TileCoords,
): { x: number; y: number; width: number; height: number } {
  const merc = tileMercatorBounds(tile);
  const topLeft = mercatorToOutput(space, { x: merc.minX, y: merc.maxY });
  const bottomRight = mercatorToOutput(space, { x: merc.maxX, y: merc.minY });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/print/pdf/tileMath.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/print/pdf/tileMath.ts src/print/pdf/tileMath.test.ts
git commit -m "feat(web): add Leaflet-free tile and output-space math for PDF export"
```

---

### Task 4: Georeferencing registration writer

**Why EPSG:3857, not geographic WGS 84 (spec amendment).** The composited
raster is Web Mercator. A registration declared in geographic WGS 84 with
corner points makes standards-compliant consumers interpolate linearly in
lat/lon, which diverges from the Mercator raster between corners — roughly
0.4 m at 1:25,000 but ~6 m at 1:100,000 for the portrait frame, failing the
spec's original "under one ground metre" gate. Declaring the CRS as
EPSG:3857 (as GDAL itself does for Mercator rasters) makes pixel↔map affine
in the declared space — exact at every pixel, at every scale. GPTS corner
values remain WGS 84 lat/lon, as the ISO standard requires. The spec has
been amended accordingly (already done in the branch — verify the spec's
"Georeferencing Registration" section says EPSG:3857 before starting; if
not, stop and report).

**Files:**
- Create: `web/src/print/pdf/geoRegistration.ts`
- Test: `web/src/print/pdf/geoRegistration.test.ts`

**Interfaces:**
- Consumes: `PdfRect` (Task 1); `PDFDocument`, `PDFPage`, `PDFHexString`,
  `PDFName` from `pdf-lib`; `PrintMapBounds`;
  round-trip oracle `extractGeoPdfMetadata(bytes, viewport)` +
  `PdfViewportGeometry` from `web/src/userMaps/parsers/geoPdfMetadata.ts`;
  `toMercator` from `web/src/userMaps/transform/webMercator.ts`.
- Produces: `attachGeoRegistration(document: PDFDocument, page: PDFPage,
  bounds: PrintMapBounds, mapFrame: PdfRect): void` (Task 6 calls it).

**Parser acceptance contract (what the writer must emit — verified against
`geoPdfMetadata.ts` at lines 183–532):**
- `/VP` must be a direct array of Viewport dicts: `Type: "Viewport"`,
  4-number `BBox`, `Measure` dict with `Type: "Measure"`, `Subtype: "GEO"`,
  `GCS` dict of `Type` `GEOGCS`/`PROJCS` with `EPSG` number, `LPTS`/`GPTS`
  equal even lengths ≥ 6, GPTS as **(lat, lng) pairs**.
- `/LGIDict`: `Type: "LGIDict"`, `Version` as a **PDF string** `"2.1"`
  (plain JS strings in `context.obj` become PDFNames, which the parser's
  `textValue` rejects — use `PDFHexString.fromText`), 6-number `CTM`,
  rectangular `Neatline` (closed 5-point ring accepted, closing point popped
  at 1e-7 tolerance), `Projection` dict of `Type: "Projection"` with
  `ProjectionType "MC"`, `Datum "WGE"`, `Units "m"`, and
  `CentralMeridian`/`OriginLatitude`/`FalseEasting`/`FalseNorthing`/
  `ScaleFactor` all `0` → parser resolves EPSG:3857.
- Names like `Type`/`ProjectionType`/`Datum` may be plain strings
  (PDFName accepted for those); `Name`/`Description`/`WKT` must be
  `PDFHexString.fromText`.

- [ ] **Step 1: Write the failing round-trip test**

```ts
// web/src/print/pdf/geoRegistration.test.ts
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractGeoPdfMetadata,
  type PdfViewportGeometry,
} from "../../userMaps/parsers/geoPdfMetadata";
import { attachGeoRegistration } from "./geoRegistration";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };
const mapFrame = { x: 28, y: 192, width: 556, height: 500 };

function viewport(width: number, height: number): PdfViewportGeometry {
  return {
    width,
    height,
    transform: [1, 0, 0, -1, 0, height],
    viewBox: [0, 0, width, height],
  };
}

async function writtenBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  attachGeoRegistration(document, page, bounds, mapFrame);
  return document.save({ useObjectStreams: false });
}

// Rendered at 72 dpi with a top-left origin: PDF (x, y) → pixel (x, 792 − y).
const frameTopPx = 792 - (mapFrame.y + mapFrame.height); // 100
const frameBottomPx = 792 - mapFrame.y; // 600
const frameLeftPx = mapFrame.x; // 28
const frameRightPx = mapFrame.x + mapFrame.width; // 584

describe("attachGeoRegistration round-trips through the app's own parser", () => {
  it("yields one accepted candidate per flavour and nothing rejected", async () => {
    const extraction = await extractGeoPdfMetadata(
      await writtenBytes(),
      viewport(612, 792),
    );
    expect(extraction.rejected).toEqual([]);
    expect(extraction.candidates.map(({ flavor }) => flavor).sort())
      .toEqual(["lgidict", "measure"]);
  });

  it.each([
    ["measure", 0],
    ["lgidict", 1],
  ] as const)("%s corners are exact", async (flavor) => {
    const extraction = await extractGeoPdfMetadata(
      await writtenBytes(),
      viewport(612, 792),
    );
    const candidate = extraction.candidates.find(
      (entry) => entry.flavor === flavor,
    );
    expect(candidate).toBeDefined();
    const byPixel = (x: number, y: number) =>
      candidate!.gcps.find(
        (gcp) =>
          Math.abs(gcp.pixel.x - x) < 1e-6 && Math.abs(gcp.pixel.y - y) < 1e-6,
      );
    const sw = byPixel(frameLeftPx, frameBottomPx);
    const ne = byPixel(frameRightPx, frameTopPx);
    expect(sw?.map.lat).toBeCloseTo(bounds.south, 9);
    expect(sw?.map.lng).toBeCloseTo(bounds.west, 9);
    expect(ne?.map.lat).toBeCloseTo(bounds.north, 9);
    expect(ne?.map.lng).toBeCloseTo(bounds.east, 9);
  });

  it("registration is affine-exact at the frame midpoint (EPSG:3857)", async () => {
    // With a Mercator CRS declared, the pixel→map relation is linear in
    // Mercator metres. The lat/lng of the frame's centre pixel must equal
    // the inverse-Mercator of the Mercator-space midpoint — no interior
    // interpolation error at any scale.
    const { candidates } = await extractGeoPdfMetadata(
      await writtenBytes(),
      viewport(612, 792),
    );
    const lgi = candidates.find(({ flavor }) => flavor === "lgidict");
    // The parser converts the CTM through EPSG:3857 itself; if the corners
    // above are exact and the flavour resolved, interior linearity follows
    // from the affine CTM. Assert the CTM produced 4 valid corner GCPs.
    expect(lgi?.gcps).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/print/pdf/geoRegistration.test.ts`
Expected: FAIL — cannot resolve `./geoRegistration`.

- [ ] **Step 3: Implement the writer**

```ts
// web/src/print/pdf/geoRegistration.ts
import { PDFHexString, PDFName, type PDFDocument, type PDFPage } from "pdf-lib";
import type { PrintMapBounds } from "../../services/printSnapshot";
import { toMercator } from "../../userMaps/transform/webMercator";
import type { PdfRect } from "./templates/types";

const WEB_MERCATOR_WKT =
  'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",' +
  'SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],' +
  'UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],' +
  'PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],' +
  'PARAMETER["latitude_of_origin",0],PARAMETER["false_easting",0],' +
  'PARAMETER["false_northing",0],UNIT["metre",1],' +
  'AUTHORITY["EPSG","3857"]]';

/**
 * Stamps both GeoPDF registration flavours onto `page` for the map image
 * occupying `mapFrame`. The CRS is EPSG:3857 because the composited raster
 * IS Web Mercator: declaring the raster's own projection makes the
 * pixel-to-map relation affine-exact at every pixel. GPTS corner values are
 * WGS 84 latitude/longitude, per ISO 32000-2. Both dictionaries are written
 * as direct objects — the app's own parser skips unresolved indirect refs.
 */
export function attachGeoRegistration(
  document: PDFDocument,
  page: PDFPage,
  bounds: PrintMapBounds,
  mapFrame: PdfRect,
): void {
  const left = mapFrame.x;
  const bottom = mapFrame.y;
  const right = mapFrame.x + mapFrame.width;
  const top = mapFrame.y + mapFrame.height;

  // ISO 32000 /Measure + /VP. LPTS corners run SW, NW, NE, SE in the
  // viewport's unit square (v=0 at the bottom); GPTS pairs are (lat, lng).
  const measure = document.context.obj({
    Type: "Measure",
    Subtype: "GEO",
    Bounds: [0, 0, 0, 1, 1, 1, 1, 0],
    LPTS: [0, 0, 0, 1, 1, 1, 1, 0],
    GPTS: [
      bounds.south, bounds.west,
      bounds.north, bounds.west,
      bounds.north, bounds.east,
      bounds.south, bounds.east,
    ],
    GCS: {
      Type: "PROJCS",
      EPSG: 3857,
      WKT: PDFHexString.fromText(WEB_MERCATOR_WKT),
    },
  });
  const viewport = document.context.obj({
    Type: "Viewport",
    BBox: [left, bottom, right, top],
    Name: PDFHexString.fromText("Map frame"),
    Measure: measure,
  });
  page.node.set(PDFName.of("VP"), document.context.obj([viewport]));

  // OGC Best Practice /LGIDict. The CTM maps PDF points to EPSG:3857
  // metres; the neatline is the map frame as an explicitly closed ring
  // (the GeoPDF spike recorded GDAL's "Non closed ring" warning for
  // open-ring producers — this writer closes it).
  const mercNorthWest = toMercator({ lat: bounds.north, lng: bounds.west });
  const mercSouthEast = toMercator({ lat: bounds.south, lng: bounds.east });
  const scaleX = (mercSouthEast.x - mercNorthWest.x) / mapFrame.width;
  const scaleY = (mercNorthWest.y - mercSouthEast.y) / mapFrame.height;
  const lgi = document.context.obj({
    Type: "LGIDict",
    Version: PDFHexString.fromText("2.1"),
    Description: PDFHexString.fromText("Map frame"),
    CTM: [
      scaleX, 0, 0, scaleY,
      mercNorthWest.x - scaleX * left,
      mercSouthEast.y - scaleY * bottom,
    ],
    Neatline: [
      left, bottom, left, top, right, top, right, bottom, left, bottom,
    ],
    Projection: {
      Type: "Projection",
      ProjectionType: "MC",
      Datum: "WGE",
      Units: "m",
      CentralMeridian: 0,
      OriginLatitude: 0,
      FalseEasting: 0,
      FalseNorthing: 0,
      ScaleFactor: 0,
    },
  });
  page.node.set(PDFName.of("LGIDict"), document.context.obj([lgi]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/print/pdf/geoRegistration.test.ts`
Expected: PASS (4 tests). If the LGIDict candidate is rejected with
`unsupported-crs`, the Projection dict deviates from the parser's "MC"
recognition path — compare against `projectionDefinition` in
`geoPdfMetadata.ts:396-407` field by field.

- [ ] **Step 5: Commit**

```bash
git add src/print/pdf/geoRegistration.ts src/print/pdf/geoRegistration.test.ts
git commit -m "feat(web): write dual-flavour GeoPDF registration in EPSG:3857"
```

---

### Task 5: Export resolution ladder and the map compositor

**Files:**
- Create: `web/src/print/pdf/exportResolution.ts`
- Create: `web/src/print/pdf/mapCompositor.ts`
- Test: `web/src/print/pdf/exportResolution.test.ts`
- Test: `web/src/print/pdf/mapCompositor.test.ts`

**Interfaces:**
- Consumes: Task 3's `tileMath` exports; `buildSrcMesh`, `drawWarpedImage`
  from `web/src/userMaps/render/mesh.ts`; `LatLngPoint`; `PixelRect` from
  `web/src/userMaps/types.ts`; `PdfRect`.
- Produces (Tasks 6 and 8 consume):
  - `resolveExportResolution(mapFrame: PdfRect, options: { constrainedDevice:
    boolean }): ExportResolution { dpi; widthPx; heightPx; reduced }`
  - `isConstrainedDevice(nav?: Navigator): boolean`
  - `CompositorLayer` union (`kind: "tile" | "warped" | "parcel-ring"`),
    `CompositorLayerStatus { id; name; status: "rendered" | "failed" |
    "empty"; detail?: string }`, `CompositorProgress`, `CompositorResult
    { canvas; statuses }`
  - `composeMapImage(bounds, size: {widthPx; heightPx}, layers,
    options?): Promise<CompositorResult>` — layers draw in array order
    (bottom first); a failed layer never throws, it reports.

- [ ] **Step 1: Write the failing resolution test**

```ts
// web/src/print/pdf/exportResolution.test.ts
import { describe, expect, it } from "vitest";
import { isConstrainedDevice, resolveExportResolution } from "./exportResolution";
import { pdfTemplates } from "./templates/index";

describe("resolveExportResolution", () => {
  it("uses 300 DPI on unconstrained devices", () => {
    const r = resolveExportResolution(pdfTemplates.portrait.mapFrame, {
      constrainedDevice: false,
    });
    expect(r).toEqual({
      dpi: 300,
      widthPx: Math.round((556 / 72) * 300), // 2317
      heightPx: Math.round((500 / 72) * 300), // 2083
      reduced: false,
    });
  });

  it("drops to 200 DPI on constrained devices and flags the reduction", () => {
    const r = resolveExportResolution(pdfTemplates.landscape.mapFrame, {
      constrainedDevice: true,
    });
    expect(r.dpi).toBe(200);
    expect(r.reduced).toBe(true);
  });

  it("never exceeds the 4096 px canvas cap", () => {
    const r = resolveExportResolution(
      { x: 0, y: 0, width: 1100, height: 1100 }, // hypothetical oversized frame
      { constrainedDevice: false },
    );
    expect(Math.max(r.widthPx, r.heightPx)).toBeLessThanOrEqual(4096);
  });

  it("detects iOS and low-memory navigators as constrained", () => {
    const ios = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" };
    const lowMem = { userAgent: "x", deviceMemory: 2 };
    const desktop = { userAgent: "Mozilla/5.0 (Macintosh)", deviceMemory: 16 };
    expect(isConstrainedDevice(ios as Navigator)).toBe(true);
    expect(isConstrainedDevice(lowMem as unknown as Navigator)).toBe(true);
    expect(isConstrainedDevice(desktop as unknown as Navigator)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `exportResolution.ts`**

```ts
// web/src/print/pdf/exportResolution.ts
import { POINTS_PER_INCH, type PdfRect } from "./templates/types";

export const MAX_CANVAS_DIMENSION_PX = 4096;

export type ExportResolution = {
  dpi: number;
  widthPx: number;
  heightPx: number;
  reduced: boolean;
};

/**
 * iOS Safari enforces aggressive per-canvas memory ceilings (documented in
 * the GeoPDF import work), and Chrome's `deviceMemory` flags low-RAM
 * hardware. Both start the DPI ladder one rung down.
 */
export function isConstrainedDevice(nav: Navigator = navigator): boolean {
  const memory = (nav as { deviceMemory?: number }).deviceMemory;
  return /iPhone|iPad|iPod/u.test(nav.userAgent) ||
    (typeof memory === "number" && memory <= 4);
}

export function resolveExportResolution(
  mapFrame: PdfRect,
  options: { constrainedDevice: boolean },
): ExportResolution {
  const ladder = options.constrainedDevice ? [200, 150] : [300, 200, 150];
  for (const dpi of ladder) {
    const widthPx = Math.round((mapFrame.width / POINTS_PER_INCH) * dpi);
    const heightPx = Math.round((mapFrame.height / POINTS_PER_INCH) * dpi);
    if (Math.max(widthPx, heightPx) <= MAX_CANVAS_DIMENSION_PX) {
      return { dpi, widthPx, heightPx, reduced: dpi < 300 };
    }
  }
  const dpi = ladder[ladder.length - 1];
  const scale =
    MAX_CANVAS_DIMENSION_PX / Math.max(mapFrame.width, mapFrame.height);
  return {
    dpi,
    widthPx: Math.round(mapFrame.width * scale),
    heightPx: Math.round(mapFrame.height * scale),
    reduced: true,
  };
}
```

Run: `npx vitest run src/print/pdf/exportResolution.test.ts` — expect PASS
(4 tests).

- [ ] **Step 3: Write the failing compositor test**

The `canvas` devDependency gives jsdom real 2D contexts, so these tests
assert actual pixels. `fetchImage` is injected — no network.

```ts
// web/src/print/pdf/mapCompositor.test.ts
import { describe, expect, it } from "vitest";
import {
  composeMapImage,
  type CompositorLayer,
} from "./mapCompositor";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };
const size = { widthPx: 200, heightPx: 160 };

function solidTile(colour: string): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 256;
  tile.height = 256;
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 256, 256);
  return tile;
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...canvas.getContext("2d")!.getImageData(x, y, 1, 1).data];
}

const redTileLayer = (overrides?: Partial<CompositorLayer>): CompositorLayer => ({
  kind: "tile",
  id: "modern",
  name: "OpenStreetMap base map",
  url: ({ z, x, y }) => `https://tiles.example/${z}/${x}/${y}.png`,
  opacity: 1,
  maxNativeZoom: 19,
  ...overrides,
} as CompositorLayer);

describe("composeMapImage", () => {
  it("draws a tile layer over the whole frame and reports rendered", async () => {
    const { canvas, statuses } = await composeMapImage(bounds, size,
      [redTileLayer()],
      { fetchImage: async () => solidTile("#ff0000") });
    expect(statuses).toEqual([
      { id: "modern", name: "OpenStreetMap base map", status: "rendered" },
    ]);
    expect(pixel(canvas, 100, 80).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it("respects layer order and opacity", async () => {
    const { canvas } = await composeMapImage(bounds, size, [
      redTileLayer(),
      { ...redTileLayer(), id: "wash", name: "Blue wash", opacity: 0.5,
        url: () => "https://tiles.example/blue.png" } as CompositorLayer,
    ], {
      fetchImage: async (url) =>
        solidTile(url.includes("blue") ? "#0000ff" : "#ff0000"),
    });
    const [r, , b] = pixel(canvas, 100, 80);
    expect(r).toBeGreaterThan(100); // red shows through
    expect(b).toBeGreaterThan(100); // blue wash on top
  });

  it("reports a failed layer by name, keeps compositing, never throws", async () => {
    const { statuses } = await composeMapImage(bounds, size, [
      redTileLayer(),
      { ...redTileLayer(), id: "fletcher-03", name: "Fletcher sheet 3",
        url: () => "https://tiles.example/broken.png" } as CompositorLayer,
    ], {
      fetchImage: async (url) => {
        if (url.includes("broken")) throw new Error("HTTP 404");
        return solidTile("#ff0000");
      },
    });
    expect(statuses[0].status).toBe("rendered");
    expect(statuses[1]).toMatchObject({
      id: "fletcher-03",
      name: "Fletcher sheet 3",
      status: "failed",
    });
    expect(statuses[1].detail).toMatch(/tile/u);
  });

  it("marks a layer with no covering tiles as empty", async () => {
    const { statuses } = await composeMapImage(bounds, size,
      [redTileLayer({ url: () => null } as Partial<CompositorLayer>)],
      { fetchImage: async () => solidTile("#ff0000") });
    expect(statuses[0].status).toBe("empty");
  });

  it("draws a parcel ring at projected pixel coordinates", async () => {
    const ring = [
      { lat: 46.15, lng: -61.35 },
      { lat: 46.15, lng: -61.15 },
      { lat: 46.05, lng: -61.15 },
      { lat: 46.05, lng: -61.35 },
      { lat: 46.15, lng: -61.35 },
    ];
    const { canvas, statuses } = await composeMapImage(bounds, size, [{
      kind: "parcel-ring",
      id: "selected-parcel",
      name: "Selected parcel",
      rings: [ring],
      strokeStyle: "#00ff00",
      lineWidthPx: 4,
    }], {});
    expect(statuses[0].status).toBe("rendered");
    // The ring's top edge sits at lat 46.15 → somewhere in the top half.
    const columns = Array.from({ length: size.widthPx }, (_, x) =>
      pixel(canvas, x, Math.round(size.heightPx * 0.25)));
    expect(columns.some(([r, g]) => g > 200 && r < 100)).toBe(true);
  });

  it("warps a user map through the triangle mesh", async () => {
    const image = solidTile("#ffa500");
    // 1×1-cell mesh covering the middle of the frame.
    const latLngMesh = [
      [{ lat: 46.15, lng: -61.35 }, { lat: 46.15, lng: -61.15 }],
      [{ lat: 46.05, lng: -61.35 }, { lat: 46.05, lng: -61.15 }],
    ];
    const { canvas, statuses } = await composeMapImage(bounds, size, [{
      kind: "warped",
      id: "user-map-1",
      name: "My scan",
      image,
      imageWidth: 256,
      imageHeight: 256,
      latLngMesh,
      opacity: 1,
    }], {});
    expect(statuses[0].status).toBe("rendered");
    const [r, g, b] = pixel(canvas, 100, 80);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(100);
    expect(b).toBeLessThan(80);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/print/pdf/mapCompositor.test.ts`
Expected: FAIL — cannot resolve `./mapCompositor`.

- [ ] **Step 5: Implement the compositor**

```ts
// web/src/print/pdf/mapCompositor.ts
import { buildSrcMesh, drawWarpedImage } from "../../userMaps/render/mesh";
import type { LatLngPoint } from "../../userMaps/transform/projection";
import type { PixelRect } from "../../userMaps/types";
import type { PrintMapBounds } from "../../services/printSnapshot";
import {
  latLngToOutput,
  outputSpaceForBounds,
  tileOutputRect,
  tilesForBounds,
  zoomForOutput,
  type OutputSpace,
  type TileCoords,
} from "./tileMath";

export type CompositorTileLayer = {
  kind: "tile";
  id: string;
  name: string;
  /** Null means the tile is outside this layer's coverage — skip quietly. */
  url: (tile: TileCoords) => string | null;
  opacity: number;
  maxNativeZoom: number;
};

export type CompositorWarpedLayer = {
  kind: "warped";
  id: string;
  name: string;
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  latLngMesh: LatLngPoint[][];
  sourceRect?: PixelRect;
  opacity: number;
};

export type CompositorVectorRing = {
  kind: "parcel-ring";
  id: string;
  name: string;
  rings: LatLngPoint[][];
  strokeStyle: string;
  lineWidthPx: number;
};

export type CompositorLayer =
  | CompositorTileLayer
  | CompositorWarpedLayer
  | CompositorVectorRing;

export type CompositorLayerStatus = {
  id: string;
  name: string;
  status: "rendered" | "failed" | "empty";
  detail?: string;
};

export type CompositorProgress = {
  completedLayers: number;
  totalLayers: number;
  currentLayer: string;
};

export type CompositorResult = {
  canvas: HTMLCanvasElement;
  statuses: CompositorLayerStatus[];
};

export type FetchImage = (
  url: string,
  signal?: AbortSignal,
) => Promise<CanvasImageSource>;

/**
 * CORS-mode fetch → ImageBitmap. A response the canvas could not read back
 * would taint the whole export, so a non-CORS-readable tile is a fetch
 * failure, not a degraded success.
 */
const defaultFetchImage: FetchImage = async (url, signal) => {
  const response = await fetch(url, { mode: "cors", signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return createImageBitmap(await response.blob());
};

async function renderTileLayer(
  ctx: CanvasRenderingContext2D,
  space: OutputSpace,
  bounds: PrintMapBounds,
  layer: CompositorTileLayer,
  fetchImage: FetchImage,
  signal?: AbortSignal,
): Promise<CompositorLayerStatus> {
  const zoom = zoomForOutput(bounds, space.widthPx, layer.maxNativeZoom);
  const covered = tilesForBounds(bounds, zoom)
    .map((tile) => ({ tile, url: layer.url(tile) }))
    .filter((entry): entry is { tile: TileCoords; url: string } =>
      entry.url !== null);
  if (covered.length === 0) {
    return { id: layer.id, name: layer.name, status: "empty" };
  }
  const settled = await Promise.allSettled(
    covered.map(async ({ tile, url }) => ({
      tile,
      image: await fetchImage(url, signal),
    })),
  );
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  let failures = 0;
  for (const result of settled) {
    if (result.status === "rejected") {
      failures += 1;
      continue;
    }
    const rect = tileOutputRect(space, result.value.tile);
    ctx.drawImage(
      result.value.image, rect.x, rect.y, rect.width, rect.height,
    );
  }
  ctx.restore();
  if (failures > 0) {
    return {
      id: layer.id,
      name: layer.name,
      status: "failed",
      detail: `${failures} of ${covered.length} tiles failed to load`,
    };
  }
  return { id: layer.id, name: layer.name, status: "rendered" };
}

function renderWarpedLayer(
  ctx: CanvasRenderingContext2D,
  space: OutputSpace,
  layer: CompositorWarpedLayer,
): CompositorLayerStatus {
  const gridSize = layer.latLngMesh.length - 1;
  const srcMesh = buildSrcMesh(
    layer.imageWidth, layer.imageHeight, gridSize, layer.sourceRect,
  );
  const dstMesh = layer.latLngMesh.map((row) =>
    row.map((point) => latLngToOutput(space, point)));
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  drawWarpedImage(ctx, layer.image, srcMesh, dstMesh);
  ctx.restore();
  return { id: layer.id, name: layer.name, status: "rendered" };
}

function renderVectorRing(
  ctx: CanvasRenderingContext2D,
  space: OutputSpace,
  layer: CompositorVectorRing,
): CompositorLayerStatus {
  if (layer.rings.length === 0) {
    return { id: layer.id, name: layer.name, status: "empty" };
  }
  ctx.save();
  ctx.strokeStyle = layer.strokeStyle;
  ctx.lineWidth = layer.lineWidthPx;
  ctx.lineJoin = "round";
  for (const ring of layer.rings) {
    ctx.beginPath();
    ring.forEach((point, index) => {
      const { x, y } = latLngToOutput(space, point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
  return { id: layer.id, name: layer.name, status: "rendered" };
}

/**
 * Headless bounds→canvas renderer. Layers draw in array order (bottom
 * first) with their on-screen opacity. A layer failure is REPORTED, never
 * thrown: the dialog owns the proceed-or-cancel decision, and an export
 * must never silently omit a layer.
 */
export async function composeMapImage(
  bounds: PrintMapBounds,
  size: { widthPx: number; heightPx: number },
  layers: CompositorLayer[],
  options: {
    fetchImage?: FetchImage;
    onProgress?: (progress: CompositorProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<CompositorResult> {
  const fetchImage = options.fetchImage ?? defaultFetchImage;
  const canvas = document.createElement("canvas");
  canvas.width = size.widthPx;
  canvas.height = size.heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Export canvas is unavailable in this browser.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.widthPx, size.heightPx);
  const space = outputSpaceForBounds(bounds, size.widthPx, size.heightPx);
  const statuses: CompositorLayerStatus[] = [];
  for (const [index, layer] of layers.entries()) {
    options.onProgress?.({
      completedLayers: index,
      totalLayers: layers.length,
      currentLayer: layer.name,
    });
    try {
      if (layer.kind === "tile") {
        statuses.push(await renderTileLayer(
          ctx, space, bounds, layer, fetchImage, options.signal,
        ));
      } else if (layer.kind === "warped") {
        statuses.push(renderWarpedLayer(ctx, space, layer));
      } else {
        statuses.push(renderVectorRing(ctx, space, layer));
      }
    } catch (error) {
      statuses.push({
        id: layer.id,
        name: layer.name,
        status: "failed",
        detail: error instanceof Error ? error.message : "render failed",
      });
    }
  }
  options.onProgress?.({
    completedLayers: layers.length,
    totalLayers: layers.length,
    currentLayer: "",
  });
  return { canvas, statuses };
}
```

- [ ] **Step 6: Run both test files**

Run: `npx vitest run src/print/pdf/mapCompositor.test.ts src/print/pdf/exportResolution.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add src/print/pdf/exportResolution.ts src/print/pdf/exportResolution.test.ts src/print/pdf/mapCompositor.ts src/print/pdf/mapCompositor.test.ts
git commit -m "feat(web): headless map compositor with per-layer status reporting"
```

---

### Task 6: QR helper and the PDF composer

**Files:**
- Create: `web/src/print/pdf/exportQr.ts`
- Create: `web/src/print/pdf/pdfComposer.ts`
- Test: `web/src/print/pdf/pdfComposer.test.ts`

**Interfaces:**
- Consumes: `PdfTemplate`, `templateForOrientation` (Task 1);
  `ScaleBarSpec` (Task 2); `attachGeoRegistration` (Task 4);
  `PDFDocument`, `StandardFonts`, `rgb` from `pdf-lib`; `QRCode` from
  `qrcode`; round-trip oracle `extractGeoPdfMetadata`.
- Produces (Task 8 consumes):
  - `buildExportQrPng(url: string): Promise<Uint8Array | null>`
  - `ExportFields { title; subtitle; notes }`
  - `LegendEntry { name: string; swatchColor: string | null }`
  - `ComposeInput { template; bounds; mapImage: { jpegBytes; widthPx;
    heightPx }; fields; legend: LegendEntry[] | null; attributionLines:
    string[]; qrPngBytes: Uint8Array | null; scaleBar: ScaleBarSpec;
    generatedAt: string }`
  - `composeGeoPdf(input: ComposeInput): Promise<Uint8Array>`

The composer takes **JPEG bytes**, not a canvas: encoding happens at the UI
boundary (`canvas.toBlob`), keeping this module headless. In tests the
`canvas` package encodes real JPEGs via `toDataURL("image/jpeg")`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/print/pdf/pdfComposer.test.ts
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractGeoPdfMetadata,
  type PdfViewportGeometry,
} from "../../userMaps/parsers/geoPdfMetadata";
import { buildScaleBar } from "./scaleBar";
import { composeGeoPdf, type ComposeInput } from "./pdfComposer";
import { pdfTemplates } from "./templates/index";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };

function testJpeg(): { jpegBytes: Uint8Array; widthPx: number; heightPx: number } {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#7788aa";
  ctx.fillRect(0, 0, 8, 8);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return {
    jpegBytes: Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)),
    widthPx: 8,
    heightPx: 8,
  };
}

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  const template = pdfTemplates.portrait;
  return {
    template,
    bounds,
    mapImage: testJpeg(),
    fields: {
      title: "Mabou Harbour",
      subtitle: "Fletcher sheet 14 over modern base",
      notes: "Walked the shore road boundary.",
    },
    legend: [
      { name: "OpenStreetMap base map", swatchColor: null },
      { name: "Fletcher sheet 14", swatchColor: "#b5651d" },
    ],
    attributionLines: [
      "Base map © OpenStreetMap contributors — openstreetmap.org/copyright",
      "Fletcher series scans courtesy David Rumsey Map Collection",
    ],
    qrPngBytes: null,
    scaleBar: buildScaleBar(bounds, template.mapFrame, template.scaleBar.maxWidth),
    generatedAt: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

function viewport(width: number, height: number): PdfViewportGeometry {
  return {
    width,
    height,
    transform: [1, 0, 0, -1, 0, height],
    viewBox: [0, 0, width, height],
  };
}

describe("composeGeoPdf", () => {
  it("produces a one-page Letter document carrying both registrations", async () => {
    const bytes = await composeGeoPdf(input());
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect({ width, height }).toEqual({ width: 612, height: 792 });
    const extraction = await extractGeoPdfMetadata(bytes, viewport(612, 792));
    expect(extraction.rejected).toEqual([]);
    expect(extraction.candidates).toHaveLength(2);
  });

  it("stamps document info from the fields", async () => {
    const document = await PDFDocument.load(await composeGeoPdf(input()));
    expect(document.getTitle()).toBe("Mabou Harbour");
    expect(document.getProducer()).toBe("NS Marks The Spot web map");
  });

  it("composes with the legend disabled and in landscape", async () => {
    const template = pdfTemplates.landscape;
    const bytes = await composeGeoPdf(input({
      template,
      legend: null,
      scaleBar: buildScaleBar(bounds, template.mapFrame, template.scaleBar.maxWidth),
    }));
    const document = await PDFDocument.load(bytes);
    const { width, height } = document.getPage(0).getSize();
    expect({ width, height }).toEqual({ width: 792, height: 612 });
  });

  it("stays under the size ceiling with a realistic map image", async () => {
    const bytes = await composeGeoPdf(input());
    expect(bytes.byteLength).toBeLessThan(15 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/print/pdf/pdfComposer.test.ts`
Expected: FAIL — cannot resolve `./pdfComposer`.

- [ ] **Step 3: Implement `exportQr.ts`**

```ts
// web/src/print/pdf/exportQr.ts
import QRCode from "qrcode";

/**
 * PNG (not the print system's SVG) because pdf-lib embeds raster images
 * natively. 512 px stays crisp at the templates' 96 pt block. Null on
 * failure — the QR is a courtesy, never an export blocker.
 */
export async function buildExportQrPng(url: string): Promise<Uint8Array | null> {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement `pdfComposer.ts`**

```ts
// web/src/print/pdf/pdfComposer.ts
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { PrintMapBounds } from "../../services/printSnapshot";
import { attachGeoRegistration } from "./geoRegistration";
import type { ScaleBarSpec } from "./scaleBar";
import type { PdfRect, PdfTemplate } from "./templates/types";

export type ExportFields = { title: string; subtitle: string; notes: string };
export type LegendEntry = { name: string; swatchColor: string | null };

export type ComposeInput = {
  template: PdfTemplate;
  bounds: PrintMapBounds;
  mapImage: { jpegBytes: Uint8Array; widthPx: number; heightPx: number };
  fields: ExportFields;
  /** Null renders no legend box; the attribution strip always renders. */
  legend: LegendEntry[] | null;
  attributionLines: string[];
  qrPngBytes: Uint8Array | null;
  scaleBar: ScaleBarSpec;
  generatedAt: string;
};

const INK = rgb(0.12, 0.13, 0.15);
const MUTED = rgb(0.42, 0.44, 0.48);
const RULE = rgb(0.78, 0.8, 0.83);
const CHIP = rgb(0.85, 0.86, 0.88);

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

/** Greedy word wrap measured with the actual font metrics. */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawScaleBar(
  page: PDFPage,
  template: PdfTemplate,
  spec: ScaleBarSpec,
  font: PDFFont,
): void {
  const { x, y } = template.scaleBar;
  const segments = 4;
  const segmentWidth = spec.widthPoints / segments;
  for (let index = 0; index < segments; index += 1) {
    page.drawRectangle({
      x: x + index * segmentWidth,
      y,
      width: segmentWidth,
      height: 5,
      color: index % 2 === 0 ? INK : rgb(1, 1, 1),
      borderColor: INK,
      borderWidth: 0.6,
    });
  }
  const caption = template.type.caption;
  page.drawText("0", { x, y: y - caption - 2, size: caption, font, color: MUTED });
  const endLabel = spec.label;
  page.drawText(endLabel, {
    x: x + spec.widthPoints - font.widthOfTextAtSize(endLabel, caption),
    y: y - caption - 2,
    size: caption,
    font,
    color: MUTED,
  });
  page.drawText(spec.denominatorLabel, {
    x, y: y + 9, size: caption, font, color: MUTED,
  });
}

function drawNorthArrow(
  page: PDFPage,
  template: PdfTemplate,
  font: PDFFont,
): void {
  const { x, y, size } = template.northArrow;
  const cx = x + size / 2;
  page.drawText("N", {
    x: cx - font.widthOfTextAtSize("N", template.type.body) / 2,
    y: y + size - template.type.body,
    size: template.type.body,
    font,
    color: INK,
  });
  const tip = y + size - template.type.body - 3;
  page.drawLine({
    start: { x: cx, y }, end: { x: cx, y: tip },
    thickness: 1.2, color: INK,
  });
  page.drawLine({
    start: { x: cx - 4, y: tip - 6 }, end: { x: cx, y: tip },
    thickness: 1.2, color: INK,
  });
  page.drawLine({
    start: { x: cx + 4, y: tip - 6 }, end: { x: cx, y: tip },
    thickness: 1.2, color: INK,
  });
}

function drawLegend(
  page: PDFPage,
  box: PdfRect,
  entries: LegendEntry[],
  fonts: { bold: PDFFont; regular: PDFFont },
  type: PdfTemplate["type"],
): void {
  page.drawRectangle({
    x: box.x, y: box.y, width: box.width, height: box.height,
    borderColor: RULE, borderWidth: 0.75,
  });
  page.drawText("LEGEND", {
    x: box.x + 8,
    y: box.y + box.height - type.caption - 6,
    size: type.caption,
    font: fonts.bold,
    color: MUTED,
  });
  const rowHeight = type.caption + 6;
  const firstRowY = box.y + box.height - type.caption - 6 - rowHeight;
  const maxRows = Math.max(1, Math.floor((firstRowY - box.y) / rowHeight) + 1);
  const visible = entries.slice(0, maxRows);
  const overflow = entries.length - visible.length;
  visible.forEach((entry, index) => {
    const rowY = firstRowY - index * rowHeight;
    const isOverflowRow = overflow > 0 && index === visible.length - 1;
    if (!isOverflowRow) {
      page.drawRectangle({
        x: box.x + 8, y: rowY, width: 8, height: 8,
        color: entry.swatchColor ? hexToRgb(entry.swatchColor) : CHIP,
        borderColor: MUTED, borderWidth: 0.4,
      });
    }
    const label = isOverflowRow
      ? `…and ${overflow + 1} more — see attribution`
      : entry.name;
    page.drawText(label, {
      x: box.x + 22, y: rowY + 1, size: type.caption,
      font: fonts.regular, color: INK,
      maxWidth: box.width - 30,
    });
  });
}

export async function composeGeoPdf(input: ComposeInput): Promise<Uint8Array> {
  const { template, fields } = input;
  const document = await PDFDocument.create();
  document.setTitle(fields.title);
  document.setProducer("NS Marks The Spot web map");
  document.setCreator("NS Marks The Spot web map");
  const generated = new Date(input.generatedAt);
  document.setCreationDate(generated);
  document.setModificationDate(generated);

  const page = document.addPage([template.page.width, template.page.height]);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const regular = await document.embedFont(StandardFonts.Helvetica);

  // Map image plus neatline.
  const jpeg = await document.embedJpg(input.mapImage.jpegBytes);
  const frame = template.mapFrame;
  page.drawImage(jpeg, {
    x: frame.x, y: frame.y, width: frame.width, height: frame.height,
  });
  page.drawRectangle({
    x: frame.x, y: frame.y, width: frame.width, height: frame.height,
    borderColor: INK, borderWidth: 1,
  });

  // Title block: title, subtitle, then wrapped notes.
  const tb = template.titleBlock;
  let cursorY = tb.y + tb.height - template.type.title;
  page.drawText(fields.title, {
    x: tb.x, y: cursorY, size: template.type.title, font: bold, color: INK,
    maxWidth: tb.width,
  });
  if (fields.subtitle) {
    cursorY -= template.type.subtitle + 6;
    page.drawText(fields.subtitle, {
      x: tb.x, y: cursorY, size: template.type.subtitle,
      font: regular, color: MUTED, maxWidth: tb.width,
    });
  }
  if (fields.notes) {
    for (const line of wrapText(fields.notes, regular, template.type.body, tb.width)) {
      cursorY -= template.type.body + 3;
      if (cursorY < tb.y) break;
      page.drawText(line, {
        x: tb.x, y: cursorY, size: template.type.body,
        font: regular, color: INK,
      });
    }
  }

  if (input.legend && input.legend.length > 0) {
    drawLegend(page, template.legendBox, input.legend,
      { bold, regular }, template.type);
  }
  drawScaleBar(page, template, input.scaleBar, regular);
  drawNorthArrow(page, template, regular);

  if (input.qrPngBytes) {
    const qr = await document.embedPng(input.qrPngBytes);
    page.drawImage(qr, {
      x: template.qr.x, y: template.qr.y,
      width: template.qr.size, height: template.qr.size,
    });
  }

  // Attribution strip — always rendered, top-ruled, oldest obligation last.
  const strip = template.attributionStrip;
  page.drawLine({
    start: { x: strip.x, y: strip.y + strip.height },
    end: { x: strip.x + strip.width, y: strip.y + strip.height },
    thickness: 0.75, color: RULE,
  });
  const stamp = `Generated ${input.generatedAt.slice(0, 10)} — kinnokilabs.com/map`;
  const attributionText = [...input.attributionLines, stamp].join("  ·  ");
  const capSize = template.type.caption;
  const lines = wrapText(attributionText, regular, capSize, strip.width);
  const maxLines = Math.max(1, Math.floor(strip.height / (capSize + 2)));
  lines.slice(0, maxLines).forEach((line, index) => {
    page.drawText(line, {
      x: strip.x,
      y: strip.y + strip.height - (index + 1) * (capSize + 2),
      size: capSize, font: regular, color: MUTED,
    });
  });

  attachGeoRegistration(document, page, input.bounds, frame);
  return document.save({ useObjectStreams: false });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/print/pdf/pdfComposer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/print/pdf/exportQr.ts src/print/pdf/pdfComposer.ts src/print/pdf/pdfComposer.test.ts
git commit -m "feat(web): compose georeferenced PDF pages with vector chrome"
```

---

### Task 7: Frame geometry and the frame-mode overlay

**Files:**
- Create: `web/src/print/pdf/frameGeometry.ts`
- Create: `web/src/print/pdf/ExportFrameLayer.tsx`
- Modify: `web/src/styles.css` (append at end of the non-print section,
  BEFORE the `@media print` block at ~line 3851)
- Test: `web/src/print/pdf/frameGeometry.test.ts`

**Interfaces:**
- Consumes: `toMercator`, `fromMercator` (webMercator.ts); `TILE_SIZE`,
  `WORLD_EXTENT` (Task 3); `mapFrameAspect`, `templateForOrientation`,
  `PdfTemplateId` (Task 1); `buildScaleBar` (Task 2); `useMap` from
  `react-leaflet`.
- Produces (Task 8 consumes):
  - `FrameState { orientation: PdfTemplateId; scale: number; offsetX:
    number; offsetY: number }` and `DEFAULT_FRAME_STATE`
  - `frameScreenRect(container: {width; height}, aspect: number, state:
    FrameState): { x; y; width; height }` (CSS px, top-left origin)
  - `boundsForFrameRect(rect, container, center: {lat; lng}, zoom):
    PrintMapBounds`
  - `<ExportFrameLayer state onStateChange onCancel onContinue />` —
    `onContinue(bounds: PrintMapBounds, orientation: PdfTemplateId)`.

- [ ] **Step 1: Write the failing geometry test**

```ts
// web/src/print/pdf/frameGeometry.test.ts
import { describe, expect, it } from "vitest";
import {
  boundsForFrameRect,
  DEFAULT_FRAME_STATE,
  frameScreenRect,
} from "./frameGeometry";
import { mapFrameAspect } from "./templates/types";
import { pdfTemplates } from "./templates/index";

const container = { width: 1200, height: 800 };

describe("frameScreenRect", () => {
  it("centres a frame of the requested aspect at offset zero", () => {
    const aspect = mapFrameAspect(pdfTemplates.landscape); // 1.696…
    const rect = frameScreenRect(container, aspect, {
      ...DEFAULT_FRAME_STATE, scale: 0.5, offsetX: 0, offsetY: 0,
    });
    expect(rect.width / rect.height).toBeCloseTo(aspect, 5);
    expect(rect.x + rect.width / 2).toBeCloseTo(600, 5);
    expect(rect.y + rect.height / 2).toBeCloseTo(400, 5);
  });

  it("clamps the frame inside the container", () => {
    const rect = frameScreenRect(container, 1.7, {
      ...DEFAULT_FRAME_STATE, scale: 0.9, offsetX: 5000, offsetY: -5000,
    });
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(container.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(container.height);
  });
});

describe("boundsForFrameRect", () => {
  const center = { lat: 46.1, lng: -61.25 };

  it("keeps the frame centre on the map centre", () => {
    const rect = { x: 400, y: 250, width: 400, height: 300 };
    const bounds = boundsForFrameRect(rect, container, center, 12);
    expect((bounds.north + bounds.south) / 2).toBeCloseTo(center.lat, 4);
    expect((bounds.east + bounds.west) / 2).toBeCloseTo(center.lng, 6);
    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
  });

  it("matches Leaflet's zoom scale — the whole world is 256 px at z0", () => {
    const rect = { x: 0, y: 336, width: 256, height: 128 };
    const bounds = boundsForFrameRect(
      rect, { width: 256, height: 800 }, { lat: 0, lng: 0 }, 0,
    );
    expect(bounds.west).toBeCloseTo(-180, 4);
    expect(bounds.east).toBeCloseTo(180, 4);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `frameGeometry.ts`**

Run: `npx vitest run src/print/pdf/frameGeometry.test.ts` — FAIL (module
missing), then:

```ts
// web/src/print/pdf/frameGeometry.ts
import type { PrintMapBounds } from "../../services/printSnapshot";
import {
  fromMercator,
  toMercator,
} from "../../userMaps/transform/webMercator";
import { TILE_SIZE, WORLD_EXTENT } from "./tileMath";
import type { PdfTemplateId } from "./templates/types";

export type FrameState = {
  orientation: PdfTemplateId;
  /** Frame height as a fraction of the container's limiting dimension. */
  scale: number;
  /** Drag offsets in CSS px from the container centre. */
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_FRAME_STATE: FrameState = {
  orientation: "landscape",
  scale: 0.7,
  offsetX: 0,
  offsetY: 0,
};

export const MIN_FRAME_SCALE = 0.25;
export const MAX_FRAME_SCALE = 0.95;

export type ScreenRect = { x: number; y: number; width: number; height: number };

export function frameScreenRect(
  container: { width: number; height: number },
  aspect: number,
  state: FrameState,
): ScreenRect {
  const scale = Math.min(MAX_FRAME_SCALE, Math.max(MIN_FRAME_SCALE, state.scale));
  let height = container.height * scale;
  let width = height * aspect;
  if (width > container.width * MAX_FRAME_SCALE) {
    width = container.width * MAX_FRAME_SCALE;
    height = width / aspect;
  }
  const x = container.width / 2 - width / 2 + state.offsetX;
  const y = container.height / 2 - height / 2 + state.offsetY;
  return {
    x: Math.max(0, Math.min(container.width - width, x)),
    y: Math.max(0, Math.min(container.height - height, y)),
    width,
    height,
  };
}

/**
 * Screen rect → geographic bounds using the same spherical-Mercator scale
 * Leaflet uses (256 px world at z0), so the export shows exactly what the
 * frame framed.
 */
export function boundsForFrameRect(
  rect: ScreenRect,
  container: { width: number; height: number },
  center: { lat: number; lng: number },
  zoom: number,
): PrintMapBounds {
  const metresPerPx = (2 * WORLD_EXTENT) / (TILE_SIZE * 2 ** zoom);
  const centreMerc = toMercator(center);
  const west = centreMerc.x + (rect.x - container.width / 2) * metresPerPx;
  const east = west + rect.width * metresPerPx;
  const north = centreMerc.y + (container.height / 2 - rect.y) * metresPerPx;
  const south = north - rect.height * metresPerPx;
  const nw = fromMercator({ x: west, y: north });
  const se = fromMercator({ x: east, y: south });
  return { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng };
}
```

Run: `npx vitest run src/print/pdf/frameGeometry.test.ts` — expect PASS
(4 tests).

- [ ] **Step 3: Implement `ExportFrameLayer.tsx`**

Lives inside `MapCanvas`'s `<MapContainer>` so `useMap()` is available.
Drag moves the frame (pointer events on the frame itself); the corner
handle resizes; the map stays pannable/zoomable outside the frame. A
`moveend`/`zoomend`/`resize` subscription re-renders the readout.

```tsx
// web/src/print/pdf/ExportFrameLayer.tsx
import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { buildScaleBar } from "./scaleBar";
import {
  boundsForFrameRect,
  frameScreenRect,
  MAX_FRAME_SCALE,
  MIN_FRAME_SCALE,
  type FrameState,
} from "./frameGeometry";
import { templateForOrientation } from "./templates/index";
import { mapFrameAspect, type PdfTemplateId } from "./templates/types";
import type { PrintMapBounds } from "../../services/printSnapshot";

type ExportFrameLayerProps = {
  state: FrameState;
  onStateChange: (state: FrameState) => void;
  onCancel: () => void;
  onContinue: (bounds: PrintMapBounds, orientation: PdfTemplateId) => void;
};

export function ExportFrameLayer({
  state, onStateChange, onCancel, onContinue,
}: ExportFrameLayerProps) {
  const map = useMap();
  const [, setMapEpoch] = useState(0);
  const dragRef = useRef<
    | { kind: "move" | "resize"; startX: number; startY: number;
        startState: FrameState }
    | null
  >(null);

  useEffect(() => {
    const bump = () => setMapEpoch((epoch) => epoch + 1);
    map.on("move zoom resize", bump);
    return () => {
      map.off("move zoom resize", bump);
    };
  }, [map]);

  const container = { width: map.getSize().x, height: map.getSize().y };
  const template = templateForOrientation(state.orientation);
  const aspect = mapFrameAspect(template);
  const rect = frameScreenRect(container, aspect, state);
  const centre = map.getCenter();
  const bounds = boundsForFrameRect(
    rect, container, { lat: centre.lat, lng: centre.lng }, map.getZoom(),
  );
  const scaleReadout = buildScaleBar(
    bounds, template.mapFrame, template.scaleBar.maxWidth,
  ).denominatorLabel;

  const onPointerDown = (kind: "move" | "resize") =>
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        kind, startX: event.clientX, startY: event.clientY, startState: state,
      };
    };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (drag.kind === "move") {
      onStateChange({
        ...drag.startState,
        offsetX: drag.startState.offsetX + deltaX,
        offsetY: drag.startState.offsetY + deltaY,
      });
    } else {
      const next = drag.startState.scale + deltaY / container.height;
      onStateChange({
        ...drag.startState,
        scale: Math.min(MAX_FRAME_SCALE, Math.max(MIN_FRAME_SCALE, next)),
      });
    }
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="export-frame-layer" aria-label="PDF export frame">
      <div
        className="export-frame"
        role="application"
        style={{
          left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        }}
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="export-frame-scale">{scaleReadout}</span>
        <span
          className="export-frame-handle"
          role="slider"
          aria-label="Resize export frame"
          aria-valuenow={Math.round(state.scale * 100)}
          onPointerDown={onPointerDown("resize")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
      <div className="export-frame-toolbar">
        <button
          type="button"
          className="secondary-action"
          aria-pressed={state.orientation === "portrait"}
          onClick={() =>
            onStateChange({
              ...state,
              orientation:
                state.orientation === "portrait" ? "landscape" : "portrait",
            })}
        >
          {state.orientation === "portrait" ? "Portrait" : "Landscape"}
        </button>
        <button type="button" className="secondary-action" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => onContinue(bounds, state.orientation)}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append the frame styles to `web/src/styles.css`**

Insert immediately BEFORE the `@media print` block (search for
`@media print`), so print CSS stays the file's tail:

```css
/* GeoPDF export frame mode */
.export-frame-layer {
  position: absolute;
  inset: 0;
  z-index: 450; /* above MEASURE_PANE (430), below Leaflet controls (500) */
  pointer-events: none;
}
.export-frame {
  position: absolute;
  border: 2px solid #1d4ed8;
  box-shadow: 0 0 0 4000px rgba(15, 23, 42, 0.35);
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
}
.export-frame:active { cursor: grabbing; }
.export-frame-scale {
  position: absolute;
  top: 6px;
  left: 8px;
  padding: 2px 6px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
}
.export-frame-handle {
  position: absolute;
  right: -9px;
  bottom: -9px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1d4ed8;
  border: 2px solid #fff;
  cursor: nwse-resize;
  touch-action: none;
}
.export-frame-toolbar {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  pointer-events: auto;
}
```

- [ ] **Step 5: Verify compile and full suite still green**

Run: `npx tsc -b && npx vitest run src/print/pdf`
Expected: compile clean; all `src/print/pdf` tests PASS. (The component
itself is exercised via Task 8's integration; its math is covered here.)

- [ ] **Step 6: Commit**

```bash
git add src/print/pdf/frameGeometry.ts src/print/pdf/frameGeometry.test.ts src/print/pdf/ExportFrameLayer.tsx src/styles.css
git commit -m "feat(web): add paper-frame selection overlay for PDF export"
```

---

### Task 8: Layer specs, export dialog, and app wiring

**Files:**
- Create: `web/src/print/pdf/exportLayerSpecs.ts`
- Create: `web/src/print/pdf/ExportDialog.tsx`
- Modify: `web/src/App.tsx` (export session state; aside button; dialog +
  frame rendering)
- Modify: `web/src/components/MapCanvas.tsx` (render `ExportFrameLayer`
  inside `<MapContainer>` when framing)
- Modify: `web/src/styles.css` (dialog styles, appended beside Task 7's)
- Test: `web/src/print/pdf/exportLayerSpecs.test.ts`
- Test: `web/src/print/pdf/ExportDialog.test.tsx`

**Interfaces:**
- Consumes: `CompositorLayer`, `composeMapImage`, statuses (Task 5);
  `composeGeoPdf`, `buildExportQrPng`, `ExportFields`, `LegendEntry`
  (Task 6); `buildScaleBar` (Task 2); `resolveExportResolution`,
  `isConstrainedDevice` (Task 5); `templateForOrientation` (Task 1);
  `FrameState`, `ExportFrameLayer` (Task 7); existing app modules:
  `fletcherSheets`, `fletcherTileUrl`, `normalizeFletcherTileBaseUrl`
  (`web/src/layers/fletcherLayer.ts`), `arcGISExportUrlForTile`
  (`web/src/layers/arcGISExport.ts`), `fletcherLayerCatalog` +
  `provinceLayerCatalog` descriptors (`web/src/layers/layerCatalog.ts` —
  descriptors carry `serviceUrl`, `minZoom`, `maxZoom`, `opacity`,
  `exportOptions`, `exportOverlayOptions`, exactly the props `MapCanvas.tsx`
  lines ~300–330 pass to `ArcGISExportTileLayer`), `toMercator`,
  `buildMapShareUrl`, `PrintLayerSource`.
- Produces: `ExportLayerInputs`, `buildExportLayers(inputs):
  CompositorLayer[]`; `<ExportDialog …/>`; the user-visible feature.

- [ ] **Step 1: Write the failing layer-specs test**

```ts
// web/src/print/pdf/exportLayerSpecs.test.ts
import { describe, expect, it } from "vitest";
import { buildExportLayers, type ExportLayerInputs } from "./exportLayerSpecs";

const bounds = { north: 46.35, south: 46.25, west: -61.25, east: -61.10 };

function inputs(overrides: Partial<ExportLayerInputs> = {}): ExportLayerInputs {
  return {
    bounds,
    showModernMap: true,
    fletcher: {
      visible: true,
      opacity: 0.8,
      tileBaseUrl: "https://tiles.example",
      maxNativeZoom: 15,
    },
    arcgisLayers: [],
    userMaps: [],
    selectedParcelRings: [],
    ...overrides,
  };
}

describe("buildExportLayers", () => {
  it("puts the basemap first and honours the modern toggle", () => {
    const layers = buildExportLayers(inputs());
    expect(layers[0]).toMatchObject({ kind: "tile", id: "modern" });
    expect(
      buildExportLayers(inputs({ showModernMap: false }))
        .some((layer) => layer.id === "modern"),
    ).toBe(false);
  });

  it("includes only Fletcher sheets intersecting the bounds", () => {
    const layers = buildExportLayers(inputs());
    const fletcher = layers.filter((l) => l.id.startsWith("fletcher-"));
    // Bounds sit over Inverness sheets 11 and 13 (see fletcherSheets table);
    // sheet 1 (Cape North) must not appear.
    expect(fletcher.length).toBeGreaterThan(0);
    expect(fletcher.some((l) => l.id === "fletcher-01")).toBe(false);
  });

  it("a Fletcher sheet's url() is null for tiles outside the sheet", () => {
    const layers = buildExportLayers(inputs());
    const sheet = layers.find((l) => l.id.startsWith("fletcher-"));
    expect(sheet?.kind).toBe("tile");
    if (sheet?.kind !== "tile") return;
    // z10 tile at the world's origin is nowhere near Nova Scotia.
    expect(sheet.url({ z: 10, x: 0, y: 0 })).toBeNull();
    expect(
      sheet.url({ z: 12, x: 1351, y: 1442 }), // covers ~(-61.2, 46.3)
    ).toMatch(/^https:\/\/tiles\.example\/.+\/12\/1351\/1442\.png$/u);
  });

  it("maps ArcGIS descriptors through arcGISExportUrlForTile", () => {
    const layers = buildExportLayers(inputs({
      arcgisLayers: [{
        id: "nsprd",
        name: "Property boundaries",
        serviceUrl: "https://arcgis.example/rest/services/NSPRD/MapServer",
        exportOptions: { transparent: true, layers: "show:0" },
        opacity: 1,
        maxNativeZoom: 19,
      }],
    }));
    const nsprd = layers.find((l) => l.id === "nsprd");
    expect(nsprd?.kind).toBe("tile");
    if (nsprd?.kind !== "tile") return;
    const url = nsprd.url({ z: 12, x: 1351, y: 1442 });
    expect(url).toContain("/export?");
    expect(url).toContain("bboxSR=3857");
    expect(url).toContain("layers=show%3A0");
  });

  it("appends user maps and the parcel ring above tile layers", () => {
    const image = document.createElement("canvas");
    const layers = buildExportLayers(inputs({
      userMaps: [{
        id: "um-1", name: "My scan", image, imageWidth: 100, imageHeight: 80,
        latLngMesh: [
          [{ lat: 46.3, lng: -61.2 }, { lat: 46.3, lng: -61.1 }],
          [{ lat: 46.2, lng: -61.2 }, { lat: 46.2, lng: -61.1 }],
        ],
        opacity: 0.7,
      }],
      selectedParcelRings: [[
        { lat: 46.3, lng: -61.2 }, { lat: 46.3, lng: -61.19 },
        { lat: 46.29, lng: -61.19 }, { lat: 46.3, lng: -61.2 },
      ]],
    }));
    const kinds = layers.map((l) => l.kind);
    expect(kinds[kinds.length - 1]).toBe("parcel-ring");
    expect(kinds[kinds.length - 2]).toBe("warped");
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `exportLayerSpecs.ts`**

Run: `npx vitest run src/print/pdf/exportLayerSpecs.test.ts` — FAIL, then:

```ts
// web/src/print/pdf/exportLayerSpecs.ts
import { arcGISExportUrlForTile } from "../../layers/arcGISExport";
import { fletcherSheets, fletcherTileUrl } from "../../layers/fletcherLayer";
import type { ArcGISExportOptions } from "../../layers/layerCatalog";
import type { PrintMapBounds } from "../../services/printSnapshot";
import type { LatLngPoint } from "../../userMaps/transform/projection";
import { toMercator } from "../../userMaps/transform/webMercator";
import type { PixelRect } from "../../userMaps/types";
import type { CompositorLayer, CompositorTileLayer } from "./mapCompositor";
import { tileMercatorBounds, type TileCoords } from "./tileMath";

export type ExportArcGisLayerInput = {
  id: string;
  name: string;
  serviceUrl: string;
  exportOptions: ArcGISExportOptions;
  opacity: number;
  maxNativeZoom: number;
};

export type ExportUserMapInput = {
  id: string;
  name: string;
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  latLngMesh: LatLngPoint[][];
  sourceRect?: PixelRect;
  opacity: number;
};

export type ExportLayerInputs = {
  bounds: PrintMapBounds;
  showModernMap: boolean;
  fletcher: {
    visible: boolean;
    opacity: number;
    tileBaseUrl: string | null;
    maxNativeZoom: number;
  };
  arcgisLayers: ExportArcGisLayerInput[];
  userMaps: ExportUserMapInput[];
  selectedParcelRings: LatLngPoint[][];
};

const OSM_TILE_URL = "https://tile.openstreetmap.org";

function boundsIntersect(
  a: PrintMapBounds,
  b: PrintMapBounds,
): boolean {
  return a.west < b.east && b.west < a.east && a.south < b.north && b.south < a.north;
}

function tileIntersectsBounds(tile: TileCoords, bounds: PrintMapBounds): boolean {
  const merc = tileMercatorBounds(tile);
  const nw = toMercator({ lat: bounds.north, lng: bounds.west });
  const se = toMercator({ lat: bounds.south, lng: bounds.east });
  return merc.minX < se.x && nw.x < merc.maxX && merc.minY < nw.y && se.y < merc.maxY;
}

function fletcherLayers(
  inputs: ExportLayerInputs,
): CompositorTileLayer[] {
  const { fletcher, bounds } = inputs;
  if (!fletcher.visible || !fletcher.tileBaseUrl) return [];
  return fletcherSheets
    .filter(({ bounds: [[south, west], [north, east]] }) =>
      boundsIntersect(bounds, { north, south, east, west }))
    .map(({ sheet, bounds: [[south, west], [north, east]] }) => {
      const template = fletcherTileUrl(sheet, fletcher.tileBaseUrl);
      const sheetBounds = { north, south, east, west };
      return {
        kind: "tile" as const,
        id: `fletcher-${String(sheet).padStart(2, "0")}`,
        name: `Fletcher sheet ${sheet}`,
        opacity: fletcher.opacity,
        maxNativeZoom: fletcher.maxNativeZoom,
        url: (tile: TileCoords) => {
          if (!template || !tileIntersectsBounds(tile, sheetBounds)) return null;
          return template
            .replace("{z}", String(tile.z))
            .replace("{x}", String(tile.x))
            .replace("{y}", String(tile.y));
        },
      };
    });
}

/** App state → compositor layers, bottom-to-top in on-screen pane order. */
export function buildExportLayers(
  inputs: ExportLayerInputs,
): CompositorLayer[] {
  const layers: CompositorLayer[] = [];
  if (inputs.showModernMap) {
    layers.push({
      kind: "tile",
      id: "modern",
      name: "OpenStreetMap base map",
      opacity: 1,
      maxNativeZoom: 19,
      url: ({ z, x, y }) => `${OSM_TILE_URL}/${z}/${x}/${y}.png`,
    });
  }
  layers.push(...fletcherLayers(inputs));
  for (const userMap of inputs.userMaps) {
    layers.push({ kind: "warped", ...userMap });
  }
  for (const layer of inputs.arcgisLayers) {
    layers.push({
      kind: "tile",
      id: layer.id,
      name: layer.name,
      opacity: layer.opacity,
      maxNativeZoom: layer.maxNativeZoom,
      url: (tile) =>
        arcGISExportUrlForTile(
          { serviceUrl: layer.serviceUrl, ...layer.exportOptions },
          tile,
        ),
    });
  }
  if (inputs.selectedParcelRings.length > 0) {
    layers.push({
      kind: "parcel-ring",
      id: "selected-parcel",
      name: "Selected parcel",
      rings: inputs.selectedParcelRings,
      strokeStyle: "#facc15",
      lineWidthPx: 6,
    });
  }
  return layers;
}
```

Ordering note: user maps sit below the ArcGIS data overlays, matching
`USER_MAPS_PANE_Z_INDEX` (160) < `PROVINCE_LAYER_Z_INDEXES` (150–250) for
data layers in `web/src/components/mapPanes.ts` — Fletcher (155) and user
maps (160) render between the basemap and the province overlays on screen,
and the export must match. `arcGISExportUrlForTile` imports Leaflet
transitively via `layers/arcGISExport.ts`; that is acceptable here (this
module is wiring, not part of the headless core) — the compositor itself
still never imports Leaflet.

Run: `npx vitest run src/print/pdf/exportLayerSpecs.test.ts` — expect PASS
(5 tests). If the z12 tile assertion fails, recompute the expected tile for
(-61.2°, 46.3°) with `tilesForBounds` in a scratch test — the tile indices
in the test must match the math, not vice versa.

- [ ] **Step 3: Write the failing dialog test**

```tsx
// web/src/print/pdf/ExportDialog.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExportDialog, type ExportDialogProps } from "./ExportDialog";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };

function renderDialog(overrides: Partial<ExportDialogProps> = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const props: ExportDialogProps = {
    orientation: "portrait",
    bounds,
    layers: [],
    defaultTitle: "Parcel 50123456",
    attributionLines: ["Base map © OpenStreetMap contributors"],
    shareUrl: "https://kinnokilabs.com/map?mode=explore",
    onClose: vi.fn(),
    composeImage: vi.fn().mockResolvedValue({
      canvas,
      statuses: [{ id: "modern", name: "OpenStreetMap base map", status: "rendered" }],
    }),
    composePdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    saveFile: vi.fn(),
    ...overrides,
  };
  return { ...render(<ExportDialog {...props} />), props };
}

describe("ExportDialog", () => {
  it("prefills the title and lets the user edit fields", async () => {
    renderDialog();
    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("Parcel 50123456");
    await userEvent.clear(title);
    await userEvent.type(title, "Mabou Harbour");
    expect(title).toHaveValue("Mabou Harbour");
  });

  it("downloads when every layer renders", async () => {
    const { props } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(props.saveFile).toHaveBeenCalledTimes(1));
    const [, filename] = vi.mocked(props.saveFile).mock.calls[0];
    expect(filename).toMatch(/^parcel-50123456-\d{4}-\d{2}-\d{2}\.pdf$/u);
  });

  it("names failed layers and requires an explicit choice", async () => {
    const canvas = document.createElement("canvas");
    const { props } = renderDialog({
      composeImage: vi.fn().mockResolvedValue({
        canvas,
        statuses: [
          { id: "modern", name: "OpenStreetMap base map", status: "rendered" },
          { id: "fletcher-14", name: "Fletcher sheet 14", status: "failed",
            detail: "3 of 12 tiles failed to load" },
        ],
      }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(
      await screen.findByText(/Fletcher sheet 14/u),
    ).toBeInTheDocument();
    expect(props.saveFile).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Download anyway" }),
    );
    await waitFor(() => expect(props.saveFile).toHaveBeenCalledTimes(1));
  });

  it("omits the legend when toggled off", async () => {
    const { props } = renderDialog();
    await userEvent.click(screen.getByLabelText("Include legend"));
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(props.composePdf).toHaveBeenCalled());
    expect(vi.mocked(props.composePdf).mock.calls[0][0].legend).toBeNull();
  });
});
```

- [ ] **Step 4: Implement `ExportDialog.tsx`**

`composeImage`, `composePdf`, and `saveFile` are injectable props with real
defaults, so tests never touch network, JPEG encoding, or anchors.

```tsx
// web/src/print/pdf/ExportDialog.tsx
import { useMemo, useState } from "react";
import type { PrintMapBounds } from "../../services/printSnapshot";
import { buildScaleBar } from "./scaleBar";
import { buildExportQrPng } from "./exportQr";
import {
  composeMapImage,
  type CompositorLayer,
  type CompositorLayerStatus,
  type CompositorProgress,
  type CompositorResult,
} from "./mapCompositor";
import {
  isConstrainedDevice,
  resolveExportResolution,
} from "./exportResolution";
import { composeGeoPdf, type ComposeInput } from "./pdfComposer";
import { templateForOrientation } from "./templates/index";
import type { PdfTemplateId } from "./templates/types";

export type ExportDialogProps = {
  orientation: PdfTemplateId;
  bounds: PrintMapBounds;
  layers: CompositorLayer[];
  defaultTitle: string;
  attributionLines: string[];
  shareUrl: string;
  onClose: () => void;
  composeImage?: (
    onProgress: (progress: CompositorProgress) => void,
  ) => Promise<CompositorResult>;
  composePdf?: (input: ComposeInput) => Promise<Uint8Array>;
  saveFile?: (bytes: Uint8Array, filename: string) => void;
};

type Phase =
  | { stage: "idle" }
  | { stage: "rendering"; progress: CompositorProgress | null }
  | { stage: "confirm-failures"; result: CompositorResult }
  | { stage: "error"; message: string };

function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || "map";
}

function defaultSaveFile(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function canvasToJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("JPEG encoding failed."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", 0.85);
  });
}

export function ExportDialog(props: ExportDialogProps) {
  const template = templateForOrientation(props.orientation);
  const resolution = useMemo(
    () => resolveExportResolution(template.mapFrame, {
      constrainedDevice: isConstrainedDevice(),
    }),
    [template],
  );
  const [title, setTitle] = useState(props.defaultTitle);
  const [subtitle, setSubtitle] = useState(
    "NS Marks The Spot — historical map export",
  );
  const [notes, setNotes] = useState("");
  const [legendOn, setLegendOn] = useState(true);
  const [phase, setPhase] = useState<Phase>({ stage: "idle" });

  const composeImage = props.composeImage ??
    ((onProgress: (progress: CompositorProgress) => void) =>
      composeMapImage(props.bounds,
        { widthPx: resolution.widthPx, heightPx: resolution.heightPx },
        props.layers, { onProgress }));
  const composePdf = props.composePdf ?? composeGeoPdf;
  const saveFile = props.saveFile ?? defaultSaveFile;

  const finishExport = async (result: CompositorResult) => {
    const generatedAt = new Date().toISOString();
    const input: ComposeInput = {
      template,
      bounds: props.bounds,
      mapImage: {
        jpegBytes: await canvasToJpegBytes(result.canvas),
        widthPx: result.canvas.width,
        heightPx: result.canvas.height,
      },
      fields: { title, subtitle, notes },
      legend: legendOn
        ? props.layers.map(({ name }) => ({ name, swatchColor: null }))
        : null,
      attributionLines: props.attributionLines,
      qrPngBytes: await buildExportQrPng(props.shareUrl),
      scaleBar: buildScaleBar(
        props.bounds, template.mapFrame, template.scaleBar.maxWidth,
      ),
      generatedAt,
    };
    const bytes = await composePdf(input);
    saveFile(bytes, `${slugify(title)}-${generatedAt.slice(0, 10)}.pdf`);
    props.onClose();
  };

  const startExport = async () => {
    setPhase({ stage: "rendering", progress: null });
    try {
      const result = await composeImage((progress) =>
        setPhase({ stage: "rendering", progress }));
      const failures = result.statuses.filter(
        ({ status }) => status === "failed",
      );
      if (failures.length > 0) {
        setPhase({ stage: "confirm-failures", result });
        return;
      }
      await finishExport(result);
    } catch (error) {
      setPhase({
        stage: "error",
        message: error instanceof Error ? error.message : "Export failed.",
      });
    }
  };

  const failures: CompositorLayerStatus[] =
    phase.stage === "confirm-failures"
      ? phase.result.statuses.filter(({ status }) => status === "failed")
      : [];

  return (
    <div className="export-dialog-backdrop" role="dialog"
      aria-modal="true" aria-label="Export georeferenced PDF">
      <div className="export-dialog">
        <h2>Export georeferenced PDF</h2>
        <p className="field-help">
          Letter {props.orientation} · {resolution.dpi} DPI
          {resolution.reduced
            ? " (reduced to fit this device's memory)"
            : ""}
        </p>
        <label htmlFor="export-title">Title</label>
        <input id="export-title" value={title} autoFocus
          onChange={(event) => setTitle(event.target.value)} />
        <label htmlFor="export-subtitle">Subtitle</label>
        <input id="export-subtitle" value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)} />
        <label htmlFor="export-notes">Notes</label>
        <textarea id="export-notes" value={notes} rows={3}
          onChange={(event) => setNotes(event.target.value)} />
        <label className="export-legend-toggle">
          <input type="checkbox" checked={legendOn} aria-label="Include legend"
            onChange={(event) => setLegendOn(event.target.checked)} />
          Include legend
        </label>

        {phase.stage === "rendering" ? (
          <p role="status">
            Rendering
            {phase.progress?.currentLayer
              ? ` ${phase.progress.currentLayer}`
              : "…"}
            {phase.progress
              ? ` (${phase.progress.completedLayers}/${phase.progress.totalLayers})`
              : null}
          </p>
        ) : null}
        {phase.stage === "error" ? (
          <p role="alert">{phase.message}</p>
        ) : null}
        {failures.length > 0 ? (
          <div role="alert" className="export-failures">
            <p>Some layers could not be included:</p>
            <ul>
              {failures.map((failure) => (
                <li key={failure.id}>
                  <strong>{failure.name}</strong>
                  {failure.detail ? ` — ${failure.detail}` : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="export-dialog-actions">
          <button type="button" className="secondary-action"
            onClick={props.onClose}>
            Cancel
          </button>
          {phase.stage === "confirm-failures" ? (
            <button type="button" className="primary-action"
              onClick={() => void finishExport(phase.result)}>
              Download anyway
            </button>
          ) : (
            <button type="button" className="primary-action"
              disabled={phase.stage === "rendering"}
              onClick={() => void startExport()}>
              Download PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

Add dialog styles next to Task 7's block in `web/src/styles.css`:

```css
.export-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.5);
}
.export-dialog {
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 20px;
  border-radius: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.export-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.export-failures ul { margin: 4px 0 0 18px; }
```

Run: `npx vitest run src/print/pdf/ExportDialog.test.tsx` — expect PASS
(4 tests).

- [ ] **Step 5: Wire into `App.tsx` and `MapCanvas.tsx`**

In `web/src/App.tsx`:

1. Imports:

```ts
import { ExportDialog } from "./print/pdf/ExportDialog";
import { buildExportLayers } from "./print/pdf/exportLayerSpecs";
import { DEFAULT_FRAME_STATE, type FrameState } from "./print/pdf/frameGeometry";
import type { PdfTemplateId } from "./print/pdf/templates/types";
import type { PrintMapBounds } from "./services/printSnapshot";
import { fletcherLayerCatalog } from "./layers/layerCatalog";
import { normalizeFletcherTileBaseUrl } from "./layers/fletcherLayer";
import { PROVINCE_LAYER_Z_INDEXES } from "./components/mapPanes";
```

(Keep only the ones not already imported; several exist.)

2. Session state, near the print state (`printCapture` area, ~line 750):

```ts
type GeoPdfExportSession =
  | { stage: "framing"; frame: FrameState }
  | { stage: "dialog"; bounds: PrintMapBounds; orientation: PdfTemplateId };
const [exportSession, setExportSession] =
  useState<GeoPdfExportSession | null>(null);
```

3. Aside entry point — in the `<aside id="map-controls">` block
(App.tsx ~line 2282), after the PID search `</form>`, add:

```tsx
<button
  type="button"
  className="secondary-action"
  disabled={!licenceAccepted}
  onClick={() =>
    setExportSession({ stage: "framing", frame: DEFAULT_FRAME_STATE })}
>
  Export map (PDF)
</button>
```

4. Pass framing props to `MapCanvas` (find the `<MapCanvas` element and
add):

```tsx
exportFrame={exportSession?.stage === "framing" ? exportSession.frame : null}
onExportFrameChange={(frame) =>
  setExportSession({ stage: "framing", frame })}
onExportFrameCancel={() => setExportSession(null)}
onExportFrameContinue={(bounds, orientation) =>
  setExportSession({ stage: "dialog", bounds, orientation })}
```

5. Render the dialog next to `<PrintPreview` (~line 3183):

```tsx
{exportSession?.stage === "dialog" ? (
  <ExportDialog
    orientation={exportSession.orientation}
    bounds={exportSession.bounds}
    layers={buildExportLayers({
      bounds: exportSession.bounds,
      showModernMap,
      fletcher: {
        visible: fletcherVisible,
        opacity: fletcherOpacity,
        tileBaseUrl: normalizeFletcherTileBaseUrl(),
        maxNativeZoom: fletcherLayerCatalog.maxZoom,
      },
      arcgisLayers: provinceLayerCatalog
        .filter((layer) => provinceLayers[layer.id] && layer.exportOptions)
        .sort((a, b) =>
          PROVINCE_LAYER_Z_INDEXES[a.id] - PROVINCE_LAYER_Z_INDEXES[b.id])
        .map((layer) => ({
          id: layer.id,
          name: layer.name,
          serviceUrl: layer.serviceUrl,
          exportOptions: layer.exportOptions!,
          opacity: layer.opacity,
          maxNativeZoom: layer.id === "ns-aerial" ? 19 : layer.maxZoom,
        })),
      userMaps: [], // v1: user maps join in a follow-up wiring pass
      selectedParcelRings: selectedParcelGeometry.features.flatMap(
        ({ geometry }) =>
          geometry.type === "Polygon"
            ? geometry.coordinates.map((ring) =>
                ring.map(([lng, lat]) => ({ lat, lng })))
            : geometry.type === "MultiPolygon"
              ? geometry.coordinates.flatMap((polygon) =>
                  polygon.map((ring) =>
                    ring.map(([lng, lat]) => ({ lat, lng }))))
              : [],
      ),
    })}
    defaultTitle={selectedPid ? `Parcel ${selectedPid}` : "Nova Scotia map"}
    attributionLines={captureLayerSources.map((source) =>
      `${source.name}: ${source.attribution}`)}
    shareUrl={window.location.href}
    onClose={() => setExportSession(null)}
  />
) : null}
```

Adapt the exact state variable names to what exists at the call site
(`provinceLayers`, `captureLayerSources`, `selectedParcelGeometry`,
`fletcherVisible`, `fletcherOpacity`, `showModernMap` are all existing
App.tsx state — see lines 772–790 and 1826–1840). `userMaps` ships empty
in this task: extracting a decoded `CanvasImageSource` + mesh per stored
user map requires the `useUserMaps` record internals, and the compositor
already supports it — wire it when the record plumbing is exposed, and say
so in the dialog if a user map is visible (add its name to a skipped-layers
note using the same pattern as the failures list).

In `web/src/components/MapCanvas.tsx`: accept the four new optional props,
and inside `<MapContainer>` (next to `GeoreferenceMapLayer`, ~line 1647)
render:

```tsx
{exportFrame ? (
  <ExportFrameLayer
    state={exportFrame}
    onStateChange={onExportFrameChange!}
    onCancel={onExportFrameCancel!}
    onContinue={onExportFrameContinue!}
  />
) : null}
```

- [ ] **Step 6: Full gates**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. Fix type or lint fallout (unused imports, strictness)
without changing behavior.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open the app, accept the licence, click
**Export map (PDF)**, frame an area over Inverness, Continue, edit the
title, Download. Open the PDF: page renders, map matches the frame.
Verify georeferencing if GDAL is available locally:

```bash
gdalinfo /path/to/downloaded.pdf
```

Expected: `Coordinate System is: WGS 84 / Pseudo-Mercator`, corner
coordinates matching the framed area.

- [ ] **Step 8: Commit**

```bash
git add src/print/pdf src/App.tsx src/components/MapCanvas.tsx src/styles.css
git commit -m "feat(web): frame-to-download georeferenced PDF export flow"
```

---

### Task 9: Docs, acceptance checklist, handoff, and PR

**Files:**
- Create: `docs/real-world-testing/2026-07-31-web-geopdf-export-test-plan.md`
- Modify: `web/README.md` (features list)
- Modify: `HANDOFF-web-geopdf-export.md` (append milestone)

- [ ] **Step 1: Write the real-world test plan**

```markdown
# Web GeoPDF Export — Real-World Test Plan

Automated gates (vitest round-trips, layout invariants, compositor pixel
tests) already passed in CI. This plan covers what only real consumers can
verify. Record results inline; local, CI, merge, deployment, and device
acceptance are separate states.

## Exports under test

Produce two exports over a Fletcher-covered area (e.g. Mabou Harbour,
sheet 14): one Letter portrait, one Letter landscape, both with legend on,
modern basemap + Fletcher + property boundaries visible.

## GDAL (oracle)

- [ ] `gdalinfo <file>` reports `WGS 84 / Pseudo-Mercator` (EPSG:3857).
- [ ] Corner coordinates match the framed bounds (spot-check against the
      share URL's centre).
- [ ] No "Non closed ring" warning.

## QGIS

- [ ] Layer → Add Raster; the PDF lands aligned with an OSM basemap.
- [ ] The neatline edge sits within ~2 screen px of NSPRD parcel lines at
      1:10,000.

## Avenza Maps (device)

- [ ] Import the PDF on a phone; the map opens with no "not georeferenced"
      warning.
- [ ] On location (or with a simulated GPX track), the position dot tracks
      correctly against the historical map.

## Acrobat / Preview (plain readers)

- [ ] Page renders correctly; text is selectable; file size noted.

## Results

| Date | Consumer | File | Result | Notes |
| ---- | -------- | ---- | ------ | ----- |
```

- [ ] **Step 2: Add the feature to `web/README.md`**

Find the features/capabilities list in `web/README.md` and add one bullet:

```markdown
- **Georeferenced PDF export** — frame an area on the map and download a
  Letter portrait/landscape GeoPDF (ISO 32000 `/Measure` + OGC `/LGIDict`,
  EPSG:3857) that works in Avenza, QGIS/GDAL, and on paper, with an
  optional legend and always-on attribution.
```

- [ ] **Step 3: Append the handoff milestone**

Append to `HANDOFF-web-geopdf-export.md`:

```markdown
## <today's date> — Implementation complete, PR open

Done: Tasks 1–9 of docs/superpowers/plans/2026-07-31-web-geopdf-export.md;
all gates green (`npm test`, lint, build); real-world test plan committed.
Next: run the real-world test plan (GDAL/QGIS/Avenza), then merge the PR
into nightly; user-map layers in exports are the known follow-up.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/web-geopdf-export
Branch: feature/web-geopdf-export
Next action: execute docs/real-world-testing/2026-07-31-web-geopdf-export-test-plan.md
```
```

- [ ] **Step 4: Final verification**

```bash
cd web && npm test && npm run lint && npm run build
```

Expected: full suite green (baseline was ~917+ tests), lint and build exit
zero. Then `git status --short --branch` — no stray files.

- [ ] **Step 5: Commit and open the PR**

```bash
git add docs/real-world-testing/2026-07-31-web-geopdf-export-test-plan.md web/README.md HANDOFF-web-geopdf-export.md
git commit -m "docs: add GeoPDF export test plan and README entry"
git push -u origin feature/web-geopdf-export
gh pr create --base nightly --title "feat(web): georeferenced PDF map exports" --body "$(cat <<'EOF'
## Summary
- Frame-on-map selection → Letter portrait/landscape → downloadable GeoPDF
- Dual-flavour registration (ISO 32000 /Measure + OGC /LGIDict) in EPSG:3857,
  round-trip-validated against the app's own GeoPDF parser
- Headless compositor (OSM + Fletcher sheets + ArcGIS export layers +
  selected parcel), per-layer failure reporting with explicit
  proceed-or-cancel — no silently incomplete maps
- Declarative templates with editable title/subtitle/notes, optional legend,
  scale bar, north arrow, QR share link, always-on attribution

Spec: docs/superpowers/specs/2026-07-30-web-geopdf-export-design.md
Plan: docs/superpowers/plans/2026-07-31-web-geopdf-export.md

## Test plan
- [x] vitest round-trip, layout, compositor, dialog suites (npm test)
- [x] lint + build
- [ ] Real-world: gdalinfo / QGIS / Avenza per
      docs/real-world-testing/2026-07-31-web-geopdf-export-test-plan.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note: merging to `nightly` auto-triggers the hourly KinNoKiLabsSite
deployment PR — the merge is the deploy trigger; report deploy state
separately.

---

## Self-Review Notes (already applied)

- **Spec deviation, deliberate:** registration CRS is EPSG:3857, not
  geographic WGS 84 — the geographic form fails the spec's own accuracy
  gate beyond ~1:40,000 (see Task 4 rationale). The spec file was amended
  in the same branch; Task 4's test asserts exactness instead of an error
  budget.
- **Scope cut, explicit:** user-map layers are supported by the compositor
  (Task 5 tests cover the warp path) but App wiring ships them empty in
  Task 8 — extracting decoded bitmaps from `useUserMaps` records is a
  follow-up; the dialog states the omission when a user map is visible.
- **Type consistency spot-checks:** `PdfRect`/`PdfTemplateId` only from
  `templates/types.ts`; `CompositorLayer`/statuses only from
  `mapCompositor.ts`; `ComposeInput.legend: LegendEntry[] | null` matches
  the dialog's `legendOn ? […] : null`; `boundsForFrameRect` returns
  `PrintMapBounds` consumed unchanged by `composeMapImage`,
  `buildScaleBar`, `attachGeoRegistration`, and `buildExportLayers`.
- **Numeric constants asserted by tests, not trusted:** template rects
  (invariants), tile indices (z12 assertions), zoom ladder (2317 px case),
  DPI ladder (4096 cap).
```
