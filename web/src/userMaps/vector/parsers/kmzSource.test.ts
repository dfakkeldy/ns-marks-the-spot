import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../../errors";
import { extractKmzDocument, parseKmz } from "./kmzSource";

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

describe("extractKmzDocument", () => {
  it("prefers doc.kml at the archive root", async () => {
    const text = await extractKmzDocument(
      kmzBuffer({ "doc.kml": PLACEMARK, "other.kml": "<kml/>" }),
    );
    expect(text).toContain("Inside the archive");
  });

  it("falls back to the only .kml entry when it is not called doc.kml", async () => {
    const text = await extractKmzDocument(kmzBuffer({ "MyPlaces.kml": PLACEMARK }));
    expect(text).toContain("Inside the archive");
  });

  it("ignores nested overlay images and picks the KML", async () => {
    const text = await extractKmzDocument(
      kmzBuffer({ "files/pin.png": "not really a png", "doc.kml": PLACEMARK }),
    );
    expect(text).toContain("Inside the archive");
  });

  it("refuses an archive with no KML inside as corrupt-file", async () => {
    await expectCode(
      extractKmzDocument(kmzBuffer({ "readme.txt": "nothing here" })),
      "corrupt-file",
    );
  });

  it("refuses bytes that are not a readable archive as corrupt-file", async () => {
    const notAZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x09, 0x09, 0x09]);
    await expectCode(
      extractKmzDocument(notAZip.buffer as ArrayBuffer),
      "corrupt-file",
    );
  });
});

describe("parseKmz", () => {
  it("parses the KML inside the archive", async () => {
    const parsed = await parseKmz(kmzBuffer({ "doc.kml": PLACEMARK }));
    expect(parsed.featureCount).toBe(1);
    expect(parsed.collection.features[0].properties?.name).toBe("Inside the archive");
  });

  it("propagates the KML reader's fail-closed states", async () => {
    await expectCode(
      parseKmz(
        kmzBuffer({
          "doc.kml": '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>',
        }),
      ),
      "empty-file",
    );
  });
});
