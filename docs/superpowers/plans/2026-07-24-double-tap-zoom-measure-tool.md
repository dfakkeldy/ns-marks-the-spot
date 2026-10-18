# Double-Tap Zoom + Measure Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double-tap/double-click zooms the web map without selecting a PID, and a measure mode reads out distances (m/km) and areas (ha + acres).

**Architecture:** A 250 ms deferred click in `ParcelIdentifyController` lets `dblclick` cancel parcel identification. A new pure `geodesy.ts` service does haversine distance and spherical-excess area. A self-contained `MeasureTool` component (controls + headless capture + shape rendering + readout) plugs into `MapCanvas` using the existing controller-component pattern; `MapCanvas` suspends parcel selection while measuring.

**Tech Stack:** React 19 + react-leaflet 5 + Leaflet 1.9.4, Vitest + Testing Library (react-leaflet is mocked in component tests), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-07-24-double-tap-zoom-measure-tool-design.md`

## Global Constraints

- No new npm dependencies.
- All commands run from `web/`: `npm test` (vitest run), `npm run lint`, `npm run build`.
- Conventional Commits; commit after each task.
- Canadian spelling in identifiers to match the codebase: `metres`, `squareMetres`.
- Measurements never appear in `mapShareState` or print export; `MeasureTool` must not render in print mode.
- `MapCanvas.test.tsx` mocks react-leaflet with hoisted capture objects; follow that pattern, do not render real Leaflet in component tests (`mapPanes.test.ts` is the only real-Leaflet test).

---

### Task 1: Debounced parcel identify

**Files:**
- Modify: `web/src/components/MapCanvas.tsx` (ParcelIdentifyController, ~line 1113)
- Modify: `web/src/components/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: existing `PROPERTY_BOUNDARY_MIN_ZOOM` import, `useMapEvents` from react-leaflet.
- Produces: `export const IDENTIFY_CLICK_DELAY_MS = 250` from `MapCanvas.tsx` (Task 4's tests import it; App does not).

- [ ] **Step 1: Extend the react-leaflet test mock to capture dblclick**

In `MapCanvas.test.tsx`, the hoisted `mapEventHandlers` (line ~39) currently captures only `click`. Replace with:

```tsx
const mapEventHandlers = vi.hoisted(() => ({
  click: undefined as
    | ((event: { latlng: { lat: number; lng: number } }) => void)
    | undefined,
  dblclick: undefined as (() => void) | undefined,
}));
```

Update the `useMapEvents` mock (line ~155) so later `useMapEvents` callers without a `click` handler (e.g. `PositionReadout`) don't clobber a captured one:

```tsx
  useMapEvents: (handlers: {
    click?: (event: { latlng: { lat: number; lng: number } }) => void;
    dblclick?: () => void;
  }) => {
    if (handlers.click) {
      mapEventHandlers.click = handlers.click;
    }
    if (handlers.dblclick) {
      mapEventHandlers.dblclick = handlers.dblclick;
    }
    return mapMock;
  },
```

Add `mapEventHandlers.dblclick = undefined;` next to each existing `mapEventHandlers.click = undefined;` reset (lines ~626 and ~1671).

Note: `ParcelIdentifyController` renders after `PositionReadout` inside `MapCanvas`, so its handlers are the captured ones.

- [ ] **Step 2: Update the existing identify test and add debounce tests (failing)**

In the `"MapCanvas parcel discovery"` describe block, rewrite the existing test `"identifies map-tapped parcels only once property boundaries are visible"` to use fake timers, and add two new tests. The render props are unchanged from the current test — reuse them verbatim (helper extraction optional):

```tsx
  it("identifies map-tapped parcels only once property boundaries are visible", () => {
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    render(/* unchanged MapCanvas props from the current version of this test */);

    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).not.toHaveBeenCalled();

    mapMock.getZoom.mockReturnValue(14);
    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    expect(onIdentifyParcel).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).toHaveBeenCalledWith(46.059488, -61.414138);
  });

  it("waits out the double-click window before identifying", () => {
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    mapMock.getZoom.mockReturnValue(14);
    render(/* same props */);

    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.05, lng: -61.41 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS - 1));
    expect(onIdentifyParcel).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onIdentifyParcel).toHaveBeenCalledTimes(1);
  });

  it("never identifies a parcel from a double-click zoom", () => {
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    mapMock.getZoom.mockReturnValue(14);
    render(/* same props */);

    // Browser order for a double-click: click, click, dblclick.
    act(() => {
      mapEventHandlers.click?.({ latlng: { lat: 46.05, lng: -61.41 } });
      mapEventHandlers.click?.({ latlng: { lat: 46.05, lng: -61.41 } });
      mapEventHandlers.dblclick?.();
    });
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS * 2));
    expect(onIdentifyParcel).not.toHaveBeenCalled();
  });
```

Import `IDENTIFY_CLICK_DELAY_MS` alongside `MapCanvas` at the top of the test file. `afterEach` already calls `vi.useRealTimers()`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && npx vitest run src/components/MapCanvas.test.tsx`
Expected: FAIL — `IDENTIFY_CLICK_DELAY_MS` not exported, and the identify assertions fail (identify currently fires synchronously).

- [ ] **Step 4: Implement the debounce**

In `MapCanvas.tsx`, export the constant near the top of the file (next to other module constants):

```tsx
/**
 * A double-click arrives as click → click → dblclick, so a parcel identify
 * must wait long enough for a dblclick to cancel it. The delay hides inside
 * the NSPRD network lookup that follows, so single taps feel unchanged.
 */
export const IDENTIFY_CLICK_DELAY_MS = 250;
```

Replace `ParcelIdentifyController` (line ~1113):

```tsx
function ParcelIdentifyController({
  enabled,
  onIdentifyParcel,
}: {
  enabled: boolean;
  onIdentifyParcel: MapCanvasProps["onIdentifyParcel"];
}) {
  const map = useMap();
  const pendingClick = useRef<number | null>(null);

  const cancelPendingClick = useCallback(() => {
    if (pendingClick.current !== null) {
      window.clearTimeout(pendingClick.current);
      pendingClick.current = null;
    }
  }, []);

  useEffect(() => cancelPendingClick, [cancelPendingClick]);

  useMapEvents({
    click: ({ latlng }) => {
      cancelPendingClick();
      if (enabled && map.getZoom() >= PROPERTY_BOUNDARY_MIN_ZOOM) {
        pendingClick.current = window.setTimeout(() => {
          pendingClick.current = null;
          onIdentifyParcel(latlng.lat, latlng.lng);
        }, IDENTIFY_CLICK_DELAY_MS);
      }
    },
    dblclick: cancelPendingClick,
  });

  return null;
}
```

(`useCallback`, `useEffect`, `useRef` are already imported in this file.)

- [ ] **Step 5: Run the file's tests, then the full suite**

Run: `cd web && npx vitest run src/components/MapCanvas.test.tsx`
Expected: PASS.
Run: `cd web && npm test`
Expected: PASS. If `App.test.tsx` fails on identify timing, wrap its identify interaction in the same fake-timer advance pattern.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/MapCanvas.tsx web/src/components/MapCanvas.test.tsx
git commit -m "fix(web): keep double-tap zoom from selecting a parcel"
```

---

### Task 2: Geodesy service

**Files:**
- Create: `web/src/services/geodesy.ts`
- Create: `web/src/services/geodesy.test.ts`
- Modify: `web/src/services/parcelContext.ts` (line 3: replace local constant with import)

**Interfaces:**
- Produces (Task 3 consumes exactly these):
  - `interface GeoPoint { lat: number; lng: number }`
  - `pathDistanceMetres(points: readonly GeoPoint[]): number`
  - `polygonAreaSquareMetres(ring: readonly GeoPoint[]): number`
  - `formatDistance(metres: number): string`
  - `formatArea(squareMetres: number): string`
  - `SQUARE_METRES_PER_ACRE: number`

- [ ] **Step 1: Write failing tests**

`web/src/services/geodesy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SQUARE_METRES_PER_ACRE,
  formatArea,
  formatDistance,
  pathDistanceMetres,
  polygonAreaSquareMetres,
  type GeoPoint,
} from "./geodesy";

// One degree of arc on Leaflet's sphere (R = 6 371 000 m).
const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

describe("pathDistanceMetres", () => {
  it("measures a degree of longitude along the equator", () => {
    const metres = pathDistanceMetres([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
    ]);
    expect(metres).toBeCloseTo(METRES_PER_DEGREE, 0);
  });

  it("measures a degree of latitude the same at any longitude", () => {
    const metres = pathDistanceMetres([
      { lat: 45, lng: -61 },
      { lat: 46, lng: -61 },
    ]);
    expect(metres).toBeCloseTo(METRES_PER_DEGREE, 0);
  });

  it("shrinks east-west distance at Nova Scotia's latitude", () => {
    const metres = pathDistanceMetres([
      { lat: 45, lng: -61 },
      { lat: 45, lng: -60 },
    ]);
    // ≈ cos(45°) of an equatorial degree; haversine value, ±5 m.
    expect(Math.abs(metres - 78_626)).toBeLessThan(5);
  });

  it("sums the legs of a multi-point path", () => {
    const a = { lat: 45, lng: -61 };
    const b = { lat: 45.01, lng: -61 };
    const c = { lat: 45.02, lng: -61 };
    expect(pathDistanceMetres([a, b, c])).toBeCloseTo(
      pathDistanceMetres([a, b]) + pathDistanceMetres([b, c]),
      6,
    );
  });

  it("returns zero for fewer than two points", () => {
    expect(pathDistanceMetres([])).toBe(0);
    expect(pathDistanceMetres([{ lat: 45, lng: -61 }])).toBe(0);
  });
});

describe("polygonAreaSquareMetres", () => {
  const oneAcreSquareAt45North = (): GeoPoint[] => {
    const side = Math.sqrt(SQUARE_METRES_PER_ACRE);
    const dLat = side / METRES_PER_DEGREE;
    const dLng = side / (METRES_PER_DEGREE * Math.cos((45 * Math.PI) / 180));
    return [
      { lat: 45, lng: -61 },
      { lat: 45, lng: -61 + dLng },
      { lat: 45 + dLat, lng: -61 + dLng },
      { lat: 45 + dLat, lng: -61 },
    ];
  };

  it("measures a surveyed one-acre square at 45° North", () => {
    const area = polygonAreaSquareMetres(oneAcreSquareAt45North());
    expect(area / SQUARE_METRES_PER_ACRE).toBeCloseTo(1, 2);
  });

  it("is winding-order independent", () => {
    const ring = oneAcreSquareAt45North();
    expect(polygonAreaSquareMetres([...ring].reverse())).toBeCloseTo(
      polygonAreaSquareMetres(ring),
      6,
    );
  });

  it("measures an equator-crossing patch against the analytic band area", () => {
    const area = polygonAreaSquareMetres([
      { lat: -1, lng: 10 },
      { lat: -1, lng: 11 },
      { lat: 1, lng: 11 },
      { lat: 1, lng: 10 },
    ]);
    // Spherical band: R² · Δλ · (sin φ₂ − sin φ₁)
    const expected =
      6_371_000 ** 2 *
      (Math.PI / 180) *
      (Math.sin((1 * Math.PI) / 180) - Math.sin((-1 * Math.PI) / 180));
    expect(area / expected).toBeCloseTo(1, 4);
  });

  it("returns zero for fewer than three points", () => {
    expect(polygonAreaSquareMetres([])).toBe(0);
    expect(
      polygonAreaSquareMetres([
        { lat: 45, lng: -61 },
        { lat: 45.01, lng: -61 },
      ]),
    ).toBe(0);
  });
});

describe("formatting", () => {
  it("formats metres below one kilometre", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(999.4)).toBe("999 m");
  });

  it("formats kilometres at and above one kilometre", () => {
    expect(formatDistance(1_000)).toBe("1.00 km");
    expect(formatDistance(12_345)).toBe("12.35 km");
  });

  it("formats areas as hectares and acres together", () => {
    expect(formatArea(5 * SQUARE_METRES_PER_ACRE)).toBe("2.02 ha · 5.00 ac");
    expect(formatArea(10_000)).toBe("1.00 ha · 2.47 ac");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/services/geodesy.test.ts`
Expected: FAIL — cannot resolve `./geodesy`.

- [ ] **Step 3: Implement `geodesy.ts`**

```ts
/**
 * Geodesic measurement on the sphere Leaflet uses (CRS.Earth, R = 6 371 000 m),
 * so measured values agree with the on-screen scale bar. A planar shoelace on
 * raw lat/lng would overstate areas by ~40 % at Nova Scotia's latitude; the
 * spherical-excess form below is the standard geodesic approximation.
 */

const EARTH_RADIUS_METRES = 6_371_000;
const DEGREES_TO_RADIANS = Math.PI / 180;
const SQUARE_METRES_PER_HECTARE = 10_000;

export const SQUARE_METRES_PER_ACRE = 4_046.856_422_4;

export interface GeoPoint {
  lat: number;
  lng: number;
}

function distanceMetres(from: GeoPoint, to: GeoPoint): number {
  const fromLat = from.lat * DEGREES_TO_RADIANS;
  const toLat = to.lat * DEGREES_TO_RADIANS;
  const deltaLat = (to.lat - from.lat) * DEGREES_TO_RADIANS;
  const deltaLng = (to.lng - from.lng) * DEGREES_TO_RADIANS;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_METRES *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function pathDistanceMetres(points: readonly GeoPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMetres(points[index - 1], points[index]);
  }
  return total;
}

export function polygonAreaSquareMetres(ring: readonly GeoPoint[]): number {
  if (ring.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    sum +=
      (next.lng - current.lng) *
      DEGREES_TO_RADIANS *
      (2 +
        Math.sin(current.lat * DEGREES_TO_RADIANS) +
        Math.sin(next.lat * DEGREES_TO_RADIANS));
  }
  return Math.abs((sum * EARTH_RADIUS_METRES * EARTH_RADIUS_METRES) / 2);
}

const metreFormatter = new Intl.NumberFormat("en-CA", {
  maximumFractionDigits: 0,
});
const twoDecimalFormatter = new Intl.NumberFormat("en-CA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDistance(metres: number): string {
  if (metres < 1_000) {
    return `${metreFormatter.format(metres)} m`;
  }
  return `${twoDecimalFormatter.format(metres / 1_000)} km`;
}

export function formatArea(squareMetres: number): string {
  const hectares = squareMetres / SQUARE_METRES_PER_HECTARE;
  const acres = squareMetres / SQUARE_METRES_PER_ACRE;
  return `${twoDecimalFormatter.format(hectares)} ha · ${twoDecimalFormatter.format(acres)} ac`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/services/geodesy.test.ts`
Expected: PASS. If the 45°-longitude test misses by more than 5 m, print the computed value — the implementation, not the expectation, is wrong.

- [ ] **Step 5: Deduplicate the acre constant**

In `web/src/services/parcelContext.ts`, delete line 3 (`const SQUARE_METRES_PER_ACRE = 4_046.856_422_4;`) and add to the imports:

```ts
import { SQUARE_METRES_PER_ACRE } from "./geodesy";
```

Run: `cd web && npx vitest run src/services/parcelContext.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/services/geodesy.ts web/src/services/geodesy.test.ts web/src/services/parcelContext.ts
git commit -m "feat(web): add geodesy service for map measurements"
```

---

### Task 3: MeasureTool component

**Files:**
- Create: `web/src/components/MeasureTool.tsx`
- Create: `web/src/components/MeasureTool.test.tsx`
- Modify: `web/src/components/mapPanes.ts` (append pane constants)
- Modify: `web/src/components/mapPanes.test.ts` (ordering assertion)

**Interfaces:**
- Consumes: Task 2's geodesy exports; `MEASURE_PANE`/`MEASURE_PANE_Z_INDEX` (created here).
- Produces (Task 4 consumes exactly these):
  - `type MeasureMode = "off" | "distance" | "area"`
  - `function MeasureTool(props: { mode: MeasureMode; onModeChange: (mode: MeasureMode) => void }): ReactNode` — must be rendered inside `MapContainer`.

- [ ] **Step 1: Add the measure pane constants and their test**

Append to `web/src/components/mapPanes.ts`:

```ts
/**
 * Active measurements are the user's current focus, so they render above
 * every parcel overlay. Kept below 500 where the map's HTML controls sit.
 */
export const MEASURE_PANE = "measure-pane";
export const MEASURE_PANE_Z_INDEX = 430;
```

Add to the assertions in the `"keeps well points above proximity parcels and below the selected parcel"` test in `mapPanes.test.ts` (importing the two new constants):

```ts
    expect(MEASURE_PANE_Z_INDEX).toBeGreaterThan(ESTABLISHED_PARCEL_PANE_Z_INDEX);
    expect(MEASURE_PANE_Z_INDEX).toBeLessThan(500);
    expect(MEASURE_PANE).not.toBe(ESTABLISHED_PARCEL_PANE);
```

Run: `cd web && npx vitest run src/components/mapPanes.test.ts` — Expected: PASS.

- [ ] **Step 2: Write failing MeasureTool tests**

`web/src/components/MeasureTool.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type CSSProperties, type PropsWithChildren, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeasureTool, type MeasureMode } from "./MeasureTool";

const mapMock = vi.hoisted(() => ({
  doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
}));

const mapEvents = vi.hoisted(() => ({
  current: {} as {
    click?: (event: { latlng: { lat: number; lng: number } }) => void;
    dblclick?: () => void;
    mousemove?: (event: { latlng: { lat: number; lng: number } }) => void;
  },
}));

vi.mock("react-leaflet", () => ({
  CircleMarker: ({
    center,
    eventHandlers,
    interactive,
  }: {
    center: { lat: number; lng: number };
    eventHandlers?: { click?: (event: unknown) => void };
    interactive?: boolean;
  }) => (
    <button
      type="button"
      data-testid="measure-vertex"
      data-center={`${center.lat},${center.lng}`}
      data-interactive={interactive}
      onClick={(event) =>
        eventHandlers?.click?.({ originalEvent: event.nativeEvent })
      }
    />
  ),
  Pane: ({ children }: PropsWithChildren<{ name: string; style?: CSSProperties }>) => (
    <div data-testid="measure-pane">{children}</div>
  ),
  Polygon: ({ positions }: { positions: Array<{ lat: number; lng: number }> }) => (
    <div data-testid="measure-polygon" data-count={positions.length} />
  ),
  Polyline: ({ positions }: { positions: Array<{ lat: number; lng: number }> }) => (
    <div data-testid="measure-line" data-count={positions.length} />
  ),
  useMap: () => mapMock,
  useMapEvents: (handlers: typeof mapEvents.current) => {
    mapEvents.current = handlers;
    return mapMock;
  },
}));

function Harness({ initialMode = "off" }: { initialMode?: MeasureMode }) {
  const [mode, setMode] = useState<MeasureMode>(initialMode);
  return <MeasureTool mode={mode} onModeChange={setMode} />;
}

const clickAt = (lat: number, lng: number) =>
  act(() => mapEvents.current.click?.({ latlng: { lat, lng } }));

beforeEach(() => {
  vi.clearAllMocks();
  mapEvents.current = {};
});

describe("MeasureTool controls", () => {
  it("captures nothing while off", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Measure distance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Measure area" })).toBeInTheDocument();
    expect(mapEvents.current.click).toBeUndefined();
    expect(mapMock.doubleClickZoom.disable).not.toHaveBeenCalled();
  });

  it("suspends double-click zoom only while a mode is active", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Measure distance" }));
    expect(mapMock.doubleClickZoom.disable).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Measure distance" }));
    expect(mapMock.doubleClickZoom.enable).toHaveBeenCalledTimes(1);
  });
});

describe("distance measuring", () => {
  it("accumulates vertices and reads out the running total", () => {
    render(<Harness initialMode="distance" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tap the map to measure distance",
    );

    clickAt(45, -61);
    clickAt(46, -61); // one degree of latitude ≈ 111.19 km
    expect(screen.getByRole("status")).toHaveTextContent("111.19 km");
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(2);
    expect(screen.getByTestId("measure-line")).toHaveAttribute("data-count", "2");
  });

  it("previews the next leg from the cursor without committing it", () => {
    render(<Harness initialMode="distance" />);
    clickAt(45, -61);
    act(() => mapEvents.current.mousemove?.({ latlng: { lat: 46, lng: -61 } }));
    expect(screen.getByTestId("measure-line")).toHaveAttribute("data-count", "2");
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(1);
    // Readout only reflects committed points.
    expect(screen.getByRole("status")).not.toHaveTextContent("km");
  });

  it("finishes on double-click, dropping the double-click's duplicate vertex", () => {
    render(<Harness initialMode="distance" />);
    clickAt(45, -61);
    clickAt(46, -61);
    // The second click of the double-click pair lands before dblclick fires.
    clickAt(46, -61);
    act(() => mapEvents.current.dblclick?.());
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("111.19 km");

    // After finishing, a fresh click starts a new measurement.
    clickAt(45, -60);
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(1);
  });

  it("finishes on Enter and clears on Escape", () => {
    render(<Harness initialMode="distance" />);
    clickAt(45, -61);
    clickAt(46, -61);
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("111.19 km");

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryAllByTestId("measure-vertex")).toHaveLength(0);
    // A second Escape with nothing measured exits measure mode, unmounting
    // the capture layer (observable via the double-click zoom restore —
    // the stale mapEvents capture cannot show the unmount).
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(mapMock.doubleClickZoom.enable).toHaveBeenCalledTimes(1);
  });
});

describe("area measuring", () => {
  it("reads out hectares and acres once a ring exists", () => {
    render(<Harness initialMode="area" />);
    clickAt(45, -61);
    clickAt(45, -60.99);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tap the map to outline an area",
    );
    clickAt(45.01, -60.99);
    expect(screen.getByRole("status")).toHaveTextContent(/ha · .* ac/);
    expect(screen.getByTestId("measure-polygon")).toHaveAttribute("data-count", "3");
  });

  it("finishes when the first vertex is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness initialMode="area" />);
    clickAt(45, -61);
    clickAt(45, -60.99);
    clickAt(45.01, -60.99);
    const [firstVertex] = screen.getAllByTestId("measure-vertex");
    expect(firstVertex).toHaveAttribute("data-interactive", "true");
    await user.click(firstVertex);
    // Finished: further clicks start a new ring rather than extending this one.
    clickAt(45.02, -60.98);
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && npx vitest run src/components/MeasureTool.test.tsx`
Expected: FAIL — cannot resolve `./MeasureTool`.

- [ ] **Step 4: Implement `MeasureTool.tsx`**

```tsx
import L from "leaflet";
import { useEffect, useState } from "react";
import {
  CircleMarker,
  Pane,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  formatArea,
  formatDistance,
  pathDistanceMetres,
  polygonAreaSquareMetres,
  type GeoPoint,
} from "../services/geodesy";
import { MEASURE_PANE, MEASURE_PANE_Z_INDEX } from "./mapPanes";

export type MeasureMode = "off" | "distance" | "area";

type ActiveMeasureMode = Exclude<MeasureMode, "off">;

const MIN_FINISH_POINTS: Record<ActiveMeasureMode, number> = {
  distance: 2,
  area: 3,
};

const SHAPE_STYLE = {
  color: "#d97706",
  weight: 2,
  dashArray: "6 4",
  fillOpacity: 0.12,
};

const VERTEX_STYLE = {
  color: "#d97706",
  weight: 2,
  fillColor: "#ffffff",
  fillOpacity: 1,
};

export function MeasureTool({
  mode,
  onModeChange,
}: {
  mode: MeasureMode;
  onModeChange: (mode: MeasureMode) => void;
}) {
  const toggle = (next: ActiveMeasureMode) =>
    onModeChange(mode === next ? "off" : next);

  return (
    <>
      <div className="measure-control" role="group" aria-label="Measure on the map">
        <button
          type="button"
          aria-label="Measure distance"
          aria-pressed={mode === "distance"}
          onClick={() => toggle("distance")}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M3 17 17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Measure area"
          aria-pressed={mode === "area"}
          onClick={() => toggle("area")}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M12 3l8 6-3 10H7L4 9z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeDasharray="3 2"
            />
          </svg>
        </button>
      </div>
      {mode !== "off" ? (
        // key remounts capture state when switching distance ↔ area.
        <MeasureCapture key={mode} mode={mode} onExit={() => onModeChange("off")} />
      ) : null}
    </>
  );
}

interface Measurement {
  points: GeoPoint[];
  finished: boolean;
}

function MeasureCapture({
  mode,
  onExit,
}: {
  mode: ActiveMeasureMode;
  onExit: () => void;
}) {
  const map = useMap();
  const [measurement, setMeasurement] = useState<Measurement>({
    points: [],
    finished: false,
  });
  const [cursor, setCursor] = useState<GeoPoint | null>(null);

  useEffect(() => {
    map.doubleClickZoom.disable();
    return () => {
      map.doubleClickZoom.enable();
    };
  }, [map]);

  const finish = () =>
    setMeasurement((current) =>
      current.points.length >= MIN_FINISH_POINTS[mode]
        ? { ...current, finished: true }
        : current,
    );

  useMapEvents({
    click: ({ latlng }) =>
      setMeasurement((current) => {
        const point = { lat: latlng.lat, lng: latlng.lng };
        return current.finished
          ? { points: [point], finished: false }
          : { points: [...current.points, point], finished: false };
      }),
    dblclick: () =>
      // The double-click's own second click just added a duplicate vertex;
      // drop it before finishing.
      setMeasurement((current) => {
        if (current.finished) {
          return current;
        }
        const points = current.points.slice(0, -1);
        return { points, finished: points.length >= MIN_FINISH_POINTS[mode] };
      }),
    mousemove: ({ latlng }) => setCursor({ lat: latlng.lat, lng: latlng.lng }),
  });

  const isEmpty = measurement.points.length === 0;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isEmpty) {
          onExit();
        } else {
          setMeasurement({ points: [], finished: false });
        }
      } else if (event.key === "Enter") {
        finish();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // finish is recreated per render; subscribing per render is harmless here.
  });

  const { points, finished } = measurement;
  const preview =
    !finished && cursor !== null && points.length > 0
      ? [...points, cursor]
      : points;

  return (
    <>
      <Pane name={MEASURE_PANE} style={{ zIndex: MEASURE_PANE_Z_INDEX }}>
        {mode === "area" && preview.length >= 3 ? (
          <Polygon positions={preview} pathOptions={SHAPE_STYLE} interactive={false} />
        ) : preview.length >= 2 ? (
          <Polyline positions={preview} pathOptions={SHAPE_STYLE} interactive={false} />
        ) : null}
        {points.map((point, index) => {
          const closesRing = mode === "area" && index === 0 && !finished;
          return (
            <CircleMarker
              key={`${index}-${point.lat}-${point.lng}`}
              center={point}
              radius={5}
              pathOptions={VERTEX_STYLE}
              interactive={closesRing}
              eventHandlers={
                closesRing
                  ? {
                      click: (event) => {
                        L.DomEvent.stopPropagation(event.originalEvent);
                        finish();
                      },
                    }
                  : undefined
              }
            />
          );
        })}
      </Pane>
      <p className="measure-readout" role="status">
        {readoutText(mode, points)}
      </p>
    </>
  );
}

function readoutText(mode: ActiveMeasureMode, points: readonly GeoPoint[]): string {
  if (mode === "distance") {
    return points.length < 2
      ? "Tap the map to measure distance"
      : formatDistance(pathDistanceMetres(points));
  }
  return points.length < 3
    ? "Tap the map to outline an area"
    : formatArea(polygonAreaSquareMetres(points));
}
```

Type note: react-leaflet's `eventHandlers.click` receives `L.LeafletMouseEvent`, whose `originalEvent` is a DOM `MouseEvent` — matches `L.DomEvent.stopPropagation`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npx vitest run src/components/MeasureTool.test.tsx src/components/mapPanes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/MeasureTool.tsx web/src/components/MeasureTool.test.tsx web/src/components/mapPanes.ts web/src/components/mapPanes.test.ts
git commit -m "feat(web): add distance and area measure tool component"
```

---

### Task 4: Wire MeasureTool into MapCanvas

**Files:**
- Modify: `web/src/components/MapCanvas.tsx` (state near line 1424; render block lines ~1702-1706; selection guard; `onSelectPid` pass-throughs at lines ~1606, 1621, 1631)
- Modify: `web/src/components/MapCanvas.test.tsx`
- Modify: `web/src/styles.css` (new rules + two `.location-message` offsets)
- Modify: `README.md`, `ARCHITECTURE.md` (feature notes)

**Interfaces:**
- Consumes: `MeasureTool`, `MeasureMode` from `./MeasureTool`; `IDENTIFY_CLICK_DELAY_MS` (Task 1).
- Produces: no new exports; `MapCanvasProps` is unchanged (measure state is internal).

- [ ] **Step 1: Write failing wiring tests**

In `MapCanvas.test.tsx`, mock `./MeasureTool` next to the `MineralProximityParcelLayer` mock:

```tsx
vi.mock("./MeasureTool", () => ({
  MeasureTool: ({
    mode,
    onModeChange,
  }: {
    mode: "off" | "distance" | "area";
    onModeChange: (mode: "off" | "distance" | "area") => void;
  }) => (
    <button
      type="button"
      data-testid="measure-tool"
      data-mode={mode}
      onClick={() => onModeChange(mode === "off" ? "distance" : "off")}
    >
      Toggle measuring
    </button>
  ),
}));
```

Add tests to the `"MapCanvas parcel discovery"` block (same render props as the identify tests, but pass a real `onSelectPid` spy and the tax-sale parcel fixture used by `"fits the initial view to the visible tax-sale parcel layer once"` so overview markers exist):

```tsx
  it("suspends parcel identify and selection while measuring", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onIdentifyParcel = vi.fn();
    const onSelectPid = vi.fn();
    mapMock.getZoom.mockReturnValue(9); // overview markers render below zoom 12
    render(/* identify-test props, plus the tax-sale parcel fixture, showTaxSale, onSelectPid */);

    await user.click(screen.getByTestId("measure-tool"));

    mapMock.getZoom.mockReturnValue(14);
    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).not.toHaveBeenCalled();

    const marker = [...circleMarkerProps.calls]
      .reverse()
      .find((call) => call.eventHandlers !== undefined);
    act(() => marker?.eventHandlers?.click?.());
    expect(onSelectPid).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("measure-tool")); // back to off
    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).toHaveBeenCalledTimes(1);
  });
```

(Adapt the marker-click invocation to the actual shape captured by `circleMarkerProps` — see the existing overview-marker test at line ~1865 for how marker calls are found.)

In the `"MapCanvas print mode"` describe block's main test, add:

```tsx
    expect(screen.queryByTestId("measure-tool")).toBeNull();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/components/MapCanvas.test.tsx`
Expected: FAIL — `measure-tool` testid not rendered.

- [ ] **Step 3: Wire it up in `MapCanvas.tsx`**

Imports: add `MeasureTool, { type MeasureMode }`-style imports (`import { MeasureTool, type MeasureMode } from "./MeasureTool";`).

In the `MapCanvas` component body near the other `useState` hooks (~line 1424):

```tsx
  const [measureMode, setMeasureMode] = useState<MeasureMode>("off");
  const measuring = measureMode !== "off";
  const measuringRef = useRef(false);
  measuringRef.current = measuring;
  // Layer click handlers are wired inside effects; a ref-guarded stable
  // callback suspends selection without remounting those layers.
  const guardedSelectPid = useCallback(
    (pid: string) => {
      if (!measuringRef.current) {
        onSelectPid(pid);
      }
    },
    [onSelectPid],
  );
```

Replace the three `onSelectPid={onSelectPid}` pass-throughs (lines ~1606, 1621, 1631) with `onSelectPid={guardedSelectPid}`.

Change the identify controller (line ~1702) and add the tool beside it, inside the existing non-print fragment:

```tsx
          <ParcelIdentifyController
            enabled={provinceLayers.nsprd && !measuring}
            onIdentifyParcel={onIdentifyParcel}
          />
          <MeasureTool mode={measureMode} onModeChange={setMeasureMode} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/components/MapCanvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Styles**

In `web/src/styles.css`, after the `.location-button` rules (~line 1338), add:

```css
.measure-control {
  position: absolute;
  z-index: 500;
  top: 138px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.measure-control button {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  color: var(--survey-blue);
  background: var(--white);
  border: 2px solid var(--white);
  border-radius: 50%;
  box-shadow: 0 1px 8px rgba(18, 52, 59, 0.35);
  cursor: pointer;
}

.measure-control button[aria-pressed="true"] {
  color: var(--white);
  background: var(--survey-blue);
}

.measure-readout {
  position: absolute;
  z-index: 500;
  bottom: 104px;
  left: 12px;
  margin: 0;
  padding: 4px 9px;
  color: var(--chart-ink);
  font-family: "IBM Plex Mono", Menlo, monospace;
  font-size: 0.78rem;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--line);
  border-radius: 4px;
}
```

The measure buttons take the slot `.location-message` used: change its `top: 138px` to `top: 246px` (~line 1400). In the mobile media query (~line 2440), change `.location-message { top: 126px; }` to `top: 234px;` and add:

```css
  .measure-control {
    top: 126px;
  }

  .measure-readout {
    bottom: 16px;
  }
```

Run: `cd web && npx vitest run src/styles.test.ts` — Expected: PASS (it lints CSS structure; fix anything it flags).

- [ ] **Step 6: Documentation**

- `README.md`: in the opening feature description (~line 9 area), add a sentence: "An on-map measure tool reads out distances (m/km) and areas (ha + acres) for frontage and part-lot checks."
- `ARCHITECTURE.md`: in the `web/` section (~line 83-111), add a short paragraph: "`components/MeasureTool.tsx` renders the distance/area measure control inside the Leaflet map. Geometry math lives in `services/geodesy.ts` (haversine paths, spherical-excess areas on Leaflet's sphere). While a measurement is active, `MapCanvas` suspends parcel identify/selection and double-click zoom; a 250 ms deferred click in `ParcelIdentifyController` keeps double-tap zoom from selecting parcels the rest of the time."

- [ ] **Step 7: Full suite + commit**

Run: `cd web && npm test && npm run lint && npm run build`
Expected: all PASS.

```bash
git add web/src/components/MapCanvas.tsx web/src/components/MapCanvas.test.tsx web/src/styles.css README.md ARCHITECTURE.md
git commit -m "feat(web): add on-map measuring with double-tap-safe selection"
```

---

### Task 5: Verify in the browser, push, open PR

**Files:** none (verification + release chores)

- [ ] **Step 1: Live smoke test**

Start the web dev server via the browser preview tooling (`.claude/launch.json`; add a `web` entry running `npm run dev` in `web/` on port 5173 if absent). Verify:

1. Single click on a parcel (zoom ≥ 14, NSPRD on) still selects it after a beat.
2. Double-click zooms and no PID selection message appears.
3. Distance mode: vertices, live readout, double-click finish (no zoom), Esc clears.
4. Area mode: readout shows "x.xx ha · y.yy ac"; clicking the first vertex closes the ring. Cross-check by tracing a selected parcel's boundary — the measured area should be within a few percent of the inspector's mapped acreage.
5. Toggling measure off restores selection and double-click zoom.
6. Mobile viewport (375 px): controls don't collide.

Fix and amend/commit as needed; screenshot proof of the readout.

- [ ] **Step 2: Push and open the PR**

```bash
git fetch origin && git rebase origin/nightly
git push -u origin claude/double-tap-zoom-measuring-tool-572fa1
gh pr create --base nightly --title "feat(web): double-tap zoom + on-map measuring tool" --body "..."
```

PR body: summarize the debounce, geodesy service, measure tool; link the spec; note the print/share non-goals; include the smoke-test screenshot. End with the standard generated-with footer. Watch the `Build gate + tests` check.
