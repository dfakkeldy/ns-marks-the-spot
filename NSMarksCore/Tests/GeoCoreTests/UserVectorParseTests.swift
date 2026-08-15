import Foundation
import Testing

@testable import GeoCore

@Suite("Reading a user's vector file")
struct UserVectorParseTests {
    private func parse(_ json: String) throws -> ParsedVector {
        try UserVectorParse.parseGeoJson(Data(json.utf8))
    }

    private func refusal(_ json: String) throws -> UserMapImportRefusal {
        do {
            _ = try parse(json)
        } catch let refusal as UserMapImportRefusal {
            return refusal
        }
        Issue.record("Expected a refusal.")
        throw CancellationError()
    }

    @Test func aFeatureCollectionComesBackWithItsFeaturesAndItsBounds() throws {
        let parsed = try parse(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63.5,44.6]},
               "properties":{"name":"Halifax"}},
              {"type":"Feature","geometry":{"type":"LineString",
               "coordinates":[[-61.0,46.0],[-60.5,46.2]]},"properties":{}}
            ]}
            """
        )
        #expect(parsed.featureCount == 2)
        let box = try #require(parsed.bbox)
        #expect(box.west == -63.5)
        #expect(box.east == -60.5)
        #expect(box.south == 44.6)
        #expect(box.north == 46.2)
        #expect(parsed.features[0].properties["name"] == .string("Halifax"))
    }

    /// Longitude first. A file read latitude-first parses without complaint and
    /// puts Nova Scotia in the Indian Ocean, so the ordering is pinned with a
    /// coordinate whose two halves cannot be confused.
    @Test func longitudeIsReadFirst() throws {
        let parsed = try parse(
            """
            {"type":"Point","coordinates":[-63.5,44.6]}
            """
        )
        let geometry = try #require(parsed.features.first?.geometry)
        guard case .point(let position) = geometry else {
            Issue.record("Expected a point.")
            return
        }
        #expect(position.lng == -63.5)
        #expect(position.lat == 44.6)
    }

    @Test func aBareGeometryAndABareFeatureAreBothAccepted() throws {
        #expect(try parse(#"{"type":"Point","coordinates":[-63,44]}"#).featureCount == 1)
        #expect(
            try parse(
                #"{"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},"properties":null}"#
            ).featureCount == 1
        )
    }

    /// Projected coordinates with no declared system. Refused rather than
    /// guessed at: picking a projection puts the user's survey somewhere
    /// plausible and wrong.
    @Test func projectedCoordinatesAreRefusedRatherThanReprojected() throws {
        let refused = try refusal(
            #"{"type":"Point","coordinates":[500000,4980000]}"#
        )
        #expect(refused.code == .invalidGeoreferencing)
        #expect(refused.userMessage.contains("WGS84"))
    }

    @Test func aDeclaredNonWgs84CrsIsRefusedAndQuotedBack() throws {
        let refused = try refusal(
            """
            {"type":"FeatureCollection","crs":{"type":"name",
             "properties":{"name":"urn:ogc:def:crs:EPSG::2961"}},"features":[]}
            """
        )
        #expect(refused.code == .unsupportedCrs)
        // The name is quoted so the user can see which system their exporter
        // wrote, which is the thing they have to change.
        #expect(refused.userMessage.contains("EPSG::2961"))
    }

    @Test(arguments: [
        "urn:ogc:def:crs:OGC:1.3:CRS84",
        "urn:ogc:def:crs:EPSG::4326",
        "EPSG:4326",
    ])
    func theCrsMembersThatStillMeanWgs84AreAccepted(_ name: String) throws {
        let parsed = try parse(
            """
            {"type":"FeatureCollection","crs":{"type":"name","properties":{"name":"\(name)"}},
             "features":[{"type":"Feature","geometry":{"type":"Point",
             "coordinates":[-63,44]},"properties":{}}]}
            """
        )
        #expect(parsed.featureCount == 1)
    }

    @Test func aFileWithNothingToDrawIsRefusedAsEmptyNotAsCorrupt() throws {
        let refused = try refusal(#"{"type":"FeatureCollection","features":[]}"#)
        #expect(refused.code == .emptyFile)
    }

    /// An attribute row with no place is legal GeoJSON, and a layer made only
    /// of those would list its features in the panel and paint nothing.
    @Test func featuresWithNoGeometryAtAllAreRefusedAsEmpty() throws {
        let refused = try refusal(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":null,"properties":{"pid":"12345"}}]}
            """
        )
        #expect(refused.code == .emptyFile)
    }

    @Test func anEmptyGeometryCollectionCountsAsNothingToDraw() throws {
        let refused = try refusal(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":{"type":"GeometryCollection","geometries":[]},
               "properties":{}}]}
            """
        )
        #expect(refused.code == .emptyFile)
    }

    /// A null-geometry row rides along when something else in the file draws:
    /// it is the user's data and an export has to give it back.
    @Test func aNullGeometryRowSurvivesBesideARealOne() throws {
        let parsed = try parse(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":null,"properties":{"pid":"1"}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},
               "properties":{}}]}
            """
        )
        #expect(parsed.featureCount == 2)
        #expect(parsed.features[0].geometry == nil)
        #expect(parsed.bbox != nil)
    }

    @Test(arguments: [
        #"{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[-63]},"properties":{}}]}"#,
        #"{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":["-63","44"]},"properties":{}}]}"#,
        #"{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Circle","coordinates":[-63,44]},"properties":{}}]}"#,
        #"{"type":"FeatureCollection","features":[{"type":"Point","coordinates":[-63,44]}]}"#,
        #"{"type":"FeatureCollection"}"#,
        "not json at all",
    ])
    func aFileThatDoesNotHoldTogetherIsRefusedAsCorrupt(_ json: String) throws {
        #expect(try refusal(json).code == .corruptFile)
    }

    @Test(arguments: [
        #"[1,2,3]"#,
        #"{"type":"Topology","objects":{}}"#,
    ])
    func jsonThatIsNotGeoJsonSaysSo(_ json: String) throws {
        #expect(try refusal(json).code == .unsupportedType)
    }

    /// The cap is a refusal, not a truncation. A silently shortened layer is a
    /// map that is missing features while claiming to be the user's file.
    @Test func tooManyFeaturesIsRefusedWithBothCountsInTheMessage() throws {
        let point = #"{"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},"properties":{}}"#
        let features = Array(repeating: point, count: UserVectorParse.maximumFeatures + 1)
        let refused = try refusal(
            #"{"type":"FeatureCollection","features":[\#(features.joined(separator: ","))]}"#
        )
        #expect(refused.code == .tooManyFeatures)
        #expect(refused.userMessage.contains(UserVectorParse.formatted(10_001)))
        #expect(refused.userMessage.contains(UserVectorParse.formatted(10_000)))
    }

    @Test func exactlyTheCapIsAccepted() throws {
        let point = #"{"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},"properties":{}}"#
        let features = Array(repeating: point, count: UserVectorParse.maximumFeatures)
        let parsed = try parse(
            #"{"type":"FeatureCollection","features":[\#(features.joined(separator: ","))]}"#
        )
        #expect(parsed.featureCount == UserVectorParse.maximumFeatures)
    }

    /// Editing addresses a feature by id. Two features sharing one would let an
    /// edit to either move the other.
    @Test func everyFeatureEndsUpWithAnIdOfItsOwn() throws {
        let parsed = try parse(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","id":"a","geometry":{"type":"Point","coordinates":[-63,44]},"properties":{}},
              {"type":"Feature","id":"a","geometry":{"type":"Point","coordinates":[-63,45]},"properties":{}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63,46]},"properties":{}}]}
            """
        )
        let ids = parsed.features.compactMap(\.id)
        #expect(ids.count == 3)
        #expect(Set(ids).count == 3)
        #expect(ids[0] == "a")
    }

    /// A parcel numbered 1234 must not come back as "1234.0" in an export.
    @Test func aNumericIdKeepsItsDigits() throws {
        let parsed = try parse(
            """
            {"type":"Feature","id":1234,"geometry":{"type":"Point","coordinates":[-63,44]},
             "properties":{}}
            """
        )
        #expect(parsed.features.first?.id == "1234")
    }

    /// The properties are the user's own attribute table. This app carries
    /// them and does not interpret them, so their shapes have to survive.
    @Test func nestedPropertiesSurviveWholeAndTypesAreKept() throws {
        let parsed = try parse(
            """
            {"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},
             "properties":{"flag":true,"count":3,"nested":{"a":[1,"two",null]}}}
            """
        )
        let properties = try #require(parsed.features.first?.properties)
        #expect(properties["flag"] == .bool(true))
        #expect(properties["count"] == .number(3))
        #expect(
            properties["nested"] == .object(["a": .array([.number(1), .string("two"), .null])])
        )
    }

    @Test func aPositionsAltitudeIsKept() throws {
        let parsed = try parse(#"{"type":"Point","coordinates":[-63,44,120.5]}"#)
        guard case .point(let position)? = parsed.features.first?.geometry else {
            Issue.record("Expected a point.")
            return
        }
        #expect(position.altitude == 120.5)
    }

    /// A geometry collection's positions count towards the bounds like any
    /// other. A version of this that stopped at the collection would fit the
    /// map to part of the layer.
    @Test func nestedGeometriesCountTowardsTheBounds() throws {
        let parsed = try parse(
            """
            {"type":"Feature","geometry":{"type":"GeometryCollection","geometries":[
              {"type":"Point","coordinates":[-66.0,43.4]},
              {"type":"MultiPolygon","coordinates":[[[[-60.0,47.0],[-60.1,47.1],[-60.2,47.0],[-60.0,47.0]]]]}
            ]},"properties":{}}
            """
        )
        let box = try #require(parsed.bbox)
        #expect(box.west == -66.0)
        #expect(box.east == -60.0)
        #expect(box.south == 43.4)
        #expect(box.north == 47.1)
    }
}
