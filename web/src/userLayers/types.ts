export type UserLayerKind = "xyz" | "tms" | "wms" | "arcgis-map" | "arcgis-image";

export type UserLayerRecord = {
  id: string;
  kind: UserLayerKind;
  role: "base" | "overlay";
  name: string;
  url: string;
  attribution: string;
  termsNote: string;
  termsUrl: string | null;
  minZoom: number;
  maxNativeZoom: number;
  tileSize: 256 | 512;
  wms?: { layers: string; styles: string; format: "image/png" | "image/jpeg"; version: "1.1.1" | "1.3.0"; transparent: boolean };
  arcgis?: { layers: string | null };
  createdAt: string;
  modifiedAt: string;
  acknowledgement: { version: 1; at: string } | null;
  probe: { display: boolean | null; corsReadable: boolean | null; at: string; diagnostic?: string } | null;
};

export type UserLayerUiState = Record<string, { enabled: boolean; opacity: number }>;
