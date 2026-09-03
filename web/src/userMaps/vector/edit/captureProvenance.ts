import type { Feature, FeatureCollection, Point } from "geojson";
import {
  NSMTS_ACCURACY_M,
  NSMTS_ALTITUDE_M,
  NSMTS_CAPTURED_AT,
} from "../../../location/captureSpec";

/**
 * Takes a mark's fix provenance off any point a hand has moved.
 *
 * `nsmts:capturedAt` and `nsmts:accuracyM` say where the device was and how
 * sure it was of that; dragged to somewhere else, they describe a place the
 * point no longer is. The elevation goes with them, for the same reason: it
 * was measured where the fix was. Nothing else about the feature changes,
 * and a point that was not moved keeps everything.
 *
 * The same rule the native app applies on a vertex or feature move.
 */
export function withoutMovedCaptureProvenance(
  previous: FeatureCollection | null,
  next: FeatureCollection,
): FeatureCollection {
  if (!previous) {
    return next;
  }
  const before = new Map<string, Feature>();
  for (const feature of previous.features) {
    if (feature.id !== undefined) {
      before.set(String(feature.id), feature);
    }
  }
  let changed = false;
  const features = next.features.map((feature) => {
    if (feature.id === undefined || feature.geometry?.type !== "Point") {
      return feature;
    }
    const props = feature.properties ?? {};
    if (props[NSMTS_CAPTURED_AT] === undefined && props[NSMTS_ACCURACY_M] === undefined) {
      return feature;
    }
    const older = before.get(String(feature.id));
    if (!older || older.geometry?.type !== "Point") {
      return feature;
    }
    if (samePosition(older.geometry as Point, feature.geometry as Point)) {
      return feature;
    }
    changed = true;
    const kept = { ...props };
    delete kept[NSMTS_CAPTURED_AT];
    delete kept[NSMTS_ACCURACY_M];
    delete kept[NSMTS_ALTITUDE_M];
    const [longitude, latitude] = feature.geometry.coordinates;
    return {
      ...feature,
      // The third coordinate was the fix's altitude; it is not this place's.
      geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
      properties: kept,
    };
  });
  return changed ? { ...next, features } : next;
}

function samePosition(a: Point, b: Point): boolean {
  return a.coordinates[0] === b.coordinates[0] && a.coordinates[1] === b.coordinates[1];
}
