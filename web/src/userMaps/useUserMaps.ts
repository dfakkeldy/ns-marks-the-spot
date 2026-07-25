import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UserMapImportError } from "./errors";
import { parseGeoTiffAuto } from "./parsers/parseInWorker";
import type { ParsedGeoTiff } from "./parsers/geoTiffSource";
import { parseImage, type ParsedImage } from "./parsers/imageSource";
import { sniffFileType } from "./parsers/sniff";
import { UserMapStore } from "./store/userMapStore";
import { MIN_GCPS_FOR_AFFINE } from "./transform/affine";
import type { Gcp, GcpGeoref, UserMapRecord, UserMapSource } from "./types";
import type { VisibleUserMap } from "./components/UserMapLayers";

export const DEFAULT_OPACITY = 0.7;
export const HARD_LIMIT_BYTES = 500 * 1024 * 1024;
export const LARGE_FILE_BYTES = 150 * 1024 * 1024;
const UI_STATE_KEY = "user-map-ui-state-v1";

const PDF_MESSAGE =
  "PDF maps arrive in a later update. Convert with " +
  "`gdal_translate in.pdf out.tif`, or export the page as a PNG and " +
  "georeference that.";

const UNRECOGNIZED_MESSAGE =
  "Not a recognized map file. GeoTIFF, PNG, and JPEG all work.";

const EMPTY_GCP_GEOREF: GcpGeoref = { kind: "gcp", gcps: [], method: "affine" };

/**
 * A GCP map with fewer than three points has no solvable transform, so it
 * cannot be drawn anywhere yet. The layer row shows a Georeference button
 * instead of an opacity slider for exactly this set.
 */
export function needsGeoreferencing(record: UserMapRecord): boolean {
  return (
    record.georef.kind === "gcp" &&
    record.georef.gcps.length < MIN_GCPS_FOR_AFFINE
  );
}

export type ImportOutcome =
  | {
      fileName: string;
      ok: true;
      id: string;
      note?: string;
      /** Set when the import produced an empty GCP draft; App opens the panel. */
      needsGeoreferencing?: boolean;
    }
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
  setEnabled: (id: string, enabled: boolean) => void;
  setOpacity: (id: string, opacity: number) => void;
  georeferencingId: string | null;
  editingMap: VisibleUserMap | null;
  beginGeoreference: (id: string) => void;
  endGeoreference: () => void;
  saveGcps: (id: string, gcps: Gcp[]) => Promise<void>;
  needsGeoreferencing: (record: UserMapRecord) => boolean;
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
 * `crypto.randomUUID()` only exists in a secure context (HTTPS or
 * localhost). It's undefined on a plain `http://192.168.x.x:5173` dev
 * server — exactly how this app gets tested on a phone over the LAN — so
 * calling it unconditionally makes every import fail there, after a full
 * parse, with a generic error. `crypto.getRandomValues` has no such
 * restriction, so it's the fallback; ids only need to be unique within this
 * device's store, so RFC 4122 shape doesn't matter.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Owns all user-map state so App.tsx stays a mounting point. The store opens
 * lazily; openStore and parse are injectable seams for tests (closure
 * injection per project convention — no protocols until a second impl
 * exists). Storage failures degrade to session-only maps rather than losing
 * the import.
 *
 * Record identity: `records` is only ever replaced wholesale via setRecords,
 * and each of the three call sites (initial merge, import, remove) reuses
 * the existing object reference for every entry it isn't actually adding or
 * removing — nothing currently mutates an existing record in place. That is
 * what keeps `visibleMaps[i].record` referentially stable across renders
 * triggered by unrelated state (another map's opacity, a new outcome,
 * importing/importingLabel toggling): those renders never call setRecords at
 * all, so the `records` array — and every object inside it — is the exact
 * same reference as the previous render. UserMapLayers' layer-construction
 * effect depends on that reference to avoid tearing down and rebuilding the
 * Leaflet layer (and re-decoding the bitmap) on every unrelated re-render.
 */
export function useUserMaps(
  options: {
    openStore?: () => Promise<UserMapStore>;
    parse?: (buffer: ArrayBuffer) => Promise<ParsedGeoTiff>;
    parseImage?: (blob: Blob) => Promise<ParsedImage>;
  } = {},
): UserMapsApi {
  const openStoreRef = useRef(options.openStore ?? (() => UserMapStore.open()));
  const parseRef = useRef(options.parse ?? parseGeoTiffAuto);
  const parseImageRef = useRef(options.parseImage ?? parseImage);
  const storeRef = useRef<Promise<UserMapStore> | null>(null);
  const previewUrlsRef = useRef<Record<string, string>>({});
  const [records, setRecords] = useState<UserMapRecord[]>([]);
  const [uiState, setUiState] = useState<UserMapUiState>(loadUiState);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importingLabel, setImportingLabel] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const [georeferencingId, setGeoreferencingId] = useState<string | null>(null);

  // `saveGcps` has to build the updated record BEFORE handing it to
  // setRecords (see below), so it needs the current list without capturing it
  // in a closure — capturing it would either go stale or churn saveGcps's
  // identity on every import. Layout, not passive: saveGcps is called from a
  // debounce timer that can fire in the same frame as a record change.
  const recordsRef = useRef(records);
  useLayoutEffect(() => {
    recordsRef.current = records;
  }, [records]);

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
            if (type === "pdf") {
              throw new UserMapImportError("unsupported-type", PDF_MESSAGE);
            }
            if (type !== "geotiff" && type !== "png" && type !== "jpeg") {
              throw new UserMapImportError(
                "unsupported-type",
                UNRECOGNIZED_MESSAGE,
              );
            }
            const isImage = type === "png" || type === "jpeg";
            // parseGeoTiff may transfer `buffer` to a worker, so this is the
            // last use of it on this thread. parseImage reads the File
            // directly, which is why the two branches take different inputs.
            const parsed = isImage
              ? await parseImageRef.current(file)
              : await parseRef.current(buffer);
            const source: UserMapSource = isImage ? "image" : "geotiff";
            const embedded = isImage ? null : (parsed as ParsedGeoTiff).georef;
            const record: UserMapRecord = {
              id: generateId(),
              name: stripExtension(file.name),
              source,
              createdAt: new Date().toISOString(),
              pixelSize: parsed.pixelSize,
              // No embedded georeferencing means this is a scan: it starts
              // life as an empty GCP record and opens in the georeferencer.
              georef: embedded ?? EMPTY_GCP_GEOREF,
            };
            // Keyed on PIXELS, not bytes: a highly compressed large file
            // can decode at full resolution (no note earned), while a
            // less-compressed file well under LARGE_FILE_BYTES can still
            // get downsampled if its pixel dimensions exceed
            // PREVIEW_MAX_DIMENSION. previewSize is only ever smaller than
            // pixelSize when parseGeoTiff actually downsampled it.
            const wasDownsampled =
              parsed.previewSize.width < parsed.pixelSize.width ||
              parsed.previewSize.height < parsed.pixelSize.height;
            let note: string | undefined;
            if (wasDownsampled) {
              note = "Large file — displayed at reduced resolution.";
            } else if (file.size > LARGE_FILE_BYTES) {
              note = "Large file.";
            }
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
            batch.push({
              fileName: file.name,
              ok: true,
              id: record.id,
              note,
              needsGeoreferencing: needsGeoreferencing(record),
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
        setOutcomes(batch);
        // Spec: an imported scan opens the panel. Only the FIRST draft of a
        // batch — the panel edits one map at a time, and the rest keep their
        // "Needs georeferencing" rows in the layer list. Without this the
        // flag above is produced and never consumed.
        for (const outcome of batch) {
          if (outcome.ok && outcome.needsGeoreferencing) {
            setGeoreferencingId(outcome.id);
            break;
          }
        }
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
      // Clear georeferencing before persisting, since persistUiState's
      // localStorage.setItem can throw and would skip this cleanup.
      setGeoreferencingId((prev) => (prev === id ? null : prev));
      const nextUi = { ...loadUiState() };
      delete nextUi[id];
      persistUiState(nextUi);
    },
    [persistUiState, store],
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

  const beginGeoreference = useCallback((id: string) => {
    setGeoreferencingId(id);
  }, []);

  const endGeoreference = useCallback(() => {
    setGeoreferencingId(null);
  }, []);

  const saveGcps = useCallback(
    async (id: string, gcps: Gcp[]) => {
      // Built OUTSIDE the updater, deliberately. An earlier version assigned
      // `saved` inside the setRecords updater and read it on the next line;
      // React defers an updater whenever the owning fiber already has queued
      // work — which `App` always does — so `saved` was still null and the
      // IndexedDB write never ran. Measured: "captured after save (with a
      // prior queued update): null". The in-memory list still looked right,
      // which is why the original test caught nothing.
      const existing = recordsRef.current.find((record) => record.id === id);
      if (!existing) {
        return;
      }
      const saved: UserMapRecord = {
        ...existing,
        georef: { kind: "gcp", gcps, method: "affine" },
      };
      // The updater is now pure: it maps one entry to an already-built
      // object and returns every other entry BY REFERENCE, because
      // UserMapLayers keys its layer-construction effect on record identity
      // and rebuilding untouched records would re-decode their bitmaps.
      // Being pure also makes it safe under StrictMode's double invocation.
      setRecords((prev) =>
        prev.map((record) => (record.id === id ? saved : record)),
      );
      try {
        await (await store()).putUserMapRecord(saved);
      } catch {
        // Same contract as import: a storage failure keeps the map usable
        // for this session rather than discarding the user's points.
        setStorageError(
          "Couldn't save these points — they stay available until you close " +
            "the tab.",
        );
      }
    },
    [store],
  );

  const visibleMaps: VisibleUserMap[] = records
    .filter(
      (r) =>
        r.id !== georeferencingId &&
        (uiState[r.id]?.enabled ?? false) &&
        previewUrls[r.id] &&
        !needsGeoreferencing(r),
    )
    .map((r) => ({
      record: r,
      previewUrl: previewUrls[r.id],
      opacity: uiState[r.id]?.opacity ?? DEFAULT_OPACITY,
    }));

  const editingRecord = records.find((r) => r.id === georeferencingId) ?? null;
  const editingPreviewUrl = editingRecord
    ? previewUrls[editingRecord.id]
    : undefined;
  const editingOpacity = editingRecord
    ? (uiState[editingRecord.id]?.opacity ?? DEFAULT_OPACITY)
    : DEFAULT_OPACITY;
  // Memoized, unlike visibleMaps. App keys its georeference-binding memo on
  // this object, so a fresh literal per render would hand MapCanvas a new
  // `draft` on every unrelated state change and defeat the hot path Task 6
  // exists to protect. The three inputs are a stable record reference, a blob
  // URL string, and a number, so the memo actually holds.
  const editingMap: VisibleUserMap | null = useMemo(
    () =>
      editingRecord && editingPreviewUrl
        ? {
            record: editingRecord,
            previewUrl: editingPreviewUrl,
            opacity: editingOpacity,
          }
        : null,
    [editingRecord, editingPreviewUrl, editingOpacity],
  );

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
    setEnabled,
    setOpacity,
    georeferencingId,
    editingMap,
    beginGeoreference,
    endGeoreference,
    saveGcps,
    needsGeoreferencing,
  };
}
