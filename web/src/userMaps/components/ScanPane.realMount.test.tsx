import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { ScanPane } from "./ScanPane";
import { scanBounds } from "./scanGeometry";
import type { Gcp } from "../types";

/**
 * `ScanPane.test.tsx` mocks `react-leaflet` wholesale and
 * `GeoreferencePanel.test.tsx` mocks `./ScanPane` itself, so before this file
 * the component never mounted against real Leaflet anywhere in the suite. Both
 * of those mocks are worth keeping — they are fast and they pin things a real
 * mount cannot see (prop identity across re-renders, for one). What they
 * cannot do is check the pane's central claim, because the mock supplies the
 * answer: a mocked `Marker` renders wherever the assertion says it does, and a
 * mocked map turns a click into whatever latlng the test hands it.
 *
 * The claim (spec: "Library facts verified before planning"):
 * `L.CRS.Simple.project()` and `map.project()` are different functions — the
 * CRS method returns raw LonLat and ignores its zoom argument, while the Map
 * method applies `Transformation(1, 0, -1, 0)`. Reaching for the CRS method
 * here would MIRROR every GCP's pixel row, and nothing in a mocked suite would
 * notice. `scanGeometry.ts` encodes the correct mapping (image pixel (x, y) is
 * `latLng(-y, x)`); this file mounts a real `L.Map` on `L.CRS.Simple` and
 * proves the round-trip against it in both directions.
 *
 * Structural difference from `GeoreferenceMapLayer.realMount.test.tsx`:
 * `GeoreferenceMapLayer` is a CHILD of a `MapContainer` the test supplies,
 * whereas `ScanPane` creates its own `MapContainer` with `crs={L.CRS.Simple}`.
 * It is a root, not a child — the test cannot hand it a map, so the map has to
 * be reached from the outside (see `mountScan` below).
 */

/**
 * Two things this file needs from the real `L.Map`, both awkward because
 * `ScanPane` forwards no ref:
 *
 *  1. A NON-ZERO container size. `Map.getSize()` reads
 *     `this._container.clientWidth/clientHeight`, and jsdom reports 0 for
 *     every element. At 0x0 `fitBounds` degenerates to `minZoom` (-4, i.e.
 *     1/16 scale) and the geometry below would be sub-pixel. The container is
 *     created by react-leaflet inside its own ref callback, so there is no
 *     moment between "element exists" and "Leaflet reads it" that a test can
 *     reach from the outside...
 *  2. ...except this one. `addInitHook` is Leaflet's own public extension
 *     point; hooks run at the end of `Map.initialize`, which is AFTER
 *     `_initContainer` (so `getContainer()` is live) and BEFORE react-leaflet
 *     calls `map.fitBounds(bounds)` on the next line of `MapContainer`. So the
 *     hook can size the container in time to change the fitted zoom, and hand
 *     the instance back at the same time.
 *
 * This adds a hook to the `L.Map` class for the lifetime of this FILE. Vitest
 * isolates modules per file, and ScanPane's map is the only map created here.
 */
const createdMaps: L.Map[] = [];
L.Map.addInitHook(function initHook(this: L.Map) {
  Object.defineProperties(this.getContainer(), {
    clientWidth: { configurable: true, value: 640 },
    clientHeight: { configurable: true, value: 480 },
  });
  createdMaps.push(this);
});

/**
 * Same helper as `GeoreferenceMapLayer.realMount.test.tsx`. Sizing the OUTER
 * host node is not what fixes `Map.getSize()` (the init hook above does that,
 * on Leaflet's own container) — it is here so the node the component mounts
 * into is not degenerate, and because being attached to `document.body`
 * matters for the drag test: Leaflet's `Draggable` walks `parentNode` looking
 * for a sized ancestor and would run off the end of a detached tree.
 */
function sizedContainer(): HTMLDivElement {
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: 640 },
    clientHeight: { configurable: true, value: 480 },
  });
  document.body.append(container);
  return container;
}

const PIXEL_SIZE = { width: 1200, height: 800 };

/**
 * Fixture pixels chosen so that a MIRRORED row is detectable. On an 800-tall
 * raster the mirror of row y is `800 - y`, and the sign flip of row y is `-y`;
 * a point whose y is the vertical midpoint (400) or whose `y == height - y`
 * would satisfy a mirrored implementation and prove nothing.
 *
 *   y = 100 → mirrored 700, sign-flipped -100. All three differ.
 *   y = 700 → mirrored 100, sign-flipped -700. All three differ.
 *   y = 600 → mirrored 200, sign-flipped -600. All three differ.
 *
 * Every x is likewise off-centre on the 1200-wide raster (300↔900, 900↔300,
 * 100↔1100), so a mirrored COLUMN is caught too; and no fixture has x == y,
 * so a transposed pair (`[x, y]` where `[-y, x]` belongs) is caught as well.
 * The three points sit in three different quadrants, so "clicks low on the
 * scan report a LARGE row, clicks high report a SMALL one" is demonstrated as
 * a direction, not just as one lucky coordinate.
 *
 * The ids are deliberately not "1"/"2"/"3": the selection test below has to be
 * able to fail when selection is matched against a marker's 1-based LABEL
 * instead of against the GCP's id.
 */
const GCPS: Gcp[] = [
  { id: "north-headland", pixel: { x: 300, y: 100 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "south-cove", pixel: { x: 900, y: 700 }, map: { lat: 46.2, lng: -61.3 } },
  { id: "west-mill", pixel: { x: 100, y: 600 }, map: { lat: 46.3, lng: -61.4 } },
];

/**
 * Where the raster actually lands, in container pixels. Derived once here and
 * asserted outright against the real DOM in "lays the scan out from
 * scanBounds…" below, so the rest of the file may treat it as known ground
 * truth rather than as a second copy of the code under test.
 *
 * 640x480 viewport, 1200x800 raster → `fitBounds` fits by the tighter axis
 * (640/1200 < 480/800) and snaps. NB the snap is to a whole zoom level, not to
 * `zoomSnap={0.25}`: `getBoundsZoom` uses `Browser.any3d ? zoomSnap : 1`, and
 * jsdom advertises no 3D transform support, so zoom -1 (scale 0.5) it is. The
 * 600x400 image is then letterboxed: (640-600)/2 = 20, (480-400)/2 = 40.
 */
const IMAGE_SCALE = 0.5;
const IMAGE_ORIGIN = { x: 20, y: 40 };

/** Container point of an ORIGINAL image pixel, per the layout above. */
function containerPointOf(pixel: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return {
    x: IMAGE_ORIGIN.x + pixel.x * IMAGE_SCALE,
    y: IMAGE_ORIGIN.y + pixel.y * IMAGE_SCALE,
  };
}

/**
 * jsdom's `MouseEvent` does not implement the legacy `which` alias and leaves
 * it 0; a real browser reports `which === 1` for the primary button, and
 * Leaflet's `Draggable._onDown` gates on exactly that
 * (`(e.which !== 1) && (e.button !== 1) && !e.touches` → bail). Setting it
 * makes the synthetic event MATCH a real browser's rather than substituting
 * for Leaflet's own logic, which still runs unmodified.
 */
function mouse(type: string, clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent(type, {
    button: 0,
    buttons: 1,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "which", { value: 1 });
  return event;
}

/**
 * Leaflet's `Draggable` commits a move inside a `requestAnimationFrame`
 * callback, so `drag` is delivered a frame after the pointer moves. jsdom
 * provides a real rAF queue and runs callbacks in FIFO order, so awaiting a
 * frame we queue ourselves guarantees Leaflet's earlier one already ran.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

type ScanProps = Parameters<typeof ScanPane>[0];

/**
 * The three spies are built in their own object and spread back out AFTER the
 * overrides, so their `Mock<...>` types survive: folding them through a
 * `Partial<ScanProps>` would widen them to the bare prop signatures and cost
 * `.mock.calls`.
 */
function mountScan(overrides: Partial<ScanProps> = {}) {
  const spies = {
    onPickPoint: vi.fn<(x: number, y: number) => void>(),
    onDragStartGcp: vi.fn<(id: string) => void>(),
    onMoveGcp: vi.fn<(id: string, x: number, y: number) => void>(),
  };
  const props: ScanProps = {
    previewUrl: "blob:scan",
    pixelSize: PIXEL_SIZE,
    gcps: GCPS,
    pending: null,
    focus: null,
    selectedGcpId: null,
    ...spies,
    ...overrides,
  };
  const container = sizedContainer();
  const utils = render(<ScanPane {...props} />, { container });
  const map = createdMaps[createdMaps.length - 1];
  /** Re-render the SAME pane (same spies) with some props changed. */
  const rerenderWith = (next: Partial<ScanProps>) =>
    utils.rerender(<ScanPane {...props} {...next} />);
  return { ...utils, ...spies, container, map, rerenderWith };
}

/** Every rendered GCP/pending marker icon, as DOM nodes. */
function markerIcons(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".leaflet-marker-icon")];
}

/**
 * A marker's anchor in CONTAINER pixels. `DomUtil.getPosition` reads the
 * `_leaflet_pos` Leaflet itself stamped on the element, which is a LAYER
 * point; the map pane is at the origin here, but converting explicitly keeps
 * the assertion true of a panned map too.
 */
function iconPoint(map: L.Map, icon: HTMLElement): { x: number; y: number } {
  const point = map.layerPointToContainerPoint(L.DomUtil.getPosition(icon));
  return { x: point.x, y: point.y };
}

/**
 * Marker icons anchored exactly at `point`. Returns the LIST rather than the
 * first hit so callers assert `toHaveLength(1)` — a lookup that found nothing
 * then fails on a missing property reads as a crash, not as a diagnosis.
 */
function markersAt(
  container: HTMLElement,
  map: L.Map,
  point: { x: number; y: number },
): HTMLElement[] {
  return markerIcons(container).filter((icon) => {
    const at = iconPoint(map, icon);
    return at.x === point.x && at.y === point.y;
  });
}

/** Real layer instances actually attached to the map, by type. */
function layersOn<T extends L.Layer>(
  map: L.Map,
  ctor: new (...args: never[]) => T,
): T[] {
  const found: T[] = [];
  map.eachLayer((layer) => {
    if (layer instanceof ctor) {
      found.push(layer);
    }
  });
  return found;
}

describe("ScanPane mounted against a real Leaflet map", () => {
  beforeEach(() => {
    createdMaps.length = 0;
  });

  it("does not throw when control points are already present on the very first render", () => {
    // The "Adjust points" path: re-georeferencing an already-georeferenced map
    // reuses the create flow, so the raster, the click catcher and N markers
    // all arrive together rather than one at a time. This is the shape that
    // produced PR 2's Critical (a TypeError thrown from inside a React
    // passive-effect commit, which `render()` propagates synchronously), and
    // no mocked test can reach it because the throw came from inside Leaflet.
    // ScanPane is a MapContainer ROOT and uses no custom pane, so the specific
    // pane-ordering race PR 2 hit cannot occur here — what is asserted is that
    // the whole real stack (L.Map on CRS.Simple, ImageOverlay, three draggable
    // markers) survives a first render that is already populated.
    expect(() => {
      mountScan();
    }).not.toThrow();
    expect(markerIcons(document.body)).toHaveLength(3);
  });

  it("lays the scan raster out from scanBounds(pixelSize), in original pixel space", () => {
    const { map, container } = mountScan();

    // Pin the literal, so the comparison below is not scanBounds against
    // itself: -800 is the raster's HEIGHT as a southward latitude, 1200 its
    // width as an eastward longitude.
    expect(scanBounds(PIXEL_SIZE)).toEqual([
      [-800, 0],
      [0, 1200],
    ]);

    // The overlay is genuinely attached to the map (eachLayer only walks
    // layers that are), is genuinely an L.ImageOverlay, and carries those
    // bounds.
    const overlays = layersOn(map, L.ImageOverlay);
    expect(overlays).toHaveLength(1);
    const bounds = overlays[0].getBounds();
    expect([
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()],
    ]).toEqual([
      [-800, 0],
      [0, 1200],
    ]);
    expect(overlays[0].getElement()?.getAttribute("src")).toBe("blob:scan");

    // And Leaflet resolved those bounds to the layout the rest of this file
    // treats as ground truth. Asserting the RENDERED rectangle (not just the
    // bounds object) is what makes `containerPointOf` an independent anchor:
    // it is the raster's own footprint on screen.
    const image = container.querySelector<HTMLImageElement>(
      "img.leaflet-image-layer",
    );
    expect(image).not.toBeNull();
    expect(iconPoint(map, image as HTMLElement)).toEqual(IMAGE_ORIGIN);
    expect(image?.style.width).toBe("600px");
    expect(image?.style.height).toBe("400px");
    // Square pixels: the same scale really does apply to both axes, so
    // `containerPointOf` is not quietly using an x-scale on y.
    expect(600 / PIXEL_SIZE.width).toBe(IMAGE_SCALE);
    expect(400 / PIXEL_SIZE.height).toBe(IMAGE_SCALE);
  });

  it("turns a real click on the raster into the ORIGINAL image pixel under the cursor, row not mirrored", () => {
    const { container, onPickPoint } = mountScan({ gcps: [] });
    const image = container.querySelector<HTMLImageElement>(
      "img.leaflet-image-layer",
    ) as HTMLElement;
    // jsdom returns an all-zero getBoundingClientRect, so Leaflet's
    // `getMousePosition` (clientX - rect.left, scale 1) makes clientX/clientY
    // exactly the container point. The click is dispatched on the IMAGE, the
    // thing actually under the cursor, and bubbles to the map container where
    // Leaflet's listener lives — the same path a browser click takes.
    const clickAt = (pixel: { x: number; y: number }) => {
      const point = containerPointOf(pixel);
      image.dispatchEvent(mouse("click", point.x, point.y));
    };

    // High on the scan → a SMALL row. Mirrored, this reports 700.
    clickAt({ x: 300, y: 100 });
    expect(onPickPoint).toHaveBeenLastCalledWith(300, 100);

    // Low on the scan → a LARGE row. Mirrored, this reports 100. Together
    // with the click above, this pins the DIRECTION of the row axis and not
    // merely one coordinate.
    clickAt({ x: 900, y: 700 });
    expect(onPickPoint).toHaveBeenLastCalledWith(900, 700);

    // Left and low, to catch a transposed pair that both points above would
    // survive if x and y happened to agree.
    clickAt({ x: 100, y: 600 });
    expect(onPickPoint).toHaveBeenLastCalledWith(100, 600);

    // The letterboxing is real and clickable: (5, 5) is inside the map
    // container but outside the 600x400 image, i.e. pixel (-30, -70). The map
    // delivers the click (maxBounds constrains the VIEW, not the pointer) and
    // clampToRaster is what keeps an off-raster coordinate out of IndexedDB.
    image.dispatchEvent(mouse("click", 5, 5));
    expect(onPickPoint).toHaveBeenLastCalledWith(0, 0);

    // Exactly four: one delivery per click, so the click catcher is
    // subscribed once and not once per render.
    expect(onPickPoint).toHaveBeenCalledTimes(4);
  });

  it("places each control point at its own image pixel, numbered in list order and draggable", () => {
    const { map, container } = mountScan();
    expect(markerIcons(container)).toHaveLength(3);

    GCPS.forEach((gcp, index) => {
      // Matched BY POSITION, then checked for its label, so the assertion ties
      // a number to a point rather than to a DOM ordinal: the number is how a
      // user matches a GCP-list row to a marker.
      const here = markersAt(container, map, containerPointOf(gcp.pixel));
      expect(here).toHaveLength(1);
      expect(here[0].textContent).toBe(String(index + 1));
    });

    // Draggable as an EFFECT, not as a prop: `draggable` reaching the real
    // Marker is what makes Leaflet instantiate and enable a MarkerDrag
    // handler. `?.enabled()` returning undefined (no handler at all) fails
    // this, unlike a truthiness check.
    const markers = layersOn(map, L.Marker);
    expect(markers).toHaveLength(3);
    markers.forEach((marker) => {
      expect(marker.dragging?.enabled()).toBe(true);
    });
  });

  it("marks the selected control point by matching its id, not its 1-based label", () => {
    // "south-cove" is index 1, so its label is "2". No fixture id equals any
    // label, so comparing `String(index + 1)` to `selectedGcpId` would select
    // nothing at all and this test would see zero highlighted markers.
    const { map, container } = mountScan({ selectedGcpId: "south-cove" });
    const selected = markerIcons(container).filter((icon) =>
      icon.classList.contains("gcp-marker--selected"),
    );
    expect(selected).toHaveLength(1);
    expect(iconPoint(map, selected[0])).toEqual(
      containerPointOf({ x: 900, y: 700 }),
    );
    expect(selected[0].textContent).toBe("2");
  });

  it("keeps a real Leaflet drag alive across a mid-drag reposition, with no second dragstart", async () => {
    // FU1 fixed an undo defect whose premise was verified only by READING
    // Leaflet 1.9.4: that `Draggable._onMove` anchors to `_startPos + offset`
    // (leaflet-src.js:6106), so React moving a marker mid-undo does NOT cancel
    // the live drag and the next pointer move still fires `drag` with no new
    // `dragstart`. Every other test in this feature mocks the framework that
    // fact lives in. This one drives the real handler chain: a real mousedown
    // on the real marker icon, real mousemoves, Leaflet's real Draggable, and
    // the real rAF commit.
    //
    // Scope note: this proves the LEAFLET behaviour FU1 relies on. It does not
    // exercise `useGeoreferenceSession`'s fix, which has its own unit tests.
    const { container, map, onDragStartGcp, onMoveGcp, rerenderWith } =
      mountScan();
    const start = containerPointOf({ x: 300, y: 100 });
    const found = markersAt(container, map, start);
    expect(found).toHaveLength(1);
    const icon = found[0];
    expect(icon.textContent).toBe("1");

    // Pressing is not yet dragging: Leaflet fires `dragstart` on the first
    // move past its click tolerance, never on mousedown. If `dragstart` were
    // wired to `onMoveGcp` and `drag` to `onDragStartGcp` (a transposition
    // `tsc` cannot see — both take an id first), the counts below break.
    icon.dispatchEvent(mouse("mousedown", start.x, start.y));
    expect(onDragStartGcp).not.toHaveBeenCalled();
    expect(onMoveGcp).not.toHaveBeenCalled();

    // +20,+40 container px = +40,+80 image px → pixel (340, 180).
    icon.dispatchEvent(mouse("mousemove", start.x + 20, start.y + 40));
    await nextFrame();
    expect(onDragStartGcp.mock.calls).toEqual([["north-headland"]]);
    expect(onMoveGcp).toHaveBeenLastCalledWith("north-headland", 340, 180);

    // Ctrl+Z, pointer still down: the session restores the pre-drag state and
    // React re-positions the marker underneath Leaflet's live drag. A NEW
    // pixel object is what makes react-leaflet call `setLatLng` (it compares
    // `position` by reference), which is exactly what an undo produces.
    rerenderWith({
      gcps: [{ ...GCPS[0], pixel: { x: 300, y: 100 } }, GCPS[1], GCPS[2]],
    });
    expect(iconPoint(map, icon)).toEqual(start);
    onMoveGcp.mockClear();

    // The drag is still live. +40,+80 container px from the ORIGINAL press →
    // `_startPos + offset` → pixel (380, 260). Had Leaflet instead re-anchored
    // to where React just put the marker, this would report (340, 180) — the
    // previous move's value — so the two hypotheses are distinguishable here,
    // which is the whole point of repositioning AFTER a move rather than
    // before one.
    icon.dispatchEvent(mouse("mousemove", start.x + 40, start.y + 80));
    await nextFrame();
    expect(onMoveGcp).toHaveBeenCalledTimes(1);
    expect(onMoveGcp).toHaveBeenLastCalledWith("north-headland", 380, 260);
    // The load-bearing half for FU1: no SECOND dragstart, so no second undo
    // snapshot is pushed and the session cannot tell this apart from the same
    // uninterrupted drag. That is precisely why the session needs its own
    // "an undo just happened" flag rather than leaning on `dragstart`.
    expect(onDragStartGcp).toHaveBeenCalledTimes(1);

    // Always finish: `Draggable._dragging` is a static, so a drag left open
    // would block every later drag in the process.
    icon.dispatchEvent(mouse("mouseup", start.x + 40, start.y + 80));
  });
});
