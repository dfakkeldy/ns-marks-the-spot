import Foundation
import GeoCore
import Testing

@testable import NSDataServices

@Suite("Print output space")
struct PrintOutputSpaceTests {
    private static let bounds = GeoBoundingBox(
        south: 46.0, west: -61.4, north: 46.2, east: -61.1
    )

    /// The frame's own corners land on the raster's corners. Everything the
    /// compositor draws goes through this mapping, so if the corners are wrong
    /// every layer is wrong together and none of them looks wrong.
    @Test func theFrameCornersLandOnTheRasterCorners() {
        let space = PrintOutputSpace(bounds: Self.bounds, widthPx: 2317, heightPx: 2083)
        let topLeft = space.point(for: GeoPoint(lat: 46.2, lng: -61.4))
        let bottomRight = space.point(for: GeoPoint(lat: 46.0, lng: -61.1))

        #expect(abs(topLeft.x) < 1e-6)
        #expect(abs(topLeft.y) < 1e-6)
        #expect(abs(bottomRight.x - 2317) < 1e-6)
        #expect(abs(bottomRight.y - 2083) < 1e-6)
    }

    /// Latitude is not linear in Mercator, so the centre of the frame in
    /// degrees is not the centre in pixels. A mapping that placed it there
    /// would put every feature progressively further out toward the edges.
    @Test func latitudeIsProjectedRatherThanInterpolated() {
        let space = PrintOutputSpace(bounds: Self.bounds, widthPx: 1000, heightPx: 1000)
        let middle = space.point(for: GeoPoint(lat: 46.1, lng: -61.25))

        #expect(abs(middle.x - 500) < 1e-6)
        #expect(middle.y != 500)
        #expect(abs(middle.y - 500) < 1)
    }

    /// One zoom further in is four times the tiles for detail the paper cannot
    /// hold, so the zoom meets the raster's resolution rather than exceeding
    /// it.
    @Test func theZoomMeetsTheRasterRatherThanExceedingIt() {
        let zoom = PrintTilePlan.zoom(for: Self.bounds, widthPx: 2317, maxNativeZoom: 22)
        let tiles = PrintTilePlan.tiles(covering: Self.bounds, zoom: zoom)
        let space = PrintOutputSpace(bounds: Self.bounds, widthPx: 2317, heightPx: 2083)

        // A tile lands in no more than its own 256 pixels, so the source is
        // never stretched to fill the page, and in more than half of them, so
        // the export is not fetching four times the tiles for detail that is
        // then thrown away.
        let width = space.rect(for: tiles[0]).width
        #expect(width <= 256)
        #expect(width > 128)
    }

    /// A layer that does not publish the zoom the paper wants is drawn at the
    /// deepest zoom it has. Asking for one it does not publish returns
    /// nothing, and a blank layer on a printed page cannot be told apart from
    /// a layer that had nothing to say.
    @Test func aLayerIsNeverAskedForAZoomItDoesNotPublish() {
        let zoom = PrintTilePlan.zoom(for: Self.bounds, widthPx: 2317, maxNativeZoom: 13)
        #expect(zoom == 13)
    }

    /// Complete coverage, including the tiles that only clip the edge — a
    /// missing one is a band of blank paper down the side of the map.
    @Test func everyTileTouchingTheFrameIsPlanned() {
        let zoom = 12
        let space = PrintOutputSpace(bounds: Self.bounds, widthPx: 1200, heightPx: 1000)
        let tiles = PrintTilePlan.tiles(covering: Self.bounds, zoom: zoom)

        #expect(!tiles.isEmpty)
        #expect(Set(tiles).count == tiles.count)
        // Every tile is at the requested zoom, and together they cover the
        // whole raster: no pixel of it falls outside the planned tiles.
        #expect(tiles.allSatisfy { $0.z == zoom })
        let rects = tiles.map { space.rect(for: $0) }
        #expect(rects.map(\.x).min()! <= 0)
        #expect(rects.map(\.y).min()! <= 0)
        #expect(rects.map { $0.x + $0.width }.max()! >= 1200)
        #expect(rects.map { $0.y + $0.height }.max()! >= 1000)
    }

    /// Tiles are laid out in rows, which is the order they are drawn in and
    /// the order a reader watching a slow export sees them arrive.
    @Test func tilesComeBackRowByRow() {
        let tiles = PrintTilePlan.tiles(covering: Self.bounds, zoom: 10)
        let rows = Dictionary(grouping: tiles, by: \.y)

        #expect(rows.count >= 1)
        for row in rows.values {
            #expect(row.map(\.x) == row.map(\.x).sorted())
        }
        #expect(tiles.map(\.y) == tiles.map(\.y).sorted())
    }

    /// Zoom 0 is one tile for the whole world, and a frame at the edge of it
    /// must not ask for a tile that does not exist.
    @Test func tileIndicesStayInsideTheWorld() {
        let whole = GeoBoundingBox(south: -85, west: -180, north: 85, east: 180)
        let tiles = PrintTilePlan.tiles(covering: whole, zoom: 1)

        #expect(tiles.count == 4)
        #expect(tiles.allSatisfy { (0...1).contains($0.x) && (0...1).contains($0.y) })
    }
}
