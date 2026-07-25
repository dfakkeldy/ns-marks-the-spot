import { useCallback, useEffect, useRef, useState } from "react";
import { UserMapImportError } from "./errors";
import { parseGeoTiffAuto } from "./parsers/parseInWorker";
import type { ParsedGeoTiff } from "./parsers/geoTiffSource";
import { sniffFileType } from "./parsers/sniff";
import { UserMapStore } from "./store/userMapStore";
import type { UserMapRecord } from "./types";
import type { VisibleUserMap } from "./components/UserMapLayers";

export const DEFAULT_OPACITY = 0.7;
export const HARD_LIMIT_BYTES = 500 * 1024 * 1024;
export const LARGE_FILE_BYTES = 150 * 1024 * 1024;
const UI_STATE_KEY = "user-map-ui-state-v1";

const COMING_SOON_MESSAGE =
  "This file type arrives with the georeferencer in the next update. " +
  "GeoTIFF works today.";

export type ImportOutcome =
  | { fileName: string; ok: true; id: string; note?: string }
  | { fileName: string; ok: false; message: string };

export type UserMapUiState = Record<string, { enabled: boolean; opacity: number }>;

export type UserMapsApi = {
  records: UserMapRecord[];
  uiState: UserMapUiState;
  visibleMaps: VisibleUserMap[];
  importing: boolean;
  importingLabel: string | null;
  storageError: string | null;
  outcomes: ImportOutcome[];
  importFiles: (files: ArrayLike<File>) => Promise<void>;
  removeMap: (id: string) => Promise<void>;
  renameMap: (id: string, name: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => void;
  setOpacity: (id: string, opacity: number) => void;
};

function loadUiState(): UserMapUiState {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) ?? "{}") as UserMapUiState;
  } catch {
    return {};
  }
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Owns all user-map state so App.tsx stays a mounting point. The store opens
 * lazily; openStore and parse are injectable seams for tests (closure
 * injection per project convention — no protocols until a second impl
 * exists). Storage failures degrade to session-only maps rather than losing
 * the import.
 *
 * Record identity: `records` is only ever replaced wholesale via setRecords,
 * and each of the four call sites (initial merge, import, remove, rename)
 * reuses the existing object reference for every entry it isn't actually
 * changing — only a rename allocates a new object for the record it renames.
 * That is what keeps `visibleMaps[i].record` referentially stable across
 * renders triggered by unrelated state (another map's opacity, a new
 * outcome, importing/importingLabel toggling): those renders never call
 * setRecords at all, so the `records` array — and every object inside it —
 * is the exact same reference as the previous render. UserMapLayers' layer-
 * construction effect depends on that reference to avoid tearing down and
 * rebuilding the Leaflet layer (and re-decoding the bitmap) on every
 * unrelated re-render.
 */
export function useUserMaps(
  options: {
    openStore?: () => Promise<UserMapStore>;
    parse?: (buffer: ArrayBuffer) => Promise<ParsedGeoTiff>;
  } = {},
): UserMapsApi {
  const openStoreRef = useRef(options.openStore ?? (() => UserMapStore.open()));
  const parseRef = useRef(options.parse ?? parseGeoTiffAuto);
  const storeRef = useRef<Promise<UserMapStore> | null>(null);
  const previewUrlsRef = useRef<Record<string, string>>({});
  const [records, setRecords] = useState<UserMapRecord[]>([]);
  const [uiState, setUiState] = useState<UserMapUiState>(loadUiState);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importingLabel, setImportingLabel] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);

  const store = useCallback((): Promise<UserMapStore> => {
    storeRef.current ??= openStoreRef.current();
    return storeRef.current;
  }, []);

  const persistUiState = useCallback((next: UserMapUiState) => {
    setUiState(next);
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
  }, []);

  const registerPreviewUrl = useCallback((id: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    previewUrlsRef.current[id] = url;
    setPreviewUrls((prev) => ({ ...prev, [id]: url }));
  }, []);

  // Initial load of persisted maps; merge by id so a fast import that lands
  // before this list resolves is never overwritten (nor duplicated once the
  // slower list result arrives).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opened = await store();
        const loaded = await opened.listUserMaps();
        if (cancelled) {
          return;
        }
        setRecords((prev) => {
          const known = new Set(prev.map((r) => r.id));
          const merged = [...prev, ...loaded.filter((r) => !known.has(r.id))];
          return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        for (const record of loaded) {
          const blob = await opened.getPreviewBlob(record.id);
          if (!cancelled && blob) {
            registerPreviewUrl(record.id, blob);
          }
        }
      } catch {
        if (!cancelled) {
          setStorageError(
            "Saved maps are unavailable in this browser session. Imports " +
              "still work, but only until you close the tab.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [registerPreviewUrl, store]);

  // Revoke every preview URL when the owning component unmounts. `urls` is
  // captured once (deps: []) but aliases the SAME object previewUrlsRef
  // mutates in place (registerPreviewUrl/removeMap never reassign
  // previewUrlsRef.current, only add/delete its keys), so by the time this
  // cleanup runs it reflects every URL registered over the whole lifetime —
  // not just the ones present when the effect first ran. Reading
  // previewUrlsRef.current directly inside the returned cleanup (rather than
  // through this captured local) would trip exhaustive-deps: the linter
  // can't prove the ref access happens at cleanup-scheduling time rather
  // than at cleanup-run time, since it has no way to know the value is
  // mutated in place instead of reassigned.
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      for (const url of Object.values(urls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const importFiles = useCallback(
    async (files: ArrayLike<File>) => {
      setImporting(true);
      const batch: ImportOutcome[] = [];
      try {
        for (const file of Array.from(files)) {
          setImportingLabel(
            file.size > LARGE_FILE_BYTES
              ? `Reading large map "${file.name}" — this can take a minute…`
              : `Reading "${file.name}"…`,
          );
          try {
            if (file.size > HARD_LIMIT_BYTES) {
              throw new UserMapImportError(
                "too-large",
                "This file is over 500 MB. Export a smaller area or lower " +
                  "resolution and re-import.",
              );
            }
            const buffer = await file.arrayBuffer();
            const type = sniffFileType(
              new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength)),
            );
            if (type === "pdf" || type === "png" || type === "jpeg") {
              throw new UserMapImportError("unsupported-type", COMING_SOON_MESSAGE);
            }
            if (type !== "geotiff") {
              throw new UserMapImportError(
                "unsupported-type",
                "Not a recognized map file. GeoTIFF works today; PDF and " +
                  "plain scans arrive with the georeferencer.",
              );
            }
            // parse may transfer the buffer to a worker — this is the last
            // use of `buffer` on this thread.
            const parsed = await parseRef.current(buffer);
            const record: UserMapRecord = {
              id: crypto.randomUUID(),
              name: stripExtension(file.name),
              source: "geotiff",
              createdAt: new Date().toISOString(),
              pixelSize: parsed.pixelSize,
              georef: parsed.georef,
            };
            let note =
              file.size > LARGE_FILE_BYTES
                ? "Large file — displayed at reduced resolution."
                : undefined;
            try {
              await (await store()).saveUserMap(record, file, parsed.preview);
            } catch (saveError) {
              // Spec promise: a save failure never discards the import; the
              // map lives in memory for this session.
              note =
                saveError instanceof UserMapImportError
                  ? saveError.userMessage
                  : "Couldn't save this map — it stays available until you " +
                    "close the tab.";
            }
            setRecords((prev) => [...prev, record]);
            registerPreviewUrl(record.id, parsed.preview);
            persistUiState({
              ...loadUiState(),
              [record.id]: { enabled: true, opacity: DEFAULT_OPACITY },
            });
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
        setOutcomes(batch);
        setImporting(false);
        setImportingLabel(null);
      }
    },
    [persistUiState, registerPreviewUrl, store],
  );

  const removeMap = useCallback(
    async (id: string) => {
      try {
        await (await store()).deleteUserMap(id);
      } catch {
        // Deleting an unsaved (in-memory) or already-broken-store map is
        // still a successful removal from the UI's point of view.
      }
      setRecords((prev) => prev.filter((r) => r.id !== id));
      const url = previewUrlsRef.current[id];
      if (url) {
        URL.revokeObjectURL(url);
        delete previewUrlsRef.current[id];
      }
      setPreviewUrls((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const nextUi = { ...loadUiState() };
      delete nextUi[id];
      persistUiState(nextUi);
    },
    [persistUiState, store],
  );

  const renameMap = useCallback(
    async (id: string, name: string) => {
      try {
        await (await store()).renameUserMap(id, name);
      } catch {
        // In-memory-only map, or a broken store; rename still applies below.
      }
      setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    },
    [store],
  );

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const current = loadUiState();
      const existing = current[id];
      persistUiState({
        ...current,
        [id]: { opacity: existing?.opacity ?? DEFAULT_OPACITY, enabled },
      });
    },
    [persistUiState],
  );

  const setOpacity = useCallback(
    (id: string, opacity: number) => {
      const current = loadUiState();
      const existing = current[id];
      persistUiState({
        ...current,
        [id]: { enabled: existing?.enabled ?? true, opacity },
      });
    },
    [persistUiState],
  );

  const visibleMaps: VisibleUserMap[] = records
    .filter((r) => (uiState[r.id]?.enabled ?? false) && previewUrls[r.id])
    .map((r) => ({
      record: r,
      previewUrl: previewUrls[r.id],
      opacity: uiState[r.id]?.opacity ?? DEFAULT_OPACITY,
    }));

  return {
    records,
    uiState,
    visibleMaps,
    importing,
    importingLabel,
    storageError,
    outcomes,
    importFiles,
    removeMap,
    renameMap,
    setEnabled,
    setOpacity,
  };
}
