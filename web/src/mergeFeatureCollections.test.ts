import { describe, expect, it } from "vitest";
import { mergeFeatureCollections } from "./App";
import type { NsprdFeatureCollection } from "./services/nsprd";

const feature = (
  pid: string,
  ring: [number, number][],
): NsprdFeatureCollection["features"][number] => ({
  type: "Feature",
  properties: { PID: pid },
  geometry: { type: "Polygon", coordinates: [ring] },
});

const SQUARE: [number, number][] = [
  [-61.4, 46.05],
  [-61.3, 46.05],
  [-61.3, 46.1],
  [-61.4, 46.05],
];

describe("mergeFeatureCollections", () => {
  it("returns the CURRENT collection by identity when nothing new arrives", () => {
    // Six evidence effects key off this collection; a fresh object for a
    // no-op merge aborted and re-fired the whole selected-parcel fan-out on
    // every historical batch.
    const current: NsprdFeatureCollection = {
      type: "FeatureCollection",
      features: [feature("50292390", SQUARE)],
    };
    const incoming: NsprdFeatureCollection = {
      type: "FeatureCollection",
      features: [feature("50292390", SQUARE)],
    };

    expect(mergeFeatureCollections(current, incoming)).toBe(current);
  });

  it("appends genuinely new features while reusing existing feature objects", () => {
    const kept = feature("50292390", SQUARE);
    const current: NsprdFeatureCollection = {
      type: "FeatureCollection",
      features: [kept],
    };
    const added = feature("00542589", [
      [-63.6, 44.6],
      [-63.5, 44.6],
      [-63.5, 44.7],
      [-63.6, 44.6],
    ]);

    const merged = mergeFeatureCollections(current, {
      type: "FeatureCollection",
      features: [added],
    });

    expect(merged).not.toBe(current);
    expect(merged.features).toHaveLength(2);
    // Object reuse is what makes element-wise identity an honest change test
    // for the selected parcel's own features.
    expect(merged.features[0]).toBe(kept);
  });

  it("distinguishes same-PID features with different geometry", () => {
    // Multi-part parcels arrive as separate features sharing a PID; the
    // fingerprint must not collapse them.
    const current: NsprdFeatureCollection = {
      type: "FeatureCollection",
      features: [feature("50292390", SQUARE)],
    };
    const otherPart = feature("50292390", [
      [-61.2, 46.2],
      [-61.1, 46.2],
      [-61.1, 46.3],
      [-61.2, 46.2],
    ]);

    const merged = mergeFeatureCollections(current, {
      type: "FeatureCollection",
      features: [otherPart],
    });

    expect(merged.features).toHaveLength(2);
  });
});
