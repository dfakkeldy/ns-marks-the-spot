import Foundation

/// The in-memory photo-map index: geotagged assets bucketed by z15 web-Mercator
/// tile so a viewport query unions intersecting buckets instead of scanning
/// the whole library. PhotoKit has no location predicate; this is what
/// stands in. Persistence of the snapshot lives with the app; this type is
/// pure so the cap and the bucket math test mac-native.
public enum PhotoMapIndex {
    public static let bucketZoom = 15
    /// MapKit clustering still has a per-viewport ceiling. Over this, the
    /// row says "Zoom in to see all photos" and the extras are not mounted.
    public static let maxAnnotations = 500

    public struct Entry: Hashable, Sendable, Codable {
        public var id: String
        public var latitude: Double
        public var longitude: Double
        public var capturedAt: String?

        public init(id: String, latitude: Double, longitude: Double, capturedAt: String?) {
            self.id = id
            self.latitude = latitude
            self.longitude = longitude
            self.capturedAt = capturedAt
        }

        public var point: GeoPoint { GeoPoint(lat: latitude, lng: longitude) }
    }

    public struct Snapshot: Sendable, Equatable {
        public var entries: [Entry]
        /// Serialized `PHPersistentChangeToken`, opaque to this type.
        public var changeToken: Data?

        public init(entries: [Entry], changeToken: Data? = nil) {
            self.entries = entries
            self.changeToken = changeToken
        }
    }

    public struct Viewport: Sendable, Equatable {
        public var entries: [Entry]
        public var truncated: Bool
        public var totalInView: Int

        public init(entries: [Entry], truncated: Bool, totalInView: Int) {
            self.entries = entries
            self.truncated = truncated
            self.totalInView = totalInView
        }
    }

    public static func bucket(for point: GeoPoint) -> (x: Int, y: Int) {
        TileMath.tileXY(latitude: point.lat, longitude: point.lng, zoom: bucketZoom)
    }

    /// Entries whose z15 bucket intersects `bounds`, then those whose point
    /// is inside the box, capped at `maxAnnotations`.
    public static func viewport(
        _ snapshot: Snapshot,
        bounds: GeoBoundingBox
    ) -> Viewport {
        let west = bucket(for: GeoPoint(lat: bounds.north, lng: bounds.west))
        let east = bucket(for: GeoPoint(lat: bounds.south, lng: bounds.east))
        let minX = min(west.x, east.x)
        let maxX = max(west.x, east.x)
        let minY = min(west.y, east.y)
        let maxY = max(west.y, east.y)

        var inView: [Entry] = []
        for entry in snapshot.entries {
            let tile = bucket(for: entry.point)
            guard tile.x >= minX, tile.x <= maxX, tile.y >= minY, tile.y <= maxY else {
                continue
            }
            guard bounds.contains(entry.point) else { continue }
            inView.append(entry)
        }
        let truncated = inView.count > maxAnnotations
        return Viewport(
            entries: truncated ? Array(inView.prefix(maxAnnotations)) : inView,
            truncated: truncated,
            totalInView: inView.count
        )
    }
}
