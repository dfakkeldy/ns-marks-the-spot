import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withoutMovedCaptureProvenance } from "./captureProvenance";
import type { Feature, FeatureCollection } from "geojson";
import { UserMapImportError } from "../../errors";
import {
  buildPathFromPoints,
  type ConvertShape,
} from "../convert/pointsToPath";
import {
  PHOTOS_PROPERTY,
  type FeaturePhotoDescriptor,
} from "../photos/types";
import { summarize } from "../summarize";
import type { UserVectorLayerRecord } from "../types";
import type { VisibleUserVectorLayer } from "../useUserVectorLayers";

/** Matches the georeferencer's marker-drag debounce, for the same reason. */
export const PERSIST_DELAY_MS = 400;

export type FeatureDetails = { name?: string; description?: string };

export type VectorEditSession = {
  editingId: string | null;
  editingLayer: VisibleUserVectorLayer | null;
  storageError: string | null;
  beginEdit: (id: string) => void;
  endEdit: () => void;
  commitGeometry: (collection: FeatureCollection) => void;
  updateFeatureDetails: (featureId: string, details: FeatureDetails) => void;
  /** Freeform attribute writes: string values set, undefined deletes. */
  updateFeatureProperties: (
    featureId: string,
    patch: Record<string, string | undefined>,
  ) => void;
  deleteFeature: (featureId: string) => void;
  renameLayer: (name: string) => void;
  /** Rewrites a feature's photo descriptors; an empty list removes the key. */
  setFeaturePhotos: (
    featureId: string,
    descriptors: FeaturePhotoDescriptor[],
  ) => void;
  /**
   * Moves a Point feature to an exact position — the "use photo's location"
   * offer. Geometry is otherwise Geoman-owned; this is the one deliberate
   * exception, reconciled into the live layer by the edit bridge.
   */
  moveFeaturePoint: (featureId: string, position: [number, number]) => void;
  /**
   * Converts the layer's points into a line or area per the field-capture
   * contract; returns the new feature's id, or null when there is too
   * little to convert.
   */
  convertPoints: (input: {
    shape: ConvertShape;
    keepSourcePoints: boolean;
  }) => string | null;
  /** Present while the last commit was a conversion; the one-shot undo. */
  lastConversion: { label: string } | null;
  undoConversion: () => void;
};

type Options = {
  records: UserVectorLayerRecord[];
  geometries: Record<string, FeatureCollection>;
  putVectorLayer: (
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ) => Promise<boolean | void>;
  onLayerChanged: (
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ) => void;
  persistDelay?: number;
};

/**
 * Owns one open editing session, kept separate from `useUserVectorLayers` so
 * the import/list API stays narrow — every member added there costs a stub in
 * the row tests, and editing is a mode the rest of the app does not need to
 * know about.
 *
 * The session holds its own working copy of the record and geometry. The
 * layer under edit is rendered by the imperative Geoman bridge instead of the
 * read-only list (which excludes it), so the two never draw the same features
 * twice.
 */
export function useVectorEditSession({
  records,
  geometries,
  putVectorLayer,
  onLayerChanged,
  persistDelay = PERSIST_DELAY_MS,
}: Options): VectorEditSession {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRecord, setDraftRecord] = useState<UserVectorLayerRecord | null>(null);
  const [draftData, setDraftData] = useState<FeatureCollection | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const dirtyRef = useRef<{
    record: UserVectorLayerRecord;
    collection: FeatureCollection;
  } | null>(null);
  const putRef = useRef(putVectorLayer);
  const changedRef = useRef(onLayerChanged);
  useEffect(() => {
    putRef.current = putVectorLayer;
    changedRef.current = onLayerChanged;
  }, [onLayerChanged, putVectorLayer]);

  const writeDirty = useCallback(async () => {
    const pending = dirtyRef.current;
    if (!pending) {
      return;
    }
    dirtyRef.current = null;
    try {
      await putRef.current(pending.record, pending.collection);
    } catch (error) {
      // A failed write must never interrupt drawing: the edit stays on screen
      // and in memory, and the user is told persistence is the problem.
      setStorageError(
        error instanceof UserMapImportError
          ? error.userMessage
          : "Couldn't save this edit — it stays available until you close the tab.",
      );
    }
  }, []);

  const schedulePersist = useCallback(
    (record: UserVectorLayerRecord, collection: FeatureCollection) => {
      dirtyRef.current = { record, collection };
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      // Drawing changes state on every pointer move; committing each one
      // would put an IndexedDB transaction on the main thread dozens of
      // times a second.
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void writeDirty();
      }, persistDelay);
    },
    [persistDelay, writeDirty],
  );

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void writeDirty();
  }, [writeDirty]);

  // Losing the tail of a session — closing the panel, or unmounting — is the
  // one moment the debounce would read as data loss.
  useEffect(() => flush, [flush]);

  /**
   * The pre-conversion collection, kept for exactly one undo. Held in a ref
   * with a mirroring state: the ref is what undo recommits, the state is
   * what renders the affordance. The single write path clears both, which
   * is what makes the undo one-shot — any later commit is a newer truth.
   */
  const undoConversionRef = useRef<FeatureCollection | null>(null);
  const [lastConversion, setLastConversion] = useState<{ label: string } | null>(
    null,
  );

  /** The single write path: advance the record, mirror it out, schedule. */
  const commit = useCallback(
    (
      nextRecord: UserVectorLayerRecord,
      nextCollection: FeatureCollection,
    ) => {
      undoConversionRef.current = null;
      setLastConversion(null);
      // A point a hand has moved is no longer where its fix was: the capture
      // time, the accuracy and the fix's altitude come off it here, on the
      // one path every geometry write goes through.
      nextCollection = withoutMovedCaptureProvenance(draftData, nextCollection);
      const summary = summarize(nextCollection);
      const advanced: UserVectorLayerRecord = {
        ...nextRecord,
        ...summary,
        revision: nextRecord.revision + 1,
        modifiedAt: new Date().toISOString(),
      };
      setDraftRecord(advanced);
      setDraftData(nextCollection);
      changedRef.current(advanced, nextCollection);
      schedulePersist(advanced, nextCollection);
    },
    [draftData, schedulePersist],
  );

  const beginEdit = useCallback((id: string) => {
    setStorageError(null);
    setDraftRecord(null);
    setDraftData(null);
    setEditingId(id);
  }, []);

  /**
   * Seeds the working copy when the named layer is available, which is not
   * necessarily the moment `beginEdit` runs: "New drawing layer" creates a
   * record and asks to edit it in the same tick, so the first call sees a
   * list from before the layer existed. Looking it up once and giving up
   * left the layer created and the editor shut.
   *
   * Guarded on `draftRecord` so it seeds exactly once per session: the list
   * updates on every edit (the session publishes back into it), and
   * re-seeding from that would clobber the draft mid-gesture.
   */
  useEffect(() => {
    if (!editingId || draftRecord) {
      return;
    }
    const record = records.find((candidate) => candidate.id === editingId);
    const data = geometries[editingId];
    if (record && data) {
      setDraftRecord(record);
      setDraftData(data);
    }
  }, [draftRecord, editingId, geometries, records]);

  const endEdit = useCallback(() => {
    flush();
    undoConversionRef.current = null;
    setLastConversion(null);
    setEditingId(null);
    setDraftRecord(null);
    setDraftData(null);
  }, [flush]);

  const commitGeometry = useCallback(
    (collection: FeatureCollection) => {
      if (!draftRecord) {
        return;
      }
      commit(draftRecord, collection);
    },
    [commit, draftRecord],
  );

  const updateFeatureDetails = useCallback(
    (featureId: string, details: FeatureDetails) => {
      if (!draftRecord || !draftData) {
        return;
      }
      const features: Feature[] = draftData.features.map((feature) =>
        String(feature.id) === featureId
          ? {
              ...feature,
              properties: { ...(feature.properties ?? {}), ...details },
            }
          : feature,
      );
      commit(draftRecord, { type: "FeatureCollection", features });
    },
    [commit, draftData, draftRecord],
  );

  /**
   * Freeform attribute writes: string values set, undefined deletes. New
   * objects at both levels — collect() and earlier publishes share property
   * references, so mutation would edit already-published collections.
   */
  const updateFeatureProperties = useCallback(
    (featureId: string, patch: Record<string, string | undefined>) => {
      if (!draftRecord || !draftData) {
        return;
      }
      const features: Feature[] = draftData.features.map((feature) => {
        if (String(feature.id) !== featureId) {
          return feature;
        }
        const properties: Record<string, unknown> = {
          ...(feature.properties ?? {}),
        };
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) {
            delete properties[key];
          } else {
            properties[key] = value;
          }
        }
        return { ...feature, properties };
      });
      commit(draftRecord, { type: "FeatureCollection", features });
    },
    [commit, draftData, draftRecord],
  );

  const deleteFeature = useCallback(
    (featureId: string) => {
      if (!draftRecord || !draftData) {
        return;
      }
      commit(draftRecord, {
        type: "FeatureCollection",
        features: draftData.features.filter(
          (feature) => String(feature.id) !== featureId,
        ),
      });
    },
    [commit, draftData, draftRecord],
  );

  const renameLayer = useCallback(
    (name: string) => {
      if (!draftRecord || !draftData) {
        return;
      }
      commit({ ...draftRecord, name }, draftData);
    },
    [commit, draftData, draftRecord],
  );

  const setFeaturePhotos = useCallback(
    (featureId: string, descriptors: FeaturePhotoDescriptor[]) => {
      if (!draftRecord || !draftData) {
        return;
      }
      const features: Feature[] = draftData.features.map((feature) => {
        if (String(feature.id) !== featureId) {
          return feature;
        }
        const properties: Record<string, unknown> = {
          ...(feature.properties ?? {}),
        };
        if (descriptors.length === 0) {
          delete properties[PHOTOS_PROPERTY];
        } else {
          properties[PHOTOS_PROPERTY] = descriptors.map((d) => ({ ...d }));
        }
        return { ...feature, properties };
      });
      commit(draftRecord, { type: "FeatureCollection", features });
    },
    [commit, draftData, draftRecord],
  );

  const moveFeaturePoint = useCallback(
    (featureId: string, position: [number, number]) => {
      if (!draftRecord || !draftData) {
        return;
      }
      const features: Feature[] = draftData.features.map((feature) =>
        String(feature.id) === featureId && feature.geometry?.type === "Point"
          ? {
              ...feature,
              geometry: { type: "Point", coordinates: [...position] },
            }
          : feature,
      );
      commit(draftRecord, { type: "FeatureCollection", features });
    },
    [commit, draftData, draftRecord],
  );

  const convertPoints = useCallback(
    (input: { shape: ConvertShape; keepSourcePoints: boolean }): string | null => {
      if (!draftRecord || !draftData) {
        return null;
      }
      const result = buildPathFromPoints(draftData, input);
      if (!result) {
        return null;
      }
      const before = draftData;
      commit(draftRecord, result.collection);
      // AFTER commit on purpose: commit clears the undo slot, and this
      // conversion is the one commit allowed to refill it.
      undoConversionRef.current = before;
      setLastConversion({
        label: `Converted ${(result.feature.properties as Record<string, unknown>)[
          "nsmts:convertedFromPoints"
        ] as number} points`,
      });
      return String(result.feature.id);
    },
    [commit, draftData, draftRecord],
  );

  const undoConversion = useCallback(() => {
    const before = undoConversionRef.current;
    if (!before || !draftRecord) {
      return;
    }
    // Through the normal write path: the restore is a commit like any other
    // (revision bump, summary, debounced persist), and commit clearing the
    // slot is what makes this one-shot.
    commit(draftRecord, before);
  }, [commit, draftRecord]);

  const editingLayer = useMemo<VisibleUserVectorLayer | null>(
    () =>
      draftRecord && draftData ? { record: draftRecord, data: draftData } : null,
    [draftData, draftRecord],
  );

  return {
    editingId,
    editingLayer,
    storageError,
    beginEdit,
    endEdit,
    commitGeometry,
    updateFeatureDetails,
    updateFeatureProperties,
    deleteFeature,
    renameLayer,
    setFeaturePhotos,
    moveFeaturePoint,
    convertPoints,
    lastConversion,
    undoConversion,
  };
}
