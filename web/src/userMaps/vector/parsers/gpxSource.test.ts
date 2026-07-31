import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../../errors";
import { parseGpx } from "./gpxSource";

function expectCode(fn: () => unknown, code: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UserMapImportError);
  expect((caught as UserMapImportError).code).toBe(code);
}

describe("parseGpx", () => {
  it("reads waypoints as points", () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="45.81" lon="-61.4"><name>Gate</name><desc>Locked</desc></wpt>
</gpx>`;
    const parsed = parseGpx(gpx);
    expect(parsed.featureCount).toBe(1);
    const feature = parsed.collection.features[0];
    expect(feature.geometry).toMatchObject({ type: "Point" });
    expect(feature.properties?.name).toBe("Gate");
  });

  it("reads a track as a line", () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Walk in</name><trkseg>
    <trkpt lat="45.81" lon="-61.40"/>
    <trkpt lat="45.82" lon="-61.39"/>
    <trkpt lat="45.83" lon="-61.38"/>
  </trkseg></trk>
</gpx>`;
    const parsed = parseGpx(gpx);
    expect(parsed.featureCount).toBe(1);
    const geometry = parsed.collection.features[0].geometry;
    expect(["LineString", "MultiLineString"]).toContain(geometry.type);
    expect(parsed.bbox).toEqual([-61.4, 45.81, -61.38, 45.83]);
  });

  it("reads waypoints and tracks from one file", () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="45.81" lon="-61.4"><name>Gate</name></wpt>
  <trk><name>Walk in</name><trkseg>
    <trkpt lat="45.81" lon="-61.40"/><trkpt lat="45.82" lon="-61.39"/>
  </trkseg></trk>
</gpx>`;
    expect(parseGpx(gpx).featureCount).toBe(2);
  });

  it("refuses malformed XML as corrupt-file", () => {
    expectCode(() => parseGpx("<gpx><wpt></gpx>"), "corrupt-file");
  });

  it("refuses a GPX with no waypoints or tracks as empty-file", () => {
    expectCode(
      () =>
        parseGpx(
          '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>',
        ),
      "empty-file",
    );
  });
});
