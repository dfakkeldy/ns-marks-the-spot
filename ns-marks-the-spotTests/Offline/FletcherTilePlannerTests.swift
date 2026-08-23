import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct FletcherTilePlannerTests {
    /// A box well inside Fletcher sheet 1 (46.965…47.141 N, −60.820…−60.436 W).
    ///
    /// These fixtures used to be Halifax, which reads naturally and is wrong:
    /// the survey is a Cape Breton one, and the planner now refuses tiles no
    /// sheet covers. A Halifax plan is legitimately empty, so a test asserting
    /// on its contents was asserting on a bug it would never see.
    static let insideSheetOne = MapBounds(
        minLatitude: 47.00,
        minLongitude: -60.75,
        maxLatitude: 47.10,
        maxLongitude: -60.55
    )

    /// On the map, outside the survey.
    static let halifax = MapBounds(
        minLatitude: 44.64,
        minLongitude: -63.58,
        maxLatitude: 44.66,
        maxLongitude: -63.56
    )

    @Test func computesExpectedWebMercatorTileForCoveredGroundAtZoomTen() {
        let coordinates = FletcherTilePlanner.coordinates(
            for: Self.insideSheetOne, zoomRange: 10...10
        )

        // Hard-coded rather than recomputed from `TileMath`, so this pins the
        // slippy-map projection end to end at the app level instead of checking
        // the planner against the same function it calls.
        #expect(coordinates.contains(TileCoordinate(z: 10, x: 339, y: 359)))
    }

    @Test func plansNothingOutsideTheSurvey() {
        // Not an edge case: it is most of the province. Before the coverage
        // filter these became download jobs that 404ed on every sheet, failed
        // permanently, and could never be cleared by Retry.
        #expect(FletcherTilePlanner.coordinates(for: Self.halifax, zoomRange: 10...12).isEmpty)
        #expect(FletcherTilePlanner.estimate(
            bounds: Self.halifax, zoomRange: 10...12, averageTileBytes: 12_000
        ).tileCount == 0)
    }

    @Test func plansOnlyTilesASheetActuallyCovers() {
        // The whole province, which the planner clips to the survey before it
        // iterates. Both halves matter: a plan that included an uncovered tile
        // would 404, and clipping is also what stops this call enumerating
        // billions of tiles to discover the same thing.
        let province = MapBounds(
            minLatitude: 43.0, minLongitude: -66.5, maxLatitude: 47.0, maxLongitude: -59.5
        )
        let coordinates = FletcherTilePlanner.coordinates(for: province, zoomRange: 12...12)

        #expect(!coordinates.isEmpty)
        #expect(coordinates.allSatisfy {
            FletcherTilePlanner.isCovered(x: $0.x, y: $0.y, z: $0.z)
        })
    }

    @Test func clampsPolarLatitudesToFiniteTileCoordinates() {
        // Latitudes past the Mercator limit used to produce non-finite tile
        // coordinates. They now clip away entirely, and the property worth
        // keeping is that this is a quiet empty plan rather than a crash or an
        // infinite range.
        let polar = MapBounds(
            minLatitude: 89.0, minLongitude: -63.58, maxLatitude: 91.0, maxLongitude: -63.56
        )
        #expect(FletcherTilePlanner.coordinates(for: polar, zoomRange: 3...3).isEmpty)

        // And a selection running from the pole down through the survey keeps
        // the covered part rather than being poisoned by the unreachable half.
        let poleToSurvey = MapBounds(
            minLatitude: 47.00, minLongitude: -60.75, maxLatitude: 91.0, maxLongitude: -60.55
        )
        let coordinates = FletcherTilePlanner.coordinates(for: poleToSurvey, zoomRange: 10...10)
        #expect(!coordinates.isEmpty)
        #expect(coordinates.allSatisfy { (0..<1024).contains($0.x) && (0..<1024).contains($0.y) })
    }

    @Test func estimateUsesTileCountAndAverageBytes() {
        let estimate = FletcherTilePlanner.estimate(
            bounds: Self.insideSheetOne,
            zoomRange: 10...11,
            averageTileBytes: 12_000
        )

        // Required non-zero first. Out-of-coverage bounds make every one of
        // these assertions `0 == 0`, which passes with the multiplication
        // removed and the counting broken.
        #expect(estimate.tileCount > 0)
        #expect(estimate.tileCount == FletcherTilePlanner.coordinates(
            for: Self.insideSheetOne, zoomRange: 10...11
        ).count)
        #expect(estimate.estimatedBytes == estimate.tileCount * 12_000)
    }

    @Test func estimateCountsLargeAreasWithoutMaterializingCoordinates() {
        let bounds = MapBounds(
            minLatitude: 43.0,
            minLongitude: -66.5,
            maxLatitude: 47.0,
            maxLongitude: -59.5
        )

        let estimate = FletcherTilePlanner.estimate(
            bounds: bounds,
            zoomRange: 10...16,
            averageTileBytes: 12_000
        )

        #expect(estimate.tileCount > OfflineAreasViewModel.maximumSavedAreaTileCount)
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
        let coordinates = FletcherTilePlanner.coordinates(
            for: Self.insideSheetOne, zoomRange: 10...11
        )
        let uniqueCoordinates = Set(coordinates)

        #expect(!coordinates.isEmpty)
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
