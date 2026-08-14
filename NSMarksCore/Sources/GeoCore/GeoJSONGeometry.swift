import Foundation

/// A GeoJSON geometry, as the viewport feature services return it.
///
/// Modelled here rather than in the service layer because it is geometry: the
/// renderer draws it, the hit test asks questions of it, and neither should
/// have to import a network module to hold a shape.
///
/// GeoJSON position order is `[longitude, latitude]` throughout, which is the
/// opposite of how this app writes points aloud. The decoder is the only place
/// that order is read, so the swap happens once.
///
/// The seven-member GeoJSON type list is deliberately not complete here:
/// `GeometryCollection` is absent because no service this app queries returns
/// one, and inventing a representation for a case nothing produces would mean
/// untested code deciding how a mixed shape draws.
public enum GeoJSONGeometry: Hashable, Sendable {
    case point(GeoPoint)
    case multiPoint([GeoPoint])
    case lineString([GeoPoint])
    case multiLineString([[GeoPoint]])
    /// Outer ring first, then holes.
    case polygon(PolygonHitTest.PolygonPart)
    case multiPolygon([PolygonHitTest.PolygonPart])

    /// The areal parts, in the shape `PolygonHitTest` asks for.
    ///
    /// Empty for point and line geometry — those enclose no ground, so "is this
    /// place inside it" has no answer rather than the answer no.
    public var polygonParts: [PolygonHitTest.PolygonPart] {
        switch self {
        case .polygon(let part): [part]
        case .multiPolygon(let parts): parts
        case .point, .multiPoint, .lineString, .multiLineString: []
        }
    }

    /// Every position in the geometry, in document order.
    public var positions: [GeoPoint] {
        switch self {
        case .point(let point): [point]
        case .multiPoint(let points): points
        case .lineString(let line): line
        case .multiLineString(let lines): lines.flatMap { $0 }
        case .polygon(let rings): rings.flatMap { $0 }
        case .multiPolygon(let parts): parts.flatMap { $0.flatMap { $0 } }
        }
    }

    /// The smallest box holding the geometry, or `nil` when it has no positions.
    public var boundingBox: GeoBoundingBox? {
        var iterator = positions.makeIterator()
        guard let first = iterator.next() else { return nil }
        var box = GeoBoundingBox(
            south: first.lat, west: first.lng, north: first.lat, east: first.lng
        )
        while let point = iterator.next() {
            box.south = Swift.min(box.south, point.lat)
            box.north = Swift.max(box.north, point.lat)
            box.west = Swift.min(box.west, point.lng)
            box.east = Swift.max(box.east, point.lng)
        }
        return box
    }
}

extension GeoJSONGeometry: Decodable {
    /// Why a geometry could not be read.
    ///
    /// A geometry that cannot be read is dropped by the caller rather than
    /// guessed at: a zone polygon with a mangled ring is a zone whose extent is
    /// unknown, and drawing a repaired version of it would put a boundary on
    /// the map that no by-law drew.
    public struct Unreadable: Error, Equatable, Sendable {
        public init() {}
    }

    private enum CodingKeys: String, CodingKey {
        case type
        case coordinates
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        func position(_ pair: [Double]) throws -> GeoPoint {
            // GeoJSON allows a third element for elevation; nothing here uses
            // it, but a position carrying one is still a valid position.
            guard pair.count >= 2, pair[0].isFinite, pair[1].isFinite else {
                throw Unreadable()
            }
            return GeoPoint(lat: pair[1], lng: pair[0])
        }

        /// A line needs two positions to be a line.
        ///
        /// Refused here rather than dropped later: a one-position line decodes
        /// happily and then draws nothing, so the feature would vanish from the
        /// map while its query still reported a complete answer. Refusing it
        /// makes it an unreadable feature, which is a count the panel shows.
        func line(_ positions: [[Double]]) throws -> [GeoPoint] {
            let points = try positions.map(position)
            guard points.count >= 2 else { throw Unreadable() }
            return points
        }

        /// A ring needs four positions, the last repeating the first, which is
        /// the smallest closed shape GeoJSON defines.
        func ring(_ positions: [[Double]]) throws -> [GeoPoint] {
            let points = try positions.map(position)
            guard points.count >= 4 else { throw Unreadable() }
            return points
        }

        switch type {
        case "Point":
            self = .point(try position(try container.decode([Double].self, forKey: .coordinates)))
        case "MultiPoint":
            self = .multiPoint(
                try container.decode([[Double]].self, forKey: .coordinates).map(position)
            )
        case "LineString":
            self = .lineString(try line(container.decode([[Double]].self, forKey: .coordinates)))
        case "MultiLineString":
            self = .multiLineString(
                try container.decode([[[Double]]].self, forKey: .coordinates).map(line)
            )
        case "Polygon":
            self = .polygon(
                try container.decode([[[Double]]].self, forKey: .coordinates).map(ring)
            )
        case "MultiPolygon":
            self = .multiPolygon(
                try container.decode([[[[Double]]]].self, forKey: .coordinates)
                    .map { try $0.map(ring) }
            )
        default:
            throw Unreadable()
        }
    }
}
