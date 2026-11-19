import XCTest
import MapCatalog

final class UserLayerSourceMatchTests: XCTestCase {
    func testCatalogueSourceIdentity() {
        let aerial = "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer"
        for address in [aerial, aerial + "/export?token=secret", aerial.replacingOccurrences(of: "/rest/services/", with: "/services/") + "/WMSServer", aerial.replacingOccurrences(of: "nsgiwa.", with: "nsgiwa2.")] {
            XCTAssertTrue(UserLayerSourceMatch.match(address).contains { $0.id == .nsAerial }, address)
        }
        XCTAssertTrue(UserLayerSourceMatch.match("https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer").contains { $0.id == .nsprd })
        let roads = LayerCatalog.all.first { $0.id == .roads }!
        XCTAssertTrue(UserLayerSourceMatch.match(roads.serviceURL!.absoluteString).contains { $0.id == .roads })
        XCTAssertTrue(UserLayerSourceMatch.match(aerial.replacingOccurrences(of: "BASE_NSODB", with: "%42ASE_NSODB")).contains { $0.id == .nsAerial })
        XCTAssertTrue(UserLayerSourceMatch.match("https://tiles.example.org/{z}/{x}/{y}.png").isEmpty)
        XCTAssertNotEqual(UserLayerSourceMatch.key("https://services.arcgis.com/a/arcgis/rest/services/foo/MapServer"), UserLayerSourceMatch.key("https://services.arcgis.com/b/arcgis/rest/services/foo/MapServer"))
    }
}
