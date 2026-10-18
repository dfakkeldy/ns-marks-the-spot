import Foundation
import GeoCore

/// Reads a GeoJSON page returned by an ArcGIS feature query.
public enum FeatureOverlayResponse {
    /// Why a page could not be read.
    ///
    /// None of these is a finding that the viewport is empty.
    public enum Failure: Error, Equatable, Sendable {
        case malformed
        case serviceError(code: Int?, message: String?)
    }

    /// One feature, with its geometry and the fields that were asked for.
    public struct Feature: Sendable, Equatable {
        /// The service's own feature id, when it publishes one.
        public let id: String?
        public let geometry: GeoJSONGeometry
        public let properties: [String: MappedFeatureResponse.AttributeValue]

        public init(
            id: String?,
            geometry: GeoJSONGeometry,
            properties: [String: MappedFeatureResponse.AttributeValue]
        ) {
            self.id = id
            self.geometry = geometry
            self.properties = properties
        }
    }

    /// One page of features, and the count the service actually sent.
    ///
    /// The count is the raw feature count, kept separate from `features`
    /// because it is what decides whether another page exists. Features whose
    /// geometry could not be read are dropped from `features` but still filled
    /// a slot on the page, and reading the shortened list as "the last page"
    /// would silently stop paging early.
    public struct Page: Sendable, Equatable {
        public let features: [Feature]
        public let returnedCount: Int
        /// Features the service sent whose geometry could not be read.
        public let unreadableCount: Int

        public init(features: [Feature], returnedCount: Int, unreadableCount: Int) {
            self.features = features
            self.returnedCount = returnedCount
            self.unreadableCount = unreadableCount
        }
    }

    private struct Payload: Decodable {
        struct ServiceError: Decodable {
            let code: Int?
            let message: String?
        }

        /// The geometry is decoded loosely on purpose: one unreadable shape
        /// costs that feature, not the page.
        struct RawFeature: Decodable {
            let id: MappedFeatureResponse.AttributeValue?
            let geometry: GeoJSONGeometry?
            let properties: [String: MappedFeatureResponse.AttributeValue]?

            private enum CodingKeys: String, CodingKey {
                case id, geometry, properties
            }

            init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                id = try? container.decodeIfPresent(
                    MappedFeatureResponse.AttributeValue.self, forKey: .id
                )
                geometry = try? container.decodeIfPresent(
                    GeoJSONGeometry.self, forKey: .geometry
                )
                properties = try? container.decodeIfPresent(
                    [String: MappedFeatureResponse.AttributeValue].self, forKey: .properties
                )
            }
        }

        let features: [RawFeature]?
        let error: ServiceError?
    }

    /// Reads one page.
    ///
    /// ArcGIS answers a rejected query with HTTP 200 and an `error` object, so
    /// the error is checked before the feature list. Reading it the other way
    /// round would turn every refused query into an empty viewport.
    public static func page(from data: Data) throws(Failure) -> Page {
        let payload: Payload
        do {
            payload = try JSONDecoder().decode(Payload.self, from: data)
        } catch {
            throw .malformed
        }
        if let error = payload.error {
            throw .serviceError(code: error.code, message: error.message)
        }
        guard let raw = payload.features else { throw .malformed }

        var features: [Feature] = []
        features.reserveCapacity(raw.count)
        for feature in raw {
            guard let geometry = feature.geometry else { continue }
            features.append(
                Feature(
                    id: identifier(feature.id),
                    geometry: geometry,
                    properties: feature.properties ?? [:]
                )
            )
        }

        return Page(
            features: features,
            returnedCount: raw.count,
            unreadableCount: raw.count - features.count
        )
    }

    private static func identifier(_ value: MappedFeatureResponse.AttributeValue?) -> String? {
        switch value {
        case .string(let text): text.isEmpty ? nil : text
        case .number(let number): ArcGISExportURL.jsNumber(number)
        case .null, nil: nil
        }
    }
}
