import Foundation
import GeoCore
import MapCatalog

/// Why one source produced no list.
///
/// Per source, because these three are asked independently and one being down
/// says nothing about the other two. None of these may reach the user as "no
/// record here": that is a successful empty list.
public nonisolated enum ResourceIntersectionFailure: Error, Equatable {
    case refused(ResourceIntersectionQuery.LayerRefusal)
    case cancelled
    case unreachable(URLError.Code)
    case invalidHTTPStatus(Int)
    case unreadable(ResourceIntersectionResponse.Failure)
}

/// What the geology and resource sources say about a parcel, one entry per
/// source in the order the panel lists them.
public nonisolated struct ParcelResourceIntersections: Sendable, Equatable {
    public struct Source: Sendable, Equatable {
        public let layerID: LayerID
        public let records: Result<[ResourceIntersectionResponse.Intersection], ResourceIntersectionFailure>

        public init(
            layerID: LayerID,
            records: Result<[ResourceIntersectionResponse.Intersection], ResourceIntersectionFailure>
        ) {
            self.layerID = layerID
            self.records = records
        }
    }

    public let sources: [Source]

    public init(sources: [Source]) {
        self.sources = sources
    }
}

/// Fetches the mineral, tenure, and abandoned-mine records published against a
/// parcel.
public nonisolated final class ResourceIntersectionFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    /// Every source's answer about `parts`.
    ///
    /// One source failing does not fail the others — that is the web's
    /// `Promise.allSettled` — but a source with *any* failing request fails
    /// whole. The mineral inventory is asked twice, and reporting the on-parcel
    /// half when the nearby half failed would produce a list with nothing on it
    /// to say what is missing.
    public func intersections(
        for parts: [PolygonHitTest.PolygonPart],
        clearance: ProvinceLicenceClearance
    ) async throws(ResourceIntersectionQuery.Refusal) -> ParcelResourceIntersections {
        let plan = try ResourceIntersectionQuery.plan(for: parts, clearance: clearance)

        var replies = [Result<[ResourceIntersectionResponse.Intersection], ResourceIntersectionFailure>?](
            repeating: nil, count: plan.requests.count
        )
        await withTaskGroup(
            of: (Int, Result<[ResourceIntersectionResponse.Intersection], ResourceIntersectionFailure>).self
        ) { group in
            for (index, request) in plan.requests.enumerated() {
                group.addTask {
                    do throws(ResourceIntersectionFailure) {
                        return (index, .success(try await self.records(for: request)))
                    } catch {
                        return (index, .failure(error))
                    }
                }
            }
            for await (index, reply) in group {
                replies[index] = reply
            }
        }

        var records: [LayerID: [ResourceIntersectionResponse.Intersection]] = [:]
        var failures: [LayerID: ResourceIntersectionFailure] = [:]
        for (layerID, refusal) in plan.refusals {
            failures[layerID] = .refused(refusal)
        }
        for (request, reply) in zip(plan.requests, replies) {
            switch reply {
            case .success(let found):
                records[request.layerID, default: []].append(contentsOf: found)
            case .failure(let failure):
                // First failure wins the source, and the records collected for
                // it are dropped rather than shown as the whole answer.
                if failures[request.layerID] == nil { failures[request.layerID] = failure }
            case nil:
                continue
            }
        }

        return ParcelResourceIntersections(
            sources: ResourceIntersectionQuery.layerIDs.map { layerID in
                ParcelResourceIntersections.Source(
                    layerID: layerID,
                    records: failures[layerID].map { .failure($0) }
                        ?? .success(ResourceIntersectionResponse.unique(records[layerID] ?? []))
                )
            }
        )
    }

    private func records(
        for request: ResourceIntersectionQuery.Request
    ) async throws(ResourceIntersectionFailure) -> [ResourceIntersectionResponse.Intersection] {
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
            return try ResourceIntersectionResponse.intersections(
                from: data, summary: request.summary, relationship: request.relationship
            )
        } catch {
            throw .unreadable(error)
        }
    }
}
