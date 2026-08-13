import Foundation
import GeoCore
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

    @Test("Sheets overlap their neighbours rather than tiling exactly")
    func sheetsOverlap() {
        // The originals were surveyed with margins, so adjacent scans share
        // ground. Recorded as a property because it is what forces sheet-number
        // ordering in `sheets(intersecting:)` — with a clean tiling the draw
        // order would never be visible.
        let overlapping = FletcherSheets.all.filter { sheet in
            FletcherSheets.sheets(intersecting: sheet.bounds).count > 1
        }
        #expect(overlapping.count == FletcherSheets.all.count)
    }
}
