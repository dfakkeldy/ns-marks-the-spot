import type { BasemapStyle } from "../atlas/basemap";
import { atlasPalettes } from "../atlas/palette";
import type { PathOptions } from "leaflet";
import type { NsprdFeatureProperties } from "../services/nsprd";

export type MapRenderMode = "interactive" | "print";

export type ParcelStyleContext = {
  outlineColor?: string;
  selectedPid: string | null;
  showTaxSale: boolean;
  taxSalePids: Set<string>;
  showHistoricalTaxSales: boolean;
  historicalTaxSalePids: Set<string>;
};

export function parcelStyleForFeature(
  feature:
    | GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties>
    | undefined,
  context: ParcelStyleContext,
  renderMode: MapRenderMode = "interactive",
): PathOptions {
  if (renderMode === "print") {
    const pid = feature?.properties.PID;
    if (pid === context.selectedPid) {
      return {
        color: "#000000",
        fillColor: "#d8d8d8",
        fillOpacity: 0.45,
        weight: 4,
        className: "print-selected-parcel",
      };
    }
    if (pid && context.taxSalePids.has(pid) && context.showTaxSale) {
      return {
        color: "#111111",
        fillColor: "#eeeeee",
        fillOpacity: 0.32,
        weight: 2.5,
        className: "print-current-tax-sale-parcel",
      };
    }
    if (
      pid &&
      context.historicalTaxSalePids.has(pid) &&
      context.showHistoricalTaxSales
    ) {
      return {
        color: "#333333",
        fillColor: "#f4f4f4",
        fillOpacity: 0.3,
        weight: 2.25,
        dashArray: "7 4",
        className: "print-historical-tax-sale-parcel",
      };
    }
    return {
      color: "#777777",
      fillColor: "#ffffff",
      fillOpacity: 0.04,
      weight: 1,
      className: "print-context-parcel",
    };
  }
  return interactiveParcelStyleForFeature(feature, context);
}

function interactiveParcelStyleForFeature(
  feature:
    | GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties>
    | undefined,
  {
    outlineColor = "#0a7180",
    selectedPid,
    showTaxSale,
    taxSalePids,
    showHistoricalTaxSales,
    historicalTaxSalePids,
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
        fillOpacity: 0,
        weight: 4,
        className:
          "selected-parcel-outline selected-parcel-outline--historical",
      };
    }
    return {
      color: "#9f2f24",
      fillOpacity: 0,
      weight: 4,
      className: "selected-parcel-outline selected-parcel-outline--current",
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
    color: outlineColor,
    fillOpacity: 0,
    weight: 1.25,
  };
}

/** Background contrast only; selected and sale evidence keep their own symbols. */
export function parcelOutlineColor(style: BasemapStyle, imagery: boolean): string {
  if (imagery || style === 'night') return '#ffe66d';
  return style === 'fletcher' ? atlasPalettes.fletcher.crown : '#0a7180';
}

export function parcelBoundaryRenderer(color: string): string {
  const rgb = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16));
  return JSON.stringify([{ id: 0, source: { type: 'mapLayer', mapLayerId: 0 }, drawingInfo: {
    showLabels: false, labelingInfo: [], renderer: { type: 'simple', symbol: {
      type: 'esriSFS', style: 'esriSFSNull', color: [0, 0, 0, 0],
      outline: { type: 'esriSLS', style: 'esriSLSSolid', color: [...rgb, 255], width: 1.2 },
    } },
  } }]);
}
