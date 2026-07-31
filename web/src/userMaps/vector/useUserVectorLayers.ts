import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { UserMapImportError } from "../errors";
import { generateId, stripExtension } from "../importUtils";
import { parseGeoJsonAuto } from "./parsers/parseVectorInWorker";
import type { ParsedVector } from "./parsers/geojsonSource";
import { sniffVectorType } from "./parsers/sniffVector";
import { nextLayerColor } from "./render/style";
import { UserVectorStore } from "./store/userVectorStore";
import type { UserVectorLayerRecord } from "./types";

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
  } = {},
): UserVectorLayersApi {
  const openStoreRef = useRef(options.openStore ?? (() => UserVectorStore.open()));
  const parseRef = useRef(options.parseGeoJson ?? parseGeoJsonAuto);
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
            if (sniffed === "xml-candidate") {
              throw new UserMapImportError(
                "unsupported-type",
                "KML and GPX files arrive in a later update — GeoJSON works today.",
              );
            }
            if (sniffed === "zip") {
              throw new UserMapImportError(
                "unsupported-type",
                "KMZ and zipped shapefiles arrive in a later update — GeoJSON works today.",
              );
            }
            if (sniffed !== "geojson-candidate") {
              throw new UserMapImportError(
                "unsupported-type",
                "Not a recognized data file. GeoJSON works today.",
              );
            }
            // parseGeoJsonAuto may transfer `buffer` to a worker, so this is
            // the last use of it on this thread.
            const parsed = await parseRef.current(buffer);
            const now = new Date().toISOString();
            const record: UserVectorLayerRecord = {
              id: generateId(),
              name: stripExtension(file.name),
              source: "geojson",
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
  };
}
