import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../../errors";
import { parseKml } from "./kmlSource";

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

const PLACEMARK_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Back lot pin</name>
      <description>NE corner, found 2024</description>
      <Point><coordinates>-63.5,44.65,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

describe("parseKml", () => {
  it("parses a placemark with its name and description", () => {
    const parsed = parseKml(PLACEMARK_KML);
    expect(parsed.featureCount).toBe(1);
    const feature = parsed.collection.features[0];
    expect(feature.geometry).toMatchObject({ type: "Point" });
    expect(feature.properties?.name).toBe("Back lot pin");
    expect(feature.properties?.description).toBe("NE corner, found 2024");
    expect(parsed.bbox).toEqual([-63.5, 44.65, -63.5, 44.65]);
  });

  it("carries KML styles through as simplestyle properties", () => {
    const styled = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="red"><LineStyle><color>ff0000ff</color><width>4</width></LineStyle>
      <PolyStyle><color>7f00ff00</color></PolyStyle></Style>
    <Placemark><name>Area</name><styleUrl>#red</styleUrl>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        -63.5,44.6 -63.4,44.6 -63.4,44.7 -63.5,44.7 -63.5,44.6
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
  </Document>
</kml>`;
    const props = parseKml(styled).collection.features[0].properties ?? {};
    // togeojson emits the simplestyle vocabulary styleForFeature already reads,
    // so authored KML colours survive with no extra plumbing.
    expect(props.stroke).toBe("#ff0000");
    expect(props["stroke-width"]).toBe(4);
    expect(props.fill).toBe("#00ff00");
  });

  // togeojson hands back `{ "@type": "html", value }` for a CDATA/HTML
  // description and a bare string for a plain one. Everything downstream
  // reads string properties, so an unflattened object would make the
  // description silently disappear from popups and exports — the common case
  // for Google Earth files.
  it("keeps an HTML description as data, unparsed", () => {
    const html = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
  <name>Pin</name>
  <description><![CDATA[<b>Bold</b> <img src="x" onerror="boom()">]]></description>
  <Point><coordinates>-63,45</coordinates></Point>
</Placemark></Document></kml>`;
    const description = parseKml(html).collection.features[0].properties?.description;
    expect(typeof description).toBe("string");
    expect(description).toContain("<b>Bold</b>");
    expect(description).toContain("onerror");
  });

  it("leaves a plain-text description a plain string", () => {
    const plain = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
  <name>Pin</name><description>Just text</description>
  <Point><coordinates>-63,45</coordinates></Point>
</Placemark></Document></kml>`;
    expect(parseKml(plain).collection.features[0].properties?.description).toBe(
      "Just text",
    );
  });

  it("reads multiple placemarks and mixed geometry types", () => {
    const mixed = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>A</name><Point><coordinates>-63,45</coordinates></Point></Placemark>
  <Placemark><name>B</name><LineString><coordinates>-63,45 -62,45.5</coordinates></LineString></Placemark>
</Document></kml>`;
    const parsed = parseKml(mixed);
    expect(parsed.featureCount).toBe(2);
    expect(parsed.collection.features.map((f) => f.geometry.type)).toEqual([
      "Point",
      "LineString",
    ]);
    expect(parsed.collection.features.every((f) => typeof f.id === "string")).toBe(true);
  });

  it("refuses malformed XML as corrupt-file", () => {
    expectCode(() => parseKml("<kml><Placemark></kml>"), "corrupt-file");
  });

  it("refuses a KML with no placemarks as empty-file", () => {
    expectCode(
      () =>
        parseKml(
          '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Empty</name></Document></kml>',
        ),
      "empty-file",
    );
  });

  it("refuses coordinates outside longitude/latitude range", () => {
    expectCode(
      () =>
        parseKml(
          '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>' +
            "<Point><coordinates>500000,4980000</coordinates></Point></Placemark></Document></kml>",
        ),
      "invalid-georeferencing",
    );
  });
});
