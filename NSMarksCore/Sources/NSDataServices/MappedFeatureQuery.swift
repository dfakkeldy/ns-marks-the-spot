import Foundation
import GeoCore
import MapCatalog

/// Asks the NSTDB road and water services what they have mapped on a parcel.
///
/// This is the query behind the inspector's "roads" and "water" lists. It is a
/// port of the web's `parcelContext.ts`, including the part that matters most:
/// the request is made against the parcel's own rings, so an answer is about
/// that property rather than about a bounding box or a nearby point.
///
/// The addresses and the licence gate both come from the catalog descriptors
/// for `.roads` and `.waterFeatures` — the same services the map draws. Writing
/// the URLs out again here would let the layer a user is looking at and the
/// evidence they are reading drift onto different hosts.
public enum MappedFeatureQuery {
    /// How far from the parcel a road still counts as reaching it.
    ///
    /// The web's `ADJACENT_ROAD_DISTANCE_METRES`. It is a screening distance,
    /// not a frontage or access finding: a road within 20 m of the boundary is
    /// worth looking at, and is not a right of way.
    public static let adjacentRoadDistanceMetres = 20

    /// Whether the feature crosses the parcel or merely comes near it.
    public enum Relationship: String, Sendable, Equatable {
        case intersects
        case adjacent
    }

    /// One sublayer of one NSTDB service.
    ///
    /// `fallbackKind` is what a feature is called when the service sends no
    /// usable name or description — it names the sublayer that answered, which
    /// is a fact, rather than guessing at the feature.
    public struct Layer: Sendable, Equatable {
        public let layerID: LayerID
        public let sublayer: Int
        public let fallbackKind: String
        public let fields: String
    }

    /// Why no request was produced.
    public enum Refusal: Error, Equatable, Sendable {
        /// NSTDB is Province-restricted and the user has not accepted.
        case licenceNotAccepted
        /// The parcel has no rings to ask about. Distinct from a query that
        /// found nothing: nothing was asked, so nothing was learned.
        case noBoundary
        /// The catalog has no descriptor for the layer, or it carries no URL.
        case noServiceURL
        case malformedURL
    }

    /// A single POST, ready to send.
    ///
    /// The geometry is a parcel outline, which is far too long for a query
    /// string — hence the form body, which is what the web sends too.
    public struct Request: Sendable, Equatable {
        public let url: URL
        public let body: String
        public let layer: Layer
        public let relationship: Relationship
    }

    /// The road sublayers, in the web's order.
    public static let roadLayers: [Layer] = [
        Layer(layerID: .roads, sublayer: 3, fallbackKind: "Road point", fields: "FEAT_DESC"),
        Layer(layerID: .roads, sublayer: 5, fallbackKind: "Bridge", fields: roadFields),
        Layer(layerID: .roads, sublayer: 6, fallbackKind: "Railway", fields: roadFields),
        Layer(layerID: .roads, sublayer: 7, fallbackKind: "Highway", fields: roadFields),
        Layer(layerID: .roads, sublayer: 8, fallbackKind: "Road or trail", fields: roadFields),
        Layer(layerID: .roads, sublayer: 9, fallbackKind: "Ferry crossing", fields: roadFields),
        Layer(layerID: .roads, sublayer: 10, fallbackKind: "Non-vehicle feature", fields: "FEAT_DESC"),
        Layer(layerID: .roads, sublayer: 11, fallbackKind: "Road polygon", fields: "FEAT_DESC"),
    ]

    /// The water sublayers, in the web's order.
    public static let waterLayers: [Layer] = [
        Layer(layerID: .waterFeatures, sublayer: 1, fallbackKind: "Water point", fields: "FEAT_DESC"),
        Layer(layerID: .waterFeatures, sublayer: 3, fallbackKind: "Dry water feature", fields: waterFields),
        Layer(layerID: .waterFeatures, sublayer: 4, fallbackKind: "Water line", fields: waterFields),
        Layer(layerID: .waterFeatures, sublayer: 6, fallbackKind: "Dry water area", fields: "FEAT_DESC"),
        Layer(layerID: .waterFeatures, sublayer: 7, fallbackKind: "Rapids", fields: "FEAT_DESC"),
        Layer(layerID: .waterFeatures, sublayer: 8, fallbackKind: "Water area", fields: "FEAT_DESC"),
    ]

    private static let roadFields = "FEAT_DESC,STREET,RTE_NO,ROADC_DESC"
    private static let waterFields = "FEAT_DESC,RIVNAME_1,RIVNAME_2"

    /// Every request needed to describe what is mapped on `parts`.
    ///
    /// Twenty-two of them: each of the eight road sublayers is asked twice,
    /// once for what crosses the parcel and once for what comes within
    /// `adjacentRoadDistanceMetres` of it, and each water sublayer once. The
    /// caller sends them together and fails the whole set if any one fails —
    /// a partial answer here reads as "nothing else is mapped on this parcel",
    /// which is the wrong conclusion to hand someone.
    public static func requests(
        for parts: [PolygonHitTest.PolygonPart],
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> [Request] {
        guard clearance.allows(.roads), clearance.allows(.waterFeatures) else {
            throw .licenceNotAccepted
        }
        let rings = arcGISRings(from: parts)
        guard !rings.isEmpty else { throw .noBoundary }

        let geometry = geometryJSON(rings)
        var requests: [Request] = []
        requests.reserveCapacity(roadLayers.count * 2 + waterLayers.count)
        for layer in roadLayers {
            requests.append(try request(layer, geometry: geometry, relationship: .intersects))
        }
        for layer in roadLayers {
            requests.append(try request(layer, geometry: geometry, relationship: .adjacent))
        }
        for layer in waterLayers {
            requests.append(try request(layer, geometry: geometry, relationship: .intersects))
        }
        return requests
    }

    /// Every ring of every part, wound the way ArcGIS reads them.
    ///
    /// GeoJSON winds outer rings counter-clockwise and holes clockwise; ArcGIS
    /// reads the opposite. Reversing each ring converts both at once, which is
    /// why outer rings and holes can be flattened into one list — the winding
    /// is what tells the service which is which. This is the web's
    /// `ringsForFeatures`, and it is the reason `ParcelResponse` keeps rings in
    /// GeoJSON order rather than reversing them at decode.
    static func arcGISRings(from parts: [PolygonHitTest.PolygonPart]) -> [PolygonHitTest.Ring] {
        parts.flatMap { part in
            part.map { ring in Array(ring.reversed()) }
        }
    }

    /// `JSON.stringify` of the web's geometry object, byte for byte.
    static func geometryJSON(_ rings: [PolygonHitTest.Ring]) -> String {
        let encoded = rings
            .map { ring in
                "[" + ring
                    .map { "[\(ArcGISExportURL.jsNumber($0.lng)),\(ArcGISExportURL.jsNumber($0.lat))]" }
                    .joined(separator: ",") + "]"
            }
            .joined(separator: ",")
        return #"{"rings":[\#(encoded)],"spatialReference":{"wkid":4326}}"#
    }

    /// Insertion order is `URLSearchParams`' order, and it is part of the byte
    /// match with the web.
    private static func request(
        _ layer: Layer,
        geometry: String,
        relationship: Relationship
    ) throws(Refusal) -> Request {
        guard let service = LayerCatalog.descriptor(for: layer.layerID)?.serviceURL else {
            throw .noServiceURL
        }
        var base = service.absoluteString
        while base.hasSuffix("/") {
            base.removeLast()
        }
        guard let url = URL(string: "\(base)/\(layer.sublayer)/query") else {
            throw .malformedURL
        }

        var parameters: [(String, String)] = [
            ("f", "json"),
            ("where", "1=1"),
            ("geometry", geometry),
            ("geometryType", "esriGeometryPolygon"),
            ("inSR", "4326"),
            ("spatialRel", "esriSpatialRelIntersects"),
            ("outFields", layer.fields),
            ("returnGeometry", "false"),
        ]
        if relationship == .adjacent {
            parameters.append(("distance", String(adjacentRoadDistanceMetres)))
            parameters.append(("units", "esriSRUnit_Meter"))
        }

        let body = parameters
            .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
            .joined(separator: "&")
        return Request(url: url, body: body, layer: layer, relationship: relationship)
    }
}
