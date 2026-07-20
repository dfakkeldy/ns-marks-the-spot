import { describe, expect, it } from "vitest";
import {
  buildMapShareUrl,
  parseMapShareState,
  type MapShareState,
} from "./mapShareState";

describe("map share state", () => {
  const state: MapShareState = {
    mode: "current",
    pid: "15234636",
    eventIds: ["cbrm-2026-07-21"],
    layerIds: [
      "nsprd",
      "roads",
      "mineral-occurrences",
      "inverness-hydro-potential",
    ],
    position: { latitude: 46.18845, longitude: -60.02123, zoom: 15 },
  };

  it("puts PID, event, layers, and position into one shareable URL", () => {
    const url = new URL(buildMapShareUrl("https://example.com/map/", state));

    expect(url.searchParams.get("pid")).toBe("15234636");
    expect(url.searchParams.get("event")).toBe("cbrm-2026-07-21");
    expect(url.searchParams.get("layers")).toBe(
      "nsprd,roads,mineral-occurrences,inverness-hydro-potential",
    );
    expect(url.searchParams.get("position")).toBe("46.18845,-60.02123,15");
  });

  it("round-trips a historical map state", () => {
    const historicalState: MapShareState = {
      ...state,
      mode: "historical",
      eventIds: ["hrm-2022-03-08"],
    };

    expect(parseMapShareState(buildMapShareUrl("https://example.com/map/", historicalState)))
      .toEqual(historicalState);
  });

  it("round-trips the derived mineral-proximity layer", () => {
    const proximityState: MapShareState = {
      ...state,
      layerIds: ["nsprd", "mineral-proximity-parcels"],
    };

    expect(
      parseMapShareState(buildMapShareUrl("https://example.com/map/", proximityState)),
    ).toEqual(proximityState);
  });

  it("ignores unknown events and layers while clamping the map position", () => {
    const parsed = parseMapShareState(
      "https://example.com/map/?mode=current&pid=15-234-636&event=unknown&layers=roads,unknown&position=99,-200,40",
    );

    expect(parsed.pid).toBe("15234636");
    expect(parsed.eventIds).toEqual([]);
    expect(parsed.layerIds).toEqual(["roads"]);
    expect(parsed.position).toEqual({ latitude: 47.5, longitude: -66.5, zoom: 23 });
  });
});
