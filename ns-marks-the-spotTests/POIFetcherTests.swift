import Foundation
import Testing
@testable import ns_marks_the_spot

struct POIFetcherTests {
    @Test func fetchWaterfallsUsesFallsLayerAndDecodesMixedArcGISAttributes() async throws {
        WaterfallURLProtocol.reset(
            statusCode: 200,
            responseData: Data(
                """
                {
                  "features": [
                    {
                      "attributes": {
                        "OBJECTID": 1060,
                        "FEAT_CODE": "WAFA60",
                        "FEAT_DESC": "Falls -  On a single line river point",
                        "ZVALUE": 16.4,
                        "FID": null,
                        "FEATURE_NAME": "Test Falls"
                      },
                      "geometry": {
                        "x": -65.69966205546243,
                        "y": 43.55632472760332
                      }
                    }
                  ]
                }
                """.utf8
            )
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [WaterfallURLProtocol.self]
        let urlSession = URLSession(configuration: configuration)
        defer { WaterfallURLProtocol.reset() }

        let points = try await POIFetcher(urlSession: urlSession).fetchWaterfalls()
        let requestURL = try #require(WaterfallURLProtocol.requests.first?.url)
        let queryItems = URLComponents(url: requestURL, resolvingAgainstBaseURL: false)?
            .queryItems ?? []

        #expect(requestURL.path.hasSuffix("/MapServer/1/query"))
        #expect(queryItems.first(named: "where")?.value == "FEAT_DESC = 'Falls -  On a single line river point'")
        #expect(points.count == 1)
        #expect(points.first?.id == "waterfall-1060")
        #expect(points.first?.name == "Test Falls")
        #expect(points.first?.latitude == 43.55632472760332)
        #expect(points.first?.longitude == -65.69966205546243)
        #expect(points.first?.category == "waterfall")
    }

    @Test func fetchWaterfallsFallsBackToDistinctServiceLabels() async throws {
        WaterfallURLProtocol.reset(
            statusCode: 200,
            responseData: Data(
                """
                {
                  "features": [
                    {
                      "attributes": {
                        "OBJECTID": 1060,
                        "FEAT_CODE": "WAFA60",
                        "FEAT_DESC": "Falls -  On a single line river point",
                        "ZVALUE": 16.4,
                        "FID": null
                      },
                      "geometry": {
                        "x": -65.69966205546243,
                        "y": 43.55632472760332
                      }
                    }
                  ]
                }
                """.utf8
            )
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [WaterfallURLProtocol.self]
        let urlSession = URLSession(configuration: configuration)
        defer { WaterfallURLProtocol.reset() }

        let points = try await POIFetcher(urlSession: urlSession).fetchWaterfalls()

        #expect(points.first?.id == "waterfall-1060")
        #expect(points.first?.name == "Waterfall #1060 (16.4 m)")
    }

    @Test func fetchWaterfallsThrowsForArcGISErrorPayload() async throws {
        WaterfallURLProtocol.reset(
            statusCode: 200,
            responseData: Data(
                """
                {
                  "error": {
                    "code": 404,
                    "message": "Layer not found",
                    "details": []
                  }
                }
                """.utf8
            )
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [WaterfallURLProtocol.self]
        let urlSession = URLSession(configuration: configuration)
        defer { WaterfallURLProtocol.reset() }

        do {
            _ = try await POIFetcher(urlSession: urlSession).fetchWaterfalls()
            Issue.record("Expected ArcGIS error payload to throw")
        } catch let error as POIFetcherError {
            #expect(error == .serviceError(code: 404, message: "Layer not found"))
        } catch {
            Issue.record("Expected POIFetcherError, got \(error)")
        }
    }

    @Test func fetchWaterfallsThrowsForHTTPErrorStatus() async throws {
        WaterfallURLProtocol.reset(
            statusCode: 500,
            responseData: Data("server error".utf8)
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [WaterfallURLProtocol.self]
        let urlSession = URLSession(configuration: configuration)
        defer { WaterfallURLProtocol.reset() }

        do {
            _ = try await POIFetcher(urlSession: urlSession).fetchWaterfalls()
            Issue.record("Expected HTTP error status to throw")
        } catch let error as POIFetcherError {
            #expect(error == .invalidHTTPStatus(500))
        } catch {
            Issue.record("Expected POIFetcherError, got \(error)")
        }
    }
}

/// Lock-guarded stub state: URLProtocol callbacks arrive on URLSession's
/// loader thread while tests configure and read from their own isolation.
nonisolated private final class WaterfallURLProtocolState: @unchecked Sendable {
    private let lock = NSLock()
    private var recordedRequests: [URLRequest] = []
    private var statusCode = 200
    private var responseData = Data()

    var requests: [URLRequest] {
        lock.withLock { recordedRequests }
    }

    func record(_ request: URLRequest) {
        lock.withLock { recordedRequests.append(request) }
    }

    func stub() -> (statusCode: Int, responseData: Data) {
        lock.withLock { (statusCode, responseData) }
    }

    func reset(statusCode: Int, responseData: Data) {
        lock.withLock {
            recordedRequests = []
            self.statusCode = statusCode
            self.responseData = responseData
        }
    }
}

nonisolated private final class WaterfallURLProtocol: URLProtocol {
    private static let state = WaterfallURLProtocolState()

    static var requests: [URLRequest] {
        state.requests
    }

    static func reset(statusCode: Int = 200, responseData: Data = Data()) {
        state.reset(statusCode: statusCode, responseData: responseData)
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Self.state.record(request)
        let stub = Self.state.stub()
        guard let url = request.url,
              let response = HTTPURLResponse(
                url: url,
                statusCode: stub.statusCode,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private extension [URLQueryItem] {
    func first(named name: String) -> URLQueryItem? {
        first { $0.name == name }
    }
}
