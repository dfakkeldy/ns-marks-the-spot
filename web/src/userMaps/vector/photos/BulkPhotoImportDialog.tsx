import { useRef, useState } from "react";
import { readPhotoExif } from "./exif";
import {
  classifyBulkPhotos,
  type BulkPhotoRow,
  type BulkViewportBounds,
} from "./bulkPlacement";
import type { BulkPhotoEntry } from "../useUserVectorLayers";

type BulkPhotoImportDialogProps = {
  bounds: BulkViewportBounds | null;
  onCreate: (
    entries: BulkPhotoEntry[],
  ) => Promise<{ id: string | null; notes: string[] }>;
  onClose: () => void;
  /** Closure-injection seam for tests. */
  readExif?: typeof readPhotoExif;
};

/**
 * The bulk EXIF placement flow: pick many photos, see which carry a geotag
 * inside the current view, and turn the confirmed ones into a new
 * photo-layer of points. Deliberately its OWN file input, never the shared
 * drop zone — importRouting must keep routing JPEG magic bytes to the
 * raster/georeference pipeline. EXIF is read locally (exifr); the photos
 * themselves are re-encoded on attach, so the stored bytes carry no EXIF.
 */
export function BulkPhotoImportDialog({
  bounds,
  onCreate,
  onClose,
  readExif = readPhotoExif,
}: BulkPhotoImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rows, setRows] = useState<BulkPhotoRow[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setReading(true);
    setNotes([]);
    setDone(false);
    try {
      const candidates = [];
      for (const file of Array.from(files)) {
        const exif = await readExif(file);
        candidates.push({ file, gps: exif.gps, capturedAt: exif.capturedAt });
      }
      const classified = classifyBulkPhotos(candidates, bounds);
      setRows(classified);
      setChecked(classified.map(({ checkedByDefault }) => checkedByDefault));
    } finally {
      setReading(false);
    }
  };

  const create = async () => {
    const entries: BulkPhotoEntry[] = rows
      .filter((row, index) => checked[index] && row.gps)
      .map((row) => ({
        file: row.file,
        gps: row.gps!,
        capturedAt: row.capturedAt,
      }));
    if (entries.length === 0) {
      return;
    }
    setCreating(true);
    try {
      const result = await onCreate(entries);
      setNotes(result.notes);
      setDone(result.id !== null);
    } finally {
      setCreating(false);
    }
  };

  const selectedCount = rows.filter((row, index) => checked[index] && row.gps).length;

  return (
    <div className="save-track-backdrop" role="presentation" onClick={onClose}>
      <div
        className="bulk-photos-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-photos-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="bulk-photos-title">Add photos to the map</h2>
        <p className="bulk-photos-note">
          Geotagged photos become points on a new layer. Photos stay on this
          device — reading their locations happens in your browser.
        </p>
        {rows.length === 0 ? (
          <button
            type="button"
            className="bulk-photos-pick"
            disabled={reading}
            onClick={() => inputRef.current?.click()}
          >
            {reading ? "Reading photo locations…" : "Choose photos"}
          </button>
        ) : (
          <>
            <ul className="bulk-photos-rows">
              {rows.map((row, index) => (
                <li key={`${row.file.name}:${index}`}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!row.gps || done}
                      checked={checked[index] ?? false}
                      onChange={(event) =>
                        setChecked((current) =>
                          current.map((value, at) =>
                            at === index ? event.target.checked : value,
                          ),
                        )
                      }
                    />
                    <span className="bulk-photos-name">{row.file.name}</span>
                    <small>
                      {row.gps === null
                        ? "No location in this photo"
                        : row.inViewport
                          ? "In current view"
                          : "Outside current view"}
                    </small>
                  </label>
                </li>
              ))}
            </ul>
            {done ? (
              <p className="bulk-photos-done" role="status">
                Points created — the map has moved to them.
              </p>
            ) : (
              <button
                type="button"
                className="bulk-photos-create"
                disabled={creating || selectedCount === 0}
                onClick={() => void create()}
              >
                {creating
                  ? "Creating…"
                  : `Create ${selectedCount.toLocaleString("en-CA")} point${
                      selectedCount === 1 ? "" : "s"
                    }`}
              </button>
            )}
          </>
        )}
        {notes.map((note) => (
          <small role="alert" className="bulk-photos-error" key={note}>
            {note}
          </small>
        ))}
        <button type="button" className="bulk-photos-close" onClick={onClose}>
          {done ? "Done" : "Cancel"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Choose photos to place"
          onChange={(event) => {
            void pick(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
