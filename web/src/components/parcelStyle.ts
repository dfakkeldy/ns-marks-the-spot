import type { PathOptions } from "leaflet";
import type { NsprdFeatureProperties } from "../services/nsprd";

export const OPAQUE_SELECTED_PARCEL_ZOOM = 15;

type ParcelStyleContext = {
  selectedPid: string | null;
  showTaxSale: boolean;
  taxSalePids: Set<string>;
  zoom: number;
};

export function parcelStyleForFeature(
  feature:
    | GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties>
    | undefined,
  { selectedPid, showTaxSale, taxSalePids, zoom }: ParcelStyleContext,
): PathOptions {
  const pid = feature?.properties.PID;
  const isSelected = pid === selectedPid;
  const isTaxSale = pid ? taxSalePids.has(pid) && showTaxSale : false;

  if (isSelected) {
    return {
      color: "#9f2f24",
      fillColor: "#be4d3c",
      fillOpacity: zoom >= OPAQUE_SELECTED_PARCEL_ZOOM ? 1 : 0.34,
      weight: 4,
    };
  }

  if (isTaxSale) {
    return {
      color: "#be4d3c",
      fillColor: "#e7a86b",
      fillOpacity: 0.3,
      weight: 2,
    };
  }

  return {
    color: "#0a7180",
    fillColor: "#eef7f5",
    fillOpacity: 0.08,
    weight: 1.25,
  };
}
