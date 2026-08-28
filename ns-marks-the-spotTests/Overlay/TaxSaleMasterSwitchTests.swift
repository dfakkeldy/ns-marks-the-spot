import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// The switch that decides whether this is a map of Nova Scotia that can show
/// tax sales, or a tax-sale map.
///
/// The browser opens without them, and the phone now does too. What is tested
/// here is the whole of what the switch has to reach: nothing is drawn, nothing
/// is asked for, the parcel card carries no notice, the record modes are out of
/// reach, and a link out of such a map does not turn tax sales on for whoever
/// opens it.
@MainActor
@Suite("The tax-sale master switch")
struct TaxSaleMasterSwitchTests {
    // MARK: - A notice and a record, both naming a parcel

    private static func noticeCatalog() -> TaxSaleCatalog {
        let id = "delta-2026-09-01"
        return TaxSaleCatalog(events: [
            TaxSaleEvent(
                id: id,
                municipalityID: "delta",
                municipality: "Municipality of Delta County",
                shortMunicipality: "Delta",
                eventType: .publicAuction,
                eventStatus: .upcoming,
                saleStartsAt: Date(timeIntervalSince1970: 4_000_000_000),
                venue: "Delta Hall",
                sourceURL: URL(string: "https://example.test/delta-notice.pdf")!,
                sourceLabel: "Delta County tax sale notice",
                retrievedOn: "2026-08-01",
                listings: [
                    TaxSaleListing(
                        eventID: id,
                        recordID: "\(id)-1",
                        lien: "1",
                        pids: ["77777777"],
                        location: "Delta Road",
                        financial: MunicipalFinancialField(
                            kind: .minimumBid,
                            label: "Minimum bid",
                            amountCents: 120_000
                        ),
                        redemptionCategory: .sixMonth,
                        redemptionLabel: "Six-month redemption period",
                        listingStatus: .advertised
                    )
                ]
            )
        ])
    }

    private static func recordCatalog() -> HistoricalTaxSaleCatalog {
        let event = HistoricalTaxSaleEvent(
            id: "epsilon-2025-05-06",
            municipalityID: "epsilon",
            municipality: "Municipality of Epsilon County",
            shortMunicipality: "Epsilon",
            saleDate: "2025-05-06",
            saleMethod: .publicAuction,
            listingIdentifierLabel: "Lien number",
            advertisedAmountLabel: "Minimum bid",
            noticeURL: URL(string: "https://example.test/epsilon-notice.pdf")!,
            resultStatus: .verified,
            resultURL: URL(string: "https://example.test/epsilon-results.pdf")!,
            retrievedOn: "2026-08-01",
            noticeSnapshotDate: "2025-04-01",
            resultSnapshotDate: "2025-05-20",
            noticeSHA256: String(repeating: "d", count: 64),
            resultSHA256: String(repeating: "e", count: 64),
            sourceNotes: "Epsilon County notice and published results."
        )
        return HistoricalTaxSaleCatalog(
            events: [event],
            records: [
                HistoricalTaxSaleRecord(
                    eventID: event.id,
                    recordID: "epsilon-1",
                    listingIdentifier: "1",
                    pids: ["88888888"],
                    civicDescription: "Lot on Epsilon Road",
                    advertisedAmountCents: 100_000,
                    winningBidCents: 250_000,
                    outcome: .sold,
                    redemptionLabel: "Six-month redemption period",
                    nsprdMatchStatus: .matched,
                    nsprdMatchMethod: .exactOfficialPID,
                    reviewState: .visuallyVerified
                )
            ]
        )
    }

    private static func parcels(_ pids: [String]) -> StubURLProtocol.Response {
        let features = pids.map { pid in
            """
            {
              "properties": {"PID": "\(pid)", "SHAPE.AREA": 11057.27},
              "geometry": {
                "type": "Polygon",
                "coordinates": [[[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]]]
              }
            }
            """
        }
        return .success(Data("""
        {"type": "FeatureCollection", "features": [\(features.joined(separator: ","))]}
        """.utf8))
    }

    private static func viewModel(
        _ channel: String,
        answering responses: [(String, StubURLProtocol.Response)],
        showsTaxSale: Bool,
        controller: MapController = MapController()
    ) -> (OverlayViewModel, TaxSaleViewModel, HistoricalTaxSaleViewModel) {
        StubURLProtocol.stub(channel: channel, matching: responses)
        let session = StubURLProtocol.session(channel: channel)
        let taxSale = TaxSaleViewModel(catalog: noticeCatalog())
        let historical = HistoricalTaxSaleViewModel(catalog: recordCatalog())
        let viewModel = OverlayViewModel.forTesting(
            controller: controller,
            installing: [.nsprd],
            zoomLevel: 16,
            taxSale: taxSale,
            historical: historical,
            showsTaxSale: showsTaxSale,
            parcelFetcher: ParcelFetcher(transport: .urlSession(session)),
            civicFetcher: CivicAddressFetcher(transport: .urlSession(session)),
            contextFetcher: ParcelContextFetcher(transport: .urlSession(session))
        )
        if viewModel.layers.first(where: { $0.id == LayerID.nsprd.rawValue })?.isVisible == false {
            viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        }
        return (viewModel, taxSale, historical)
    }

    // MARK: - What a map without tax sales does

    /// Nothing advertised is drawn, and nothing is asked for.
    ///
    /// The check on the message matters as much as the check on the shapes: an
    /// empty map with "0 PIDs matched" under it would be a finding about the
    /// parcel fabric, and no question was put to it.
    @Test func aMapWithoutTaxSalesDrawsNoListedParcelAndAsksForNone() async {
        let channel = #function
        let controller = MapController()
        let (viewModel, _, _) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["77777777"]))],
            showsTaxSale: false,
            controller: controller
        )
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(viewModel.showsTaxSale == false)

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()

        #expect(viewModel.listedParcelMessage == nil)
        #expect(controller.state.parcelShapes.isEmpty)
    }

    /// The record modes are a choice within tax sales, so they are not offered
    /// and cannot be entered sideways.
    @Test func theRecordModesAreOutOfReachWhileTaxSalesAreOff() {
        let channel = #function
        let (viewModel, _, _) = Self.viewModel(channel, answering: [], showsTaxSale: false)
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(viewModel.offersRecordModes == false)

        viewModel.setMapRecordMode(.historical)

        #expect(viewModel.mapRecordMode == .current)
    }

    /// Switching on is what asks the Province for the advertised parcels.
    @Test func switchingTaxSalesOnDrawsWhatTheNoticesName() async {
        let channel = #function
        let controller = MapController()
        let (viewModel, _, _) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["77777777"]))],
            showsTaxSale: false,
            controller: controller
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.setTaxSaleEnabled(true)
        await viewModel.awaitListedParcels()

        #expect(viewModel.showsTaxSale)
        #expect(viewModel.offersRecordModes)
        #expect(controller.state.parcelShapes.map(\.role) == [.taxSale])
    }

    // MARK: - Switching back off

    /// The notice comes off the open parcel card with the switch.
    ///
    /// The card itself stays: the parcel is still a parcel, and the reader did
    /// not ask to close it. What leaves is the one thing the switch is about.
    @Test func turningTaxSalesOffTakesTheNoticeOffTheOpenCard() async {
        let channel = #function
        let (viewModel, _, _) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["77777777"]))],
            showsTaxSale: true
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.selectListedParcel(eventID: "delta-2026-09-01", pid: "77777777")
        await viewModel.awaitParcelLookup()

        #expect(viewModel.inspection?.taxSaleNotice?.listing.lien == "1")

        viewModel.setTaxSaleEnabled(false)

        #expect(viewModel.inspection?.pid == "77777777")
        #expect(viewModel.inspection?.taxSaleNotice == nil)
    }

    /// Switching off empties the map of the record set that was on it, and the
    /// map reads as the current one whatever mode was left behind.
    @Test func turningTaxSalesOffLeavesTheMapInItsOrdinaryState() async {
        let channel = #function
        let controller = MapController()
        let (viewModel, taxSale, historical) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["88888888"]))],
            showsTaxSale: true,
            controller: controller
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.setMapRecordMode(.historical)
        await viewModel.awaitHistoricalParcels()
        #expect(controller.state.parcelShapes.map(\.role) == [.historicalTaxSale])

        taxSale.setEventVisibility("delta-2026-09-01", to: false)
        historical.filter.municipalityID = "nowhere"
        viewModel.setTaxSaleEnabled(false)

        #expect(viewModel.mapRecordMode == .current)
        #expect(controller.state.parcelShapes.isEmpty)
        #expect(viewModel.historicalParcelMessage == nil)
        // The selections and filters go back to what a fresh map has. A reader
        // who returns to the records months later must not find a narrowed set
        // with nothing on screen saying it was narrowed.
        #expect(taxSale.selectedEventIDs == ["delta-2026-09-01"])
        #expect(historical.filter == HistoricalTaxSaleCatalog.Filter())
        // The mode itself is where the reader left it, as the web leaves it.
        // Nothing acts on it while the switch is off.
        #expect(historical.mode == .historical)
    }

    /// The parcels a bulk load brought in leave with the switch.
    ///
    /// The failure this guards is quiet: the styling stops calling them listed
    /// but they stay in hand, so every advertised property in the province
    /// would keep its outline on the map under the caption for an ordinary
    /// neighbouring boundary.
    @Test func theAdvertisedParcelsAreTakenBackOffTheMap() async {
        let channel = #function
        let controller = MapController()
        let (viewModel, _, _) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["77777777"]))],
            showsTaxSale: true,
            controller: controller
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()
        #expect(controller.state.parcelShapes.count == 1)

        viewModel.setTaxSaleEnabled(false)

        #expect(controller.state.parcelShapes.isEmpty)
        #expect(viewModel.parcels.features.isEmpty)
        #expect(viewModel.listedParcelMessage == nil)
    }

    /// The parcel the reader opened is not one of them.
    ///
    /// They chose it, and it is an ordinary parcel whether or not anybody is
    /// auctioning it. Only the notice on its card leaves.
    @Test func theOpenParcelSurvivesEvenWhenTheNoticeIsWhatLoadedIt() async {
        let channel = #function
        let controller = MapController()
        let (viewModel, _, _) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["77777777"]))],
            showsTaxSale: true,
            controller: controller
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.selectListedParcel(eventID: "delta-2026-09-01", pid: "77777777")
        await viewModel.awaitParcelLookup()

        viewModel.setTaxSaleEnabled(false)

        #expect(viewModel.parcels.selectedPID == "77777777")
        #expect(controller.state.parcelShapes.map(\.role) == [.selected])
    }

    /// The card stops claiming the parcel is unlisted.
    ///
    /// `nil` on its own is not enough: the card turns a missing notice into the
    /// sentence "not listed in any municipal notice included by this map",
    /// which on a map that never asked would be a municipal record reading as
    /// checked and clear.
    @Test func theCardStopsMakingATaxSaleFindingAtAll() async throws {
        let channel = #function
        let (viewModel, _, _) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["77777777"]))],
            showsTaxSale: false
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.editSearchText("77777777")
        viewModel.submitSearch()
        await viewModel.awaitParcelLookup()

        let inspection = try #require(viewModel.inspection)
        #expect(inspection.showsTaxSale == false)
        #expect(inspection.taxSaleNotice == nil)
    }

    // MARK: - The link

    /// A link out of a map without tax sales says so, and carries no selection.
    @Test func aLinkFromAMapWithoutTaxSalesTurnsThemOffForTheReader() throws {
        let channel = #function
        let (viewModel, _, _) = Self.viewModel(channel, answering: [], showsTaxSale: false)
        defer { StubURLProtocol.clear(channel: channel) }

        let state = viewModel.shareState
        #expect(state.taxSaleEnabled == false)
        #expect(state.eventIDs.isEmpty)

        let url = try #require(viewModel.shareURL)
        #expect(url.absoluteString.contains("taxSale=off"))
        #expect(url.absoluteString.contains("event=") == false)
    }

    /// And opening that link on a map that had them on turns them off.
    ///
    /// The parameter is the whole contract with the browser: without it, a link
    /// naming a mode reads as a tax-sale link, and every link the phone writes
    /// names a mode.
    @Test func openingALinkThatSaysOffTurnsThemOff() throws {
        let channel = #function
        let (viewModel, _, _) = Self.viewModel(channel, answering: [], showsTaxSale: true)
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(viewModel.showsTaxSale)

        let url = try #require(
            URL(string: "https://kinnokilabs.com/apps/nsmarksthespot/map/?taxSale=off&mode=current")
        )
        viewModel.restore(from: url)

        #expect(viewModel.showsTaxSale == false)
        #expect(viewModel.mapRecordMode == .current)
    }

    /// A link opens in the browser as a fresh page, so the reader who follows
    /// it starts on every notice with no narrowing at all. Here it opens into a
    /// map somebody has been using, and their two municipalities standing over
    /// the sender's view would hide records the link never excluded. The link
    /// says nothing about filters, so it cannot be read as having asked for
    /// these.
    @Test func openingALinkClearsTheFiltersTheReaderHadSetForThemselves() throws {
        let channel = #function
        let (viewModel, taxSale, historical) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["77777777"]))],
            showsTaxSale: true
        )
        defer { StubURLProtocol.clear(channel: channel) }

        taxSale.setEventVisibility("delta-2026-09-01", to: false)
        taxSale.filter = .redemption
        historical.filter.municipalityID = "nowhere"

        let url = try #require(
            URL(string: "https://kinnokilabs.com/apps/nsmarksthespot/map/"
                + "?taxSale=on&mode=current&event=delta-2026-09-01")
        )
        viewModel.restore(from: url)

        #expect(taxSale.selectedEventIDs == ["delta-2026-09-01"])
        #expect(taxSale.filter == .all)
        #expect(historical.filter == HistoricalTaxSaleCatalog.Filter())
    }

    /// Resuming is not opening a link. The reader's own filters are already
    /// where a fresh launch put them, and a session that reset them would be
    /// answering a question nobody asked.
    @Test func resumingASessionLeavesTheReadersOwnFiltersAlone() {
        let channel = #function
        let (viewModel, taxSale, historical) = Self.viewModel(
            channel,
            answering: [],
            showsTaxSale: true
        )
        defer { StubURLProtocol.clear(channel: channel) }

        taxSale.filter = .redemption
        historical.filter.municipalityID = "nowhere"

        viewModel.resume(
            MapSession(
                view: MapShareState(
                    taxSaleEnabled: true,
                    layerIDs: [MapShareState.modernBaseLayerID],
                    position: MapPosition(latitude: 46.1, longitude: -60.1, zoom: 14)
                ),
                background: .standard
            )
        )

        #expect(taxSale.filter == .redemption)
        #expect(historical.filter.municipalityID == "nowhere")
    }

    /// A setup saved from the records with tax sales switched off is a setup
    /// for the records.
    ///
    /// `mapRecordMode` reads `.current` while the switch is off, because
    /// nothing is drawing records. Writing that into the setup would hand the
    /// reader the notices back the next time they picked it, and the browser
    /// captures its own raw mode here. It also makes returning to the records
    /// read as a change the reader made to a setup they had only just applied.
    @Test func aSetupSavedWithTaxSalesOffKeepsTheModeTheMapWasIn() async {
        let channel = #function
        let (viewModel, _, _) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["88888888"]))],
            showsTaxSale: true
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.setMapRecordMode(.historical)
        await viewModel.awaitHistoricalParcels()
        viewModel.setTaxSaleEnabled(false)

        #expect(viewModel.mapRecordMode == .current)
        #expect(viewModel.themeState.taxSaleEnabled == false)
        #expect(viewModel.themeState.mode == .historical)
    }

    /// A link that turns them on brings the named notices with it.
    @Test func openingALinkThatSaysOnTurnsThemOn() throws {
        let channel = #function
        let (viewModel, taxSale, _) = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["77777777"]))],
            showsTaxSale: false
        )
        defer { StubURLProtocol.clear(channel: channel) }

        let url = try #require(
            URL(string: "https://kinnokilabs.com/apps/nsmarksthespot/map/"
                + "?taxSale=on&mode=current&event=delta-2026-09-01")
        )
        viewModel.restore(from: url)

        #expect(viewModel.showsTaxSale)
        #expect(taxSale.selectedEventIDs == ["delta-2026-09-01"])
    }
}
