import Foundation
import ParityFixtures
import Testing

@testable import NSDataServices

/// The coastal licence's own words, against the fixture the web exports.
///
/// No layer row can carry them: an entry pins the licence URL and the
/// open/restricted flag, not the text the licence asks a product to print. The
/// web rendered one of the three notices where this app rendered all three,
/// and both parity suites passed. Comparing the ordered strings is what makes
/// a notice reworded on one surface fail the other.
@Suite("Coastal flood licence parity with the web")
struct CoastalFloodLicenceParityTests {
    @Test func theNoticesMatchTheWebInOrder() throws {
        let web = try #require(ParityFixture.loaded.coastalHazardNotices)
        #expect(web == CoastalFloodLicence.notices)
        #expect(web.joined(separator: " ") == CoastalFloodLicence.attribution)
    }
}
