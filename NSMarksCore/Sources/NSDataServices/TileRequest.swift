import Foundation
import GeoCore

/// A URL that has already passed the Province licence gate.
///
/// The memberwise initialiser is deliberately `internal`. Nothing outside this
/// module can manufacture a `TileRequest`, and `TileFetching` accepts nothing
/// else — so "issue a network request for a layer" is not an expressible
/// thought in the app target without going through `TileRequestFactory`, which
/// is where the licence check lives.
///
/// This is the first of the gate's locks, and the only one enforced by the
/// compiler rather than by a runtime check someone could forget to call.
public struct TileRequest: Sendable, Equatable {
    /// The layer this request was cleared for.
    public let layer: LayerID

    /// The fully-formed URL to fetch.
    public let url: URL

    init(layer: LayerID, url: URL) {
        self.layer = layer
        self.url = url
    }
}

/// The single seam through which layer imagery is fetched.
///
/// Taking a `TileRequest` rather than a `URL` is the point: a conforming type
/// cannot be handed an arbitrary address, so a fetcher cannot become a way
/// around the gate.
public protocol TileFetching: Sendable {
    func data(for request: TileRequest) async throws -> Data
}

/// The only place in the package that touches `URLSession`.
///
/// `urlSessionIsConfinedToTheFetcher` in the tests asserts that literally, by
/// scanning the package sources. Confinement is what makes the `TileRequest`
/// type-lock meaningful: a second, unchecked networking path elsewhere in the
/// package would leave the lock guarding an empty door.
public struct URLSessionTileFetcher: TileFetching {
    public enum FetchError: Error, Equatable, Sendable {
        case httpStatus(Int)
        case notHTTP
    }

    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func data(for request: TileRequest) async throws -> Data {
        let (data, response) = try await session.data(from: request.url)
        guard let http = response as? HTTPURLResponse else {
            throw FetchError.notHTTP
        }
        guard (200..<300).contains(http.statusCode) else {
            throw FetchError.httpStatus(http.statusCode)
        }
        return data
    }
}
