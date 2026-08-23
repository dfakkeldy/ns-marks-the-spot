import Foundation
import Testing

@testable import GeoCore

@Suite("TileMath.webMercatorBounds")
struct WebMercatorBoundsTests {
    @Test("the zoom-0 tile is the whole world")
    func wholeWorld() {
        let box = TileMath.webMercatorBounds(x: 0, y: 0, z: 0)
        let extent = TileMath.webMercatorWorldExtent
        #expect(box.minX == -extent)
        #expect(box.maxX == extent)
        #expect(box.minY == -extent)
        #expect(box.maxY == extent)
    }

    @Test("tile (1,0) at zoom 1 is the north-east quadrant")
    func northEastQuadrant() {
        let box = TileMath.webMercatorBounds(x: 1, y: 0, z: 1)
        let extent = TileMath.webMercatorWorldExtent
        #expect(abs(box.minX) < 1e-9)
        #expect(abs(box.maxX - extent) < 1e-9)
        #expect(abs(box.minY) < 1e-9)
        #expect(abs(box.maxY - extent) < 1e-9)
    }

    @Test("adjacent tiles share an edge")
    func adjacentTilesShareEdges() {
        let left = TileMath.webMercatorBounds(x: 4, y: 6, z: 4)
        let right = TileMath.webMercatorBounds(x: 5, y: 6, z: 4)
        let below = TileMath.webMercatorBounds(x: 4, y: 7, z: 4)
        // Not bit-identical, and deliberately not asserted as such: maxY comes
        // from the world extent while minY is reached by subtracting a span, so
        // the two routes to a shared horizontal edge round differently. The gap
        // is nanometres — far below any projection's meaning — but an equality
        // assertion here would fail. The web formula has the same asymmetry.
        #expect(abs(left.maxX - right.minX) < 1e-6)
        #expect(abs(left.minY - below.maxY) < 1e-6)
    }

    @Test("tiles are square at every zoom")
    func squareTiles() {
        for z in 0...18 {
            let box = TileMath.webMercatorBounds(x: 0, y: 0, z: z)
            let width = box.maxX - box.minX
            let height = box.maxY - box.minY
            #expect(abs(width - height) < 1e-6)
        }
    }
}

@Suite("TileMath.tileXY")
struct TileXYTests {
    @Test("the null island sits at the corner of the four zoom-1 tiles")
    func nullIsland() {
        // (0, 0) is the shared corner; floor puts it in the south-east tile.
        let tile = TileMath.tileXY(latitude: 0, longitude: 0, zoom: 1)
        #expect(tile.x == 1)
        #expect(tile.y == 1)
    }

    @Test("the antimeridian's west edge is tile zero")
    func westEdge() {
        let tile = TileMath.tileXY(latitude: 0, longitude: -180, zoom: 5)
        #expect(tile.x == 0)
    }

    @Test("clamps longitude at the eastern antimeridian into range")
    func eastEdgeClamped() {
        // Unclamped, (180 + 180)/360 * 32 is exactly 32 — one past the last tile.
        let tile = TileMath.tileXY(latitude: 0, longitude: 180, zoom: 5)
        #expect(tile.x == 31)
    }

    @Test("clamps latitude beyond the Mercator limit")
    func poleClamped() {
        let north = TileMath.tileXY(latitude: 89, longitude: 0, zoom: 4)
        let south = TileMath.tileXY(latitude: -89, longitude: 0, zoom: 4)
        #expect(north.y == 0)
        #expect(south.y == 15)
    }

    @Test("round-trips a tile through its north-west corner")
    func roundTrip() {
        // Nudge inward off the exact corner, which belongs to the neighbour.
        for (x, y, z) in [(331, 369, 10), (0, 0, 3), (7, 5, 3), (2_642, 2_957, 13)] {
            let corner = TileMath.northWestCorner(x: x, y: y, z: z)
            let inside = GeoPoint(lat: corner.lat - 1e-7, lng: corner.lng + 1e-7)
            let tile = TileMath.tileXY(
                latitude: inside.lat,
                longitude: inside.lng,
                zoom: z
            )
            #expect(tile.x == x)
            #expect(tile.y == y)
        }
    }

    @Test("a Nova Scotia coordinate lands in the same tile the bounds describe")
    func novaScotiaConsistency() {
        // Cross-check the two ported halves against each other: the tile chosen
        // for a point must be the tile whose Web Mercator box contains it.
        let halifax = GeoPoint(lat: 44.6488, lng: -63.5752)
        for z in 8...15 {
            let tile = TileMath.tileXY(
                latitude: halifax.lat,
                longitude: halifax.lng,
                zoom: z
            )
            let box = TileMath.webMercatorBounds(x: tile.x, y: tile.y, z: z)
            let x = TileMath.webMercatorWorldExtent * halifax.lng / 180
            let radians = halifax.lat * .pi / 180
            let y =
                TileMath.webMercatorWorldExtent
                * log(tan(.pi / 4 + radians / 2)) / .pi
            #expect(x >= box.minX && x <= box.maxX)
            #expect(y >= box.minY && y <= box.maxY)
        }
    }
}
