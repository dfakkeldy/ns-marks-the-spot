// Product exclusions are independent of Province viewing-licence acceptance.
// Keep the source descriptors for provenance, but never restore, render or
// reproduce these withheld datasets through the map.
const excludedIds = new Set([
  "wam-relative-wetness",
  "wam-predicted-flow",
  "forest-treatments",
]);

export function forestryExclusionReason(id: string): string | null {
  return excludedIds.has(id)
    ? "This source is excluded from the map and exports."
    : null;
}
