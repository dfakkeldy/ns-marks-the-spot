import { describe, expect, it } from "vitest";
import { buildRecordedTrackFeature, defaultTrackName } from "./trackFeature";
import type { StopResult } from "./trackRecorder";
import type { TrackPoint } from "./trackFilter";

const LAT_METRE = 1 / 111_320;

function point(latMetres: number, timestampMs: number): TrackPoint {
  return {
    lat: 46 + latMetres * LAT_METRE,
    lng: -61,
    altitudeM: null,
    accuracyM: 5,
    timestampMs,
  };
}

function result(segments: TrackPoint[][]): StopResult {
  return {
    startedAt: "2026-08-29T14:00:00.000Z",
    endedAt: "2026-08-29T14:20:00.000Z",
    segments,
    rawSegments: segments.map(() => []),
    rawFixCount: 40,
    acceptedFixCount: 30,
    distanceM: 250,
    recordingMs: 1_200_000,
  };
}

describe("buildRecordedTrackFeature", () => {
  it("builds a LineString with parallel times and honest recording metadata", () => {
    const feature = buildRecordedTrackFeature(
      result([[point(0, 0), point(10, 1_000), point(20, 2_000)]]),
      "Boundary walk",
      0,
    );
    expect(feature?.geometry.type).toBe("LineString");
    expect(feature?.geometry.coordinates).toHaveLength(3);
    // 2D on purpose: altitude lives in the raw GPX original.
    expect(feature?.geometry.coordinates[0]).toHaveLength(2);
    expect(feature?.properties?.name).toBe("Boundary walk");
    expect(feature?.properties?.coordinateProperties).toEqual({
      times: [
        "1970-01-01T00:00:00.000Z",
        "1970-01-01T00:00:01.000Z",
        "1970-01-01T00:00:02.000Z",
      ],
    });
    expect(feature?.properties?.["nsmts:recording"]).toEqual({
      startedAt: "2026-08-29T14:00:00.000Z",
      endedAt: "2026-08-29T14:20:00.000Z",
      rawFixCount: 40,
      acceptedFixCount: 30,
      simplifiedVertexCount: 3,
      simplifyToleranceM: 0,
      smoothingAlpha: 0.6,
    });
    expect(typeof feature?.id).toBe("string");
  });

  it("builds a MultiLineString with nested times when pauses made segments", () => {
    const feature = buildRecordedTrackFeature(
      result([
        [point(0, 0), point(10, 1_000)],
        [point(100, 60_000), point(110, 61_000)],
      ]),
      "Two legs",
      0,
    );
    expect(feature?.geometry.type).toBe("MultiLineString");
    const times = (
      feature?.properties?.coordinateProperties as { times: string[][] }
    ).times;
    expect(times).toHaveLength(2);
    expect(times[0]).toHaveLength(2);
  });

  it("simplifies with the chosen tolerance and applies it to times too", () => {
    // A straight line sampled every ~2 m: only the endpoints survive 1 m.
    const straight = Array.from({ length: 20 }, (_, index) =>
      point(index * 2, index * 1_000),
    );
    const feature = buildRecordedTrackFeature(result([straight]), "Line", 1);
    expect(feature?.geometry.coordinates).toHaveLength(2);
    const times = (
      feature?.properties?.coordinateProperties as { times: string[] }
    ).times;
    expect(times).toEqual([
      "1970-01-01T00:00:00.000Z",
      "1970-01-01T00:00:19.000Z",
    ]);
    expect(
      (feature?.properties?.["nsmts:recording"] as { simplifiedVertexCount: number })
        .simplifiedVertexCount,
    ).toBe(2);
  });

  it("returns null when nothing drawable was recorded", () => {
    expect(buildRecordedTrackFeature(result([[]]), "Empty", 0)).toBeNull();
    expect(
      buildRecordedTrackFeature(result([[point(0, 0)]]), "One point", 0),
    ).toBeNull();
  });
});

describe("defaultTrackName", () => {
  it("names tracks by local start date and time", () => {
    expect(defaultTrackName("2026-08-29T14:05:00.000Z")).toMatch(
      /^Track \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });
});
