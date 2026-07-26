import { useEffect, useRef, useState } from "react";
import type { GeoreferenceSession } from "../useGeoreferenceSession";
import { georeferenceAnnotation } from "../allmaps/annotation";
import { MIN_GCPS_FOR_BENDING_TPS, MIN_GCPS_FOR_TPS } from "../transform/tps";
import type { Gcp, GeoreferenceMethod, UserMapRecord } from "../types";
import { GcpList } from "./GcpList";
import { statusMessage } from "./georeferenceStatus";
import { ScanPane, type ScanFocusRequest } from "./ScanPane";

export type ReferenceLayerId = "aerial" | "parcels";

/**
 * Copy is the maintainer's call, proposed for review.
 *
 * Deliberately says nothing about accuracy. The panel's own accuracy figure
 * under a TPS is leave-one-out, which is measured to OVERSTATE true warp error
 * by 1.8x (n=12) to 3.7x (n=4) and is never optimistic — a conservative upper
 * bound, not the error — so any claim in that register belongs on that line,
 * worded as a bound, and not here.
 */
const TPS_LABEL = "Curved warp (TPS)";
const TPS_HELPER =
  "Passes exactly through every point. Better for hand-drawn maps that " +
  "don't sit flat.";
/** Module-private: only this file's own prop type refers to it. App.tsx
 * imports `ReferenceLayerId` and builds the record inline. */
type ReferenceLayerState = Record<ReferenceLayerId, boolean>;

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

/**
 * The tab↔panel wiring, as literals rather than `useId()`, because App renders
 * this component through ONE conditional slot keyed on the record id (App.tsx)
 * — at most one panel is mounted at a time, so there is nothing for a
 * generated suffix to disambiguate, and a greppable id is worth more here.
 *
 * The two panels are deliberately in different places in the tree: the scan
 * panel is `.georeference-scan`, a direct grid child of `.georeference-panel`
 * that ScanPane renders (so its id/role are passed DOWN — wrapping it in a new
 * div would insert a grid item and break the layout), and the map panel is the
 * floating bar, a SIBLING of the panel. `aria-controls` is what associates a
 * tab with its panel; DOM adjacency is not required and is impossible here.
 */
const SCAN_TAB_ID = "georeference-tab-scan";
const SCAN_PANEL_ID = "georeference-tabpanel-scan";
const MAP_TAB_ID = "georeference-tab-map";
const MAP_PANEL_ID = "georeference-tabpanel-map";

/** Stable so ScanPane is not handed a fresh object on every render. */
const SCAN_TAB_PANEL = { id: SCAN_PANEL_ID, labelledBy: SCAN_TAB_ID };

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
  onMethodChange,
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
  /**
   * Persists the chosen solver on the RECORD. Required, not optional: this
   * panel is the only place the method can be chosen, and an optional prop
   * would let App mount a toggle whose clicks go nowhere without `tsc -b`
   * noticing.
   */
  onMethodChange: (method: GeoreferenceMethod) => void;
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
  /**
   * The RECORD is the single source of truth for which solver is in play, and
   * that is the whole reason there is no `useState` here. App reads the same
   * `record.georef.method` to pick the session's solver, so the tick the user
   * sees and the warp they are looking at cannot disagree: a local mirror
   * could tick "on" while the drape stayed an affine, and nothing on screen
   * would say which one was lying.
   *
   * A record carrying its own embedded georeferencing has no GCPs and no
   * method to choose; it falls back to the same "affine" default
   * `EMPTY_GCP_GEOREF` and `saveGcps` use, and the gate below hides the
   * control for it outright.
   *
   * The `kind` test is repeated rather than hoisted into a boolean: TypeScript
   * narrows a discriminated union through an aliased condition only for a
   * discriminant on the const itself, not through a nested property path like
   * `record.georef.kind`, so a hoisted flag leaves `record.georef.method` a
   * TS2339 error.
   */
  const method: GeoreferenceMethod =
    record.georef.kind === "gcp" ? record.georef.method : "affine";
  //
  // The gate is `MIN_GCPS_FOR_BENDING_TPS`, shared with the two mesh builders
  // rather than spelled out here: below it the toggle's two positions produce
  // an identical drape (measured 1.317e-9 m apart), so the control would be a
  // choice with no consequence. Below it is ABSENT rather than
  // disabled-and-present, per the spec — a disabled control advertises
  // something the user cannot have and explains nothing about why. Task 10's
  // Allmaps export control gates on this same constant; an earlier plan draft
  // had the two one point apart.
  const showWarpToggle =
    record.georef.kind === "gcp" &&
    session.gcps.length >= MIN_GCPS_FOR_BENDING_TPS;

  /**
   * `MIN_GCPS_FOR_TPS` (3), deliberately NOT `MIN_GCPS_FOR_BENDING_TPS` (4) —
   * despite `tps.ts`'s own comment (now stale, corrected alongside this)
   * having said the two controls share a gate. The toggle's 4 exists because
   * a spline needs a FOURTH point to bend at all; below it TPS and affine are
   * the same drape, so the toggle would be a choice with no consequence.
   * Export has no such constraint — a 3-point affine is a complete, valid
   * Georeference Annotation (the IIIF spec's own floor for any warping
   * transformation is 3 GCPs), and 3 is exactly `MIN_GCPS_FOR_AFFINE`: the
   * point count at which this app's OWN solver first produces a drawn drape
   * (`exact-fit`, in `useGeoreferenceSession.ts`). Gating export at 4 would
   * withhold a valid export for every 3-point map already on screen.
   *
   * Reads `record.georef.gcps.length`, not `session.gcps.length` (unlike the
   * toggle above): the downloaded payload is built from `record` below, not
   * from the live session, so gating on the same source the export reads
   * guarantees the control is never visible over a stale or short payload —
   * at the cost of the button lagging the debounced write by up to 400ms
   * when a point is freshly placed, which is the safer side to be wrong on.
   */
  const showExport =
    record.georef.kind === "gcp" &&
    record.georef.gcps.length >= MIN_GCPS_FOR_TPS;

  function exportGeoreference() {
    // Reachable only when showExport is true, which already established
    // record.georef.kind === "gcp" — georeferenceAnnotation returns null for
    // the OTHER kind only, so this null branch is unreachable in practice.
    // The guard keeps that a fact this function proves rather than assumes.
    const annotation = georeferenceAnnotation(record);
    if (!annotation) {
      return;
    }
    // Same create-anchor-click-revoke sequence App.tsx uses for the evidence
    // note export — one convention for "download a file" in this codebase.
    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(annotation, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${record.name}.georef.json`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

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
            id={SCAN_TAB_ID}
            aria-selected={tab === "scan"}
            aria-controls={SCAN_PANEL_ID}
            onClick={() => setTab("scan")}
          >
            Scan
          </button>
          <button
            type="button"
            role="tab"
            id={MAP_TAB_ID}
            aria-selected={tab === "map"}
            aria-controls={MAP_PANEL_ID}
            onClick={() => setTab("map")}
          >
            Map
          </button>
        </div>

        <ScanPane
          tabPanel={SCAN_TAB_PANEL}
          previewUrl={previewUrl}
          pixelSize={record.pixelSize}
          gcps={session.gcps}
          pending={session.pending}
          focus={scanFocus}
          onPickPoint={session.pickScanPoint}
          onDragStartGcp={session.beginDragGcp}
          onDragEndGcp={session.endDragGcp}
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
              <small>Map opacity</small>
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

            {/* A native checkbox, not a `role="switch"` or a radio pair, for
                two reasons. The state a sighted user reads off the tick and
                the state a screen reader announces are the SAME property of
                the same element, so — unlike GcpList's suspect row, whose
                border-and-bold needed a `.visually-hidden` twin — there is no
                second carrier here that could drift out of step with the
                first. And the panel already spells "an option you turn on"
                exactly this way, in the reference-layers fieldset below.

                `event.target.checked` rather than `method === "affine"`: the
                value sent comes from the very DOM state `checked` above set,
                so the control cannot ask for the method it is already on. */}
            {showWarpToggle ? (
              <fieldset className="georeference-method">
                <legend>Warp</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={method === "tps"}
                    onChange={(event) =>
                      onMethodChange(event.target.checked ? "tps" : "affine")
                    }
                  />
                  {TPS_LABEL}
                </label>
                <small>{TPS_HELPER}</small>
              </fieldset>
            ) : null}

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
                  Close this panel and accept the provincial data licence to
                  use these.
                </small>
              ) : null}
            </fieldset>

            <div className="georeference-actions">
              <button type="button" onClick={undo} disabled={!canUndo}>
                Undo
              </button>
              {showExport ? (
                <button type="button" onClick={exportGeoreference}>
                  Export georeference
                </button>
              ) : null}
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
          know the viewport width.

          It is also the Map tab's PANEL. The tab's real content — the app's
          own live map — is outside this component entirely and cannot carry
          the role, so the role goes on the one thing the tab does render.

          The role is NOT conditional on the breakpoint. CSS owns that
          breakpoint (`max-width: 1199.98px`), and re-deriving it here with
          matchMedia would duplicate a number that can drift, in a component
          whose whole design is "no JS knows the viewport width". Above the
          breakpoint the tablist is `display: none`, so both panels are
          momentarily orphaned — harmless, because the failure mode of an
          orphan tabpanel is content you cannot reach, and up there BOTH panes
          are on screen at once with nothing hidden. Neither panel takes
          `hidden` for the same reason: visibility is the stylesheet's job,
          and hiding the unselected one would blank the wide layout. */}
      <div
        className="georeference-map-bar"
        data-tab={tab}
        id={MAP_PANEL_ID}
        role="tabpanel"
        aria-labelledby={MAP_TAB_ID}
      >
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
