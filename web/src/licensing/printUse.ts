import { openProvinceSources } from "../layers/openDataSources";
import type { PrintCapture, PrintSnapshot } from "../services/printSnapshot";
import { PARCEL_REPRODUCTION_LOCK_REASON, reproductionLockReason } from "./layerUse";

/** Check retained source data as well as switches; turning a source off is not a reproduction grant. */
export function printReproductionLockReason(capture: PrintCapture | PrintSnapshot): string | null {
  if (capture.pid || capture.selectedParcelGeometry.features.length || capture.mapParcels.features.length) {
    return PARCEL_REPRODUCTION_LOCK_REASON;
  }
  for (const id of capture.layerIds) {
    const reason = reproductionLockReason(id, openProvinceSources[id]);
    if (reason) return reason;
  }
  return null;
}
