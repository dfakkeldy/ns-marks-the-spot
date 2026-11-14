import { describe, expect, it } from "vitest";
import { imageUrlForBox, tileUrl } from "./tileUrls";
import type { UserLayerRecord } from "./types";
const base = { url: "https://example.org/{z}/{x}/{y}.png", kind: "xyz", tileSize: 256 } as UserLayerRecord;
describe("user layer requests", () => {
  it("builds XYZ and flipped TMS tiles", () => {
    expect(tileUrl(base, { z: 2, x: 1, y: 0 })).toBe("https://example.org/2/1/0.png");
    expect(tileUrl({ ...base, kind: "tms" }, { z: 2, x: 1, y: 0 })).toBe("https://example.org/2/1/3.png");
  });
  it("replaces old request parameters but keeps keys", () => {
    const url = imageUrlForBox({ ...base, kind: "wms", url: "https://example.org/wms?BBOX=old&key=secret", wms: { layers: "a", styles: "", format: "image/png", version: "1.3.0", transparent: true } }, { minX: 0, minY: 1, maxX: 2, maxY: 3 }, 512, 256);
    const parsed = new URL(url); expect(parsed.searchParams.get("bbox")).toBe("0,1,2,3"); expect(parsed.searchParams.get("BBOX")).toBeNull(); expect(parsed.searchParams.get("key")).toBe("secret");
  });
});
