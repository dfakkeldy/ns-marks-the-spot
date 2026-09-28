import type { OpenDataSource } from "./openDataSources";
import type { ArcGISExportOptions } from "./layerCatalog";

/** Web research overlays, independent of the native/offline catalogue. */
export interface ContextLayerDescriptor {
  id: string;
  name: string;
  category: "rhodena-project" | "elections-districts" | "background-maps" | "land-property" | "roads-places" | "water-terrain" | "environment-hazards" | "forestry-ecology" | "geology-resources" | "historical-maps";
  serviceUrl: string;
  openData?: OpenDataSource;
  tileUrl?: string;
  sourceUrl: string;
  licenceUrl: string;
  licence: "public-facts" | "province-open" | "province-restricted" | "province-unrestricted" | "cc-by" | "canada-open" | "halifax-open";
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
  delivery?: "rhodena" | "electoral" | "feature-query" | "static-image" | "tile";
  imageBounds?: readonly [readonly [number, number], readonly [number, number]];
  electoral?: import("./electoralLayers").ElectoralSource;
  idField?: string;
  outFields?: readonly string[];
  /** Optional bounded adapters for sources that do not expose ArcGIS queries. */
  vectorSource?: ContextVectorSource;
  featureWhere?: string;
  labelField?: string;
  popupFields?: readonly { field: string; label: string; values?: Readonly<Record<string, string>> }[];
  /** Known source envelope; an outside view must not be reported as empty. */
  coverageBounds?: { west: number; south: number; east: number; north: number };
  featureRenderer?: {
    field?: string;
    styles: Record<string, ContextFeatureStyle>;
    defaultStyle: ContextFeatureStyle;
  };
  /** Source-authored classes (or the explicit filtered feature classes). */
  legend: readonly { label: string; color?: string }[];
  /** Include a publisher-authored image legend in the printed source key. */
  printLegend?: boolean;
}

export type ContextVectorSource =
  | { kind: "socrata-points"; dataset: string; latitudeField: string; longitudeField: string; fields: readonly string[]; where?: string }
  | { kind: "ogc-features" }
  | { kind: "geojson"; url: string };

export interface ContextFeatureStyle {
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  radius?: number;
}
