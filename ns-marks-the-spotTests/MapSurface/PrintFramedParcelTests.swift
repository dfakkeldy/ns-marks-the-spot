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
        _ channel: String, framing frame: GeoBoundingBox, includesAppendix: Bool = false
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
            includesAppendix: includesAppendix,
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

    private static let elsewhere = "The evidence appendix is for PID 77777777, whose "
        + "boundary is not on this map. The map shows other ground."

    /// The stub parcel is a triangle, and the box around a triangle is nearly
    /// twice its area. This frame sits in the corner the triangle does not
    /// reach: inside the box, on ground the parcel never touches.
    ///
    /// A box test titles that page "PID 77777777" and drops the sentence saying
    /// the appendix is about somewhere else, which is the one thing a reader
    /// holding an appendix and a map has no other way to find out.
    @Test("A frame inside the parcel's box and outside the parcel says so")
    func aFrameInsideTheParcelsBoxAndOutsideTheParcelSaysSo() async throws {
        let printed = try #require(
            await Self.request(
                #function,
                framing: GeoBoundingBox(south: 44.68, west: -63.50, north: 44.70, east: -63.48),
                includesAppendix: true
            )
        )
        defer { StubURLProtocol.clear(channel: #function) }
        #expect(printed.disclosures.contains(Self.elsewhere))
        // And not the other sentence: a page that never claimed the parcel
        // cannot go on to say it cut it.
        #expect(!printed.disclosures.contains(Self.cut))
    }

    /// The same frame the reader dragged, grown to the paper. A parcel the
    /// page does show must keep its name, or the fix above would have traded
    /// one wrong page for another.
    @Test("A frame the parcel crosses is still titled for it")
    func aFrameTheParcelCrossesIsStillTitledForIt() async throws {
        let printed = try #require(
            await Self.request(
                #function,
                framing: GeoBoundingBox(south: 44.6, west: -63.5, north: 44.65, east: -63.45),
                includesAppendix: true
            )
        )
        defer { StubURLProtocol.clear(channel: #function) }
        #expect(!printed.disclosures.contains(Self.elsewhere))
        #expect(printed.disclosures.contains(Self.cut))
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
