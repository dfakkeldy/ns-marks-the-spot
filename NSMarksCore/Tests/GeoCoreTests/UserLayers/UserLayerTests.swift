import XCTest
@testable import GeoCore

final class UserLayerTests: XCTestCase {
    func testURLValidationAndMasking() throws {
        for value in ["http://example.org/{z}/{x}/{y}", "javascript:alert(1)", "data:text/plain,x", "file:///tmp/a", "https://example.org/{x}/{y}", "https://example.org/%E0/{z}/{x}/{y}", "https://example.org/MapServer/%33", "https://example.org/{z}/{x}/{y}?bad=%7Bswitch:a,b%7D"] {
            XCTAssertThrowsError(try UserLayerURL(value, kind: value.contains("MapServer") ? .arcgisMap : .xyz), value)
        }
        XCTAssertNoThrow(try UserLayerURL("http://localhost:8080/{z}/{x}/{y}.png", kind: .xyz))
        let address = try UserLayerURL("https://example.org/{z}/{x}/{y}?key=secret&token=other", kind: .xyz)
        XCTAssertFalse(address.display.contains("secret"))
        XCTAssertFalse(address.display.contains("other"))
        XCTAssertTrue(address.display.contains("{z}/{x}/{y}"))
        XCTAssertEqual(UserLayerURL.guessKind("https://example.org/MapServer/WMSServer"), .wms)
        XCTAssertEqual(UserLayerURL.guessKind("https://example.org/ImageServer"), .arcgisImage)
        XCTAssertEqual(UserLayerURL.guessKind("https://example.org/MapServer"), .arcgisMap)
        XCTAssertEqual(UserLayerURL.guessKind("https://example.org/{z}/{x}/{-y}"), .tms)
        XCTAssertEqual(UserLayerURL.guessKind("https://example.org/{z}/{x}/{y}"), .xyz)
    }

    func testRecordRoundTripAndVersionRefusal() throws {
        let url = try UserLayerURL("https://example.org/{z}/{x}/{y}", kind: .xyz)
        let record = UserLayerRecord(name: "Mine", url: url, attribution: "Credit", termsNote: "Terms")
        let data = try JSONEncoder().encode(UserLayerArchive(layers: [record]))
        XCTAssertEqual(try JSONDecoder().decode(UserLayerArchive.self, from: data).layers, [record])
        XCTAssertThrowsError(try JSONDecoder().decode(UserLayerArchive.self, from: Data("{\"version\":999,\"layers\":[]}".utf8)))
    }
}
