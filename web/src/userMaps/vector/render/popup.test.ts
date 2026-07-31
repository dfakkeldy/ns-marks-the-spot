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
});
