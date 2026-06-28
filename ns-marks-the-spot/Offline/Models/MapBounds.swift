import Foundation

struct MapBounds: Equatable, Codable {
    let minLatitude: Double
    let minLongitude: Double
    let maxLatitude: Double
    let maxLongitude: Double

    var normalized: MapBounds {
        MapBounds(
            minLatitude: min(minLatitude, maxLatitude),
            minLongitude: min(minLongitude, maxLongitude),
            maxLatitude: max(minLatitude, maxLatitude),
            maxLongitude: max(minLongitude, maxLongitude)
        )
    }
}
