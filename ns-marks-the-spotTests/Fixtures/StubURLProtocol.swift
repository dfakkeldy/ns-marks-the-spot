import Foundation

/// Answers requests per host, so suites running side by side cannot see each
/// other's stubs.
///
/// Register it on an ephemeral `URLSessionConfiguration` rather than globally,
/// give each test its own host, and clear that host when the test ends.
///
/// Responses within a host are matched on a substring of the URL rather than
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

    /// One answer for every request to `host`.
    static func stub(host: String, with response: Response) {
        state.stub(host: host, matching: [("", response)])
    }

    /// Answers chosen by the first `match` the request URL contains. An empty
    /// match is the catch-all and should come last.
    static func stub(host: String, matching responses: [(String, Response)]) {
        state.stub(host: host, matching: responses)
    }

    static func clear(host: String) {
        state.clear(host: host)
    }

    static func requestCount(host: String) -> Int {
        state.requestCount(host: host)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let host = url.host() else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        Self.state.record(host: host)

        let statusCode: Int
        let body: Data
        switch Self.state.response(forHost: host, url: url.absoluteString) {
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

        func stub(host: String, matching matches: [(String, Response)]) {
            lock.withLock {
                responses[host] = matches
                counts[host] = 0
            }
        }

        func clear(host: String) {
            lock.withLock {
                responses[host] = nil
                counts[host] = nil
            }
        }

        func record(host: String) {
            lock.withLock { counts[host, default: 0] += 1 }
        }

        func requestCount(host: String) -> Int {
            lock.withLock { counts[host] ?? 0 }
        }

        /// An unstubbed host, or one with no matching answer, gets a 404 rather
        /// than a success: a test that reaches an address it did not mean to
        /// must not be able to pass by accident.
        func response(forHost host: String, url: String) -> Response {
            lock.withLock {
                let matches = responses[host] ?? []
                for (needle, response) in matches where needle.isEmpty || url.contains(needle) {
                    return response
                }
                return .status(404)
            }
        }
    }
}
