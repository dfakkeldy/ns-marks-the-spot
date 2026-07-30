import type { EmbeddedGeoref, PixelSize } from "./transform/projection";

export type Gcp = {
  id: string;
  /** Original-image pixel space, so preview resolution never invalidates GCPs. */
  pixel: { x: number; y: number };
  /** WGS84 for portability; solves run in Web Mercator metres (see spec). */
  map: { lat: number; lng: number };
};

/**
 * Which solver turns a record's GCPs into a drape. Named rather than written
 * inline because the choice has to travel to THREE places that each decide
 * something different: the live session's mesh, `meshForRecord` (every saved
 * layer), and `needsGeoreferencing` (whether the record is drawable at all).
 * The stored union is unchanged, so there is no migration.
 */
export type GeoreferenceMethod = "affine" | "tps";

/** Produced by the PR-2 georeferencer; defined now so the store schema is stable. */
export type GcpGeoref = { kind: "gcp"; gcps: Gcp[]; method: GeoreferenceMethod };

export type UserMapGeoref = EmbeddedGeoref | GcpGeoref;

export type UserMapSource = "geotiff" | "geopdf" | "image";

export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfRegistrationFlavor = "measure" | "lgidict";

export type PdfRegistrationCandidate = {
  id: string;
  flavor: PdfRegistrationFlavor;
  embeddedLabel: string | null;
  sourceRect: PixelRect;
  gcps: Gcp[];
};

export type PdfManualReason =
  | "absent"
  | "unsupported"
  | "unsupported-crs"
  | "invalid"
  | "unreadable";

export type ParsedPdfRegistration =
  | {
      status: "automatic";
      selection:
        | { kind: "sole" }
        | { kind: "producer-rule"; ruleId: string };
      selected: PdfRegistrationCandidate;
      candidates: PdfRegistrationCandidate[];
    }
  | {
      status: "selection-required";
      candidates: PdfRegistrationCandidate[];
    }
  | {
      status: "manual";
      reason: PdfManualReason;
    };

export type PdfImportMetadata = {
  pageNumber: 1;
  pageCount: number;
  registration:
    | {
        status: "embedded";
        flavor: PdfRegistrationFlavor;
        selection:
          | { kind: "sole" }
          | { kind: "producer-rule"; ruleId: string }
          | { kind: "user" };
        selectedFrameId: string;
        selectedLabel: string | null;
        candidates: PdfRegistrationCandidate[];
        adjusted: boolean;
      }
    | {
        status: "selection-required";
        candidates: PdfRegistrationCandidate[];
      }
    | {
        status: "manual";
        reason: PdfManualReason;
        adjusted: boolean;
      };
};

export type UserMapRecord = {
  id: string;
  name: string;
  source: UserMapSource;
  createdAt: string;
  /** Original raster dimensions — GCP space, not preview space. */
  pixelSize: PixelSize;
  georef: UserMapGeoref;
  sourceRect?: PixelRect;
  pdf?: PdfImportMetadata;
};
