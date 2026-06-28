import Foundation
import Testing
@testable import ns_marks_the_spot

struct FletcherTilePlannerTests {
    @Test func computesExpectedWebMercatorTileForHalifaxAtZoomTen() {
        let bounds = MapBounds(
            minLatitude: 44.64,
            minLongitude: -63.58,
            maxLatitude: 44.66,
            maxLongitude: -63.56
        )

        let coordinates = FletcherTilePlanner.coordinates(for: bounds, zoomRange: 10...10)

        #expect(coordinates.contains(TileCoordinate(z: 10, x: 331, y: 367)))
    }

    @Test func estimateUsesTileCountAndAverageBytes() {
        let bounds = MapBounds(
            minLatitude: 44.64,
            minLongitude: -63.58,
            maxLatitude: 44.66,
            maxLongitude: -63.56
        )

        let estimate = FletcherTilePlanner.estimate(
            bounds: bounds,
            zoomRange: 10...11,
            averageTileBytes: 12_000
        )

        #expect(estimate.tileCount == FletcherTilePlanner.coordinates(for: bounds, zoomRange: 10...11).count)
        #expect(estimate.estimatedBytes == estimate.tileCount * 12_000)
    }

    @Test func normalizesInvertedBounds() {
        let bounds = MapBounds(
            minLatitude: 45.0,
            minLongitude: -63.0,
            maxLatitude: 44.0,
            maxLongitude: -64.0
        )

        #expect(bounds.normalized.minLatitude == 44.0)
        #expect(bounds.normalized.minLongitude == -64.0)
        #expect(bounds.normalized.maxLatitude == 45.0)
        #expect(bounds.normalized.maxLongitude == -63.0)
    }

    @Test func returnsDeterministicSortedUniqueCoordinatesAcrossZooms() {
        let bounds = MapBounds(
            minLatitude: 44.64,
            minLongitude: -63.58,
            maxLatitude: 44.66,
            maxLongitude: -63.56
        )

        let coordinates = FletcherTilePlanner.coordinates(for: bounds, zoomRange: 10...11)
        let uniqueCoordinates = Set(coordinates)

        #expect(coordinates.count == uniqueCoordinates.count)
        #expect(coordinates == coordinates.sorted {
            if $0.z != $1.z { return $0.z < $1.z }
            if $0.x != $1.x { return $0.x < $1.x }
            return $0.y < $1.y
        })
        #expect(coordinates.contains { $0.z == 10 })
        #expect(coordinates.contains { $0.z == 11 })
    }
}
