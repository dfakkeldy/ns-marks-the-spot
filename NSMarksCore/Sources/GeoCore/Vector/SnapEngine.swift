import Foundation

/// Vertex-first snap candidates over the contract's two sources.
///
/// The source enum is the zoning exclusion: it has no zoning case, and a
/// test asserts that. Parcel rings with unreadable or not-supplied
/// boundaries contribute nothing — never a partial ring.
public enum SnapEngine {
    /// The only things geometry may snap to.
    public enum Source: String, CaseIterable, Sendable {
        case ownFeature
        case parcel
    }

    public enum Kind: String, Sendable {
        case vertex
        case edge
    }

    public struct Target: Sendable {
        public var source: Source
        public var vertices: [GeoPoint]
        public var segments: [(GeoPoint, GeoPoint)]

        public init(source: Source, vertices: [GeoPoint], segments: [(GeoPoint, GeoPoint)]) {
            self.source = source
            self.vertices = vertices
            self.segments = segments
        }

        /// Vertices and consecutive edges from a user feature. Closing
        /// duplicates on rings are dropped so a vertex is not offered twice.
        public static func ownFeature(_ geometry: GeoJsonGeometry) -> Target {
            from(geometry, source: .ownFeature)
        }

        /// One parcel ring-set. Empty when the boundary was not supplied or
        /// could not be read.
        public static func parcel(rings: PolygonHitTest.PolygonPart) -> Target {
            var vertices: [GeoPoint] = []
            var segments: [(GeoPoint, GeoPoint)] = []
            for ring in rings {
                append(ring: ring, vertices: &vertices, segments: &segments)
            }
            return Target(source: .parcel, vertices: vertices, segments: segments)
        }

        private static func from(_ geometry: GeoJsonGeometry, source: Source) -> Target {
            var vertices: [GeoPoint] = []
            var segments: [(GeoPoint, GeoPoint)] = []
            switch geometry {
            case .point(let position):
                vertices.append(position.point)
            case .multiPoint(let positions):
                vertices.append(contentsOf: positions.map(\.point))
            case .lineString(let positions):
                append(open: positions.map(\.point), vertices: &vertices, segments: &segments)
            case .multiLineString(let lines):
                for line in lines {
                    append(open: line.map(\.point), vertices: &vertices, segments: &segments)
                }
            case .polygon(let rings):
                for ring in rings {
                    append(ring: ring.map(\.point), vertices: &vertices, segments: &segments)
                }
            case .multiPolygon(let polygons):
                for rings in polygons {
                    for ring in rings {
                        append(ring: ring.map(\.point), vertices: &vertices, segments: &segments)
                    }
                }
            case .collection(let geometries):
                for child in geometries {
                    let nested = from(child, source: source)
                    vertices.append(contentsOf: nested.vertices)
                    segments.append(contentsOf: nested.segments)
                }
            }
            return Target(source: source, vertices: vertices, segments: segments)
        }

        private static func append(
            open points: [GeoPoint],
            vertices: inout [GeoPoint],
            segments: inout [(GeoPoint, GeoPoint)]
        ) {
            vertices.append(contentsOf: uniqueConsecutive(points))
            guard points.count >= 2 else { return }
            for index in 1..<points.count {
                segments.append((points[index - 1], points[index]))
            }
        }

        private static func append(
            ring points: [GeoPoint],
            vertices: inout [GeoPoint],
            segments: inout [(GeoPoint, GeoPoint)]
        ) {
            let corners = uniqueConsecutive(closedRing(points))
            vertices.append(contentsOf: corners)
            guard corners.count >= 2 else { return }
            for index in 0..<corners.count {
                segments.append((corners[index], corners[(index + 1) % corners.count]))
            }
        }

        private static func closedRing(_ points: [GeoPoint]) -> [GeoPoint] {
            guard points.count >= 2, points.first == points.last else { return points }
            return Array(points.dropLast())
        }

        private static func uniqueConsecutive(_ points: [GeoPoint]) -> [GeoPoint] {
            var result: [GeoPoint] = []
            for point in points {
                if result.last != point { result.append(point) }
            }
            return result
        }
    }

    public struct Hit: Sendable, Equatable {
        public var point: GeoPoint
        public var source: Source
        public var kind: Kind
        public var distanceMetres: Double
    }

    /// The nearest vertex within `toleranceMetres`, else the nearest edge
    /// projection within that radius. Nil when nothing is close enough.
    public static func nearest(
        to point: GeoPoint,
        among targets: [Target],
        toleranceMetres: Double
    ) -> Hit? {
        guard toleranceMetres > 0 else { return nil }
        var bestVertex: Hit?
        for target in targets {
            for vertex in target.vertices {
                let distance = Geodesy.distanceMetres(from: point, to: vertex)
                guard distance <= toleranceMetres else { continue }
                if bestVertex.map({ distance < $0.distanceMetres }) ?? true {
                    bestVertex = Hit(
                        point: vertex, source: target.source, kind: .vertex,
                        distanceMetres: distance
                    )
                }
            }
        }
        if let bestVertex { return bestVertex }

        var bestEdge: Hit?
        for target in targets {
            for (a, b) in target.segments {
                let projection = Geodesy.nearestPointOnSegment(point: point, a: a, b: b)
                guard projection.distanceMetres <= toleranceMetres else { continue }
                // A projection that landed on an endpoint is a vertex hit —
                // the contract's vertex-first rule already searched vertices,
                // but a segment endpoint that was filtered as a duplicate
                // still counts as a corner.
                let kind: Kind =
                    projection.t <= 1e-9 || projection.t >= 1 - 1e-9 ? .vertex : .edge
                if kind == .vertex, bestVertex != nil { continue }
                if bestEdge.map({ projection.distanceMetres < $0.distanceMetres }) ?? true {
                    bestEdge = Hit(
                        point: projection.point, source: target.source, kind: kind,
                        distanceMetres: projection.distanceMetres
                    )
                }
            }
        }
        return bestEdge
    }
}
