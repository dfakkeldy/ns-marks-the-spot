import { useEffect, useState } from "react";
import type { PhotoManagerApi } from "./usePhotoManager";
import type { FeaturePhotoDescriptor } from "./types";

type PhotoLightboxProps = {
  descriptor: FeaturePhotoDescriptor;
  manager: PhotoManagerApi;
  onClose: () => void;
};

/**
 * Full-size viewer for one attached photo. Loads the full blob on demand and
 * revokes its object URL on close — full-size JPEGs are the biggest blobs
 * the app holds, and a leaked URL pins one in memory for the page's life.
 * A photo whose blob is missing (a failed save, another browser) says so
 * distinctly rather than showing a broken image.
 */
export function PhotoLightbox({ descriptor, manager, onClose }: PhotoLightboxProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void manager.loadFullBlob(descriptor.id).then((blob) => {
      if (cancelled) {
        return;
      }
      if (!blob) {
        setMissing(true);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [descriptor.id, manager]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="photo-lightbox-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="photo-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={descriptor.sourceName ?? "Photo"}
        onClick={(event) => event.stopPropagation()}
      >
        {missing ? (
          <p role="alert">
            This photo isn't available in this browser's storage.
          </p>
        ) : url ? (
          <img src={url} alt={descriptor.sourceName ?? "Attached photo"} />
        ) : (
          <p>Loading…</p>
        )}
        <button type="button" className="photo-lightbox-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
