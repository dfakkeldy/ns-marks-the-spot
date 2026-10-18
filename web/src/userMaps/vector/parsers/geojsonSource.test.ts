import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../../errors";
import { MAX_VECTOR_FEATURES, parseGeoJson } from "./geojsonSource";

function expectCode(fn: () => unknown, code: string): UserMapImportError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UserMapImportError);
  const importError = caught as UserMapImportError;
  expect(importError.code).toBe(code);
  return importError;
}

function feature(coordinates: [number, number], properties: object = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties,
  };
}

describe("parseGeoJson", () => {
  it("parses a FeatureCollection and reports count and bbox", () => {
    const parsed = parseGeoJson(
      JSON.stringify({
        type: "FeatureCollection",
        features: [feature([-63.6, 44.65]), feature([-60.2, 46.1])],
      }),
    );
    expect(parsed.featureCount).toBe(2);
    expect(parsed.bbox).toEqual([-63.6, 44.65, -60.2, 46.1]);
    expect(parsed.collection.type).toBe("FeatureCollection");
  });

  it("wraps a bare Feature into a collection", () => {
    const parsed = parseGeoJson(JSON.stringify(feature([-63, 45])));
    expect(parsed.featureCount).toBe(1);
    expect(parsed.collection.features[0].geometry).toEqual({
      type: "Point",
      coordinates: [-63, 45],
    });
  });

  it("wraps a bare geometry into a collection", () => {
    const parsed = parseGeoJson(
      JSON.stringify({ type: "LineString", coordinates: [[-63, 45], [-62, 45.5]] }),
    );
    expect(parsed.featureCount).toBe(1);
    expect(parsed.collection.features[0].geometry.type).toBe("LineString");
  });

  it("assigns unique string ids to every feature", () => {
    const parsed = parseGeoJson(
      JSON.stringify({
        type: "FeatureCollection",
        features: [feature([-63, 45]), feature([-62, 45]), feature([-61, 45])],
      }),
    );
    const ids = parsed.collection.features.map((f) => f.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });

  it("preserves existing feature ids when they are unique", () => {
    const withId = { ...feature([-63, 45]), id: "my-feature" };
    const parsed = parseGeoJson(
      JSON.stringify({ type: "FeatureCollection", features: [withId] }),
    );
    expect(parsed.collection.features[0].id).toBe("my-feature");
  });

  it("regenerates ids when the file repeats one", () => {
    const a = { ...feature([-63, 45]), id: "dup" };
    const b = { ...feature([-62, 45]), id: "dup" };
    const parsed = parseGeoJson(
      JSON.stringify({ type: "FeatureCollection", features: [a, b] }),
    );
    const ids = parsed.collection.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("refuses malformed JSON as corrupt-file", () => {
    expectCode(() => parseGeoJson("{not json"), "corrupt-file");
  });

  it("refuses valid JSON that is not GeoJSON as unsupported-type", () => {
    expectCode(() => parseGeoJson('{"rows": [1, 2, 3]}'), "unsupported-type");
  });

  it("refuses non-finite coordinates as corrupt-file", () => {
    expectCode(
      () =>
        parseGeoJson(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: { type: "Point", coordinates: [null, 45] }, properties: {} },
            ],
          }),
        ),
      "corrupt-file",
    );
  });

  it("refuses an empty FeatureCollection as empty-file", () => {
    expectCode(
      () => parseGeoJson(JSON.stringify({ type: "FeatureCollection", features: [] })),
      "empty-file",
    );
  });

  it("refuses a legacy crs member naming a projected CRS as unsupported-crs", () => {
    expectCode(
      () =>
        parseGeoJson(
          JSON.stringify({
            type: "FeatureCollection",
            crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::26920" } },
            features: [feature([500000, 4980000])],
          }),
        ),
      "unsupported-crs",
    );
  });

  it("accepts a legacy crs member naming CRS84 or EPSG:4326", () => {
    const parsed = parseGeoJson(
      JSON.stringify({
        type: "FeatureCollection",
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
        features: [feature([-63, 45])],
      }),
    );
    expect(parsed.featureCount).toBe(1);
  });

  it("refuses collections above the feature cap as too-many-features", () => {
    const features = Array.from({ length: MAX_VECTOR_FEATURES + 1 }, (_, i) =>
      feature([-63 + (i % 100) * 0.001, 45]),
    );
    expectCode(
      () => parseGeoJson(JSON.stringify({ type: "FeatureCollection", features })),
      "too-many-features",
    );
  });

  it("refuses out-of-range longitude/latitude as invalid-georeferencing", () => {
    expectCode(
      () =>
        parseGeoJson(
          JSON.stringify({
            type: "FeatureCollection",
            features: [feature([500000, 4980000])],
          }),
        ),
      "invalid-georeferencing",
    );
  });
});
