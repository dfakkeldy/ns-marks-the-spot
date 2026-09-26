import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PokerMapTools, type PokerSession } from "./PokerMapTools";
import { fetchViewportCivicAddresses } from "../services/civicAddresses";

const map = vi.hoisted(() => ({
  getZoom: vi.fn(() => 18), setView: vi.fn(), getMaxZoom: () => 21, on: vi.fn(), off: vi.fn(),
  getBounds: () => ({ getNorth: () => 46.1, getSouth: () => 46, getWest: () => -61.5, getEast: () => -61.3 }),
  getContainer: () => document.body, getSize: () => ({ x: 400, y: 800 }),
  // One metre per pixel about a fixed origin is enough to test placement.
  latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: 200 + (lng + 61.4) * 77_000, y: 400 - (lat - 46.05) * 111_000 }),
}));
const events = vi.hoisted(() => ({ current: {} as Record<string, () => void> }));
vi.mock("react-leaflet", () => ({
  useMap: () => map,
  useMapEvents: (handlers: Record<string, () => void>) => { events.current = handlers; },
  CircleMarker: ({ children }: { children: React.ReactNode }) => <div className="dot">{children}</div>,
  Tooltip: ({ children, className, direction, offset }: { children: React.ReactNode; className: string; direction: string; offset: [number, number] }) =>
    <span className={className} data-direction={direction} data-offset={offset.join(",")}>{children}</span>,
}));
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
afterEach(() => vi.useRealTimers());
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
  expect(error).not.toHaveBeenCalledWith(expect.stringContaining("same key"), expect.anything(), expect.anything());
  error.mockRestore();
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
  vi.unstubAllGlobals();
});
