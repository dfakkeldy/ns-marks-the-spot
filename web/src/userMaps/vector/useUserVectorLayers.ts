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
import { classifyArchive, parseKmz } from "./parsers/kmzSource";
import { parseShapefileAuto } from "./parsers/parseShapefileAuto";
import type { ParsedShapefileLayer } from "./parsers/shapefileZipSource";
import { parseXmlVector, type ParsedXmlVector } from "./parsers/xmlVectorSource";
import { sniffVectorType } from "./parsers/sniffVector";
import { geojsonExportBlob } from "./export/exportGeoJson";
import { kmlExportBlob } from "./export/kmlWriter";
import { gpxExportBlob } from "./export/gpxWriter";
import { nextLayerColor } from "./render/style";
import { UserVectorStore } from "./store/userVectorStore";
import type { UserVectorLayerRecord, UserVectorSource } from "./types";

export type VectorExportFormat = "geojson" | "kml" | "gpx";

/** One layer awaiting a record — a single file may produce several. */
type PendingLayer = {
  parsed: ParsedVector;
  name: string;
  source: UserVectorSource;
  note?: string;
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
  /** The store's guarded update, for the edit session's debounced writes. */
  putVectorLayer: (
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ) => Promise<void>;
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
  }) => Promise<UserVectorLayerRecord>;
  /**
   * Appends features to an existing layer outside an edit session, stamping
   * modifiedAt so the row's provenance shows the layer changed. Returns the
   * advanced record, or null when the layer no longer exists.
   */
  appendFeatures: (
    layerId: string,
    features: Feature[],
  ) => Promise<UserVectorLayerRecord | null>;
  /** Applies an edit session's result to the list and the store. */
  applyLayerEdit: (
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ) => void;
};

function loadUiState(): UserVectorUiState {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) ?? "{}") as UserVectorUiState;
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
    parseGeoJson?: (buffer: ArrayBuffer) => Promise<ParsedVector>;
    download?: (filename: string, blob: Blob) => void;
  } = {},
): UserVectorLayersApi {
  const openStoreRef = useRef(options.openStore ?? (() => UserVectorStore.open()));
  const parseRef = useRef(options.parseGeoJson ?? parseGeoJsonAuto);
  const parseXmlVectorRef = useRef<(text: string) => ParsedXmlVector>(parseXmlVector);
  const parseKmzRef = useRef(parseKmz);
  const classifyArchiveRef = useRef(classifyArchive);
  const parseShapefileRef =
    useRef<(buffer: ArrayBuffer) => Promise<ParsedShapefileLayer[]>>(parseShapefileAuto);
  const downloadRef = useRef(options.download ?? downloadFile);
  const storeRef = useRef<Promise<UserVectorStore> | null>(null);
  const [records, setRecords] = useState<UserVectorLayerRecord[]>([]);
  const [geometries, setGeometries] = useState<Record<string, FeatureCollection>>({});
  const [uiState, setUiState] = useState<UserVectorUiState>(loadUiState);
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

  const persistUiState = useCallback((next: UserVectorUiState) => {
    setUiState(next);
    try {
      localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
    } catch {
      // Quota or a blocked store: a failed convenience write must never
      // surface as a failed import or throw out of an enable toggle.
    }
  }, []);

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
                pending = [
                  {
                    parsed: await parseKmzRef.current(buffer),
                    name: stripExtension(file.name),
                    source: "kmz",
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
              try {
                // Every layer from an archive keeps the whole archive as its
                // original, so removing any one layer leaves the others'
                // provenance intact. Duplication is bounded by the file cap.
                await (await store()).saveVectorLayer(record, layer.parsed.collection, file);
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
                [record.id]: layer.parsed.collection,
              }));
              persistUiState({ ...loadUiState(), [record.id]: { enabled: true } });
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
    [persistUiState, requestFit, store],
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
      const nextUi = { ...loadUiState() };
      delete nextUi[id];
      persistUiState(nextUi);
    },
    [persistUiState, store],
  );

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      persistUiState({ ...loadUiState(), [id]: { enabled } });
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
      const blob =
        format === "kml"
          ? kmlExportBlob(record.name, data)
          : format === "gpx"
            ? gpxExportBlob(record.name, data)
            : geojsonExportBlob(data);
      downloadRef.current(`${record.name}.${format}`, blob);
    },
    [],
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
      if (unsavedDrawnIdsRef.current.has(record.id)) {
        await opened.saveVectorLayer(record, collection);
        unsavedDrawnIdsRef.current.delete(record.id);
        return;
      }
      await opened.putVectorLayer(record, collection);
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
      persistUiState({ ...loadUiState(), [record.id]: { enabled: true } });
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
    }): Promise<UserVectorLayerRecord> => {
      const record: UserVectorLayerRecord = {
        id: generateId(),
        name: input.name,
        source: "recorded",
        origin: {
          kind: "recorded",
          startedAt: input.startedAt,
          endedAt: input.endedAt,
        },
        createdAt: new Date().toISOString(),
        revision: 0,
        style: { color: nextLayerColor(recordsSnapshotRef.current.length) },
        ...summarize(input.collection),
      };
      try {
        // The raw GPX rides the original-file slot, exactly like an import's
        // source file: the record says how the data came to be, the original
        // says exactly what the GPS delivered before filtering.
        await (await store()).saveVectorLayer(record, input.collection, input.rawGpx);
        requestDurableStorage();
      } catch (saveError) {
        // Same degrade contract as imports: a failed save never discards the
        // recording — the track stays on the map for this session.
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
      persistUiState({ ...loadUiState(), [record.id]: { enabled: true } });
      return record;
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
    ): Promise<UserVectorLayerRecord | null> => {
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
      persistUiState({ ...loadUiState(), [layerId]: { enabled: true } });
      try {
        await putVectorLayer(advanced, collection);
      } catch {
        // Same degrade contract as imports: a failed save never discards the
        // feature — it stays on the map for this session.
        setStorageError(
          "Couldn't save this point — it stays available until you close the tab.",
        );
      }
      return advanced;
    },
    [persistUiState, putVectorLayer],
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
      setGeometries((prev) => ({ ...prev, [record.id]: collection }));
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
    applyLayerEdit,
  };
}
