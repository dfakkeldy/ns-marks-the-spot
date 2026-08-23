import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// What a page titled for a parcel promises about that parcel.
///
/// The frame is drawn by hand on this surface, which the browser has no
/// equivalent of — it reframes a research summary onto the whole selected
/// geometry. Here the user's framing is kept and the page says when it cut the
/// parcel, rather than moving the frame they drew.
@Suite("A page framed across a parcel's edge")
@MainActor
struct PrintFramedParcelTests {
    /// Longitude -63.5 to -63.4, latitude 44.6 to 44.7.
    private static func parcel() -> StubURLProtocol.Response {
        .success(Data("""
        {"type": "FeatureCollection", "features": [{
          "properties": {"PID": "77777777", "SHAPE.AREA": 11057.27},
          "geometry": {
            "type": "Polygon",
            "coordinates": [[[-63.5, 44.6], [-63.4, 44.6], [-63.4, 44.7], [-63.5, 44.6]]]
          }
        }]}
        """.utf8))
    }

    private static func request(
        _ channel: String, framing frame: GeoBoundingBox
    ) async -> PrintExportRequest? {
        StubURLProtocol.stub(channel: channel, matching: [("", parcel())])
        let session = StubURLProtocol.session(channel: channel)
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsprd],
            zoomLevel: 16,
            parcelFetcher: ParcelFetcher(transport: .urlSession(session))
        )
        viewModel.editSearchText("77777777")
        viewModel.submitSearch()
        await viewModel.awaitParcelLookup()

        return viewModel.printExportRequest(
            template: PdfTemplate.template(.portrait),
            fields: PdfComposer.Fields(title: "Sheet", subtitle: "", notes: ""),
            frame: frame
        )
    }

    private static let cut = "PID 77777777 runs past the edge of this map. "
        + "The page shows part of the parcel."

    /// A title is a claim about the whole parcel, and a frame dragged across
    /// its northern half prints a third of it under that name.
    @Test("A frame that cuts the parcel says so on the page")
    func aFrameThatCutsTheParcelSaysSoOnThePage() async throws {
        let printed = try #require(
            await Self.request(
                #function,
                framing: GeoBoundingBox(south: 44.6, west: -63.5, north: 44.65, east: -63.45)
            )
        )
        defer { StubURLProtocol.clear(channel: #function) }
        #expect(printed.disclosures.contains(Self.cut))
    }

    /// The frame the user drew is not the ground that prints: the export grows
    /// it to the paper's proportions first. A page that fits after that growth
    /// must not claim it cut anything.
    @Test("A frame that holds the whole parcel claims nothing")
    func aFrameThatHoldsTheWholeParcelClaimsNothing() async throws {
        let printed = try #require(
            await Self.request(
                #function,
                framing: GeoBoundingBox(south: 44.5, west: -63.7, north: 44.8, east: -63.2)
            )
        )
        defer { StubURLProtocol.clear(channel: #function) }
        #expect(!printed.disclosures.contains(Self.cut))
        // The general caveat is always there. A page with no warning at all is
        // the artefact somebody puts in front of a lawyer.
        #expect(printed.disclosures.first == PrintExport.screeningCaveat)
    }

    /// Framed somewhere else entirely, the page is not titled for the parcel at
    /// all, and the sentence about cutting it would be about a parcel this page
    /// never claimed.
    @Test("A frame nowhere near the parcel says the other thing instead")
    func aFrameNowhereNearTheParcelSaysTheOtherThingInstead() async throws {
        let printed = try #require(
            await Self.request(
                #function,
                framing: GeoBoundingBox(south: 46.1, west: -60.1, north: 46.2, east: -60.0)
            )
        )
        defer { StubURLProtocol.clear(channel: #function) }
        #expect(!printed.disclosures.contains(Self.cut))
    }
}
