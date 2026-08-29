import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { UserMapImportError } from "../../errors";
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
  deleteFeature: (featureId: string) => void;
  renameLayer: (name: string) => void;
};

type Options = {
  records: UserVectorLayerRecord[];
  geometries: Record<string, FeatureCollection>;
  putVectorLayer: (
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ) => Promise<void>;
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

  /** The single write path: advance the record, mirror it out, schedule. */
  const commit = useCallback(
    (
      nextRecord: UserVectorLayerRecord,
      nextCollection: FeatureCollection,
    ) => {
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
    [schedulePersist],
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
    deleteFeature,
    renameLayer,
  };
}
