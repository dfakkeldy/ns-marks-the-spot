import { readFileSync } from "node:fs";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FISHING_SPOT_FIELDS } from "../layers/fishingLayers";
import {
  FISHING_CALENDAR_URL,
  FISHING_RULES_URL,
  fetchFishingData,
  parseCalendar,
  parseSpots,
  resetFishingDataForTests,
  spotNumber,
  useFishingData,
} from "./data";
import { FISHING_DEDICATION } from "./FishingHero";
import { directionsLinks, spotCoordinates } from "./spotLinks";

const rawSpots = JSON.parse(readFileSync("public/fishing/spots.geojson", "utf8")) as { features: { properties: Record<string, unknown> }[] };
const rawCalendar = JSON.parse(readFileSync("public/fishing/calendar.json", "utf8")) as unknown;
const rawRules = readFileSync("public/fishing/rules.json", "utf8");
const { spots, rejected } = parseSpots(rawSpots);
const calendar = parseCalendar(rawCalendar)!;

function feature(properties: Record<string, unknown>, coordinates: unknown = [-61, 45.6]) {
  return { type: "Feature", geometry: { type: "Point", coordinates }, properties: { ...rawSpots.features[0].properties, ...properties } };
}

describe("the shipped spot file, as the page reads it", () => {
  it("reads every spot and numbers each by its id", () => {
    expect(rejected).toBe(0);
    expect(spots).toHaveLength(rawSpots.features.length);
    for (const spot of spots) expect(spot.number).toBe(Number(spot.id.slice(1)));
    expect(spots.map(({ number }) => number)).toEqual([...spots.map(({ number }) => number)].sort((a, b) => a - b));
    expect(new Set(spots.map(({ id }) => id)).size).toBe(spots.length);
  });

  it("has months 1-12 with peak months inside the good months", () => {
    for (const spot of spots) {
      for (const month of spot.best_months) expect(month).toBeGreaterThanOrEqual(1);
      for (const month of spot.best_months) expect(month).toBeLessThanOrEqual(12);
      for (const month of spot.peak_months) expect(spot.best_months, spot.id).toContain(month);
    }
  });

  it("names only species the calendar knows, and never a rules-only one", () => {
    const known = new Map(calendar.species.map((species) => [species.key, species]));
    for (const spot of spots) {
      for (const key of spot.species) {
        expect(known.has(key), `${spot.id} ${key}`).toBe(true);
        expect(known.get(key)!.rulesOnly, `${spot.id} ${key}`).toBe(false);
      }
    }
  });

  it("carries only the allowlisted fields, whatever the page renders", () => {
    for (const { properties } of rawSpots.features) expect(Object.keys(properties).sort()).toEqual([...FISHING_SPOT_FIELDS].sort());
  });

  it("links every source over https", () => {
    for (const spot of spots) {
      expect(spot.sources.length, spot.id).toBeGreaterThan(0);
      for (const url of spot.sources) expect(new URL(url).protocol).toBe("https:");
    }
  });
});

describe("spot parsing", () => {
  it("leaves out a record it cannot trust and keeps the rest", () => {
    const result = parseSpots({
      features: [
        feature({ id: "S90" }),
        feature({ id: "X91" }),
        feature({ id: "S92", best_months: [0, 13] }),
        feature({ id: "S93", water_type: "lava" }),
        feature({ id: "S94" }, [Number.NaN, 45]),
        feature({ id: "S90" }),
        { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: { id: "S95" } },
      ],
    });
    expect(result.spots.map(({ id }) => id)).toEqual(["S90"]);
    expect(result.rejected).toBe(6);
  });

  it("renders no link that is not https", () => {
    const [spot] = parseSpots({ features: [feature({ id: "S90", sources: ["javascript:alert(1)", "http://example.test/", "https://example.test/ok"] })] }).spots;
    expect(spot.sources).toEqual(["https://example.test/ok"]);
  });

  it("refuses a file that is not a feature collection", () => {
    expect(() => parseSpots({ type: "Feature" })).toThrow();
    expect(spotNumber("S07")).toBe(7);
    expect(spotNumber("7")).toBeNaN();
  });
});

describe("calendar parsing", () => {
  it("keeps the shipped species in order and the rules-only ones without months", () => {
    expect(calendar.species.map(({ key }) => key)).toEqual(Object.keys((rawCalendar as { species: object }).species));
    for (const key of ["atlantic_salmon", "landlocked_salmon", "american_eel", "chain_pickerel"]) {
      const species = calendar.species.find((candidate) => candidate.key === key)!;
      expect(species.rulesOnly, key).toBe(true);
      expect(species.monthsGood, key).toEqual([]);
      expect(species.monthsPeak, key).toEqual([]);
    }
  });

  it("drops any months a rules-only species is given", () => {
    const parsed = parseCalendar({ checked: "2026-10-12", note: "", species: { atlantic_salmon: { label: "Atlantic salmon", group: "diadromous", months_good: [6, 9, 10], months_peak: [9], rules_only: true, notes: "" } } })!;
    expect(parsed.species[0]).toMatchObject({ monthsGood: [], monthsPeak: [], rulesOnly: true });
  });
});

describe("loading the page's files", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: string | null) => body === null ? new Response("", { status: 404 }) : new Response(body, { status: 200 });

  it("reads all three files", async () => {
    const fetcher = vi.fn(async (url: string) => respond(url.endsWith("spots.geojson") ? JSON.stringify(rawSpots) : url === FISHING_CALENDAR_URL ? JSON.stringify(rawCalendar) : url === FISHING_RULES_URL ? rawRules : null));
    const data = await fetchFishingData(fetcher as unknown as typeof fetch);
    expect(data.spots).toHaveLength(spots.length);
    expect(data.calendar?.species.length).toBe(calendar.species.length);
    expect(data.rules?.rulesYear).toBe(2026);
  });

  it("shows the spots without rules when the rules file fails, so the gate fails closed", async () => {
    const fetcher = vi.fn(async (url: string) => respond(url.endsWith("spots.geojson") ? JSON.stringify(rawSpots) : url === FISHING_CALENDAR_URL ? JSON.stringify(rawCalendar) : null));
    const data = await fetchFishingData(fetcher as unknown as typeof fetch);
    expect(data.spots).toHaveLength(spots.length);
    expect(data.rules).toBeNull();
  });

  it("fails as a whole when the spot file fails", async () => {
    const fetcher = vi.fn(async () => respond(null));
    await expect(fetchFishingData(fetcher as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe("the shared load", () => {
  const respond = (body: string | null) => body === null ? new Response("", { status: 503 }) : new Response(body, { status: 200 });
  const body = (url: string) => url.endsWith("spots.geojson") ? JSON.stringify(rawSpots) : url === FISHING_CALENDAR_URL ? JSON.stringify(rawCalendar) : url === FISHING_RULES_URL ? rawRules : null;
  beforeEach(() => resetFishingDataForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    resetFishingDataForTests();
  });

  it("fetches nothing while disabled, then one set of files for every reader", async () => {
    const fetcher = vi.fn(async (url: string) => respond(body(url)));
    vi.stubGlobal("fetch", fetcher);
    // The full map's layer while it is off.
    const layer = renderHook(({ enabled }) => useFishingData(enabled), { initialProps: { enabled: false } });
    await act(async () => { await Promise.resolve(); });
    expect(fetcher).not.toHaveBeenCalled();
    expect(layer.result.current.status).toBe("loading");
    layer.rerender({ enabled: true });
    await waitFor(() => expect(layer.result.current.status).toBe("ready"));
    expect(fetcher).toHaveBeenCalledTimes(3);
    const panel = renderHook(() => useFishingData());
    expect(panel.result.current.status).toBe("ready");
    await act(async () => { await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("tries again when a reader is enabled again after a failure, and every reader sees the result", async () => {
    let down = true;
    const fetcher = vi.fn(async (url: string) => respond(down && url.endsWith("spots.geojson") ? null : body(url)));
    vi.stubGlobal("fetch", fetcher);
    const hero = renderHook(() => useFishingData(false));
    const layer = renderHook(({ enabled }) => useFishingData(enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(layer.result.current.status).toBe("error"));
    expect(hero.result.current.status).toBe("error");
    down = false;
    layer.rerender({ enabled: false });
    layer.rerender({ enabled: true });
    await waitFor(() => expect(layer.result.current.status).toBe("ready"));
    expect(hero.result.current.status).toBe("ready");
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});

describe("spot links and the dedication", () => {
  it("sends only the pin to the directions services", () => {
    const links = directionsLinks({ latitude: 45.652837, longitude: -60.869987 });
    expect(new URL(links.google).searchParams.get("destination")).toBe("45.65284,-60.86999");
    expect(new URL(links.google).searchParams.has("origin")).toBe(false);
    expect(new URL(links.apple).searchParams.get("daddr")).toBe("45.65284,-60.86999");
    expect(new URL(links.apple).searchParams.has("saddr")).toBe(false);
    expect(spotCoordinates({ latitude: 45.652837, longitude: -60.869987 })).toBe("45.65284, -60.86999");
  });

  it("dedicates the page by first name only", () => {
    expect(FISHING_DEDICATION).toBe("For Darrell, who never needed a reason to go fishing.");
  });
});
