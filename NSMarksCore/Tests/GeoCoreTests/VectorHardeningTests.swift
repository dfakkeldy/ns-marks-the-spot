import Foundation
import Testing

@testable import GeoCore

@Suite("Assembling a shapefile's rings")
struct ShapefileRingNestingTests {
    /// Clockwise in a y-up system, which is what a shapefile's outer rings are.
    private func outer(
        _ west: Double, _ south: Double, _ east: Double, _ north: Double
    ) -> [GeoJsonPosition] {
        [
            GeoJsonPosition(lng: west, lat: south),
            GeoJsonPosition(lng: west, lat: north),
            GeoJsonPosition(lng: east, lat: north),
            GeoJsonPosition(lng: east, lat: south),
            GeoJsonPosition(lng: west, lat: south),
        ]
    }

    private func hole(
        _ west: Double, _ south: Double, _ east: Double, _ north: Double
    ) -> [GeoJsonPosition] {
        outer(west, south, east, north).reversed()
    }

    /// The format does not promise a hole follows its own boundary. Reading the
    /// parts positionally cuts the hole out of whichever parcel came last,
    /// which is a hole in the neighbour's land.
    @Test func aHoleBelongsToTheRingThatContainsItNotTheOneBeforeIt() throws {
        let geometry = ShapefileParse.polygon(from: [
            outer(-63, 44, -62, 45),
            outer(-61, 44, -60, 45),
            hole(-62.8, 44.2, -62.2, 44.8),
        ])
        guard case .multiPolygon(let parts)? = geometry else {
            Issue.record("Expected two polygons.")
            return
        }
        #expect(parts.count == 2)
        // The hole belongs to the first parcel, which is the one it is inside.
        #expect(parts[0].count == 2)
        #expect(parts[1].count == 1)
    }

    /// An island inside a lake inside a boundary belongs to the lake.
    @Test func aHoleGoesToTheSmallestRingThatContainsIt() throws {
        let geometry = ShapefileParse.polygon(from: [
            outer(-70, 40, -50, 50),
            outer(-63, 44, -62, 45),
            hole(-62.8, 44.2, -62.2, 44.8),
        ])
        guard case .multiPolygon(let parts)? = geometry else {
            Issue.record("Expected two polygons.")
            return
        }
        #expect(parts[0].count == 1)
        #expect(parts[1].count == 2)
    }

    /// A hole with no boundary to belong to is the user's ground either way.
    @Test func aHoleOutsideEveryRingIsDrawnAsItsOwnShape() throws {
        let geometry = ShapefileParse.polygon(from: [
            outer(-63, 44, -62, 45),
            hole(-50, 30, -49, 31),
        ])
        guard case .multiPolygon(let parts)? = geometry else {
            Issue.record("Expected two polygons.")
            return
        }
        #expect(parts.count == 2)
        #expect(parts.allSatisfy { $0.count == 1 })
    }
}

@Suite("Refusing a shape that cannot be drawn")
struct VectorGeometryValidationTests {
    private func parse(_ json: String) throws -> ParsedVector {
        try UserVectorParse.parseGeoJson(Data(json.utf8))
    }

    /// MapKit closes a ring implicitly on screen. Left open on disk, the export
    /// would then write out something the user never saw.
    @Test func anUnclosedRingIsClosedRatherThanRefused() throws {
        let parsed = try parse(
            #"{"type":"Polygon","coordinates":[[[-63,44],[-62,44],[-62,45]]]}"#
        )
        guard case .polygon(let rings)? = parsed.features.first?.geometry else {
            Issue.record("Expected a polygon.")
            return
        }
        #expect(rings[0].count == 4)
        #expect(rings[0].first == rings[0].last)
    }

    @Test func aRingWithTwoCornersIsRefusedRatherThanPadded() {
        #expect(throws: UserMapImportRefusal.self) {
            try parse(#"{"type":"Polygon","coordinates":[[[-63,44],[-62,44],[-63,44]]]}"#)
        }
    }

    @Test func aLineOfOnePositionIsRefused() {
        #expect(throws: UserMapImportRefusal.self) {
            try parse(#"{"type":"LineString","coordinates":[[-63,44]]}"#)
        }
    }

    /// A point is a point. Nothing about it can be too short.
    @Test func aPointIsNeverRefusedForItsShape() throws {
        let parsed = try parse(#"{"type":"Point","coordinates":[-63,44]}"#)
        #expect(parsed.featureCount == 1)
    }
}

@Suite("Tapping a shape at the latitude it is drawn at")
struct VectorTapGeometryTests {
    private func parse(_ json: String) throws -> ParsedVector {
        try UserVectorParse.parseGeoJson(Data(json.utf8))
    }

    private func at(_ lng: Double, _ lat: Double) -> GeoJsonPosition {
        GeoJsonPosition(lng: lng, lat: lat)
    }

    /// The stroke is drawn a few points wide. A tap that lands on the line the
    /// user aimed at must not miss because it fell just outside the fill.
    @Test func aTapOnAnAreaSEdgeSelectsIt() throws {
        let parsed = try parse(
            #"{"type":"Polygon","coordinates":[[[-63,44],[-62,44],[-62,45],[-63,45],[-63,44]]]}"#
        )
        #expect(
            VectorEdit.feature(at: at(-63.0005, 44.5), in: parsed, toleranceDegrees: 0.001) != nil
        )
        #expect(
            VectorEdit.feature(at: at(-63.05, 44.5), in: parsed, toleranceDegrees: 0.001) == nil
        )
    }

    /// The tolerance is degrees of longitude, because that is what a fingertip
    /// is on a Mercator screen. Comparing raw degrees would make the tap taller
    /// than it is wide in Nova Scotia by about half again.
    @Test func theFingerIsAsWideAsItIsTallOnScreen() throws {
        let parsed = try parse(#"{"type":"Point","coordinates":[-63,45]}"#)
        // 45° north: one degree of latitude is drawn about 1.41 times as tall
        // as one degree of longitude is wide, so a tap 0.0009° north of the
        // point is further from it on screen than the finger reaches.
        #expect(VectorEdit.feature(at: at(-63.0009, 45), in: parsed, toleranceDegrees: 0.001) != nil)
        #expect(VectorEdit.feature(at: at(-63, 45.0009), in: parsed, toleranceDegrees: 0.001) == nil)
    }
}

@Suite("Styling from an untrusted file")
struct VectorStyleHardeningTests {
    private func feature(_ properties: [String: JSONValue]) -> GeoJsonFeature {
        GeoJsonFeature(
            id: "1", geometry: .point(GeoJsonPosition(lng: -63, lat: 44)), properties: properties
        )
    }

    /// A negative width becomes a negative image size at the point renderer.
    @Test func aNonsensicalStrokeWidthFallsBackOrIsClamped() {
        let negative = VectorStyle.style(
            for: feature(["stroke-width": .number(-40)]), layerColorHex: "#d55e00"
        )
        #expect(negative.weight == 2)
        let huge = VectorStyle.style(
            for: feature(["stroke-width": .number(9999)]), layerColorHex: "#d55e00"
        )
        #expect(huge.weight == 20)
    }

    @Test func anOpacityOutsideTheRangeIsClamped() {
        let style = VectorStyle.style(
            for: feature(["stroke-opacity": .number(4), "fill-opacity": .number(-1)]),
            layerColorHex: "#d55e00"
        )
        #expect(style.strokeOpacity == 1)
        #expect(style.fillOpacity == 0)
    }

    /// A colour this reader cannot parse falls back to the layer's own, not to
    /// the renderer's diagnostic magenta: the file is written in a form this
    /// app does not read, which is not the same as broken.
    @Test func aColourInAFormThisReaderCannotParseFallsBackToTheLayerS() {
        for named in ["rebeccapurple", "rgb(1,2,3)", "#ggg", ""] {
            let style = VectorStyle.style(
                for: feature(["stroke": .string(named)]), layerColorHex: "#d55e00"
            )
            #expect(style.strokeHex == "#d55e00", "\(named) should have fallen back")
        }
    }

    @Test func aHexColourTheReaderUnderstandsIsKept() {
        let style = VectorStyle.style(
            for: feature(["stroke": .string("#0a0"), "fill": .string("#11223344")]),
            layerColorHex: "#d55e00"
        )
        #expect(style.strokeHex == "#0a0")
        #expect(style.fillHex == "#11223344")
    }
}
