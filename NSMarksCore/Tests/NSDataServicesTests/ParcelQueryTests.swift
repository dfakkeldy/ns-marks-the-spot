import Foundation
import GeoCore
import MapCatalog
import ParityFixtures
import Testing

@testable import NSDataServices

/// The NSPRD parcel query, checked against URLs the web actually produced.
///
/// The fixture holds whole query strings and the answers `normalizePid` gave a
/// list of awkward inputs, so these tests compare against what ships on the web
/// rather than against a reading of `URLSearchParams` and JavaScript's `\s`. A
/// reading of those is what got the first attempt at this wrong.
@Suite("NSPRD parcel query")
struct ParcelQueryTests {
    static let fixture = ParityFixture.loaded
    /// Every test here needs clearance; NSPRD is Province-restricted. Reachable
    /// only through `@testable`, which is the gate working as designed.
    static let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)

    @Test func addressesTheLayerTheWebAddresses() throws {
        let expected = try #require(Self.fixture.parcelQuery?["layerUrl"]?.string)
        let actual = try #require(ParcelQuery.layerURL)
        #expect(actual.absoluteString == expected)
    }

    @Test func batchesAtTheWebsSize() throws {
        let expected = try #require(Self.fixture.parcelQuery?["pidBatchSize"]?.int)
        #expect(ParcelQuery.pidBatchSize == expected)
    }

    @Test func normalizesEveryPIDTheWayTheWebDoes() throws {
        let cases = try #require(
            Self.fixture.parcelNormalizationCases,
            "the fixture's normalization table could not be read"
        )
        // The set is not decoration: it carries the byte-order mark a
        // spreadsheet export prepends, the zero-width space that looks
        // identical but is not whitespace to JavaScript, and two families of
        // non-ASCII digits.
        #expect(cases.count >= 25)

        for entry in cases {
            let actual = ParcelQuery.normalizePID(entry.input)
            #expect(
                actual == entry.pid,
                "normalizePID(\(escaped(entry.input))) gave \(actual.map(escaped) ?? "nil"), web gave \(entry.pid.map(escaped) ?? "nil")"
            )
        }
    }

    @Test func acceptsAndRejectsSomethingInTheFixture() throws {
        // Guards the loop above: a table that happened to be all-nil, or all
        // non-nil, would let a `return nil` implementation pass every row.
        let cases = try #require(Self.fixture.parcelNormalizationCases)
        #expect(cases.contains { $0.pid != nil })
        #expect(cases.contains { $0.pid == nil })
    }

    @Test func buildsThePIDQueryTheWebBuilds() throws {
        let samples = try #require(Self.fixture.parcelQuerySamples)
        let expected = try #require(samples["single-pid"])
        let url = try ParcelQuery.pidQueryURL(pids: ["40203483"], clearance: Self.cleared)
        #expect(url.absoluteString == expected)
    }

    @Test func deduplicatesAndOrdersPIDsTheWayTheWebDoes() throws {
        let samples = try #require(Self.fixture.parcelQuerySamples)
        let expected = try #require(samples["multi-pid-deduplicated"])
        let url = try ParcelQuery.pidQueryURL(
            pids: ["40203483", "4020-3483", "00123456", "40203483", "99887766"],
            clearance: Self.cleared
        )
        #expect(url.absoluteString == expected)
    }

    @Test func buildsThePointQueryTheWebBuilds() throws {
        let samples = try #require(Self.fixture.parcelQuerySamples)
        let expected = try #require(samples["point-fractional"])
        let url = try ParcelQuery.pointQueryURL(
            latitude: 44.651070408, longitude: -63.582687, clearance: Self.cleared
        )
        #expect(url.absoluteString == expected)
    }

    @Test func writesWholeCoordinatesWithoutADecimalPoint() throws {
        // JavaScript writes `-63`; Swift's default interpolation writes
        // `-63.0`, and the two are different cache keys for the same ground.
        let samples = try #require(Self.fixture.parcelQuerySamples)
        let expected = try #require(samples["point-whole-numbers"])
        let url = try ParcelQuery.pointQueryURL(
            latitude: 45, longitude: -63, clearance: Self.cleared
        )
        #expect(url.absoluteString == expected)
        #expect(url.absoluteString.contains("geometry=-63%2C45"))
    }

    @Test func writesNegativeZeroAsZero() throws {
        let samples = try #require(Self.fixture.parcelQuerySamples)
        let expected = try #require(samples["point-negative-zero"])
        let url = try ParcelQuery.pointQueryURL(
            latitude: -0.0, longitude: 0, clearance: Self.cleared
        )
        #expect(url.absoluteString == expected)
    }

    @Test func splitsLongPIDListsIntoBatches() throws {
        let pids = (0..<95).map { String(format: "%08d", $0 + 10_000_000) }
        let urls = try ParcelQuery.pidQueryURLs(pids: pids, clearance: Self.cleared)
        #expect(urls.count == 3)

        // Every PID appears exactly once across the batches, which is the
        // property that matters — a batcher that dropped the tail or repeated a
        // group would still produce three URLs.
        let quoted = urls
            .flatMap { url -> [String] in
                pids.filter { url.absoluteString.contains("%27\($0)%27") }
            }
        #expect(Set(quoted).count == pids.count)
        #expect(quoted.count == pids.count)
    }

    @Test func batchesAreFullBeforeTheLastOne() throws {
        let pids = (0..<95).map { String(format: "%08d", $0 + 10_000_000) }
        let batches = ParcelQuery.batches(of: pids)
        #expect(batches.map(\.count) == [40, 40, 15])
        #expect(batches.flatMap(\.self) == pids)
    }

    // MARK: - Refusals

    @Test func refusesWithoutProvinceClearance() {
        #expect(throws: ParcelQuery.Refusal.licenceNotAccepted) {
            try ParcelQuery.pidQueryURL(pids: ["40203483"], clearance: .none)
        }
        #expect(throws: ParcelQuery.Refusal.licenceNotAccepted) {
            try ParcelQuery.pointQueryURL(latitude: 45, longitude: -63, clearance: .none)
        }
        #expect(throws: ParcelQuery.Refusal.licenceNotAccepted) {
            try ParcelQuery.pidQueryURLs(pids: ["40203483"], clearance: .none)
        }
    }

    @Test func checksTheLicenceBeforeTheInput() {
        // Ordering, asserted: an uncleared caller passing garbage must be told
        // about the licence, not about the garbage. The other way round leaks
        // that the input was the only thing standing between them and the
        // request.
        #expect(throws: ParcelQuery.Refusal.licenceNotAccepted) {
            try ParcelQuery.pidQueryURL(pids: ["not a pid"], clearance: .none)
        }
        #expect(throws: ParcelQuery.Refusal.licenceNotAccepted) {
            try ParcelQuery.pointQueryURL(
                latitude: .nan, longitude: 900, clearance: .none
            )
        }
    }

    @Test func refusesWhenNothingParsesAsAPID() {
        #expect(throws: ParcelQuery.Refusal.noValidPID) {
            try ParcelQuery.pidQueryURL(pids: [], clearance: Self.cleared)
        }
        #expect(throws: ParcelQuery.Refusal.noValidPID) {
            try ParcelQuery.pidQueryURL(pids: ["PID 40203483", "1234567"], clearance: Self.cleared)
        }
        #expect(throws: ParcelQuery.Refusal.noValidPID) {
            try ParcelQuery.pidQueryURLs(pids: ["nope"], clearance: Self.cleared)
        }
    }

    @Test func refusesCoordinatesOffTheGlobe() {
        let bad: [(Double, Double)] = [
            (90.0001, 0), (-90.0001, 0), (0, 180.0001), (0, -180.0001),
            (.nan, 0), (0, .nan), (.infinity, 0), (0, -.infinity),
        ]
        for (latitude, longitude) in bad {
            #expect(throws: ParcelQuery.Refusal.invalidCoordinate) {
                try ParcelQuery.pointQueryURL(
                    latitude: latitude, longitude: longitude, clearance: Self.cleared
                )
            }
        }
    }

    @Test func acceptsTheCorners() throws {
        // The web's bounds are inclusive, so the poles and the antimeridian are
        // valid input rather than an off-by-one refusal.
        for (latitude, longitude) in [(90.0, 180.0), (-90.0, -180.0)] {
            _ = try ParcelQuery.pointQueryURL(
                latitude: latitude, longitude: longitude, clearance: Self.cleared
            )
        }
    }

    /// Renders control and invisible characters so a failure message is legible.
    private func escaped(_ value: String) -> String {
        var out = "\""
        for scalar in value.unicodeScalars {
            if scalar.value < 0x20 || scalar.value > 0x7E {
                out += String(format: "\\u{%04X}", scalar.value)
            } else {
                out.unicodeScalars.append(scalar)
            }
        }
        return out + "\""
    }
}
