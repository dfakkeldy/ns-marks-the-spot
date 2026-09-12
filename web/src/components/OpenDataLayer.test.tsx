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
  getZoom: () => 14, getSize: () => ({ x: 800, y: 600 }),
  getBounds: () => ({ getWest: () => -62, getEast: () => -61, getSouth: () => 45, getNorth: () => 46 }),
  getPane: () => ({ style: {} }),
  on: (_: string, cb: () => void) => { state.move = cb; }, off: vi.fn(),
};
const layer = provinceLayerCatalog.find(({ id }) => id === "crown-lands")!;
const result = (id: string) => ({ canvas: { toDataURL: () => id } as HTMLCanvasElement, count: 1 });
beforeEach(() => { vi.clearAllMocks(); state.images = []; });
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
