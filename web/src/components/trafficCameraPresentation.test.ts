import { describe, expect, it } from "vitest";
import { liveConditionsLayerCatalog } from "../layers/layerCatalog";
import type { HighwayCamera } from "../data/highwayCameras";
import {
  buildCameraPopup,
  cameraImageUrl,
} from "./trafficCameraPresentation";

const layer = liveConditionsLayerCatalog.find(
  (entry) => entry.id === "highway-cameras",
);
if (layer === undefined || layer.delivery !== "bundled-points-live-images") {
  throw new Error("highway-cameras descriptor missing from the catalog");
}

const camera: HighwayCamera = {
  id: "8",
  name: "Kelly's Mountain",
  latitude: 46.2516,
  longitude: -60.5279,
};

describe("cameraImageUrl", () => {
  it("targets 511's live image endpoint with a cache-busting key", () => {
    expect(cameraImageUrl(layer, camera, 1700000000)).toBe(
      "https://511.novascotia.ca/map/Cctv/8?t=1700000000",
    );
  });

  it("URL-encodes the camera id rather than trusting it", () => {
    expect(
      cameraImageUrl(layer, { ...camera, id: "8/../9?x=1" }, 5),
    ).toBe("https://511.novascotia.ca/map/Cctv/8%2F..%2F9%3Fx%3D1?t=5");
  });
});

describe("buildCameraPopup", () => {
  it("shows the camera name, the live image, and the 511 source link", () => {
    const popup = buildCameraPopup(layer, camera, 42);
    expect(popup.querySelector("strong")?.textContent).toBe("Kelly's Mountain");
    const image = popup.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "https://511.novascotia.ca/map/Cctv/8?t=42",
    );
    expect(image?.getAttribute("alt")).toContain("Kelly's Mountain");
    const link = popup.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://511.novascotia.ca/map");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
  });

  it("treats the camera name as text, never as markup", () => {
    const hostile = {
      ...camera,
      name: '<img src=x onerror="alert(1)"><script>alert(2)</script>',
    };
    const popup = buildCameraPopup(layer, hostile, 42);
    expect(popup.querySelector("script")).toBeNull();
    // Exactly one img — the live camera frame — no matter what the name says.
    expect(popup.querySelectorAll("img")).toHaveLength(1);
    expect(popup.querySelector("strong")?.textContent).toBe(hostile.name);
  });

  it("swaps a failed image for an explicit source-error note", () => {
    const popup = buildCameraPopup(layer, camera, 42);
    const image = popup.querySelector("img");
    image?.dispatchEvent(new Event("error"));
    expect(popup.querySelector("img")).toBeNull();
    const note = popup.querySelector(".camera-popup-unavailable");
    expect(note?.textContent).toContain("source error");
    expect(note?.textContent).toContain("not information about the road");
  });
});
