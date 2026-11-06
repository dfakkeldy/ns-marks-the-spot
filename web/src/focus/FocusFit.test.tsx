import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusFit } from "./FocusFit";
import type { FocusBounds } from "./focusDefinition";

const map = vi.hoisted(() => {
  const handlers = new Map<string, Set<() => void>>();
  let center = { lat: 45.7, lng: -61.4, equals(other: { lat: number; lng: number }) { return other.lat === this.lat && other.lng === this.lng; } };
  let zoom = 12;
  return {
    fitBounds: vi.fn(() => { zoom = 12; }),
    getSize: vi.fn(() => ({ x: 1000, y: 800 })),
    getCenter: () => center,
    getZoom: () => zoom,
    on: (name: string, handler: () => void) => { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(handler); },
    off: (name: string, handler: () => void) => { handlers.get(name)?.delete(handler); },
    fire: (name: string) => { for (const handler of [...(handlers.get(name) ?? [])]) handler(); },
    moveTo: (lat: number, lng: number, nextZoom: number) => { center = { ...center, lat, lng }; zoom = nextZoom; },
    reset: () => { handlers.clear(); center = { ...center, lat: 45.7, lng: -61.4 }; zoom = 12; },
  };
});
vi.mock("react-leaflet", () => ({ useMap: () => map }));

const rhodena: FocusBounds = [[45.69, -61.52], [45.9, -61.28]];
const elsewhere: FocusBounds = [[45.4, -61.2], [45.7, -60.6]];

describe("FocusFit", () => {
  beforeEach(() => { map.fitBounds.mockClear(); map.reset(); map.getSize.mockReturnValue({ x: 1000, y: 800 }); });
  const plain = { paddingTopLeft: [24, 24], paddingBottomRight: [24, 24], animate: false };

  it("waits for a first request", () => {
    render(<FocusFit request={{ revision: 0, bounds: null }} />);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("fits once per new revision, to that request's bounds", () => {
    const view = render(<FocusFit request={{ revision: 1, bounds: rhodena }} />);
    expect(map.fitBounds).toHaveBeenCalledExactlyOnceWith(rhodena, plain);

    view.rerender(<FocusFit request={{ revision: 1, bounds: rhodena }} />);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    view.rerender(<FocusFit request={{ revision: 2, bounds: elsewhere }} />);
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    expect(map.fitBounds).toHaveBeenLastCalledWith(elsewhere, plain);
  });

  it("fits again when the map changes size soon after, unless the reader has moved it", () => {
    render(<FocusFit request={{ revision: 1, bounds: rhodena }} />);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    // The licence strip folds and the map grows: the camera is where the fit left it.
    map.fire("resize");
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    // The reader pans, then the map changes size again: their view stays.
    map.moveTo(45.8, -61.3, 14);
    map.fire("resize");
    map.fire("resize");
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("frames the area beside a map overlay on a wide map, and uses the whole width on a narrow one", () => {
    render(<FocusFit request={{ revision: 1, bounds: rhodena, insetRight: 264 }} />);
    expect(map.fitBounds).toHaveBeenLastCalledWith(rhodena, { ...plain, paddingBottomRight: [288, 24] });
    map.getSize.mockReturnValue({ x: 390, y: 700 });
    render(<FocusFit request={{ revision: 1, bounds: elsewhere, insetRight: 264 }} />);
    expect(map.fitBounds).toHaveBeenLastCalledWith(elsewhere, plain);
  });
});
