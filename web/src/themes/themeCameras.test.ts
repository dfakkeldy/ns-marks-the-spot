import { describe, expect, it } from "vitest";
import { fletcherSheets } from "../layers/fletcherLayer";
import { PROPERTY_BOUNDARY_MIN_ZOOM } from "../layers/layerCatalog";
import rhodenaFeatures from "../rhodena/features.json";
import { DEFAULT_MAP_POSITION } from "../services/mapShareState";
import { buildMapPresentationFixture, builtInMapThemes } from "./mapThemes";
import {
  builtInThemeCameras,
  FLETCHER_COVERAGE_BOUNDS,
  POKER_CIVIC_MIN_ZOOM,
  POKER_OPENING_POSITION,
  RHODENA_TURBINES_POSITION,
  themeCameraFor,
  themeOpeningPosition,
} from "./themeCameras";

describe("setup cameras", () => {
  it("names only built-in setups", () => {
    const ids = new Set<string>(builtInMapThemes.map(({ id }) => id));
    for (const id of Object.keys(builtInThemeCameras)) expect(ids.has(id)).toBe(true);
  });

  it("keeps Explore on the home camera", () => {
    expect(themeCameraFor("explore-nova-scotia")).toBeUndefined();
    expect(themeOpeningPosition(undefined, DEFAULT_MAP_POSITION)).toEqual(DEFAULT_MAP_POSITION);
  });

  it("stays out of the native presentation fixture", () => {
    const fixture = JSON.stringify(buildMapPresentationFixture());
    expect(fixture).not.toMatch(/camera|zoom-floor|notice-extent/);
  });

  it("opens Forestry where property boundaries draw, around the home centre", () => {
    const camera = themeCameraFor("forestry-field-access");
    expect(camera).toEqual({ kind: "zoom-floor", zoom: PROPERTY_BOUNDARY_MIN_ZOOM });
    expect(themeOpeningPosition(camera, DEFAULT_MAP_POSITION)).toEqual({ ...DEFAULT_MAP_POSITION, zoom: 14 });
  });

  it("opens Poker at the zoom where civic numbers load", () => {
    expect(themeCameraFor("poker")).toEqual({ kind: "position", position: POKER_OPENING_POSITION });
    expect(POKER_OPENING_POSITION.zoom).toBe(POKER_CIVIC_MIN_ZOOM);
    expect(POKER_CIVIC_MIN_ZOOM).toBe(16);
  });

  it("frames all 24 published Fletcher sheets for Historical Maps", () => {
    expect(themeCameraFor("historical-maps")).toEqual({ kind: "fit", bounds: FLETCHER_COVERAGE_BOUNDS });
    for (const { bounds: [[s, w], [n, e]] } of fletcherSheets) {
      expect(s).toBeGreaterThanOrEqual(FLETCHER_COVERAGE_BOUNDS[0][0]);
      expect(w).toBeGreaterThanOrEqual(FLETCHER_COVERAGE_BOUNDS[0][1]);
      expect(n).toBeLessThanOrEqual(FLETCHER_COVERAGE_BOUNDS[1][0]);
      expect(e).toBeLessThanOrEqual(FLETCHER_COVERAGE_BOUNDS[1][1]);
    }
    expect(fletcherSheets).toHaveLength(24);
  });

  it("frames the notices for Tax Sale and the province for Electoral", () => {
    expect(themeCameraFor("tax-sale-research")).toEqual({ kind: "notice-extent" });
    expect(themeCameraFor("electoral-districts")?.kind).toBe("fit");
  });

  it("opens Rhodena at zoom 13 with all six turbines inside a phone-width view", () => {
    const turbines = (rhodenaFeatures as unknown as { features: { id?: string; geometry: { coordinates: [number, number] } }[] }).features
      .filter(({ id }) => /^T[1-6]$/.test(id ?? ""));
    expect(turbines).toHaveLength(6);
    expect(RHODENA_TURBINES_POSITION.zoom).toBe(13);
    // At zoom 13 a 390 px map spans about 0.067 degrees of longitude; keep
    // every turbine within the middle 80% of that, and of a 600 px height.
    const degPerPx = 360 / (256 * 2 ** 13);
    for (const { geometry: { coordinates: [lng, lat] } } of turbines) {
      expect(Math.abs(lng - RHODENA_TURBINES_POSITION.longitude)).toBeLessThan(0.4 * 390 * degPerPx);
      expect(Math.abs(lat - RHODENA_TURBINES_POSITION.latitude)).toBeLessThan(0.4 * 600 * degPerPx * Math.cos((lat * Math.PI) / 180));
    }
  });

  it("starts a zoom floor no further out than the fallback", () => {
    expect(themeOpeningPosition({ kind: "zoom-floor", zoom: 14 }, { latitude: 1, longitude: 2, zoom: 17 }).zoom).toBe(17);
    expect(themeOpeningPosition({ kind: "fit", bounds: FLETCHER_COVERAGE_BOUNDS }, DEFAULT_MAP_POSITION)).toEqual(DEFAULT_MAP_POSITION);
  });
});
