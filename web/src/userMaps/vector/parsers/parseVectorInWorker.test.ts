import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../../errors";
import { parseGeoJsonAuto } from "./parseVectorInWorker";

function buffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(0, bytes.byteLength) as ArrayBuffer;
}

describe("parseGeoJsonAuto (main-thread fallback under jsdom)", () => {
  it("parses GeoJSON bytes into a collection", async () => {
    const parsed = await parseGeoJsonAuto(
      buffer(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "Point", coordinates: [-63, 45] }, properties: {} },
          ],
        }),
      ),
    );
    expect(parsed.featureCount).toBe(1);
  });

  it("decodes a UTF-8 BOM without breaking JSON.parse", async () => {
    const withBom = new Uint8Array([
      0xef, 0xbb, 0xbf,
      ...new TextEncoder().encode(
        JSON.stringify({
          type: "Feature",
          geometry: { type: "Point", coordinates: [-63, 45] },
          properties: {},
        }),
      ),
    ]);
    const parsed = await parseGeoJsonAuto(withBom.buffer as ArrayBuffer);
    expect(parsed.featureCount).toBe(1);
  });

  it("rejects with the parser's UserMapImportError", async () => {
    await expect(parseGeoJsonAuto(buffer("{broken"))).rejects.toMatchObject({
      name: "UserMapImportError",
      code: "corrupt-file",
    });
    await expect(parseGeoJsonAuto(buffer("{broken"))).rejects.toBeInstanceOf(
      UserMapImportError,
    );
  });
});
