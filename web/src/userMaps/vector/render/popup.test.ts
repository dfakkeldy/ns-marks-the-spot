import { describe, expect, it } from "vitest";
import type { Feature } from "geojson";
import type { UserVectorLayerRecord } from "../types";
import { buildFeaturePopup } from "./popup";

function record(overrides: Partial<UserVectorLayerRecord> = {}): UserVectorLayerRecord {
  return {
    id: "layer-1",
    name: "Camps",
    source: "geojson",
    origin: {
      kind: "imported",
      filename: "camps.geojson",
      importedAt: "2026-07-30T00:00:00.000Z",
    },
    createdAt: "2026-07-30T00:00:00.000Z",
    revision: 0,
    style: { color: "#d55e00" },
    featureCount: 1,
    bbox: null,
    ...overrides,
  };
}

function feature(properties: Record<string, unknown> | null): Feature {
  return {
    type: "Feature",
    id: "f1",
    geometry: { type: "Point", coordinates: [-63, 45] },
    properties,
  };
}

describe("buildFeaturePopup", () => {
  it("shows the feature name, description, and file provenance", () => {
    const popup = buildFeaturePopup(
      feature({ name: "Back lot pin", description: "NE corner, found 2024" }),
      record(),
    );
    expect(popup.textContent).toContain("Back lot pin");
    expect(popup.textContent).toContain("NE corner, found 2024");
    expect(popup.textContent).toContain("camps.geojson");
  });

  it("renders HTML-bearing descriptions as text, never as elements", () => {
    const popup = buildFeaturePopup(
      feature({
        name: "<b>bold?</b>",
        description: '<img src=x onerror="window.__pwned=true"><script>bad()</script>',
      }),
      record(),
    );
    expect(popup.querySelector("img")).toBeNull();
    expect(popup.querySelector("script")).toBeNull();
    expect(popup.querySelector("b")).toBeNull();
    expect(popup.textContent).toContain("<img src=x");
    expect(popup.textContent).toContain("<b>bold?</b>");
  });

  it("falls back to the layer name when the feature is unnamed", () => {
    const popup = buildFeaturePopup(feature(null), record());
    expect(popup.textContent).toContain("Camps");
  });

  it("labels drawn layers as drawn on this device", () => {
    const popup = buildFeaturePopup(
      feature({ name: "Sketch" }),
      record({
        source: "drawn",
        origin: { kind: "drawn", createdAt: "2026-07-30T00:00:00.000Z" },
      }),
    );
    expect(popup.textContent).toMatch(/drawn on this device/i);
  });

  it("labels recorded layers as recorded on this device", () => {
    const popup = buildFeaturePopup(
      feature({ name: "Walk" }),
      record({
        source: "recorded",
        origin: {
          kind: "recorded",
          startedAt: "2026-08-28T14:00:00.000Z",
          endedAt: "2026-08-28T14:20:00.000Z",
        },
      }),
    );
    expect(popup.textContent).toMatch(/recorded on this device/i);
  });

  it("announces GPS capture with rounded accuracy when both reserved keys are present", () => {
    const popup = buildFeaturePopup(
      feature({
        name: "Corner post",
        "nsmts:capturedAt": "2026-08-28T14:05:00.000Z",
        "nsmts:accuracyM": 7.4,
      }),
      record(),
    );
    expect(popup.textContent).toContain(
      "Marked from GPS on this device (±7 m)",
    );
  });

  it("stays silent about GPS when either reserved key is missing or malformed", () => {
    const timeOnly = buildFeaturePopup(
      feature({ "nsmts:capturedAt": "2026-08-28T14:05:00.000Z" }),
      record(),
    );
    expect(timeOnly.textContent).not.toContain("Marked from GPS");

    const stringAccuracy = buildFeaturePopup(
      feature({
        "nsmts:capturedAt": "2026-08-28T14:05:00.000Z",
        "nsmts:accuracyM": "7",
      }),
      record(),
    );
    expect(stringAccuracy.textContent).not.toContain("Marked from GPS");
  });
});

describe("photo thumbnails", () => {
  it("renders a labelled button per descriptor, opening the lightbox", async () => {
    const opened: unknown[] = [];
    const popup = buildFeaturePopup(
      feature({
        name: "Gate",
        "nsmts:photos": [
          { id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 },
          { id: "p2", width: 10, height: 10 },
        ],
      }),
      record(),
      {
        loadThumbUrl: async () => "blob:fake",
        onOpen: (descriptor) => opened.push(descriptor),
      },
    );
    const buttons = popup.querySelectorAll(".user-vector-popup-photo");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute("aria-label")).toBe(
      "Open photo 1 of 2: IMG_1.jpg",
    );
    (buttons[1] as HTMLButtonElement).click();
    expect(opened).toEqual([{ id: "p2", width: 10, height: 10 }]);
  });

  it("shows nothing photo-shaped without the ui hooks or for malformed descriptors", () => {
    const withoutHooks = buildFeaturePopup(
      feature({ "nsmts:photos": [{ id: "p1" }] }),
      record(),
    );
    expect(withoutHooks.querySelector(".user-vector-popup-photos")).toBeNull();

    const malformed = buildFeaturePopup(
      feature({ "nsmts:photos": [{ id: 42 }] }),
      record(),
      { loadThumbUrl: async () => null, onOpen: () => {} },
    );
    expect(malformed.querySelector(".user-vector-popup-photos")).toBeNull();
  });
});
