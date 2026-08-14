import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// The link two surfaces have to agree on.
///
/// The expected strings here are the web's own test expectations, kept
/// deliberately: a link built on the phone is opened in the browser map, and a
/// divergence of one character is a link that goes somewhere else.
@Suite("Shared map links")
struct MapShareStateTests {
    private static let layers = Set(LayerID.allCases.map(\.rawValue))
        .union([MapShareState.modernBaseLayerID])

    private static let state = MapShareState(
        mode: .current,
        pid: "15234636",
        eventIDs: ["cbrm-2026-07-21"],
        layerIDs: [
            "fletcher",
            "nsprd",
            "roads",
            "mineral-occurrences",
            "inverness-hydro-potential",
            "coastal-flood-2050",
            "ns-well-logs",
        ],
        position: MapPosition(latitude: 46.18845, longitude: -60.02123, zoom: 15)
    )

    private static func parse(_ value: String) -> MapShareState {
        MapShareState.parse(
            value,
            validEventIDs: ["cbrm-2026-07-21", "hrm-2022-03-08"],
            validLayerIDs: layers
        )
    }

    @Test func theLinkCarriesThePIDEventLayersAndPosition() throws {
        let url = try #require(
            Self.state.url(base: URL(string: "https://example.com/map/")!)
        )
        let query = try #require(
            URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        )
        func value(_ name: String) -> String? { query.first { $0.name == name }?.value }

        #expect(value("pid") == "15234636")
        #expect(value("event") == "cbrm-2026-07-21")
        #expect(
            value("layers")
                == "fletcher,nsprd,roads,mineral-occurrences,"
                + "inverness-hydro-potential,coastal-flood-2050,ns-well-logs"
        )
        #expect(value("position") == "46.18845,-60.02123,15")
    }

    @Test func aHistoricalStateSurvivesTheRoundTrip() throws {
        var historical = Self.state
        historical.mode = .historical
        historical.eventIDs = ["hrm-2022-03-08"]
        let url = try #require(
            historical.url(base: URL(string: "https://example.com/map/")!)
        )

        #expect(Self.parse(url.absoluteString) == historical)
    }

    /// Every layer group the web round-trips, because a layer dropped in
    /// transit reopens the map without a source the sender was reading.
    @Test(arguments: [
        ["nsprd", "mineral-proximity-parcels"],
        ["published-river-flood-zones", "coastal-flood-current", "coastal-flood-2100"],
        ["arsenic-risk-wells", "uranium-risk-wells", "manganese-risk-wells", "surficial-aquifers"],
        ["nsprd", "old-growth-policy"],
        ["modern", "ns-aerial", "nsprd", "roads"],
    ])
    func everyLayerGroupSurvivesTheRoundTrip(layerIDs: [String]) throws {
        var state = Self.state
        state.layerIDs = layerIDs
        let url = try #require(state.url(base: URL(string: "https://example.com/map/")!))

        #expect(Self.parse(url.absoluteString) == state)
    }

    /// An unknown event or layer is dropped rather than kept. Keeping it would
    /// open a map claiming to show a notice this build does not carry.
    @Test func unknownEventsAndLayersAreDroppedAndThePositionIsClamped() {
        let parsed = Self.parse(
            "https://example.com/map/?mode=current&pid=15-234-636&event=unknown"
                + "&layers=roads,unknown&position=99,-200,40"
        )

        #expect(parsed.pid == "15234636")
        #expect(parsed.eventIDs.isEmpty)
        #expect(parsed.layerIDs == ["roads"])
        #expect(parsed.position == MapPosition(latitude: 47.5, longitude: -66.5, zoom: 23))
    }

    /// A link with no position, or a broken one, opens where the map opens. Not
    /// at zero degrees north, which is in the Atlantic off Africa.
    @Test(arguments: ["", "https://example.com/map/", "https://example.com/map/?position=x,y,z"])
    func anUnreadablePositionFallsBackToTheOpeningView(link: String) {
        #expect(Self.parse(link).position == MapPosition.default)
    }

    /// The mode is a closed set. Anything else is the ordinary one, because a
    /// map that cannot tell which record set it is reading must not guess the
    /// one that shows dated outcomes.
    @Test func anUnrecognisedModeReadsAsTheCurrentNotices() {
        #expect(Self.parse("?mode=archive").mode == .current)
        #expect(Self.parse("?mode=historical").mode == .historical)
    }

    /// A PID that is not eight digits is no PID. The map opens on the place
    /// rather than on a parcel nobody can name.
    @Test func aMalformedPIDIsDropped() {
        #expect(Self.parse("?pid=1234567").pid == nil)
        #expect(Self.parse("?pid=15 234 636").pid == "15234636")
    }

    /// Trailing zeros come off, as they do on the web. Five places is about a
    /// metre, and the extra characters are noise in a link people paste.
    @Test(arguments: [
        (46.18845, "46.18845"),
        (46.0, "46"),
        (-60.5, "-60.5"),
        (46.188450, "46.18845"),
    ])
    func coordinatesAreWrittenCompactly(value: Double, expected: String) {
        #expect(MapShareState.compact(value) == expected)
    }

    /// The base URL's own query and fragment are replaced, not appended to.
    /// A link built from a link would otherwise carry two positions.
    @Test func buildingFromAnExistingLinkReplacesItsQuery() throws {
        let url = try #require(
            Self.state.url(base: URL(string: "https://example.com/map/?pid=00000000#x")!)
        )

        #expect(url.fragment == nil)
        #expect(url.absoluteString.contains("pid=15234636"))
        #expect(url.absoluteString.contains("00000000") == false)
    }
}
