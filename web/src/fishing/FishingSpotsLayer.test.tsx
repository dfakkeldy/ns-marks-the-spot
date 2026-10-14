import { readFileSync } from "node:fs";
import { act, render } from "@testing-library/react";
import L from "leaflet";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fishingSpotsLayer } from "../layers/fishingLayers";
import type { ContextMapLayer } from "../layers/contextLayerCatalog";
import { parseCalendar, parseSpots, type FishingDataState } from "./data";
import { FishingSpotsLayer, type FishingSpotsPageState } from "./FishingSpotsLayer";

const state = vi.hoisted(() => ({ map: null as unknown as L.Map, data: { status: "loading" } as FishingDataState, enabled: [] as (boolean | undefined)[] }));
vi.mock("react-leaflet", () => ({ useMap: () => state.map }));
vi.mock("./data", async (importOriginal) => ({
  ...await importOriginal<typeof import("./data")>(),
  useFishingData: (enabled?: boolean) => {
    state.enabled.push(enabled);
    return state.data;
  },
}));

const { spots } = parseSpots(JSON.parse(readFileSync("public/fishing/spots.geojson", "utf8")));
const calendar = parseCalendar(JSON.parse(readFileSync("public/fishing/calendar.json", "utf8")));
const ready: FishingDataState = { status: "ready", data: { spots, rejectedSpots: 0, calendar, rules: null } };
const layer = fishingSpotsLayer as unknown as ContextMapLayer;

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  state.map = L.map(container, { center: [45.85, -61.35], zoom: 9, zoomAnimation: false, fadeAnimation: false });
  state.data = ready;
  state.enabled = [];
});
afterEach(() => {
  state.map.remove();
  container.remove();
});

function page(overrides: Partial<FishingSpotsPageState> = {}): FishingSpotsPageState {
  return { month: null, species: null, selectedId: null, mapReveal: 0, onSelect: vi.fn(), onOpenCard: vi.fn(), ...overrides };
}
const pins = () => [...container.querySelectorAll<HTMLElement>(".fishing-spot-marker")];
const pinIds = () => pins().map((pin) => pin.dataset.spotId).sort();

function mount(props: { page?: FishingSpotsPageState; visible?: boolean } = {}) {
  const status = vi.fn();
  const view = render(<FishingSpotsLayer layer={layer} visible={props.visible ?? true} page={props.page} onStatusChange={status} renderMode="interactive" />);
  return { status, ...view };
}

describe("FishingSpotsLayer", () => {
  it("draws one numbered, labelled pin per spot", () => {
    const { status } = mount({ page: page() });
    expect(pins()).toHaveLength(spots.length);
    const pin = pins().find((element) => element.dataset.spotId === "S17")!;
    expect(pin.textContent).toBe("17");
    expect(pin.getAttribute("aria-label")).toBe(`Map pin 17: ${spots.find(({ id }) => id === "S17")!.name}`);
    expect(pin.getAttribute("role")).toBe("button");
    expect(pin.style.getPropertyValue("--fishing-spot-color")).toBeTruthy();
    expect(status).toHaveBeenLastCalledWith("fishing-spots", { status: "ready", count: spots.length });
  });

  it("keeps only the month's pins, and says the filter did it", () => {
    const { status, rerender } = mount({ page: page() });
    rerender(<FishingSpotsLayer layer={layer} visible page={page({ month: 1 })} onStatusChange={status} renderMode="interactive" />);
    expect(pinIds()).toEqual(["S02", "S14", "S25", "S26", "S27"]);
    expect(status).toHaveBeenLastCalledWith("fishing-spots", { status: "ready", message: `Filter: 5 of ${spots.length} spots for January` });
    rerender(<FishingSpotsLayer layer={layer} visible page={page()} onStatusChange={status} renderMode="interactive" />);
    expect(pins()).toHaveLength(spots.length);
  });

  it("reports a filter that hides every pin as the filter's doing, not an empty source", () => {
    const { status } = mount({ page: page({ month: 1, species: "atlantic_mackerel" }) });
    expect(pins()).toHaveLength(0);
    expect(status).toHaveBeenLastCalledWith("fishing-spots", { status: "ready", message: `Filter: No spots for January and Atlantic mackerel` });
    expect(status).not.toHaveBeenCalledWith("fishing-spots", { status: "returned-empty" });
  });

  it("keeps the source's own states distinct", () => {
    state.data = { status: "ready", data: { spots: [], rejectedSpots: 0, calendar, rules: null } };
    const empty = mount({ page: page() });
    expect(empty.status).toHaveBeenLastCalledWith("fishing-spots", { status: "returned-empty" });
    empty.unmount();
    state.data = { status: "error" };
    const failed = mount({ page: page() });
    expect(failed.status).toHaveBeenLastCalledWith("fishing-spots", { status: "error", message: "The spot file could not be loaded" });
    failed.unmount();
    state.data = { status: "loading" };
    expect(mount({ page: page() }).status).toHaveBeenLastCalledWith("fishing-spots", { status: "loading" });
  });

  it("says when the view is outside the spots' coverage", () => {
    state.map.setView([44.65, -63.57], 11);
    const { status } = mount({ page: page() });
    expect(status).toHaveBeenLastCalledWith("fishing-spots", { status: "outside-coverage" });
  });

  it("draws nothing and reports idle while the layer is off", () => {
    const { status } = mount({ page: page(), visible: false });
    expect(pins()).toHaveLength(0);
    expect(status).toHaveBeenLastCalledWith("fishing-spots", { status: "idle" });
  });

  it("asks for the fishing files only while the layer is on", () => {
    const { status, rerender } = mount({ visible: false });
    expect(state.enabled.length).toBeGreaterThan(0);
    expect(state.enabled.every((enabled) => enabled === false)).toBe(true);
    rerender(<FishingSpotsLayer layer={layer} visible onStatusChange={status} renderMode="interactive" />);
    expect(state.enabled.at(-1)).toBe(true);
  });

  it("selects a spot from its pin and rings the selected pin with its popup open", () => {
    const onSelect = vi.fn();
    const { status, rerender } = mount({ page: page({ onSelect }) });
    const pin = () => pins().find((element) => element.dataset.spotId === "S04")!;
    act(() => { pin().click(); });
    expect(onSelect).toHaveBeenCalledWith("S04");
    rerender(<FishingSpotsLayer layer={layer} visible page={page({ onSelect, selectedId: "S04" })} onStatusChange={status} renderMode="interactive" />);
    expect(pin().classList.contains("is-selected")).toBe(true);
    expect(pins().filter((element) => element.classList.contains("is-selected"))).toHaveLength(1);
    const popup = container.querySelector(".fishing-spot-popup");
    expect(popup?.textContent).toContain(spots.find(({ id }) => id === "S04")!.name);
    expect(popup?.querySelector("button")?.textContent).toBe("Open the spot card");
  });

  it("selects a focused pin with Enter or Space, as a click does", () => {
    const onSelect = vi.fn();
    mount({ page: page({ onSelect }) });
    const pin = pins().find((element) => element.dataset.spotId === "S16")!;
    const press = (key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => { pin.dispatchEvent(event); });
      return event;
    };
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith("S16");
    expect(press(" ").defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(press("a").defaultPrevented).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("hands the popup's card button to the page", () => {
    const onOpenCard = vi.fn();
    mount({ page: page({ selectedId: "S10", onOpenCard }) });
    act(() => { container.querySelector<HTMLButtonElement>(".fishing-spot-popup button")!.click(); });
    expect(onOpenCard).toHaveBeenCalledWith("S10");
  });

  it("clears the selection when the reader closes the popup, but not when the page changes it", () => {
    const onSelect = vi.fn();
    const { status, rerender } = mount({ page: page({ onSelect, selectedId: "S10" }) });
    rerender(<FishingSpotsLayer layer={layer} visible page={page({ onSelect, selectedId: "S11" })} onStatusChange={status} renderMode="interactive" />);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => { state.map.closePopup(); });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("brings the map to the spot when the page asks", () => {
    const { status, rerender } = mount({ page: page({ selectedId: "S04" }) });
    const zoom = state.map.getZoom();
    rerender(<FishingSpotsLayer layer={layer} visible page={page({ selectedId: "S04", mapReveal: 1 })} onStatusChange={status} renderMode="interactive" />);
    expect(state.map.getZoom()).toBeGreaterThanOrEqual(12);
    expect(state.map.getZoom()).toBeGreaterThan(zoom);
    const centre = state.map.getCenter();
    const spot = spots.find(({ id }) => id === "S04")!;
    // Near, not on: the opened popup then pans the map to fit itself.
    expect(centre.lat).toBeCloseTo(spot.latitude, 1);
    expect(centre.lng).toBeCloseTo(spot.longitude, 1);
  });

  it("drops a request to show a spot made while the layer was off", () => {
    const { status, rerender } = mount({ page: page({ selectedId: "S04" }), visible: false });
    rerender(<FishingSpotsLayer layer={layer} visible={false} page={page({ selectedId: "S04", mapReveal: 1 })} onStatusChange={status} renderMode="interactive" />);
    const zoom = state.map.getZoom();
    rerender(<FishingSpotsLayer layer={layer} visible page={page({ selectedId: "S04", mapReveal: 1 })} onStatusChange={status} renderMode="interactive" />);
    expect(state.map.getZoom()).toBe(zoom);
    // The selection itself still shows once the layer is back.
    expect(pins().find((element) => element.dataset.spotId === "S04")?.classList.contains("is-selected")).toBe(true);
  });

  it("keeps its own selection on the full map and links to the fishing page's card", () => {
    mount();
    expect(pins()).toHaveLength(spots.length);
    act(() => { pins().find((element) => element.dataset.spotId === "S21")!.click(); });
    const link = container.querySelector<HTMLAnchorElement>(".fishing-spot-popup a.fishing-spot-popup-card");
    expect(link?.getAttribute("href")).toBe("/fishing?spot=S21");
    expect(container.querySelector(".fishing-spot-popup")?.textContent).toContain("Project source");
  });

  it("draws print pins that cannot be focused or clicked", () => {
    render(<FishingSpotsLayer layer={layer} visible renderMode="print" />);
    expect(pins()).toHaveLength(spots.length);
    expect(pins()[0].getAttribute("tabindex")).toBeNull();
  });
});
