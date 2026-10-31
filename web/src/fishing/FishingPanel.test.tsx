import { readFileSync } from "node:fs";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FOCUS_PAGE_STATE, type FocusChromeContext, type FocusPageState } from "../focus/focusDefinition";
import { hiddenContextLayers } from "../layers/contextLayerCatalog";
import { provinceLayerCatalog, type ProvinceLayerId } from "../layers/layerCatalog";
import { parseCalendar, parseSpots, type FishingDataState } from "./data";
import { FishingHero } from "./FishingHero";
import { FishingPanel } from "./FishingPanel";
import { parseRulesFile } from "./rules";

const state = vi.hoisted(() => ({ data: { status: "loading" } as FishingDataState, load: vi.fn(async () => undefined) }));
vi.mock("./data", async (importOriginal) => ({
  ...await importOriginal<typeof import("./data")>(),
  useFishingData: () => state.data,
  loadFishingData: state.load,
}));

const read = (name: string) => JSON.parse(readFileSync(`public/fishing/${name}`, "utf8")) as unknown;
const { spots } = parseSpots(read("spots.geojson"));
const calendar = parseCalendar(read("calendar.json"));
const rules = parseRulesFile(read("rules.json"));
const ready = (overrides: Partial<{ rules: typeof rules }> = {}): FishingDataState => ({
  status: "ready",
  data: { spots, rejectedSpots: 0, calendar, rules: "rules" in overrides ? overrides.rules ?? null : rules },
});

const actions = { closeMobileControls: vi.fn(), openMobileControls: vi.fn(), fitToFocus: vi.fn(), setContextLayerVisibility: vi.fn() };

function Harness({ initial = {}, spotsLayerOn = true }: { initial?: Partial<FocusPageState>; spotsLayerOn?: boolean }) {
  const [pageState, setState] = useState<FocusPageState>({ ...EMPTY_FOCUS_PAGE_STATE, ...initial });
  const context: FocusChromeContext = {
    contextLayers: { ...hiddenContextLayers, "fishing-spots": spotsLayerOn },
    pageState,
    setPageState: (update) => setState((current) => ({ ...current, ...update })),
    startViewpointPick: vi.fn(),
    layerStatuses: {},
    provinceLayers: Object.fromEntries(provinceLayerCatalog.map(({ id }) => [id, false])) as Record<ProvinceLayerId, boolean>,
    setProvinceLayerVisibility: vi.fn(),
    licenceAccepted: false,
    reviewProvinceLicence: vi.fn(),
    ...actions,
  };
  return (
    <>
      <FishingPanel {...context} />
      <output data-testid="page-state">{JSON.stringify(pageState)}</output>
    </>
  );
}
const pageState = () => JSON.parse(screen.getByTestId("page-state").textContent!) as FocusPageState;
const cards = () => [...document.querySelectorAll<HTMLElement>(".fishing-spot")].map((card) => card.dataset.spotId);
const summary = () => document.querySelector<HTMLElement>(".fishing-filter-result [role='status']")!;
const toggle = (id: string) => document.querySelector<HTMLButtonElement>(`#fishing-spot-${id} .fishing-spot-toggle`)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 13, 12));
  state.data = ready();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("the /fishing panel", () => {
  it("lists every spot until a month is chosen, then that month's", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(cards()).toHaveLength(spots.length);
    expect(summary()).toHaveTextContent(`All ${spots.length} spots`);
    await user.selectOptions(screen.getByRole("combobox", { name: "Month" }), "1");
    expect(cards()).toEqual(["S02", "S14", "S25", "S26", "S27"]);
    expect(summary()).toHaveTextContent(`5 of ${spots.length} spots for January`);
    expect(pageState().month).toBe(1);
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(cards()).toHaveLength(spots.length);
    expect(pageState()).toMatchObject({ month: null, species: null });
  });

  it("marks the current month and never offers a rules-only species", () => {
    render(<Harness />);
    expect(screen.getByRole("option", { name: "October (now)" })).toBeInTheDocument();
    const species = within(screen.getByRole("combobox", { name: "Species" })).getAllByRole("option").map((option) => option.getAttribute("value"));
    expect(species).toContain("striped_bass_maritimes");
    for (const key of ["atlantic_salmon", "landlocked_salmon", "american_eel", "chain_pickerel"]) expect(species).not.toContain(key);
  });

  it("shows a filter-aware empty state, not an empty source", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ month: 1, species: "atlantic_mackerel" }} />);
    expect(cards()).toEqual([]);
    const empty = document.querySelector<HTMLElement>(".fishing-empty")!;
    expect(empty).toHaveTextContent("None of the curated spots is listed for January and Atlantic mackerel.");
    expect(empty).toHaveTextContent("not evidence that no fish are there");
    await user.click(screen.getAllByRole("button", { name: "Clear filters" }).at(-1)!);
    expect(cards()).toHaveLength(spots.length);
  });

  it("tells an empty or partly unreadable spot file apart from a filter", () => {
    state.data = { status: "ready", data: { spots: [], rejectedSpots: 0, calendar, rules } };
    const empty = render(<Harness />);
    expect(screen.getByText(/The spot file has no spots this page can show/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    empty.unmount();
    state.data = { status: "ready", data: { spots, rejectedSpots: 1, calendar, rules } };
    render(<Harness />);
    expect(screen.getByText("One spot record could not be read and is left out.")).toBeInTheDocument();
  });

  it("offers to try again when the spot list did not load", async () => {
    const user = userEvent.setup();
    state.data = { status: "error" };
    render(<Harness />);
    expect(screen.getByText(/The spot list could not be loaded/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.load).toHaveBeenCalledOnce();
  });

  it("opens one card at a time and keeps a selection the new month still lists", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(toggle("S25"));
    expect(pageState().spotId).toBe("S25");
    expect(toggle("S25")).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle("S04"));
    expect(pageState().spotId).toBe("S04");
    expect(toggle("S25")).toHaveAttribute("aria-expanded", "false");
    await user.selectOptions(screen.getByRole("combobox", { name: "Month" }), "8");
    expect(pageState().spotId).toBe("S04");
    await user.selectOptions(screen.getByRole("combobox", { name: "Month" }), "1");
    expect(pageState().spotId).toBeNull();
    await user.click(toggle("S25"));
    await user.click(toggle("S25"));
    expect(pageState().spotId).toBeNull();
  });

  it("drops a linked spot that does not exist or that the linked month leaves out", () => {
    const first = render(<Harness initial={{ spotId: "S99" }} />);
    expect(pageState().spotId).toBeNull();
    first.unmount();
    render(<Harness initial={{ spotId: "S04", month: 1 }} />);
    expect(pageState()).toMatchObject({ spotId: null, month: 1 });
  });

  it("gives a card its months, directions to the pin and a way to the map", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ spotId: "S25", month: 1 }} />);
    const card = document.getElementById("fishing-spot-S25")!;
    const spot = spots.find(({ id }) => id === "S25")!;
    const google = within(card).getByRole("link", { name: "Directions in Google Maps" });
    expect(new URL(google.getAttribute("href")!).searchParams.get("destination")).toBe(`${spot.latitude.toFixed(5)},${spot.longitude.toFixed(5)}`);
    expect(within(card).getByRole("link", { name: "Directions in Apple Maps" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/maps\.apple\.com\/\?daddr=/));
    expect(card).toHaveTextContent(`${spot.latitude.toFixed(5)}, ${spot.longitude.toFixed(5)}`);
    const months = within(card).getByRole("list", { name: "Good and peak months" });
    expect(within(months).getAllByRole("listitem")).toHaveLength(12);
    expect(months).toHaveTextContent("January: good");
    expect(months).toHaveTextContent("May: peak");
    expect(months).toHaveTextContent("August: not listed");
    expect(card.querySelector(".is-month")?.textContent).toContain("January");
    expect(within(card).getByText(/Access/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Show on the map" }));
    expect(pageState()).toMatchObject({ spotId: "S25", mapReveal: 1 });
    expect(actions.closeMobileControls).toHaveBeenCalled();
    expect(actions.setContextLayerVisibility).not.toHaveBeenCalled();
  });

  it("turns the spots layer back on when asked to show a spot on the map", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ spotId: "S25" }} spotsLayerOn={false} />);
    await user.click(within(document.getElementById("fishing-spot-S25")!).getByRole("button", { name: "Show on the map" }));
    expect(actions.setContextLayerVisibility).toHaveBeenCalledExactlyOnceWith("fishing-spots", true);
    expect(pageState()).toMatchObject({ spotId: "S25", mapReveal: 1 });
  });
});

describe("the panel's rules gate on a fixed clock", () => {
  function openRules(id: string) {
    render(<Harness initial={{ spotId: id }} />);
    return document.querySelector<HTMLElement>(`#fishing-spot-${id} .fishing-rules`)!;
  }

  it("shows standing rules with their citation while they are in force", () => {
    const section = openRules("S01");
    expect(section).toHaveTextContent("Angling from any bridge in Nova Scotia");
    expect(section).toHaveTextContent("Standing rule · Maritime Provinces Fishery Regulations (SOR/93-55), s.15(a)");
    expect(within(section).getAllByRole("link", { name: "Maritime Provinces Fishery Regulations (SOR/93-55)" })[0]).toHaveAttribute("href", "https://laws-lois.justice.gc.ca/eng/regulations/SOR-93-55/FullText.html");
    expect(within(section).getByRole("link", { name: "Nova Scotia Anglers' Handbook (current edition)" })).toBeInTheDocument();
  });

  it("hides dated rules after the licence year and sends the reader to the handbook", () => {
    vi.setSystemTime(new Date(2027, 3, 1, 9));
    const section = openRules("S01");
    expect(section).toHaveTextContent("Angling from any bridge");
    expect(section).not.toHaveTextContent("Atlantic mackerel");
    expect(section).toHaveTextContent(/\d+ rules are hidden because they are outside their dates\. Check the current Anglers' Handbook and DFO notices\./);
    expect(within(section).getByRole("link", { name: "Nova Scotia Anglers' Handbook (current edition)" })).toHaveAttribute("href", "https://www.novascotia.ca/documents/anglers-handbook");
  });

  it("shows no rule text at all when the rules file did not load", () => {
    state.data = ready({ rules: null });
    const section = openRules("S01");
    expect(section).not.toHaveTextContent("Angling from any bridge");
    expect(section).toHaveTextContent("The rules summary could not be loaded.");
  });

  it("keeps salmon and eel rules-only in the species calendar", () => {
    render(<Harness />);
    const table = screen.getByRole("table");
    const salmonRow = within(table).getByRole("rowheader", { name: "Atlantic salmon" }).closest("tr")!;
    expect(salmonRow).toHaveTextContent("Rules only: no months shown.");
    expect(salmonRow.querySelectorAll(".is-good, .is-peak")).toHaveLength(0);
    const eelRow = within(table).getByRole("rowheader", { name: "American eel" }).closest("tr")!;
    expect(eelRow).toHaveTextContent("Rules only");
    const mackerelRow = within(table).getByRole("rowheader", { name: "Atlantic mackerel" }).closest("tr")!;
    expect(mackerelRow.querySelectorAll(".is-peak").length).toBeGreaterThan(0);
    expect(document.getElementById("fishing-rules-atlantic_salmon")).toHaveTextContent("Salmon Fishing Area 18 has its own close times");
  });

  it("says a rule it could not read is unreadable, not out of date", () => {
    const raw = read("rules.json") as { entries: { id: string; validUntil: string }[] };
    const broken = parseRulesFile({ ...raw, entries: raw.entries.map((entry) => entry.id === "salmon-2026" ? { ...entry, validUntil: "2027-02-29" } : entry) });
    state.data = ready({ rules: broken });
    const section = openRules("S22");
    expect(section).toHaveTextContent("One rule could not be read and is hidden.");
    expect(section).not.toHaveTextContent("outside its dates");
    const salmon = document.getElementById("fishing-rules-atlantic_salmon")!;
    expect(salmon).toHaveTextContent("One rule could not be read and is hidden.");
  });

  it("hides the salmon order once it lapses", () => {
    vi.setSystemTime(new Date(2027, 5, 1, 9));
    render(<Harness />);
    const salmon = document.getElementById("fishing-rules-atlantic_salmon")!;
    expect(salmon).not.toHaveTextContent("Salmon Fishing Area 18 has its own close times");
    expect(salmon).toHaveTextContent("One rule is hidden because it is outside its dates.");
  });
});

describe("the /fishing hero", () => {
  it("carries the dedication, the dated stamp and a this-month shortcut", async () => {
    const user = userEvent.setup();
    const onShowMonth = vi.fn();
    render(<FishingHero data={ready()} activeMonth={null} onShowMonth={onShowMonth} onFit={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Fishing spots" })).toBeInTheDocument();
    expect(screen.getByText("For Darrell, who never needed a reason to go fishing.")).toBeInTheDocument();
    expect(screen.getByText(/Rules summary for the 2026 licence year, checked October 12, 2026\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Spots for October" }));
    expect(onShowMonth).toHaveBeenCalledWith(10);
  });

  it("says when the summary has passed its date", () => {
    vi.setSystemTime(new Date(2027, 3, 1, 9));
    render(<FishingHero data={ready()} activeMonth={4} onShowMonth={vi.fn()} onFit={vi.fn()} />);
    expect(screen.getByText(/The 2026 rules summary passed its date on March 31, 2027/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nova Scotia Anglers' Handbook (current edition)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show every month" })).toBeInTheDocument();
  });
});
