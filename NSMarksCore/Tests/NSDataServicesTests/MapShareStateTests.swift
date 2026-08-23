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
        taxSaleEnabled: true,
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

        #expect(value("taxSale") == "on")
        #expect(value("pid") == "15234636")
        #expect(value("event") == "cbrm-2026-07-21")
        #expect(
            value("layers")
                == "fletcher,nsprd,roads,mineral-occurrences,"
                + "inverness-hydro-potential,coastal-flood-2050,ns-well-logs"
        )
        #expect(value("position") == "46.18845,-60.02123,15")
    }

    /// The parameters come out in the browser's order, and byte-for-byte.
    ///
    /// Asserted as a whole string rather than key by key because the order is
    /// itself the contract: two surfaces writing the same map state must
    /// produce the same link, or a reader comparing two links they were sent
    /// cannot tell whether they show the same thing.
    @Test func theLinkIsByteIdenticalToTheOneTheBrowserWrites() throws {
        let url = try #require(
            Self.state.url(base: URL(string: "https://example.com/map/")!)
        )

        #expect(
            url.absoluteString == "https://example.com/map/"
                + "?taxSale=on&mode=current&pid=15234636&event=cbrm-2026-07-21"
                + "&layers=fletcher,nsprd,roads,mineral-occurrences,"
                + "inverness-hydro-potential,coastal-flood-2050,ns-well-logs"
                + "&position=46.18845,-60.02123,15"
        )
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

    /// Tax-sale research is one optional use of this map, not what the map is,
    /// and a link that does not say otherwise opens without it.
    @Test func aLinkThatSaysNothingAboutTaxSalesOpensWithoutThem() {
        #expect(Self.parse("https://example.com/map/").taxSaleEnabled == false)
        #expect(Self.parse("https://example.com/map/?layers=roads").taxSaleEnabled == false)
        #expect(Self.parse("https://example.com/map/?taxSale=on").taxSaleEnabled)
        #expect(
            Self.parse("https://example.com/map/?taxSale=off&mode=historical")
                .taxSaleEnabled == false
        )
    }

    /// Links made before the switch existed carry no `taxSale`, and every one
    /// of them that names a mode or an event was written by a map that was
    /// showing tax sales. Reading those as "off" would open the map without
    /// the notices the sender was pointing at.
    @Test func anOlderLinkNamingAModeOrAnEventStillOpensWithTaxSales() {
        #expect(Self.parse("https://example.com/map/?mode=current").taxSaleEnabled)
        #expect(
            Self.parse("https://example.com/map/?event=cbrm-2026-07-21").taxSaleEnabled
        )
    }

    /// Which notices were on is a fact about a map that was showing them.
    @Test func aLinkFromAMapWithoutTaxSalesCarriesNoNoticeSelection() throws {
        var quiet = Self.state
        quiet.taxSaleEnabled = false
        let url = try #require(quiet.url(base: URL(string: "https://example.com/map/")!))
        let query = try #require(
            URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        )

        #expect(query.first { $0.name == "taxSale" }?.value == "off")
        #expect(!query.contains { $0.name == "event" })
        // And it comes back the same way, rather than as a map that lost a
        // selection somewhere in transit.
        #expect(Self.parse(url.absoluteString).eventIDs.isEmpty)
        #expect(Self.parse(url.absoluteString).taxSaleEnabled == false)
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

/// The readout under the map, which is also what the user copies out of it.
@Suite("The position readout")
struct MapPositionReadoutTests {
    @Test func theCentreIsFiveDecimalsAndTheZoomComesFirst() {
        let position = MapPosition(latitude: 46.18845, longitude: -60.02123, zoom: 15)

        #expect(position.coordinateText == "46.18845, -60.02123")
        #expect(position.readoutText == "Z 15 · 46.18845, -60.02123")
    }

    /// Five decimals always, not "up to five": a coordinate that dropped its
    /// trailing zeros would paste as a different-looking number every time the
    /// map moved a metre.
    @Test func aRoundCoordinateStillPrintsItsDecimals() {
        #expect(
            MapPosition(latitude: 46, longitude: -61, zoom: 9).coordinateText
                == "46.00000, -61.00000"
        )
    }

    /// The pair is meant to be pasted into something else. A decimal comma
    /// would turn two numbers into four, wherever the phone happens to be set.
    @Test func theSeparatorIsTheOnlyCommaWhateverTheLocale() {
        let text = MapPosition(latitude: 46.5, longitude: -60.5, zoom: 12).coordinateText
        #expect(text.filter { $0 == "," }.count == 1)
        #expect(text.contains("."))
    }

    /// The guard in front of `parse`, which cannot fail and so cannot be asked
    /// this question itself.
    @Test("A link is only a shared view when it carries one")
    func aLinkIsOnlyASharedViewWhenItCarriesOne() {
        for name in MapShareState.parameterNames {
            #expect(MapShareState.carriesState("https://example.com/map/?\(name)=x"))
        }
        #expect(!MapShareState.carriesState("https://example.com/map/"))
        #expect(!MapShareState.carriesState("https://example.com/map/?ref=news"))
        // Not a link at all: a PID, an address, and a file the reader dragged
        // in all reach the same classifier.
        #expect(!MapShareState.carriesState("15234636"))
        #expect(!MapShareState.carriesState("12 Main St"))
        #expect(!MapShareState.carriesState("file:///tmp/x.geojson?pid=15234636"))
        // The host is deliberately not checked: the same query is written by a
        // local build and by the published map.
        #expect(MapShareState.carriesState("http://localhost:5173/?position=46,-61,10"))
    }
}
