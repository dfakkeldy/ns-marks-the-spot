import { openProvinceSources, type OpenDataSource } from "../layers/openDataSources";
import openSourceReceipt from "../data/openLayerSources.json";
export const PROPERTY_RECORD_REPRODUCTION_ALLOWED = false;

/** Reversible product locks. A public endpoint or display acceptance is not an export grant. */
export const MUNICIPAL_QUERY_LOCK_IDS = [
  "zoning-inverness", "zoning-victoria", "zoning-richmond", "zoning-cumberland",
] as const;

export const PROVINCE_REPRODUCTION_LOCK_IDS = [
  "ns-aerial", "nsprd", "crown-lands", "flood-risk", "waterfalls", "water-features",
  "roads", "buildings", "place-names", "main-roads", "contours",
  "published-river-flood-zones", "arsenic-risk-wells", "manganese-risk-wells",
  "surficial-aquifers", "mineral-proximity-parcels",
] as const;

export const MUNICIPAL_QUERY_LOCK_REASON =
  "Layer locked: permission for app queries, caching and exports has not been confirmed. Use the official source or by-law link.";
export const PARCEL_REPRODUCTION_LOCK_REASON =
  "Export locked: permission to reproduce NSPRD property records or derived boundary coordinates has not been confirmed. Viewing acceptance does not grant redistribution.";
export const FLETCHER_REPRODUCTION_LOCK_REASON =
  "Export locked: Fletcher viewing and offline use remain available; permission for PDF or other reproduction has not been confirmed.";

export function queryLockReason(id: string): string | null {
  return (MUNICIPAL_QUERY_LOCK_IDS as readonly string[]).includes(id) ? MUNICIPAL_QUERY_LOCK_REASON : null;
}

/** The web's verified OGL replacement is separate from the native restricted service with the same id. */
function isDocumentedOpenReplacement(id: string, source?: OpenDataSource): boolean {
  const documented = openProvinceSources[id];
  return !!source && !!documented && source.parts.length > 0 && source.parts.every(part =>
    documented.parts.some(allowed => allowed.dataset === part.dataset) &&
    openSourceReceipt.datasets.some(receipt => receipt.id === part.dataset && receipt.licenseId === "OGL_NOVA_SCOTIA"));
}

export function reproductionLockReason(id: string, source?: OpenDataSource): string | null {
  if (isDocumentedOpenReplacement(id, source)) return null;
  if (id === "fletcher" || id.startsWith("fletcher-")) return FLETCHER_REPRODUCTION_LOCK_REASON;
  if (id === "selected-parcel" || (PROVINCE_REPRODUCTION_LOCK_IDS as readonly string[]).includes(id)) {
    return PARCEL_REPRODUCTION_LOCK_REASON.replace("NSPRD property records or derived boundary coordinates", "Province restricted material or derived boundary coordinates");
  }
  return queryLockReason(id);
}

export function assertReproductionAllowed(ids: readonly (string | { id: string; openData?: OpenDataSource })[]): void {
  for (const entry of ids) {
    const reason = typeof entry === "string" ? reproductionLockReason(entry) : reproductionLockReason(entry.id, entry.openData);
    if (reason) throw new Error(reason);
  }
}
