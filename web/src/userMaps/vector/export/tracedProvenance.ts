import type { FeatureCollection } from "geojson";
import {
  FIELD_CAPTURE_SPEC,
  NSMTS_TRACED,
  NSMTS_TRACED_PARCEL,
} from "../../../location/captureSpec";
import { PROVINCE_ATTRIBUTION } from "../../../licensing/provinceLicense";

/**
 * A layer with any parcel-traced feature exports with this note (GeoJSON
 * foreign member, KML/GPX document description): the coordinates were traced
 * from licence-gated NSPRD geometry, the caveat is NSPRD's own, and the
 * attribution obligation travels with the file. Consumers that strip foreign
 * members still keep the per-feature nsmts:traced property.
 */
export const TRACED_PROVENANCE_NOTE =
  "Contains boundary coordinates traced from the Nova Scotia Property " +
  `Records Database (NSPRD). ${FIELD_CAPTURE_SPEC.snap.parcelCaveat} ` +
  PROVINCE_ATTRIBUTION;

export function hasTracedFeatures(collection: FeatureCollection): boolean {
  // Only the value the spec declares. An imported file carrying its own
  // "nsmts:traced" would otherwise put the NSPRD note and the Province's
  // attribution on an export the Province had nothing to do with.
  return collection.features.some(
    (feature) =>
      feature.properties &&
      typeof feature.properties === "object" &&
      (feature.properties as Record<string, unknown>)[NSMTS_TRACED] ===
        NSMTS_TRACED_PARCEL,
  );
}
