import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogChrome } from "../components/useDialogChrome";
import { formatDistance } from "../services/geodesy";
import { FIELD_CAPTURE_SPEC } from "./captureSpec";
import { simplifyTrackSegments } from "./simplifyTrack";
import { defaultTrackName } from "./trackFeature";
import type { StopResult } from "./trackRecorder";

export interface SaveTrackDialogProps {
  result: StopResult;
  /**
   * True for a walk recovered from an interrupted session rather than one the
   * user stopped: it ends at the last fix this device stored.
   */
  recovered?: boolean;
  /**
   * The name and tolerance a refused save was made with. A retry has to open
   * on the user's own choices: it rewrites the layer that save already put on
   * the map, so a generated default name would rename that track and the
   * default tolerance would re-simplify it at a setting nobody chose.
   */
  initialName?: string;
  initialToleranceM?: number;
  saving: boolean;
  onSave: (name: string, simplifyToleranceM: number) => void;
  onDiscard: () => void;
}

function vertexCount(segments: readonly { length: number }[]): number {
  return segments.reduce((total, segment) => total + segment.length, 0);
}

function formatRecordingTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1_000);
  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  return `${Math.floor(totalMinutes / 60)} h ${String(totalMinutes % 60).padStart(2, "0")} min`;
}

/**
 * The stop-time dialog: name the track, choose the simplify tolerance with a
 * live before/after vertex count, and save or discard. Every recording saves
 * as a new layer per the field-capture contract, so there is no destination
 * picker. Escape deliberately does nothing — a wrong tap must not throw away
 * a walked track; Discard confirms explicitly.
 */
export function SaveTrackDialog({
  result,
  recovered = false,
  initialName,
  initialToleranceM,
  saving,
  onSave,
  onDiscard,
}: SaveTrackDialogProps) {
  // Read at mount, which is all that is needed: the dialog is unmounted
  // between a refused save and the retry that reopens it. `??` and not `||`,
  // so a tolerance the user deliberately set to Off comes back as Off.
  const [name, setName] = useState(
    () => initialName ?? defaultTrackName(result.startedAt),
  );
  const [toleranceM, setToleranceM] = useState<number>(
    initialToleranceM ?? FIELD_CAPTURE_SPEC.simplify.defaultToleranceM,
  );
  // null: this dialog holds a walked track, and a stray Escape must not throw
  // it away. What it gains is the Tab trap and the focus restore it never had.
  const dialogRef = useDialogChrome<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const usableSegments = useMemo(
    () => result.segments.filter((segment) => segment.length >= 2),
    [result.segments],
  );
  const recordedVertexCount = vertexCount(usableSegments);
  const simplifiedVertexCount = useMemo(
    () =>
      vertexCount(
        simplifyTrackSegments(usableSegments, toleranceM).filter(
          (segment) => segment.length >= 2,
        ),
      ),
    [toleranceM, usableSegments],
  );
  const saveable = recordedVertexCount >= 2;

  return (
    <div className="save-track-backdrop">
      <div
        ref={dialogRef}
        className="save-track-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-track-title"
        // This dialog deliberately ignores Escape — a wrong tap must not throw
        // away a walked track — and saying so here is what keeps the keypress
        // from closing the parcel panel behind it instead.
        data-owns-escape=""
      >
        <h2 id="save-track-title">Save track</h2>
        {/* "Positions", never "GPS fixes": the Geolocation API names no
            sensor, and the same call answers from a satellite fix, a Wi-Fi
            lookup or an IP estimate — on a desktop browser, usually one of the
            last two. popup.ts and the location messages hold the same line. */}
        <p className="save-track-stats">
          {formatDistance(result.distanceM)} ·{" "}
          {formatRecordingTime(result.recordingMs)} recorded ·{" "}
          {result.rawFixCount.toLocaleString("en-CA")} positions
        </p>
        {recovered ? (
          <p className="save-track-note">
            Recovered from an interrupted recording. It ends at the last
            position this device stored, so the last part of the walk may be
            missing.
          </p>
        ) : null}
        {saveable ? (
          <>
            <label className="save-track-field">
              Track name
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <fieldset className="save-track-simplify">
              <legend>Simplify</legend>
              {FIELD_CAPTURE_SPEC.simplify.presetsM.map((preset) => (
                <label key={preset}>
                  <input
                    type="radio"
                    name="simplify-tolerance"
                    checked={toleranceM === preset}
                    onChange={() => setToleranceM(preset)}
                  />
                  {preset === 0 ? "Off" : `${preset} m`}
                </label>
              ))}
              <small aria-live="polite">
                {recordedVertexCount.toLocaleString("en-CA")} →{" "}
                {simplifiedVertexCount.toLocaleString("en-CA")} vertices
              </small>
            </fieldset>
            <p className="save-track-note">
              Every position this device reported is kept with this track.
              Location stays on this device.
            </p>
          </>
        ) : (
          <p className="save-track-note" role="alert">
            Too little movement was recorded to save a track.
          </p>
        )}
        <div className="save-track-actions">
          <button
            type="button"
            className="save-track-discard"
            disabled={saving}
            onClick={() => {
              if (
                window.confirm(
                  "Discard this recording? The track and its positions will be lost.",
                )
              ) {
                onDiscard();
              }
            }}
          >
            Discard
          </button>
          {saveable ? (
            <button
              type="button"
              className="save-track-save"
              disabled={saving || name.trim().length === 0}
              onClick={() => onSave(name.trim(), toleranceM)}
            >
              {saving ? "Saving…" : "Save track"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
