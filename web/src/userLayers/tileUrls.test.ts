import { describe, expect, it } from "vitest";
import { UserTiles } from "./UserTiles";
import { imageUrlForBox, tileUrl } from "./tileUrls";
import type { UserLayerRecord } from "./types";
const base = { url: "https://example.org/{z}/{x}/{y}.png", kind: "xyz", tileSize: 256 } as UserLayerRecord;
describe("user layer requests", () => {
  it("builds XYZ and flipped TMS tiles", () => {
    expect(tileUrl(base, { z: 2, x: 1, y: 0 })).toBe("https://example.org/2/1/0.png");
    expect(tileUrl({ ...base, kind: "tms" }, { z: 2, x: 1, y: 0 })).toBe("https://example.org/2/1/3.png");
  });
  it("uses the same geographic tile grid for 512-pixel images", () => {
    const tiles = new UserTiles({ ...base, tileSize: 512 }, 1);
    expect(tiles.getTileSize().x).toBe(256);
    expect(tiles.getTileUrl({ z: 10, x: 338, y: 364 } as never)).toBe("https://example.org/10/338/364.png");
    const wms = { ...base, kind: "wms", tileSize: 512, url: "https://example.org/wms" } as UserLayerRecord;
    const url = new URL(tileUrl(wms, { z: 10, x: 338, y: 364 }));
    expect(url.searchParams.get("width")).toBe("512");
  });
  it("replaces old request parameters but keeps keys", () => {
    const url = imageUrlForBox({ ...base, kind: "wms", url: "https://example.org/wms?BBOX=old&key=secret", wms: { layers: "a", styles: "", format: "image/png", version: "1.3.0", transparent: true } }, { minX: 0, minY: 1, maxX: 2, maxY: 3 }, 512, 256);
    const parsed = new URL(url); expect(parsed.searchParams.get("bbox")).toBe("0,1,2,3"); expect(parsed.searchParams.get("BBOX")).toBeNull(); expect(parsed.searchParams.get("key")).toBe("secret");
  });
});
