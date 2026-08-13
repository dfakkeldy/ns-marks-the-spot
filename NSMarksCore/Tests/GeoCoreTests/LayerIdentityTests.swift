import Foundation
import Testing

@testable import GeoCore

@Suite("Layer identity")
struct LayerIdentityTests {
    /// Every id the web catalog declares, verbatim. Written out longhand rather
    /// than derived from `LayerID` so a typo'd or dropped case fails here
    /// instead of quietly redefining what "correct" means.
    static let webLayerIDs: Set<String> = [
        "fletcher",
        "ns-aerial",
        "nsprd",
        "crown-lands",
        "flood-risk",
        "waterfalls",
        "water-features",
        "roads",
        "buildings",
        "place-names",
        "main-roads",
        "church-inverness",
        "church-victoria",
        "church-richmond",
        "church-cape-breton",
        "contours",
        "published-river-flood-zones",
        "coastal-flood-current",
        "coastal-flood-2050",
        "coastal-flood-2100",
        "arsenic-risk-wells",
        "uranium-risk-wells",
        "manganese-risk-wells",
        "surficial-aquifers",
        "old-growth-policy",
        "mineral-occurrences",
        "mineral-tenure",
        "abandoned-mines",
        "mineral-proximity-parcels",
        "inverness-hydro-potential",
        "zoning-inverness",
        "zoning-victoria",
        "zoning-richmond",
        "zoning-cumberland",
        "zoning-halifax",
        "ns-well-logs",
    ]

    @Test("Covers every web layer id and adds none of its own")
    func coversWebIDs() {
        let native = Set(LayerID.allCases.map(\.rawValue))
        #expect(
            native == Self.webLayerIDs,
            """
            Layer ids drifted from the web catalog.
            Missing from native: \(Self.webLayerIDs.subtracting(native).sorted())
            Extra in native: \(native.subtracting(Self.webLayerIDs).sorted())
            """
        )
    }

    @Test("Declares 36 layers")
    func layerCount() {
        #expect(LayerID.allCases.count == 36)
    }

    @Test("Ids are unique")
    func idsAreUnique() {
        #expect(Set(LayerID.allCases).count == LayerID.allCases.count)
    }

    @Test("Round-trips through its raw value")
    func rawValueRoundTrip() {
        for id in LayerID.allCases {
            #expect(LayerID(rawValue: id.rawValue) == id)
        }
    }

    @Test("Encodes as the bare web id, not a wrapped case name")
    func encodesAsWebID() throws {
        // Share links and parity fixtures carry the raw string. A Swift-side
        // case name in the JSON would silently break both.
        let data = try JSONEncoder().encode([LayerID.placeNames, .nsAerial])
        let json = try #require(String(data: data, encoding: .utf8))
        #expect(json == #"["place-names","ns-aerial"]"#)
    }

    @Test("Declares 10 layer groups with unique ids")
    func groupIdentity() {
        #expect(LayerGroupID.allCases.count == 10)
        #expect(Set(LayerGroupID.allCases.map(\.rawValue)).count == 10)
    }

    // MARK: - Licence

    @Test("Only province-restricted requires clearance")
    func clearanceIsRestrictedOnly() {
        for licence in LayerLicence.allCases {
            #expect(
                licence.requiresProvinceClearance == (licence == .provinceRestricted),
                "\(licence.rawValue) classified the wrong side of the gate"
            )
        }
    }

    @Test("Known licence strings decode to themselves")
    func knownLicencesDecode() throws {
        for licence in LayerLicence.allCases {
            let data = Data(#""\#(licence.rawValue)""#.utf8)
            #expect(try JSONDecoder().decode(LayerLicence.self, from: data) == licence)
        }
    }

    @Test("An unknown licence string decodes to province-restricted")
    func unknownLicenceFailsClosed() throws {
        // A licence value added on the web after this build shipped must land
        // on the conservative side. Being wrong the other way sends an
        // unlicensed request to a Province service.
        let data = Data(#""federal-open""#.utf8)
        let decoded = try JSONDecoder().decode(LayerLicence.self, from: data)
        #expect(decoded == .provinceRestricted)
        #expect(decoded.requiresProvinceClearance)
    }

    @Test("An empty licence string decodes to province-restricted")
    func emptyLicenceFailsClosed() throws {
        let decoded = try JSONDecoder().decode(LayerLicence.self, from: Data(#""""#.utf8))
        #expect(decoded == .provinceRestricted)
    }

    @Test("A non-string licence still fails rather than defaulting open")
    func nonStringLicenceThrows() {
        // Fail-closed covers unknown strings, not malformed JSON — a number
        // here means the fixture is corrupt, and that should be loud.
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(LayerLicence.self, from: Data("7".utf8))
        }
    }

    @Test("Licences round-trip through encode and decode")
    func licenceRoundTrip() throws {
        let data = try JSONEncoder().encode(LayerLicence.allCases)
        #expect(try JSONDecoder().decode([LayerLicence].self, from: data) == LayerLicence.allCases)
    }
}
