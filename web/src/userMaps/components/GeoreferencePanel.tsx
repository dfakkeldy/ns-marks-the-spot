import { useEffect, useRef, useState } from "react";
import type { GeoreferenceSession } from "../useGeoreferenceSession";
import type { Gcp, UserMapRecord } from "../types";
import { GcpList } from "./GcpList";
import { statusMessage } from "./georeferenceStatus";
import { ScanPane, type ScanFocusRequest } from "./ScanPane";

export type ReferenceLayerId = "aerial" | "parcels";
export type ReferenceLayerState = Record<ReferenceLayerId, boolean>;

/** `<input>` types that accept free text, where native browser undo applies.
 * Deliberately excludes checkbox/radio/range/color/etc — those have no text
 * buffer for Ctrl/Cmd+Z to act on, so there is nothing to protect there. */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
]);

/** Not exported: a plain function export alongside a component is a
 * react-refresh/only-export-components error here (see GcpList's
 * formatResidual for the same pattern). */
function isTextEntryElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (target.tagName === "TEXTAREA") {
    return true;
  }
  return (
    target.tagName === "INPUT" &&
    TEXT_INPUT_TYPES.has((target as HTMLInputElement).type)
  );
}

export function GeoreferencePanel({
  record,
  previewUrl,
  opacity,
  session,
  onOpacityChange,
  onClose,
  onDelete,
  onFocusGcpOnMap,
  referenceLayers,
  referenceLayersLocked = false,
  onToggleReferenceLayer,
}: {
  record: UserMapRecord;
  previewUrl: string;
  opacity: number;
  session: GeoreferenceSession;
  onOpacityChange: (opacity: number) => void;
  onClose: () => void;
  /** Deletes the map. Already confirmed here — do NOT confirm again. */
  onDelete: () => void;
  /** The panel moves its own scan pane; only App can move the live map. */
  onFocusGcpOnMap: (gcp: Gcp) => void;
  referenceLayers: ReferenceLayerState;
  referenceLayersLocked?: boolean;
  onToggleReferenceLayer: (id: ReferenceLayerId, enabled: boolean) => void;
}) {
  const [tab, setTab] = useState<"scan" | "map">("scan");
  const [selectedGcpId, setSelectedGcpId] = useState<string | null>(null);
  const [scanFocus, setScanFocus] = useState<ScanFocusRequest | null>(null);
  const focusRequestId = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const { cancelPending, flush, undo } = session;
  const hasPending = session.pending !== null;
  const canUndo = session.canUndo;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Escape unwinds one level at a time: an in-progress pair first, the
        // panel only once there is nothing half-placed to lose.
        if (hasPending) {
          cancelPending();
        } else {
          flush();
          onClose();
        }
        return;
      }
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) {
        // The overlay is deliberately non-modal (pointer-events: none, no
        // scrim), so the app's OWN inputs — e.g. a PID search box — stay
        // focusable while this panel is open. Only swallow the shortcut when
        // it did NOT originate from one of those: an editable element that
        // is not a descendant of the panel itself. Escape above is left
        // unscoped on purpose — closing this panel from anywhere is intended.
        if (
          isTextEntryElement(event.target) &&
          !panelRef.current?.contains(event.target)
        ) {
          return;
        }
        event.preventDefault();
        if (canUndo) {
          undo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, cancelPending, flush, hasPending, onClose, undo]);

  function close() {
    // Writes are debounced, so the tail of a session would otherwise be lost
    // between the last edit and the panel unmounting.
    flush();
    onClose();
  }

  function zoomToGcp(id: string) {
    const gcp = session.gcps.find((candidate) => candidate.id === id);
    if (!gcp) {
      return;
    }
    // Both panes move. The scan is this component's own child, so it takes a
    // focus request directly; the live map is inside MapContainer and only
    // reachable through App's binding, so that half goes up as a callback.
    // The request carries a monotonic id so asking for the SAME point twice
    // still moves the map — an equal object would be a no-op to the effect.
    focusRequestId.current += 1;
    setScanFocus({ pixel: gcp.pixel, requestId: focusRequestId.current });
    onFocusGcpOnMap(gcp);
  }

  const status = statusMessage(session.status);

  return (
    // The overlay is a fixed, full-viewport FRAME, not a modal: it carries
    // `pointer-events: none` and no scrim, so the app's own map behind it
    // stays visible and clickable — which is the whole interaction. The panel
    // is a left-anchored ~45vw column inside it, and takes back
    // `pointer-events: auto`. Both class names, `data-tab`, and the floating
    // bar below are what styles.css targets — see the rendered-DOM tests.
    <div className="georeference-overlay">
      <section
        ref={panelRef}
        className="georeference-panel"
        data-tab={tab}
        aria-label={`Georeferencing ${record.name}`}
      >
        <header className="georeference-header">
          <h2>{record.name}</h2>
          <p role="status" aria-live="polite" className="georeference-status">
            {status}
          </p>
        </header>

        {/* A DIRECT child of the panel, not of the header: the narrow
            breakpoint gives the tabs their own grid row. Hidden by CSS on
            wide screens, where both panes are visible at once. */}
        <div className="georeference-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "scan"}
            onClick={() => setTab("scan")}
          >
            Scan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "map"}
            onClick={() => setTab("map")}
          >
            Map
          </button>
        </div>

        <ScanPane
          previewUrl={previewUrl}
          pixelSize={record.pixelSize}
          gcps={session.gcps}
          pending={session.pending}
          focus={scanFocus}
          onPickPoint={session.pickScanPoint}
          onDragStartGcp={session.beginDragGcp}
          onMoveGcp={session.moveGcpOnScan}
          selectedGcpId={selectedGcpId}
        />

        <div className="georeference-side">
          <div className="georeference-points">
            <GcpList
              gcps={session.gcps}
              report={session.report}
              onDelete={session.deleteGcp}
              onSelect={setSelectedGcpId}
              onZoomTo={zoomToGcp}
              selectedGcpId={selectedGcpId}
            />
          </div>

          <footer className="georeference-footer">
            <label className="georeference-opacity">
              <span>Map opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Map opacity"
                value={Math.round(opacity * 100)}
                onChange={(event) =>
                  onOpacityChange(Number(event.target.value) / 100)
                }
              />
            </label>

            <fieldset
              className="georeference-references"
              disabled={referenceLayersLocked}
            >
              <legend>Reference layers</legend>
              <label>
                <input
                  type="checkbox"
                  checked={referenceLayers.aerial}
                  onChange={(event) =>
                    onToggleReferenceLayer("aerial", event.target.checked)
                  }
                />
                Aerial imagery
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={referenceLayers.parcels}
                  onChange={(event) =>
                    onToggleReferenceLayer("parcels", event.target.checked)
                  }
                />
                Property boundaries
              </label>
              {referenceLayersLocked ? (
                <small className="georeference-references-locked">
                  Accept the provincial data licence in the layer list to use
                  these.
                </small>
              ) : null}
            </fieldset>

            <div className="georeference-actions">
              <button type="button" onClick={undo} disabled={!canUndo}>
                Undo
              </button>
              <button
                type="button"
                className="georeference-done"
                onClick={close}
              >
                Done
              </button>
              <button
                type="button"
                className="georeference-delete"
                onClick={() => {
                  // The ONLY confirm for this action. App's onDelete removes
                  // the map directly; a second prompt there reads as a broken
                  // dialog.
                  if (
                    window.confirm(
                      `Remove "${record.name}" from this device? The original ` +
                        "file on your computer is not affected.",
                    )
                  ) {
                    onDelete();
                  }
                }}
              >
                Delete map
              </button>
            </div>
          </footer>
        </div>
      </section>

      {/* A SIBLING of the panel, not a child. On a narrow viewport the Map
          tab sets `display: none` on the panel — that is the point of the tab,
          per the spec — so anything nested inside it would vanish too. This
          bar is what is left: the live prompt, and the way back. CSS shows it
          only at that breakpoint and only on that tab, so no JS here needs to
          know the viewport width. */}
      <div className="georeference-map-bar" data-tab={tab}>
        <p
          role="status"
          aria-live="polite"
          className="georeference-map-bar-status"
        >
          {status}
        </p>
        <button
          type="button"
          className="georeference-map-bar-back"
          onClick={() => setTab("scan")}
        >
          Back to scan
        </button>
      </div>
    </div>
  );
}
