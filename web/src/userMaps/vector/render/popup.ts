import type { Feature } from "geojson";
import { formatAccuracyM } from "../../../location/markFix";
import {
  readPhotoDescriptors,
  type FeaturePhotoDescriptor,
} from "../photos/types";
import type { UserVectorLayerRecord } from "../types";

/** How a popup reaches photo bytes and the lightbox; optional by design. */
export type PopupPhotoUi = {
  loadThumbUrl: (photoId: string) => Promise<string | null>;
  onOpen: (descriptor: FeaturePhotoDescriptor) => void;
};

function textLine(className: string, text: string): HTMLElement {
  const line = document.createElement("div");
  line.className = className;
  // textContent, never innerHTML: KML descriptions routinely carry HTML, and
  // a user-loaded file must not be able to run script or inject markup into
  // the app. This is the single place feature attributes become DOM.
  line.textContent = text;
  return line;
}

/**
 * Whether a stored capture time is an instant this app will repeat.
 *
 * `Date.parse` alone is far too generous — it reads "2026" as a January
 * morning — and the line built from this asserts that a device fixed a
 * position at a moment. A shorthand, a calendar that does not exist, or a
 * time that has not happened yet is not that moment, so the claim is left
 * unmade rather than dressed up.
 */
function isCaptureInstant(value: string | null): value is string {
  if (value === null) {
    return false;
  }
  const shape =
    /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.exec(
      value,
    );
  if (!shape) {
    return false;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || parsed > Date.now()) {
    return false;
  }
  // "2026-02-30" parses: the engine rolls it into March. A day that never
  // existed is not a moment a device fixed anything at, so the written date
  // is checked against the calendar on its own — not against the instant,
  // whose UTC day legitimately differs from the written one under an offset.
  const [, year, month, day] = shape;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    calendar.getUTCFullYear() === Number(year) &&
    calendar.getUTCMonth() + 1 === Number(month) &&
    calendar.getUTCDate() === Number(day)
  );
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Popup for one user vector feature: name, optional description, and a
 * provenance line so user-loaded material always announces itself and is
 * never mistaken for an official layer.
 */
export function buildFeaturePopup(
  feature: Feature,
  record: UserVectorLayerRecord,
  photoUi?: PopupPhotoUi,
): HTMLElement {
  const props: Record<string, unknown> =
    feature.properties && typeof feature.properties === "object"
      ? (feature.properties as Record<string, unknown>)
      : {};
  const root = document.createElement("div");
  root.className = "user-vector-popup";
  root.append(
    textLine("user-vector-popup-name", asText(props.name) ?? record.name),
  );
  const description = asText(props.description);
  if (description) {
    root.append(textLine("user-vector-popup-description", description));
  }
  const descriptors = readPhotoDescriptors(props);
  if (photoUi && descriptors.length > 0) {
    const strip = document.createElement("div");
    strip.className = "user-vector-popup-photos";
    descriptors.forEach((descriptor, index) => {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "user-vector-popup-photo";
      open.setAttribute(
        "aria-label",
        `Open photo ${index + 1} of ${descriptors.length}${
          descriptor.sourceName ? `: ${descriptor.sourceName}` : ""
        }`,
      );
      // Placeholder immediately; the thumbnail swaps in when its blob
      // loads. alt/aria text flows through attributes, never markup.
      open.textContent = "…";
      open.addEventListener("click", () => photoUi.onOpen(descriptor));
      void photoUi.loadThumbUrl(descriptor.id).then((url) => {
        if (!url || !open.isConnected) {
          return;
        }
        const img = document.createElement("img");
        img.src = url;
        img.alt = descriptor.sourceName ?? `Photo ${index + 1}`;
        open.replaceChildren(img);
      });
      strip.append(open);
    });
    root.append(strip);
  }
  // A marked feature announces the claim its data makes about itself — when
  // it was captured and how rough the fix was — so a ±40 m mark can never
  // read as a surveyed corner. Both reserved keys must be present; this
  // labels the data's own claim, not proof of where it was made.
  //
  // "From this device's location", not "from GPS": the Geolocation API names
  // no source, and the same call answers from a satellite fix, a Wi-Fi
  // lookup or an IP estimate. Naming the sensor would be a claim the
  // browser never made.
  //
  // A radius must be a radius and a capture time must name a moment: an
  // imported file may carry `-1` or `"unknown"` under these keys, and a line
  // reading "±? m" would be this app asserting a claim the data cannot make.
  const capturedAt = asText(props["nsmts:capturedAt"]);
  const accuracy = props["nsmts:accuracyM"];
  const claimsAFix =
    // A mark is a Point. The reserved keys on a line or an area came from
    // somewhere else, and this app will not read them as a fix.
    feature.geometry?.type === "Point" &&
    isCaptureInstant(capturedAt) &&
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy >= 0;
  if (claimsAFix) {
    root.append(
      textLine(
        "user-vector-popup-gps",
        // "This device" only for a layer made here. An imported file's mark
        // was somebody else's device, and this app cannot say whose.
        record.origin.kind === "imported"
          ? `Marked from a device's location (±${formatAccuracyM(accuracy)} m)`
          : `Marked from this device's location (±${formatAccuracyM(accuracy)} m)`,
      ),
    );
  }
  root.append(
    textLine(
      "user-vector-popup-provenance",
      record.origin.kind === "imported"
        ? `From your file ${record.origin.filename}`
        : record.origin.kind === "recorded"
          ? record.origin.interrupted
            ? "Recorded on this device — interrupted, so it may be cut short"
            : "Recorded on this device"
          : record.origin.kind === "photo-import"
            ? "From photos on this device"
            : "Drawn on this device",
    ),
  );
  return root;
}
