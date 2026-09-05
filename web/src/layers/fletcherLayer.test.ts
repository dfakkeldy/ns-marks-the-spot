import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLETCHER_TILE_REVISION,
  fletcherSheets,
  fletcherSourceReceiptUrl,
  fletcherTileUrl,
  normalizeFletcherTileBaseUrl,
} from "./fletcherLayer";

describe("direct-Rumsey Fletcher tile configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the published host unless a build explicitly overrides or disables it", () => {
    vi.stubEnv("VITE_FLETCHER_TILE_BASE_URL", undefined);
    expect(fletcherTileUrl(1)).toBe(
      `https://tiles.kinnokilabs.com/${FLETCHER_TILE_REVISION}/sheet-01/{z}/{x}/{y}.png`,
    );
    expect(fletcherSourceReceiptUrl()).toBe(
      `https://tiles.kinnokilabs.com/${FLETCHER_TILE_REVISION}/source.json`,
    );
    vi.stubEnv("VITE_FLETCHER_TILE_BASE_URL", "https://tiles.example.test/custom");
    expect(normalizeFletcherTileBaseUrl()).toBe("https://tiles.example.test/custom");
    vi.stubEnv("VITE_FLETCHER_TILE_BASE_URL", "");
    expect(fletcherTileUrl(1)).toBeNull();
  });

  it("pins all 24 independent sheets to one immutable revision", () => {
    expect(fletcherSheets).toHaveLength(24);
    expect(fletcherSheets.map(({ sheet }) => sheet)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(
      fletcherTileUrl(3, "https://tiles.example.test/ns-marks"),
    ).toBe(
      `https://tiles.example.test/ns-marks/${FLETCHER_TILE_REVISION}/sheet-03/{z}/{x}/{y}.png`,
    );
    expect(
      fletcherSourceReceiptUrl("https://tiles.example.test/ns-marks"),
    ).toBe(
      `https://tiles.example.test/ns-marks/${FLETCHER_TILE_REVISION}/source.json`,
    );
  });

  it("fails closed when no tile host is configured", () => {
    expect(normalizeFletcherTileBaseUrl("  ")).toBeNull();
    expect(fletcherTileUrl(1, null)).toBeNull();
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
