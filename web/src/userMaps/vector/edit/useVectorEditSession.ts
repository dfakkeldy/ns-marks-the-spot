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
  readPhotoDescriptors,
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
  /** Changes on every begin and end; see the field above. */
  editGeneration: number;
  /** The open session's own write failure, or null. The panel renders it. */
  storageError: string | null;
  /**
   * Write failures whose session has already closed — Done, or another layer
   * opened — keyed by layer id, so two layers left unsaved are both reported
   * rather than one replacing the other. The panel that would have shown them
   * is gone, so the map carries them, and every message names its layer: by
   * the time a debounced write answers, the reader may be looking at a
   * different layer, or at none.
   */
  closedSessionErrors: Record<string, string>;
  /** Takes one notice down. The edit is still unsaved either way. */
  dismissClosedSessionError: (layerId: string) => void;
  /**
   * A layer this tab is removing, told to the session before the row goes.
   * Unsaved work for it is dropped rather than written — Done's flush would
   * start a write that reaches the store after the delete — and a write
   * already on its way is not allowed to report this tab's own removal as
   * another tab's deletion.
   */
  abandonLayer: (layerId: string) => void;
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
   * Adds freshly written photos to a feature, against the working copy as it
   * stands when the attach finishes rather than the one the strip rendered
   * when the file was picked. Returns the descriptors that had nowhere to
   * land, so the caller can take their rows and blobs back out of the store.
   */
  attachFeaturePhotos: (
    layerId: string,
    featureId: string,
    descriptors: FeaturePhotoDescriptor[],
  ) => FeaturePhotoDescriptor[];
  /**
   * Photos discarded that way, and what the reader is told about each. The
   * map renders them: a discard means the feature is gone, so the strip that
   * would have shown the message went with it.
   */
  discardedPhotos: Array<{ id: string; message: string }>;
  /** Takes one notice down once it has been read. */
  dismissDiscardedPhoto: (photoId: string) => void;
  /**
   * Says that the discarded photo's bytes are still on the device. The notice
   * above only claims the photo is not on the map, which the session watched
   * happen; whether the copy went is the caller's to observe, and a promise
   * that it did would be a removal nobody verified.
   */
  notePhotoCleanupFailure: (photoId: string) => void;
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
  /**
   * Counts sessions, so work that waits on something slow — a GPS fix — can
   * tell the session it was started in from a later one, including a later
   * one on the same layer.
   */
  const [editGeneration, setEditGeneration] = useState(0);
  /**
   * The same count, readable from a callback that does not re-render with it.
   * Advanced in the same statement as the state above, so a write started by
   * `endEdit`'s flush already sees the new session number by the time it
   * answers.
   */
  const generationRef = useRef(0);
  const [draftRecord, setDraftRecord] = useState<UserVectorLayerRecord | null>(null);
  const [draftData, setDraftData] = useState<FeatureCollection | null>(null);
  /**
   * The same working copy, readable from a callback that does not re-render
   * with it — the arrangement `generationRef` uses above, for the same
   * reason. Assigned in the same statement as the state, never mirrored by
   * an effect, so it is current the moment a change is made rather than a
   * render later. Attaching a photo is the one edit that starts in one
   * render and finishes seconds afterwards, and by then the state a callback
   * closed over can describe a photo the user has removed or a feature the
   * user has deleted.
   */
  const draftRef = useRef<{
    record: UserVectorLayerRecord;
    collection: FeatureCollection;
  } | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  /**
   * Layer id → why that layer's edit did not reach this device, for failures
   * whose session has closed. Keyed rather than one slot: a disk that is full
   * fails every layer's write, and one message overwriting another would
   * leave the reader believing only the last layer was lost.
   */
  const [closedSessionErrors, setClosedSessionErrors] = useState<
    Record<string, string>
  >({});
  /**
   * The reader's only way out of a notice no retry can clear — a layer
   * another tab deleted can never be written again. It hides the words, not
   * the fact: the edit is still unsaved and still on the map.
   */
  const dismissClosedSessionError = useCallback((layerId: string) => {
    setClosedSessionErrors((prev) => {
      if (!(layerId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[layerId];
      return next;
    });
  }, []);
  /**
   * Photos whose bytes reached the store but whose feature was no longer in
   * the open session by the time they got there. The rows and blobs go back
   * out, and this is how the reader learns it happened. Saying nothing would
   * leave a photo the user watched being added and will never see again.
   */
  const [discardedPhotos, setDiscardedPhotos] = useState<
    Array<{ id: string; message: string }>
  >([]);
  const dismissDiscardedPhoto = useCallback((photoId: string) => {
    setDiscardedPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  }, []);
  const notePhotoCleanupFailure = useCallback((photoId: string) => {
    setDiscardedPhotos((prev) =>
      prev.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              message: `${photo.message} The copy on this device couldn't be removed either.`,
            }
          : photo,
      ),
    );
  }, []);

  const timerRef = useRef<number | null>(null);
  const dirtyRef = useRef<{
    record: UserVectorLayerRecord;
    collection: FeatureCollection;
    /** The session this edit was made in; see `writeDirty`. */
    generation: number;
  } | null>(null);
  /**
   * Layers this tab removed. The store answers a write for a missing row
   * with false, which normally means another tab deleted the layer — but a
   * write still in flight when Remove was pressed gets that same answer for
   * a deletion this tab performed, and naming another tab there would be a
   * lie. Never pruned: an id belongs to one layer for the life of the tab.
   */
  const removedHereRef = useRef(new Set<string>());
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
    const { id, name } = pending.record;
    /**
     * Where a failure can be read, decided when the write ANSWERS rather than
     * when it was scheduled. A debounced write outlives the session that made
     * it: Done starts one and unmounts the panel in the same handler, and a
     * failure landing after another layer was opened would otherwise be read
     * as that layer's. Same session → its own panel, in the same words as
     * before. Session gone → the map, with the layer named.
     */
    const raise = (panelMessage: string, mapMessage: string) => {
      if (pending.generation === generationRef.current) {
        setStorageError(panelMessage);
        return;
      }
      setClosedSessionErrors((prev) => ({ ...prev, [id]: mapMessage }));
    };
    try {
      const wrote = await putRef.current(pending.record, pending.collection);
      if (wrote === false) {
        // Except when this tab is the one that removed it: a write already on
        // its way when Remove was pressed gets the same answer, and naming
        // another tab there would be a lie. Only this branch is gated — a
        // store that refuses the write still says so, whoever deleted what.
        if (removedHereRef.current.has(id)) {
          return;
        }
        // The layer is gone from the database — another tab deleted it — so
        // the update deliberately wrote nothing. The edit stays on screen,
        // and the reader is told it will not outlive the tab.
        raise(
          "This layer was deleted in another tab, so the edit can't be saved — " +
            "it stays available until you close the tab.",
          `Couldn't save your edit to ${name}: the layer was deleted in ` +
            "another tab. The edit stays available until you close the tab.",
        );
        return;
      }
      // A write that lands carries everything an earlier failed one did, so it
      // takes that layer's standing notice down — that layer's alone.
      setClosedSessionErrors((prev) => {
        if (!(id in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      // A failed write must never interrupt drawing: the edit stays on screen
      // and in memory, and the user is told persistence is the problem.
      const refusal =
        error instanceof UserMapImportError ? error.userMessage : null;
      raise(
        refusal ??
          "Couldn't save this edit — it stays available until you close the tab.",
        // The store's own refusals already end with what becomes of the edit
        // ("Storage is full — this layer stays available until you close the
        // tab."), so they are quoted whole rather than given a second tail.
        refusal
          ? `Couldn't save your edit to ${name}. ${refusal}`
          : `Couldn't save your edit to ${name} — it stays available until ` +
            "you close the tab.",
      );
    }
  }, []);

  const schedulePersist = useCallback(
    (record: UserVectorLayerRecord, collection: FeatureCollection) => {
      // The session travels with the edit: a debounced write can answer after
      // Done, or after another layer is opened, and its failure has to be told
      // apart from whatever panel is on screen by then.
      dirtyRef.current = { record, collection, generation: generationRef.current };
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
      draftRef.current = { record: advanced, collection: nextCollection };
      setDraftRecord(advanced);
      setDraftData(nextCollection);
      changedRef.current(advanced, nextCollection);
      schedulePersist(advanced, nextCollection);
    },
    [draftData, schedulePersist],
  );

  const beginEdit = useCallback((id: string) => {
    setStorageError(null);
    draftRef.current = null;
    setDraftRecord(null);
    setDraftData(null);
    // A new session, even for the same layer: work started before this one
    // began belongs to the session it was started in, and a layer id alone
    // cannot tell a reopened layer from the session that closed.
    generationRef.current += 1;
    setEditGeneration(generationRef.current);
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
      draftRef.current = { record, collection: data };
      setDraftRecord(record);
      setDraftData(data);
    }
  }, [draftRecord, editingId, geometries, records]);

  const endEdit = useCallback(() => {
    flush();
    undoConversionRef.current = null;
    setLastConversion(null);
    // Advanced here, synchronously, even though `flush()` above has already
    // started the write: `writeDirty` reads this only after awaiting the
    // store, so the write Done itself starts sees the session it left.
    generationRef.current += 1;
    setEditGeneration(generationRef.current);
    draftRef.current = null;
    setEditingId(null);
    setDraftRecord(null);
    setDraftData(null);
  }, [flush]);

  const abandonLayer = useCallback(
    (layerId: string) => {
      removedHereRef.current.add(layerId);
      // Dropped rather than flushed: the user asked for the layer to be
      // gone, and a write racing the delete comes back reading as a
      // deletion this tab did not do.
      if (dirtyRef.current?.record.id === layerId) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        dirtyRef.current = null;
      }
      // A standing notice promises the edit stays available until the tab
      // closes. Once the layer is removed, that is no longer true.
      dismissClosedSessionError(layerId);
      if (editingId !== layerId) {
        return;
      }
      // The session over the removed layer closes the way Done closes it,
      // minus the write.
      undoConversionRef.current = null;
      setLastConversion(null);
      generationRef.current += 1;
      setEditGeneration(generationRef.current);
      draftRef.current = null;
      setEditingId(null);
      setDraftRecord(null);
      setDraftData(null);
    },
    [dismissClosedSessionError, editingId],
  );

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

  /**
   * Adds photos to a feature as their bytes finish landing. Processing takes
   * seconds, and in that time the user can remove another photo, delete the
   * feature or press Done — so the strip sends only what is new and this
   * adds it to whatever the feature holds now. Writing back the whole list
   * the strip rendered would bring a removed photo back with its blobs
   * already deleted, or rebuild a feature the user deleted.
   *
   * The layer is checked as well as the feature: feature ids are unique
   * within a layer and nowhere else, so a session that has moved on to
   * another layer can hold a different feature under the same id.
   */
  const attachFeaturePhotos = useCallback(
    (
      layerId: string,
      featureId: string,
      descriptors: FeaturePhotoDescriptor[],
    ): FeaturePhotoDescriptor[] => {
      if (descriptors.length === 0) {
        return [];
      }
      // The ref rather than the state above: this call arrives from a render
      // that may be several edits old. See `draftRef`.
      const draft = draftRef.current;
      const target =
        draft && draft.record.id === layerId
          ? draft.collection.features.find(
              (feature) => String(feature.id) === featureId,
            )
          : undefined;
      if (!draft || !target) {
        // Handed back rather than dropped: the caller deletes the rows and
        // blobs, and the reader is told, because a photo that vanishes in
        // silence looks to the user like a photo that was never taken.
        setDiscardedPhotos((prev) => [
          ...prev,
          ...descriptors.map((descriptor) => ({
            id: descriptor.id,
            message:
              `Couldn't attach ${descriptor.sourceName ?? "a photo"}: that ` +
              "feature was no longer being edited when the photo finished " +
              "processing. It is not on the map.",
          })),
        ]);
        return descriptors;
      }
      const kept = [...readPhotoDescriptors(target.properties), ...descriptors];
      const features: Feature[] = draft.collection.features.map((feature) =>
        feature === target
          ? {
              ...feature,
              properties: {
                ...(feature.properties ?? {}),
                [PHOTOS_PROPERTY]: kept.map((descriptor) => ({ ...descriptor })),
              },
            }
          : feature,
      );
      commit(draft.record, { type: "FeatureCollection", features });
      return [];
    },
    [commit],
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
    editGeneration,
    storageError,
    closedSessionErrors,
    dismissClosedSessionError,
    abandonLayer,
    beginEdit,
    endEdit,
    commitGeometry,
    updateFeatureDetails,
    updateFeatureProperties,
    deleteFeature,
    renameLayer,
    setFeaturePhotos,
    attachFeaturePhotos,
    discardedPhotos,
    dismissDiscardedPhoto,
    notePhotoCleanupFailure,
    moveFeaturePoint,
    convertPoints,
    lastConversion,
    undoConversion,
  };
}
