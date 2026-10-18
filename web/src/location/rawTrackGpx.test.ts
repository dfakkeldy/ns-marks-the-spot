import { describe, expect, it } from "vitest";
import { parseXmlVector } from "../userMaps/vector/parsers/xmlVectorSource";
import { rawTrackGpxString } from "./rawTrackGpx";
import type { LiveFix } from "./liveLocation";

function fix(latitude: number, timestampMs: number, altitudeM: number | null = null): LiveFix {
  return {
    latitude,
    longitude: -61,
    accuracyM: 7.5,
    altitudeM,
    headingDeg: null,
    speedMps: null,
    timestampMs,
  };
}

describe("rawTrackGpxString", () => {
  it("writes GPX 1.1 with one trkseg per segment, time, ele, and accuracy", () => {
    const gpx = rawTrackGpxString("Boundary walk", [
      [fix(46.1, 0, 12), fix(46.2, 1_000)],
      [fix(46.3, 60_000)],
    ]);
    expect(gpx).toContain('version="1.1"');
    expect(gpx).toContain('creator="NS Marks The Spot"');
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).toContain("<time>1970-01-01T00:00:00.000Z</time>");
    expect(gpx).toContain("<ele>12</ele>");
    expect(gpx).toContain(">7.5<");
    // A track name with markup leaves as text, never as elements.
    expect(rawTrackGpxString("<script>bad()</script>", [[]])).not.toContain(
      "<script>",
    );
  });

  it("round-trips through the app's own GPX parser with geometry intact", () => {
    const gpx = rawTrackGpxString("Walk", [
      [fix(46.1, 0), fix(46.2, 1_000)],
      [fix(46.3, 2_000), fix(46.4, 3_000)],
    ]);
    const parsed = parseXmlVector(gpx);
    expect(parsed.featureCount).toBe(1);
    const geometry = parsed.collection.features[0].geometry;
    // Two trksegs come back as one MultiLineString track.
    expect(geometry.type).toBe("MultiLineString");
    if (geometry.type === "MultiLineString") {
      expect(geometry.coordinates).toHaveLength(2);
      expect(geometry.coordinates[0][0][1]).toBeCloseTo(46.1, 9);
    }
  });
});
