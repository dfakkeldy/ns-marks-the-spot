import Foundation
import GeoCore

/// The raster the print frame is composited into, and the mapping from ground
/// to pixel inside it.
///
/// Ported from `web/src/print/pdf/tileMath.ts`. Everything the compositor
/// draws — tiles, parcel outlines, markers — is placed through this one
/// mapping, so a layer cannot end up half a pixel out of step with the layer
/// underneath it.
///
/// The space is Web Mercator, because the tiles are. Horizontal and vertical
/// scale are kept separately rather than assumed equal: they agree to within
/// rounding for a frame whose aspect was fitted to the map, and keeping both
/// means a frame that was not still places its contents correctly instead of
/// stretching them.
public struct PrintOutputSpace: Hashable, Sendable {
    public var widthPx: Int
    public var heightPx: Int
    public var mercWest: Double
    public var mercEast: Double
    public var mercNorth: Double
    public var mercSouth: Double
    /// Output pixels per Mercator metre.
    public var scaleX: Double
    public var scaleY: Double

    public init(bounds: GeoBoundingBox, widthPx: Int, heightPx: Int) {
        let northWest = WebMercator.project(GeoPoint(lat: bounds.north, lng: bounds.west))
        let southEast = WebMercator.project(GeoPoint(lat: bounds.south, lng: bounds.east))
        self.widthPx = widthPx
        self.heightPx = heightPx
        mercWest = northWest.x
        mercEast = southEast.x
        mercNorth = northWest.y
        mercSouth = southEast.y
        scaleX = Double(widthPx) / (southEast.x - northWest.x)
        scaleY = Double(heightPx) / (northWest.y - southEast.y)
    }

    /// Pixel position, with y increasing downward as a raster's does.
    public func point(for mercator: MercatorPoint) -> (x: Double, y: Double) {
        ((mercator.x - mercWest) * scaleX, (mercNorth - mercator.y) * scaleY)
    }

    public func point(for location: GeoPoint) -> (x: Double, y: Double) {
        point(for: WebMercator.project(location))
    }

    /// Where a tile lands in the raster.
    public func rect(for tile: PrintTile) -> PdfRect {
        let box = TileMath.webMercatorBounds(x: tile.x, y: tile.y, z: tile.z)
        let topLeft = point(for: MercatorPoint(x: box.minX, y: box.maxY))
        let bottomRight = point(for: MercatorPoint(x: box.maxX, y: box.minY))
        return PdfRect(
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        )
    }
}

public struct PrintTile: Hashable, Sendable {
    public var z: Int
    public var x: Int
    public var y: Int

    public init(z: Int, x: Int, y: Int) {
        self.z = z
        self.x = x
        self.y = y
    }
}

public enum PrintTilePlan {
    public static let tileSize = 256

    /// The smallest zoom whose own resolution meets the raster's, clamped to
    /// what the layer actually publishes.
    ///
    /// Meeting rather than exceeding the output resolution is what keeps the
    /// tile count bounded at print dot pitch — one zoom further in is four
    /// times the tiles for detail the paper cannot hold. Clamping to the
    /// layer's maximum native zoom matters more here than on screen: asking a
    /// source for a zoom it does not publish returns nothing, and a blank
    /// layer on a printed page is indistinguishable from a layer that had
    /// nothing to say.
    public static func zoom(
        for bounds: GeoBoundingBox, widthPx: Int, maxNativeZoom: Int
    ) -> Int {
        let west = WebMercator.project(GeoPoint(lat: 0, lng: bounds.west)).x
        let east = WebMercator.project(GeoPoint(lat: 0, lng: bounds.east)).x
        let mercatorWidth = east - west
        guard mercatorWidth > 0 else { return 0 }
        let ideal = log2(
            Double(widthPx) * 2 * TileMath.webMercatorWorldExtent
                / (mercatorWidth * Double(tileSize))
        )
        return max(0, min(maxNativeZoom, Int(ideal.rounded(.up))))
    }

    /// Every tile that touches `bounds` at `zoom`, row by row.
    ///
    /// The far edge is floored the same way the near edge is, which includes
    /// one extra column or row when the bounds land exactly on a tile
    /// boundary. That extra tile draws off the edge of the raster and costs a
    /// fetch; the alternative is a one-pixel seam of blank paper down the side
    /// of a printed map.
    public static func tiles(covering bounds: GeoBoundingBox, zoom: Int) -> [PrintTile] {
        let count = 1 << zoom
        let northWest = WebMercator.project(GeoPoint(lat: bounds.north, lng: bounds.west))
        let southEast = WebMercator.project(GeoPoint(lat: bounds.south, lng: bounds.east))
        let extent = TileMath.webMercatorWorldExtent

        func clamped(_ value: Double) -> Int {
            max(0, min(count - 1, Int(value.rounded(.down))))
        }
        let minX = clamped((northWest.x + extent) / (2 * extent) * Double(count))
        let maxX = clamped((southEast.x + extent) / (2 * extent) * Double(count))
        let minY = clamped((extent - northWest.y) / (2 * extent) * Double(count))
        let maxY = clamped((extent - southEast.y) / (2 * extent) * Double(count))

        guard minX <= maxX, minY <= maxY else { return [] }
        return (minY...maxY).flatMap { y in
            (minX...maxX).map { PrintTile(z: zoom, x: $0, y: y) }
        }
    }
}
