import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
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
import { nextLayerColor } from "./render/style";
import { UserVectorStore } from "./store/userVectorStore";
import type { UserVectorLayerRecord, UserVectorSource } from "./types";

export type VectorExportFormat = "geojson" | "kml";

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
  /** Geometry by layer id — the edit session seeds its working copy from this. */
  geometries: Record<string, FeatureCollection>;
  /** The store's guarded update, for the edit session's debounced writes. */
  putVectorLayer: (
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ) => Promise<void>;
  /** Creates an empty layer to draw into; returns its id. */
  createDrawnLayer: () => Promise<string>;
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
    storeRef.current ??= openStoreRef.current();
    return storeRef.current;
  }, []);

  const persistUiState = useCallback((next: UserVectorUiState) => {
    setUiState(next);
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
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
        format === "kml" ? kmlExportBlob(record.name, data) : geojsonExportBlob(data);
      downloadRef.current(`${record.name}.${format}`, blob);
    },
    [],
  );

  const putVectorLayer = useCallback(
    async (record: UserVectorLayerRecord, collection: FeatureCollection) => {
      await (await store()).putVectorLayer(record, collection);
    },
    [store],
  );

  const createDrawnLayer = useCallback(async (): Promise<string> => {
    const now = new Date().toISOString();
    const existing = recordsSnapshotRef.current;
    const drawnCount = existing.filter((r) => r.origin.kind === "drawn").length;
    const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
    const record: UserVectorLayerRecord = {
      id: generateId(),
      name: drawnCount === 0 ? "My drawing" : `My drawing ${drawnCount + 1}`,
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
      // An unsaved drawing still works for this session; the edit session
      // reports persistence trouble once the user actually draws.
    }
    setRecords((prev) => [...prev, record]);
    setGeometries((prev) => ({ ...prev, [record.id]: empty }));
    persistUiState({ ...loadUiState(), [record.id]: { enabled: true } });
    return record.id;
  }, [persistUiState, store]);

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
    geometries,
    putVectorLayer,
    createDrawnLayer,
    applyLayerEdit,
  };
}
