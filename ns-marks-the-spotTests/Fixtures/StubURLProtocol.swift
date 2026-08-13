import Foundation

/// Answers requests per key, so tests running side by side cannot see each
/// other's stubs.
///
/// Register it on an ephemeral `URLSessionConfiguration` rather than globally,
/// and clear the key when the test ends.
///
/// The key is normally the host, which suits a test free to invent an address.
/// A test that reaches a *real* address — the parcel lookups take their host
/// from the catalog — cannot invent one, and keying those on the host would
/// have every such test share a single set of stubs and overwrite each other
/// as they ran. Those take a `channel` instead: `session(channel:)` stamps a
/// header the stub keys on ahead of the host, so each test gets its own
/// answers while still addressing the service the app actually calls.
///
/// Responses within a key are matched on a substring of the URL rather than
/// served in order. Requests that go out concurrently — parcel batches, tile
/// stacks — arrive in whatever order they finish, so an ordered queue would
/// hand the wrong answer to the wrong request and fail intermittently.
nonisolated final class StubURLProtocol: URLProtocol {
    enum Response: Sendable {
        case success(Data)
        case status(Int)
        case failure(URLError.Code)
    }

    private static let state = StubState()
    private static let channelHeader = "X-Stub-Channel"

    /// A session whose requests are answered under `channel` whatever host they
    /// address. Pair it with `stub(channel:)` and `clear(channel:)`.
    static func session(channel: String) -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        configuration.httpAdditionalHeaders = [channelHeader: channel]
        return URLSession(configuration: configuration)
    }

    /// One answer for every request to `host`.
    static func stub(host: String, with response: Response) {
        state.stub(key: host, matching: [("", response)])
    }

    /// Answers chosen by the first `match` the request URL contains. An empty
    /// match is the catch-all and should come last.
    static func stub(host: String, matching responses: [(String, Response)]) {
        state.stub(key: host, matching: responses)
    }

    static func clear(host: String) {
        state.clear(key: host)
    }

    static func requestCount(host: String) -> Int {
        state.requestCount(key: host)
    }

    /// One answer for every request made through `session(channel:)`.
    static func stub(channel: String, with response: Response) {
        state.stub(key: channel, matching: [("", response)])
    }

    static func stub(channel: String, matching responses: [(String, Response)]) {
        state.stub(key: channel, matching: responses)
    }

    static func clear(channel: String) {
        state.clear(key: channel)
    }

    /// Requests made through `session(channel:)`, counted whatever host they
    /// addressed — so "nothing was requested" covers a request to the wrong
    /// address as well as to the right one.
    static func requestCount(channel: String) -> Int {
        state.requestCount(key: channel)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let host = url.host() else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let key = request.value(forHTTPHeaderField: Self.channelHeader) ?? host
        Self.state.record(key: key)

        let statusCode: Int
        let body: Data
        switch Self.state.response(forKey: key, url: url.absoluteString) {
        case .success(let data):
            statusCode = 200
            body = data
        case .status(let code):
            statusCode = code
            body = Data()
        case .failure(let code):
            client?.urlProtocol(self, didFailWithError: URLError(code))
            return
        }

        guard let response = HTTPURLResponse(
            url: url,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "image/png"]
        ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private nonisolated final class StubState: Sendable {
        private let lock = NSLock()
        private nonisolated(unsafe) var responses: [String: [(String, Response)]] = [:]
        private nonisolated(unsafe) var counts: [String: Int] = [:]

        func stub(key: String, matching matches: [(String, Response)]) {
            lock.withLock {
                responses[key] = matches
                counts[key] = 0
            }
        }

        func clear(key: String) {
            lock.withLock {
                responses[key] = nil
                counts[key] = nil
            }
        }

        func record(key: String) {
            lock.withLock { counts[key, default: 0] += 1 }
        }

        func requestCount(key: String) -> Int {
            lock.withLock { counts[key] ?? 0 }
        }

        /// An unstubbed key, or one with no matching answer, gets a 404 rather
        /// than a success: a test that reaches an address it did not mean to
        /// must not be able to pass by accident.
        func response(forKey key: String, url: String) -> Response {
            lock.withLock {
                let matches = responses[key] ?? []
                for (needle, response) in matches where needle.isEmpty || url.contains(needle) {
                    return response
                }
                return .status(404)
            }
        }
    }
}
