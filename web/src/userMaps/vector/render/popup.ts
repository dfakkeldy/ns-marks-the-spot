import type { Feature } from "geojson";
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
  // A GPS-marked feature announces the claim its data makes about itself —
  // when it was captured and how rough the fix was — so a ±40 m mark can
  // never read as a surveyed corner. Both reserved keys must be present;
  // this labels the data's own claim, not proof of where it was made.
  const capturedAt = asText(props["nsmts:capturedAt"]);
  const accuracy = props["nsmts:accuracyM"];
  if (capturedAt && typeof accuracy === "number" && Number.isFinite(accuracy)) {
    root.append(
      textLine(
        "user-vector-popup-gps",
        `Marked from GPS on this device (±${Math.round(accuracy)} m)`,
      ),
    );
  }
  root.append(
    textLine(
      "user-vector-popup-provenance",
      record.origin.kind === "imported"
        ? `From your file ${record.origin.filename}`
        : record.origin.kind === "recorded"
          ? "Recorded on this device"
          : record.origin.kind === "photo-import"
            ? "From photos on this device"
            : "Drawn on this device",
    ),
  );
  return root;
}
