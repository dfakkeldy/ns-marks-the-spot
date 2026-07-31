import { describe, expect, it } from "vitest";
import {
  boundsForFrameRect,
  DEFAULT_FRAME_STATE,
  frameScreenRect,
  MAX_FRAME_SCALE,
  MIN_FRAME_SCALE,
  scaleAfterResizeDrag,
} from "./frameGeometry";
import { mapFrameAspect } from "./templates/types";
import { pdfTemplates } from "./templates/index";

const container = { width: 1200, height: 800 };

describe("frameScreenRect", () => {
  it("centres a frame of the requested aspect at offset zero", () => {
    const aspect = mapFrameAspect(pdfTemplates.landscape); // 1.696…
    const rect = frameScreenRect(container, aspect, {
      ...DEFAULT_FRAME_STATE, scale: 0.5, offsetX: 0, offsetY: 0,
    });
    expect(rect.width / rect.height).toBeCloseTo(aspect, 5);
    expect(rect.x + rect.width / 2).toBeCloseTo(600, 5);
    expect(rect.y + rect.height / 2).toBeCloseTo(400, 5);
  });

  it("clamps the frame inside the container", () => {
    const rect = frameScreenRect(container, 1.7, {
      ...DEFAULT_FRAME_STATE, scale: 0.9, offsetX: 5000, offsetY: -5000,
    });
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(container.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(container.height);
  });
});

describe("boundsForFrameRect", () => {
  const center = { lat: 46.1, lng: -61.25 };

  it("keeps the frame centre on the map centre", () => {
    const rect = { x: 400, y: 250, width: 400, height: 300 };
    const bounds = boundsForFrameRect(rect, container, center, 12);
    expect((bounds.north + bounds.south) / 2).toBeCloseTo(center.lat, 4);
    expect((bounds.east + bounds.west) / 2).toBeCloseTo(center.lng, 6);
    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
  });

  it("matches Leaflet's zoom scale — the whole world is 256 px at z0", () => {
    const rect = { x: 0, y: 336, width: 256, height: 128 };
    const bounds = boundsForFrameRect(
      rect, { width: 256, height: 800 }, { lat: 0, lng: 0 }, 0,
    );
    expect(bounds.west).toBeCloseTo(-180, 4);
    expect(bounds.east).toBeCloseTo(180, 4);
  });
});

describe("scaleAfterResizeDrag", () => {
  it("grows the frame on a downward drag", () => {
    const next = scaleAfterResizeDrag(0.5, 80, 800);
    expect(next).toBeCloseTo(0.6, 5);
  });

  it("shrinks the frame on an upward drag", () => {
    const next = scaleAfterResizeDrag(0.5, -80, 800);
    expect(next).toBeCloseTo(0.4, 5);
  });

  it("clamps to MAX_FRAME_SCALE on a large downward drag", () => {
    const next = scaleAfterResizeDrag(0.5, 8000, 800);
    expect(next).toBe(MAX_FRAME_SCALE);
  });

  it("clamps to MIN_FRAME_SCALE on a large upward drag", () => {
    const next = scaleAfterResizeDrag(0.5, -8000, 800);
    expect(next).toBe(MIN_FRAME_SCALE);
  });
});
