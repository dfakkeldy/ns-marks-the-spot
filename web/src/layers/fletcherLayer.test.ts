import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLETCHER_TILE_REVISION,
  fletcherTileRegions,
  fletcherSheets,
  fletcherSourceReceiptUrl,
  fletcherTileUrl,
  normalizeFletcherTileBaseUrl,
} from "./fletcherLayer";

describe("direct-Rumsey Fletcher tile configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the published host unless a build explicitly overrides or disables it", () => {
    vi.stubEnv("VITE_FLETCHER_TILE_BASE_URL", undefined);
    expect(fletcherTileUrl()).toBe(
      `https://tiles.kinnokilabs.com/${FLETCHER_TILE_REVISION}/{z}/{x}/{y}.png`,
    );
    expect(fletcherSourceReceiptUrl()).toBe(
      `https://tiles.kinnokilabs.com/${FLETCHER_TILE_REVISION}/source.json`,
    );
    vi.stubEnv("VITE_FLETCHER_TILE_BASE_URL", "https://tiles.example.test/custom");
    expect(normalizeFletcherTileBaseUrl()).toBe("https://tiles.example.test/custom");
    vi.stubEnv("VITE_FLETCHER_TILE_BASE_URL", "");
    expect(fletcherTileUrl()).toBeNull();
  });

  it("pins all 24 independent sheets to one immutable revision", () => {
    expect(FLETCHER_TILE_REVISION).toBe('fletcher-full-sheets-20260913.1');
    expect(fletcherSheets).toHaveLength(24);
    expect(fletcherTileRegions).toHaveLength(1);
    expect(fletcherTileRegions[0].id).toBe('mosaic');
    expect(fletcherSheets.map(({ sheet }) => sheet)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(
      fletcherTileUrl("https://tiles.example.test/ns-marks"),
    ).toBe(
      `https://tiles.example.test/ns-marks/${FLETCHER_TILE_REVISION}/{z}/{x}/{y}.png`,
    );
    expect(
      fletcherSourceReceiptUrl("https://tiles.example.test/ns-marks"),
    ).toBe(
      `https://tiles.example.test/ns-marks/${FLETCHER_TILE_REVISION}/source.json`,
    );
  });

  it("fails closed when no tile host is configured", () => {
    expect(normalizeFletcherTileBaseUrl("  ")).toBeNull();
    expect(fletcherTileUrl(null)).toBeNull();
  });

  it("requires HTTPS except on a local development loopback", () => {
    expect(
      normalizeFletcherTileBaseUrl("https://tiles.example.test/path///"),
    ).toBe("https://tiles.example.test/path");
    expect(
      normalizeFletcherTileBaseUrl("http://localhost:8765"),
    ).toBe("http://localhost:8765");
    expect(() =>
      normalizeFletcherTileBaseUrl("http://tiles.example.test"),
    ).toThrow(/require HTTPS/);
  });

  it("rejects OldMapsOnline and URL state that could leak credentials", () => {
    expect(() =>
      normalizeFletcherTileBaseUrl("https://wmts.oldmapsonline.org/maps/test"),
    ).toThrow(/not an allowed/);
    expect(() =>
      normalizeFletcherTileBaseUrl("https://user:secret@tiles.example.test"),
    ).toThrow(/credentials or query state/);
    expect(() =>
      normalizeFletcherTileBaseUrl("https://tiles.example.test?token=secret"),
    ).toThrow(/credentials or query state/);
  });
});
