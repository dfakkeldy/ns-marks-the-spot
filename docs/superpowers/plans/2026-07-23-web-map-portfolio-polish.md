# Web Map Portfolio Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `web/` map look professional at every zoom, present its data
rigor as hierarchy instead of volume, and frame it as the maintainer's
portfolio piece.

**Architecture:** Three sequential bundles (C portfolio framing → A
cartographic polish → B information architecture) inside the existing React 19
+ react-leaflet 5 + Vite app. No new runtime dependencies; Province-rendered
layers are recomposed by zoom, never restyled. All licence/attribution text
stays permanently visible.

**Tech Stack:** React 19, TypeScript 5.9, Leaflet 1.9 / react-leaflet 5,
Vitest 4 + Testing Library, vanilla CSS (`web/src/styles.css`).

**Spec:** `docs/superpowers/specs/2026-07-23-web-map-portfolio-polish-design.md`

## Global Constraints

- No new npm dependencies (dev or runtime).
- Never remove or hide licence/attribution text: OGL-NS, PVSC, Service NS,
  Province restricted-services attribution stay always-visible; restyling
  weight only.
- All money stays integer cents; PIDs/AANs stay strings (existing rule).
- Conventional Commits; each task commits separately.
- Gates after every task: `npm test`, `npm run lint` (in `web/`). `npm run
  build` at least at each bundle boundary.
- Working dir for all commands: `web/` unless stated.
- `README.md` + `web/README.md` describe behavior; when a task changes
  behavior they update in that same task.

---

### Task 1: Share metadata in index.html (Bundle C)

**Files:**
- Modify: `web/index.html`
- Test: `web/src/indexHtml.test.ts`

**Interfaces:**
- Produces: `<meta property="og:image" content="social-card.png">` — Task 4
  creates that asset at `web/public/social-card.png`.

- [ ] **Step 1: Write failing tests** — append to the existing
  `describe("web document metadata")` block in `web/src/indexHtml.test.ts`:

```ts
  it("titles the document for strangers, not for the repo split", () => {
    expect(indexHtml).toContain(
      "<title>NS Marks The Spot — Nova Scotia parcel &amp; tax-sale map</title>",
    );
  });

  it("declares Open Graph and Twitter card tags for link unfurls", () => {
    expect(indexHtml).toMatch(
      /<meta\s+property="og:title"\s+content="NS Marks The Spot — Nova Scotia parcel &amp; tax-sale map"/,
    );
    expect(indexHtml).toMatch(/<meta\s+property="og:type"\s+content="website"/);
    expect(indexHtml).toMatch(
      /<meta\s+property="og:description"\s+content="[^"]{40,}"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+property="og:image"\s+content="social-card.png"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+name="twitter:card"\s+content="summary_large_image"/,
    );
    expect(indexHtml).toMatch(
      /<meta\s+name="twitter:image"\s+content="social-card.png"/,
    );
  });
```

- [ ] **Step 2: Run to verify failure** — `npm test -- indexHtml`
  Expected: 2 new tests FAIL (title/meta not found).

- [ ] **Step 3: Edit `web/index.html`** — replace the `<title>` line and add
  below the existing `description` meta (keep the existing description meta;
  reuse its text for `og:description`):

```html
    <title>NS Marks The Spot — Nova Scotia parcel &amp; tax-sale map</title>
    <meta property="og:title" content="NS Marks The Spot — Nova Scotia parcel &amp; tax-sale map" />
    <meta property="og:type" content="website" />
    <meta property="og:description" content="Search Nova Scotia parcels by PID or civic address, map municipal tax-sale notices against live parcel geometry, and export source-linked evidence notes." />
    <meta property="og:image" content="social-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="social-card.png" />
```

  Also update the existing `name="description"` meta to the same richer
  sentence used for `og:description`.

- [ ] **Step 4: Run** — `npm test -- indexHtml` → PASS. `npm run lint` → clean.

- [ ] **Step 5: Commit** — `feat(web): add share metadata and outward-facing title`

---

### Task 2: Affirmative header/beta copy (Bundle C)

**Files:**
- Modify: `web/src/App.tsx` (header JSX ~line 2458; rail beta card ~line 2993)
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Update any App tests** that assert the old strings ("iPhone
  beta not open yet", "Sign up for the beta", "Help shape the iPhone beta").
  Search: `grep -n "beta" web/src/App.test.tsx`. Point them at the new copy
  below; add an assertion that the header no longer contains "not open yet".

- [ ] **Step 2: Run to verify failure** — `npm test -- App.test` → updated
  tests FAIL against current copy.

- [ ] **Step 3: Edit `web/src/App.tsx`.** Header (`.offline-nav`):

```tsx
        <div className="offline-nav">
          <span>iPhone app in development</span>
          <a className="header-action" href={BETA_SIGNUP_URL}>
            Get launch updates
          </a>
        </div>
```

  Rail beta card (`#offline-heading` section):

```tsx
              <h2 id="offline-heading">The iPhone app is coming</h2>
              <p>
                NS Marks The Spot for iPhone is in development, with offline
                Fletcher sheets as the marquee feature. Join the list to hear
                when TestFlight opens and help shape what ships.
              </p>
              <a href={BETA_SIGNUP_URL}>Get launch updates</a>
```

  (Keep the surrounding markup/classes unchanged. The mailto URL constant is
  untouched.)

- [ ] **Step 4: Run** — `npm test -- App.test` → PASS.

- [ ] **Step 5: Commit** — `feat(web): reword beta messaging to affirmative voice`

---

### Task 3: About dialog (Bundle C)

**Files:**
- Modify: `web/src/App.tsx` (new component + `aboutOpen` state + header link +
  footer button), `web/src/styles.css`
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Produces: `function AboutDialog({ onClose }: { onClose: () => void })` in
  `App.tsx` (moved to `components/` only if Task 12 touches it — it does not).

- [ ] **Step 1: Write failing tests** (App.test.tsx, follow the file's
  existing licence-dialog test setup — licence pre-accepted via localStorage):

```tsx
describe("about dialog", () => {
  it("opens from the header, explains the method, and closes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "About this map" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /about ns marks the spot/i,
    });
    expect(dialog).toHaveTextContent(/SHA-256/);
    expect(dialog).toHaveTextContent(/fail-closed|stay unknown/i);
    expect(dialog).toHaveTextContent(/browser location never leaves/i);
    expect(dialog).toHaveTextContent(/twenty years|20 years/i);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: /about ns marks the spot/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- App.test` → FAIL (no
  About button).

- [ ] **Step 3: Implement.** In `App.tsx` add state
  `const [aboutOpen, setAboutOpen] = useState(false);` near the other dialog
  state. New component beside `LicenceDialog`:

```tsx
function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop">
      <section
        className="licence-dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <div className="licence-mark" aria-hidden="true">NS</div>
        <h2 id="about-title">About NS Marks The Spot</h2>
        <p>
          An open-source map for screening Nova Scotia parcels: search by PID
          or civic address, see municipal tax-sale notices on live parcel
          geometry, and read the mapped evidence for any property. It is the
          online companion to a native iPhone app in development.
        </p>
        <h3>How it treats data</h3>
        <ul className="about-method">
          <li>
            Every official notice is pinned by a SHA-256 receipt; datasets
            cannot drift silently.
          </li>
          <li>
            Unknown outcomes stay unknown. Results are never inferred, so a
            dated record cannot masquerade as a current offering.
          </li>
          <li>
            An empty result and a failed source are reported differently —
            absence of evidence is never presented as evidence of absence.
          </li>
          <li>
            Assessed-owner names are never ingested, and browser location
            never leaves the browser.
          </li>
        </ul>
        <h3>Who makes it</h3>
        <p>
          I have made maps for twenty years, mostly for forestry in Nova
          Scotia. This app is where that practice meets modern web
          engineering: every layer names its source, scale, and licence, the
          way a printed map sheet carries its legend and survey notes.
        </p>
        <p className="about-links">
          <a
            href="https://github.com/dfakkeldy/ns-marks-the-spot"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
          {" · "}
          <a href="mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot">
            Email the maker
          </a>
        </p>
        <div className="dialog-actions">
          <button className="primary-action" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
```

  Render it in the App return alongside the licence dialog:
  `{aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}`.

  Header: inside `.offline-nav`, before the status span:

```tsx
          <button
            className="text-button header-about"
            type="button"
            onClick={() => setAboutOpen(true)}
          >
            About this map
          </button>
```

  Footer: add the same trigger next to the GitHub link:

```tsx
          <button
            className="text-button"
            type="button"
            onClick={() => setAboutOpen(true)}
          >
            About this map
          </button>
```

  CSS (`styles.css`, after the `.licence-dialog` rules):

```css
.about-dialog h3 {
  margin: 18px 0 6px;
  font-family: "Fraunces", Georgia, serif;
  font-size: 1.05rem;
}

.about-dialog .about-method {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  font-size: 0.9rem;
}

.header-about {
  color: var(--white);
}
```

  (If `.text-button` on the dark header lacks contrast, `.header-about`
  overrides its color as above.)

- [ ] **Step 4: Run** — `npm test -- App.test` → PASS. `npm run lint` → clean.

- [ ] **Step 5: Commit** — `feat(web): add About dialog telling the method and maker story`

---

### Task 4: Social card asset (Bundle C)

**Files:**
- Create: `marketing/social-card.svg` (repo root `marketing/`), `web/public/social-card.png`
- Modify: `web/README.md` (generation + absolute-URL note)

- [ ] **Step 1: Author `marketing/social-card.svg`** (1200×630, app palette,
  no external fonts required at rasterize time — use the local font stack with
  serif fallback):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#12343b"/>
  <rect x="0" y="586" width="1200" height="44" fill="#0a4f5c"/>
  <path d="M950 150c-72 0-130 58-130 130 0 101 130 195 130 195s130-94 130-195c0-72-58-130-130-130z" fill="#e7a86b"/>
  <circle cx="950" cy="280" r="50" fill="#fbf6ea"/>
  <text x="80" y="270" font-family="Fraunces, Georgia, serif" font-size="92" font-weight="700" fill="#fbf6ea">NS Marks The Spot</text>
  <text x="80" y="350" font-family="Inter, Helvetica, Arial, sans-serif" font-size="40" fill="#a8c6c0">Nova Scotia parcels, tax sales &amp; map evidence</text>
  <text x="80" y="430" font-family="IBM Plex Mono, Menlo, monospace" font-size="28" fill="#85b5ff">PID · AAN · NSPRD · source-linked receipts</text>
</svg>
```

- [ ] **Step 2: Rasterize to `web/public/social-card.png`:**

```bash
qlmanage -t -s 1200 -o /tmp/cardout marketing/social-card.svg
mv /tmp/cardout/social-card.svg.png web/public/social-card.png
sips -g pixelWidth -g pixelHeight web/public/social-card.png
```

  Expected: 1200×630. If qlmanage mangles it, fallback: open the SVG in the
  Browser pane at 1200×630, draw to a canvas, export `toDataURL("image/png")`,
  and base64-decode to the same path. Verify the PNG visually before commit.

- [ ] **Step 3: Document in `web/README.md`** (new short subsection "Share
  card"): the SVG source path, the `qlmanage` command, and: "The deployed site
  should rewrite `og:image`/`twitter:image` to an absolute URL at its
  canonical origin; scrapers that require absolute URLs ignore the relative
  form."

- [ ] **Step 4: Run** — `npm run build` → succeeds; confirm `dist/` contains
  `social-card.png` at its root.

- [ ] **Step 5: Commit** — `feat(web): add social share card asset`

---

### Task 5: Zoom-gate aerial, roads, water in the catalog (Bundle A)

**Files:**
- Modify: `web/src/layers/layerCatalog.ts` (three `minZoom` values + metadata
  strings), `README.md`, `web/README.md`
- Test: `web/src/layers/layerCatalog.test.ts`

**Interfaces:**
- Consumes: `ArcGISMapLayer` in `MapCanvas.tsx` already enforces
  `layer.minZoom` on its tile layers and reports
  `{ status: "zoom", minZoom }` → the rail shows "Zoom to N+ to load". No
  MapCanvas change needed.

- [ ] **Step 1: Write failing tests** (layerCatalog.test.ts, follow existing
  style):

```ts
  it("gates imagery and 1:10k line work to zooms where they are legible", () => {
    const byId = Object.fromEntries(
      provinceLayerCatalog.map((layer) => [layer.id, layer]),
    );
    expect(byId["ns-aerial"].minZoom).toBe(10);
    expect(byId["roads"].minZoom).toBe(10);
    expect(byId["water-features"].minZoom).toBe(10);
    expect(byId["waterfalls"].minZoom).toBe(7);
  });
```

- [ ] **Step 2: Run** — `npm test -- layerCatalog` → FAIL (0/7/7 today).

- [ ] **Step 3: Edit `layerCatalog.ts`:** `ns-aerial.minZoom: 0 → 10`
  (keep `maxZoom: 23`, `maxNativeZoom` handling untouched), `roads.minZoom:
  7 → 10`, `water-features.minZoom: 7 → 10`. Update the affected descriptor
  strings so the rail stays truthful:
  - ns-aerial `webCaveat`: "Online imagery · zoom 10+"
  - roads `webCaveat`: "Highways to trails · culverts close up · zoom 10+"
  - water-features `webCaveat`: "Rivers, lakes, wetlands & more · zoom 10+"

- [ ] **Step 4: Run** — `npm test` (full suite; App tests may pin old zoom
  text — update any that assert the three old caveat strings/zoom ranges).
  `npm run lint`.

- [ ] **Step 5: Update docs** — `README.md` (web section: aerial/roads/water
  bullets mention the overview gate) and `web/README.md` "Native layer parity"
  bullets: aerial "streams … from zoom 10, overzooming its last useful native
  scale"; roads/water gain "from zoom 10". Add one sentence to the parity
  intro: "Web-only zoom gates keep Province exports at legible scales; the
  native parity list is unchanged."

- [ ] **Step 6: Commit** — `feat(web): gate aerial and 1:10k line layers to legible zooms`

---

### Task 6: Modern map defaults on (Bundle A)

**Files:**
- Modify: `web/src/App.tsx:1561` (initial `showModernMap`), `README.md`,
  `web/README.md`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write/adjust tests.** Find existing default-composition
  assertions: `grep -n "Modern map" web/src/App.test.tsx`. Update to the new
  default and add:

```tsx
  it("defaults the modern basemap on so overview zooms have ground", () => {
    render(<App />);
    expect(
      screen.getByRole("checkbox", { name: "Modern map" }),
    ).toBeChecked();
  });
```

- [ ] **Step 2: Run** — `npm test -- App.test` → new/updated tests FAIL.

- [ ] **Step 3: Edit `App.tsx:1561`:**

```tsx
  const [showModernMap, setShowModernMap] = useState(
    hasSharedLayers ? initialShareState.layerIds.includes("modern") : true,
  );
```

  (Share links keep full control: a link without `modern` still restores it
  off.)

- [ ] **Step 4: Run** — `npm test` full → PASS (fix any other pinned
  default-layer lists). `npm run lint`.

- [ ] **Step 5: Update docs** — README/web README sentences that say "keeps
  Modern Map off" now say the default composition is Modern map + gated
  Province layers, and why (overview basemap under zoom-gated imagery).

- [ ] **Step 6: Commit** — `feat(web): default the modern basemap on`

---

### Task 7: Tax-sale overview markers (Bundle A)

**Files:**
- Create: `web/src/services/parcelMarkers.ts`,
  `web/src/services/parcelMarkers.test.ts`
- Modify: `web/src/components/MapCanvas.tsx`
- Test: `web/src/components/MapCanvas.test.tsx`

**Interfaces:**
- Produces: `representativeParcelPoints(parcels: NsprdFeatureCollection, pids: Set<string>): Array<{ pid: string; latitude: number; longitude: number }>`
  — one point per PID, at the centroid of the largest outer ring among that
  PID's features. Consumed only by `MapCanvas.tsx`.
- Produces: `OVERVIEW_MARKER_MAX_ZOOM = 11` (markers render while
  `zoom <= 11`, i.e. below the zoom-12 polygon-legibility threshold in the
  spec).

- [ ] **Step 1: Write failing unit tests** (`parcelMarkers.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { representativeParcelPoints } from "./parcelMarkers";
import type { NsprdFeatureCollection } from "./nsprd";

const square = (
  pid: string,
  originLng: number,
  originLat: number,
  size: number,
): GeoJSON.Feature<GeoJSON.Geometry, { PID: string }> => ({
  type: "Feature",
  properties: { PID: pid },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [originLng, originLat],
      [originLng + size, originLat],
      [originLng + size, originLat + size],
      [originLng, originLat + size],
      [originLng, originLat],
    ]],
  },
});

describe("representativeParcelPoints", () => {
  it("returns one centroid per listed PID, ignoring unlisted parcels", () => {
    const parcels = {
      type: "FeatureCollection",
      features: [square("11111111", -61, 46, 0.01), square("22222222", -60, 45, 0.01)],
    } as unknown as NsprdFeatureCollection;
    const points = representativeParcelPoints(parcels, new Set(["11111111"]));
    expect(points).toHaveLength(1);
    expect(points[0].pid).toBe("11111111");
    expect(points[0].longitude).toBeCloseTo(-60.995, 3);
    expect(points[0].latitude).toBeCloseTo(46.005, 3);
  });

  it("uses the largest polygon when a PID has several features", () => {
    const parcels = {
      type: "FeatureCollection",
      features: [
        square("11111111", -61, 46, 0.001),
        square("11111111", -60.5, 45.5, 0.05),
      ],
    } as unknown as NsprdFeatureCollection;
    const [point] = representativeParcelPoints(parcels, new Set(["11111111"]));
    expect(point.longitude).toBeCloseTo(-60.475, 3);
    expect(point.latitude).toBeCloseTo(45.525, 3);
  });

  it("handles MultiPolygon geometry", () => {
    const multi = {
      type: "Feature",
      properties: { PID: "33333333" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[-61, 46], [-60.99, 46], [-60.99, 46.01], [-61, 46.01], [-61, 46]]],
          [[[-59, 44], [-58.9, 44], [-58.9, 44.1], [-59, 44.1], [-59, 44]]],
        ],
      },
    };
    const parcels = {
      type: "FeatureCollection",
      features: [multi],
    } as unknown as NsprdFeatureCollection;
    const [point] = representativeParcelPoints(parcels, new Set(["33333333"]));
    expect(point.longitude).toBeCloseTo(-58.95, 2);
    expect(point.latitude).toBeCloseTo(44.05, 2);
  });
});
```

- [ ] **Step 2: Run** — `npm test -- parcelMarkers` → FAIL (module missing).

- [ ] **Step 3: Implement `parcelMarkers.ts`:**

```ts
import type { NsprdFeatureCollection } from "./nsprd";

export const OVERVIEW_MARKER_MAX_ZOOM = 11;

type RepresentativePoint = {
  pid: string;
  latitude: number;
  longitude: number;
};

type Ring = readonly (readonly number[])[];

function ringAreaAndCentroid(ring: Ring): {
  area: number;
  latitude: number;
  longitude: number;
} {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (twiceArea === 0) {
    const [x, y] = ring[0];
    return { area: 0, longitude: x, latitude: y };
  }
  return {
    area: Math.abs(twiceArea / 2),
    longitude: cx / (3 * twiceArea),
    latitude: cy / (3 * twiceArea),
  };
}

export function representativeParcelPoints(
  parcels: NsprdFeatureCollection,
  pids: Set<string>,
): RepresentativePoint[] {
  const best = new Map<
    string,
    { area: number; latitude: number; longitude: number }
  >();
  for (const feature of parcels.features) {
    const pid = feature.properties?.PID;
    if (!pid || !pids.has(pid)) {
      continue;
    }
    const { geometry } = feature;
    const outerRings: Ring[] =
      geometry.type === "Polygon"
        ? [geometry.coordinates[0]]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates.map((polygon) => polygon[0])
          : [];
    for (const ring of outerRings) {
      if (!ring || ring.length < 4) {
        continue;
      }
      const candidate = ringAreaAndCentroid(ring);
      const current = best.get(pid);
      if (!current || candidate.area > current.area) {
        best.set(pid, candidate);
      }
    }
  }
  return [...best.entries()].map(([pid, point]) => ({
    pid,
    latitude: point.latitude,
    longitude: point.longitude,
  }));
}
```

- [ ] **Step 4: Run** — `npm test -- parcelMarkers` → PASS.

- [ ] **Step 5: Render markers in `MapCanvas.tsx`.** New internal component
  (near the tax-sale GeoJSON component, reusing the existing zoom-tracking
  pattern with `useMapEvents`):

```tsx
function TaxSaleOverviewMarkers({
  parcels,
  taxSalePids,
  historicalTaxSalePids,
  showTaxSale,
  showHistoricalTaxSales,
  selectedPid,
  onSelectPid,
}: Pick<
  MapCanvasProps,
  | "parcels"
  | "taxSalePids"
  | "historicalTaxSalePids"
  | "showTaxSale"
  | "showHistoricalTaxSales"
  | "selectedPid"
  | "onSelectPid"
>) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const currentPoints = useMemo(
    () =>
      showTaxSale
        ? representativeParcelPoints(parcels, taxSalePids)
        : [],
    [parcels, showTaxSale, taxSalePids],
  );
  const historicalPoints = useMemo(
    () =>
      showHistoricalTaxSales
        ? representativeParcelPoints(parcels, historicalTaxSalePids)
        : [],
    [historicalTaxSalePids, parcels, showHistoricalTaxSales],
  );

  if (zoom > OVERVIEW_MARKER_MAX_ZOOM) {
    return null;
  }

  const markerStyle = (
    selected: boolean,
    color: string,
  ): PathOptions => ({
    color: "#ffffff",
    weight: selected ? 3 : 1.5,
    fillColor: color,
    fillOpacity: selected ? 1 : 0.85,
  });

  return (
    <>
      {historicalPoints.map((point) => (
        <CircleMarker
          key={`historical-${point.pid}`}
          center={[point.latitude, point.longitude]}
          radius={point.pid === selectedPid ? 9 : 7}
          pathOptions={markerStyle(point.pid === selectedPid, "#5a4385")}
          eventHandlers={{ click: () => onSelectPid(point.pid) }}
        />
      ))}
      {currentPoints.map((point) => (
        <CircleMarker
          key={`current-${point.pid}`}
          center={[point.latitude, point.longitude]}
          radius={point.pid === selectedPid ? 9 : 7}
          pathOptions={markerStyle(point.pid === selectedPid, "#be4d3c")}
          eventHandlers={{ click: () => onSelectPid(point.pid) }}
        />
      ))}
    </>
  );
}
```

  Import `representativeParcelPoints, OVERVIEW_MARKER_MAX_ZOOM` from
  `../services/parcelMarkers`. Mount `<TaxSaleOverviewMarkers …/>` inside
  `MapContainer` next to the parcel GeoJSON, passing through the same props.

- [ ] **Step 6: MapCanvas test** (follow existing MapCanvas.test.tsx render
  helpers): render with a small parcel collection, `showTaxSale`, initial
  zoom ≤ 11 → expect a `path.leaflet-interactive` count matching listed PIDs;
  simulate `map.setZoom(13)` (or re-render with a parcel-zoom
  initialPosition) → markers gone. Reuse the file's existing map-instance
  access pattern rather than inventing a new one.

- [ ] **Step 7: Run** — `npm test -- MapCanvas parcelMarkers` → PASS; full
  `npm test` + `npm run lint`.

- [ ] **Step 8: Commit** — `feat(web): mark listed parcels at overview zooms`

---

### Task 8: Scale bar and position readout (Bundle A)

**Files:**
- Modify: `web/src/components/MapCanvas.tsx`, `web/src/styles.css`
- Test: `web/src/components/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: react-leaflet's `ScaleControl`; existing `onPositionChange`
  wiring stays untouched.

- [ ] **Step 1: Failing tests** (MapCanvas.test.tsx):

```tsx
  it("shows a metric+imperial scale bar", () => {
    renderMapCanvas(); // existing helper
    expect(document.querySelector(".leaflet-control-scale")).not.toBeNull();
  });

  it("shows a copyable centre/zoom readout", async () => {
    renderMapCanvas();
    const readout = await screen.findByRole("button", {
      name: /copy map centre coordinates/i,
    });
    expect(readout.textContent).toMatch(/Z \d+ · -?\d+\.\d{5}, -?\d+\.\d{5}/);
  });
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement.** In `MapCanvas.tsx` add
  `import { ScaleControl } from "react-leaflet"` (extend the existing import)
  and inside `MapContainer`: `<ScaleControl position="bottomleft" />` plus a
  new component:

```tsx
function PositionReadout() {
  const map = useMap();
  const [position, setPosition] = useState(() => ({
    center: map.getCenter(),
    zoom: map.getZoom(),
  }));
  const [copied, setCopied] = useState(false);
  useMapEvents({
    moveend: () => setPosition({ center: map.getCenter(), zoom: map.getZoom() }),
    zoomend: () => setPosition({ center: map.getCenter(), zoom: map.getZoom() }),
  });
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const label = `Z ${position.zoom} · ${position.center.lat.toFixed(5)}, ${position.center.lng.toFixed(5)}`;
  return (
    <button
      type="button"
      className="position-readout"
      aria-label="Copy map centre coordinates"
      onClick={() => {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard
            .writeText(
              `${position.center.lat.toFixed(5)}, ${position.center.lng.toFixed(5)}`,
            )
            .then(() => setCopied(true), () => setCopied(false));
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
```

  Mount `<PositionReadout />` inside `MapContainer`. CSS:

```css
.position-readout {
  position: absolute;
  z-index: 800;
  bottom: 10px;
  left: 10px;
  transform: translateY(-26px);
  padding: 3px 8px;
  color: var(--muted);
  font-family: "IBM Plex Mono", Menlo, monospace;
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--line);
  border-radius: 4px;
  cursor: copy;
}

.leaflet-control-scale-line {
  color: var(--chart-ink);
  font-family: "IBM Plex Mono", Menlo, monospace;
  background: rgba(255, 255, 255, 0.75);
  border-color: rgba(18, 52, 59, 0.55);
}

@media (max-width: 720px) {
  .position-readout {
    display: none;
  }
}
```

  (Adjust the readout's offset so it sits directly above the scale bar
  without overlap — verify visually in Step 5.)

- [ ] **Step 4: Run** — `npm test -- MapCanvas` → PASS; `npm run lint`.

- [ ] **Step 5: Visual check** in the dev server (desktop + mobile widths):
  scale bar and readout legible over both OSM and aerial; no collision with
  the location button or attribution.

- [ ] **Step 6: Commit** — `feat(web): add scale bar and copyable position readout`

---

### Task 9: Transient toast auto-dismiss (Bundle A)

**Files:**
- Modify: `web/src/App.tsx` (parcel lookup message effect)
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Failing test** (fake timers, following any existing timer
  tests in the file):

```tsx
  it("auto-dismisses the parcel-selected toast", async () => {
    vi.useFakeTimers();
    try {
      // render, select a parcel via the property list (existing helper flow)
      // assert "PID 50065424 selected." visible
      await act(() => vi.advanceTimersByTime(6_000));
      expect(screen.queryByText(/selected\.$/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run** — FAIL (message persists).

- [ ] **Step 3: Implement** in `App.tsx` (near the other effects):

```tsx
  const TRANSIENT_MESSAGE_DURATION_MS = 6_000;

  useEffect(() => {
    if (!parcelLookupMessage || !/selected\.$/.test(parcelLookupMessage)) {
      return;
    }
    const timer = window.setTimeout(
      () => setParcelLookupMessage(null),
      TRANSIENT_MESSAGE_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [parcelLookupMessage]);
```

  Only the success "… selected." message auto-clears; error and guidance
  messages persist. (Match the actual state setter/name in the file —
  `setParcelLookupMessage` exists at ~line 2125.)

- [ ] **Step 4: Run** — `npm test -- App.test` → PASS.

- [ ] **Step 5: Commit** — `fix(web): auto-dismiss the parcel-selected toast`

**Bundle A boundary:** run `npm run build`; then a full visual pass in the
browser: initial load (clean OSM + red markers), zoom into a parcel (aerial
fades in at 10, boundaries at 14), select via marker click.

---

### Task 10: Layer metadata disclosures (Bundle B)

**Files:**
- Modify: `web/src/App.tsx` (`LayerMetadata`), `web/src/styles.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Failing tests:** assert each layer row still shows its
  runtime status but hides "Source date:" until its "Source & scale"
  disclosure opens:

```tsx
  it("collapses layer provenance behind a disclosure", async () => {
    const user = userEvent.setup();
    render(<App />);
    const railRow = screen.getByText("NS Aerial").closest(".layer-row")!;
    expect(within(railRow).getByText(/^Off$|^Ready|^Zoom to/)).toBeVisible();
    expect(within(railRow).queryByText(/Source date:/)).not.toBeVisible();
    await user.click(within(railRow).getByText("Source & scale"));
    expect(within(railRow).getByText(/Source date:/)).toBeVisible();
  });
```

  (jsdom reports `<details>` content visibility once the `open` attribute
  toggles; if `toBeVisible` proves unreliable for `details` in the installed
  jsdom, assert on the `open` attribute instead.)

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** — `LayerMetadata` becomes:

```tsx
  return (
    <span className="layer-metadata">
      <small className={`layer-runtime ${status.status}`}>
        {layerRuntimeLabel(checked, status)}
      </small>
      <details className="layer-provenance">
        <summary>Source &amp; scale</summary>
        <small>Source date: {sourceDate}</small>
        <small>Scale: {scale}</small>
        <small>Coverage: {coverage}</small>
        <small>Zoom: {minZoom}–{maxZoom}</small>
      </details>
    </span>
  );
```

  CSS:

```css
.layer-provenance summary {
  color: var(--muted);
  font-size: 0.72rem;
  cursor: pointer;
  list-style-position: inside;
}

.layer-provenance[open] summary {
  margin-bottom: 2px;
}

.layer-provenance small {
  display: block;
}
```

  A `<details>` inside a `<label>` can swallow toggle clicks into the
  checkbox: intercept with `onClick={(event) => event.stopPropagation()}` on
  the `<details>` element if the existing `.layer-row` label wiring misfires
  (verify by test and by hand).

- [ ] **Step 4: Run** — `npm test` full (several tests likely reach metadata
  text — update them to open the disclosure first). `npm run lint`.

- [ ] **Step 5: Commit** — `feat(web): collapse layer provenance behind disclosures`

---

### Task 11: Parcel sheet typographic hierarchy (Bundle B)

**Files:**
- Modify: `web/src/App.tsx` (`ParcelInspector` dl rows + section footnote
  class application), `web/src/styles.css`
- Test: `web/src/styles.test.ts`, `web/src/App.test.tsx`

- [ ] **Step 1: Decide the split in code terms.** In `.parcel-facts`, values
  are `<dd>`; add `className="fact-figure"` to identifier/figure rows only:
  PID, Mapped area, Mapped buildings, Lien, AAN, the financial amount row,
  Source retrieved. Prose rows (Municipality, Event, Official location,
  Redemption, Listing status) get no class and render proportional,
  left-aligned.

- [ ] **Step 2: Failing style tests** (styles.test.ts follows a
  string-assertion pattern on the stylesheet — mirror it):

```ts
  it("left-aligns prose facts and reserves mono for figures", () => {
    expect(styles).toMatch(/\.parcel-facts dd\s*{[^}]*font-family:\s*"Inter"/s);
    expect(styles).toMatch(/\.parcel-facts dd\.fact-figure\s*{[^}]*IBM Plex Mono/s);
    expect(styles).toMatch(/\.section-footnote\s*{[^}]*font-size:\s*0\.72rem/s);
  });
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement CSS** (adjust the existing `.parcel-facts` rules;
  keep the grid layout):

```css
.parcel-facts dd {
  margin: 0;
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  text-align: left;
}

.parcel-facts dd.fact-figure {
  font-family: "IBM Plex Mono", Menlo, monospace;
  text-align: right;
}

.section-footnote {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.45;
}
```

  Apply `.fact-figure` in `ParcelInspector` per Step 1. Then sweep the
  inspector sections (`AssessmentDetails`, `CivicAddressDetails`,
  `FloodHazardDetails`, `ParcelResourceDetails`, `MappedContextDetails`,
  building-count note): add `section-footnote` to the existing source/licence
  paragraph class lists (e.g. `className="assessment-source section-footnote"`)
  — additive classes, no text or element changes. Warning call-out boxes keep
  their tint and adopt the footnote font size.

- [ ] **Step 5: Run** — `npm test` full; fix any selector-based assertions.
  `npm run lint`.

- [ ] **Step 6: Visual check** — parcel sheet on desktop + mobile: values
  scan cleanly; attribution readable but subordinate; nothing hidden.

- [ ] **Step 7: Commit** — `feat(web): give the parcel sheet typographic hierarchy`

---

### Task 12: Mechanical component extraction (Bundle B)

**Files:**
- Create: `web/src/components/ParcelInspector.tsx`,
  `web/src/components/LayerRows.tsx`
- Modify: `web/src/App.tsx` (delete moved code, import instead)

**Interfaces:**
- `ParcelInspector.tsx` exports `ParcelInspector` (same props) and moves with
  it: `AssessmentDetails`, `FloodHazardDetails`, `CivicAddressDetails`,
  `MappedContextDetails`, `MappedFeatureList`, `ParcelResourceDetails`,
  `HistoricalOutcomeDetails`, plus the constants/helpers only they use
  (`COASTAL_HAZARD_MAP_URL`, `COASTAL_HAZARD_LICENCE_URL`,
  `PUBLISHED_RIVER_FLOOD_URL`, label helpers as needed).
- `LayerRows.tsx` exports `LayerToggle`, `ResourceLayerToggle`,
  `HydroPilotLayerToggle`, `FloodHazardLayerToggle`, `LayerMetadata`,
  `layerRuntimeLabel`, `RoadLegend`, `HydroPotentialLegend` (same
  signatures).

- [ ] **Step 1: Move code verbatim** — cut the listed components/constants
  from `App.tsx` into the two new files; add the imports each file needs
  (types from services/layers modules — follow the compiler); export the two
  entry components + anything App still references; import them in `App.tsx`.
  **No logic edits.** If a moved piece closes over App-scope state, leave it
  in `App.tsx` and note it in the commit message.

- [ ] **Step 2: Run** — `npm test` full → identical pass count as before the
  move; `npm run lint`; `npm run build`.

- [ ] **Step 3: Commit** — `refactor(web): extract parcel inspector and layer rows from App`

---

### Task 13: Docs sweep, gates, review, PR

**Files:**
- Modify: `README.md`, `web/README.md`, `plan.md` (only if a listed task is
  now done), spec/plan checkboxes.

- [ ] **Step 1: Docs sweep** — reread the README web section and
  `web/README.md` top-to-bottom against the shipped behavior: default
  composition, zoom gates, About dialog, share metadata/social card, scale
  bar/readout, markers, disclosures. Fix every stale sentence. The receipts
  and licence sections are untouched by design.

- [ ] **Step 2: Full gates from `web/`** — `npm test`, `npm run lint`,
  `npm run build` → all clean.

- [ ] **Step 3: Visual verification** — dev server: license dialog → accept →
  overview (OSM + markers) → marker click → parcel sheet (hierarchy) → rail
  disclosures → About dialog → mobile viewport pass. Screenshot the before
  states' worst offenders (overview patchwork) vs after.

- [ ] **Step 4: Code review** — dispatch the code-reviewer subagent on the
  full branch diff; address findings.

- [ ] **Step 5: Ship** — `git fetch origin && git rebase origin/nightly`,
  push with `--force-with-lease` if needed, `gh pr create --base nightly` with
  a behavior-changes-first description (defaults changed: modern map on,
  aerial/roads/water gated to z10; rollback notes per commit).
