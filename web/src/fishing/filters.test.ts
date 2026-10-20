import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCalendar, parseSpots } from "./data";
import {
  calendarLevel,
  describeFilters,
  filterSpots,
  filterSummary,
  hasActiveFilter,
  monthStrip,
  speciesOptions,
  spotMatches,
} from "./filters";

const { spots } = parseSpots(JSON.parse(readFileSync("public/fishing/spots.geojson", "utf8")));
const calendar = parseCalendar(JSON.parse(readFileSync("public/fishing/calendar.json", "utf8")));
const ids = (filters: { month: number | null; species: string | null }) => filterSpots(spots, filters).map(({ id }) => id);

describe("spot filters", () => {
  const spot = { best_months: [1, 2, 3, 11, 12], species: ["rainbow_smelt", "stocked_trout"] };

  it("matches a month among the good months, over the new year too", () => {
    expect(spotMatches(spot, { month: 1, species: null })).toBe(true);
    expect(spotMatches(spot, { month: 12, species: null })).toBe(true);
    expect(spotMatches(spot, { month: 6, species: null })).toBe(false);
  });

  it("matches a species the spot names, and both filters together", () => {
    expect(spotMatches(spot, { month: null, species: "rainbow_smelt" })).toBe(true);
    expect(spotMatches(spot, { month: null, species: "cunner" })).toBe(false);
    expect(spotMatches(spot, { month: 2, species: "stocked_trout" })).toBe(true);
    expect(spotMatches(spot, { month: 6, species: "stocked_trout" })).toBe(false);
  });

  it("keeps every spot, in number order, with no filter", () => {
    expect(ids({ month: null, species: null })).toEqual(spots.map(({ id }) => id));
    expect(hasActiveFilter({ month: null, species: null })).toBe(false);
    expect(hasActiveFilter({ month: 3, species: null })).toBe(true);
  });

  it("narrows the shipped spots to the winter waters in January", () => {
    expect(ids({ month: 1, species: null })).toEqual(["S02", "S14", "S25", "S26", "S27"]);
  });

  it("finds the shipped spots for one species and month", () => {
    const october = ids({ month: 10, species: null });
    expect(october.length).toBeGreaterThan(10);
    expect(october.length).toBeLessThan(spots.length);
    const octoberBass = ids({ month: 10, species: "striped_bass_maritimes" });
    expect(octoberBass.length).toBeGreaterThan(0);
    for (const id of octoberBass) expect(october).toContain(id);
    expect(ids({ month: 1, species: "atlantic_mackerel" })).toEqual([]);
  });
});

describe("month cells", () => {
  it("draws twelve cells with peak above good", () => {
    const strip = monthStrip({ best_months: [5, 6, 7, 10], peak_months: [6] });
    expect(strip).toHaveLength(12);
    expect(strip.map(({ level }) => level)).toEqual([
      "none", "none", "none", "none", "good", "peak", "good", "none", "none", "good", "none", "none",
    ]);
  });

  it("gives a rules-only species no month at all", () => {
    const salmon = calendar!.species.find(({ key }) => key === "atlantic_salmon")!;
    expect(salmon.rulesOnly).toBe(true);
    for (let month = 1; month <= 12; month += 1) expect(calendarLevel(salmon, month)).toBe("none");
  });
});

describe("species choices", () => {
  const options = speciesOptions(spots, calendar);

  it("offers only species a spot names, in the calendar's order", () => {
    const used = new Set(spots.flatMap(({ species }) => species));
    for (const { key } of options) expect(used.has(key), key).toBe(true);
    const calendarOrder = calendar!.species.map(({ key }) => key);
    const offeredOrder = options.map(({ key }) => key);
    expect(offeredOrder).toEqual(calendarOrder.filter((key) => offeredOrder.includes(key)));
  });

  it("never offers a rules-only species", () => {
    for (const key of ["atlantic_salmon", "landlocked_salmon", "american_eel", "chain_pickerel"]) {
      expect(options.map((option) => option.key)).not.toContain(key);
    }
  });

  it("still offers a species the calendar does not know, under its key", () => {
    expect(speciesOptions([{ species: ["sea_robin"] }], null)).toEqual([{ key: "sea_robin", label: "Sea robin", group: "other" }]);
  });
});

describe("filter summaries", () => {
  it("counts the spots a filter keeps", () => {
    expect(filterSummary(27, 27, { month: null, species: null }, calendar)).toBe("All 27 spots");
    expect(filterSummary(5, 27, { month: 1, species: null }, calendar)).toBe("5 of 27 spots for January");
    expect(filterSummary(1, 27, { month: 10, species: "cunner" }, calendar)).toBe("1 of 27 spots for October and Cunner");
    expect(filterSummary(0, 27, { month: 1, species: "atlantic_mackerel" }, calendar)).toBe("No spots for January and Atlantic mackerel");
  });

  it("describes the filter without counts for the empty state", () => {
    expect(describeFilters({ month: 2, species: null }, calendar)).toBe("February");
    expect(describeFilters({ month: null, species: "pollock" }, calendar)).toBe("Pollock");
  });
});
