import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// The tax-sale notices, and what the map does with the parcels they name.
///
/// The notices themselves ship with the app and are tested in the package; what
/// is tested here is the seam between them and the Province's parcel service,
/// which is where the evidence can go wrong. A notice must survive a parcel
/// service that is down, a listed PID with no parcel must still open its
/// notice, and a withdrawn listing must stay readable without being drawn as
/// something for sale.
@MainActor
@Suite("Tax-sale notices on the map")
struct TaxSalePanelTests {
    // MARK: - A notice built here rather than taken from the bundle

    /// Two advertised PIDs and one withdrawn, so the tests can tell "not
    /// drawn" from "not listed".
    private static func event(
        id: String = "test-2026-09-01",
        saleStartsAt: Date? = Date(timeIntervalSince1970: 4_000_000_000)
    ) -> TaxSaleEvent {
        TaxSaleEvent(
            id: id,
            municipalityID: "test",
            municipality: "Municipality of the Test County",
            shortMunicipality: "Test County",
            eventType: .publicAuction,
            eventStatus: .upcoming,
            saleStartsAt: saleStartsAt,
            venue: "Test Hall",
            sourceURL: URL(string: "https://example.test/notice.pdf")!,
            sourceLabel: "Test County tax sale notice",
            retrievedOn: "2026-08-01",
            listings: [
                TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-1",
                    lien: "1",
                    pids: ["11111111"],
                    addressOrDescription: "Lot on Test Road",
                    location: "Test Road",
                    financial: MunicipalFinancialField(
                        kind: .minimumBid,
                        label: "Minimum bid",
                        amountCents: 152_300
                    ),
                    redemptionCategory: .sixMonth,
                    redemptionLabel: "Six-month redemption period",
                    listingStatus: .advertised
                ),
                TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-2",
                    lien: "2",
                    pids: ["22222222"],
                    location: "Test Lane",
                    financial: MunicipalFinancialField(
                        kind: .minimumBid,
                        label: "Minimum bid",
                        amountCents: 98_100
                    ),
                    redemptionCategory: .immediateDeed,
                    redemptionLabel: "Immediate deed",
                    listingStatus: .advertised
                ),
                TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-3",
                    lien: "3",
                    pids: ["33333333"],
                    location: "Struck Street",
                    financial: MunicipalFinancialField(
                        kind: .minimumBid,
                        label: "Minimum bid",
                        amountCents: 41_000
                    ),
                    redemptionCategory: .sixMonth,
                    redemptionLabel: "Six-month redemption period",
                    listingStatus: .withdrawn
                ),
            ]
        )
    }

    private static func taxSale(_ event: TaxSaleEvent = Self.event()) -> TaxSaleViewModel {
        TaxSaleViewModel(catalog: TaxSaleCatalog(events: [event]))
    }

    private static func viewModel(
        _ channel: String,
        answering responses: [(String, StubURLProtocol.Response)],
        taxSale: TaxSaleViewModel,
        licence: ProvinceLicenceState = .accepted
    ) -> OverlayViewModel {
        StubURLProtocol.stub(channel: channel, matching: responses)
        let session = StubURLProtocol.session(channel: channel)
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsprd],
            licence: licence,
            zoomLevel: 16,
            taxSale: taxSale,
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

    /// The same notice, with the account number the municipality printed.
    private static func eventNamingAnAccount() -> TaxSaleEvent {
        let id = "test-2026-09-01"
        return TaxSaleEvent(
            id: id,
            municipalityID: "test",
            municipality: "Municipality of the Test County",
            shortMunicipality: "Test County",
            eventType: .publicAuction,
            eventStatus: .upcoming,
            saleStartsAt: Date(timeIntervalSince1970: 4_000_000_000),
            venue: "Test Hall",
            sourceURL: URL(string: "https://example.test/notice.pdf")!,
            sourceLabel: "Test County tax sale notice",
            retrievedOn: "2026-08-01",
            listings: [
                TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-1",
                    lien: "1",
                    aan: "00001234",
                    pids: ["11111111"],
                    location: "Test Road",
                    financial: MunicipalFinancialField(
                        kind: .minimumBid,
                        label: "Minimum bid",
                        amountCents: 152_300
                    ),
                    redemptionCategory: .sixMonth,
                    redemptionLabel: "Six-month redemption period",
                    listingStatus: .advertised
                )
            ]
        )
    }

    /// A view model whose PVSC lookups are answered too.
    private static func assessingViewModel(
        _ channel: String,
        answering responses: [(String, StubURLProtocol.Response)],
        taxSale: TaxSaleViewModel
    ) -> OverlayViewModel {
        StubURLProtocol.stub(
            channel: channel,
            matching: responses + [("thedatazone", Self.oneAccount), ("", Self.noFeatures)]
        )
        let session = { StubURLProtocol.session(channel: channel) }
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsprd],
            licence: .accepted,
            zoomLevel: 16,
            taxSale: taxSale,
            parcelFetcher: ParcelFetcher(transport: .urlSession(session())),
            civicFetcher: CivicAddressFetcher(transport: .urlSession(session())),
            contextFetcher: ParcelContextFetcher(transport: .urlSession(session())),
            assessmentFetcher: PVSCAssessmentFetcher(transport: .urlSession(session())),
            dwellingFetcher: PVSCDwellingFetcher(transport: .urlSession(session()))
        )
        if viewModel.layers.first(where: { $0.id == LayerID.nsprd.rawValue })?.isVisible == false {
            viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        }
        return viewModel
    }

    /// One PVSC row, at a point nowhere near the stub parcel. Placed there on
    /// purpose: a spatial match would drop it, so a result carrying it can only
    /// have come from the account query.
    private static let oneAccount = StubURLProtocol.Response.success(Data("""
    [{"aan":"00001234","tax_year":"2026","assessed_value":"231500",
      "taxable_assessed_value":"198000","x_coord":"-60.1","y_coord":"46.9"}]
    """.utf8))

    private static let noFeatures = StubURLProtocol.Response.success(Data(#"{"features": []}"#.utf8))

    // MARK: - What the counts under a notice say

    /// A row with no parcel is still a row the municipality advertised.
    ///
    /// Counting only the drawable rows reports a smaller sale than the notice
    /// announced, and a reader checking the app against the printed Schedule A
    /// would find two properties missing with nothing saying where they went.
    @Test func rowsWithNoParcelAreCountedAsAdvertisedRatherThanDroppedFromTheTotal() throws {
        let catalog = TaxSaleCatalog.bundled
        let halifax = try #require(catalog.event(id: "halifax-2026-09-15"))
        let summary = TaxSaleViewModel(catalog: catalog).summary(for: halifax)

        #expect(summary.advertised == 29)
        #expect(summary.mapped == 27)
        #expect(summary.unavailable == 2)
    }

    /// A notice with nothing missing keeps the plain counts.
    @Test func aNoticeWithEveryRowMappedReportsNoUnavailableCount() {
        let taxSale = Self.taxSale()
        let summary = taxSale.summary(for: Self.event())

        #expect(summary.advertised == 2)
        #expect(summary.withdrawn == 1)
        #expect(summary.unavailable == 0)
    }

    // MARK: - The account a notice names

    /// The notice's AAN reaches PVSC.
    ///
    /// It is the municipality's own link between the sale and the assessment
    /// record, and it is exact where a point inside an outline is not. The app
    /// carried the AAN and never sent it, so every listed parcel matched the
    /// slower, weaker way and the panel said so.
    @Test func theAccountNumberOnTheNoticeIsWhatPVSCIsAskedWith() async {
        let channel = #function
        let taxSale = Self.taxSale(Self.eventNamingAnAccount())
        let viewModel = Self.assessingViewModel(
            channel,
            answering: [("PID", Self.parcels(["11111111"]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()
        viewModel.selectListedParcel(eventID: "test-2026-09-01", pid: "11111111")
        await viewModel.awaitInspection()

        guard case .ready(let result) = viewModel.inspection?.assessments else {
            Issue.record(
                "expected assessments, got \(String(describing: viewModel.inspection?.assessments))"
            )
            return
        }
        #expect(result.matchMethod == .noticeAAN)
        #expect(result.accounts.map(\.aan) == ["00001234"])
    }

    /// A listed parcel NSPRD has no record of still gets its assessment.
    ///
    /// The account query takes a number, not a shape, so the reason the other
    /// sections cannot be asked does not apply to it. Marking it unavailable
    /// would hide an assessment record that is sitting there under the number
    /// the notice printed.
    @Test func aParcelWithNoGeometryIsStillLookedUpByItsAccount() async {
        let channel = #function
        let taxSale = Self.taxSale(Self.eventNamingAnAccount())
        let viewModel = Self.assessingViewModel(channel, answering: [], taxSale: taxSale)
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()
        viewModel.selectListedParcel(eventID: "test-2026-09-01", pid: "11111111")
        await viewModel.awaitInspection()

        let inspection = viewModel.inspection
        #expect(inspection?.taxSaleNotice != nil)
        // Everything that takes the parcel's rings still says nobody was asked.
        guard case .unavailable = inspection?.civicAddresses else {
            Issue.record("expected the address lookup to be refused for want of a boundary")
            return
        }
        guard case .ready(let result) = inspection?.assessments else {
            Issue.record(
                "expected assessments, got \(String(describing: inspection?.assessments))"
            )
            return
        }
        #expect(result.matchMethod == .noticeAAN)
        #expect(result.accounts.map(\.aan) == ["00001234"])
    }

    // MARK: - Loading the parcels a notice names

    /// The count is of what NSPRD returned, not of what was asked for.
    ///
    /// Two advertised PIDs go out and one comes back, and the panel says one.
    /// Echoing the request's size would tell a user that a parcel the fabric
    /// has no record of was found.
    @Test func theMatchedCountIsWhatCameBackNotWhatWasAskedFor() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["11111111"]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(taxSale.advertisedPIDs == ["11111111", "22222222"])
        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()

        #expect(viewModel.listedParcelMessage == "1 PIDs matched in NSPRD.")
    }

    /// The withdrawn PID is never asked for, because it is never drawn.
    @Test func aWithdrawnListingIsNotAskedAboutOrDrawn() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["11111111", "22222222"]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        #expect(taxSale.advertisedPIDs.contains("33333333") == false)
        #expect(taxSale.highlightedPIDs.contains("33333333") == false)
        // Still in the notice the user is reading, which is the point: the
        // municipality printed it and then struck it out, and both facts are
        // part of the record.
        #expect(taxSale.listings(in: Self.event()).count == 3)

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()

        let roles = viewModel.parcels
            .shapes(taxSalePIDs: taxSale.highlightedPIDs, historicalPIDs: [])
            .map(\.role)
        #expect(roles == [.taxSale, .taxSale])
    }

    /// The service being down does not take the notices with it.
    @Test func anUnavailableParcelServiceLeavesTheNoticesReadable() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", .failure(.notConnectedToInternet))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()

        #expect(viewModel.listedParcelMessage == ParcelLookupMessage.listedParcelsUnavailable)
        #expect(viewModel.listedParcelMessage?.contains("notices remain accessible") == true)
        #expect(taxSale.upcomingEvents.count == 1)
        #expect(viewModel.parcels.shapes.isEmpty)
    }

    /// Nothing is requested without the Province licence, and nothing claims to
    /// have been.
    @Test func anUnacceptedLicenceAsksNothingAndSaysNothingAboutParcels() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["11111111"]))],
            taxSale: taxSale,
            licence: .unknown
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()

        #expect(viewModel.listedParcelMessage == nil)
    }

    // MARK: - Opening a property out of a notice

    /// Picking a property switches its notice back on first, so the map does
    /// not fly to a parcel that is hidden.
    @Test func choosingAPropertyTurnsItsNoticeBackOn() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["11111111"]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        taxSale.setEventVisibility("test-2026-09-01", to: false)
        #expect(taxSale.highlightedPIDs.isEmpty)

        viewModel.selectListedParcel(eventID: "test-2026-09-01", pid: "11111111")
        await viewModel.awaitParcelLookup()

        #expect(taxSale.isSelected("test-2026-09-01"))
        #expect(viewModel.parcels.selectedPID == "11111111")
    }

    /// A listed PID NSPRD holds no parcel for still opens its notice.
    ///
    /// The card comes up with every parcel-scoped source marked unavailable
    /// rather than empty: nothing was asked about this parcel, because there is
    /// no parcel record to ask with.
    @Test func aListedPIDWithNoParcelStillOpensItsNotice() async throws {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels([]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.editSearchText("22222222")
        viewModel.submitSearch()
        await viewModel.awaitParcelLookup()

        #expect(
            viewModel.parcelMessage
                == "PID 22222222 is listed in a notice, but NSPRD returned no parcel to map."
        )
        let inspection = try #require(viewModel.inspection)
        #expect(inspection.pid == "22222222")
        #expect(inspection.taxSaleNotice?.listing.lien == "2")
        #expect(
            inspection.assessments == .unavailable(ParcelLookupMessage.noParcelRecordToAskWith)
        )
        #expect(
            inspection.buildings == .unavailable(ParcelLookupMessage.noParcelRecordToAskWith)
        )
    }

    /// An unlisted PID with no parcel gets no card at all — there is nothing
    /// to say about it, and an empty card would suggest there was.
    @Test func anUnlistedPIDWithNoParcelOpensNothing() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels([]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.editSearchText("99999999")
        viewModel.submitSearch()
        await viewModel.awaitParcelLookup()

        #expect(viewModel.parcelMessage == "No NSPRD parcel was found for that PID.")
        #expect(viewModel.inspection == nil)
    }

    /// A selected parcel that is also listed reads as selected. One role per
    /// shape, and the one the user asked for wins.
    @Test func theSelectedParcelKeepsItsOwnStylingWhenItIsAlsoListed() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["11111111", "22222222"]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()
        viewModel.editSearchText("11111111")
        viewModel.submitSearch()
        await viewModel.awaitParcelLookup()

        let shapes = viewModel.parcels.shapes(taxSalePIDs: taxSale.highlightedPIDs, historicalPIDs: [])
        #expect(shapes.first(where: { $0.pid == "11111111" })?.role == .selected)
        #expect(shapes.first(where: { $0.pid == "22222222" })?.role == .taxSale)
    }

    /// A parcel service that fails still opens the notice the user tapped.
    ///
    /// The notice is in hand before the request goes out, so the outcome of the
    /// request cannot decide whether the user sees what they asked for.
    @Test func aFailedParcelFetchStillOpensTheNoticeThatWasTapped() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", .failure(.timedOut))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.selectListedParcel(eventID: "test-2026-09-01", pid: "11111111")
        await viewModel.awaitParcelLookup()

        #expect(viewModel.inspection?.pid == "11111111")
        #expect(viewModel.inspection?.taxSaleNotice?.listing.lien == "1")
        #expect(viewModel.parcelMessage == "The Province parcel search is unavailable right now.")
    }

    // MARK: - The licence

    /// Accepting on a first run asks for the advertised parcels.
    ///
    /// The map opened without permission, so the load was refused and nothing
    /// else retries it: without this the notices are all switched on and no
    /// parcel is ever drawn.
    @Test func acceptingTheLicenceAsksForTheParcelsThatWereRefusedAtLaunch() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["11111111", "22222222"]))],
            taxSale: taxSale,
            licence: .unknown
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()
        #expect(viewModel.listedParcelMessage == nil)

        viewModel.acceptProvinceLicence()
        await viewModel.awaitListedParcels()

        #expect(viewModel.listedParcelMessage == "2 PIDs matched in NSPRD.")
    }

    /// Withdrawing permission stops a bulk load that is already in the air.
    ///
    /// It has drawn nothing yet, so nothing on screen says it is running — and
    /// a reply that lands afterwards would put Province geometry on a map the
    /// user has just revoked permission for.
    @Test func revokingTheLicenceStopsABulkLoadInFlight() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["11111111", "22222222"]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        viewModel.declineProvinceLicence()
        await viewModel.awaitListedParcels()

        #expect(viewModel.parcels.shapes.isEmpty)
        #expect(viewModel.listedParcelMessage == nil)
    }

    // MARK: - The filter

    /// The filter moves the highlight without moving what was fetched.
    @Test func filteringNarrowsTheHighlightAndNotTheRequest() async {
        let channel = #function
        let taxSale = Self.taxSale()
        let viewModel = Self.viewModel(
            channel,
            answering: [("", Self.parcels(["11111111", "22222222"]))],
            taxSale: taxSale
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.loadListedParcels()
        await viewModel.awaitListedParcels()

        taxSale.filter = .immediateOrNone
        viewModel.refreshListedParcelStyling()

        #expect(taxSale.highlightedPIDs == ["22222222"])
        #expect(taxSale.advertisedPIDs == ["11111111", "22222222"])
        let roles = viewModel.parcels
            .shapes(taxSalePIDs: taxSale.highlightedPIDs, historicalPIDs: [])
            .filter { $0.role == .taxSale }
            .map(\.pid)
        #expect(roles == ["22222222"])
    }

    /// A sale date that has passed is neither upcoming nor a published result.
    @Test func aPassedSaleDateAsksForVerificationRatherThanClaimingAResult() {
        let past = Self.event(saleStartsAt: Date(timeIntervalSince1970: 1_000_000_000))
        #expect(past.lifecycle(now: Date()) == .verifyResults)
        #expect(
            past.lifecycle(now: Date()).label
                == "Past sale date — verify results with the municipality."
        )
    }
}
