# Web Map Print Location Privacy Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep browser-geolocation recentering out of the printable viewport and print receipt while allowing later manual map navigation to become the field-map extent.

**Architecture:** `MapCanvas` will keep a private, ephemeral viewport guard beside its existing browser-location state. `MapPositionController` will continue reporting every map position through the legacy `onPositionChange` callback, but it will suppress the new print-only `onViewportChange` callback throughout a location-triggered `flyTo`, remember the final blocked viewport, and resume printable reporting only after the map differs through later user navigation.

**Tech Stack:** React 19.2.7, TypeScript 5.9.3, Leaflet 1.9.4, React-Leaflet 5.0.0, Vitest 4.1.10, React Testing Library 16.3.2.

## Global Constraints

- Privacy wins over exact live-viewport fidelity when the **Use my location** control recentres the map.
- A location-triggered viewport must never reach `PrintCapture`, `PrintSnapshot`, a print template, a QR code, or the print receipt URL.
- The field template uses the last printable viewport until the user manually pans or zooms away from the location-triggered viewport.
- Browser-location markers, accuracy circles, coordinates, and location status remain private, ephemeral `MapCanvas` state.
- Preserve the existing `onPositionChange` callback and live map-share behavior; this amendment changes only the print-only `onViewportChange` path.
- Preserve ordinary initial, manual pan, manual zoom, parcel-fit, and layer-fit viewport reporting.
- Suppress both `zoomend` and `moveend` reports from the location `flyTo`, regardless of their order.
- Do not pass browser-location coordinates, flags, or provenance into `App`.
- Do not add location details to logs, fixtures, commits, or reports; tests use only the existing synthetic coordinates.
- This amendment completes the open privacy finding from Task 2 of `2026-07-23-web-map-print-export.md`; after it passes review, resume that plan at Task 3.

---

## File Structure

**Modify:**

- `web/src/components/MapCanvas.tsx` — own the private location-viewport guard and filter print-only viewport reports.
- `web/src/components/MapCanvas.test.tsx` — prove location recentering is excluded, duplicate end events cannot leak it, and manual navigation resumes reporting.

No public print-domain type changes are required. `MapCanvasProps.onViewportChange` retains its current signature:

```ts
onViewportChange?: (viewport: PrintMapViewport) => void;
```

---

### Task 1: Keep Browser-Location Recentering Out of Printable Viewport State

**Files:**

- Modify: `web/src/components/MapCanvas.tsx:1-2,493-529,808-866,1027-1030`
- Test: `web/src/components/MapCanvas.test.tsx:1-70,137-307`

**Interfaces:**

- Consumes: existing `MapCanvasProps.onPositionChange`, `MapCanvasProps.onViewportChange`, `PrintMapViewport`, `getBrowserLocation`, and Leaflet `zoomend`/`moveend` events.
- Produces: private `PrintableViewportGuard`, `samePrintMapViewport`, and guarded `MapPositionController` behavior.
- Preserves: the public `MapCanvasProps` API and every non-location viewport callback.

- [ ] **Step 1: Make the Leaflet test map available to the location control**

Add `flyTo` to `mapMock`:

```ts
const mapMock = vi.hoisted(() => ({
  addLayer: vi.fn(),
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 46.35, lng: -61.15 })),
  getZoom: vi.fn(() => 9),
  getBounds: vi.fn(() => ({
    getWest: () => -62,
    getSouth: () => 45,
    getEast: () => -60,
    getNorth: () => 47,
  })),
  getContainer: vi.fn(() => document.body),
  invalidateSize: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  removeLayer: vi.fn(),
  setZoom: vi.fn(),
}));
```

Replace the `MapContainer` mock with a React 19 ref-prop mock that supplies
`mapMock` to the real `setMap` callback:

```tsx
MapContainer: ({
  children,
  ref,
}: PropsWithChildren<{
  ref?: (map: typeof mapMock | null) => void;
}>) => {
  useEffect(() => {
    ref?.(mapMock);
    return () => ref?.(null);
  }, [ref]);
  return <div>{children}</div>;
},
```

- [ ] **Step 2: Write the failing privacy and recovery test**

Add this test inside `describe("MapCanvas viewport reporting", ...)`:

```tsx
it("keeps location recentering out of printable viewport state", async () => {
  const user = userEvent.setup();
  const onPositionChange = vi.fn();
  const onViewportChange = vi.fn();
  mapMock.getCenter.mockReturnValue({ lat: 46.35, lng: -61.15 });
  mapMock.getZoom.mockReturnValue(15);

  render(
    <MapCanvas
      parcels={{ type: "FeatureCollection", features: [] }}
      taxSalePids={new Set()}
      historicalTaxSalePids={new Set()}
      selectedPid={null}
      provinceLayers={{
        "ns-aerial": false,
        nsprd: false,
        "crown-lands": false,
        "flood-risk": false,
        waterfalls: false,
        "water-features": false,
        roads: false,
        buildings: false,
        contours: false,
      }}
      resourceLayers={hiddenResourceLayers}
      showModernMap={false}
      showTaxSale={false}
      showHistoricalTaxSales={false}
      onSelectPid={vi.fn()}
      onIdentifyParcel={vi.fn()}
      onPositionChange={onPositionChange}
      onViewportChange={onViewportChange}
    />,
  );

  onPositionChange.mockClear();
  onViewportChange.mockClear();
  await user.click(screen.getByRole("button", { name: "Use my location" }));
  await waitFor(() => {
    expect(mapMock.flyTo).toHaveBeenCalledWith([46.12, -60.91], 14);
  });

  mapMock.getCenter.mockReturnValue({ lat: 46.12, lng: -60.91 });
  mapMock.getZoom.mockReturnValue(14);
  mapMock.getBounds.mockReturnValue({
    getWest: () => -60.96,
    getSouth: () => 46.07,
    getEast: () => -60.86,
    getNorth: () => 46.17,
  });
  const [, zoomendHandler] = mapMock.on.mock.calls
    .filter(([event]) => event === "zoomend")
    .pop() ?? [];
  const [, moveendHandler] = mapMock.on.mock.calls
    .filter(([event]) => event === "moveend")
    .pop() ?? [];

  act(() => {
    zoomendHandler?.({ type: "zoomend" });
    moveendHandler?.({ type: "moveend" });
    zoomendHandler?.({ type: "zoomend" });
  });

  expect(onPositionChange).toHaveBeenLastCalledWith({
    latitude: 46.12,
    longitude: -60.91,
    zoom: 14,
  });
  expect(onViewportChange).not.toHaveBeenCalled();

  mapMock.getCenter.mockReturnValue({ lat: 46.2, lng: -61 });
  mapMock.getZoom.mockReturnValue(15);
  mapMock.getBounds.mockReturnValue({
    getWest: () => -61.05,
    getSouth: () => 46.15,
    getEast: () => -60.95,
    getNorth: () => 46.25,
  });
  act(() => moveendHandler?.({ type: "moveend" }));

  expect(onViewportChange).toHaveBeenLastCalledWith({
    position: { latitude: 46.2, longitude: -61, zoom: 15 },
    bounds: {
      north: 46.25,
      east: -60.95,
      south: 46.15,
      west: -61.05,
    },
  });
});
```

This test deliberately fires `zoomend`, `moveend`, and a duplicate `zoomend`.
That sequence protects against either Leaflet end-event order and prevents a
final duplicate event from leaking the blocked viewport.

- [ ] **Step 3: Run the focused test and verify the privacy failure**

Run:

```bash
cd web
npm test -- src/components/MapCanvas.test.tsx
```

Expected: FAIL because the location-triggered handlers call
`onViewportChange` with synthetic location centre `46.12, -60.91`.

- [ ] **Step 4: Add the private printable-viewport guard**

Extend the Leaflet import so the event handler can distinguish `moveend`:

```ts
import L, {
  type LeafletEvent,
  type Map as LeafletMap,
  type PathOptions,
} from "leaflet";
```

Add these private definitions near the location constants:

```ts
type PrintableViewportGuard = {
  suppressBrowserLocation: boolean;
  lastSuppressed: PrintMapViewport | null;
};

type PrintableViewportGuardRef = {
  current: PrintableViewportGuard;
};

const VIEWPORT_COMPARISON_EPSILON = 1e-9;

function samePrintMapViewport(
  left: PrintMapViewport,
  right: PrintMapViewport,
): boolean {
  const leftValues = [
    left.position.latitude,
    left.position.longitude,
    left.position.zoom,
    left.bounds.north,
    left.bounds.east,
    left.bounds.south,
    left.bounds.west,
  ];
  const rightValues = [
    right.position.latitude,
    right.position.longitude,
    right.position.zoom,
    right.bounds.north,
    right.bounds.east,
    right.bounds.south,
    right.bounds.west,
  ];
  return leftValues.every(
    (value, index) =>
      Math.abs(value - rightValues[index]) <= VIEWPORT_COMPARISON_EPSILON,
  );
}
```

Change `MapPositionController` to receive the private guard, preserve legacy
position reporting, block every event during the location transition, clear
the active transition on `moveend`, and continue blocking duplicate end events
that contain the same private viewport:

```tsx
function MapPositionController({
  onPositionChange,
  onViewportChange,
  printableViewportGuard,
}: Pick<MapCanvasProps, "onPositionChange" | "onViewportChange"> & {
  printableViewportGuard: PrintableViewportGuardRef;
}) {
  const map = useMap();

  useEffect(() => {
    if (!onPositionChange && !onViewportChange) {
      return;
    }
    const reportPosition = (event?: LeafletEvent) => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      const position = {
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
      };
      const viewport: PrintMapViewport = {
        position,
        bounds: {
          north: bounds.getNorth(),
          east: bounds.getEast(),
          south: bounds.getSouth(),
          west: bounds.getWest(),
        },
      };
      onPositionChange?.(position);

      const guard = printableViewportGuard.current;
      if (guard.suppressBrowserLocation) {
        guard.lastSuppressed = viewport;
        if (event?.type === "moveend") {
          guard.suppressBrowserLocation = false;
        }
        return;
      }
      if (
        guard.lastSuppressed !== null &&
        samePrintMapViewport(guard.lastSuppressed, viewport)
      ) {
        return;
      }
      guard.lastSuppressed = null;
      onViewportChange?.(viewport);
    };
    reportPosition();
    map.on("moveend", reportPosition);
    map.on("zoomend", reportPosition);
    return () => {
      map.off("moveend", reportPosition);
      map.off("zoomend", reportPosition);
    };
  }, [
    map,
    onPositionChange,
    onViewportChange,
    printableViewportGuard,
  ]);

  return null;
}
```

Create the guard beside the current `map` and browser-location state:

```ts
const [map, setMap] = useState<LeafletMap | null>(null);
const printableViewportGuard = useRef<PrintableViewportGuard>({
  suppressBrowserLocation: false,
  lastSuppressed: null,
});
const [userLocation, setUserLocation] = useState<BrowserLocation | null>(null);
```

Arm it immediately before the location `flyTo`:

```ts
if (map) {
  printableViewportGuard.current.suppressBrowserLocation = true;
  printableViewportGuard.current.lastSuppressed = null;
  map.flyTo([location.latitude, location.longitude], 14);
}
```

Pass the private ref only to the controller:

```tsx
<MapPositionController
  onPositionChange={onPositionChange}
  onViewportChange={onViewportChange}
  printableViewportGuard={printableViewportGuard}
/>
```

Do not add the guard or any browser-location field to `MapCanvasProps`,
`PrintMapViewport`, `PrintCapture`, or `App`.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
cd web
npm test -- src/components/MapCanvas.test.tsx src/services/printSnapshot.test.ts src/services/mapShareState.test.ts
npm run lint
npm run build
npm test
```

Expected:

- focused viewport/print-state tests PASS;
- lint PASS with no warnings or errors;
- TypeScript production build PASS;
- full web suite PASS;
- no browser-location value reaches `onViewportChange`;
- legacy `onPositionChange` still receives the ordinary map position; and
- the existing non-failing Vite chunk-size advisory may remain.

- [ ] **Step 6: Commit the privacy amendment**

```bash
git add web/src/components/MapCanvas.tsx web/src/components/MapCanvas.test.tsx
git commit -m "fix(web): keep location out of print state"
```

- [ ] **Step 7: Re-review the complete original Task 2 range**

Generate a review package from original Task 2 base
`96ea0fb3dd1545aca57959544566ee190e1b751e` through the new head:

```bash
/Users/dfakkeldy/.codex/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/review-package \
  96ea0fb3dd1545aca57959544566ee190e1b751e \
  HEAD
```

Give the reviewer:

- `.superpowers/sdd/task-2-brief.md`;
- `.superpowers/sdd/task-2-report.md`, including this amendment's RED/GREEN
  evidence;
- this amendment plan; and
- the newly generated complete Task 2 diff package.

Task 2 is complete only when the reviewer returns both:

```text
Spec compliance: ✅
Task quality: Approved
```

After clean review, append:

```text
Task 2: complete (commits 96ea0fb..HEAD, review clean)
```

to `.superpowers/sdd/progress.md`, mark Task 2 complete in the active task
plan, and resume `2026-07-23-web-map-print-export.md` at Task 3.
