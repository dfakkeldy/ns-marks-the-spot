import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../../errors";
import { classifyArchive, parseKmzWithAssets } from "./kmzSource";

const PLACEMARK = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
  <name>Inside the archive</name>
  <Point><coordinates>-63.5,44.65</coordinates></Point>
</Placemark></Document></kml>`;

function kmzBuffer(entries: Record<string, string>): ArrayBuffer {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])),
  );
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UserMapImportError);
  expect((caught as UserMapImportError).code).toBe(code);
}

describe("parseKmzWithAssets", () => {
  it("prefers doc.kml at the archive root", async () => {
    const { parsed } = await parseKmzWithAssets(
      kmzBuffer({ "doc.kml": PLACEMARK, "other.kml": "<kml/>" }),
    );
    expect(parsed.collection.features[0].properties?.name).toBe("Inside the archive");
  });

  it("falls back to the only .kml entry when it is not called doc.kml", async () => {
    const { parsed } = await parseKmzWithAssets(kmzBuffer({ "MyPlaces.kml": PLACEMARK }));
    expect(parsed.collection.features[0].properties?.name).toBe("Inside the archive");
  });

  it("retains nested assets with case-insensitive keys", async () => {
    const { parsed, assets } = await parseKmzWithAssets(
      kmzBuffer({ "Files/Pin.png": "image bytes", "doc.kml": PLACEMARK }),
    );
    expect(Array.from(assets.get("files/pin.png") ?? [])).toEqual(Array.from(strToU8("image bytes")));
    expect(assets.has("doc.kml")).toBe(false);
    expect(parsed.collection.features[0].properties?.name).toBe("Inside the archive");
  });

  it("refuses an archive with no KML inside as corrupt-file", async () => {
    await expectCode(
      parseKmzWithAssets(kmzBuffer({ "readme.txt": "nothing here" })),
      "corrupt-file",
    );
  });

  it("refuses bytes that are not a readable archive as corrupt-file", async () => {
    const notAZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x09, 0x09, 0x09]);
    await expectCode(
      parseKmzWithAssets(notAZip.buffer as ArrayBuffer),
      "corrupt-file",
    );
  });
});

describe("KMZ content", () => {
  it("parses the KML inside the archive", async () => {
    const { parsed } = await parseKmzWithAssets(kmzBuffer({ "doc.kml": PLACEMARK }));
    expect(parsed.featureCount).toBe(1);
    expect(parsed.collection.features[0].properties?.name).toBe("Inside the archive");
  });

  it("propagates the KML reader's fail-closed states", async () => {
    await expectCode(
      parseKmzWithAssets(
        kmzBuffer({
          "doc.kml": '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>',
        }),
      ),
      "empty-file",
    );
  });
});


describe("archive classification", () => {
  it("reads entry names without inflating damaged file contents", async () => {
    const buffer = kmzBuffer({ "doc.kml": PLACEMARK });
    const header = new DataView(buffer);
    expect(header.getUint16(8, true)).toBe(8); // DEFLATE
    const dataStart = 30 + header.getUint16(26, true) + header.getUint16(28, true);
    // Reserved DEFLATE block type: directory metadata stays intact, but
    // trying to inflate the payload must fail.
    new Uint8Array(buffer)[dataStart] = 7;
    expect(await classifyArchive(buffer)).toBe("kmz");
    await expectCode(parseKmzWithAssets(buffer), "corrupt-file");
  });

  it("classifies shapefile and unrecognized entries, including unreadable archives", async () => {
    expect(await classifyArchive(kmzBuffer({ "parcel.shp": "shape bytes" }))).toBe("shapefile");
    expect(await classifyArchive(kmzBuffer({ "readme.txt": "notes" }))).toBe("unknown-zip");
    expect(await classifyArchive(new Uint8Array([80, 75, 3, 4]).buffer)).toBe("unknown-zip");
  });
});
