import Foundation
import Testing
@testable import ns_marks_the_spot

struct POIFetcherTests {
    @Test func fetchWaterfallsUsesFallsLayerAndDecodesMixedArcGISAttributes() async throws {
        WaterfallURLProtocol.reset(
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
        #expect(points.first?.name == "Test Falls")
        #expect(points.first?.latitude == 43.55632472760332)
        #expect(points.first?.longitude == -65.69966205546243)
        #expect(points.first?.category == "waterfall")
    }
}

private final class WaterfallURLProtocol: URLProtocol {
    static var requests: [URLRequest] = []
    static var responseData = Data()

    static func reset(responseData: Data = Data()) {
        requests = []
        self.responseData = responseData
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Self.requests.append(request)
        guard let url = request.url,
              let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private extension [URLQueryItem] {
    func first(named name: String) -> URLQueryItem? {
        first { $0.name == name }
    }
}
