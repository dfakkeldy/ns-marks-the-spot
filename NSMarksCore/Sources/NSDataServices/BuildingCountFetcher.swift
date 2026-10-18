import Foundation
import GeoCore

/// How many buildings NSTDB has mapped on a parcel.
///
/// Screening evidence at 1:10,000. A count of zero means the Province has
/// nothing mapped inside this outline on the date the dataset was built; it is
/// not a statement that the lot is vacant, and a count above zero is not proof
/// that a structure still stands.
///
/// `points` and `polygons` are kept apart because they can describe the same
/// building: NSTDB carries a point for a structure and, at some scales, a
/// footprint too. `total` is the web's headline number and adds them, so the
/// two surfaces agree — and the split is published alongside it so the number
/// can be read for what it is.
public nonisolated struct ParcelBuildingCount: Sendable, Equatable {
    public let points: Int
    public let polygons: Int

    public var total: Int { points + polygons }

    public init(points: Int, polygons: Int) {
        self.points = points
        self.polygons = polygons
    }
}

/// Why a building count produced no number.
///
/// None of these may reach the user as "no buildings are mapped here". That is
/// a successful count of zero and nothing else.
public nonisolated enum BuildingCountFailure: Error, Equatable {
    case refused(BuildingCountQuery.Refusal)
    case cancelled
    case unreachable(URLError.Code)
    case invalidHTTPStatus(Int)
    case unreadable(BuildingCountResponse.Failure)
}

/// Counts the NSTDB buildings intersecting a parcel.
public nonisolated final class BuildingCountFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    /// The buildings mapped on `parts`.
    ///
    /// All three requests go out together and any one of them failing fails the
    /// count, which is the web's `Promise.all` behaviour and the right one: a
    /// total assembled from two of three sublayers would be a smaller number
    /// with nothing on it to say it is short.
    public func count(
        for parts: [PolygonHitTest.PolygonPart],
        clearance: ProvinceLicenceClearance
    ) async throws(BuildingCountFailure) -> ParcelBuildingCount {
        let requests: [BuildingCountQuery.Request]
        do {
            requests = try BuildingCountQuery.requests(for: parts, clearance: clearance)
        } catch {
            throw .refused(error)
        }

        var counts = [Int?](repeating: nil, count: requests.count)
        do {
            try await withThrowingTaskGroup(of: (Int, Int).self) { group in
                for (index, request) in requests.enumerated() {
                    group.addTask { (index, try await self.count(for: request)) }
                }
                for try await (index, count) in group {
                    counts[index] = count
                }
            }
        } catch let failure as BuildingCountFailure {
            throw failure
        } catch {
            throw .cancelled
        }

        var points = 0
        var polygons = 0
        for (request, count) in zip(requests, counts) {
            guard let count else { continue }
            if request.sublayer == BuildingCountQuery.polygonSublayer {
                polygons += count
            } else {
                points += count
            }
        }
        return ParcelBuildingCount(points: points, polygons: polygons)
    }

    private func count(
        for request: BuildingCountQuery.Request
    ) async throws(BuildingCountFailure) -> Int {
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
            return try BuildingCountResponse.count(from: data)
        } catch {
            throw .unreadable(error)
        }
    }
}
