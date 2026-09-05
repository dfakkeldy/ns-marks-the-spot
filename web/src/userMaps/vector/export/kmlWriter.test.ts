import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection } from "geojson";
import { parseXmlVector } from "../parsers/xmlVectorSource";
import { kmlDocumentString } from "./kmlWriter";

function collection(features: FeatureCollection["features"]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

const LAYER_NAME = "Field notes";

describe("kmlDocumentString", () => {
  it("writes a placemark per feature with name and description", () => {
    const kml = kmlDocumentString(
      LAYER_NAME,
      collection([
        {
          type: "Feature",
          id: "f1",
          geometry: { type: "Point", coordinates: [-63.5, 44.65] },
          properties: { name: "Back lot pin", description: "NE corner" },
        },
      ]),
    );
    expect(kml).toContain("<name>Back lot pin</name>");
    expect(kml).toContain("<description>NE corner</description>");
    expect(kml).toContain("-63.5,44.65");
    expect(kml).toContain(`<name>${LAYER_NAME}</name>`);
  });

  it("escapes markup in user text instead of emitting it as elements", () => {
    const kml = kmlDocumentString(
      LAYER_NAME,
      collection([
        {
          type: "Feature",
          id: "f1",
          geometry: { type: "Point", coordinates: [-63, 45] },
          properties: {
            name: "Pin & <tag>",
            description: '<script>alert(1)</script>',
          },
        },
      ]),
    );
    // Structural escaping via the XML serializer: the payload must survive as
    // text, never as live markup a consuming tool would execute or mis-parse.
    expect(kml).not.toContain("<script>");
    expect(kml).toContain("&lt;script&gt;");
    expect(kml).toContain("Pin &amp; &lt;tag&gt;");
  });

  it("writes lines and polygons in KML coordinate order", () => {
    const kml = kmlDocumentString(
      LAYER_NAME,
      collection([
        {
          type: "Feature",
          id: "line",
          geometry: { type: "LineString", coordinates: [[-63, 45], [-62, 45.5]] },
          properties: {},
        },
        {
          type: "Feature",
          id: "poly",
          geometry: {
            type: "Polygon",
            coordinates: [[[-63, 44], [-62, 44], [-62, 45], [-63, 44]]],
          },
          properties: {},
        },
      ]),
    );
    expect(kml).toContain("<LineString>");
    expect(kml).toContain("<Polygon>");
    expect(kml).toContain("<outerBoundaryIs>");
    expect(kml).toContain("-63,45 -62,45.5");
  });

  it("writes multi-geometries as a MultiGeometry", () => {
    const kml = kmlDocumentString(
      LAYER_NAME,
      collection([
        {
          type: "Feature",
          id: "mp",
          geometry: { type: "MultiPoint", coordinates: [[-63, 45], [-62, 46]] },
          properties: {},
        },
      ]),
    );
    expect(kml).toContain("<MultiGeometry>");
    expect((kml.match(/<Point>/g) ?? []).length).toBe(2);
  });

  it("round-trips back through the KML reader", () => {
    const original = collection([
      {
        type: "Feature",
        id: "f1",
        geometry: { type: "Point", coordinates: [-63.5, 44.65] },
        properties: { name: "Pin", description: "A & B <c>" },
      },
      {
        type: "Feature",
        id: "f2",
        geometry: { type: "LineString", coordinates: [[-63, 45], [-62, 45.5]] },
        properties: { name: "Track" },
      },
    ]);
    const reparsed = parseXmlVector(kmlDocumentString(LAYER_NAME, original));
    expect(reparsed.featureCount).toBe(2);
    expect(reparsed.collection.features[0].properties?.name).toBe("Pin");
    expect(reparsed.collection.features[0].properties?.description).toBe("A & B <c>");
    expect(reparsed.collection.features[0].geometry).toMatchObject({
      type: "Point",
      coordinates: [-63.5, 44.65],
    });
    expect(reparsed.collection.features[1].geometry.type).toBe("LineString");
  });

  it("skips features with no geometry rather than writing an empty placemark", () => {
    const kml = kmlDocumentString(
      LAYER_NAME,
      collection([
        // A null geometry is legal GeoJSON (RFC 7946 §3.2) but has no KML
        // representation, so the writer must drop it rather than emit an
        // empty Placemark a consuming tool would choke on.
        {
          type: "Feature",
          id: "none",
          geometry: null as unknown as NonNullable<Feature["geometry"]>,
          properties: { name: "Nothing" },
        },
        {
          type: "Feature",
          id: "pt",
          geometry: { type: "Point", coordinates: [-63, 45] },
          properties: { name: "Something" },
        },
      ]),
    );
    expect((kml.match(/<Placemark>/g) ?? []).length).toBe(1);
    expect(kml).toContain("Something");
  });
});

describe("traced provenance", () => {
  it("writes the note into the Document description when a feature was traced", () => {
    const kml = kmlDocumentString("Traced", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "traced",
          geometry: {
            type: "LineString",
            coordinates: [
              [-61, 46],
              [-61, 46.001],
            ],
          },
          properties: { "nsmts:traced": "nsprd-parcel" },
        },
      ],
    });
    expect(kml).toContain("Traced boundaries are not a survey.");
    expect(kml).toContain("Province of Nova Scotia");
  });

  it("writes no note for an untraced layer", () => {
    const kml = kmlDocumentString("Plain", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "plain",
          geometry: { type: "Point", coordinates: [-61, 46] },
          properties: {},
        },
      ],
    });
    expect(kml).not.toContain("not a survey");
  });
});

describe("ExtendedData", () => {
  const attributed: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "f1",
        geometry: { type: "Point", coordinates: [-61, 46] },
        properties: {
          name: "Stand A",
          description: "Thinned 2024",
          species: "red spruce",
          "stand-age": 45,
          verified: true,
          metadata: { crew: "A" },
          skipped: null,
          coordinateProperties: { times: ["2026-08-30T00:00:00.000Z"] },
          "nsmts:traced": "nsprd-parcel",
          "nsmts:photos": [{ id: "p1" }],
        },
      },
    ],
  };

  it("writes every carried property once, string-typed, with escaping", () => {
    const kml = kmlDocumentString("Stands", attributed);
    expect(kml).toContain('<Data name="species"><value>red spruce</value></Data>');
    expect(kml).toContain('<Data name="stand-age"><value>45</value></Data>');
    expect(kml).toContain('<Data name="verified"><value>true</value></Data>');
    // Objects ride as JSON text; GeoJSON stays the type-faithful format.
    expect(kml).toContain('<Data name="metadata"><value>{"crew":"A"}</value></Data>');
    // Provenance survives a KML round trip.
    expect(kml).toContain('<Data name="nsmts:traced"><value>nsprd-parcel</value></Data>');
    // name/description have their own KML homes; times are GPX/GeoJSON-only;
    // photo references never dangle in a plain KML; nulls are skipped.
    expect(kml).not.toContain('<Data name="name"');
    expect(kml).not.toContain('<Data name="description"');
    expect(kml).not.toContain("coordinateProperties");
    expect(kml).not.toContain("nsmts:photos");
    expect(kml).not.toContain('<Data name="skipped"');
  });

  it("omits ExtendedData entirely when nothing carries", () => {
    const kml = kmlDocumentString("Plain", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "f1",
          geometry: { type: "Point", coordinates: [-61, 46] },
          properties: { name: "Gate" },
        },
      ],
    });
    expect(kml).not.toContain("ExtendedData");
  });

  it("keeps markup in values structural, and round-trips through togeojson", async () => {
    const kml = kmlDocumentString("Escapes", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "f1",
          geometry: { type: "Point", coordinates: [-61, 46] },
          properties: { note: '<script>bad()</script>' },
        },
      ],
    });
    expect(kml).not.toContain("<script>");

    const { kml: parseKml } = await import("@tmcw/togeojson");
    const parsed = parseKml(
      new DOMParser().parseFromString(kml, "text/xml"),
    );
    expect(parsed.features[0].properties?.note).toBe("<script>bad()</script>");
  });
});
