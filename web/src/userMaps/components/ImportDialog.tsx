import type { DragEvent } from "react";
import type { ImportOutcome } from "../useUserMaps";

/**
 * Inline import area (named per spec; the PR-2 georeferencer flow grows out
 * of it). An inline section — rather than a modal — keeps the layer list the
 * single place a user manages every layer, matching how Church maps, well
 * logs, and the other resource groups already live inline in the rail.
 */
export function ImportDialog({
  importing,
  importingLabel,
  storageError,
  outcomes,
  onImportFiles,
}: {
  importing: boolean;
  importingLabel: string | null;
  storageError: string | null;
  outcomes: ImportOutcome[];
  onImportFiles: (files: ArrayLike<File>) => void;
}) {
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    // A second drop while the first import is still parsing would start an
    // overlapping run: the first import's `finally` would clear the
    // progress indicator mid-flight, and the second batch's outcomes would
    // overwrite the first's, so the user never sees its success line.
    // Ignoring drops while busy keeps imports strictly one-at-a-time.
    if (importing) {
      return;
    }
    if (event.dataTransfer.files.length > 0) {
      onImportFiles(Array.from(event.dataTransfer.files));
    }
  }

  return (
    <div
      className={`user-map-import${importing ? " user-map-import--busy" : ""}`}
      data-testid="user-map-drop-zone"
      aria-busy={importing}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".tif,.tiff,.pdf,.png,.jpg,.jpeg"
        multiple
        aria-label="Add a map file"
        disabled={importing}
        onChange={(event) => {
          if (event.target.files?.length) {
            onImportFiles(Array.from(event.target.files));
            event.target.value = "";
          }
        }}
      />
      <small className="user-map-hint">Drag a file here, or choose one above.</small>
      <small className="user-map-privacy">
        Files stay on this device — nothing is uploaded.
      </small>
      {storageError ? (
        <small role="alert" className="user-map-error">
          {storageError}
        </small>
      ) : null}
      {importing && importingLabel ? (
        <small role="status" className="user-map-status">
          {importingLabel}
        </small>
      ) : null}
      {outcomes.length > 0 ? (
        <ul className="user-map-outcomes">
          {outcomes.map((outcome, index) => (
            <li
              key={`${index}-${outcome.fileName}`}
              className={outcome.ok ? "user-map-outcome-ok" : "user-map-error"}
            >
              {outcome.ok
                ? `${outcome.fileName} added${outcome.note ? ` — ${outcome.note}` : ""}`
                : `${outcome.fileName}: ${outcome.message}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
