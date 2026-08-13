import Foundation
import GeoCore
import MapCatalog

/// The Province's old-growth forest policy areas, drawn per viewport.
///
/// Ported from `web/src/services/oldGrowthPolicy.ts`. These are mapped policy
/// areas on public land, which is narrower than it sounds twice over: it is not
/// a complete old-growth inventory, and it says nothing at all about private
/// land. A parcel outside every polygon here has not been surveyed and found
/// young; it has not been mapped by this programme.
public enum OldGrowthPolicyOverlay {
    /// Rows asked for per request. The source pages at its own limit, so this
    /// is the number the paging arithmetic is written around.
    public static let pageSize = 1_000
    public static let maximumPages = 10

    static let selectFields = [
        ":id", "the_geom", "selmethod", "old_growth", "selmethtxt", "oldgrowtxt", "hectares",
    ]

    public enum Status: String, Sendable, Hashable, CaseIterable {
        case confirmedOldGrowth = "confirmed-old-growth"
        case restorationOpportunity = "restoration-opportunity"
        case unknown

        public var label: String {
            switch self {
            case .confirmedOldGrowth: "Confirmed old growth"
            case .restorationOpportunity: "Restoration opportunity"
            case .unknown: "Status unknown"
            }
        }
    }

    public enum Refusal: Error, Equatable, Sendable {
        case licenceNotAccepted
        case noServiceURL
        case malformedURL
    }

    public enum Failure: Error, Equatable {
        case refused(Refusal)
        case cancelled
        case unreachable(URLError.Code)
        case invalidHTTPStatus(Int)
        /// The source answered with something that is not a feature collection.
        case malformed
        /// The source kept filling pages past the safety limit.
        case tooManyFeatures
    }

    /// One policy area.
    public struct Area: Sendable, Hashable {
        public let geometry: GeoJSONGeometry
        public let status: Status
        /// The source's own area figure, which is not recomputed here.
        public let hectares: Double?
        public let selectionMethod: String?
    }

    /// The Socrata query for one page.
    ///
    /// `within_box` takes its corners north, west, south, east — the one order
    /// among the four that reads backwards from how this app writes a box
    /// everywhere else, which is why it is built in exactly one place.
    static func url(
        for bounds: GeoBoundingBox,
        offset: Int,
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> URL {
        guard clearance.allows(.oldGrowthPolicy) else { throw .licenceNotAccepted }
        guard let descriptor = LayerCatalog.descriptor(for: .oldGrowthPolicy),
              let serviceURL = descriptor.serviceURL,
              var components = URLComponents(url: serviceURL, resolvingAgainstBaseURL: false)
        else { throw .noServiceURL }

        let box = [bounds.north, bounds.west, bounds.south, bounds.east]
            .map(ArcGISExportURL.jsNumber)
            .joined(separator: ",")
        components.queryItems = [
            URLQueryItem(name: "$select", value: selectFields.joined(separator: ",")),
            URLQueryItem(name: "$where", value: "within_box(the_geom,\(box))"),
            URLQueryItem(name: "$order", value: ":id"),
            URLQueryItem(name: "$limit", value: String(pageSize)),
            URLQueryItem(name: "$offset", value: String(offset)),
        ]

        guard let url = components.url else { throw .malformedURL }
        return url
    }

    private struct Payload: Decodable {
        struct RawFeature: Decodable {
            let geometry: GeoJSONGeometry?
            let properties: [String: MappedFeatureResponse.AttributeValue]?

            private enum CodingKeys: String, CodingKey {
                case geometry, properties
            }

            init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                geometry = try? container.decodeIfPresent(GeoJSONGeometry.self, forKey: .geometry)
                properties = try? container.decodeIfPresent(
                    [String: MappedFeatureResponse.AttributeValue].self, forKey: .properties
                )
            }
        }

        let features: [RawFeature]?
    }

    /// One page of areas, and the row count the source actually sent.
    struct Page {
        let areas: [Area]
        let returnedCount: Int
    }

    static func page(from data: Data) throws(Failure) -> Page {
        let payload: Payload
        do {
            payload = try JSONDecoder().decode(Payload.self, from: data)
        } catch {
            throw .malformed
        }
        guard let raw = payload.features else { throw .malformed }

        let areas = raw.compactMap { feature -> Area? in
            // Only areal geometry is kept: a policy area is a piece of ground,
            // and a stray point or line in the response is not one.
            guard let geometry = feature.geometry, !geometry.polygonParts.isEmpty else {
                return nil
            }
            let properties = feature.properties ?? [:]
            return Area(
                geometry: geometry,
                status: status(from: properties),
                hectares: hectares(from: properties),
                selectionMethod: text(properties["selmethtxt"])
            )
        }
        return Page(areas: areas, returnedCount: raw.count)
    }

    /// The source codes status as the strings "1" and "2".
    ///
    /// Anything else is `unknown` rather than a guess. Reading an unrecognised
    /// code as "not old growth" would turn a coding change at the source into a
    /// silent downgrade of every polygon it touched.
    static func status(
        from properties: [String: MappedFeatureResponse.AttributeValue]
    ) -> Status {
        switch text(properties["old_growth"]) {
        case "1": .confirmedOldGrowth
        case "2": .restorationOpportunity
        default: .unknown
        }
    }

    private static func hectares(
        from properties: [String: MappedFeatureResponse.AttributeValue]
    ) -> Double? {
        guard let raw = text(properties["hectares"]), let value = Double(raw),
              value.isFinite, value >= 0
        else { return nil }
        return value
    }

    private static func text(_ value: MappedFeatureResponse.AttributeValue?) -> String? {
        let raw: String
        switch value {
        case .string(let value): raw = value
        case .number(let value): raw = ArcGISExportURL.jsNumber(value)
        case .null, nil: return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// Fetches the old-growth policy areas in a viewport.
public nonisolated final class OldGrowthPolicyFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    public func areas(
        in bounds: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) async throws(OldGrowthPolicyOverlay.Failure) -> [OldGrowthPolicyOverlay.Area] {
        var areas: [OldGrowthPolicyOverlay.Area] = []

        for page in 0..<OldGrowthPolicyOverlay.maximumPages {
            let url: URL
            do {
                url = try OldGrowthPolicyOverlay.url(
                    for: bounds,
                    offset: page * OldGrowthPolicyOverlay.pageSize,
                    clearance: clearance
                )
            } catch {
                throw .refused(error)
            }

            var request = URLRequest(url: url)
            request.setValue("application/geo+json, application/json", forHTTPHeaderField: "Accept")

            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await transport(request)
            } catch is CancellationError {
                throw .cancelled
            } catch let error as URLError {
                throw error.code == .cancelled ? .cancelled : .unreachable(error.code)
            } catch {
                throw .unreachable(.unknown)
            }

            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                throw .invalidHTTPStatus(http.statusCode)
            }

            let result = try OldGrowthPolicyOverlay.page(from: data)
            areas.append(contentsOf: result.areas)
            if result.returnedCount < OldGrowthPolicyOverlay.pageSize {
                return areas
            }
        }

        throw .tooManyFeatures
    }
}
