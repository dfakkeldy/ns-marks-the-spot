import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// The panel that opens on the selected parcel.
///
/// Two services answer it independently and either can fail, so most of what
/// is asserted here is which of three states a section lands in. That is the
/// whole job: `ready([])` says the parcel has none of the thing, `unavailable`
/// says nobody was able to say, and a panel that renders the second as the
/// first tells a user there is no road beside a property when in fact the road
/// service was down.
@MainActor
@Suite("Parcel inspection")
struct ParcelInspectionTests {
    /// A view model whose parcel, address and NSTDB lookups are all answered on
    /// `channel`. The catch-all comes last and answers with an empty ArcGIS
    /// reply, so the eighteen sublayer requests a test does not care about
    /// succeed with nothing rather than failing the set.
    private static func viewModel(
        _ channel: String,
        answering responses: [(String, StubURLProtocol.Response)],
        licence: ProvinceLicenceState = .accepted
    ) -> OverlayViewModel {
        StubURLProtocol.stub(channel: channel, matching: responses + [("", noFeatures)])
        let session = { StubURLProtocol.session(channel: channel) }
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsprd],
            licence: licence,
            zoomLevel: 16,
            parcelFetcher: ParcelFetcher(transport: .urlSession(session())),
            civicFetcher: CivicAddressFetcher(transport: .urlSession(session())),
            contextFetcher: ParcelContextFetcher(transport: .urlSession(session()))
        )
        if viewModel.layers.first(where: { $0.id == LayerID.nsprd.rawValue })?.isVisible != true {
            viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        }
        return viewModel
    }

    /// Selects a parcel by PID and waits for the panel's two lookups as well as
    /// the parcel one, so an assertion is never read mid-flight.
    private static func inspect(
        _ viewModel: OverlayViewModel, pid: String = "50334317"
    ) async -> ParcelInspection? {
        viewModel.searchParcel(pid)
        await viewModel.awaitParcelLookup()
        await viewModel.awaitInspection()
        return viewModel.inspection
    }

    // MARK: - Fixtures

    /// A parcel whose triangle sits at `westEdge`, which is how a test tells
    /// one parcel's downstream lookups from another's: the civic query carries
    /// the parcel's bounding box in its URL.
    private static func parcel(pid: String, westEdge: String = "-63.5") -> StubURLProtocol.Response {
        let east = String(format: "%.1f", (Double(westEdge) ?? -63.5) + 0.1)
        return .success(Data("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "\(pid)", "SHAPE.AREA": 11057.27},
              "geometry": {
                "type": "Polygon",
                "coordinates": [
                  [[\(westEdge), 44.6], [\(east), 44.6], [\(east), 44.7], [\(westEdge), 44.6]]
                ]
              }
            }
          ]
        }
        """.utf8))
    }

    private static func addresses(_ road: String) -> Data {
        Data("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {
                "pntid": "1", "civic_num": "10", "strname": "\(road)",
                "unit_type": null, "unit": null, "streettype": null, "streetdir": null,
                "mailing_muni": "Halifax", "county": "Halifax"
              },
              "geometry": {"type": "Point", "coordinates": [-63.5752, 44.6488]}
            }
          ]
        }
        """.utf8)
    }

    /// A PID the service could name but not draw.
    private static let parcelWithoutBoundary = StubURLProtocol.Response.success(Data("""
    {
      "type": "FeatureCollection",
      "features": [
        {"properties": {"PID": "50334317"}, "geometry": null}
      ]
    }
    """.utf8))

    private static let noFeatures = StubURLProtocol.Response.success(Data(#"{"features": []}"#.utf8))

    /// Sublayer 8 of the roads service — "Road or trail".
    private static let roadsSublayer8 = "BASE_NSTDB_10k_Roads_UT83/MapServer/8/query"
    /// Sublayer 8 of the water service — "Water area".
    private static let waterSublayer8 = "BASE_NSTDB_10k_Water_WM84/MapServer/8/query"

    private static let oneRoad = StubURLProtocol.Response.success(Data("""
    {"features": [{"attributes": {"STREET": "Shore Road", "ROADC_DESC": "Local"}}]}
    """.utf8))

    private static let oneLake = StubURLProtocol.Response.success(Data("""
    {"features": [{"attributes": {"FEAT_DESC": "Lake"}}]}
    """.utf8))

    private static let twoAddresses = StubURLProtocol.Response.success(Data("""
    {
      "type": "FeatureCollection",
      "features": [
        {
          "properties": {
            "pntid": "1", "civic_num": "1234", "strname": "Barrington Street",
            "unit_type": null, "unit": null, "streettype": null, "streetdir": null,
            "mailing_muni": "Halifax", "county": "Halifax"
          },
          "geometry": {"type": "Point", "coordinates": [-63.5752, 44.6488]}
        },
        {
          "properties": {
            "pntid": "2", "civic_num": "1236", "strname": "Barrington Street",
            "unit_type": null, "unit": null, "streettype": null, "streetdir": null,
            "mailing_muni": "Halifax", "county": "Halifax"
          },
          "geometry": {"type": "Point", "coordinates": [-63.5753, 44.6489]}
        }
      ]
    }
    """.utf8))

    private static let noAddresses = StubURLProtocol.Response.success(Data("""
    {"type": "FeatureCollection", "features": []}
    """.utf8))

    // MARK: - The record

    @Test func theHeaderIsTheParcelRecordAndArrivesWithoutWaitingForAnything() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.searchParcel("50334317")
        await viewModel.awaitParcelLookup()

        // Read before the two service lookups are awaited: the facts the parcel
        // record already carries must not wait behind two network round trips.
        #expect(viewModel.inspection?.pid == "50334317")
        #expect(viewModel.inspection?.mappedArea != nil)
        #expect(viewModel.inspection?.boundaryNotice == nil)

        await viewModel.awaitInspection()
    }

    @Test func noParcelSelectedIsNoPanel() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(viewModel.inspection == nil)
        _ = await Self.inspect(viewModel)
        #expect(viewModel.inspection != nil)

        viewModel.clearParcelSelection()
        #expect(viewModel.inspection == nil)
    }

    /// Both lookups are made against the parcel's rings, so a parcel with none
    /// is a parcel neither question can be asked about. Saying so is the point:
    /// "no civic address here" would be a finding nobody made.
    @Test func aParcelWithNoBoundaryIsAskedNothingAndSaysSo() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcelWithoutBoundary),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        let requestsForTheParcel = 1
        let inspection = await Self.inspect(viewModel)

        #expect(inspection?.boundaryNotice != nil)
        #expect(
            inspection?.civicAddresses
                == .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
        )
        #expect(
            inspection?.mappedContext
                == .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
        )
        #expect(StubURLProtocol.requestCount(channel: channel) == requestsForTheParcel)
    }

    // MARK: - Civic addresses

    @Test func theCivicAddressesInsideTheParcelAreListed() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
            ("tntn-er5g", Self.twoAddresses),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        let inspection = await Self.inspect(viewModel)

        guard case .ready(let addresses) = inspection?.civicAddresses else {
            Issue.record("expected addresses, got \(String(describing: inspection?.civicAddresses))")
            return
        }
        #expect(addresses.map(\.pntid) == ["1", "2"])
        #expect(addresses.first?.label.contains("1234 Barrington Street") == true)
    }

    /// The one state allowed to mean the parcel has no mapped address.
    @Test func anEmptyAddressReplyIsAnAnswerRatherThanAFailure() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
            ("tntn-er5g", Self.noAddresses),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(await Self.inspect(viewModel)?.civicAddresses == .ready([]))
    }

    @Test func anAddressOutageIsNotAnAbsenceOfAddresses() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
            ("tntn-er5g", .status(503)),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        let inspection = await Self.inspect(viewModel)

        guard case .unavailable(let message) = inspection?.civicAddresses else {
            Issue.record("expected unavailable, got \(String(describing: inspection?.civicAddresses))")
            return
        }
        #expect(message == "Civic address lookup is unavailable right now.")
        // The sentence that would be wrong here. An outage is not an absence.
        #expect(message != "No mapped civic address matched that search.")
    }

    // MARK: - Mapped roads and water

    @Test func theMappedRoadsAndWaterOnTheParcelAreListed() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
            (Self.roadsSublayer8, Self.oneRoad),
            (Self.waterSublayer8, Self.oneLake),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        let inspection = await Self.inspect(viewModel)

        guard case .ready(let context) = inspection?.mappedContext else {
            Issue.record("expected context, got \(String(describing: inspection?.mappedContext))")
            return
        }
        // One road, not two: the same sublayer answers the intersecting query
        // and the adjacent one, and the parcel does not have two roads on it
        // because it was asked twice.
        #expect(context.roads.map(\.name) == ["Shore Road"])
        #expect(context.roads.first?.relationship == .intersects)
        #expect(context.water.map(\.name) == ["Lake"])
    }

    /// One sublayer failing fails the set, because a short list of roads reads
    /// as a complete one.
    @Test func aFailedSublayerLeavesNoPartialRoadList() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
            (Self.roadsSublayer8, Self.oneRoad),
            (Self.waterSublayer8, .status(500)),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        let inspection = await Self.inspect(viewModel)

        guard case .unavailable(let message) = inspection?.mappedContext else {
            Issue.record("expected unavailable, got \(String(describing: inspection?.mappedContext))")
            return
        }
        #expect(message == "Mapped feature lookup is unavailable right now.")
    }

    /// The two sections are independent evidence and fail independently.
    @Test func oneSourceFailingLeavesTheOtherStanding() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
            ("tntn-er5g", .status(503)),
            (Self.roadsSublayer8, Self.oneRoad),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        let inspection = await Self.inspect(viewModel)

        guard case .ready(let context) = inspection?.mappedContext else {
            Issue.record("expected context, got \(String(describing: inspection?.mappedContext))")
            return
        }
        #expect(context.roads.map(\.name) == ["Shore Road"])
        if case .ready = inspection?.civicAddresses {
            Issue.record("the address outage should not have produced an answer")
        }
    }

    /// The panel is about the parcel that is selected now, and the addresses it
    /// shows have to be the ones asked for under that PID.
    @Test func selectingASecondParcelMovesThePanelToIt() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            // The digits of a PID search survive URL encoding, so each parcel
            // gets its own answer while both address requests — which carry
            // geometry, not a PID — fall to the shared stub.
            ("11111111", Self.parcel(pid: "11111111")),
            ("22222222", Self.parcel(pid: "22222222")),
            ("tntn-er5g", Self.twoAddresses),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(await Self.inspect(viewModel, pid: "11111111")?.pid == "11111111")

        let second = await Self.inspect(viewModel, pid: "22222222")
        #expect(second?.pid == "22222222")
        guard case .ready(let addresses) = second?.civicAddresses else {
            Issue.record("expected addresses, got \(String(describing: second?.civicAddresses))")
            return
        }
        #expect(addresses.count == 2)
    }

    // MARK: - Wording that must not credit a silent source

    /// The road list is filled from two sources, and only one of them can fail.
    /// An empty list must not be described as though both had looked.
    @Test func anEmptyRoadListOnlyNamesTheSourcesThatAnswered() {
        #expect(
            ParcelLookupMessage.noRoadsListed(addressesAnswered: true)
                .contains("civic-address")
        )
        let unanswered = ParcelLookupMessage.noRoadsListed(addressesAnswered: false)
        #expect(!unanswered.lowercased().contains("civic"))
        #expect(!unanswered.lowercased().contains("address"))
    }

    /// A short list looks exactly like a complete one, so the shortfall is said
    /// out loud whenever the address file has not answered.
    @Test func aRoadListMissingASourceSaysSo() {
        #expect(ParcelLookupMessage.roadListShortfall(addressesAnswered: true) == nil)
        #expect(
            ParcelLookupMessage.roadListShortfall(addressesAnswered: false)?
                .contains("has not answered") == true
        )
    }

    // MARK: - Withdrawing permission

    /// Hiding the tile layers is only half a revocation. The parcel drawn over
    /// them and the panel describing it are NSPRD too, and they are the part
    /// the user is actually reading.
    @Test func refusingTheProvinceLicenceTakesTheParcelAndItsPanelDown() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("NSPRD", Self.parcel(pid: "50334317")),
            ("tntn-er5g", Self.twoAddresses),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        _ = await Self.inspect(viewModel)
        #expect(viewModel.inspection != nil)

        viewModel.declineProvinceLicence()

        #expect(viewModel.inspection == nil)
        #expect(viewModel.parcels.selectedPID == nil)
        #expect(viewModel.parcels.features.isEmpty)
        #expect(viewModel.searchText.isEmpty)
        #expect(viewModel.parcelMessage == nil)
        #expect(viewModel.addressResults.isEmpty)
    }

    /// The case the PID guard exists for, arranged rather than hoped for.
    ///
    /// The first parcel's address lookup is still in flight when the second is
    /// selected, and is let go only after the second has answered. Without the
    /// guard the panel would end up showing the second parcel's PID over the
    /// first parcel's address.
    @Test func anAnswerForThePreviousParcelDoesNotLandOnThisOne() async throws {
        let channel = #function
        let gate = HeldTransport()
        await gate.answer("-63.5", with: Self.addresses("First Parcel Road"))
        await gate.answer("-62.5", with: Self.addresses("Second Parcel Road"))

        StubURLProtocol.stub(channel: channel, matching: [
            ("11111111", Self.parcel(pid: "11111111", westEdge: "-63.5")),
            ("22222222", Self.parcel(pid: "22222222", westEdge: "-62.5")),
            ("", Self.noFeatures),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        let session = { StubURLProtocol.session(channel: channel) }
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsprd],
            zoomLevel: 16,
            parcelFetcher: ParcelFetcher(transport: .urlSession(session())),
            civicFetcher: CivicAddressFetcher(transport: await gate.transport),
            contextFetcher: ParcelContextFetcher(transport: .urlSession(session()))
        )
        if viewModel.layers.first(where: { $0.id == LayerID.nsprd.rawValue })?.isVisible != true {
            viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        }

        viewModel.searchParcel("11111111")
        await viewModel.awaitParcelLookup()
        // Waiting for the request to reach the gate, not merely for the app to
        // have asked for it: a lookup cancelled before it ever ran would leave
        // nothing to arrive late, and the test would prove nothing.
        await gate.awaitArrivals("-63.5")
        #expect(viewModel.inspection?.pid == "11111111")
        #expect(viewModel.inspection?.civicAddresses == .looking)

        // The second parcel arrives while the first parcel's address lookup is
        // still held.
        viewModel.searchParcel("22222222")
        await viewModel.awaitParcelLookup()
        await gate.release("-62.5")
        await viewModel.awaitInspection()

        guard case .ready(let secondAddresses) = viewModel.inspection?.civicAddresses else {
            Issue.record("the second parcel's addresses should have landed")
            await gate.release("-63.5")
            return
        }
        #expect(secondAddresses.first?.label.contains("Second Parcel Road") == true)

        // Now let the first parcel's reply through and wait for it to finish.
        await gate.release("-63.5")
        await gate.awaitCompletions("-63.5")

        #expect(viewModel.inspection?.pid == "22222222")
        guard case .ready(let stillTheSecond) = viewModel.inspection?.civicAddresses else {
            Issue.record("the second parcel's addresses were replaced")
            return
        }
        #expect(stillTheSecond.first?.label.contains("Second Parcel Road") == true)
    }
}
