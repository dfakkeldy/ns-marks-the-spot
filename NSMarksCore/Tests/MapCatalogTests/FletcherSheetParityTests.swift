import Foundation
import GeoCore
import ParityFixtures
import Testing

@testable import MapCatalog

/// The 24 sheet extents, checked against the fixture the web exports.
///
/// This suite exists because of what the numbers are: not configuration, but
/// the georeferencing itself. A wrong digit in a bound does not crash, does not
/// fail to load, and does not look broken — it draws a historical survey over
/// the wrong ground, which is the one class of bug this app must not ship,
/// because a user comparing a 19th-century lot line against a modern parcel has
/// no way to notice that the scan is 400 m out.
@Suite("Fletcher sheet parity")
struct FletcherSheetParityTests {
    static let fixture = ParityFixture.loaded

    @Test("Carries the tile revision the web addresses")
    func matchesRevision() throws {
        // The revision is a path segment on both surfaces, so a mismatch is not
        // a version skew — it is a 404, or worse, a stale build served from a
        // cache that still holds the old prefix.
        let web = try #require(Self.fixture.fletcher?["tileRevision"]?.string)
        #expect(FletcherSheets.tileRevision == web)
    }

    @Test("Renders at the same zooms the web requests")
    func matchesZoomRange() throws {
        // MapKit asks an overlay for every tile in view and has no per-layer
        // bounds, so this range is the only thing stopping the app requesting
        // zooms the pyramid was never rendered at. Drifting wider than the web
        // is not a cosmetic difference — it is a guaranteed 404 per tile.
        //
        // The pyramid depth is the fixture's `maxNativeZoom`, not `maxZoom`:
        // the display ceiling now runs past the rendered tiles so a tracer can
        // keep zooming, and both surfaces upscale the deepest real tile beyond
        // it (Leaflet past `maxNativeZoom`, MapKit past `maximumZ`).
        let entry = try #require(Self.fixture.layer("fletcher"))
        let minimum = try #require(entry["minZoom"]?.int)
        let maximum = try #require(
            entry["maxNativeZoom"]?.nonNull?.int ?? entry["maxZoom"]?.int
        )
        #expect(FletcherSheets.zoomRange.lowerBound == minimum)
        #expect(FletcherSheets.zoomRange.upperBound == maximum)
    }

    @Test("Bounds every sheet with one coverage box")
    func coverageHoldsEverySheet() {
        let coverage = FletcherSheets.coverage
        #expect(coverage.isWellFormed)
        for sheet in FletcherSheets.all {
            #expect(
                coverage.intersection(with: sheet.bounds) == sheet.bounds,
                "sheet \(sheet.sheet) falls outside the coverage box"
            )
        }
        // Tight, not merely containing: a box padded out to the province would
        // still pass the loop above while undoing the work-bounding this exists
        // for.
        #expect(coverage.south == FletcherSheets.all.map(\.bounds.south).min())
        #expect(coverage.west == FletcherSheets.all.map(\.bounds.west).min())
        #expect(coverage.north == FletcherSheets.all.map(\.bounds.north).max())
        #expect(coverage.east == FletcherSheets.all.map(\.bounds.east).max())
    }

    @Test("Declares the same sheets the web declares")
    func matchesSheetNumbers() throws {
        let web = try #require(Self.fixture.fletcherSheets)
        #expect(FletcherSheets.all.map(\.sheet) == web.map(\.sheet))
        #expect(FletcherSheets.all.count == 24)
    }

    @Test("Matches every bound to the last digit")
    func matchesBounds() throws {
        let web = try #require(Self.fixture.fletcherSheets)
        let byNumber = Dictionary(uniqueKeysWithValues: web.map { ($0.sheet, $0.bounds) })
        for sheet in FletcherSheets.all {
            let expected = try #require(byNumber[sheet.sheet], "sheet \(sheet.sheet) missing")
            // Compared exactly, not with a tolerance. These are transcribed
            // literals, not the result of a computation, so there is no
            // rounding to allow for — any difference at all is a typo.
            #expect(sheet.bounds == expected, "sheet \(sheet.sheet)")
        }
    }

    @Test("Reads each corner pair the way Leaflet writes it")
    func cornersAreNotTransposed() {
        // The web writes `[[south, west], [north, east]]`. Reading that as
        // `[[north, east], [south, west]]` yields a box that is still a box, so
        // only an orientation check catches it — and every sheet is in Cape
        // Breton, so the coarse bounds catch a lat/lng swap too.
        for sheet in FletcherSheets.all {
            let bounds = sheet.bounds
            #expect(bounds.isWellFormed, "sheet \(sheet.sheet) is inverted")
            #expect(bounds.south > 45 && bounds.north < 48, "sheet \(sheet.sheet) latitude")
            #expect(bounds.west > -62 && bounds.east < -60, "sheet \(sheet.sheet) longitude")
        }
    }

    @Test("Selects sheets by viewport overlap, edges included")
    func selectsOverlappingSheets() throws {
        let one = try #require(FletcherSheets.sheet(1))
        // A box strictly inside sheet 1 selects it.
        #expect(FletcherSheets.sheets(intersecting: one.bounds).contains(one))
        let centre = one.bounds.center
        let pinhole = GeoBoundingBox(
            south: centre.lat, west: centre.lng, north: centre.lat, east: centre.lng
        )
        #expect(FletcherSheets.sheets(intersecting: pinhole).contains(one))

        // Halifax is under no sheet: this is a Cape Breton survey.
        let halifax = GeoBoundingBox(south: 44.6, west: -63.7, north: 44.7, east: -63.5)
        #expect(FletcherSheets.sheets(intersecting: halifax).isEmpty)

        // A box covering the province selects all of them, in sheet order.
        let province = GeoBoundingBox(south: 43, west: -67, north: 48, east: -59)
        #expect(FletcherSheets.sheets(intersecting: province).map(\.sheet) == Array(1...24))
    }

    @Test("Refuses tiles outside a sheet, at every zoom the layer offers")
    func rejectsTilesOutsideASheet() throws {
        let one = try #require(FletcherSheets.sheet(1))
        for zoom in 0...16 {
            let centre = one.bounds.center
            let inside = TileMath.tileXY(latitude: centre.lat, longitude: centre.lng, zoom: zoom)
            #expect(
                FletcherSheets.covers(one, x: inside.x, y: inside.y, z: zoom),
                "sheet 1 should serve its own centre tile at z\(zoom)"
            )

            // Halifax, which no sheet covers. At z0 and z1 a single tile spans
            // a whole hemisphere, so it legitimately overlaps the sheet — the
            // check only means something once tiles are smaller than the gap.
            guard zoom >= 6 else { continue }
            let outside = TileMath.tileXY(latitude: 44.65, longitude: -63.57, zoom: zoom)
            #expect(
                !FletcherSheets.covers(one, x: outside.x, y: outside.y, z: zoom),
                "sheet 1 should refuse a Halifax tile at z\(zoom)"
            )
            #expect(FletcherSheets.sheets(coveringTileX: outside.x, y: outside.y, z: zoom).isEmpty)
        }
    }

    @Test("Refuses the ring of tiles that only touch a sheet's edge")
    func rejectsTilesLyingAgainstASheetEdge() throws {
        // The browser never asks for these. Leaflet's `_isValidTile` uses
        // `overlaps`, which is strict, so a tile lying exactly against a
        // layer's bounds is not requested; the phone asks MapKit's question
        // itself and had been answering with the inclusive test. The
        // difference is a ring around every sheet at every zoom, and since the
        // tile build wrote nothing outside the sheet extents, every one of
        // those requests is a 404.
        let one = try #require(FletcherSheets.sheet(1))
        let zoom = 16
        let centre = one.bounds.center
        let beyond = TileMath.tileXY(latitude: centre.lat, longitude: one.bounds.east, zoom: zoom)
        let beyondBounds = TileMath.geographicBounds(x: beyond.x, y: beyond.y, z: zoom)

        // The premise: the sheets were cut on tile boundaries, so the tile
        // east of sheet 1 begins exactly where sheet 1 ends. If this ever
        // fails, the sheet has been re-georeferenced off the grid and the
        // assertions under it are asking about a different tile.
        #expect(
            beyondBounds.west == one.bounds.east,
            "sheet 1's east edge is no longer on a zoom \(zoom) tile boundary"
        )
        #expect(
            !FletcherSheets.covers(one, x: beyond.x, y: beyond.y, z: zoom),
            "sheet 1 is serving a tile it shares only an edge with"
        )
        #expect(FletcherSheets.sheets(coveringTileX: beyond.x, y: beyond.y, z: zoom).isEmpty)
        #expect(
            FletcherSheets.covers(one, x: beyond.x - 1, y: beyond.y, z: zoom),
            "the tile inside the edge is the one that must still be served"
        )
    }

    @Test("A tile's geographic bounds round-trip through tileXY")
    func tileBoundsRoundTrip() {
        // `covers` is only as good as this conversion, and the y inversion is
        // the easy half to get backwards: tile row y runs from the north-west
        // corner of y down to the north-west corner of y + 1.
        for zoom in [8, 12, 16] {
            let tile = TileMath.tileXY(latitude: 46.1, longitude: -60.9, zoom: zoom)
            let bounds = TileMath.geographicBounds(x: tile.x, y: tile.y, z: zoom)
            #expect(bounds.isWellFormed, "z\(zoom)")
            #expect(bounds.contains(GeoPoint(lat: 46.1, lng: -60.9)), "z\(zoom)")
            let recovered = TileMath.tileXY(
                latitude: bounds.center.lat, longitude: bounds.center.lng, zoom: zoom
            )
            #expect(recovered.x == tile.x && recovered.y == tile.y, "z\(zoom)")
        }
    }

    @Test("Every sheet but one shares ground with a neighbour")
    func sheetsOverlap() {
        // The originals were surveyed with margins, so adjacent scans share
        // ground rather than tiling cleanly. Recorded as a property because it
        // is what forces sheet-number ordering in `sheets(intersecting:)` —
        // with a clean tiling the draw order would never be visible.
        //
        // `overlapping` rather than `intersecting`: the inclusive test counts a
        // sheet lying against a neighbour's edge, so it would report shared
        // ground where the two merely abut.
        let sharing = FletcherSheets.all.filter { sheet in
            FletcherSheets.sheets(overlapping: sheet.bounds).count > 1
        }

        // Sheet 9 is the exception and stays named here rather than rounded
        // into the rule: its north, east and west edges coincide with sheets 5,
        // 8 and 6 to the digit, so it shares an edge with them and no ground.
        // A future re-georeference that gives it a margin should have to come
        // back and change this line.
        #expect(Set(sharing.map(\.sheet)) == Set(FletcherSheets.all.map(\.sheet)).subtracting([9]))
        #expect(FletcherSheets.sheets(intersecting: FletcherSheets.sheet(9)!.bounds).count > 1)
    }
}
