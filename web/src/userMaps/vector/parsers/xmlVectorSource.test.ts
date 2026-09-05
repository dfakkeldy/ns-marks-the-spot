import { describe, expect, it, vi } from "vitest";
import { UserMapImportError } from "../../errors";
import { parseXmlVector } from "./xmlVectorSource";

function expectCode(fn: () => unknown, code: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UserMapImportError);
  expect((caught as UserMapImportError).code).toBe(code);
}

describe("parseXmlVector", () => {
  it("parses an XML input only once before converting its features", () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    try {
      const parsed = parseXmlVector(
        '<kml><Placemark><Point><coordinates>-63,45</coordinates></Point></Placemark></kml>',
      );
      expect(parsed.collection.features[0].geometry).toEqual({ type: "Point", coordinates: [-63, 45] });
      expect(parse).toHaveBeenCalledTimes(1);
    } finally {
      parse.mockRestore();
    }
  });

  it("dispatches a KML document to the KML reader", () => {
    const parsed = parseXmlVector(
      '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
        "<Placemark><name>P</name><Point><coordinates>-63,45</coordinates></Point></Placemark>" +
        "</Document></kml>",
    );
    expect(parsed.featureCount).toBe(1);
    expect(parsed.source).toBe("kml");
  });

  it("dispatches a GPX document to the GPX reader", () => {
    const parsed = parseXmlVector(
      '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">' +
        '<wpt lat="45.81" lon="-61.4"><name>Gate</name></wpt></gpx>',
    );
    expect(parsed.featureCount).toBe(1);
    expect(parsed.source).toBe("gpx");
  });

  it("dispatches on the root element even without a namespace", () => {
    expect(
      parseXmlVector(
        "<kml><Document><Placemark><Point><coordinates>-63,45</coordinates></Point></Placemark></Document></kml>",
      ).source,
    ).toBe("kml");
  });

  it("refuses XML that is neither KML nor GPX as unsupported-type", () => {
    expectCode(
      () => parseXmlVector('<?xml version="1.0"?><svg><rect/></svg>'),
      "unsupported-type",
    );
  });

  it("refuses malformed XML as corrupt-file", () => {
    expectCode(() => parseXmlVector("<kml><unclosed>"), "corrupt-file");
  });
});
