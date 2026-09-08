import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PokerMapTools, type PokerSession } from "./PokerMapTools";
import { fetchViewportCivicAddresses } from "../services/civicAddresses";

const map = vi.hoisted(() => ({
  getZoom: vi.fn(() => 18), setView: vi.fn(),
  getBounds: () => ({ getNorth: () => 46.1, getSouth: () => 46, getWest: () => -61.5, getEast: () => -61.3 }),
}));
const events = vi.hoisted(() => ({ current: {} as Record<string, () => void> }));
vi.mock("react-leaflet", () => ({
  useMap: () => map,
  useMapEvents: (handlers: Record<string, () => void>) => { events.current = handlers; },
  CircleMarker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
