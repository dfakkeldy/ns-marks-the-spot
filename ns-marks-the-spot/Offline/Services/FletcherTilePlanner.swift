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
            let northWest = tileXY(
                latitude: normalized.maxLatitude,
                longitude: normalized.minLongitude,
                zoom: zoom
            )
            let southEast = tileXY(
                latitude: normalized.minLatitude,
                longitude: normalized.maxLongitude,
                zoom: zoom
            )

            for x in northWest.x...southEast.x {
                for y in northWest.y...southEast.y {
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
        let count = coordinates(for: bounds, zoomRange: zoomRange).count
        return TileEstimate(tileCount: count, estimatedBytes: count * averageTileBytes)
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
