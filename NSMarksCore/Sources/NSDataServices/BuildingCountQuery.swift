import Foundation
import GeoCore
import MapCatalog

/// Asks the NSTDB buildings service how many buildings it has mapped on a
/// parcel.
///
/// A port of the web's `buildings.ts`. The three sublayers are asked with
/// `returnCountOnly`, so the reply is a number and no building geometry is
/// fetched — the same request the web makes, and the reason this can run on
/// every selection without pulling footprints down.
///
/// The address and the licence gate come from the catalog's `.buildings`
/// descriptor, the same service the map draws.
public enum BuildingCountQuery {
    /// The sublayers, in the web's order.
    ///
    /// Two point layers and one polygon layer. NSTDB splits building points by
    /// whether the structure is classified; both are buildings, and the web
    /// adds them together before showing a number.
    public static let classifiedPointSublayer = 2
    public static let unclassifiedPointSublayer = 3
    public static let polygonSublayer = 4

    public static let sublayers = [
        classifiedPointSublayer, unclassifiedPointSublayer, polygonSublayer,
    ]

    public enum Refusal: Error, Equatable, Sendable {
        /// NSTDB is Province-restricted and the user has not accepted.
        case licenceNotAccepted
        /// The parcel has no rings to ask about. Nothing was asked, so a count
        /// of zero would be this app's number rather than the Province's.
        case noBoundary
        case noServiceURL
        case malformedURL
    }

    public struct Request: Sendable, Equatable {
        public let url: URL
        public let body: String
        public let sublayer: Int
    }

    /// One request per sublayer, all against the parcel's own rings.
    public static func requests(
        for parts: [PolygonHitTest.PolygonPart],
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> [Request] {
        guard clearance.allows(.buildings) else { throw .licenceNotAccepted }

        let rings = MappedFeatureQuery.arcGISRings(from: parts)
        guard !rings.isEmpty else { throw .noBoundary }

        let geometry = MappedFeatureQuery.geometryJSON(rings)
        return try sublayers.map { sublayer throws(Refusal) in
            try request(sublayer: sublayer, geometry: geometry)
        }
    }

    /// Insertion order is `URLSearchParams`' order, and it is part of the byte
    /// match with the web.
    private static func request(sublayer: Int, geometry: String) throws(Refusal) -> Request {
        guard let service = LayerCatalog.descriptor(for: .buildings)?.serviceURL else {
            throw .noServiceURL
        }
        var base = service.absoluteString
        while base.hasSuffix("/") {
            base.removeLast()
        }
        guard let url = URL(string: "\(base)/\(sublayer)/query") else { throw .malformedURL }

        let parameters: [(String, String)] = [
            ("f", "json"),
            ("where", "1=1"),
            ("geometry", geometry),
            ("geometryType", "esriGeometryPolygon"),
            ("inSR", "4326"),
            ("spatialRel", "esriSpatialRelIntersects"),
            ("returnCountOnly", "true"),
        ]
        let body = parameters
            .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
            .joined(separator: "&")
        return Request(url: url, body: body, sublayer: sublayer)
    }
}
