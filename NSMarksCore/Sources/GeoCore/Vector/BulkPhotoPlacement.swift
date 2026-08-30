import Foundation

/// Pure classification for bulk EXIF / PhotoKit placement.
///
/// A geotag decides whether a photo can become a point at all. The viewport
/// only decides the default check state — a photo from outside the current
/// view is still placeable, just not presumed wanted. Untagged photos are
/// unselectable (`inViewport == nil`).
/// Mirrors `web/src/userMaps/vector/photos/bulkPlacement.ts`.
public enum BulkPhotoPlacement {
    public struct Candidate: Sendable, Equatable {
        public var id: String
        public var gps: GeoPoint?
        public var capturedAt: String?

        public init(id: String, gps: GeoPoint?, capturedAt: String?) {
            self.id = id
            self.gps = gps
            self.capturedAt = capturedAt
        }
    }

    public struct Row: Sendable, Equatable {
        public var candidate: Candidate
        /// `nil` when the photo has no geotag (not placeable).
        public var inViewport: Bool?
        public var checkedByDefault: Bool

        public var isPlaceable: Bool { inViewport != nil }
    }

    public static func classify(
        _ candidates: [Candidate],
        bounds: GeoBoundingBox?
    ) -> [Row] {
        candidates.map { candidate in
            guard let gps = candidate.gps else {
                return Row(candidate: candidate, inViewport: nil, checkedByDefault: false)
            }
            let inViewport = bounds?.contains(gps) ?? false
            return Row(
                candidate: candidate,
                inViewport: inViewport,
                checkedByDefault: inViewport
            )
        }
    }
}
