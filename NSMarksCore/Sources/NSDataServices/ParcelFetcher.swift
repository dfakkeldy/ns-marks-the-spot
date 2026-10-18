import Foundation
import GeoCore

/// Why a parcel lookup produced no parcels.
///
/// Every case here means the question went unanswered, and none of them may be
/// shown as "there is no parcel". The service looking and finding nothing is a
/// successful return of an empty `ParcelFeatureCollection`, which is why that
/// state is deliberately not a case in this enum.
public nonisolated enum ParcelLookupFailure: Error, Equatable {
    /// Never asked. The Province licence stands in the way, or nothing in the
    /// input parsed as a PID.
    case refused(ParcelQuery.Refusal)
    /// The user, or MapKit, moved on before the answer arrived. Not an outage,
    /// and not a fact about the parcel.
    case cancelled
    /// More parcels in view than `CaptureSpec.Snap.maxParcels`, or the service
    /// set `exceededTransferLimit`. Fail closed: snapping mounts nothing
    /// rather than a silent subset. Shown as "too many parcels here, zoom in".
    case tooManyParcels(count: Int)
    /// Could not reach the service.
    case unreachable(URLError.Code)
    /// Reached, and turned away at the HTTP layer.
    case invalidHTTPStatus(Int)
    /// Reached and answered, but not with parcels — including ArcGIS's habit of
    /// reporting a refused query as HTTP 200 with an error in the body.
    case unreadable(ParcelResponse.Failure)
}

/// Fetches parcels from NSPRD.
///
/// Stateless beyond its transport, and `nonisolated`, so a tap on the map can
/// start a lookup without the main actor waiting on it.
///
/// The clearance is a parameter on every call rather than a stored property.
/// NSPRD is Province-restricted and the answer can change mid-session — a
/// revoke has to reach the next request, not the next launch — so this asks for
/// it each time and hands it straight to `ParcelQuery`, which refuses before it
/// assembles a URL.
public nonisolated final class ParcelFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    /// Every parcel among `pids`, in the order the service returned them.
    ///
    /// PIDs that match nothing are simply absent from the result, exactly as on
    /// the web. That is the same shape as the service having no record of them,
    /// which it is: the caller compares what it asked for against what came
    /// back rather than being handed a claim about which is which.
    public func parcels(
        pids: [String],
        clearance: ProvinceLicenceClearance
    ) async throws(ParcelLookupFailure) -> ParcelFeatureCollection {
        let urls: [URL]
        do {
            urls = try ParcelQuery.pidQueryURLs(pids: pids, clearance: clearance)
        } catch {
            throw .refused(error)
        }

        // Concurrent, but reassembled in batch order: the web's `Promise.all`
        // keeps its results in order, and a parcel list that reshuffles itself
        // depending on which request came back first is a list two people
        // cannot compare.
        var collections = [ParcelFeatureCollection?](repeating: nil, count: urls.count)
        do {
            try await withThrowingTaskGroup(of: (Int, ParcelFeatureCollection).self) { group in
                for (index, url) in urls.enumerated() {
                    group.addTask { (index, try await self.collection(from: url)) }
                }
                for try await (index, collection) in group {
                    collections[index] = collection
                }
            }
        } catch let failure as ParcelLookupFailure {
            throw failure
        } catch {
            throw .cancelled
        }

        let answered = collections.compactMap(\.self)
        return ParcelFeatureCollection(
            identifiedFeatures: answered.flatMap(\.identifiedFeatures),
            unidentifiedFeatureCount: answered.reduce(0) { $0 + $1.unidentifiedFeatureCount }
        )
    }

    /// The parcel under a point.
    ///
    /// An empty result is the honest answer for water, a road right-of-way, or
    /// anywhere outside the surveyed parcel fabric — the service was asked and
    /// said there is nothing there.
    public func parcel(
        latitude: Double,
        longitude: Double,
        clearance: ProvinceLicenceClearance
    ) async throws(ParcelLookupFailure) -> ParcelFeatureCollection {
        let url: URL
        do {
            url = try ParcelQuery.pointQueryURL(
                latitude: latitude, longitude: longitude, clearance: clearance
            )
        } catch {
            throw .refused(error)
        }
        return try await collection(from: url)
    }

    /// Polygons intersecting `bounds`, for snap-to-parcel drawing.
    ///
    /// One page asking for `maxParcels + 1` records. Over that cap, or an
    /// `exceededTransferLimit` flag, is `tooManyParcels` — never a truncated
    /// list that would look like the whole fabric. An honest empty viewport
    /// is a successful collection with no identified features.
    public func parcels(
        in bounds: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) async throws(ParcelLookupFailure) -> ParcelFeatureCollection {
        let url: URL
        do {
            url = try ParcelQuery.envelopeQueryURL(bounds: bounds, clearance: clearance)
        } catch {
            throw .refused(error)
        }
        let page = try await snapPage(from: url)
        let cap = CaptureSpec.Snap.maxParcels
        if page.exceededTransferLimit || page.rawCount > cap
            || page.collection.identifiedFeatures.count > cap
        {
            throw .tooManyParcels(
                count: max(page.rawCount, page.collection.identifiedFeatures.count)
            )
        }
        return page.collection
    }

    private func snapPage(
        from url: URL
    ) async throws(ParcelLookupFailure) -> ParcelResponse.SnapPage {
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
            return try ParcelResponse.decodeSnapPage(data)
        } catch {
            throw .unreadable(error)
        }
    }

    private func collection(
        from url: URL
    ) async throws(ParcelLookupFailure) -> ParcelFeatureCollection {
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
            return try ParcelResponse.decode(data)
        } catch {
            throw .unreadable(error)
        }
    }
}
