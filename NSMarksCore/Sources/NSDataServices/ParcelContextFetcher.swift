import Foundation
import GeoCore

/// What the Province has mapped on a parcel.
///
/// Screening evidence: these are NSTDB features whose geometry meets the NSPRD
/// polygon at 1:10,000. A road in `roads` is not a right of way, a driveway, or
/// proof of legal access, and water here is not a watercourse determination.
public nonisolated struct ParcelContext: Sendable, Equatable {
    public var roads: [MappedFeatureResponse.MappedFeature] = []
    public var water: [MappedFeatureResponse.MappedFeature] = []

    public init(
        roads: [MappedFeatureResponse.MappedFeature] = [],
        water: [MappedFeatureResponse.MappedFeature] = []
    ) {
        self.roads = roads
        self.water = water
    }
}

/// Why the mapped-feature lookup produced no context.
///
/// As with `ParcelLookupFailure`, every case means the question went
/// unanswered. None of them may be shown as "nothing is mapped on this
/// parcel" — that is an empty `ParcelContext` returned successfully.
public nonisolated enum ParcelContextFailure: Error, Equatable {
    /// Never asked: the licence is unanswered, or the parcel has no boundary
    /// to ask about.
    case refused(MappedFeatureQuery.Refusal)
    case cancelled
    case unreachable(URLError.Code)
    case invalidHTTPStatus(Int)
    case unreadable(MappedFeatureResponse.Failure)
}

/// Fetches the NSTDB roads and water mapped on a parcel.
public nonisolated final class ParcelContextFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    /// Everything the road and water services have mapped on `parts`.
    ///
    /// All twenty-two requests go out together and any one of them failing
    /// fails the lookup. That is the web's `Promise.all` behaviour and it is
    /// the right one here: returning the sublayers that answered would produce
    /// a list with nothing on it to say it is incomplete, and a short list of
    /// roads reads as a complete one.
    public func context(
        for parts: [PolygonHitTest.PolygonPart],
        clearance: ProvinceLicenceClearance
    ) async throws(ParcelContextFailure) -> ParcelContext {
        let requests: [MappedFeatureQuery.Request]
        do {
            requests = try MappedFeatureQuery.requests(for: parts, clearance: clearance)
        } catch {
            throw .refused(error)
        }

        // Reassembled in request order rather than completion order: `unique`
        // keeps the first spelling of a repeated feature, so a road that
        // crosses the parcel has to be seen crossing it before it is seen
        // passing nearby — which is only true if the intersecting replies stay
        // ahead of the adjacent ones.
        var replies = [[MappedFeatureResponse.MappedFeature]?](
            repeating: nil, count: requests.count
        )
        do {
            try await withThrowingTaskGroup(
                of: (Int, [MappedFeatureResponse.MappedFeature]).self
            ) { group in
                for (index, request) in requests.enumerated() {
                    group.addTask { (index, try await self.features(for: request)) }
                }
                for try await (index, features) in group {
                    replies[index] = features
                }
            }
        } catch let failure as ParcelContextFailure {
            throw failure
        } catch {
            throw .cancelled
        }

        var roads: [MappedFeatureResponse.MappedFeature] = []
        var water: [MappedFeatureResponse.MappedFeature] = []
        for (request, features) in zip(requests, replies) {
            guard let features else { continue }
            if request.layer.layerID == .waterFeatures {
                water.append(contentsOf: features)
            } else {
                roads.append(contentsOf: features)
            }
        }

        return ParcelContext(
            roads: MappedFeatureResponse.unique(roads),
            water: MappedFeatureResponse.unique(water)
        )
    }

    private func features(
        for request: MappedFeatureQuery.Request
    ) async throws(ParcelContextFailure) -> [MappedFeatureResponse.MappedFeature] {
        var urlRequest = URLRequest(url: request.url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue(
            "application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type"
        )
        urlRequest.httpBody = Data(request.body.utf8)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport(urlRequest)
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
            return try MappedFeatureResponse.features(
                from: data, layer: request.layer, relationship: request.relationship
            )
        } catch {
            throw .unreadable(error)
        }
    }
}
