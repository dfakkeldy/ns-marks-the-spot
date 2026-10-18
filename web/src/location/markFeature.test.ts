import { describe, expect, it } from "vitest";
import { buildGpsMarkFeature } from "./markFeature";
import type { LiveFix } from "./liveLocation";

const FIX: LiveFix = {
  latitude: 46.12,
  longitude: -60.91,
  accuracyM: 7.4,
  altitudeM: null,
  headingDeg: null,
  speedMps: null,
  timestampMs: Date.UTC(2026, 7, 28, 14, 5, 0),
};

describe("buildGpsMarkFeature", () => {
  it("builds a Point with capture time and accuracy in the reserved keys", () => {
    const feature = buildGpsMarkFeature(FIX);
    expect(feature.geometry).toEqual({
      type: "Point",
      coordinates: [-60.91, 46.12],
    });
    expect(feature.properties).toEqual({
      "nsmts:capturedAt": "2026-08-28T14:05:00.000Z",
      "nsmts:accuracyM": 7.4,
    });
    expect(typeof feature.id).toBe("string");
    expect(String(feature.id).length).toBeGreaterThan(0);
  });

  it("carries altitude in the coordinates and properties when the fix has one", () => {
    const feature = buildGpsMarkFeature({ ...FIX, altitudeM: 41.5 });
    expect(feature.geometry.coordinates).toEqual([-60.91, 46.12, 41.5]);
    expect(feature.properties?.["nsmts:altitudeM"]).toBe(41.5);
  });

  it("assigns a distinct id per mark", () => {
    expect(buildGpsMarkFeature(FIX).id).not.toBe(buildGpsMarkFeature(FIX).id);
  });
});
