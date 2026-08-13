import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// Tapping the map to ask what parcel is underneath.
///
/// The assertions are mostly about words, because that is where this can go
/// wrong: every unsuccessful lookup draws nothing, and only the message
/// separates the one that means there is no parcel from the several that mean
/// the question went unanswered.
///
/// Each test answers on its own stub channel — the NSPRD host comes from the
/// catalog, so it is the same for every test here and keying on it would have
/// tests running side by side overwrite each other's answers.
@MainActor
@Suite("Parcel identify")
struct ParcelIdentifyTests {
    /// A view model whose parcel lookups are answered on `channel`, and only
    /// there. Stubbing and session-building are one call so a test cannot
    /// register answers on one channel and send requests down another.
    private static func viewModel(
        _ channel: String,
        answering responses: [(String, StubURLProtocol.Response)],
        licence: ProvinceLicenceState = .accepted,
        zoomLevel: Int = 16,
        showingParcels: Bool = true
    ) -> OverlayViewModel {
        StubURLProtocol.stub(channel: channel, matching: responses)
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsprd],
            licence: licence,
            zoomLevel: zoomLevel,
            parcelFetcher: ParcelFetcher(urlSession: StubURLProtocol.session(channel: channel))
        )
        // Restricted layers install hidden, so this is what turns parcels on —
        // and with an unanswered licence it deliberately does not, which is the
        // state `anUnansweredLicenceIsExplained…` runs in.
        if viewModel.layers.first(where: { $0.id == LayerID.nsprd.rawValue })?.isVisible
            != showingParcels {
            viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        }
        return viewModel
    }

    private static func viewModel(
        _ channel: String,
        answering response: StubURLProtocol.Response,
        licence: ProvinceLicenceState = .accepted,
        zoomLevel: Int = 16,
        showingParcels: Bool = true
    ) -> OverlayViewModel {
        viewModel(
            channel,
            answering: [("", response)],
            licence: licence,
            zoomLevel: zoomLevel,
            showingParcels: showingParcels
        )
    }

    /// One parcel with a triangle for a boundary. Three distinct corners is the
    /// least `ParcelResponse` accepts as something that encloses ground.
    private static func parcel(pid: String) -> StubURLProtocol.Response {
        .success(Data("""
        {
          "type": "FeatureCollection",
          "features": [
            {
              "properties": {"PID": "\(pid)", "SHAPE.AREA": 11057.27},
              "geometry": {
                "type": "Polygon",
                "coordinates": [[[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]]]
              }
            }
          ]
        }
        """.utf8))
    }

    private static let noParcels = StubURLProtocol.Response.success(Data("""
    {"type": "FeatureCollection", "features": []}
    """.utf8))

    @Test func tappingAParcelSelectsAndDrawsIt() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: Self.parcel(pid: "50334317"))
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.identifyParcel(latitude: 44.65, longitude: -63.45)
        await viewModel.awaitParcelLookup()

        #expect(viewModel.parcels.selectedPID == "50334317")
        #expect(viewModel.parcels.shapes.map(\.role) == [.selected])
        #expect(viewModel.parcelMessage == "PID 50334317 selected.")
    }

    @Test func tappingWhereThereIsNoParcelSaysSo() async {
        // The one message allowed to claim there is nothing there, and it is
        // reachable only from the service answering with an empty collection.
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: Self.noParcels)
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.identifyParcel(latitude: 44.65, longitude: -63.45)
        await viewModel.awaitParcelLookup()

        #expect(viewModel.parcelMessage == "No NSPRD parcel was found at that point.")
        #expect(viewModel.parcels.selectedPID == nil)
    }

    /// Four ways of not getting an answer: the service refused, the network was
    /// gone, the reply was an ArcGIS error under a 200, and the reply was not
    /// JSON at all. None of them is evidence about the ground, so all four have
    /// to reach the user as the same sentence — and it must not be the one that
    /// says there is no parcel.
    @Test(arguments: [
        ("a refusal", StubURLProtocol.Response.status(500)),
        ("no network", .failure(.notConnectedToInternet)),
        ("an ArcGIS error under a 200", .success(Data(#"{"error":{"code":400,"message":"no"}}"#.utf8))),
        ("a reply that is not JSON", .success(Data("<html>502</html>".utf8))),
    ])
    func aServiceThatCannotBeReachedNeverSaysThereIsNoParcel(
        _ label: String, response: StubURLProtocol.Response
    ) async {
        let channel = "\(#function)-\(label)"
        let viewModel = Self.viewModel(channel, answering: response)
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.identifyParcel(latitude: 44.65, longitude: -63.45)
        await viewModel.awaitParcelLookup()

        #expect(viewModel.parcelMessage == "The Province parcel lookup is unavailable right now.")
        #expect(viewModel.parcels.selectedPID == nil)
    }

    @Test func aTapOnAMapZoomedTooFarOutIsNotALookup() async {
        // At province scale a fingertip covers kilometres. Answering with
        // whichever parcel happened to be under it would be a guess presented
        // as an identification.
        let channel = #function
        let viewModel = Self.viewModel(
            channel, answering: Self.parcel(pid: "50334317"), zoomLevel: 8
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.identifyParcel(latitude: 44.65, longitude: -63.45)
        await viewModel.awaitParcelLookup()

        #expect(StubURLProtocol.requestCount(channel: channel) == 0)
        #expect(viewModel.parcelMessage == nil)
    }

    @Test func aTapWithTheParcelLayerOffIsNotALookup() async {
        let channel = #function
        let viewModel = Self.viewModel(
            channel, answering: Self.parcel(pid: "50334317"), showingParcels: false
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.identifyParcel(latitude: 44.65, longitude: -63.45)
        await viewModel.awaitParcelLookup()

        #expect(StubURLProtocol.requestCount(channel: channel) == 0)
    }

    @Test func aSecondTapReplacesTheFirstRatherThanRacingIt() async {
        // Two taps, two different parcels, matched on the coordinate in the
        // query string. If the first tap's answer could still land, the map
        // would select a parcel the user has already moved away from — and the
        // message would name it.
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: [
            ("-63.45", Self.parcel(pid: "11111111")),
            ("-63.46", Self.parcel(pid: "22222222")),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.identifyParcel(latitude: 44.65, longitude: -63.45)
        viewModel.identifyParcel(latitude: 44.66, longitude: -63.46)
        await viewModel.awaitParcelLookup()

        #expect(viewModel.parcels.selectedPID == "22222222")
        #expect(viewModel.parcelMessage == "PID 22222222 selected.")
    }

    @Test func searchingAPIDAlreadyLoadedDoesNotAskAgain() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: Self.parcel(pid: "50334317"))
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.identifyParcel(latitude: 44.65, longitude: -63.45)
        await viewModel.awaitParcelLookup()
        let requestsAfterTap = StubURLProtocol.requestCount(channel: channel)

        viewModel.searchParcel("50334317")
        await viewModel.awaitParcelLookup()

        #expect(StubURLProtocol.requestCount(channel: channel) == requestsAfterTap)
        #expect(viewModel.parcelMessage == "PID 50334317 selected.")
    }

    @Test func searchingAPIDWithNoRecordIsNotAnOutage() async {
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: Self.noParcels)
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.searchParcel("50334317")
        await viewModel.awaitParcelLookup()

        #expect(viewModel.parcelMessage == "No NSPRD parcel was found for that PID.")
    }

    @Test func aCivicAddressIsAMissingFeatureRatherThanABadEntry() async {
        // The web searches civic addresses from this field; the app cannot yet.
        // Telling the user to enter a parcel ID as though they had typed one
        // wrongly would blame them for a feature that has not shipped.
        let channel = #function
        let viewModel = Self.viewModel(channel, answering: Self.parcel(pid: "50334317"))
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.searchParcel("1234 Barrington Street")
        await viewModel.awaitParcelLookup()

        #expect(viewModel.parcelMessage?.contains("not in the app yet") == true)
        #expect(StubURLProtocol.requestCount(channel: channel) == 0)
    }

    @Test func anUnansweredLicenceIsExplainedRatherThanReportedAsAnOutage() async {
        let channel = #function
        let viewModel = Self.viewModel(
            channel, answering: Self.parcel(pid: "50334317"), licence: .unknown
        )
        defer { StubURLProtocol.clear(channel: channel) }

        viewModel.searchParcel("50334317")
        await viewModel.awaitParcelLookup()

        #expect(StubURLProtocol.requestCount(channel: channel) == 0)
        #expect(viewModel.parcelMessage == "Accept the Province data licence to look up parcels.")
    }
}
