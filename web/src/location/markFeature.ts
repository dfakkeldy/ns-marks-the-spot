import type { Feature, Point } from "geojson";
import { generateId } from "../userMaps/importUtils";
import {
  NSMTS_ACCURACY_M,
  NSMTS_ALTITUDE_M,
  NSMTS_CAPTURED_AT,
} from "./captureSpec";
import type { LiveFix } from "./liveLocation";

/**
 * A GPS mark is an ordinary user-layer Point whose provenance rides in the
 * reserved nsmts: properties — capture time and reported accuracy — so the
 * popup can say "Marked from GPS on this device (±N m)" and an export
 * carries the same honesty. The id is assigned here because raw-fix logs
 * and photo descriptors (later changes) key off feature ids.
 */
export function buildGpsMarkFeature(fix: LiveFix): Feature<Point> {
  const coordinates: [number, number] | [number, number, number] =
    fix.altitudeM === null
      ? [fix.longitude, fix.latitude]
      : [fix.longitude, fix.latitude, fix.altitudeM];
  const properties: Record<string, unknown> = {
    [NSMTS_CAPTURED_AT]: new Date(fix.timestampMs).toISOString(),
    [NSMTS_ACCURACY_M]: fix.accuracyM,
  };
  if (fix.altitudeM !== null) {
    properties[NSMTS_ALTITUDE_M] = fix.altitudeM;
  }
  return {
    type: "Feature",
    id: generateId(),
    geometry: { type: "Point", coordinates },
    properties,
  };
}
