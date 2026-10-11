import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveConditionsLayerCatalog, type WeatherRadarLayerDescriptor } from "../layers/layerCatalog";
import { fetchLatestRadarTime, RADAR_REFRESH_INTERVAL_MS } from "../services/weatherRadar";
import { WeatherRadarLayer } from "./WeatherRadarLayer";

const mocks = vi.hoisted(() => ({
  map: {},
  wms: vi.fn(),
}));
vi.mock("react-leaflet", () => ({ useMap: () => mocks.map }));
vi.mock("leaflet", () => ({ default: { tileLayer: { wms: mocks.wms } } }));
vi.mock("../services/weatherRadar", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/weatherRadar")>(),
  fetchLatestRadarTime: vi.fn(),
}));
const layer = liveConditionsLayerCatalog.find(({ id }) => id === "weather-radar") as WeatherRadarLayerDescriptor;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function wmsMock() {
  const handlers = new Map<string, () => void>();
  const tiles = {
    on: vi.fn((name: string, callback: () => void) => { handlers.set(name, callback); return tiles; }),
    off: vi.fn(() => { handlers.clear(); return tiles; }),
    addTo: vi.fn(), remove: vi.fn(), setParams: vi.fn(),
    fire: (name: string) => handlers.get(name)?.(),
  };
  return tiles;
}
let tiles: ReturnType<typeof wmsMock>;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  tiles = wmsMock(); mocks.wms.mockReturnValue(tiles);
  vi.mocked(fetchLatestRadarTime).mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("WeatherRadarLayer", () => {
  it("keeps failed tile batches in error until a subsequent successful load", () => {
    const status = vi.fn();
    render(<WeatherRadarLayer layer={layer} visible renderMode="interactive" onStatusChange={status} />);
    act(() => { tiles.fire("loading"); tiles.fire("tileerror"); tiles.fire("load"); });
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "error" });
    act(() => { tiles.fire("loading"); tiles.fire("load"); });
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "ready", observedAt: undefined });
  });

  it("detaches tile callbacks on disable so old image events cannot overwrite idle", () => {
    const status = vi.fn();
    const view = render(<WeatherRadarLayer layer={layer} visible renderMode="interactive" onStatusChange={status} />);
    view.rerender(<WeatherRadarLayer layer={layer} visible={false} renderMode="interactive" onStatusChange={status} />);
    expect(tiles.remove).toHaveBeenCalledOnce();
    status.mockClear();
    act(() => { tiles.fire("tileerror"); tiles.fire("load"); });
    expect(status).not.toHaveBeenCalled();
  });

  it("ignores an older capabilities reply after a newer refresh has pinned its frame", async () => {
    const old = deferred<string | null>(); const current = deferred<string | null>();
    vi.mocked(fetchLatestRadarTime).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    render(<WeatherRadarLayer layer={layer} visible renderMode="interactive" />);
    const oldSignal = vi.mocked(fetchLatestRadarTime).mock.calls[0][1];
    await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_REFRESH_INTERVAL_MS); });
    await act(async () => { current.resolve("2026-10-11T15:10:00Z"); await current.promise; });
    await act(async () => { old.resolve("2026-10-11T15:00:00Z"); await old.promise; });
    expect(oldSignal.aborted).toBe(true);
    expect(tiles.setParams.mock.calls).toEqual([[{ time: "2026-10-11T15:10:00Z" }]]);
  });
});
