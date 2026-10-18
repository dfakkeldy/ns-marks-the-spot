import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { PdfRegistrationCandidate, PixelRect } from "../types";
import type { PixelSize } from "../transform/projection";
import type { VisibleUserMap } from "./UserMapLayers";

export type GeoPdfFrameChooserProps = {
  map: VisibleUserMap;
  onCancel: () => void;
  onUseFrame: (
    candidateId: string,
    options?: { replaceAdjustedPoints?: boolean },
  ) => Promise<void>;
};

function rectStyle(rect: PixelRect, page: PixelSize): CSSProperties {
  return {
    left: `${(rect.x / page.width) * 100}%`,
    top: `${(rect.y / page.height) * 100}%`,
    width: `${(rect.width / page.width) * 100}%`,
    height: `${(rect.height / page.height) * 100}%`,
  };
}

function frameDisplayLabel(
  candidates: PdfRegistrationCandidate[],
  index: number,
): string {
  const label = candidates[index].embeddedLabel;
  if (label !== null) {
    return label;
  }
  const unnamedOrdinal = candidates
    .slice(0, index + 1)
    .filter((candidate) => candidate.embeddedLabel === null).length;
  return `Unnamed frame ${unnamedOrdinal}`;
}

export function GeoPdfFrameChooser({
  map,
  onCancel,
  onUseFrame,
}: GeoPdfFrameChooserProps) {
  const registration = map.record.pdf?.registration;
  const candidates =
    registration?.status === "selection-required" ||
    registration?.status === "embedded"
      ? registration.candidates
      : [];
  const initialId =
    registration?.status === "embedded"
      ? registration.selectedFrameId
      : null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current
      ?.querySelector<HTMLElement>("input, button")
      ?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), [tabindex="0"]',
        ),
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onCancel]);

  if (!registration || candidates.length === 0) {
    return null;
  }
  const selectedCandidate =
    candidates.find(({ id }) => id === selectedId) ?? null;

  const confirmFrame = async () => {
    if (!selectedId || submitting) {
      return;
    }
    let options: { replaceAdjustedPoints?: boolean } | undefined;
    // ANY apply on an adjusted registration replaces the adjusted points —
    // selectPdfFrame refuses to do it without explicit consent, and the old
    // same-frame carve-out sent that unconsented call anyway: re-selecting
    // the current frame threw an unhandled rejection and the button just
    // looked dead. Keeping the points is what Cancel is for.
    if (registration.status === "embedded" && registration.adjusted) {
      const message = selectedId === registration.selectedFrameId
        ? "Re-applying this frame replaces your adjusted points with its " +
          "embedded coordinates. Continue?"
        : "Changing frames replaces your adjusted points with the selected " +
          "frame's embedded coordinates. Continue?";
      if (!window.confirm(message)) {
        return;
      }
      options = { replaceAdjustedPoints: true };
    }
    setSubmitting(true);
    try {
      await onUseFrame(selectedId, options);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="geopdf-frame-chooser-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="geopdf-frame-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>Choose a frame for {map.record.name}</h2>
        <p>
          Select the map or inset to display. Its embedded coordinates will
          place it automatically.
        </p>
        <div
          className="geopdf-frame-preview"
          style={{
            aspectRatio:
              `${map.record.pixelSize.width} / ${map.record.pixelSize.height}`,
          }}
        >
          <img src={map.previewUrl} alt={`Page 1 of ${map.record.name}`} />
          {selectedCandidate ? (
            <span
              className="geopdf-frame-highlight"
              style={rectStyle(
                selectedCandidate.sourceRect,
                map.record.pixelSize,
              )}
              data-testid="geopdf-frame-highlight"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <fieldset>
          <legend>Registered frames on page 1</legend>
          {candidates.map((candidate, index) => (
            <label key={candidate.id} className="geopdf-frame-option">
              <input
                type="radio"
                name="geopdf-frame"
                value={candidate.id}
                checked={selectedId === candidate.id}
                onChange={() => setSelectedId(candidate.id)}
              />
              <span>{frameDisplayLabel(candidates, index)}</span>
            </label>
          ))}
        </fieldset>
        <div className="geopdf-frame-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedId || submitting}
            onClick={() => void confirmFrame()}
          >
            Use this frame
          </button>
        </div>
      </section>
    </div>
  );
}
