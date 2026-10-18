import type { Feature, LineString, MultiLineString } from "geojson";
import { generateId } from "../userMaps/importUtils";
import { FIELD_CAPTURE_SPEC } from "./captureSpec";
import { simplifyTrackSegments } from "./simplifyTrack";
import type { TrackPoint } from "./trackFilter";
import type { StopResult } from "./trackRecorder";

/**
 * Builds the saved track feature from a recording, per the field-capture
 * contract: geometry is the filtered, smoothed, simplified line (one
 * LineString, or a MultiLineString when pause/resume produced segments);
 * per-vertex timestamps ride `coordinateProperties.times` — the togeojson
 * convention, so recorded and GPX-imported tracks are indistinguishable to
 * exporters — and `nsmts:recording` declares exactly what processing the
 * geometry received. The raw GPX original is the unprocessed evidence;
 * geometry stays 2D on purpose (altitude lives in the raw GPX).
 */

export function buildRecordedTrackFeature(
  result: StopResult,
  name: string,
  simplifyToleranceM: number,
): Feature<LineString | MultiLineString> | null {
  const segments = simplifyTrackSegments(result.segments, simplifyToleranceM)
    // A one-vertex segment draws nothing and would corrupt a MultiLineString.
    .filter((segment) => segment.length >= 2);
  if (segments.length === 0) {
    return null;
  }

  const toPosition = ({ lng, lat }: TrackPoint): [number, number] => [lng, lat];
  const toTime = ({ timestampMs }: TrackPoint): string =>
    new Date(timestampMs).toISOString();

  const geometry: LineString | MultiLineString =
    segments.length === 1
      ? { type: "LineString", coordinates: segments[0].map(toPosition) }
      : {
          type: "MultiLineString",
          coordinates: segments.map((segment) => segment.map(toPosition)),
        };
  const times =
    segments.length === 1
      ? segments[0].map(toTime)
      : segments.map((segment) => segment.map(toTime));

  return {
    type: "Feature",
    id: generateId(),
    geometry,
    properties: {
      name,
      "nsmts:recording": {
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        rawFixCount: result.rawFixCount,
        acceptedFixCount: result.acceptedFixCount,
        simplifiedVertexCount: segments.reduce(
          (total, segment) => total + segment.length,
          0,
        ),
        simplifyToleranceM,
        smoothingAlpha: FIELD_CAPTURE_SPEC.trackFilter.smoothingAlpha,
      },
      coordinateProperties: { times },
    },
  };
}

/** Default track name: "Track 2026-08-29 14:05" in the device's local time. */
export function defaultTrackName(startedAt: string): string {
  const started = new Date(startedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Track ${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(
    started.getDate(),
  )} ${pad(started.getHours())}:${pad(started.getMinutes())}`;
}
