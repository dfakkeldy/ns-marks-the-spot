import Foundation
import GeoCore
import MapCatalog
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

    @Test func theOfflineScreensSampleAreaIsInsideTheSurvey() {
        // The sample was Halifax, which meant the one tap the offline screen
        // offers led to an estimate of zero and a Save button that would have
        // downloaded nothing. Pinned here rather than left to a reader,
        // because the sheet index is what decides it and the sheet index moves
        // whenever a sheet is re-georeferenced. This test guards the sample,
        // not the coverage test under it: it passes on both sides of the fix
        // that made `coversAnyGround` ask the sheets. The two below are the
        // ones that fail on the wrong implementation.
        //
        // Containment rather than intersection, and one named sheet rather
        // than any sheet. A box that merely touched a sheet corner would pass
        // an intersection test while most of what the sample offers to
        // download is water no survey drew.
        let sample = OfflineStorageView.sampleAreaBounds
        guard let sheet = FletcherSheets.sheet(12) else {
            Issue.record("the sheet index no longer has a sheet 12")
            return
        }

        #expect(sheet.bounds.south <= sample.minLatitude)
        #expect(sheet.bounds.north >= sample.maxLatitude)
        #expect(sheet.bounds.west <= sample.minLongitude)
        #expect(sheet.bounds.east >= sample.maxLongitude)
        #expect(FletcherSheets.sheets(intersecting: GeoBoundingBox(
            south: sample.minLatitude, west: sample.minLongitude,
            north: sample.maxLatitude, east: sample.maxLongitude
        )).map(\.sheet) == [12])

        #expect(FletcherTilePlanner.coversAnyGround(in: sample))
        // Exact, so that a change to the sheet index or the tile walk has to
        // be looked at rather than absorbed. If this number moves, check that
        // the sample is still Baddeck and still inside sheet 12 before
        // updating it.
        #expect(FletcherTilePlanner.estimate(
            bounds: sample, zoomRange: 10...14, averageTileBytes: 12_000
        ).tileCount == 101)
    }

    @Test func groundOutsideTheSurveyIsSaidToBeOutsideIt() {
        // The distinction the draft screen is built on: no ground here is not
        // the same answer as no tiles here, and only one of them is worth
        // telling a reader to widen their zoom range over.
        #expect(!FletcherTilePlanner.coversAnyGround(in: Self.halifax))
        #expect(FletcherTilePlanner.coversAnyGround(in: Self.insideSheetOne))
    }

    @Test func groundInsideTheCoverageBoxCanStillBeOutsideTheSurvey() {
        // A gap between sheets, north of Bras d'Or Lake. It is inside
        // `FletcherSheets.coverage`, the rectangle drawn around the 24 ragged
        // sheets, and on none of the sheets themselves, so the two ways of
        // asking whether the survey reaches here disagree about it. This is
        // the case Halifax cannot test: Halifax is outside even the rectangle,
        // so an implementation that asked the rectangle passed anyway. The
        // honest answer is the per-sheet one.
        let gap = MapBounds(
            minLatitude: 46.99, minLongitude: -61.01,
            maxLatitude: 47.01, maxLongitude: -60.99
        )
        let coverage = FletcherSheets.coverage
        #expect(coverage.south <= gap.minLatitude)
        #expect(coverage.north >= gap.maxLatitude)
        #expect(coverage.west <= gap.minLongitude)
        #expect(coverage.east >= gap.maxLongitude)

        #expect(!FletcherTilePlanner.coversAnyGround(in: gap))
        // And a positive count here is not a contradiction, which is why the
        // draft screen no longer says "there are no tiles" for ground it calls
        // outside the survey. A zoom 10 tile is wide enough to cover both this
        // gap and the sheet beside it; a zoom 12 tile is not.
        #expect(FletcherTilePlanner.estimate(
            bounds: gap, zoomRange: 10...14, averageTileBytes: 12_000
        ).tileCount > 0)
        #expect(FletcherTilePlanner.estimate(
            bounds: gap, zoomRange: 12...16, averageTileBytes: 12_000
        ).tileCount == 0)
    }

    @Test func aSelectionLyingAgainstASheetEdgeIsOutsideTheSurvey() {
        // An edge is not ground. This box starts exactly where sheet 1 ends,
        // to the last binary digit, because the sheets were cut on tile
        // boundaries and a selection can land on one.
        //
        // The inclusive test called this covered, and then the same
        // inclusiveness in the tile filter planned four zoom 16 tiles for it,
        // none of which the tile build ever wrote and none of which the
        // browser would have requested. Leaflet's own bounds check is the
        // strict one, and this is the phone matching it.
        guard let one = FletcherSheets.sheet(1) else {
            Issue.record("the sheet index no longer has a sheet 1")
            return
        }
        let against = MapBounds(
            minLatitude: one.bounds.south + 0.01, minLongitude: one.bounds.east,
            maxLatitude: one.bounds.south + 0.02, maxLongitude: one.bounds.east + 0.01
        )

        #expect(!FletcherTilePlanner.coversAnyGround(in: against))
        #expect(FletcherTilePlanner.estimate(
            bounds: against, zoomRange: 16...16, averageTileBytes: 12_000
        ).tileCount == 0)
        // Coarser tiles do reach back over the sheet, which is why the screen
        // says the tiles counted belong to sheets nearby rather than promising
        // there are none.
        #expect(FletcherTilePlanner.estimate(
            bounds: against, zoomRange: 14...16, averageTileBytes: 12_000
        ).tileCount > 0)
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
