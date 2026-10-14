import Foundation
import Testing

@testable import NSDataServices

/// Every query the app sends names the app and a way to reach it.
///
/// The Province's services cannot tell the public's requests from bulk
/// scraping unless the requests say who is asking, so the check here is on
/// what actually leaves the session, not on how a request was built.
struct ClientIdentityTests {
    @Test func theIdentityNamesTheAppAndWhereToReachIt() {
        #expect(ClientIdentity.userAgent.hasPrefix("NSMarksTheSpot/"))
        #expect(
            ClientIdentity.userAgent.hasSuffix(
                "iOS (+https://kinnokilabs.com/apps/nsmarksthespot/)"
            )
        )
    }

    @Test func anAgentSetOnPurposeIsKept() throws {
        let url = try #require(URL(string: "https://example.com/"))
        var request = URLRequest(url: url)
        request.setValue("Something/1.0", forHTTPHeaderField: "User-Agent")

        let identified = ClientIdentity.identified(request)

        #expect(identified.value(forHTTPHeaderField: "User-Agent") == "Something/1.0")
    }

    /// Through a real `URLSession`, because the session is where a default
    /// agent would otherwise be filled in. The stub answers with the agent it
    /// received, so there is no shared state for parallel tests to trip on.
    @Test func theLiveTransportSendsTheIdentity() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AgentEchoProtocol.self]
        let transport = HTTPTransport.urlSession(URLSession(configuration: configuration))
        let url = try #require(
            URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/MapServer?f=json")
        )

        let (data, _) = try await transport(URLRequest(url: url))

        #expect(String(decoding: data, as: UTF8.self) == ClientIdentity.userAgent)
    }
}

/// Answers every request with the `User-Agent` it arrived with.
private final class AgentEchoProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url,
              let response = HTTPURLResponse(
                url: url, statusCode: 200, httpVersion: nil, headerFields: nil
              )
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let agent = request.value(forHTTPHeaderField: "User-Agent") ?? ""
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(agent.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
