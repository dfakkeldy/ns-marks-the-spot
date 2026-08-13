import Foundation
import GeoCore
import MapCatalog

/// Builds the paged viewport query every ArcGIS feature overlay shares.
///
/// Ported from `web/src/services/arcGISFeatureOverlay.ts`. The parameters are
/// written in the web's order because that is the byte sequence the services
/// have been exercised with, and because the parity test compares the two
/// strings rather than two parsed dictionaries.
public enum FeatureOverlayQuery {
    /// Records asked for per request, and the number of requests allowed.
    ///
    /// The page limit is a safety stop, not a paging strategy: twenty thousand
    /// features in one viewport means the caller is asking at a zoom the layer
    /// was never meant to be drawn at, and answering with a truncated collection
    /// would draw a partial map that looks complete.
    public static let pageSize = 2_000
    public static let maximumPages = 10

    /// The field the mineral catalog pages and deduplicates by.
    ///
    /// Only a default: services outside that catalog do not publish `geo_id`,
    /// and ordering by a field a service does not have fails the whole query
    /// rather than falling back.
    public static let defaultIDField = "geo_id"

    public enum Refusal: Error, Equatable, Sendable {
        case licenceNotAccepted
        case noServiceURL
        case malformedURL
    }

    /// What one overlay asks a service for.
    public struct Plan: Sendable, Equatable {
        public let serviceURL: URL
        public let bounds: GeoBoundingBox
        public let outFields: [String]
        public let distanceMetres: Double?
        public let whereClause: String
        public let orderByFields: String
        public let idField: String

        public init(
            serviceURL: URL,
            bounds: GeoBoundingBox,
            outFields: [String],
            distanceMetres: Double? = nil,
            whereClause: String = "1=1",
            orderByFields: String = FeatureOverlayQuery.defaultIDField,
            idField: String = FeatureOverlayQuery.defaultIDField
        ) {
            self.serviceURL = serviceURL
            self.bounds = bounds
            self.outFields = outFields
            self.distanceMetres = distanceMetres
            self.whereClause = whereClause
            self.orderByFields = orderByFields
            self.idField = idField
        }
    }

    /// The plan for a catalogued layer, gated on the Province licence.
    ///
    /// The gate stands in front of the URL rather than in front of the request
    /// so that no restricted service URL is ever assembled, let alone sent.
    public static func plan(
        for layer: LayerID,
        bounds: GeoBoundingBox,
        outFields: [String],
        distanceMetres: Double? = nil,
        whereClause: String = "1=1",
        orderByFields: String = defaultIDField,
        idField: String = defaultIDField,
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> Plan {
        guard let descriptor = LayerCatalog.descriptor(for: layer) else {
            throw .noServiceURL
        }
        guard clearance.allows(layer) else { throw .licenceNotAccepted }
        guard let serviceURL = descriptor.serviceURL else { throw .noServiceURL }

        return Plan(
            serviceURL: serviceURL,
            bounds: bounds,
            outFields: outFields,
            distanceMetres: distanceMetres,
            whereClause: whereClause,
            orderByFields: orderByFields,
            idField: idField
        )
    }

    /// One page of `plan`, as a URL.
    public static func url(for plan: Plan, page: Int) throws(Refusal) -> URL {
        let base = plan.serviceURL.absoluteString
        let trimmed = base.hasSuffix("/") ? String(base.dropLast()) : base
        guard var components = URLComponents(string: "\(trimmed)/query") else {
            throw .malformedURL
        }

        var items = [
            URLQueryItem(name: "where", value: plan.whereClause),
            URLQueryItem(
                name: "geometry",
                value: [plan.bounds.west, plan.bounds.south, plan.bounds.east, plan.bounds.north]
                    .map(ArcGISExportURL.jsNumber)
                    .joined(separator: ",")
            ),
            URLQueryItem(name: "geometryType", value: "esriGeometryEnvelope"),
            URLQueryItem(name: "spatialRel", value: "esriSpatialRelIntersects"),
        ]
        if let distanceMetres = plan.distanceMetres {
            items.append(
                URLQueryItem(name: "distance", value: ArcGISExportURL.jsNumber(distanceMetres))
            )
            items.append(URLQueryItem(name: "units", value: "esriSRUnit_Meter"))
        }
        items.append(contentsOf: [
            URLQueryItem(name: "inSR", value: "4326"),
            URLQueryItem(name: "outSR", value: "4326"),
            URLQueryItem(name: "outFields", value: plan.outFields.joined(separator: ",")),
            URLQueryItem(name: "returnGeometry", value: "true"),
            URLQueryItem(name: "resultRecordCount", value: String(pageSize)),
            URLQueryItem(name: "resultOffset", value: String(page * pageSize)),
            URLQueryItem(name: "orderByFields", value: plan.orderByFields),
            URLQueryItem(name: "f", value: "geojson"),
        ])

        components.queryItems = items
        guard let url = components.url else { throw .malformedURL }
        return url
    }
}
