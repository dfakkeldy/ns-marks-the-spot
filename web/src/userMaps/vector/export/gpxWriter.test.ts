import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection } from "geojson";
import { parseGpx } from "../parsers/gpxSource";
import { gpxDocumentString } from "./gpxWriter";

function collection(...features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

const MARK: Feature = {
  type: "Feature",
  id: "mark-1",
  geometry: { type: "Point", coordinates: [-60.91, 46.12, 41.5] },
  properties: {
    name: "Corner post",
    description: "NE corner, found flagged",
    "nsmts:capturedAt": "2026-08-29T14:05:00.000Z",
    "nsmts:accuracyM": 7.4,
  },
};

const TRACK: Feature = {
  type: "Feature",
  id: "track-1",
  geometry: {
    type: "LineString",
    coordinates: [
      [-60.91, 46.12],
      [-60.91, 46.121],
      [-60.91, 46.122],
    ],
  },
  properties: {
    name: "Boundary walk",
    coordinateProperties: {
      times: [
        "2026-08-29T14:00:00.000Z",
        "2026-08-29T14:00:10.000Z",
        "2026-08-29T14:00:20.000Z",
      ],
    },
  },
};

describe("gpxDocumentString", () => {
  it("writes waypoints with elevation, capture time, name, and description", () => {
    const gpx = gpxDocumentString("Field notes", collection(MARK));
    expect(gpx).toContain('version="1.1"');
    expect(gpx).toContain('creator="NS Marks The Spot"');
    expect(gpx).toContain('<wpt lat="46.12" lon="-60.91">');
    // GPX 1.1 is order-strict: ele, then time, then name, then desc.
    expect(gpx).toMatch(
      /<ele>41\.5<\/ele><time>2026-08-29T14:05:00\.000Z<\/time><name>Corner post<\/name><desc>NE corner, found flagged<\/desc>/,
    );
  });

  it("writes a LineString as one trk with per-vertex times", () => {
    const gpx = gpxDocumentString("Walks", collection(TRACK));
    expect(gpx.match(/<trkseg>/g)).toHaveLength(1);
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx.match(/<time>/g)).toHaveLength(3);
    expect(gpx).toContain("<name>Boundary walk</name>");
  });

  it("writes a MultiLineString as one trk with a trkseg per part", () => {
    const gpx = gpxDocumentString(
      "Walks",
      collection({
        type: "Feature",
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [-60.91, 46.12],
              [-60.91, 46.121],
            ],
            [
              [-60.92, 46.13],
              [-60.92, 46.131],
            ],
          ],
        },
        properties: {
          coordinateProperties: {
            times: [
              ["2026-08-29T14:00:00.000Z", "2026-08-29T14:00:10.000Z"],
              ["2026-08-29T14:05:00.000Z", "2026-08-29T14:05:10.000Z"],
            ],
          },
        },
      }),
    );
    expect(gpx.match(/<trk>/g)).toHaveLength(1);
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx.match(/<time>/g)).toHaveLength(4);
  });

  it("omits times on a length mismatch rather than fabricating them", () => {
    const gpx = gpxDocumentString(
      "Walks",
      collection({
        ...TRACK,
        properties: {
          coordinateProperties: { times: ["2026-08-29T14:00:00.000Z"] },
        },
      }),
    );
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).not.toContain("<time>");
  });

  it("skips polygons and keeps the rest of the layer", () => {
    const gpx = gpxDocumentString(
      "Mixed",
      collection(
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-61, 46],
                [-61, 46.1],
                [-60.9, 46.1],
                [-61, 46],
              ],
            ],
          },
          properties: { name: "Stand A" },
        },
        MARK,
      ),
    );
    expect(gpx).not.toContain("Stand A");
    expect(gpx.match(/<wpt /g)).toHaveLength(1);
  });

  it("escapes markup-bearing attributes structurally", () => {
    const gpx = gpxDocumentString(
      "Notes",
      collection({
        ...MARK,
        properties: {
          name: "<script>bad()</script>",
          description: '<img src=x onerror="pwn()">',
        },
      }),
    );
    expect(gpx).not.toContain("<script>");
    expect(gpx).not.toContain("<img");
  });

  it("round-trips through the app's GPX parser with geometry and times intact", () => {
    const gpx = gpxDocumentString("Field data", collection(MARK, TRACK));
    const parsed = parseGpx(gpx);
    expect(parsed.featureCount).toBe(2);

    const point = parsed.collection.features.find(
      ({ geometry }) => geometry.type === "Point",
    );
    expect(point?.geometry.type === "Point" && point.geometry.coordinates).toEqual([
      -60.91, 46.12, 41.5,
    ]);
    expect(point?.properties?.name).toBe("Corner post");

    const line = parsed.collection.features.find(
      ({ geometry }) => geometry.type === "LineString",
    );
    expect(
      (line?.properties?.coordinateProperties as { times: string[] }).times,
    ).toEqual([
      "2026-08-29T14:00:00.000Z",
      "2026-08-29T14:00:10.000Z",
      "2026-08-29T14:00:20.000Z",
    ]);
  });
});
