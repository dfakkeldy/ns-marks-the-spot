import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UserMapImportError } from "./errors";
import { requestDurableStorage } from "../services/durableStorage";
import { generateId, stripExtension } from "./importUtils";
import { parseGeoTiffAuto } from "./parsers/parseInWorker";
import type { ParsedGeoTiff } from "./parsers/geoTiffSource";
import type { ParsedGeoPdf } from "./parsers/geoPdfSource";
import { parseImage, type ParsedImage } from "./parsers/imageSource";
import { sniffFileType } from "./parsers/sniff";
import { UserMapStore } from "./store/userMapStore";
import { solveAffineFromGcps } from "./transform/affine";
import { solveTps } from "./transform/tps";
import type {
  Gcp,
  GcpGeoref,
  GeoreferenceMethod,
  PdfManualReason,
  UserMapRecord,
  UserMapSource,
} from "./types";
import type {
  UserMapFitRequest,
  VisibleUserMap,
} from "./components/UserMapLayers";

export const DEFAULT_OPACITY = 0.7;
export const HARD_LIMIT_BYTES = 500 * 1024 * 1024;
export const LARGE_FILE_BYTES = 150 * 1024 * 1024;
const UI_STATE_KEY = "user-map-ui-state-v1";

const UNRECOGNIZED_MESSAGE =
  "Not a recognized file. GeoTIFF, PDF, PNG, JPEG, GeoJSON, KML, KMZ, GPX, and " +
  "zipped shapefiles all work.";

const EMPTY_GCP_GEOREF: GcpGeoref = { kind: "gcp", gcps: [], method: "affine" };

/**
 * True when a GCP map cannot be PLACED — i.e. the record's OWN solver refuses
 * its points, so `meshForRecord` returns null and nothing can be drawn. The
 * layer row shows a Georeference button instead of an opacity slider for
 * exactly this set, and `visibleMaps` excludes it.
 *
 * It must ask the same solver `meshForRecord` will, which is why the method is
 * branched on here. The two solvers do not refuse the same things, and the
 * relationship is one-directional: `solveTps` refuses a strict SUPERSET,
 * because its destination gate is literally a `solveAffine` call while it
 * additionally rejects coincident control points and a singular interpolation
 * matrix. So an affine-only predicate never wrongly badges a TPS record — it
 * wrongly CLEARS one: a scan with two points double-clicked onto the same
 * pixel solves fine as least squares, gets an enabled checkbox and a slider,
 * enters `visibleMaps`, and then draws nothing at all.
 *
 * Deliberately the solve, not `gcps.length < MIN_GCPS_FOR_AFFINE`. The count
 * is only ONE of the solver's refusals: it also rejects a collapsed centroid,
 * a point cloud thinner than MIN_CONDITION_RATIO (points clicked along a
 * scan's top neatline — the layout users actually produce), a non-finite
 * coefficient, and a transform squashed past MIN_ANISOTROPY_RATIO (three map
 * clicks down a meridian). A count-only predicate calls those records placed:
 * enabled checkbox, opacity slider, no "Needs georeferencing" badge, admitted
 * to `visibleMaps` — and then UserMapLayers finds no mesh and draws nothing,
 * with no message anywhere. A checkbox that turns on a layer which then draws
 * nothing is a lie.
 *
 * Cheap: this runs over 3–6 points, and the sub-three case still short-circuits
 * inside `solveAffine`'s own count check.
 */
export function needsGeoreferencing(record: UserMapRecord): boolean {
  if (needsFrameSelection(record)) {
    return false;
  }
  if (record.georef.kind !== "gcp") {
    return false;
  }
  if (record.georef.method === "tps") {
    return !solveTps(record.georef.gcps).ok;
  }
  return solveAffineFromGcps(record.georef.gcps) === null;
}

export function needsFrameSelection(record: UserMapRecord): boolean {
  return (
    record.source === "geopdf" &&
    record.pdf?.registration.status === "selection-required"
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
      needsFrameSelection?: boolean;
    }
  | { fileName: string; ok: false; message: string };

export type UserMapUiState = Record<string, { enabled: boolean; opacity: number }>;

export type UserMapsApi = {
  records: UserMapRecord[];
  uiState: UserMapUiState;
  visibleMaps: VisibleUserMap[];
  fitRequest: UserMapFitRequest | null;
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
  frameChoosingId: string | null;
  frameChoosingMap: VisibleUserMap | null;
  beginGeoreference: (id: string) => void;
  endGeoreference: () => void;
  beginFrameSelection: (id: string) => void;
  endFrameSelection: () => void;
  selectPdfFrame: (
    id: string,
    candidateId: string,
    options?: { replaceAdjustedPoints?: boolean },
  ) => Promise<void>;
  saveGcps: (id: string, gcps: Gcp[]) => Promise<void>;
  /**
   * The other half of `saveGcps`: that one saves POINTS and preserves whatever
   * method the record already had, this one saves the METHOD and preserves the
   * points. Two setters rather than one, because the two are written by
   * completely different clocks — points arrive from a 400 ms debounce on every
   * pointer move of a drag, the method from a single deliberate click — and a
   * combined setter would make the drag path re-send a method it never changed.
   */
  setGeorefMethod: (id: string, method: GeoreferenceMethod) => Promise<void>;
  needsGeoreferencing: (record: UserMapRecord) => boolean;
  needsFrameSelection: (record: UserMapRecord) => boolean;
};

const manualReasonNote: Record<PdfManualReason, string> = {
  absent: "No supported geospatial registration was found.",
  unsupported: "This GeoPDF registration variant is not supported.",
  "unsupported-crs":
    "This GeoPDF registration uses an unsupported coordinate system.",
  invalid: "The embedded positioning could not be validated.",
  unreadable: "The embedded positioning could not be read.",
};

function pdfOutcomeNote(parsed: ParsedGeoPdf): string {
  const pageNote =
    parsed.pageCount > 1
      ? `Page 1 of ${parsed.pageCount} imported; later pages were not imported.`
      : "Page 1 imported.";
  if (parsed.registration.status === "automatic") {
    return `${pageNote} Placed from embedded GeoPDF coordinates.`;
  }
  if (parsed.registration.status === "selection-required") {
    return (
      `${pageNote} Choose the main map or an inset; its embedded ` +
      "coordinates will place it."
    );
  }
  return (
    `${pageNote} ${manualReasonNote[parsed.registration.reason]} ` +
    "Add matching points to place it."
  );
}

function sameGcps(left: Gcp[], right: Gcp[]): boolean {
  return (
    left.length === right.length &&
    left.every((gcp, index) => {
      const other = right[index];
      return (
        gcp.id === other.id &&
        gcp.pixel.x === other.pixel.x &&
        gcp.pixel.y === other.pixel.y &&
        gcp.map.lat === other.map.lat &&
        gcp.map.lng === other.map.lng
      );
    })
  );
}

function loadUiState(): UserMapUiState {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) ?? "{}") as UserMapUiState;
  } catch {
    return {};
  }
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
    parsePdf?: (buffer: ArrayBuffer) => Promise<ParsedGeoPdf>;
  } = {},
): UserMapsApi {
  const openStoreRef = useRef(options.openStore ?? (() => UserMapStore.open()));
  const parseRef = useRef(options.parse ?? parseGeoTiffAuto);
  const parseImageRef = useRef(options.parseImage ?? parseImage);
  const parsePdfRef = useRef(
    options.parsePdf ??
      (async (buffer: ArrayBuffer) => {
        const { parseGeoPdfAuto } = await import(
          "./parsers/parseGeoPdfAuto"
        );
        return parseGeoPdfAuto(buffer);
      }),
  );
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
  const [frameChoosingId, setFrameChoosingId] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState<UserMapFitRequest | null>(null);
  const fitRevisionRef = useRef(0);

  const requestFit = useCallback((mapId: string) => {
    fitRevisionRef.current += 1;
    setFitRequest({ mapId, revision: fitRevisionRef.current });
  }, []);

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
    if (!storeRef.current) {
      const opening = openStoreRef.current();
      // A rejected open must not be cached: one transient IndexedDB failure
      // (private-mode restriction lifting, a blocked upgrade resolving)
      // otherwise disabled persistence for the whole session.
      opening.catch(() => {
        if (storeRef.current === opening) {
          storeRef.current = null;
        }
      });
      storeRef.current = opening;
    }
    return storeRef.current;
  }, []);

  const persistUiState = useCallback((next: UserMapUiState) => {
    setUiState(next);
    try {
      localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
    } catch {
      // Quota or a blocked store: the in-memory state above is already
      // correct, and a failed convenience write must never surface as a
      // failed import or removal.
    }
  }, []);

  const registerPreviewUrl = useCallback((id: string, blob: Blob) => {
    const previous = previewUrlsRef.current[id];
    if (previous) {
      // Re-registering (a re-import, a preview refresh) leaked the old URL,
      // pinning its Blob for the life of the tab.
      URL.revokeObjectURL(previous);
    }
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
            if (
              type !== "pdf" &&
              type !== "geotiff" &&
              type !== "png" &&
              type !== "jpeg"
            ) {
              throw new UserMapImportError(
                "unsupported-type",
                UNRECOGNIZED_MESSAGE,
              );
            }
            let record: UserMapRecord;
            let preview: Blob;
            let note: string | undefined;
            if (type === "pdf") {
              const parsed = await parsePdfRef.current(buffer);
              preview = parsed.preview;
              const base = {
                id: generateId(),
                name: stripExtension(file.name),
                source: "geopdf" as const,
                createdAt: new Date().toISOString(),
                pixelSize: parsed.pixelSize,
              };
              if (parsed.registration.status === "automatic") {
                const selected = parsed.registration.selected;
                record = {
                  ...base,
                  sourceRect: selected.sourceRect,
                  georef: {
                    kind: "gcp",
                    method: "affine",
                    gcps: selected.gcps,
                  },
                  pdf: {
                    pageNumber: 1,
                    pageCount: parsed.pageCount,
                    registration: {
                      status: "embedded",
                      flavor: selected.flavor,
                      selection: parsed.registration.selection,
                      selectedFrameId: selected.id,
                      selectedLabel: selected.embeddedLabel,
                      candidates: parsed.registration.candidates,
                      adjusted: false,
                    },
                  },
                };
              } else if (
                parsed.registration.status === "selection-required"
              ) {
                record = {
                  ...base,
                  georef: EMPTY_GCP_GEOREF,
                  pdf: {
                    pageNumber: 1,
                    pageCount: parsed.pageCount,
                    registration: {
                      status: "selection-required",
                      candidates: parsed.registration.candidates,
                    },
                  },
                };
              } else {
                record = {
                  ...base,
                  georef: EMPTY_GCP_GEOREF,
                  pdf: {
                    pageNumber: 1,
                    pageCount: parsed.pageCount,
                    registration: {
                      status: "manual",
                      reason: parsed.registration.reason,
                      adjusted: false,
                    },
                  },
                };
              }
              note = pdfOutcomeNote(parsed);
            } else {
              const isImage = type === "png" || type === "jpeg";
              // parseGeoTiff may transfer `buffer` to a worker, so this is the
              // last use of it on this thread. parseImage reads the File
              // directly, which is why the two branches take different inputs.
              const parsed = isImage
                ? await parseImageRef.current(file)
                : await parseRef.current(buffer);
              preview = parsed.preview;
              const source: UserMapSource = isImage ? "image" : "geotiff";
              const embedded =
                isImage ? null : (parsed as ParsedGeoTiff).georef;
              record = {
                id: generateId(),
                name: stripExtension(file.name),
                source,
                createdAt: new Date().toISOString(),
                pixelSize: parsed.pixelSize,
                georef: embedded ?? EMPTY_GCP_GEOREF,
              };
              const wasDownsampled =
                parsed.previewSize.width < parsed.pixelSize.width ||
                parsed.previewSize.height < parsed.pixelSize.height;
              if (wasDownsampled) {
                note = "Large file — displayed at reduced resolution.";
              } else if (file.size > LARGE_FILE_BYTES) {
                note = "Large file.";
              }
            }
            try {
              await (await store()).saveUserMap(record, file, preview);
              // The user now has data worth keeping across Safari's
              // seven-day storage eviction.
              requestDurableStorage();
            } catch (saveError) {
              // Spec promise: a save failure never discards the import; the
              // map lives in memory for this session.
              const storageNote =
                saveError instanceof UserMapImportError
                  ? saveError.userMessage
                  : "Couldn't save this map — it stays available until you " +
                    "close the tab.";
              note = note ? `${note} ${storageNote}` : storageNote;
            }
            setRecords((prev) => [...prev, record]);
            registerPreviewUrl(record.id, preview);
            persistUiState({
              ...loadUiState(),
              [record.id]: { enabled: true, opacity: DEFAULT_OPACITY },
            });
            if (
              record.source === "geopdf" &&
              record.pdf?.registration.status === "embedded"
            ) {
              requestFit(record.id);
            }
            batch.push({
              fileName: file.name,
              ok: true,
              id: record.id,
              note,
              needsGeoreferencing: needsGeoreferencing(record),
              needsFrameSelection: needsFrameSelection(record),
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
        const chooserOutcome = batch.find(
          (outcome) => outcome.ok && outcome.needsFrameSelection,
        );
        if (chooserOutcome?.ok) {
          setGeoreferencingId(null);
          setFrameChoosingId(chooserOutcome.id);
        } else {
          const manualOutcome = batch.find(
            (outcome) => outcome.ok && outcome.needsGeoreferencing,
          );
          if (manualOutcome?.ok) {
            setFrameChoosingId(null);
            setGeoreferencingId(manualOutcome.id);
          }
        }
        setImporting(false);
        setImportingLabel(null);
      }
    },
    [persistUiState, registerPreviewUrl, requestFit, store],
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
      setFrameChoosingId((prev) => (prev === id ? null : prev));
      setFitRequest((current) =>
        current?.mapId === id ? null : current,
      );
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
    setFrameChoosingId(null);
    setGeoreferencingId(id);
  }, []);

  const endGeoreference = useCallback(() => {
    setGeoreferencingId(null);
  }, []);

  const beginFrameSelection = useCallback((id: string) => {
    setGeoreferencingId(null);
    setFrameChoosingId(id);
  }, []);

  const endFrameSelection = useCallback(() => {
    setFrameChoosingId(null);
  }, []);

  const selectPdfFrame = useCallback(
    async (
      id: string,
      candidateId: string,
      selectionOptions?: { replaceAdjustedPoints?: boolean },
    ) => {
      const existing = recordsRef.current.find((record) => record.id === id);
      const registration = existing?.pdf?.registration;
      if (
        !existing ||
        !existing.pdf ||
        !registration ||
        registration.status === "manual"
      ) {
        throw new Error("GeoPDF frame selection is not available");
      }
      const candidate = registration.candidates.find(
        (item) => item.id === candidateId,
      );
      if (!candidate) {
        throw new Error("Selected GeoPDF frame is no longer available");
      }
      if (
        registration.status === "embedded" &&
        registration.adjusted &&
        !selectionOptions?.replaceAdjustedPoints
      ) {
        throw new Error("Replacing adjusted points requires confirmation");
      }
      const saved: UserMapRecord = {
        ...existing,
        sourceRect: candidate.sourceRect,
        georef: {
          kind: "gcp",
          method: "affine",
          gcps: candidate.gcps,
        },
        pdf: {
          ...existing.pdf,
          registration: {
            status: "embedded",
            flavor: candidate.flavor,
            selection: { kind: "user" },
            selectedFrameId: candidate.id,
            selectedLabel: candidate.embeddedLabel,
            candidates: registration.candidates,
            adjusted: false,
          },
        },
      };
      setRecords((prev) =>
        prev.map((record) => (record.id === id ? saved : record)),
      );
      setFrameChoosingId((current) => (current === id ? null : current));
      requestFit(id);
      try {
        await (await store()).putUserMapRecord(saved);
      } catch {
        setStorageError(
          "Couldn't save this frame choice — it stays available until you " +
            "close the tab.",
        );
      }
    },
    [requestFit, store],
  );

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
      // Preserve the EXISTING record's method rather than a literal. This
      // fires from the debounced write on every drag, and the session itself
      // doesn't own the method (that's a later task's UI toggle) — so a
      // literal here would silently flip a tps record back to affine on the
      // next pointer move after switching. Guarded, not assumed: `existing`
      // could in principle be an EmbeddedGeoref record (kind !== "gcp"),
      // which has no `method` to preserve, so that case falls back to the
      // same "affine" default EMPTY_GCP_GEOREF uses.
      const method =
        existing.georef.kind === "gcp" ? existing.georef.method : "affine";
      const pointsChanged =
        existing.georef.kind !== "gcp" ||
        !sameGcps(existing.georef.gcps, gcps);
      const registration = existing.pdf?.registration;
      const pdf =
        existing.pdf &&
        registration &&
        registration.status !== "selection-required" &&
        pointsChanged
          ? {
              ...existing.pdf,
              registration: { ...registration, adjusted: true },
            }
          : existing.pdf;
      const saved: UserMapRecord = {
        ...existing,
        georef: { kind: "gcp", gcps, method },
        pdf,
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
        // Writing to a record another tab has deleted is a silent no-op, not
        // a throw — deliberately. `storageError` means "this browser can't
        // save your work"; a map the user themselves deleted in another tab
        // isn't a storage fault, and surfacing it here would tell them their
        // points were lost when the points' map is what's gone. Residual gap,
        // NOT fixed here because closing it needs new user-facing copy (the
        // maintainer's call) or a cross-tab invalidation channel: this tab
        // keeps `saved` in `records`, so it goes on showing a map that no
        // longer exists in storage until the page reloads.
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

  const setGeorefMethod = useCallback(
    async (id: string, method: GeoreferenceMethod) => {
      // Same shape as `saveGcps`, and for the same measured reason: the record
      // is built OUT HERE and handed to the updater already finished. React
      // defers an updater whenever the owning fiber has queued work — which
      // `App` always does — so anything computed inside one is not available
      // on the next line, and the IndexedDB write below would silently never
      // run while the in-memory list looked perfect.
      const existing = recordsRef.current.find((record) => record.id === id);
      // A GeoTIFF that carries its own georeferencing has no GCPs and no
      // method to choose between; the panel never offers the toggle for one
      // (its gate is a GCP count), and writing a `method` onto that georef
      // would corrupt the stored shape rather than extend it.
      if (!existing || existing.georef.kind !== "gcp") {
        return;
      }
      if (existing.georef.method === method) {
        // Record identity is load-bearing — UserMapLayers keys its
        // layer-construction effect on the record OBJECT, and rebuilding one
        // re-decodes its bitmap. A no-op click must therefore stay a no-op all
        // the way down, not mint an equal-but-fresh record.
        return;
      }
      const saved: UserMapRecord = {
        ...existing,
        // Spread, not a rebuilt literal: the points are the record's other
        // half and belong to `saveGcps`. Reconstructing `georef` here is how a
        // method switch would quietly drop them.
        georef: { ...existing.georef, method },
      };
      setRecords((prev) =>
        prev.map((record) => (record.id === id ? saved : record)),
      );
      try {
        await (await store()).putUserMapRecord(saved);
      } catch {
        // Same contract as `saveGcps` and as import: a storage failure keeps
        // the user's choice working for this session rather than snapping the
        // control they just moved back to where it was.
        setStorageError(
          "Couldn't save this warp setting — it stays available until you " +
            "close the tab.",
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
        !needsGeoreferencing(r) &&
        !needsFrameSelection(r),
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

  const frameChoosingRecord =
    records.find((record) => record.id === frameChoosingId) ?? null;
  const frameChoosingPreviewUrl = frameChoosingRecord
    ? previewUrls[frameChoosingRecord.id]
    : undefined;
  const frameChoosingOpacity = frameChoosingRecord
    ? (uiState[frameChoosingRecord.id]?.opacity ?? DEFAULT_OPACITY)
    : DEFAULT_OPACITY;
  const frameChoosingMap: VisibleUserMap | null = useMemo(
    () =>
      frameChoosingRecord && frameChoosingPreviewUrl
        ? {
            record: frameChoosingRecord,
            previewUrl: frameChoosingPreviewUrl,
            opacity: frameChoosingOpacity,
          }
        : null,
    [
      frameChoosingOpacity,
      frameChoosingPreviewUrl,
      frameChoosingRecord,
    ],
  );

  return {
    records,
    uiState,
    visibleMaps,
    fitRequest,
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
    frameChoosingId,
    frameChoosingMap,
    beginGeoreference,
    endGeoreference,
    beginFrameSelection,
    endFrameSelection,
    selectPdfFrame,
    saveGcps,
    setGeorefMethod,
    needsGeoreferencing,
    needsFrameSelection,
  };
}
