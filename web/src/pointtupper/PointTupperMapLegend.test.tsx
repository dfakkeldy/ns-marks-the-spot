import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FOCUS_PAGE_STATE, focusOffersLayer, type FocusChromeContext } from "../focus/focusDefinition";
import { hiddenContextLayers } from "../layers/contextLayerCatalog";
import { provinceLayerCatalog, type ProvinceLayerId } from "../layers/layerCatalog";
import { builtInMapThemes } from "../themes/mapThemes";
import { pointTupperFocusDefinition } from "./focusDefinition";
import { PointTupperMapLegend } from "./PointTupperMapLegend";
import { pointTupperLegendGroups } from "./mapKey";

const hiddenProvinceLayers = Object.fromEntries(provinceLayerCatalog.map(({ id }) => [id, false])) as Record<ProvinceLayerId, boolean>;

function context(overrides: Partial<FocusChromeContext> = {}): FocusChromeContext {
  return {
    contextLayers: { ...hiddenContextLayers, "point-tupper-sites": true, "canadian-wind-turbines": true, tanks: true },
    setContextLayerVisibility: vi.fn(),
    pageState: EMPTY_FOCUS_PAGE_STATE,
    setPageState: vi.fn(),
    openMobileControls: vi.fn(),
    closeMobileControls: vi.fn(),
    fitToFocus: vi.fn(),
    startViewpointPick: vi.fn(),
    layerStatuses: {},
    provinceLayers: hiddenProvinceLayers,
    setProvinceLayerVisibility: vi.fn(),
    licenceAccepted: false,
    reviewProvinceLicence: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom always has storage */ } });
afterEach(cleanup);

const row = (name: RegExp) => screen.getByRole("button", { name });

describe("Point Tupper map key", () => {
  it("is a switch for every layer it explains", async () => {
    const view = context();
    render(<PointTupperMapLegend {...view} />);
    expect(row(/Wind turbines, installed/u)).toHaveAttribute("aria-pressed", "true");
    expect(row(/Transmission lines/u)).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(row(/Wind turbines, installed/u));
    expect(view.setContextLayerVisibility).toHaveBeenCalledWith("canadian-wind-turbines", false);
    await userEvent.click(row(/Transmission lines/u));
    expect(view.setContextLayerVisibility).toHaveBeenCalledWith("transmission-lines", true);
  });

  it("asks for the Province licence before it will show property lines", async () => {
    const locked = context();
    render(<PointTupperMapLegend {...locked} />);
    expect(row(/Property lines/u)).toHaveTextContent("Needs the Province licence");
    await userEvent.click(row(/Property lines/u));
    expect(locked.reviewProvinceLicence).toHaveBeenCalledTimes(1);
    expect(locked.setProvinceLayerVisibility).not.toHaveBeenCalled();
    cleanup();
    const accepted = context({ licenceAccepted: true });
    render(<PointTupperMapLegend {...accepted} />);
    expect(row(/Property lines/u)).toHaveTextContent("From zoom 14");
    await userEvent.click(row(/Property lines/u));
    expect(accepted.setProvinceLayerVisibility).toHaveBeenCalledWith("nsprd", true);
  });

  it("explains an empty map: the zoom a layer waits for, and what is in view", () => {
    render(<PointTupperMapLegend {...context({ layerStatuses: {
      tanks: { status: "zoom", minZoom: 13 },
      "canadian-wind-turbines": { status: "ready", count: 12 },
      "point-tupper-sites": { status: "ready", count: 1 },
    } })} />);
    expect(row(/Tanks/u)).toHaveTextContent("Zoom in to see (zoom 13+)");
    expect(row(/Wind turbines, installed/u)).toHaveTextContent("12 turbines in view");
    expect(row(/Key places/u)).toHaveTextContent("1 place in view");
  });

  it("folds away and remembers it", async () => {
    render(<PointTupperMapLegend {...context()} />);
    const toggle = screen.getByRole("button", { name: "Map key" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Transmission lines/u })).toBeNull();
    cleanup();
    render(<PointTupperMapLegend {...context()} />);
    expect(screen.getByRole("button", { name: "Map key" })).toHaveAttribute("aria-expanded", "false");
  });

  it("names the four kinds of key place with the map's own symbols", () => {
    render(<PointTupperMapLegend {...context()} />);
    const kinds = within(screen.getByRole("list", { name: "Kinds of key place" })).getAllByRole("listitem");
    expect(kinds.map((item) => item.textContent)).toEqual(["Terminal", "Power", "Water supply", "Mi'kmaw community"]);
    for (const item of kinds) expect(item.querySelector("svg")).not.toBeNull();
  });

  it("describes only layers the page offers, and the setup opens every one but the licensed parcels", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "point-tupper")!;
    const ids = pointTupperLegendGroups.flatMap(({ rows }) => rows).flatMap(({ layer }) => (layer.kind === "context" ? [layer.id] : []));
    for (const id of ids) {
      expect(focusOffersLayer(pointTupperFocusDefinition, id), id).toBe(true);
      expect(theme.layerIds, id).toContain(id);
    }
    expect(focusOffersLayer(pointTupperFocusDefinition, "nsprd")).toBe(true);
  });
});
