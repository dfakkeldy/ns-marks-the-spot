import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { electoralFill, electoralWashNote } from "../elections/electoralData";
import { ElectoralLegend } from "../components/ElectoralLayerControls";
import { SetupMapKey } from "../components/SetupMapKey";
import type { TaxSaleEvent } from "../data/taxSaleCatalog";
import type { FocusChromeContext } from "../focus/focusDefinition";
import { electoralLayerById } from "../layers/electoralLayers";
import { fishingKeyGroups, pointTupperKeyGroups, rhodenaKeyGroups, taxSaleKeyGroups } from "./setupMapKeyGroups";
import { describeThemeChanges } from "./themeState";

const context = (overrides: Partial<FocusChromeContext> = {}) => ({
  contextLayers: new Proxy({}, { get: () => true }),
  setContextLayerVisibility: vi.fn(),
  layerStatuses: {},
  provinceLayers: { nsprd: false },
  setProvinceLayerVisibility: vi.fn(),
  licenceAccepted: false,
  reviewProvinceLicence: vi.fn(),
  ...overrides,
}) as unknown as FocusChromeContext;

describe("setup map keys", () => {
  it("name the fishing marks from the catalogue, including the yellow National Park", () => {
    const groups = fishingKeyGroups(context());
    const labels = groups.flatMap((group) => group.rows.flatMap((row) => [row.label, ...(row.entries ?? []).map((entry) => entry.label)]));
    expect(labels).toEqual(expect.arrayContaining(["Numbered spots", "Salt water", "Stocked waters", "Core fishing harbours", "National Park"]));
  });

  it("make a row a real switch for its own layer", () => {
    const ctx = context();
    render(<SetupMapKey groups={fishingKeyGroups(ctx)} />);
    const toggle = screen.queryByRole("button", { name: /Stocked waters/ });
    // Folded under jsdom's width default only when matchMedia says so; open it if needed.
    if (!toggle) fireEvent.click(screen.getByRole("button", { name: "Map key" }));
    fireEvent.click(screen.getByRole("button", { name: /Stocked waters/ }));
    expect(ctx.setContextLayerVisibility).toHaveBeenCalledWith("stocked-waters", false);
  });

  it("name Rhodena's dashed lines and keep the two substation records apart", () => {
    const labels = rhodenaKeyGroups(context()).flatMap((group) => group.rows.flatMap((row) => [row.label, ...(row.entries ?? []).map((entry) => entry.label)]));
    expect(labels).toEqual(expect.arrayContaining(["Proposed new road", "Collector", "Transmission", "Substation, drawing", "Substation, noise model"]));
  });

  it("gate property lines behind the Province licence on the Point Tupper key", () => {
    const ctx = context();
    const rows = pointTupperKeyGroups(ctx).flatMap((group) => group.rows);
    const parcels = rows.find((row) => row.label === "Property lines")!;
    expect(parcels.hint).toBe("Needs the Province licence");
    parcels.onToggle?.();
    expect(ctx.reviewProvinceLicence).toHaveBeenCalled();
    expect(ctx.setProvinceLayerVisibility).not.toHaveBeenCalled();
  });

  it("list only the tax-sale bands that have a notice", () => {
    const now = Date.parse("2026-11-08T12:00:00-04:00");
    const event = { id: "a", saleStartsAt: "2026-11-23T10:00:00-04:00", status: "upcoming", listings: [] } as unknown as TaxSaleEvent;
    const [group] = taxSaleKeyGroups([event], now);
    expect(group.rows.map((row) => row.hint)).toEqual(["1 notice"]);
    expect(taxSaleKeyGroups([], now)[0].rows).toEqual([]);
  });
});

describe("the 2024 results wash", () => {
  it("keeps each source state in its own words", () => {
    expect(electoralWashNote(undefined)).toMatch(/^Loading/);
    expect(electoralWashNote({ status: "loading" })).toMatch(/^Loading/);
    expect(electoralWashNote({ status: "ready" })).toBeNull();
    expect(electoralWashNote({ status: "source-error" })).toMatch(/did not answer/);
    expect(electoralWashNote({ status: "licence-blocked" })).toMatch(/licence/);
    expect(electoralWashNote({ status: "returned-empty" })).toMatch(/no results/);
    expect(electoralWashNote({ status: "zoom", minZoom: 7 })).toMatch(/level 7/);
  });

  it("holds the party key until the colours are on the map", () => {
    const { rerender } = render(<ElectoralLegend mode="winner" night={false} waiting status={{ status: "loading" }} />);
    const legend = () => screen.getByLabelText("winner legend");
    expect(within(legend()).queryByText("Liberal")).not.toBeInTheDocument();
    expect(legend()).toHaveTextContent(/when the results arrive/);
    rerender(<ElectoralLegend mode="winner" night={false} waiting status={{ status: "ready", count: 55 }} />);
    expect(within(legend()).getByText("Liberal")).toBeInTheDocument();
    // A print has no status to wait for.
    rerender(<ElectoralLegend mode="winner" night={false} />);
    expect(within(legend()).getByText("Liberal")).toBeInTheDocument();
  });

  it("draws a tie with no fill, so it cannot read as an Independent win", () => {
    const layer = electoralLayerById["provincial-results-2024"];
    const tie = { PC_Votes: 50, Liberal_Votes: 50, NDP_Votes: 0, Green_Votes: 0, Independent_Votes: 0, Total: 100, Rejected: 0, Declined: 0 };
    expect(electoralFill(layer, tie, "winner", false)).toEqual({ colour: "transparent", label: "Tie" });
    const { container } = render(<ElectoralLegend mode="winner" night={false} />);
    const swatches = [...container.querySelectorAll("i")];
    expect(swatches.at(-1)).toHaveClass("electoral-legend-unfilled");
    expect(swatches.at(-2)).not.toHaveClass("electoral-legend-unfilled");
  });
});

describe("what changed from a setup", () => {
  const name = (id: string) => ({ roads: "Roads", modern: "Base map", "water-features": "Water", contours: "Contours" }[id] ?? id);
  const setup = { layerIds: ["modern", "roads"], opacityOverrides: {}, taxSaleEnabled: false, mapMode: "current" } as const;

  it("says what the reader turned on and off, in plain words", () => {
    expect(describeThemeChanges(setup, { ...setup, layerIds: ["modern", "water-features"] }, name)).toBe("Water on, Roads off");
    expect(describeThemeChanges(setup, { ...setup, taxSaleEnabled: true }, name)).toBe("Tax sale notices on");
  });

  it("counts past its limit and stays silent when nothing it can name differs", () => {
    expect(describeThemeChanges(setup, { ...setup, layerIds: ["water-features", "contours"] }, name)).toBe("Water on, Contours on, and 2 more");
    expect(describeThemeChanges(setup, setup, name)).toBeNull();
  });
});
