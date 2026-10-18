import Foundation

/// The in-memory photo-map index: geotagged assets bucketed by z15 web-Mercator
/// tile so a viewport query unions intersecting buckets instead of scanning
/// the whole library. PhotoKit has no location predicate; this is what
/// stands in. Persistence of the snapshot lives with the app; this type is
/// pure so the cap and the bucket math test mac-native.
public enum PhotoMapIndex {
    public static let bucketZoom = 15
    /// MapKit clustering still has a per-viewport ceiling. Over this, the
    /// most recent photos are kept, the row and the map say so, and the
    /// extras are not mounted.
    public static let maxAnnotations = 500

    public struct Entry: Hashable, Sendable, Codable {
        public var id: String
        public var latitude: Double
        public var longitude: Double
        public var capturedAt: String?
        /// Pixel size, when the library reported one. Nil on entries written
        /// before it was kept; the card then loads the thumbnail without an
        /// aspect to reserve for it.
        public var width: Int?
        public var height: Int?

        public init(
            id: String, latitude: Double, longitude: Double, capturedAt: String?,
            width: Int? = nil, height: Int? = nil
        ) {
            self.id = id
            self.latitude = latitude
            self.longitude = longitude
            self.capturedAt = capturedAt
            self.width = width
            self.height = height
        }

        public var point: GeoPoint { GeoPoint(lat: latitude, lng: longitude) }
    }

    /// The whole index at one moment, with the z15 buckets built once.
    ///
    /// Equality is the entries and the token: the buckets are derived from
    /// them, and two snapshots of the same library must compare equal so the
    /// map is not refreshed for a read that found nothing new.
    public struct Snapshot: Sendable, Equatable {
        public private(set) var entries: [Entry]
        /// Serialized `PHPersistentChangeToken`, opaque to this type.
        public var changeToken: Data?
        private var buckets: [Int64: [Int]]

        public init(entries: [Entry], changeToken: Data? = nil) {
            self.entries = entries
            self.changeToken = changeToken
            var buckets: [Int64: [Int]] = [:]
            for (index, entry) in entries.enumerated() {
                let tile = PhotoMapIndex.bucket(for: entry.point)
                buckets[PhotoMapIndex.key(x: tile.x, y: tile.y), default: []].append(index)
            }
            self.buckets = buckets
        }

        public static func == (lhs: Snapshot, rhs: Snapshot) -> Bool {
            lhs.entries == rhs.entries && lhs.changeToken == rhs.changeToken
        }

        /// The indices of the entries in one z15 bucket.
        func indices(x: Int, y: Int) -> [Int] {
            buckets[PhotoMapIndex.key(x: x, y: y)] ?? []
        }

        /// How many buckets hold anything; a test's window on the bucketing.
        public var bucketCount: Int { buckets.count }
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

    static func key(x: Int, y: Int) -> Int64 {
        (Int64(x) << 32) | Int64(UInt32(truncatingIfNeeded: y))
    }

    /// The order entries are kept and shown in: most recent first, then by id,
    /// so the same photos come out in the same order from any two reads and
    /// the subset kept above the cap is the same on every pan.
    public static func mostRecentFirst(_ lhs: Entry, _ rhs: Entry) -> Bool {
        if lhs.capturedAt != rhs.capturedAt {
            // ISO 8601 in one format sorts as text; a photo with no date goes
            // after every dated one.
            return (lhs.capturedAt ?? "") > (rhs.capturedAt ?? "")
        }
        return lhs.id > rhs.id
    }

    /// Entries whose z15 bucket intersects `bounds`, then those whose point
    /// is inside the box, most recent first, capped at `maxAnnotations`.
    ///
    /// The buckets are walked when there are fewer of them than entries; a
    /// province-wide view over a small library is the other way round, and
    /// scanning the entries is the cheaper read.
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
        let bucketSpan = (maxX - minX + 1) * (maxY - minY + 1)
        if bucketSpan <= snapshot.entries.count {
            for x in minX...maxX {
                for y in minY...maxY {
                    for index in snapshot.indices(x: x, y: y) {
                        let entry = snapshot.entries[index]
                        if bounds.contains(entry.point) {
                            inView.append(entry)
                        }
                    }
                }
            }
        } else {
            for entry in snapshot.entries where bounds.contains(entry.point) {
                inView.append(entry)
            }
        }
        inView.sort(by: mostRecentFirst)
        let truncated = inView.count > maxAnnotations
        return Viewport(
            entries: truncated ? Array(inView.prefix(maxAnnotations)) : inView,
            truncated: truncated,
            totalInView: inView.count
        )
    }
}
