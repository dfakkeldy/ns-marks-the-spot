// Display-only notices, deliberately separate from executable layer descriptors.
// A pending request is not a refusal; use only the status supported by the
// current exclusion decision. Changing this copy never clears an exclusion.
export type UnavailableLayerReason =
  | "permission-pending"
  | "permission-unavailable"
  | "data-quality-concerns";

export const unavailableReasonLabels: Record<UnavailableLayerReason, string> = {
  "permission-pending": "Permission pending",
  "permission-unavailable": "Permission unavailable",
  "data-quality-concerns": "Data-quality concerns",
};

export type UnavailableLayerInfo = {
  id: string;
  name: string;
  reason: UnavailableLayerReason;
  detail: string;
};

export const unavailableLayers: readonly UnavailableLayerInfo[] = [
  {
    id: "wam-relative-wetness",
    name: "WAM relative wetness",
    reason: "data-quality-concerns",
    detail: "2005–2007 wet-areas model; concerns remain about reliability for current conditions.",
  },
  {
    id: "wam-predicted-flow",
    name: "WAM predicted flow",
    reason: "data-quality-concerns",
    detail: "2005–2007 drainage model; concerns remain about reliability for current conditions.",
  },
  {
    id: "forest-treatments",
    name: "Recorded forest treatments",
    reason: "permission-unavailable",
    detail: "Not cleared for public map display or export.",
  },
];
