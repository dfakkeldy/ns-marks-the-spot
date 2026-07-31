import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { UserMapImportError } from "../errors";
import { generateId, stripExtension } from "../importUtils";
import { downloadFile } from "../../services/downloadFile";
import { parseGeoJsonAuto } from "./parsers/parseVectorInWorker";
import type { ParsedVector } from "./parsers/geojsonSource";
import { archiveHoldsKml, parseKmz } from "./parsers/kmzSource";
import { parseXmlVector, type ParsedXmlVector } from "./parsers/xmlVectorSource";
import { sniffVectorType } from "./parsers/sniffVector";
import { geojsonExportBlob } from "./export/exportGeoJson";
import { kmlExportBlob } from "./export/kmlWriter";
import { nextLayerColor } from "./render/style";
import { UserVectorStore } from "./store/userVectorStore";
import type { UserVectorLayerRecord, UserVectorSource } from "./types";

export type VectorExportFormat = "geojson" | "kml";

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
  const isKmzRef = useRef(archiveHoldsKml);
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
            let parsed: ParsedVector;
            let source: UserVectorSource;
            if (sniffed === "xml-candidate") {
              // DOMParser has no worker equivalent, so KML/GPX parse on the
              // main thread (same constraint as parsers/fletcherGcps.ts).
              const xml = parseXmlVectorRef.current(new TextDecoder().decode(buffer));
              parsed = xml;
              source = xml.source;
            } else if (sniffed === "zip") {
              if (!(await isKmzRef.current(buffer))) {
                throw new UserMapImportError(
                  "unsupported-type",
                  "Zipped shapefiles arrive in a later update — GeoJSON, KML, KMZ, and GPX work today.",
                );
              }
              parsed = await parseKmzRef.current(buffer);
              source = "kmz";
            } else if (sniffed === "geojson-candidate") {
              // parseGeoJsonAuto may transfer `buffer` to a worker, so this is
              // the last use of it on this thread.
              parsed = await parseRef.current(buffer);
              source = "geojson";
            } else {
              throw new UserMapImportError(
                "unsupported-type",
                "Not a recognized data file. GeoJSON, KML, KMZ, and GPX all work.",
              );
            }
            const now = new Date().toISOString();
            const record: UserVectorLayerRecord = {
              id: generateId(),
              name: stripExtension(file.name),
              source,
              origin: { kind: "imported", filename: file.name, importedAt: now },
              createdAt: now,
              revision: 0,
              style: { color: nextLayerColor(colorCursor) },
              featureCount: parsed.featureCount,
              bbox: parsed.bbox,
            };
            let note: string | undefined;
            try {
              await (await store()).saveVectorLayer(record, parsed.collection, file);
            } catch (saveError) {
              // Spec promise: a save failure never discards the import; the
              // layer lives in memory for this session.
              note =
                saveError instanceof UserMapImportError
                  ? saveError.userMessage
                  : "Couldn't save this layer — it stays available until you " +
                    "close the tab.";
            }
            colorCursor += 1;
            setRecords((prev) => [...prev, record]);
            setGeometries((prev) => ({ ...prev, [record.id]: parsed.collection }));
            persistUiState({ ...loadUiState(), [record.id]: { enabled: true } });
            requestFit(record.id);
            batch.push({ fileName: file.name, ok: true, id: record.id, note });
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
  };
}
