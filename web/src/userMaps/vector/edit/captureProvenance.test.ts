import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { withoutMovedCaptureProvenance } from "./captureProvenance";
import {
  NSMTS_ACCURACY_M,
  NSMTS_ALTITUDE_M,
  NSMTS_CAPTURED_AT,
} from "../../../location/captureSpec";

function mark(coordinates: number[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "mark-1",
        geometry: { type: "Point", coordinates },
        properties: {
          name: "Culvert",
          [NSMTS_CAPTURED_AT]: "2026-09-02T13:14:00.000Z",
          [NSMTS_ACCURACY_M]: 7.4,
          [NSMTS_ALTITUDE_M]: 31.5,
        },
      },
    ],
  };
}

describe("a mark moved by hand", () => {
  it("gives up the fix's claims, and keeps everything else", () => {
    const moved = withoutMovedCaptureProvenance(
      mark([-61.47, 45.8, 31.5]),
      mark([-61.46, 45.81, 31.5]),
    );
    const feature = moved.features[0];
    expect(feature.properties?.[NSMTS_CAPTURED_AT]).toBeUndefined();
    expect(feature.properties?.[NSMTS_ACCURACY_M]).toBeUndefined();
    expect(feature.properties?.[NSMTS_ALTITUDE_M]).toBeUndefined();
    // The elevation rode on the geometry too, and was the fix's.
    expect(feature.geometry).toEqual({
      type: "Point",
      coordinates: [-61.46, 45.81],
    });
    // The reader's own attribute is theirs.
    expect(feature.properties?.name).toBe("Culvert");
  });

  it("leaves a point nobody moved alone", () => {
    const next = mark([-61.47, 45.8, 31.5]);
    const same = withoutMovedCaptureProvenance(mark([-61.47, 45.8, 31.5]), next);
    expect(same).toBe(next);
    expect(same.features[0].properties?.[NSMTS_CAPTURED_AT]).toBe(
      "2026-09-02T13:14:00.000Z",
    );
  });

  it("leaves a mark that is only now being added alone", () => {
    // No previous copy: this is the commit that creates it.
    const next = mark([-61.47, 45.8]);
    expect(withoutMovedCaptureProvenance(null, next)).toBe(next);
    expect(
      withoutMovedCaptureProvenance({ type: "FeatureCollection", features: [] }, next)
        .features[0].properties?.[NSMTS_ACCURACY_M],
    ).toBe(7.4);
  });

  it("does not touch a point that never claimed a fix", () => {
    const plain: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "drawn-1",
          geometry: { type: "Point", coordinates: [-61.47, 45.8] },
          properties: { "nsmts:createdAt": "2026-09-02T13:14:00.000Z" },
        },
      ],
    };
    const moved: FeatureCollection = {
      ...plain,
      features: [
        {
          ...plain.features[0],
          geometry: { type: "Point", coordinates: [-61.4, 45.9] },
        },
      ],
    };
    expect(withoutMovedCaptureProvenance(plain, moved)).toBe(moved);
  });
});
