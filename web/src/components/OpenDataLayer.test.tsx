import { openProvinceSources } from "../layers/openDataSources";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { OpenDataLayer } from "./OpenDataLayer";
import { renderOpenData } from "../services/renderOpenData";
import { provinceLayerCatalog } from "../layers/layerCatalog";
import { OpenDataAreaTooLargeError } from "../services/openDataOverlay";
const state = vi.hoisted(() => ({ move: undefined as (() => void) | undefined, images: [] as string[] }));
vi.mock("../services/renderOpenData", () => ({ renderOpenData: vi.fn() }));
vi.mock("react-leaflet", () => ({ useMap: () => map }));
vi.mock("leaflet", () => ({ default: { imageOverlay: (url: string) => {
  state.images.push(url);
  const handlers: Record<string, () => void> = {};
  return { once: (name: string, cb: () => void) => { handlers[name] = cb; }, addTo: () => handlers.load(), remove: vi.fn() };
} } }));
const map = {
  getZoom: vi.fn(() => 14), getSize: () => ({ x: 800, y: 600 }),
  getBounds: () => ({ getWest: () => -62, getEast: () => -61, getSouth: () => 45, getNorth: () => 46 }),
  getPane: () => ({ style: {} }),
  on: (_: string, cb: () => void) => { state.move = cb; }, off: vi.fn(),
};
const layer = provinceLayerCatalog.find(({ id }) => id === "crown-lands")!;
const result = (id: string) => ({ canvas: { toDataURL: () => id } as HTMLCanvasElement, count: 1 });
beforeEach(() => { vi.clearAllMocks(); map.getZoom.mockReturnValue(14); state.images = []; });
it("aborts superseded viewport queries and never draws their late results", async () => {
  let first!: (r: ReturnType<typeof result>) => void;
  let second!: (r: ReturnType<typeof result>) => void;
  vi.mocked(renderOpenData).mockImplementationOnce(() => new Promise((resolve) => { first = resolve; })).mockImplementationOnce(() => new Promise((resolve) => { second = resolve; }));
  const status = vi.fn();
  const view = render(<OpenDataLayer layer={layer} visible zIndex={220} renderMode="interactive" onStatusChange={status} />);
  const signal = vi.mocked(renderOpenData).mock.calls[0][4]!;
  act(() => state.move!());
  expect(signal.aborted).toBe(true);
  await act(async () => { second(result("current")); });
  await act(async () => { first(result("stale")); });
  expect(state.images).toEqual(["current"]);
  expect(status).toHaveBeenLastCalledWith("crown-lands", { status: "ready", count: 1 });
  const latestSignal = vi.mocked(renderOpenData).mock.calls[1][4]!;
  view.unmount();
  expect(latestSignal.aborted).toBe(true);
});
it("asks for a smaller area when the complete download exceeds the budget", async () => {
  vi.mocked(renderOpenData).mockRejectedValueOnce(new OpenDataAreaTooLargeError("zoom in"));
  const status = vi.fn();
  render(<OpenDataLayer layer={layer} visible zIndex={220} renderMode="interactive" onStatusChange={status} />);
  await waitFor(() => expect(status).toHaveBeenLastCalledWith("crown-lands", { status: "zoom", minZoom: 15 }));
  expect(state.images).toEqual([]);
});

const base = { minZoom: 10, maxZoom: 23, opacity: 1 };
it('reuses Atlas roads while retaining supplemental bridge and road structures', () => {
  vi.mocked(renderOpenData).mockImplementation(() => new Promise(() => {}));
  render(<OpenDataLayer layer={{ ...base, id: 'roads', openData: openProvinceSources.roads }} visible zIndex={230} renderMode="interactive" atlasRoads backgroundLabels />);
  const source = vi.mocked(renderOpenData).mock.calls[0][0];
  expect(source.parts.map(part => part.dataset)).toEqual(['62ap-bhwk', 'x8jw-yjc2']);
  expect(source.labelField).toBeUndefined();
});
it('does not request a second main-road network when Roads already supplies it', () => {
  const status = vi.fn();
  vi.mocked(renderOpenData).mockImplementation(() => new Promise(() => {}));
  render(<OpenDataLayer layer={{ ...base, id: 'main-roads', openData: openProvinceSources['main-roads'] }} visible zIndex={230} renderMode="interactive" roadsVisible onStatusChange={status} />);
  expect(renderOpenData).not.toHaveBeenCalled();
  expect(status).toHaveBeenLastCalledWith('main-roads', { status: 'ready', message: 'Included in Roads layer' });
});
it('retains full road geometry and names when imagery hides the basemap', () => {
  vi.mocked(renderOpenData).mockImplementation(() => new Promise(() => {}));
  render(<OpenDataLayer layer={{ ...base, id: 'roads', openData: openProvinceSources.roads }} visible zIndex={230} renderMode="interactive" />);
  expect(vi.mocked(renderOpenData).mock.calls[0][0]).toMatchObject({ parts: openProvinceSources.roads.parts, labelField: 'street' });
});

it('keeps Main roads at zoom 9 where the Roads layer has not appeared yet', () => {
  map.getZoom.mockReturnValue(9);
  vi.mocked(renderOpenData).mockImplementation(() => new Promise(() => {}));
  render(<OpenDataLayer layer={{ ...base, minZoom: 9, id: 'main-roads', openData: openProvinceSources['main-roads'] }} visible roadsVisible zIndex={230} renderMode="interactive" />);
  expect(renderOpenData).toHaveBeenCalledOnce();
  map.getZoom.mockReturnValue(10);
  act(() => state.move!());
  expect(renderOpenData).toHaveBeenCalledOnce();
});
