import { useEffect, useRef, useState } from "react";
import { formatDistance, pathDistanceMetres } from "../../../services/geodesy";
import type { PhotoAttachOutcome, PhotoManagerApi } from "./usePhotoManager";
import { MAX_PHOTOS_PER_FEATURE, type FeaturePhotoDescriptor } from "./types";

type PhotoStripProps = {
  descriptors: FeaturePhotoDescriptor[];
  /** [lon, lat] when the feature is a Point — arms the location offer. */
  pointPosition: [number, number] | null;
  layerId: string;
  manager: PhotoManagerApi;
  onDescriptors: (descriptors: FeaturePhotoDescriptor[]) => void;
  /**
   * Hands newly written photos to the session, which adds them to whatever
   * the feature holds by then and returns the ones that had nowhere to land.
   * Separate from `onDescriptors` because a whole list captured at render
   * time is the wrong thing to write back seconds later.
   */
  onAttachDescriptors: (
    descriptors: FeaturePhotoDescriptor[],
  ) => FeaturePhotoDescriptor[];
  /**
   * Says that a discarded photo's bytes are still on this device. The session
   * says only that the photo is not on the map, which is what it watched
   * happen; the delete is attempted here, so its failure is reported here.
   */
  onPhotoCleanupFailed: (photoId: string) => void;
  /**
   * Whether photos are being processed right now. The panel holds Done while
   * they are: an attach that finishes after the session closes has no feature
   * left to land on, and its bytes are deleted — so the way to keep a photo
   * the reader watched being added is to keep the session open until it is.
   */
  onBusyChange?: (busy: boolean) => void;
  onMovePoint: (position: [number, number]) => void;
  onOpenPhoto: (descriptor: FeaturePhotoDescriptor) => void;
};

type LocationOffer = {
  gps: { lon: number; lat: number };
  distanceM: number;
};

/**
 * The selected feature's photos: thumbnails, camera capture, library picks,
 * per-photo remove. Browsers expose no photo library — both buttons are file
 * pickers (`capture` steers mobile browsers to the camera) and the UI never
 * pretends otherwise. A geotag surfaces exactly once, at attach time, as the
 * "move point to photo's location" offer; the stored bytes carry no EXIF.
 */
export function PhotoStrip({
  descriptors,
  pointPosition,
  layerId,
  manager,
  onDescriptors,
  onAttachDescriptors,
  onPhotoCleanupFailed,
  onBusyChange,
  onMovePoint,
  onOpenPhoto,
}: PhotoStripProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<PhotoAttachOutcome[]>([]);
  /**
   * Photos whose bytes are still on the device after the reader asked for
   * them to go. The descriptor is off the feature either way — that is what
   * they asked for and it happened — but the copy is not, and saying nothing
   * would report a removal only half of which took place.
   */
  const [undeleted, setUndeleted] = useState<string[]>([]);
  const [offer, setOffer] = useState<LocationOffer | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    for (const descriptor of descriptors) {
      if (thumbs[descriptor.id]) {
        continue;
      }
      void manager.loadThumbUrl(descriptor.id).then((url) => {
        if (!cancelled && url) {
          setThumbs((current) => ({ ...current, [descriptor.id]: url }));
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [descriptors, manager, thumbs]);

  const attach = async (files: FileList | null) => {
    if (!files || files.length === 0 || busy) {
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    setFailures([]);
    setOffer(null);
    try {
      const outcomes = await manager.attachPhotos(
        layerId,
        descriptors.length,
        files,
      );
      const added = outcomes.filter(
        (outcome): outcome is Extract<PhotoAttachOutcome, { ok: true }> =>
          outcome.ok,
      );
      // Seconds have passed since the file was picked, and the list this
      // render captured is not what the feature holds now: writing it back
      // would return a photo removed meanwhile, whose blobs are already
      // gone. The session adds against its own current copy and says what it
      // could not place.
      const discarded =
        added.length > 0
          ? onAttachDescriptors(added.map(({ descriptor }) => descriptor))
          : [];
      for (const descriptor of discarded) {
        // The store is not a place to keep a photo the user has no way to
        // reach. This runs even after the strip has unmounted with its
        // feature — unmounting stops the renders, not the work in flight —
        // and a delete the device refuses is said out loud, because there is
        // no layer left for a later sweep to find this row through.
        void manager.removePhoto(descriptor.id).then((removed) => {
          if (!removed) {
            onPhotoCleanupFailed(descriptor.id);
          }
        });
      }
      setFailures(outcomes.filter((outcome) => !outcome.ok));
      // No offer for a photo that was not attached: there is no point left
      // to move it to, and the session has already said what became of it.
      if (pointPosition && discarded.length === 0) {
        const geotagged = added.filter(({ gps }) => gps !== null).at(-1);
        if (geotagged?.gps) {
          setOffer({
            gps: geotagged.gps,
            distanceM: pathDistanceMetres([
              { lat: pointPosition[1], lng: pointPosition[0] },
              { lat: geotagged.gps.lat, lng: geotagged.gps.lon },
            ]),
          });
        }
      }
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const remove = (descriptor: FeaturePhotoDescriptor) => {
    if (
      !window.confirm(
        "Remove this photo from the feature and this device? This cannot be undone.",
      )
    ) {
      return;
    }
    onDescriptors(descriptors.filter(({ id }) => id !== descriptor.id));
    void manager.removePhoto(descriptor.id).then((removed) => {
      if (!removed) {
        setUndeleted((current) => [
          ...current,
          descriptor.sourceName ?? "the photo",
        ]);
      }
    });
  };

  return (
    <div className="vector-edit-photos">
      <h3>Photos</h3>
      {descriptors.length === 0 ? (
        <small className="vector-edit-photos-empty">No photos yet.</small>
      ) : (
        <div className="vector-edit-photo-thumbs">
          {descriptors.map((descriptor, index) => (
            <div className="vector-edit-photo-thumb" key={descriptor.id}>
              <button
                type="button"
                aria-label={`Open photo ${index + 1} of ${descriptors.length}${
                  descriptor.sourceName ? `: ${descriptor.sourceName}` : ""
                }`}
                onClick={() => onOpenPhoto(descriptor)}
              >
                {thumbs[descriptor.id] ? (
                  <img
                    src={thumbs[descriptor.id]}
                    alt={descriptor.sourceName ?? `Photo ${index + 1}`}
                  />
                ) : (
                  <span aria-hidden="true">…</span>
                )}
              </button>
              <button
                type="button"
                className="vector-edit-photo-remove"
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => remove(descriptor)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {offer && pointPosition ? (
        <div className="vector-edit-photo-offer">
          <small>
            This photo is geotagged, {formatDistance(offer.distanceM)} from
            this point.
          </small>
          <button
            type="button"
            onClick={() => {
              onMovePoint([offer.gps.lon, offer.gps.lat]);
              setOffer(null);
            }}
          >
            Move point to photo's location
          </button>
        </div>
      ) : null}
      {failures.map((failure) => (
        <small
          role="alert"
          className="vector-edit-photo-error"
          key={failure.fileName}
        >
          {failure.fileName}: {failure.ok ? "" : failure.message}
        </small>
      ))}
      {undeleted.map((name, index) => (
        <small
          role="alert"
          className="vector-edit-photo-error"
          key={`${name}-${index}`}
        >
          {name}: taken off this feature, but this device wouldn&apos;t delete
          its copy.
        </small>
      ))}
      <div className="vector-edit-photo-actions">
        <button
          type="button"
          disabled={busy || descriptors.length >= MAX_PHOTOS_PER_FEATURE}
          onClick={() => cameraRef.current?.click()}
        >
          Take photo
        </button>
        <button
          type="button"
          disabled={busy || descriptors.length >= MAX_PHOTOS_PER_FEATURE}
          onClick={() => libraryRef.current?.click()}
        >
          Add photos
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Take a photo"
        onChange={(event) => {
          void attach(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Add photos from files"
        onChange={(event) => {
          void attach(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
