import type { OpenDataSource } from "./openDataSources";
import type { ArcGISExportOptions } from "./layerCatalog";

/** Web research overlays, independent of the native/offline catalogue. */
export interface ContextLayerDescriptor {
  id: string;
  name: string;
  category: "elections-districts" | "background-maps" | "land-property" | "roads-places" | "water-terrain" | "environment-hazards" | "forestry-ecology" | "geology-resources" | "historical-maps";
  serviceUrl: string;
  openData?: OpenDataSource;
  tileUrl?: string;
  sourceUrl: string;
  licenceUrl: string;
  licence: "province-open" | "province-restricted" | "cc-by" | "canada-open" | "halifax-open";
  attribution?: string;
  sourceDate: string;
  scale: string;
  coverage: string;
  webCaveat: string;
  minZoom: number;
  maxZoom: number;
  maxNativeZoom?: number;
  opacity: number;
  zIndex: number;
  exportOptions: ArcGISExportOptions;
  delivery?: "electoral" | "feature-query" | "static-image" | "tile";
  imageBounds?: readonly [readonly [number, number], readonly [number, number]];
  electoral?: import("./electoralLayers").ElectoralSource;
  idField?: string;
  outFields?: readonly string[];
  featureRenderer?: {
    field?: string;
    styles: Record<string, ContextFeatureStyle>;
    defaultStyle: ContextFeatureStyle;
  };
  /** Source-authored classes (or the explicit filtered feature classes). */
  legend: readonly { label: string; color?: string }[];
}

export interface ContextFeatureStyle {
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  radius?: number;
}
