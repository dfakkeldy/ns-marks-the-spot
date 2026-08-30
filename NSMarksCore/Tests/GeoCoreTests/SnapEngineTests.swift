import Foundation
import Testing

@testable import GeoCore

@Suite("Snap engine")
struct SnapEngineTests {
    @Test func sourcesAreOnlyOwnFeatureAndParcel() {
        #expect(SnapEngine.Source.allCases.map(\.rawValue) == ["ownFeature", "parcel"])
    }

    @Test func aVertexWithinToleranceBeatsACloserEdge() throws {
        // Point sits 1 m off the middle of a 100 m east-west edge, and 8 m
        // from the east vertex. Vertex-first must pick the corner.
        let southWest = GeoPoint(lat: 44.65, lng: -63.58)
        let southEast = GeoPoint(lat: 44.65, lng: -63.579)
        let tap = GeoPoint(lat: 44.65002, lng: -63.57905)
        let target = SnapEngine.Target(
            source: .parcel,
            vertices: [southWest, southEast],
            segments: [(southWest, southEast)]
        )
        let hit = SnapEngine.nearest(to: tap, among: [target], toleranceMetres: 25)
        let expected = try #require(hit)
        #expect(expected.kind == .vertex)
        #expect(expected.source == .parcel)
        #expect(abs(expected.point.lat - southEast.lat) < 1e-9)
        #expect(abs(expected.point.lng - southEast.lng) < 1e-9)
    }

    @Test func anEdgeWinsWhenNoVertexIsInsideTolerance() throws {
        let a = GeoPoint(lat: 44.65, lng: -63.58)
        let b = GeoPoint(lat: 44.65, lng: -63.57)
        let tap = GeoPoint(lat: 44.65005, lng: -63.575)
        let target = SnapEngine.Target(
            source: .ownFeature,
            vertices: [a, b],
            segments: [(a, b)]
        )
        let hit = SnapEngine.nearest(to: tap, among: [target], toleranceMetres: 25)
        let expected = try #require(hit)
        #expect(expected.kind == .edge)
        #expect(expected.source == .ownFeature)
        #expect(abs(expected.point.lat - 44.65) < 1e-6)
    }

    @Test func nothingOutsideToleranceSnaps() {
        let vertex = GeoPoint(lat: 44.65, lng: -63.58)
        let tap = GeoPoint(lat: 45.0, lng: -64.0)
        let target = SnapEngine.Target(
            source: .ownFeature, vertices: [vertex], segments: []
        )
        #expect(SnapEngine.nearest(to: tap, among: [target], toleranceMetres: 15) == nil)
    }

    @Test func unreadableGeometryContributesNoCandidates() {
        let empty = SnapEngine.Target.parcel(rings: [])
        #expect(empty.vertices.isEmpty)
        #expect(empty.segments.isEmpty)
        let tap = GeoPoint(lat: 44.65, lng: -63.58)
        #expect(SnapEngine.nearest(to: tap, among: [empty], toleranceMetres: 50) == nil)
    }
}

@Suite("Bulk photo placement")
struct BulkPhotoPlacementTests {
    private let bounds = GeoBoundingBox(south: 44, west: -64, north: 45, east: -63)

    @Test func inViewDefaultCheckedOutOfViewCheckableUntaggedUnselectable() {
        let rows = BulkPhotoPlacement.classify(
            [
                .init(id: "in", gps: GeoPoint(lat: 44.5, lng: -63.5), capturedAt: nil),
                .init(id: "out", gps: GeoPoint(lat: 46, lng: -60), capturedAt: nil),
                .init(id: "none", gps: nil, capturedAt: nil),
            ],
            bounds: bounds
        )
        #expect(rows.map(\.inViewport) == [true, false, nil])
        #expect(rows.map(\.checkedByDefault) == [true, false, false])
        #expect(rows.map(\.isPlaceable) == [true, true, false])
    }

    @Test func theBoundsEdgeCountsAsInside() {
        let rows = BulkPhotoPlacement.classify(
            [.init(id: "edge", gps: GeoPoint(lat: 45, lng: -64), capturedAt: nil)],
            bounds: bounds
        )
        #expect(rows.first?.inViewport == true)
        #expect(rows.first?.checkedByDefault == true)
    }

    @Test func geotaggedPhotosStayPlaceableButUncheckedWithoutBounds() {
        let rows = BulkPhotoPlacement.classify(
            [.init(id: "somewhere", gps: GeoPoint(lat: 44.5, lng: -63.5), capturedAt: nil)],
            bounds: nil
        )
        #expect(rows.first?.inViewport == false)
        #expect(rows.first?.checkedByDefault == false)
        #expect(rows.first?.isPlaceable == true)
    }
}
