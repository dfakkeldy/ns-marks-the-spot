import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PokerMapTools, type PokerSession } from "./PokerMapTools";
import { fetchViewportCivicAddresses } from "../services/civicAddresses";

const map = vi.hoisted(() => ({
  getZoom: vi.fn(() => 18), setView: vi.fn(), getMaxZoom: () => 21, on: vi.fn(), off: vi.fn(), getCenter: () => ({ lat: 46.05, lng: -61.4 }),
  getBounds: () => ({ getNorth: () => 46.1, getSouth: () => 46, getWest: () => -61.5, getEast: () => -61.3 }),
  getContainer: () => document.body, getSize: () => ({ x: 400, y: 800 }),
  // One metre per pixel about a fixed origin is enough to test placement.
  latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: 200 + (lng + 61.4) * 77_000, y: 400 - (lat - 46.05) * 111_000 }),
}));
const events = vi.hoisted(() => ({ current: {} as Record<string, () => void> }));
vi.mock("react-leaflet", async () => {
  const { useState } = await import("react");
  type TooltipProps = { children: React.ReactNode; className: string; direction: string; offset: [number, number] };
  return {
    useMap: () => map,
    useMapEvents: (handlers: Record<string, () => void>) => { events.current = handlers; },
    CircleMarker: ({ children }: { children: React.ReactNode }) => <div className="dot">{children}</div>,
    // Like react-leaflet 5's Tooltip, whose options are fixed when it is created.
    Tooltip: (props: TooltipProps) => {
      const [{ className, direction, offset }] = useState(props);
      return <span className={className} data-direction={direction} data-offset={offset.join(",")}>{props.children}</span>;
    },
  };
});
vi.mock("../services/civicAddresses", async (original) => ({
  ...await original<typeof import("../services/civicAddresses")>(),
  fetchViewportCivicAddresses: vi.fn(),
}));
const session: PokerSession = {
  address: null, revision: 0, onCivicStatusChange: vi.fn(),
};
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); map.getZoom.mockReturnValue(18);
  vi.mocked(fetchViewportCivicAddresses).mockResolvedValue({ addresses: [], truncated: false, unreadableRows: 0 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(250); });

it("waits for street-level zoom and keeps public civic numbers independent of restricted parcel access", async () => {
  map.getZoom.mockReturnValue(15);
  render(<PokerMapTools session={session} />);
  await settle();
  expect(fetchViewportCivicAddresses).not.toHaveBeenCalled();
  expect(session.onCivicStatusChange).toHaveBeenLastCalledWith(expect.stringMatching(/Zoom to level 16/));
  map.getZoom.mockReturnValue(18);
  act(() => events.current.moveend());
  await settle();
  expect(fetchViewportCivicAddresses).toHaveBeenCalledOnce();
});

it("aborts old viewport work and ignores its late reply", async () => {
  let resolveOld!: (value: Awaited<ReturnType<typeof fetchViewportCivicAddresses>>) => void;
  vi.mocked(fetchViewportCivicAddresses).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  render(<PokerMapTools session={session} />);
  await settle();
  const signal = vi.mocked(fetchViewportCivicAddresses).mock.calls[0][1];
  act(() => events.current.movestart());
  expect(signal?.aborted).toBe(true);
  act(() => events.current.moveend());
  await settle();
  await act(async () => resolveOld({ addresses: [], truncated: true, unreadableRows: 0 }));
  expect(session.onCivicStatusChange).toHaveBeenLastCalledWith(expect.stringMatching(/No civic points returned/));
});

it("waits for a pan or zoom to end before fetching the view", async () => {
  render(<PokerMapTools session={session} />);
  await settle();
  vi.mocked(fetchViewportCivicAddresses).mockClear();
  act(() => events.current.movestart());
  await settle();
  expect(fetchViewportCivicAddresses).not.toHaveBeenCalled();
  act(() => events.current.moveend());
  await settle();
  expect(fetchViewportCivicAddresses).toHaveBeenCalledOnce();
});

it("fetches inside a zoom only after the zoom ends, even when a framing pan ends first", async () => {
  render(<PokerMapTools session={session} />);
  await settle();
  vi.mocked(fetchViewportCivicAddresses).mockClear();
  // Choosing an address zooms to it and frames it with a pan that finishes mid-zoom.
  act(() => { events.current.movestart(); events.current.zoomstart(); events.current.movestart(); events.current.moveend(); });
  await settle();
  expect(fetchViewportCivicAddresses).not.toHaveBeenCalled();
  act(() => { events.current.zoomend(); events.current.moveend(); });
  await settle();
  expect(fetchViewportCivicAddresses).toHaveBeenCalledOnce();
});

it("recovers when an interrupted fly-to never reports its end", async () => {
  render(<PokerMapTools session={session} />);
  await settle();
  vi.mocked(fetchViewportCivicAddresses).mockClear();
  act(() => { events.current.movestart(); events.current.zoomstart(); });
  await settle();
  expect(fetchViewportCivicAddresses).not.toHaveBeenCalled();
  // A whole wait later the view has not moved, so it is treated as settled.
  await settle();
  expect(fetchViewportCivicAddresses).toHaveBeenCalledOnce();
});

it("discloses errors and capped views to the attribution footer", async () => {
  vi.mocked(fetchViewportCivicAddresses).mockRejectedValueOnce(new Error("offline"));
  render(<PokerMapTools session={session} />);
  await settle();
  expect(session.onCivicStatusChange).toHaveBeenLastCalledWith(expect.stringMatching(/Civic numbers unavailable/));
  vi.mocked(fetchViewportCivicAddresses).mockResolvedValueOnce({ addresses: [], truncated: true, unreadableRows: 0 });
  act(() => events.current.moveend());
  await settle();
  expect(session.onCivicStatusChange).toHaveBeenLastCalledWith(expect.stringMatching(/Showing up to 500/));
});

const civic = (pntid: string, civicnum: string, metresEast: number, metresNorth: number, unit_num: string | null = null) => ({
  pntid, label: `${civicnum} Main St`, coordinates: [-61.4 + metresEast / 77_000, 46.05 + metresNorth / 111_000] as [number, number],
  properties: { pntid, civicnum, civsuffix: null, unit_num, add_loc: null, strprefix: null, strname: "Main", strsuffix: "St", strdir: null, comm: "Port Hood", county: "Inverness" },
}) as unknown as import("../services/civicAddresses").CivicAddress;
const tooltips = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".poker-civic-number")];

it("places crowded civic numbers apart and hides, without dropping, one with no room", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  // Three units share one provincial point and number; a ring of neighbours boxes in the middle house.
  const ring = [[0, -18], [22, 0], [-22, 0], [0, 18], [22, -18], [-22, -18], [22, 18], [-22, 18]].map(([x, y], i) => civic(`n${i}`, `${10 + i}`, x, -y));
  const addresses = [...[1, 2, 3].map((unit) => civic("shared", "40", 0, 0, `${unit}`)), ...ring];
  vi.mocked(fetchViewportCivicAddresses).mockResolvedValue({ addresses, truncated: false, unreadableRows: 0 });
  const { container } = render(<PokerMapTools session={session} />);
  await settle();
  const tips = tooltips(container);
  expect(tips.map((tip) => tip.textContent).filter((text) => text === "40")).toHaveLength(1);
  expect(container.querySelectorAll(".dot")).toHaveLength(9);
  expect(tips.every((tip) => tip.dataset.direction === "center")).toBe(true);
  const shown = tips.filter((tip) => !tip.classList.contains("is-unplaced"));
  expect(new Set(shown.map((tip) => tip.dataset.offset)).size).toBeGreaterThan(1);
  // The boxed-in number keeps its tooltip, hidden, so the 3D view still has it.
  expect(tips.find((tip) => tip.textContent === "40")?.classList.contains("is-unplaced")).toBe(true);
  expect(error.mock.calls.some(([message]) => String(message).includes("same key"))).toBe(false);
  error.mockRestore();
});

it("places two different numbers that share one provincial point separately", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(fetchViewportCivicAddresses).mockResolvedValue({ addresses: [civic("pt", "47", 0, 0), civic("pt", "49", 0, 0)], truncated: false, unreadableRows: 0 });
  const { container } = render(<PokerMapTools session={session} />);
  await settle();
  const tips = tooltips(container);
  expect(tips.map((tip) => tip.textContent).sort()).toEqual(["47", "49"]);
  expect(container.querySelectorAll(".dot")).toHaveLength(2);
  expect(new Set(tips.map((tip) => tip.dataset.offset)).size).toBe(2);
  expect(error.mock.calls.some(([message]) => String(message).includes("same key"))).toBe(false);
  error.mockRestore();
});

it("shows every number at the closest zoom, even one with no clear spot", async () => {
  map.getZoom.mockReturnValue(21);
  const ring = [[0, -18], [22, 0], [-22, 0], [0, 18], [22, -18], [-22, -18], [22, 18], [-22, 18]].map(([x, y], i) => civic(`n${i}`, `${10 + i}`, x, -y));
  vi.mocked(fetchViewportCivicAddresses).mockResolvedValue({ addresses: [civic("shared", "40", 0, 0), ...ring], truncated: false, unreadableRows: 0 });
  const { container } = render(<PokerMapTools session={session} />);
  await settle();
  expect(tooltips(container).filter((tip) => tip.classList.contains("is-unplaced"))).toHaveLength(0);
});

it("keeps a neighbour's number off the ring of a chosen address the view did not return", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const chosen = civic("chosen", "117", 0, 0);
  // A capped view can leave the chosen point out; this neighbour sits 18 m east and 10 m south of it.
  vi.mocked(fetchViewportCivicAddresses).mockResolvedValue({ addresses: [civic("near", "119", 18, -10)], truncated: true, unreadableRows: 0 });
  const { container } = render(<PokerMapTools session={{ ...session, address: chosen }} />);
  await settle();
  // Above its dot would cover the ring's edge; beside it is clear.
  expect(tooltips(container).find((tip) => tip.textContent === "119")?.dataset.offset).toBe("20,0");
});

it("keeps numbers out from under a map control when the map does not start at the window's corner", async () => {
  const rect = (left: number, top: number, right: number, bottom: number) => () => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON() {} }) as DOMRect;
  // A desktop layout: the map starts 320 px from the window's left edge, and a control sits just above the dot.
  const frame = document.createElement("div");
  frame.getBoundingClientRect = rect(320, 0, 720, 800);
  const control = document.createElement("div");
  control.className = "leaflet-control";
  control.getBoundingClientRect = rect(320 + 180, 360, 320 + 220, 395);
  document.body.append(frame, control);
  const original = map.getContainer;
  map.getContainer = () => frame;
  try {
    vi.mocked(fetchViewportCivicAddresses).mockResolvedValue({ addresses: [civic("a", "117", 0, 0)], truncated: false, unreadableRows: 0 });
    const { container } = render(<PokerMapTools session={session} />);
    await settle();
    expect(tooltips(container).find((tip) => tip.textContent === "117")?.dataset.offset).toBe("0,15");
  } finally {
    map.getContainer = original;
    frame.remove(); control.remove();
  }
});

it("places numbers again with the loaded face's widths once a web font arrives", async () => {
  let charWidth = 8;
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get(this: HTMLElement) { return this.classList.contains("poker-civic-number") ? (this.textContent ?? "").length * charWidth : 0; } });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get(this: HTMLElement) { return this.classList.contains("poker-civic-number") ? 16 : 0; } });
  const fonts = Object.assign(new EventTarget(), { status: "loading" });
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  try {
    vi.mocked(fetchViewportCivicAddresses).mockResolvedValue({ addresses: [civic("a", "901", 0, 0), civic("b", "903", 30, 0)], truncated: false, unreadableRows: 0 });
    const { container } = render(<PokerMapTools session={session} />);
    await settle();
    const offsetOf = (text: string) => tooltips(container).find((tip) => tip.textContent === text)?.dataset.offset;
    // The fallback face is narrow: both numbers fit above their dots.
    expect(offsetOf("903")).toBe("0,-13");
    charWidth = 20;
    fonts.status = "loaded";
    act(() => { fonts.dispatchEvent(new Event("loadingdone")); });
    // The loaded face is wider, so 903 moves beside its dot.
    expect(offsetOf("903")).toBe("35,0");
  } finally {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
    delete (document as unknown as { fonts?: unknown }).fonts;
  }
});

it("places the chosen address first, clear of its selection ring", async () => {
  // A desktop-width window: choosing an address does not reframe it under a phone dock.
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const chosen = civic("chosen", "117", 0, 0);
  vi.mocked(fetchViewportCivicAddresses).mockResolvedValue({ addresses: [civic("near", "119", 0, 6), chosen], truncated: false, unreadableRows: 0 });
  const { container } = render(<PokerMapTools session={{ ...session, address: chosen }} />);
  await settle();
  const tip = tooltips(container).find((element) => element.textContent === "117")!;
  expect(tip.classList.contains("is-unplaced")).toBe(false);
  // Above the dot, beyond the ring's ten pixels.
  expect(tip.dataset.offset).toBe("0,-22");
});
