import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// The historical record set, and what the map does with it.
///
/// The records themselves are tested in the package. What is tested here is the
/// boundary the mode draws: the two record sets are never on the map at once, a
/// dated outcome never appears under a card opened in the current-notice mode,
/// and a filter narrows what is drawn without changing what was asked for.
@MainActor
@Suite("Historical tax-sale records on the map")
struct HistoricalTaxSalePanelTests {
    // MARK: - A record set built here rather than taken from the bundle

    /// Two municipalities, two years, and one record nobody could match to a
    /// parcel, so the tests can tell "not drawn" from "not published".
    private static func catalog() -> HistoricalTaxSaleCatalog {
        let alpha = HistoricalTaxSaleEvent(
            id: "alpha-2025-05-06",
            municipalityID: "alpha",
            municipality: "Municipality of Alpha County",
            shortMunicipality: "Alpha",
            saleDate: "2025-05-06",
            saleMethod: .publicAuction,
            listingIdentifierLabel: "Lien number",
            advertisedAmountLabel: "Minimum bid",
            noticeURL: URL(string: "https://example.test/alpha-notice.pdf")!,
            resultStatus: .verified,
            resultURL: URL(string: "https://example.test/alpha-results.pdf")!,
            retrievedOn: "2026-08-01",
            noticeSnapshotDate: "2025-04-01",
            resultSnapshotDate: "2025-05-20",
            noticeSHA256: String(repeating: "a", count: 64),
            resultSHA256: String(repeating: "b", count: 64),
            sourceNotes: "Alpha County notice and published results."
        )
        let beta = HistoricalTaxSaleEvent(
            id: "beta-2026-03-04",
            municipalityID: "beta",
            municipality: "Municipality of Beta County",
            shortMunicipality: "Beta",
            saleDate: "2026-03-04",
            saleMethod: .sealedTender,
            listingIdentifierLabel: "Account number",
            advertisedAmountLabel: "Opening bid",
            noticeURL: URL(string: "https://example.test/beta-notice.pdf")!,
            resultStatus: .awaitingOfficialResults,
            retrievedOn: "2026-08-01",
            noticeSnapshotDate: "2026-02-01",
            noticeSHA256: String(repeating: "c", count: 64),
            sourceNotes: "Beta County notice only; no result has been published."
        )
        let records = [
            HistoricalTaxSaleRecord(
                eventID: alpha.id,
                recordID: "alpha-1",
                listingIdentifier: "1",
                pids: ["44444444"],
                civicDescription: "Lot on Alpha Road",
                advertisedAmountCents: 100_000,
                winningBidCents: 250_000,
                outcome: .sold,
                redemptionLabel: "Six-month redemption period",
                nsprdMatchStatus: .matched,
                nsprdMatchMethod: .exactOfficialPID,
                reviewState: .visuallyVerified
            ),
            HistoricalTaxSaleRecord(
                eventID: alpha.id,
                recordID: "alpha-2",
                listingIdentifier: "2",
                pids: ["55555555"],
                civicDescription: "Lot on Alpha Lane",
                advertisedAmountCents: 80_000,
                winningBidCents: nil,
                outcome: .unsold,
                redemptionLabel: "Six-month redemption period",
                nsprdMatchStatus: .matched,
                nsprdMatchMethod: .deterministicReconciliation,
                reviewState: .noticeVerified
            ),
            HistoricalTaxSaleRecord(
                eventID: beta.id,
                recordID: "beta-1",
                listingIdentifier: "A-99",
                pids: ["66666666"],
                civicDescription: "Lot on Beta Way",
                advertisedAmountCents: 42_000,
                winningBidCents: nil,
                outcome: .unknown,
                redemptionLabel: "Not stated in the notice",
                nsprdMatchStatus: .unmatched,
                nsprdMatchMethod: .none,
                reviewState: .needsReview
            ),
        ]
        return HistoricalTaxSaleCatalog(events: [alpha, beta], records: records)
    }

    private static func historical(mode: HistoricalTaxSaleViewModel.Mode = .historical)
        -> HistoricalTaxSaleViewModel
    {
        let viewModel = HistoricalTaxSaleViewModel(catalog: catalog())
        viewModel.mode = mode
        return viewModel
    }

    private static func viewModel(
        _ channel: String,
        answering responses: [(String, StubURLProtocol.Response)],
        historical: HistoricalTaxSaleViewModel
    ) -> OverlayViewModel {
        StubURLProtocol.stub(channel: channel, matching: responses)
        let session = StubURLProtocol.session(channel: channel)
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsprd],
            zoomLevel: 16,
            historical: historical,
            parcelFetcher: ParcelFetcher(transport: .urlSession(session)),
            civicFetcher: CivicAddressFetcher(transport: .urlSession(session)),
            contextFetcher: ParcelContextFetcher(transport: .urlSession(session))
        )
        if viewModel.layers.first(where: { $0.id == LayerID.nsprd.rawValue })?.isVisible == false {
            viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        }
        return viewModel
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

    // MARK: - Only one record set is ever on the map

    /// The current-notice mode draws no historical parcel and asks for none.
    @Test func theCurrentModeNeitherDrawsNorAsksForHistoricalParcels() async {
        let channel = #function
        let historical = Self.historical(mode: .current)
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["44444444", "55555555"]))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(historical.highlightedPIDs.isEmpty)

        viewModel.loadHistoricalParcels()
        await viewModel.awaitHistoricalParcels()

        #expect(viewModel.historicalParcelMessage == nil)
        #expect(viewModel.parcels.features.isEmpty)
    }

    /// Switching in asks for the matched parcels; switching out drops the
    /// styling and the count with it.
    @Test func leavingTheHistoricalModeTakesItsCountWithIt() async {
        let channel = #function
        let historical = Self.historical(mode: .current)
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["44444444", "55555555"]))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.setMapRecordMode(.historical)
        await viewModel.awaitHistoricalParcels()
        #expect(viewModel.historicalParcelMessage == "2 historical PIDs matched in NSPRD.")

        viewModel.setMapRecordMode(.current)

        #expect(viewModel.historicalParcelMessage == nil)
        #expect(historical.highlightedPIDs.isEmpty)
        let roles = viewModel.parcels.shapes(
            taxSalePIDs: [], historicalPIDs: historical.highlightedPIDs
        ).map(\.role)
        #expect(roles.allSatisfy { $0 == .context })
    }

    /// A card opened in one mode does not survive into the other.
    @Test func switchingModeClosesTheCardTheOtherModeOpened() async {
        let channel = #function
        let historical = Self.historical()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["44444444"]))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.selectHistoricalParcel(pid: "44444444")
        await viewModel.awaitParcelLookup()
        #expect(viewModel.inspection?.historicalRecords.count == 1)

        viewModel.setMapRecordMode(.current)

        #expect(viewModel.inspection == nil)
    }

    // MARK: - What is drawn, and what is only listed

    /// A record nobody could tie to a parcel is listed and not drawn, and is
    /// never asked about.
    @Test func onlyMatchedRecordsAreAskedForAndDrawn() async {
        let channel = #function
        let historical = Self.historical()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["44444444", "55555555"]))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(historical.matchedPIDs.contains("66666666") == false)
        #expect(historical.filteredRecords.count == 3)

        viewModel.loadHistoricalParcels()
        await viewModel.awaitHistoricalParcels()

        let roles = viewModel.parcels.shapes(
            taxSalePIDs: [], historicalPIDs: historical.highlightedPIDs
        ).map(\.role)
        #expect(roles == [.historicalTaxSale, .historicalTaxSale])
    }

    /// The filter narrows the highlight, not the request. The parcels were
    /// already paid for; asking again for a subset would spend a second round
    /// trip to draw less.
    @Test func theFilterNarrowsTheHighlightNotTheRequest() async {
        let channel = #function
        let historical = Self.historical()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["44444444", "55555555"]))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadHistoricalParcels()
        await viewModel.awaitHistoricalParcels()

        historical.filter.outcome = .sold
        viewModel.refreshHistoricalStyling()

        #expect(historical.highlightedPIDs == ["44444444"])
        let roles = viewModel.parcels.shapes(
            taxSalePIDs: [], historicalPIDs: historical.highlightedPIDs
        ).map(\.role)
        #expect(roles.count(where: { $0 == .historicalTaxSale }) == 1)
        #expect(roles.count(where: { $0 == .context }) == 1)
        // Still held by the map, so switching the filter back draws it again
        // without another request.
        #expect(viewModel.parcels.holds(pid: "55555555"))
    }

    /// The map's own selection outranks the historical styling, and says so in
    /// its own colour rather than the current-notice one.
    @Test func theSelectedHistoricalParcelKeepsItsOwnRole() async {
        let channel = #function
        let historical = Self.historical()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["44444444"]))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.selectHistoricalParcel(pid: "44444444")
        await viewModel.awaitParcelLookup()

        let roles = viewModel.parcels.shapes(
            taxSalePIDs: [], historicalPIDs: historical.highlightedPIDs
        ).map(\.role)
        #expect(roles == [.selectedHistorical])
    }

    // MARK: - The card

    /// A record is opened even where NSPRD has no parcel to draw with it, and
    /// the card says which of the two is missing.
    @Test func aMatchedPIDWithNoParcelStillOpensItsRecords() async {
        let channel = #function
        let historical = Self.historical()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", .failure(.notConnectedToInternet))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.selectHistoricalParcel(pid: "44444444")
        await viewModel.awaitParcelLookup()

        let inspection = viewModel.inspection
        #expect(inspection?.pid == "44444444")
        #expect(inspection?.historicalRecords.count == 1)
        #expect(inspection?.taxSaleNotice == nil)
        #expect(inspection?.recordModeMarker == "Historical-records mode")
    }

    /// The card carries only the records the panel is currently showing. A
    /// filter that hides a sale in the list and leaves it on the card would
    /// make the filter mean two different things at once.
    @Test func theCardShowsOnlyTheRecordsTheFilterLeaves() async {
        let channel = #function
        let historical = Self.historical()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["44444444"]))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.selectHistoricalParcel(pid: "44444444")
        await viewModel.awaitParcelLookup()
        #expect(viewModel.inspection?.historicalRecords.count == 1)

        historical.filter.municipalityID = "beta"
        viewModel.refreshHistoricalStyling()

        #expect(viewModel.inspection?.historicalRecords.isEmpty == true)
    }

    /// No marker in the ordinary mode. A label on every card stops being read
    /// long before the one card that needs it.
    @Test func theModeMarkerIsPrintedOnlyOnHistoricalCards() async {
        let channel = #function
        let historical = Self.historical(mode: .current)
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["44444444"]))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.editSearchText("44444444")
        viewModel.submitSearch()
        await viewModel.awaitParcelLookup()

        #expect(viewModel.inspection?.recordModeMarker == nil)
        #expect(viewModel.inspection?.historicalRecords.isEmpty == true)
    }

    /// The records survive a parcel service that is down, and the message says
    /// the geometry is what is missing rather than the evidence.
    @Test func anUnavailableParcelServiceLeavesTheRecordsReadable() async {
        let channel = #function
        let historical = Self.historical()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", .failure(.notConnectedToInternet))],
            historical: historical
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadHistoricalParcels()
        await viewModel.awaitHistoricalParcels()

        #expect(
            viewModel.historicalParcelMessage == ParcelLookupMessage.historicalParcelsUnavailable
        )
        #expect(historical.filteredRecords.count == 3)
    }
}
