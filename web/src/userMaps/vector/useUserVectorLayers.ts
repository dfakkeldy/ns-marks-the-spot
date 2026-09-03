import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestDurableStorage } from "../../services/durableStorage";
import type { Feature, FeatureCollection } from "geojson";
import { FIELD_NOTES_LAYER_NAME } from "../../location/captureSpec";
import { summarize } from "./summarize";
import { UserMapImportError } from "../errors";
import { generateId, stripExtension } from "../importUtils";
import { downloadFile } from "../../services/downloadFile";
import { parseGeoJsonAuto } from "./parsers/parseVectorInWorker";
import type { ParsedVector } from "./parsers/geojsonSource";
import { classifyArchive, parseKmzWithAssets } from "./parsers/kmzSource";
import { parseShapefileAuto } from "./parsers/parseShapefileAuto";
import type { ParsedShapefileLayer } from "./parsers/shapefileZipSource";
import { parseXmlVector, type ParsedXmlVector } from "./parsers/xmlVectorSource";
import { sniffVectorType } from "./parsers/sniffVector";
import { geojsonExportBlob } from "./export/exportGeoJson";
import { kmlExportBlob } from "./export/kmlWriter";
import { gpxExportBlob } from "./export/gpxWriter";
import { buildKmzBlob } from "./export/kmzWriter";
import { processPhoto } from "./photos/photoPipeline";
import { UserPhotoStore } from "./photos/photoStore";
import { relinkKmzPhotos } from "./photos/relinkKmzPhotos";
import {
  MAX_PHOTOS_PER_FEATURE,
  MAX_PHOTOS_PER_LAYER,
  PHOTOS_PROPERTY,
  readKmzPhotoDescriptors,
  readPhotoDescriptors,
  type FeaturePhotoDescriptor,
} from "./photos/types";
import { nextLayerColor } from "./render/style";
import { UserVectorStore } from "./store/userVectorStore";
import type { UserVectorLayerRecord, UserVectorSource } from "./types";

export type VectorExportFormat = "geojson" | "kml" | "gpx" | "kmz";

/** One layer awaiting a record — a single file may produce several. */
type PendingLayer = {
  parsed: ParsedVector;
  name: string;
  source: UserVectorSource;
  note?: string;
  /** KMZ only: the archive's photo bytes, for descriptor re-linking. */
  assets?: Map<string, Uint8Array>;
};

/**
 * Well below the raster 500 MB cap on purpose: rasters get downsampled into
 * a preview, but every vector vertex is rendered and hit-tested as-is. A
 * 50 MB GeoJSON is already millions of vertices — far past any interactive
 * budget — so bigger files are refused before they are even read.
 */
export const MAX_VECTOR_FILE_BYTES = 50 * 1024 * 1024;

const UI_STATE_KEY = "user-vector-ui-state-v1";

export type VectorImportOutcome =
  | { fileName: string; ok: true; id: string; note?: string }
  | { fileName: string; ok: false; message: string };

/** One picked photo the bulk-placement dialog confirmed. */
/**
 * What became of an append: the advanced record, and whether it reached the
 * device. A failed write keeps the features on the map for this session, so
 * the caller must not report a mark as saved when it is only shown.
 */
export type AppendOutcome = {
  record: UserVectorLayerRecord;
  persisted: boolean;
};

export type BulkPhotoEntry = {
  file: File;
  gps: { lon: number; lat: number };
  capturedAt: string | null;
};

/** Enabled-only (no opacity): vector styles carry their own fill/stroke opacity. */
export type UserVectorUiState = Record<string, { enabled: boolean }>;

export type VisibleUserVectorLayer = {
  record: UserVectorLayerRecord;
  data: FeatureCollection;
};

export type UserVectorFitRequest = { layerId: string; revision: number };

export type UserVectorLayersApi = {
  records: UserVectorLayerRecord[];
  uiState: UserVectorUiState;
  visibleLayers: VisibleUserVectorLayer[];
  fitRequest: UserVectorFitRequest | null;
  importing: boolean;
  importingLabel: string | null;
  storageError: string | null;
  outcomes: VectorImportOutcome[];
  importFiles: (files: ArrayLike<File>) => Promise<void>;
  removeLayer: (id: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => void;
  /** Export is offered for user layers ONLY — never for official sources. */
  exportLayer: (id: string, format: VectorExportFormat) => Promise<void>;
  /**
   * Downloads a recorded layer's original file — the raw GPX of every fix
   * as received, before filtering. The processed geometry is the map layer;
   * this is the evidence behind it.
   */
  exportRawRecording: (id: string) => Promise<void>;
  /** Geometry by layer id — the edit session seeds its working copy from this. */
  geometries: Record<string, FeatureCollection>;
  /**
   * The store's guarded update, for the edit session's debounced writes.
   * Resolves false when the layer is gone from the database — another tab
   * deleted it — and nothing was written.
   */
  putVectorLayer: (
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ) => Promise<boolean>;
  /** Creates an empty layer to draw into; returns its id. */
  createDrawnLayer: () => Promise<string>;
  /** Finds or creates the drawn "Field notes" layer GPS marks land in. */
  ensureFieldNotesLayer: () => Promise<string>;
  /**
   * Saves a finished track recording as a new layer: origin "recorded", the
   * processed geometry as the layer, the raw GPX as its original file.
   */
  createRecordedLayer: (input: {
    name: string;
    collection: FeatureCollection;
    rawGpx: Blob;
    startedAt: string;
    endedAt: string;
    /** True only for a walk recovered from an interrupted session. */
    interrupted?: boolean;
  }) => Promise<{ record: UserVectorLayerRecord; persisted: boolean }>;
  /**
   * Appends features to an existing layer outside an edit session, stamping
   * modifiedAt so the row's provenance shows the layer changed. Returns the
   * advanced record, or null when the layer no longer exists.
   */
  appendFeatures: (
    layerId: string,
    features: Feature[],
  ) => Promise<AppendOutcome | null>;
  /**
   * Bulk EXIF placement: one new "photos" layer, one Point per entry at its
   * geotag, photos processed and attached. Failures create the point
   * without its photo and say so, per entry.
   */
  createPhotoLayer: (
    entries: BulkPhotoEntry[],
  ) => Promise<{ id: string | null; notes: string[] }>;
  /** Applies an edit session's result to the list and the store. */
  applyLayerEdit: (
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ) => void;
};

function loadUiState(): UserVectorUiState {
  try {
    // `?? "{}"` only covers a missing key. A stored `null`, array or number
    // parses without throwing, and the cast then launders it into something
    // every caller indexes — `uiState[id]` in visibleLayers and the rows, and
    // again in each setter that reads this back. Indexing `null` throws, so
    // one corrupt value would take the map to the error boundary on every
    // load. Only a plain object can carry this state; anything else counts as
    // nothing remembered, exactly like an empty store.
    const parsed: unknown = JSON.parse(localStorage.getItem(UI_STATE_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as UserVectorUiState;
  } catch {
    return {};
  }
}

/**
 * Owns all "Your data" vector-layer state, mirroring useUserMaps' contracts:
 * the size cap is checked before the file is read, a storage failure keeps
 * the layer for the session with a note (never discards the import),
 * `records` is only replaced wholesale with reference reuse, and openStore /
 * parseGeoJson are closure-injection seams for tests.
 */
export function useUserVectorLayers(
  options: {
    openStore?: () => Promise<UserVectorStore>;
    openPhotoStore?: () => Promise<UserPhotoStore>;
    parseGeoJson?: (buffer: ArrayBuffer) => Promise<ParsedVector>;
    processPhoto?: typeof processPhoto;
    download?: (filename: string, blob: Blob) => void;
  } = {},
): UserVectorLayersApi {
  const openStoreRef = useRef(options.openStore ?? (() => UserVectorStore.open()));
  const openPhotoStoreRef = useRef(
    options.openPhotoStore ?? (() => UserPhotoStore.open()),
  );
  const processPhotoRef = useRef(options.processPhoto ?? processPhoto);
  const photoStorePromiseRef = useRef<Promise<UserPhotoStore> | null>(null);
  const parseRef = useRef(options.parseGeoJson ?? parseGeoJsonAuto);
  const parseXmlVectorRef = useRef<(text: string) => ParsedXmlVector>(parseXmlVector);
  const parseKmzRef = useRef(parseKmzWithAssets);
  const classifyArchiveRef = useRef(classifyArchive);
  const parseShapefileRef =
    useRef<(buffer: ArrayBuffer) => Promise<ParsedShapefileLayer[]>>(parseShapefileAuto);
  const downloadRef = useRef(options.download ?? downloadFile);
  const storeRef = useRef<Promise<UserVectorStore> | null>(null);
  const [records, setRecords] = useState<UserVectorLayerRecord[]>([]);
  const [geometries, setGeometries] = useState<Record<string, FeatureCollection>>({});
  const [uiState, setUiState] = useState<UserVectorUiState>(loadUiState);
  // The same record as `uiState`, readable from a callback without capturing
  // it. Storage is read once — the initializer above — and never again;
  // persistUiState says why.
  const uiStateRef = useRef<UserVectorUiState>(uiState);
  const [importing, setImporting] = useState(false);
  const [importingLabel, setImportingLabel] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<VectorImportOutcome[]>([]);
  const [fitRequest, setFitRequest] = useState<UserVectorFitRequest | null>(null);
  const fitRevisionRef = useRef(0);

  const store = useCallback((): Promise<UserVectorStore> => {
    if (!storeRef.current) {
      const opening = openStoreRef.current();
      // Mirrors useUserMaps: never cache a rejected open, or one transient
      // IndexedDB failure disables persistence for the session.
      opening.catch(() => {
        if (storeRef.current === opening) {
          storeRef.current = null;
        }
      });
      storeRef.current = opening;
    }
    return storeRef.current;
  }, []);

  const photoStore = useCallback((): Promise<UserPhotoStore> => {
    if (!photoStorePromiseRef.current) {
      const opening = openPhotoStoreRef.current();
      opening.catch(() => {
        if (photoStorePromiseRef.current === opening) {
          photoStorePromiseRef.current = null;
        }
      });
      photoStorePromiseRef.current = opening;
    }
    return photoStorePromiseRef.current;
  }, []);

  /**
   * What this session is showing is the truth; localStorage only writes it
   * down. Every change is computed from the record already held and never
   * re-read from storage: a browser that refuses the write (quota) or
   * refuses the read (Safari with "Block all cookies" and some in-app
   * WebViews throw from any localStorage touch — App.tsx's
   * isLicenceAccepted guards the same throw) would otherwise hand the NEXT
   * change a stale or empty record, and every layer switched on since then
   * would drop out of visibleLayers, off the map and out of its own row,
   * with nothing said. The native app keeps the same answer the same way:
   * UserVectorsViewModel.setVisible writes from the row it just changed.
   *
   * The mirror moves with the setter rather than in an effect because one
   * import calls this once per layer inside a single tick, and those changes
   * have to accumulate rather than overwrite each other.
   */
  const persistUiState = useCallback(
    (update: (current: UserVectorUiState) => UserVectorUiState) => {
      const next = update(uiStateRef.current);
      uiStateRef.current = next;
      setUiState(next);
      try {
        localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
      } catch {
        // Quota or a blocked store: a failed convenience write must never
        // surface as a failed import or throw out of an enable toggle. The
        // session keeps what the line above set either way.
      }
    },
    [],
  );

  const requestFit = useCallback((layerId: string) => {
    fitRevisionRef.current += 1;
    setFitRequest({ layerId, revision: fitRevisionRef.current });
  }, []);

  // Initial load of persisted layers; merge by id so a fast import that lands
  // before this list resolves is never overwritten nor duplicated.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opened = await store();
        const loaded = await opened.listVectorLayers();
        if (cancelled) {
          return;
        }
        setRecords((prev) => {
          const known = new Set(prev.map((r) => r.id));
          const merged = [...prev, ...loaded.filter((r) => !known.has(r.id))];
          return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        for (const record of loaded) {
          const geometry = await opened.getGeometry(record.id);
          if (!cancelled && geometry) {
            setGeometries((prev) =>
              prev[record.id] ? prev : { ...prev, [record.id]: geometry },
            );
          }
        }
      } catch {
        if (!cancelled) {
          setStorageError(
            "Saved data layers are unavailable in this browser session. " +
              "Imports still work, but only until you close the tab.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  // importFiles derives each new layer's color from the layer count at that
  // moment without capturing `records` (which would churn importFiles'
  // identity every import); the cursor is advanced locally per batch because
  // React may not flush setRecords between files of one batch.
  const recordsSnapshotRef = useRef(records);
  useEffect(() => {
    recordsSnapshotRef.current = records;
  }, [records]);

  // Same reason as recordsSnapshotRef: exportLayer must read the current
  // geometry without capturing it, or its identity churns on every import.
  const geometriesSnapshotRef = useRef(geometries);
  useEffect(() => {
    geometriesSnapshotRef.current = geometries;
  }, [geometries]);

  const importFiles = useCallback(
    async (files: ArrayLike<File>) => {
      setImporting(true);
      const batch: VectorImportOutcome[] = [];
      let colorCursor = recordsSnapshotRef.current.length;
      try {
        for (const file of Array.from(files)) {
          setImportingLabel(`Reading "${file.name}"…`);
          try {
            if (file.size > MAX_VECTOR_FILE_BYTES) {
              throw new UserMapImportError(
                "too-large",
                "This file is over 50 MB — too much to draw interactively. " +
                  "Export a smaller extract and re-import.",
              );
            }
            const buffer = await file.arrayBuffer();
            const sniffed = sniffVectorType(
              new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength)),
            );
            // One dropped file can hold several layers: a zipped shapefile
            // gets one layer per .shp, since collapsing unrelated feature
            // sets under a single name and style would misrepresent them.
            let pending: PendingLayer[];
            if (sniffed === "xml-candidate") {
              // DOMParser has no worker equivalent, so KML/GPX parse on the
              // main thread (same constraint as parsers/fletcherGcps.ts).
              const xml = parseXmlVectorRef.current(new TextDecoder().decode(buffer));
              pending = [
                { parsed: xml, name: stripExtension(file.name), source: xml.source },
              ];
            } else if (sniffed === "zip") {
              const kind = await classifyArchiveRef.current(buffer);
              if (kind === "kmz") {
                const { parsed, assets } = await parseKmzRef.current(buffer);
                pending = [
                  {
                    parsed,
                    name: stripExtension(file.name),
                    source: "kmz",
                    assets,
                  },
                ];
              } else if (kind === "shapefile") {
                // Transfers `buffer` to a worker, so this is its last use here.
                const layers = await parseShapefileRef.current(buffer);
                pending = layers.map((layer) => ({
                  parsed: layer,
                  name: layer.name,
                  source: "shapefile-zip" as const,
                  note: layer.note,
                }));
              } else {
                throw new UserMapImportError(
                  "unsupported-type",
                  "This archive holds neither a KML nor a shapefile.",
                );
              }
            } else if (sniffed === "geojson-candidate") {
              // parseGeoJsonAuto may transfer `buffer` to a worker, so this is
              // the last use of it on this thread.
              pending = [
                {
                  parsed: await parseRef.current(buffer),
                  name: stripExtension(file.name),
                  source: "geojson",
                },
              ];
            } else {
              throw new UserMapImportError(
                "unsupported-type",
                "Not a recognized data file. GeoJSON, KML, KMZ, GPX, and zipped shapefiles all work.",
              );
            }

            const now = new Date().toISOString();
            const notes: string[] = [];
            let firstId: string | null = null;
            for (const layer of pending) {
              const record: UserVectorLayerRecord = {
                id: generateId(),
                name: layer.name,
                source: layer.source,
                origin: { kind: "imported", filename: file.name, importedAt: now },
                createdAt: now,
                revision: 0,
                style: { color: nextLayerColor(colorCursor) },
                featureCount: layer.parsed.featureCount,
                bbox: layer.parsed.bbox,
              };
              if (layer.note) {
                notes.push(layer.note);
              }
              // The KMZ interchange profile: photos referenced by the
              // document re-link into the photo store under fresh ids
              // BEFORE the layer saves, so the persisted geometry already
              // carries internal descriptors.
              let collection = layer.parsed.collection;
              // Gate on references, not archive contents: a KMZ that names
              // photos it doesn't carry must still go through relinking so
              // the misses are counted and the stale descriptors cleaned.
              const referencesPhotos =
                layer.assets !== undefined &&
                collection.features.some(
                  (feature) =>
                    readKmzPhotoDescriptors(feature.properties).length > 0,
                );
              if (layer.assets && referencesPhotos) {
                try {
                  const relinked = await relinkKmzPhotos({
                    layerId: record.id,
                    collection,
                    assets: layer.assets,
                    store: await photoStore(),
                    process: processPhotoRef.current,
                  });
                  collection = relinked.collection;
                  if (relinked.missingFromArchive > 0) {
                    notes.push(
                      `${relinked.missingFromArchive} referenced photo${
                        relinked.missingFromArchive === 1 ? " was" : "s were"
                      } missing from the archive.`,
                    );
                  }
                  if (relinked.undecodable > 0) {
                    notes.push(
                      `${relinked.undecodable} photo${
                        relinked.undecodable === 1 ? "" : "s"
                      } couldn't be processed and ${
                        relinked.undecodable === 1 ? "was" : "were"
                      } left out.`,
                    );
                  }
                  if (relinked.capped > 0) {
                    notes.push(
                      `${relinked.capped} photo${
                        relinked.capped === 1 ? "" : "s"
                      } went past the photo limits (${MAX_PHOTOS_PER_FEATURE} per feature, ${MAX_PHOTOS_PER_LAYER} per layer) and ${
                        relinked.capped === 1 ? "was" : "were"
                      } left out.`,
                    );
                  }
                } catch {
                  notes.push(
                    "Photos in this archive couldn't be processed; the layer imported without them.",
                  );
                }
              }
              try {
                // Every layer from an archive keeps the whole archive as its
                // original, so removing any one layer leaves the others'
                // provenance intact. Duplication is bounded by the file cap.
                await (await store()).saveVectorLayer(record, collection, file);
                requestDurableStorage();
              } catch (saveError) {
                // Spec promise: a save failure never discards the import; the
                // layer lives in memory for this session.
                notes.push(
                  saveError instanceof UserMapImportError
                    ? saveError.userMessage
                    : "Couldn't save this layer — it stays available until you " +
                      "close the tab.",
                );
              }
              colorCursor += 1;
              setRecords((prev) => [...prev, record]);
              setGeometries((prev) => ({
                ...prev,
                [record.id]: collection,
              }));
              persistUiState((current) => ({
                ...current,
                [record.id]: { enabled: true },
              }));
              firstId ??= record.id;
            }
            if (pending.length > 1) {
              notes.unshift(`${pending.length} layers found in this archive.`);
            }
            // Layers from one archive usually share a problem (no .dbf beside
            // any of them, say), and repeating the identical sentence once
            // per layer reads as noise rather than as more information.
            const uniqueNotes = [...new Set(notes)];
            // Fit to the first layer only: walking the map through every
            // layer of an archive in turn would just be motion.
            if (firstId) {
              requestFit(firstId);
            }
            batch.push({
              fileName: file.name,
              ok: true,
              id: firstId ?? "",
              note: uniqueNotes.length > 0 ? uniqueNotes.join(" ") : undefined,
            });
          } catch (error) {
            const message =
              error instanceof UserMapImportError
                ? error.userMessage
                : "Something went wrong reading this file.";
            batch.push({ fileName: file.name, ok: false, message });
          }
        }
      } finally {
        // Wholesale replace even when `files` was empty: the shared drop-zone
        // router calls both pipelines every batch precisely so a new batch
        // clears the other pipeline's stale outcomes.
        setOutcomes(batch);
        setImporting(false);
        setImportingLabel(null);
      }
    },
    [persistUiState, photoStore, requestFit, store],
  );

  const removeLayer = useCallback(
    async (id: string) => {
      // A removed layer must not linger in the create-retry set.
      unsavedDrawnIdsRef.current.delete(id);
      try {
        await (await store()).deleteVectorLayer(id);
      } catch {
        // Deleting an unsaved (in-memory) or already-broken-store layer is
        // still a successful removal from the UI's point of view.
      }
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setGeometries((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setFitRequest((current) => (current?.layerId === id ? null : current));
      persistUiState((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    [persistUiState, store],
  );

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      persistUiState((current) => ({ ...current, [id]: { enabled } }));
    },
    [persistUiState],
  );

  const exportLayer = useCallback(
    async (id: string, format: VectorExportFormat) => {
      const record = recordsSnapshotRef.current.find((r) => r.id === id);
      const data = geometriesSnapshotRef.current[id];
      if (!record || !data) {
        // The layer was removed between render and click; nothing to write.
        return;
      }
      if (format === "kmz") {
        const bytesById = new Map<string, Uint8Array>();
        try {
          const photos = await photoStore();
          const ids = new Set<string>();
          for (const feature of data.features) {
            for (const descriptor of readPhotoDescriptors(feature.properties)) {
              ids.add(descriptor.id);
            }
          }
          for (const id of ids) {
            const blob = await photos.getFullBlob(id);
            if (blob) {
              bytesById.set(id, new Uint8Array(await blob.arrayBuffer()));
            }
          }
        } catch {
          // Store down: the KMZ still exports, with the honest count below.
        }
        const result = buildKmzBlob(record.name, data, bytesById);
        downloadRef.current(`${record.name}.kmz`, result.blob);
        if (result.photosMissing > 0) {
          // Distinct from success and never silent: a missing blob is a
          // state, not a normal outcome.
          setStorageError(
            `${result.photosMissing} photo${
              result.photosMissing === 1 ? "" : "s"
            } couldn't be read and ${
              result.photosMissing === 1 ? "was" : "were"
            } left out of the KMZ.`,
          );
        }
        return;
      }
      const blob =
        format === "kml"
          ? kmlExportBlob(record.name, data)
          : format === "gpx"
            ? gpxExportBlob(record.name, data)
            : geojsonExportBlob(data);
      downloadRef.current(`${record.name}.${format}`, blob);
    },
    [photoStore],
  );

  const exportRawRecording = useCallback(
    async (id: string) => {
      const record = recordsSnapshotRef.current.find((r) => r.id === id);
      if (!record) {
        // The layer was removed between render and click; nothing to write.
        return;
      }
      let blob: Blob | null = null;
      try {
        blob = await (await store()).getOriginalBlob(id);
      } catch {
        blob = null;
      }
      if (!blob) {
        // Distinct from "no such layer": the layer exists but its original
        // never made it into storage (a failed save, or another browser).
        setStorageError(
          "The raw recording for this layer isn't available in this browser's storage.",
        );
        return;
      }
      downloadRef.current(`${record.name} (raw).gpx`, blob);
    },
    [store],
  );

  /**
   * Drawn layers whose INITIAL save failed. The store's putVectorLayer is a
   * guarded update on purpose — an absent row means another tab deleted the
   * layer, and blindly upserting would resurrect it — but that guard also
   * made a never-saved drawing silently no-op on every later edit: the
   * drawing looked fine all session and vanished with the tab, with the
   * "reports persistence trouble" promise in createDrawnLayer never coming
   * true. Ids in this set take the CREATE path on their next write instead,
   * and leave the set only when that create succeeds.
   */
  const unsavedDrawnIdsRef = useRef(new Set<string>());

  const putVectorLayer = useCallback(
    async (record: UserVectorLayerRecord, collection: FeatureCollection) => {
      const opened = await store();
      let wrote = true;
      if (unsavedDrawnIdsRef.current.has(record.id)) {
        await opened.saveVectorLayer(record, collection);
        unsavedDrawnIdsRef.current.delete(record.id);
      } else {
        // False when another tab deleted the layer: the update finds no row
        // and deliberately writes nothing rather than resurrecting it.
        wrote = await opened.putVectorLayer(record, collection);
      }
      // Fire-and-forget: a failed orphan sweep is a small leak, never a
      // failed save.
      void opened.sweepLayerPhotos(record.id, collection).catch(() => {});
      return wrote;
    },
    [store],
  );

  const createEmptyDrawnLayer = useCallback(
    async (name: string): Promise<string> => {
      const now = new Date().toISOString();
      const existing = recordsSnapshotRef.current;
      const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
      const record: UserVectorLayerRecord = {
        id: generateId(),
        name,
        source: "drawn",
        origin: { kind: "drawn", createdAt: now },
        createdAt: now,
        revision: 0,
        style: { color: nextLayerColor(existing.length) },
        featureCount: 0,
        // No geometry yet, so no extent — the fit has nothing to aim at until
        // the user draws something.
        bbox: null,
      };
      try {
        await (await store()).saveVectorLayer(record, empty);
      } catch {
        // An unsaved drawing still works for this session. Marking it here is
        // what makes the promise below true: the next edit write retries the
        // CREATE, and its failure reaches the edit session's storage error.
        unsavedDrawnIdsRef.current.add(record.id);
      }
      setRecords((prev) => [...prev, record]);
      setGeometries((prev) => ({ ...prev, [record.id]: empty }));
      // The snapshot refs normally catch up in an effect after the next
      // render, but ensureFieldNotesLayer → appendFeatures chains within one
      // tick and must see the layer it just created.
      recordsSnapshotRef.current = [...recordsSnapshotRef.current, record];
      geometriesSnapshotRef.current = {
        ...geometriesSnapshotRef.current,
        [record.id]: empty,
      };
      persistUiState((current) => ({
        ...current,
        [record.id]: { enabled: true },
      }));
      return record.id;
    },
    [persistUiState, store],
  );

  const createDrawnLayer = useCallback(async (): Promise<string> => {
    const drawnCount = recordsSnapshotRef.current.filter(
      (r) => r.origin.kind === "drawn",
    ).length;
    return createEmptyDrawnLayer(
      drawnCount === 0 ? "My drawing" : `My drawing ${drawnCount + 1}`,
    );
  }, [createEmptyDrawnLayer]);

  const createRecordedLayer = useCallback(
    async (input: {
      name: string;
      collection: FeatureCollection;
      rawGpx: Blob;
      startedAt: string;
      endedAt: string;
      interrupted?: boolean;
    }): Promise<{ record: UserVectorLayerRecord; persisted: boolean }> => {
      const record: UserVectorLayerRecord = {
        id: generateId(),
        name: input.name,
        source: "recorded",
        // A recovered walk stays marked for the life of the record: the row
        // and the popup must not read as a walk the user chose to end.
        origin: input.interrupted
          ? {
              kind: "recorded",
              startedAt: input.startedAt,
              endedAt: input.endedAt,
              interrupted: true,
            }
          : {
              kind: "recorded",
              startedAt: input.startedAt,
              endedAt: input.endedAt,
            },
        createdAt: new Date().toISOString(),
        revision: 0,
        style: { color: nextLayerColor(recordsSnapshotRef.current.length) },
        ...summarize(input.collection),
      };
      let persisted = true;
      try {
        // The raw GPX rides the original-file slot, exactly like an import's
        // source file: the record says how the data came to be, the original
        // says exactly what the GPS delivered before filtering.
        await (await store()).saveVectorLayer(record, input.collection, input.rawGpx);
        requestDurableStorage();
      } catch (saveError) {
        // Same degrade contract as imports: a failed save never discards the
        // recording — the track stays on the map for this session. The caller
        // is told, so a track that will not survive the tab is not called
        // saved, and the unsaved recording it can be recovered from is kept.
        persisted = false;
        setStorageError(
          saveError instanceof UserMapImportError
            ? saveError.userMessage
            : "Couldn't save this track — it stays available until you close the tab.",
        );
      }
      setRecords((prev) => [...prev, record]);
      setGeometries((prev) => ({ ...prev, [record.id]: input.collection }));
      recordsSnapshotRef.current = [...recordsSnapshotRef.current, record];
      geometriesSnapshotRef.current = {
        ...geometriesSnapshotRef.current,
        [record.id]: input.collection,
      };
      persistUiState((current) => ({
        ...current,
        [record.id]: { enabled: true },
      }));
      return { record, persisted };
    },
    [persistUiState, store],
  );

  const ensureFieldNotesLayer = useCallback(async (): Promise<string> => {
    // Find-or-create by name, per the field-capture contract: created once,
    // reused after, recreated if the user deleted it.
    const existing = recordsSnapshotRef.current.find(
      (r) => r.origin.kind === "drawn" && r.name === FIELD_NOTES_LAYER_NAME,
    );
    if (existing) {
      return existing.id;
    }
    return createEmptyDrawnLayer(FIELD_NOTES_LAYER_NAME);
  }, [createEmptyDrawnLayer]);

  const appendFeatures = useCallback(
    async (
      layerId: string,
      features: Feature[],
    ): Promise<AppendOutcome | null> => {
      const record = recordsSnapshotRef.current.find((r) => r.id === layerId);
      const data = geometriesSnapshotRef.current[layerId];
      if (!record || !data || features.length === 0) {
        return null;
      }
      const collection: FeatureCollection = {
        type: "FeatureCollection",
        features: [...data.features, ...features],
      };
      const advanced: UserVectorLayerRecord = {
        ...record,
        ...summarize(collection),
        revision: record.revision + 1,
        // modifiedAt keeps the row honest: an imported layer that gained GPS
        // marks no longer matches its file, and the "· edited" suffix says so.
        modifiedAt: new Date().toISOString(),
      };
      setRecords((prev) =>
        prev.map((existing) => (existing.id === layerId ? advanced : existing)),
      );
      setGeometries((prev) => ({ ...prev, [layerId]: collection }));
      recordsSnapshotRef.current = recordsSnapshotRef.current.map((existing) =>
        existing.id === layerId ? advanced : existing,
      );
      geometriesSnapshotRef.current = {
        ...geometriesSnapshotRef.current,
        [layerId]: collection,
      };
      // A mark should be visible the moment it is saved, even if the layer
      // row was toggled off.
      persistUiState((current) => ({
        ...current,
        [layerId]: { enabled: true },
      }));
      let persisted = true;
      try {
        // False for a layer another tab deleted: nothing was written, and
        // the point lives only in this session.
        persisted = await putVectorLayer(advanced, collection);
      } catch {
        // Same degrade contract as imports: a failed save never discards the
        // feature — it stays on the map for this session. The caller is told,
        // so a point that will not survive the tab is not called saved.
        persisted = false;
        setStorageError(
          "Couldn't save this point — it stays available until you close the tab.",
        );
      }
      return { record: advanced, persisted };
    },
    [persistUiState, putVectorLayer],
  );

  const createPhotoLayer = useCallback(
    async (
      entries: BulkPhotoEntry[],
    ): Promise<{ id: string | null; notes: string[] }> => {
      if (entries.length === 0) {
        return { id: null, notes: [] };
      }
      const now = new Date().toISOString();
      const record: UserVectorLayerRecord = {
        id: generateId(),
        name: `Photos ${now.slice(0, 10)}`,
        source: "photos",
        origin: { kind: "photo-import", count: entries.length, importedAt: now },
        createdAt: now,
        revision: 0,
        style: { color: nextLayerColor(recordsSnapshotRef.current.length) },
        featureCount: 0,
        bbox: null,
      };
      const notes: string[] = [];
      const features: Feature[] = [];
      let photos: UserPhotoStore | null = null;
      try {
        photos = await photoStore();
      } catch {
        photos = null;
        notes.push(
          "Photo storage is unavailable; points were created without their photos.",
        );
      }
      for (const entry of entries) {
        const properties: Record<string, unknown> = {
          name: stripExtension(entry.file.name),
        };
        if (photos) {
          try {
            const processed = await processPhotoRef.current(entry.file);
            const photoRecord = {
              id: generateId(),
              layerId: record.id,
              addedAt: new Date().toISOString(),
              ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
              sourceName: entry.file.name,
              width: processed.width,
              height: processed.height,
              fullBytes: processed.full.size,
              thumbBytes: processed.thumb.size,
            };
            await photos.savePhoto(photoRecord, processed.full, processed.thumb);
            const descriptor: FeaturePhotoDescriptor = {
              id: photoRecord.id,
              ...(photoRecord.capturedAt
                ? { capturedAt: photoRecord.capturedAt }
                : {}),
              sourceName: entry.file.name,
              width: photoRecord.width,
              height: photoRecord.height,
            };
            properties[PHOTOS_PROPERTY] = [descriptor];
          } catch (error) {
            // The confirmed point still lands at its geotag; the note says
            // why it has no photo, distinctly per file.
            notes.push(
              `${entry.file.name}: ${
                error instanceof UserMapImportError
                  ? error.userMessage
                  : "the photo couldn't be processed — the point was created without it."
              }`,
            );
          }
        }
        features.push({
          type: "Feature",
          id: generateId(),
          geometry: {
            type: "Point",
            coordinates: [entry.gps.lon, entry.gps.lat],
          },
          properties,
        });
      }
      const collection: FeatureCollection = {
        type: "FeatureCollection",
        features,
      };
      const finalRecord: UserVectorLayerRecord = {
        ...record,
        ...summarize(collection),
      };
      try {
        await (await store()).saveVectorLayer(finalRecord, collection);
        requestDurableStorage();
      } catch (saveError) {
        notes.push(
          saveError instanceof UserMapImportError
            ? saveError.userMessage
            : "Couldn't save this layer — it stays available until you close the tab.",
        );
      }
      setRecords((prev) => [...prev, finalRecord]);
      setGeometries((prev) => ({ ...prev, [finalRecord.id]: collection }));
      recordsSnapshotRef.current = [...recordsSnapshotRef.current, finalRecord];
      geometriesSnapshotRef.current = {
        ...geometriesSnapshotRef.current,
        [finalRecord.id]: collection,
      };
      persistUiState((current) => ({
        ...current,
        [finalRecord.id]: { enabled: true },
      }));
      requestFit(finalRecord.id);
      return { id: finalRecord.id, notes };
    },
    [persistUiState, photoStore, requestFit, store],
  );

  /**
   * Takes an edit session's working copy back into the list. The session
   * owns the debounced write to IndexedDB, so this only mirrors state — a
   * second write here would double every save.
   */
  const applyLayerEdit = useCallback(
    (record: UserVectorLayerRecord, collection: FeatureCollection) => {
      setRecords((prev) =>
        prev.map((existing) => (existing.id === record.id ? record : existing)),
      );
      // A layer removed mid-edit is gone: the map above already ignores an id
      // it no longer holds, and geometry must not be written back under one
      // either. A collection keyed to a record that does not exist is a layer
      // nothing can draw, export or remove. The session seeds its draft from
      // this map, so a live edit always has its key here.
      setGeometries((prev) =>
        prev[record.id] ? { ...prev, [record.id]: collection } : prev,
      );
    },
    [],
  );

  const visibleLayers = useMemo<VisibleUserVectorLayer[]>(
    () =>
      records
        .filter((record) => uiState[record.id]?.enabled && geometries[record.id])
        .map((record) => ({ record, data: geometries[record.id] })),
    [geometries, records, uiState],
  );

  return {
    records,
    uiState,
    visibleLayers,
    fitRequest,
    importing,
    importingLabel,
    storageError,
    outcomes,
    importFiles,
    removeLayer,
    setEnabled,
    exportLayer,
    exportRawRecording,
    geometries,
    putVectorLayer,
    createDrawnLayer,
    ensureFieldNotesLayer,
    createRecordedLayer,
    appendFeatures,
    createPhotoLayer,
    applyLayerEdit,
  };
}
