import Foundation

nonisolated struct TileEstimate: Equatable, Sendable {
    let tileCount: Int
    let estimatedBytes: Int
}

nonisolated enum FletcherTilePlanner {
    private static let maxWebMercatorLatitude = 85.05112878

    static func coordinates(for bounds: MapBounds, zoomRange: ClosedRange<Int>) -> [TileCoordinate] {
        let normalized = bounds.normalized
        var coordinates: Set<TileCoordinate> = []

        for zoom in zoomRange {
            let range = tileRange(for: normalized, zoom: zoom)

            for x in range.x {
                for y in range.y {
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

    static func tileCount(for bounds: MapBounds, zoomRange: ClosedRange<Int>) -> Int {
        let normalized = bounds.normalized
        var count = 0

        for zoom in zoomRange {
            let range = tileRange(for: normalized, zoom: zoom)
            let (zoomCount, zoomOverflow) = range.x.count.multipliedReportingOverflow(by: range.y.count)
            if zoomOverflow {
                return Int.max
            }
            let (newCount, didOverflow) = count.addingReportingOverflow(zoomCount)
            count = didOverflow ? Int.max : newCount
        }

        return count
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
