import Foundation
import GeoCore
import MapCatalog

nonisolated struct TileEstimate: Equatable, Sendable {
    let tileCount: Int
    let estimatedBytes: Int
}

nonisolated enum FletcherTilePlanner {
    private static let maxWebMercatorLatitude = 85.05112878

    /// The tiles a saved area actually needs.
    ///
    /// A selection is a rectangle, but the survey is 24 sheets with ragged
    /// edges, so most rectangles contain ground no sheet covers. Those
    /// coordinates are dropped here rather than attempted and failed: a
    /// download that reports failures for tiles that do not exist leaves the
    /// area permanently "partial", and every Retry asks for them again. Since
    /// the same filter feeds `tileCount`, the size estimate the user agrees to
    /// is also the number of tiles that will really be fetched.
    static func coordinates(for bounds: MapBounds, zoomRange: ClosedRange<Int>) -> [TileCoordinate] {
        guard let normalized = clippedToCoverage(bounds) else { return [] }
        var coordinates: Set<TileCoordinate> = []

        for zoom in zoomRange {
            let range = tileRange(for: normalized, zoom: zoom)

            for x in range.x {
                for y in range.y where isCovered(x: x, y: y, z: zoom) {
                    coordinates.insert(TileCoordinate(z: zoom, x: x, y: y))
                }
            }
        }

        return coordinates.sorted {
            if $0.z != $1.z { return $0.z < $1.z }
            if $0.x != $1.x { return $0.x < $1.x }
            return $0.y < $1.y
        }
    }

    /// Whether any Fletcher sheet has ground at this tile.
    static func isCovered(x: Int, y: Int, z: Int) -> Bool {
        !FletcherSheets.sheets(coveringTileX: x, y: y, z: z).isEmpty
    }

    static func estimate(
        bounds: MapBounds,
        zoomRange: ClosedRange<Int>,
        averageTileBytes: Int
    ) -> TileEstimate {
        let count = tileCount(for: bounds, zoomRange: zoomRange)
        let (estimatedBytes, didOverflow) = count.multipliedReportingOverflow(by: averageTileBytes)
        return TileEstimate(
            tileCount: count,
            estimatedBytes: didOverflow ? Int.max : estimatedBytes
        )
    }

    /// The most tiles `tileCount` will enumerate before it stops counting.
    ///
    /// Comfortably above `OfflineAreasViewModel.maximumSavedAreaTileCount`, so
    /// every count the user can actually act on is exact. It is only the
    /// already-rejected range that is approximated — see `tileCount`.
    static let countingLimit = 200_000

    /// How many tiles a saved area will really fetch.
    ///
    /// Counts the same filtered set `coordinates` produces rather than the area
    /// of the rectangle, so the size the user is asked to approve is the size
    /// they get. Selecting a rectangle that is mostly ocean used to quote a
    /// download several times larger than the one that followed.
    ///
    /// Stops at `countingLimit`, and the reason is that this runs on the main
    /// actor while the user drags the selection. Clipping to coverage bounds the
    /// scan by the survey rather than the viewport, but the survey is still
    /// ~2.2 million tiles at zoom 18, and a per-tile sheet test over that is a
    /// visible stall on every drag. Past the limit the return value is a floor
    /// rather than a count — which is all it is used for, because a draft that
    /// large is refused either way and the exact size of a download that will
    /// not happen is not worth the scan.
    static func tileCount(for bounds: MapBounds, zoomRange: ClosedRange<Int>) -> Int {
        guard let normalized = clippedToCoverage(bounds) else { return 0 }
        var count = 0

        for zoom in zoomRange {
            let range = tileRange(for: normalized, zoom: zoom)
            for x in range.x {
                for y in range.y where isCovered(x: x, y: y, z: zoom) {
                    count += 1
                    if count >= countingLimit { return count }
                }
            }
        }

        return count
    }

    /// `bounds` narrowed to the ground the survey covers, or `nil` for none.
    ///
    /// The clip is what keeps the loops above bounded by Nova Scotia instead of
    /// by the user's viewport: without it, a selection made while zoomed out to
    /// the whole world would iterate billions of coordinates at zoom 16 to
    /// discard almost all of them.
    private static func clippedToCoverage(_ bounds: MapBounds) -> MapBounds? {
        let normalized = bounds.normalized
        let selection = GeoBoundingBox(
            south: normalized.minLatitude,
            west: normalized.minLongitude,
            north: normalized.maxLatitude,
            east: normalized.maxLongitude
        )
        guard let clipped = selection.intersection(with: FletcherSheets.coverage) else {
            return nil
        }
        return MapBounds(
            minLatitude: clipped.south,
            minLongitude: clipped.west,
            maxLatitude: clipped.north,
            maxLongitude: clipped.east
        )
    }

    private static func tileRange(
        for bounds: MapBounds,
        zoom: Int
    ) -> (x: ClosedRange<Int>, y: ClosedRange<Int>) {
        let northWest = tileXY(
            latitude: bounds.maxLatitude,
            longitude: bounds.minLongitude,
            zoom: zoom
        )
        let southEast = tileXY(
            latitude: bounds.minLatitude,
            longitude: bounds.maxLongitude,
            zoom: zoom
        )

        return (
            min(northWest.x, southEast.x)...max(northWest.x, southEast.x),
            min(northWest.y, southEast.y)...max(northWest.y, southEast.y)
        )
    }

    private static func tileXY(latitude: Double, longitude: Double, zoom: Int) -> (x: Int, y: Int) {
        let clampedLatitude = min(max(latitude, -maxWebMercatorLatitude), maxWebMercatorLatitude)
        let latitudeRadians = clampedLatitude * .pi / 180
        let tilesAtZoom = pow(2.0, Double(zoom))
        let x = Int(floor((longitude + 180.0) / 360.0 * tilesAtZoom))
        let y = Int(floor((1.0 - log(tan(latitudeRadians) + 1.0 / cos(latitudeRadians)) / .pi) / 2.0 * tilesAtZoom))
        let clampedMax = Int(tilesAtZoom) - 1

        return (
            min(max(x, 0), clampedMax),
            min(max(y, 0), clampedMax)
        )
    }
}
