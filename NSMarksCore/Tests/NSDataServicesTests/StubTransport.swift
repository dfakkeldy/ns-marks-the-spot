import Foundation
import Testing

@testable import NSDataServices

/// An `HTTPTransport` that answers from a table instead of a network.
///
/// Answers are chosen by a substring of the request URL rather than served in
/// order: the fetchers send their requests concurrently and the replies arrive
/// in whatever order they finish, so a queue would hand the wrong answer to the
/// wrong request and fail intermittently.
///
/// Each instance is its own table, so tests running side by side cannot see
/// each other's answers.
struct StubTransport {
    enum Answer: Sendable {
        case body(Data)
        case status(Int)
        case failure(any Error)
    }

    /// Requests this transport was asked to send, in the order it received
    /// them. Reading it is how a test asserts that nothing was requested at
    /// all — which is the assertion behind every "refused before it asked".
    final class Log: @unchecked Sendable {
        private let lock = NSLock()
        private var requests: [URLRequest] = []

        var count: Int { lock.withLock { requests.count } }
        var all: [URLRequest] { lock.withLock { requests } }

        func record(_ request: URLRequest) {
            lock.withLock { requests.append(request) }
        }
    }

    let log = Log()
    private let answers: [(String, Answer)]

    /// One answer for every request.
    init(_ answer: Answer) {
        answers = [("", answer)]
    }

    /// Answers chosen by the first match the request URL contains. An empty
    /// match is the catch-all and belongs last.
    init(matching answers: [(String, Answer)]) {
        self.answers = answers
    }

    /// A request matching nothing gets a 404 rather than a success: a fetcher
    /// that reached an address the test did not mean it to must not be able to
    /// pass by accident.
    var transport: HTTPTransport {
        let answers = answers
        let log = log
        return HTTPTransport { request in
            log.record(request)
            let url = request.url ?? URL(string: "https://unreachable.invalid")!
            let match = answers.first { needle, _ in
                needle.isEmpty || url.absoluteString.contains(needle)
            }

            switch match?.1 {
            case .body(let data):
                return (data, Self.response(url, 200))
            case .status(let code):
                return (Data(), Self.response(url, code))
            case .failure(let error):
                throw error
            case nil:
                return (Data(), Self.response(url, 404))
            }
        }
    }

    private static func response(_ url: URL, _ statusCode: Int) -> URLResponse {
        HTTPURLResponse(url: url, statusCode: statusCode, httpVersion: nil, headerFields: nil)!
    }
}
