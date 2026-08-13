import Foundation
import GeoCore

/// Why a viewport overlay produced no features.
///
/// None of these may reach the user as "nothing of this kind is here". An empty
/// viewport is a successful query that returned no rows, and nothing else.
public nonisolated enum FeatureOverlayFailure: Error, Equatable {
    case refused(FeatureOverlayQuery.Refusal)
    case cancelled
    case unreachable(URLError.Code)
    case invalidHTTPStatus(Int)
    case unreadable(FeatureOverlayResponse.Failure)
    /// The service kept filling pages past the safety limit.
    case tooManyFeatures
}

/// What one viewport query found.
public nonisolated struct FeatureOverlay: Sendable, Equatable {
    public let features: [FeatureOverlayResponse.Feature]
    /// Features the service sent whose geometry could not be read.
    ///
    /// Reported rather than swallowed: a layer drawing 400 of 420 zones is a
    /// different thing from a layer drawing all 400 there are.
    public let unreadableFeatures: Int

    public init(features: [FeatureOverlayResponse.Feature], unreadableFeatures: Int) {
        self.features = features
        self.unreadableFeatures = unreadableFeatures
    }
}

/// Queries an ArcGIS feature service for everything in a viewport.
///
/// The shared seam behind the viewport layers — zoning, well logs, mineral
/// occurrences — which differ in fields, filters, and licence but ask the same
/// paged question.
public nonisolated final class FeatureOverlayFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    /// Everything `plan` matches, paged until the service runs out.
    ///
    /// Pages are fetched in sequence rather than at once because the offset of
    /// the last page is not known until the one before it comes back short.
    public func features(
        for plan: FeatureOverlayQuery.Plan
    ) async throws(FeatureOverlayFailure) -> FeatureOverlay {
        var features: [FeatureOverlayResponse.Feature] = []
        var unreadable = 0
        var seen = Set<FeatureKey>()

        for page in 0..<FeatureOverlayQuery.maximumPages {
            let url: URL
            do {
                url = try FeatureOverlayQuery.url(for: plan, page: page)
            } catch {
                throw .refused(error)
            }

            let result = try await self.page(at: url)
            unreadable += result.unreadableCount
            for feature in result.features
            where seen.insert(FeatureKey(feature, idField: plan.idField)).inserted {
                features.append(feature)
            }

            if result.returnedCount < FeatureOverlayQuery.pageSize {
                return FeatureOverlay(features: features, unreadableFeatures: unreadable)
            }
        }

        throw .tooManyFeatures
    }

    private func page(at url: URL) async throws(FeatureOverlayFailure)
        -> FeatureOverlayResponse.Page
    {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport(URLRequest(url: url))
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

        do {
            return try FeatureOverlayResponse.page(from: data)
        } catch {
            throw .unreadable(error)
        }
    }

    /// What makes two returned rows the same feature.
    ///
    /// Pages can overlap when a service reorders rows between requests, so the
    /// same feature can arrive twice. The web keys on the feature id, then the
    /// id field, then the serialized geometry; this keys on the geometry itself
    /// for that last case, which compares the same shapes without depending on
    /// how they were spelled.
    private enum FeatureKey: Hashable {
        case identifier(String)
        case field(String)
        case geometry(GeoJSONGeometry)

        init(_ feature: FeatureOverlayResponse.Feature, idField: String) {
            if let id = feature.id {
                self = .identifier(id)
                return
            }
            switch feature.properties[idField] {
            case .string(let text) where !text.isEmpty:
                self = .field(text)
            case .number(let number):
                self = .field(ArcGISExportURL.jsNumber(number))
            case .string, .null, nil:
                self = .geometry(feature.geometry)
            }
        }
    }
}
