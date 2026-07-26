import { describe, expect, it } from "vitest";
import type { UserMapRecord } from "../types";
import { BENT, gcpRecord } from "../testFixtures";
import { georeferenceAnnotation } from "./annotation";

/**
 * Unwraps a `georeferenceAnnotation` result in a test that expects an
 * annotation, throwing with a clear message on the branch that returns null.
 * Mirrors `expectTpsReport` in `testFixtures.ts`: a bare `annotation!.body`
 * dies with "Cannot read properties of null" several lines from the fixture
 * that produced it.
 */
function expectAnnotation(record: UserMapRecord) {
  const annotation = georeferenceAnnotation(record);
  if (!annotation) {
    throw new Error("expected a georeference annotation, got null");
  }
  return annotation;
}

describe("georeferenceAnnotation", () => {
  it("returns null when the record has no GCPs to serialize", () => {
    // An embedded-georeference raster (GeoTIFF tiepoints) carries no GCPs —
    // there is nothing that maps onto a Georeference Annotation Feature list.
    const record: UserMapRecord = {
      ...gcpRecord(),
      georef: {
        kind: "embedded",
        crs: "EPSG:26920",
        geotransform: [500000, 1, 0, 5100000, 0, -1],
      },
    };
    expect(georeferenceAnnotation(record)).toBeNull();
  });

  it("serializes a TPS record: thinPlateSpline with no options, one Feature per GCP, resourceCoords/coordinates in opposite orders", () => {
    const record = gcpRecord({
      georef: { kind: "gcp", method: "tps", gcps: BENT },
    });
    const annotation = expectAnnotation(record);

    // @context must be an array — an Annotation with a bare string context
    // is a different (and here, wrong) JSON-LD shape.
    expect(Array.isArray(annotation["@context"])).toBe(true);
    expect(annotation.type).toBe("Annotation");
    expect(annotation.motivation).toBe("georeferencing");

    // transformation lives on the body FeatureCollection, NOT the annotation
    // root — placing it at the root produces a silently invalid annotation.
    expect((annotation as Record<string, unknown>).transformation).toBeUndefined();
    expect(annotation.body.type).toBe("FeatureCollection");
    expect(annotation.body.transformation).toEqual({ type: "thinPlateSpline" });

    expect(annotation.body.features).toHaveLength(BENT.length);
    const [feature] = annotation.body.features;
    const [gcp] = BENT;

    // resourceCoords is [x, y] pixel space...
    expect(feature.properties.resourceCoords).toEqual([gcp.pixel.x, gcp.pixel.y]);
    // ...while GeoJSON geometry.coordinates is [lon, lat] — the OPPOSITE
    // order. BENT's longitude is negative and latitude positive, so a
    // [lat, lng] transposition here flips a sign rather than silently
    // matching another valid-looking pair.
    expect(feature.geometry.coordinates).toEqual([gcp.map.lng, gcp.map.lat]);
    expect(feature.geometry.coordinates[0]).toBeLessThan(0);
    expect(feature.geometry.coordinates[1]).toBeGreaterThan(0);

    // target carries the ORIGINAL pixelSize (never a preview dimension — the
    // same rule that governs Gcp.pixel throughout this module), and a
    // urn:uuid placeholder since our maps are local files with no IIIF URI.
    expect(annotation.target).toEqual({
      type: "Canvas",
      id: `urn:uuid:${record.id}`,
      width: record.pixelSize.width,
      height: record.pixelSize.height,
    });
    // pixelSize.width !== pixelSize.height on this fixture, so a transposed
    // width/height would be caught by the toEqual above rather than passing
    // by coincidence.
    expect(record.pixelSize.width).not.toBe(record.pixelSize.height);
  });

  it("serializes an affine record with polynomial order 1", () => {
    const record = gcpRecord({
      georef: { kind: "gcp", method: "affine", gcps: BENT.slice(0, 4) },
    });
    const annotation = expectAnnotation(record);

    expect(annotation.body.transformation).toEqual({
      type: "polynomial",
      options: { order: 1 },
    });
  });
});
