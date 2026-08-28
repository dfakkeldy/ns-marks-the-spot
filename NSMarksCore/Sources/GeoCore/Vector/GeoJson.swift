import Foundation

/// A GeoJSON position: longitude first, then latitude, as RFC 7946 orders them.
///
/// Its own type rather than `GeoPoint` precisely because of that order. A
/// GeoJSON file writes `[lng, lat]` and every other coordinate in this app is
/// written latitude-first; a single struct used for both is a swap waiting to
/// happen, and a swapped Nova Scotian coordinate lands in the Indian Ocean
/// without failing anything.
public struct GeoJsonPosition: Hashable, Sendable, Codable {
    public var lng: Double
    public var lat: Double
    /// Kept when the file carried one. GPX tracks and KML placemarks routinely
    /// do, nothing here uses it, and dropping it would quietly change the
    /// user's data on the way through an export.
    public var altitude: Double?

    public init(lng: Double, lat: Double, altitude: Double? = nil) {
        self.lng = lng
        self.lat = lat
        self.altitude = altitude
    }

    public var point: GeoPoint { GeoPoint(lat: lat, lng: lng) }
}

/// The GeoJSON geometry types, as RFC 7946 defines them.
public indirect enum GeoJsonGeometry: Hashable, Sendable {
    case point(GeoJsonPosition)
    case multiPoint([GeoJsonPosition])
    case lineString([GeoJsonPosition])
    case multiLineString([[GeoJsonPosition]])
    case polygon([[GeoJsonPosition]])
    case multiPolygon([[[GeoJsonPosition]]])
    case collection([GeoJsonGeometry])

    /// Every position in the geometry, in document order.
    public var positions: [GeoJsonPosition] {
        switch self {
        case .point(let position): return [position]
        case .multiPoint(let positions), .lineString(let positions): return positions
        case .multiLineString(let lines), .polygon(let lines): return lines.flatMap { $0 }
        case .multiPolygon(let polygons): return polygons.flatMap { $0.flatMap { $0 } }
        case .collection(let geometries): return geometries.flatMap(\.positions)
        }
    }

    /// Whether there is anything here to draw.
    ///
    /// An empty geometry collection is well-formed GeoJSON and paints nothing;
    /// a layer made only of those would appear in the panel, claim its
    /// features, and leave the map unchanged.
    public var isRenderable: Bool {
        if case .collection(let geometries) = self { return !geometries.isEmpty }
        return true
    }

    public var typeName: String {
        switch self {
        case .point: return "Point"
        case .multiPoint: return "MultiPoint"
        case .lineString: return "LineString"
        case .multiLineString: return "MultiLineString"
        case .polygon: return "Polygon"
        case .multiPolygon: return "MultiPolygon"
        case .collection: return "GeometryCollection"
        }
    }
}

/// One feature of a user's vector layer.
///
/// A null geometry is legal GeoJSON — an attribute row with no place — and it
/// is kept rather than dropped so an export returns the file the user gave us.
public struct GeoJsonFeature: Hashable, Sendable {
    /// Always set once the feature has been through `UserVectorParse.normalize`;
    /// optional only because a file may not carry one.
    public var id: String?
    public var geometry: GeoJsonGeometry?
    public var properties: [String: JSONValue]

    public init(
        id: String? = nil, geometry: GeoJsonGeometry?, properties: [String: JSONValue] = [:]
    ) {
        self.id = id
        self.geometry = geometry
        self.properties = properties
    }
}

/// A parsed layer: the features, and where they are.
public struct ParsedVector: Hashable, Sendable {
    public var features: [GeoJsonFeature]
    /// Nil when nothing in the layer has a position — a file of attribute rows
    /// with null geometry. Distinct from a zero-sized box, which is a real
    /// place: one single point.
    public var bbox: GeoBoundingBox?

    public init(features: [GeoJsonFeature], bbox: GeoBoundingBox?) {
        self.features = features
        self.bbox = bbox
    }

    public var featureCount: Int { features.count }
}
