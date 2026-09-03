import Foundation
import Testing

@testable import GeoCore

@Suite("Writing a user's layer back out")
struct VectorExportTests {
    private func parse(_ json: String) throws -> ParsedVector {
        try UserVectorParse.parseGeoJson(Data(json.utf8))
    }

    /// The map draws a WGS84 feature collection, so the export is that
    /// collection. A round trip that changed anything would mean the file the
    /// user gets back is not the layer they were looking at.
    @Test func aLayerSurvivesAGeoJsonRoundTripUnchanged() throws {
        let original = try parse(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","id":"a","geometry":{"type":"Polygon","coordinates":
                [[[-63,44],[-62,44],[-62,45],[-63,44]],[[-62.8,44.2],[-62.5,44.2],[-62.5,44.4],[-62.8,44.2]]]},
               "properties":{"pid":"40012345","area":25,"nested":{"x":[1,null,true]}}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63.5,44.6,12]},
               "properties":{}}
            ]}
            """
        )
        let exported = try VectorExport.geoJson(original)
        let reparsed = try UserVectorParse.parseGeoJson(exported)
        #expect(reparsed == original)
    }

    /// Only the value the spec declares means a vertex came off an NSPRD
    /// boundary. An imported file's own "nsmts:traced" earned the NSPRD note
    /// and the Province's attribution on export, which the Province had
    /// nothing to do with.
    @Test func onlyTheSpecsTracedValueClaimsNsprdProvenance() throws {
        let traced = try parse(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","id":"a","geometry":{"type":"Point","coordinates":[-63.5,44.6]},
               "properties":{"nsmts:traced":"nsprd-parcel"}}
            ]}
            """
        )
        #expect(VectorExport.hasTracedFeatures(traced))

        for value in ["\"manual\"", "false", "1", "null"] {
            let imported = try parse(
                """
                {"type":"FeatureCollection","features":[
                  {"type":"Feature","id":"a","geometry":{"type":"Point","coordinates":[-63.5,44.6]},
                   "properties":{"nsmts:traced":\(value)}}
                ]}
                """
            )
            #expect(!VectorExport.hasTracedFeatures(imported), "claimed for \(value)")
        }
    }

    @Test func aNullGeometryRowIsWrittenBackAsOne() throws {
        let parsed = try parse(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":null,"properties":{"pid":"1"}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},"properties":{}}]}
            """
        )
        let text = String(decoding: try VectorExport.geoJson(parsed), as: UTF8.self)
        #expect(text.contains("\"geometry\" : null"))
        let reparsed = try UserVectorParse.parseGeoJson(try VectorExport.geoJson(parsed))
        #expect(reparsed.features.count == 2)
        #expect(reparsed.features[0].geometry == nil)
    }

    @Test func theExportIsReadableRatherThanOneLongLine() throws {
        let parsed = try parse(#"{"type":"Point","coordinates":[-63,44]}"#)
        let text = String(decoding: try VectorExport.geoJson(parsed), as: UTF8.self)
        #expect(text.contains("\n"))
    }

    // MARK: - KML

    /// A KML written here has to be one this app can read back, or an export
    /// is a file that only other tools can open.
    @Test func aKmlExportComesBackThroughTheKmlReader() throws {
        let original = try parse(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63.5,44.6]},
               "properties":{"name":"Corner","description":"Iron pin"}},
              {"type":"Feature","geometry":{"type":"LineString","coordinates":[[-63,44],[-62,45]]},
               "properties":{"name":"Fence"}},
              {"type":"Feature","geometry":{"type":"Polygon","coordinates":
                [[[-63,44],[-62,44],[-62,45],[-63,44]]]},"properties":{}}
            ]}
            """
        )
        let kml = VectorExport.kml(layerName: "Woodlot", parsed: original)
        let reread = try KmlParse.parse(Data(kml.utf8))
        #expect(reread.featureCount == 3)
        #expect(reread.features[0].properties["name"] == .string("Corner"))
        #expect(reread.features[0].properties["description"] == .string("Iron pin"))
        let box = try #require(reread.bbox)
        let expected = try #require(original.bbox)
        #expect(abs(box.west - expected.west) < 1e-9)
        #expect(abs(box.north - expected.north) < 1e-9)
    }

    @Test func aPolygonsHolesSurviveTheKmlRoundTrip() throws {
        let original = try parse(
            """
            {"type":"Polygon","coordinates":
              [[[-63,44],[-62,44],[-62,45],[-63,44]],[[-62.8,44.2],[-62.5,44.2],[-62.5,44.4],[-62.8,44.2]]]}
            """
        )
        let reread = try KmlParse.parse(
            Data(VectorExport.kml(layerName: "L", parsed: original).utf8)
        )
        guard case .polygon(let rings)? = reread.features.first?.geometry else {
            Issue.record("Expected a polygon.")
            return
        }
        #expect(rings.count == 2)
        #expect(rings[0][0].lng == -63)
        #expect(rings[1][0].lng == -62.8)
    }

    /// KML has no Multi* primitives, so the parts go into a MultiGeometry.
    @Test func multiPartGeometryBecomesAMultiGeometry() throws {
        let original = try parse(
            #"{"type":"MultiLineString","coordinates":[[[-63,44],[-62,45]],[[-61,46],[-60,47]]]}"#
        )
        let kml = VectorExport.kml(layerName: "L", parsed: original)
        #expect(kml.contains("<MultiGeometry>"))
        let reread = try KmlParse.parse(Data(kml.utf8))
        guard case .collection(let parts)? = reread.features.first?.geometry else {
            Issue.record("Expected a collection.")
            return
        }
        #expect(parts.count == 2)
    }

    /// The web builds its KML through the DOM, where escaping is structural.
    /// This one builds a string, so one unescaped interpolation would produce
    /// a file that no longer parses — or one that parses into something the
    /// user never wrote.
    @Test func userTextIsEscapedRatherThanEmittedAsMarkup() throws {
        let original = try parse(
            """
            {"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},
             "properties":{"name":"A & B <tag>","description":"5 > 3 \\"quoted\\""}}
            """
        )
        let kml = VectorExport.kml(layerName: "Layer <1>", parsed: original)
        #expect(!kml.contains("<tag>"))
        #expect(kml.contains("&amp;"))
        let reread = try KmlParse.parse(Data(kml.utf8))
        // The point of escaping is that the text arrives intact on the other
        // side, not merely that the file parses.
        #expect(reread.features.first?.properties["name"] == .string("A & B <tag>"))
        #expect(
            reread.features.first?.properties["description"] == .string("5 > 3 \"quoted\"")
        )
    }

    @Test(arguments: [
        ("plain", "plain"),
        ("a<b", "a&lt;b"),
        ("a&b", "a&amp;b"),
        ("\"x\"", "&quot;x&quot;"),
        ("it's", "it&apos;s"),
    ])
    func everyMarkupCharacterIsEscaped(_ text: String, _ expected: String) {
        #expect(VectorExport.escaped(text) == expected)
    }

    /// A row with no geometry has no placemark to be. Skipped rather than
    /// written empty, which would put a nameless marker at the origin in
    /// whatever tool opens the file.
    @Test func aRowWithNoPlaceIsLeftOutOfTheKml() throws {
        let parsed = try parse(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":null,"properties":{"pid":"1"}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},"properties":{}}]}
            """
        )
        let reread = try KmlParse.parse(
            Data(VectorExport.kml(layerName: "L", parsed: parsed).utf8)
        )
        #expect(reread.featureCount == 1)
    }
}
