import Foundation
import Testing

@testable import GeoCore

@Suite("Drawing a shape")
struct VectorDraftTests {
    private func position(_ lng: Double, _ lat: Double) -> GeoJsonPosition {
        GeoJsonPosition(lng: lng, lat: lat)
    }

    @Test(arguments: [
        (VectorEditShape.point, 1),
        (VectorEditShape.line, 2),
        (VectorEditShape.area, 3),
    ])
    func aShapeIsNotFinishableUntilItHasEnoughPositions(
        _ shape: VectorEditShape, _ needed: Int
    ) {
        var draft = VectorDraft(shape: shape)
        for index in 1..<needed {
            draft.append(position(Double(-63 + index), 44))
            #expect(!draft.canFinish)
            #expect(draft.geometry() == nil)
        }
        draft.append(position(-60, 46))
        #expect(draft.canFinish)
        #expect(draft.geometry() != nil)
    }

    /// A second tap in point mode moves the marker. Appending would leave a
    /// second one under the first, which the user cannot see and cannot undo.
    @Test func tappingAgainMovesAPointRatherThanAddingOne() {
        var draft = VectorDraft(shape: .point)
        draft.append(position(-63, 44))
        draft.append(position(-62, 45))
        #expect(draft.vertices.count == 1)
        #expect(draft.geometry() == .point(position(-62, 45)))
    }

    /// An unclosed ring is valid-looking GeoJSON that other tools draw as a
    /// line, so a parcel the user traced would leave this app as an open path.
    @Test func anAreaClosesItsOwnRing() {
        var draft = VectorDraft(shape: .area)
        draft.append(position(-63, 44))
        draft.append(position(-62, 44))
        draft.append(position(-62, 45))
        guard case .polygon(let rings)? = draft.geometry() else {
            Issue.record("Expected a polygon.")
            return
        }
        #expect(rings[0].count == 4)
        #expect(rings[0].first == rings[0].last)
    }

    @Test func removingTheLastVertexIsSafeOnAnEmptyDraft() {
        var draft = VectorDraft(shape: .line)
        draft.removeLastVertex()
        #expect(draft.vertices.isEmpty)
    }
}

@Suite("Editing a user's layer")
struct VectorEditTests {
    private func position(_ lng: Double, _ lat: Double) -> GeoJsonPosition {
        GeoJsonPosition(lng: lng, lat: lat)
    }

    private func layer(_ json: String) throws -> ParsedVector {
        try UserVectorParse.parseGeoJson(Data(json.utf8))
    }

    private var square: ParsedVector {
        get throws {
            try layer(
                """
                {"type":"Feature","geometry":{"type":"Polygon","coordinates":
                  [[[-63,44],[-62,44],[-62,45],[-63,45],[-63,44]]]},
                 "properties":{"pid":"40012345"}}
                """
            )
        }
    }

    @Test func addingAFeatureExtendsTheLayerAndItsExtent() throws {
        let edited = VectorEdit.adding(.point(position(-61, 46)), to: try square)
        #expect(edited.featureCount == 2)
        let box = try #require(edited.bbox)
        #expect(box.north == 46)
        #expect(box.east == -61)
    }

    /// An id that collided would make the edit panel address two features at
    /// once — renaming one and deleting the other.
    @Test func aDrawnFeatureNeverReusesAnIdTheLayerAlreadyHas() throws {
        var parsed = try layer(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","id":"drawn-2","geometry":{"type":"Point","coordinates":[-63,44]},
               "properties":{}}]}
            """
        )
        parsed = VectorEdit.adding(.point(position(-62, 45)), to: parsed)
        let ids = parsed.features.compactMap(\.id)
        #expect(Set(ids).count == ids.count)
    }

    /// A shapefile's attribute table is the user's evidence. An edit that
    /// rewrote the properties wholesale would drop it without saying so.
    @Test func namingAFeatureLeavesItsOtherPropertiesAlone() throws {
        let id = try #require(try square.features.first?.id)
        let edited = VectorEdit.updating(
            featureID: id, name: "North lot", description: nil, in: try square
        )
        let properties = try #require(edited.features.first?.properties)
        #expect(properties["name"] == .string("North lot"))
        #expect(properties["pid"] == .string("40012345"))
        // Cleared rather than stored empty: an empty description would title a
        // callout with a blank line.
        #expect(properties["description"] == nil)
    }

    @Test func removingAFeatureShrinksTheExtentToWhatIsLeft() throws {
        var parsed = VectorEdit.adding(.point(position(-55, 50)), to: try square)
        let drawn = try #require(parsed.features.last?.id)
        parsed = VectorEdit.removing(featureID: drawn, from: parsed)
        #expect(parsed.featureCount == 1)
        let box = try #require(parsed.bbox)
        #expect(box.north == 45)
        #expect(box.east == -62)
    }

    /// Removing everything is a layer with nothing in it, not an error: the
    /// user emptied it on purpose, and refusing would leave the deletions
    /// unsaved.
    @Test func aLayerEmptiedByHandIsStillALayer() throws {
        var parsed = try square
        for id in parsed.features.compactMap(\.id) {
            parsed = VectorEdit.removing(featureID: id, from: parsed)
        }
        #expect(parsed.featureCount == 0)
        #expect(parsed.bbox == nil)
    }

    /// A closed ring's first and last position are the same vertex. Move one
    /// and leave the other, and the polygon tears open.
    @Test func draggingTheClosingVertexMovesBothCopiesOfIt() throws {
        let id = try #require(try square.features.first?.id)
        let edited = VectorEdit.moving(
            featureID: id, ring: 0, vertex: 0, to: position(-64, 43), in: try square
        )
        guard case .polygon(let rings)? = edited.features.first?.geometry else {
            Issue.record("Expected a polygon.")
            return
        }
        #expect(rings[0].first == position(-64, 43))
        #expect(rings[0].last == rings[0].first)
    }

    @Test func draggingTheLastVertexOfAClosedRingMovesTheFirstToo() throws {
        let id = try #require(try square.features.first?.id)
        let edited = VectorEdit.moving(
            featureID: id, ring: 0, vertex: 4, to: position(-64, 43), in: try square
        )
        guard case .polygon(let rings)? = edited.features.first?.geometry else {
            Issue.record("Expected a polygon.")
            return
        }
        #expect(rings[0].first == position(-64, 43))
        #expect(rings[0].last == position(-64, 43))
    }

    @Test func aVertexIndexThatIsNotThereChangesNothing() throws {
        let id = try #require(try square.features.first?.id)
        let edited = VectorEdit.moving(
            featureID: id, ring: 0, vertex: 99, to: position(0, 0), in: try square
        )
        #expect(edited.features == (try square).features)
    }

    /// A ring index counts through the whole feature, so the second part of a
    /// multi-part shape is reachable and the first is not disturbed reaching
    /// it. Coastline lots arrive as multi-polygons; their owner has to be able
    /// to correct one.
    @Test func aVertexInASecondPartMovesAndTheFirstPartStays() throws {
        let parsed = try layer(
            #"{"type":"MultiLineString","coordinates":[[[-63,44],[-62,45]],[[-61,46],[-60,47]]]}"#
        )
        let id = try #require(parsed.features.first?.id)
        let edited = VectorEdit.moving(
            featureID: id, ring: 1, vertex: 0, to: position(-61.5, 46.5), in: parsed
        )
        guard case .multiLineString(let lines)? = edited.features.first?.geometry else {
            Issue.record("Expected a multi-line.")
            return
        }
        #expect(lines[0] == [position(-63, 44), position(-62, 45)])
        #expect(lines[1] == [position(-61.5, 46.5), position(-60, 47)])
    }

    /// The rings of a multi-polygon's second part follow the first part's,
    /// hole and all, so a hole in part two has one index like any other ring.
    @Test func ringsOfEveryPartAreCountedInOrder() throws {
        let parsed = try layer(
            """
            {"type":"MultiPolygon","coordinates":
              [[[[-63,44],[-62,44],[-62,45],[-63,44]],
                [[-62.8,44.2],[-62.6,44.2],[-62.6,44.4],[-62.8,44.2]]],
               [[[-61,46],[-60,46],[-60,47],[-61,46]]]]}
            """
        )
        let geometry = try #require(parsed.features.first?.geometry)
        #expect(VectorEdit.rings(of: geometry).count == 3)

        let id = try #require(parsed.features.first?.id)
        let edited = VectorEdit.moving(
            featureID: id, ring: 2, vertex: 0, to: position(-61.5, 46.5), in: parsed
        )
        guard case .multiPolygon(let parts)? = edited.features.first?.geometry else {
            Issue.record("Expected a multi-polygon.")
            return
        }
        // The hole in part one is untouched, and part two's ring closes on its
        // moved corner rather than tearing open.
        #expect(parts[0][1].first == position(-62.8, 44.2))
        #expect(parts[1][0].first == position(-61.5, 46.5))
        #expect(parts[1][0].last == position(-61.5, 46.5))
    }

    @Test func movingAWholeShapeKeepsItsShape() throws {
        let original = try square
        let id = try #require(original.features.first?.id)
        let edited = VectorEdit.translating(
            featureID: id, byLatitude: 0.5, longitude: -0.25, in: original
        )
        guard case .polygon(let rings)? = edited.features.first?.geometry,
              case .polygon(let before)? = original.features.first?.geometry
        else {
            Issue.record("Expected a polygon.")
            return
        }

        #expect(rings[0].count == before[0].count)
        for (moved, start) in zip(rings[0], before[0]) {
            #expect(abs(moved.lat - (start.lat + 0.5)) < 1e-12)
            #expect(abs(moved.lng - (start.lng - 0.25)) < 1e-12)
        }
        // The ring is still closed, and the extent moved with it.
        #expect(rings[0].first == rings[0].last)
        #expect(abs((edited.bbox?.south ?? 0) - ((original.bbox?.south ?? 0) + 0.5)) < 1e-12)
    }

    /// Unlike a vertex drag, which needs a part index it does not carry: the
    /// same offset applies to every position, so there is nothing to guess.
    @Test func movingAWholeShapeMovesEveryPartOfIt() throws {
        let parsed = try layer(
            #"{"type":"MultiLineString","coordinates":[[[-63,44],[-62,45]],[[-61,46],[-60,47]]]}"#
        )
        let id = try #require(parsed.features.first?.id)
        let edited = VectorEdit.translating(
            featureID: id, byLatitude: 1, longitude: 1, in: parsed
        )
        guard case .multiLineString(let lines)? = edited.features.first?.geometry else {
            Issue.record("Expected a multi-line.")
            return
        }
        #expect(lines[0][0] == position(-62, 45))
        #expect(lines[1][1] == position(-59, 48))
    }

    @Test func aShapeCannotBePushedOffTheTopOfTheWorld() throws {
        let parsed = try layer(#"{"type":"Point","coordinates":[-63,44]}"#)
        let id = try #require(parsed.features.first?.id)
        let edited = VectorEdit.translating(
            featureID: id, byLatitude: 60, longitude: 0, in: parsed
        )
        guard case .point(let moved)? = edited.features.first?.geometry else {
            Issue.record("Expected a point.")
            return
        }
        #expect(moved.lat == 90)
    }

    @Test func aFeatureWithNoPlaceDoesNotWidenTheExtent() throws {
        let parsed = try layer(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":null,"properties":{"pid":"1"}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},
               "properties":{}}]}
            """
        )
        let box = try #require(VectorEdit.recomputed(parsed.features).bbox)
        #expect(box.south == 44)
        #expect(box.north == 44)
    }
}

@Suite("Tapping a feature to select it")
struct VectorHitTestTests {
    private func layer(_ json: String) throws -> ParsedVector {
        try UserVectorParse.parseGeoJson(Data(json.utf8))
    }

    private func at(_ lng: Double, _ lat: Double) -> GeoJsonPosition {
        GeoJsonPosition(lng: lng, lat: lat)
    }

    @Test func aTapInsideAnAreaSelectsIt() throws {
        let parsed = try layer(
            """
            {"type":"Polygon","coordinates":[[[-63,44],[-62,44],[-62,45],[-63,45],[-63,44]]]}
            """
        )
        #expect(
            VectorEdit.feature(at: at(-62.5, 44.5), in: parsed, toleranceDegrees: 0.001) != nil
        )
        #expect(VectorEdit.feature(at: at(-70, 40), in: parsed, toleranceDegrees: 0.001) == nil)
    }

    /// A line has no inside, so it is hit by distance. Without this a user
    /// could never select a track they imported.
    @Test func aTapNearALineSelectsIt() throws {
        let parsed = try layer(#"{"type":"LineString","coordinates":[[-63,44],[-62,44]]}"#)
        #expect(
            VectorEdit.feature(at: at(-62.5, 44.0005), in: parsed, toleranceDegrees: 0.001) != nil
        )
        #expect(
            VectorEdit.feature(at: at(-62.5, 44.05), in: parsed, toleranceDegrees: 0.001) == nil
        )
    }

    /// The finger's reach is the caller's to say: a fixed tolerance would make
    /// a line untappable zoomed out and greedy zoomed in.
    @Test func theTapToleranceIsTheCallers() throws {
        let parsed = try layer(#"{"type":"Point","coordinates":[-63,44]}"#)
        #expect(VectorEdit.feature(at: at(-63.01, 44), in: parsed, toleranceDegrees: 0.1) != nil)
        #expect(VectorEdit.feature(at: at(-63.01, 44), in: parsed, toleranceDegrees: 0.001) == nil)
    }

    /// Overlapping features resolve to the one drawn on top — the one the user
    /// can see they are pointing at.
    @Test func theTopmostOfTwoOverlappingFeaturesWins() throws {
        let parsed = try layer(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","id":"under","geometry":{"type":"Polygon","coordinates":
                [[[-63,44],[-62,44],[-62,45],[-63,45],[-63,44]]]},"properties":{}},
              {"type":"Feature","id":"over","geometry":{"type":"Polygon","coordinates":
                [[[-63,44],[-62,44],[-62,45],[-63,45],[-63,44]]]},"properties":{}}]}
            """
        )
        let hit = VectorEdit.feature(at: at(-62.5, 44.5), in: parsed, toleranceDegrees: 0.001)
        #expect(hit?.id == "over")
    }

    @Test func aRowWithNoPlaceIsNeverSelected() throws {
        let parsed = try layer(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":null,"properties":{"pid":"1"}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63,44]},
               "properties":{}}]}
            """
        )
        #expect(VectorEdit.feature(at: at(-10, 10), in: parsed, toleranceDegrees: 1) == nil)
    }
}
