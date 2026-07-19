import type { PathOptions } from "leaflet";
import type { NsprdFeatureProperties } from "../services/nsprd";

export const OPAQUE_SELECTED_PARCEL_ZOOM = 15;

type ParcelStyleContext = {
  selectedPid: string | null;
  showTaxSale: boolean;
  taxSalePids: Set<string>;
  showHistoricalTaxSales: boolean;
  historicalTaxSalePids: Set<string>;
  zoom: number;
};

export function parcelStyleForFeature(
  feature:
    | GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties>
    | undefined,
  {
    selectedPid,
    showTaxSale,
    taxSalePids,
    showHistoricalTaxSales,
    historicalTaxSalePids,
    zoom,
  }: ParcelStyleContext,
): PathOptions {
  const pid = feature?.properties.PID;
  const isSelected = pid === selectedPid;
  const isTaxSale = pid ? taxSalePids.has(pid) && showTaxSale : false;
  const isHistoricalTaxSale = pid
    ? historicalTaxSalePids.has(pid) && showHistoricalTaxSales
    : false;

  if (isSelected) {
    if (isHistoricalTaxSale && !isTaxSale) {
      return {
        color: "#49336f",
        fillColor: "#7461a8",
        fillOpacity: zoom >= OPAQUE_SELECTED_PARCEL_ZOOM ? 1 : 0.38,
        weight: 4,
      };
    }
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

  if (isHistoricalTaxSale) {
    return {
      color: "#5a4385",
      fillColor: "#a494cc",
      fillOpacity: 0.34,
      weight: 2.25,
      dashArray: "5 3",
    };
  }

  return {
    color: "#0a7180",
    fillColor: "#eef7f5",
    fillOpacity: 0.08,
    weight: 1.25,
  };
}
