import Foundation

/// How a fetcher sends a request.
///
/// A one-function seam over `URLSession` so that the fetchers can live in this
/// package, where `swift test` runs them without an Xcode build. That is not a
/// tidiness preference: the evidence services are where "the service was asked
/// and said no" has to stay distinguishable from "the question went
/// unanswered", and testing that distinction should not queue behind a build
/// slot.
///
/// It is deliberately a closure rather than a protocol. Nothing here needs to
/// name a conforming type, and a stub is one line at the call site.
public struct HTTPTransport: Sendable {
    private let send: @Sendable (URLRequest) async throws -> (Data, URLResponse)

    public init(_ send: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)) {
        self.send = send
    }

    /// The real thing.
    public static func urlSession(_ session: URLSession = .shared) -> HTTPTransport {
        HTTPTransport { request in try await session.data(for: request) }
    }

    public func callAsFunction(_ request: URLRequest) async throws -> (Data, URLResponse) {
        try await send(request)
    }
}
