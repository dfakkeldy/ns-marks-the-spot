import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// What the square of dots on a printed page leads back to.
///
/// The page calls it an exact map receipt. That is a claim about this paper,
/// not about the map the reader happened to leave behind, so these check the
/// two ways the two can come apart: the ground the page was framed on, and the
/// layers that reached it.
@Suite("The receipt on a printed page")
struct PrintReceiptTests {
    private static let frame = PdfTemplate.template(.portrait).mapFrame

    /// A view far from anything these tests print, so a receipt reading off the
    /// live map instead of the paper cannot pass by coincidence.
    private static let elsewhere = MapShareState(
        taxSaleEnabled: false,
        mode: .current,
        pid: nil,
        eventIDs: [],
        layerIDs: [MapShareState.modernBaseLayerID, LayerID.nsprd.rawValue],
        position: MapPosition(latitude: 46.08, longitude: -60.92, zoom: 9)
    )

    private static func link(_ state: MapShareState = elsewhere) -> PrintShareLink {
        PrintShareLink(base: URL(string: "https://example.com/map/")!, state: state)
    }

    private static func outcome(
        _ id: LayerID, _ state: PrintMapCompositor.LayerState
    ) -> PrintMapCompositor.LayerOutcome {
        PrintMapCompositor.LayerOutcome(id: id.rawValue, name: id.rawValue, state: state)
    }

    private static func query(_ url: URL, _ name: String) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first { $0.name == name }?.value
    }

    private static func receipt(
        printed bounds: GeoBoundingBox,
        state: MapShareState = elsewhere,
        outcomes: [PrintMapCompositor.LayerOutcome] = []
    ) throws -> URL {
        try #require(
            PrintExport.receipt(
                for: link(state), printed: bounds, mapFrame: frame, outcomes: outcomes
            )
        )
    }

    // MARK: - The ground

    /// The frame is drawn by hand and the map keeps moving after it. A receipt
    /// built from the live view sends the reader to ground this page does not
    /// show, under a label that says otherwise.
    @Test("The receipt centres on the paper, not on the map left behind")
    func theReceiptCentresOnThePaperNotOnTheMapLeftBehind() throws {
        let url = try Self.receipt(
            printed: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3)
        )
        let parts = try #require(Self.query(url, "position")?.split(separator: ","))
        #expect(parts.count == 3)
        #expect(abs((Double(parts[0]) ?? 0) - 45.65) < 0.000_01)
        #expect(abs((Double(parts[1]) ?? 0) + 61.35) < 0.000_01)
    }

    /// Not the formula restated: a receipt that carried a fixed zoom, or the
    /// screen's, would pass the centre check above and still open at the wrong
    /// scale.
    @Test("Framing half as much ground moves the receipt one zoom closer")
    func framingHalfAsMuchGroundMovesTheReceiptOneZoomCloser() throws {
        func zoom(span: Double) throws -> Int {
            let url = try Self.receipt(
                printed: GeoBoundingBox(
                    south: 45.6, west: -61.4, north: 45.7, east: -61.4 + span
                )
            )
            let parts = try #require(Self.query(url, "position")?.split(separator: ","))
            return try #require(Int(parts[2]))
        }
        #expect(try zoom(span: 0.05) == zoom(span: 0.1) + 1)
    }

    /// A degenerate frame leaves the caller's position alone. Writing a
    /// coordinate derived from a zero span would be a number nothing measured.
    @Test("A frame with no width leaves the position it was handed")
    func aFrameWithNoWidthLeavesThePositionItWasHanded() throws {
        let url = try Self.receipt(
            printed: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.4)
        )
        #expect(Self.query(url, "position") == "46.08,-60.92,9")
    }

    // MARK: - The layers

    /// Scanning the code would switch these back on and show the reader ground
    /// the page carries no ink for.
    @Test("A layer that reached the paper with nothing is off the receipt")
    func aLayerThatReachedThePaperWithNothingIsOffTheReceipt() throws {
        let states: [PrintMapCompositor.LayerState] = [
            .notDrawn(reason: "zoom to 14+ to load"),
            .failed("timed out"),
            .licenceBlocked,
            .unsupported,
        ]
        for state in states {
            let url = try Self.receipt(
                printed: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
                outcomes: [Self.outcome(.nsprd, state)]
            )
            let layers = Self.query(url, "layers")
            #expect(layers?.contains(LayerID.nsprd.rawValue) == false, "\(state)")
            // Only the one that failed. A receipt that dropped the base map
            // with it would open on blank ground.
            #expect(layers == MapShareState.modernBaseLayerID, "\(state)")
        }
    }

    /// The OpenStreetMap ground reports an outcome like any layer, and the
    /// receipt treats it the same way: a base whose tiles never arrived is off
    /// the link, so scanning the code does not show the reader ground the
    /// paper never carried.
    @Test("An OpenStreetMap ground that never printed is off the receipt")
    func anOpenStreetMapGroundThatNeverPrintedIsOffTheReceipt() throws {
        let url = try Self.receipt(
            printed: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
            outcomes: [
                PrintMapCompositor.LayerOutcome(
                    id: OpenStreetMapBase.layerID,
                    name: OpenStreetMapBase.pageName,
                    state: .failed("timed out")
                )
            ]
        )
        #expect(Self.query(url, "layers") == LayerID.nsprd.rawValue)
    }

    /// A layer that was asked and holds none of this thing here is a finding
    /// about the ground. Dropping it from the receipt would turn "asked, and
    /// there is none" into "never asked".
    @Test("A layer that answered stays on the receipt, ink or no ink")
    func aLayerThatAnsweredStaysOnTheReceiptInkOrNoInk() throws {
        let states: [PrintMapCompositor.LayerState] = [
            .drawn,
            .outsideCoverage,
            .partial(missing: 2, of: 40),
            .drawnFromEarlierView(reason: "loading visible area"),
            .drawnPartlyUnread(count: 3),
        ]
        for state in states {
            let url = try Self.receipt(
                printed: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
                outcomes: [Self.outcome(.nsprd, state)]
            )
            #expect(
                Self.query(url, "layers")?.contains(LayerID.nsprd.rawValue) == true, "\(state)"
            )
        }
    }

    /// A viewport layer that was on and had nothing in the frame reports no
    /// outcome at all. Silence is not a failure, and the receipt keeps it for
    /// the same reason it keeps a layer that answered empty.
    @Test("A layer with no outcome at all keeps its place")
    func aLayerWithNoOutcomeAtAllKeepsItsPlace() throws {
        let url = try Self.receipt(
            printed: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
            outcomes: [Self.outcome(.roads, .drawn)]
        )
        #expect(Self.query(url, "layers")?.contains(LayerID.nsprd.rawValue) == true)
    }

    /// The rest of the state is the reader's map and none of the export's
    /// business.
    @Test("The selection and the record mode ride through untouched")
    func theSelectionAndTheRecordModeRideThroughUntouched() throws {
        var state = Self.elsewhere
        state.taxSaleEnabled = true
        state.mode = .historical
        state.pid = "15234636"
        state.eventIDs = ["cbrm-2026-07-21"]
        let url = try Self.receipt(
            printed: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
            state: state
        )
        #expect(Self.query(url, "pid") == "15234636")
        #expect(Self.query(url, "mode") == "historical")
        #expect(Self.query(url, "event") == "cbrm-2026-07-21")
    }
}

/// The imagery switch on the export sheet reaches the receipt too.
@Suite("The receipt and the aerial switch")
@MainActor
struct PrintReceiptAerialTests {
    private func model() -> OverlayViewModel {
        let model = OverlayViewModel.forTesting(installing: [.nsAerial, .nsprd])
        model.toggleVisibility(LayerID.nsAerial.rawValue)
        model.toggleVisibility(LayerID.nsprd.rawValue)
        return model
    }

    /// A receipt naming the imagery would tell the reader it was consulted for
    /// what they are looking at, on a page printed without a pixel of it.
    @Test("Leaving the aerial off takes it off the receipt as well as the page")
    func leavingTheAerialOffTakesItOffTheReceiptAsWellAsThePage() {
        let model = model()
        #expect(model.shareState.layerIDs.contains(LayerID.nsAerial.rawValue))

        let without = model.printedShareState(includesAerial: false)
        #expect(!without.layerIDs.contains(LayerID.nsAerial.rawValue))
        // Only the imagery. The boundaries are why the page was printed.
        #expect(without.layerIDs.contains(LayerID.nsprd.rawValue))

        let with = model.printedShareState(includesAerial: true)
        #expect(with.layerIDs.contains(LayerID.nsAerial.rawValue))
    }

    @Test("The export request carries the state its receipt is built from")
    func theExportRequestCarriesTheStateItsReceiptIsBuiltFrom() throws {
        let printed = try #require(
            model().printExportRequest(
                template: PdfTemplate.template(.landscape),
                fields: PdfComposer.Fields(title: "Sheet", subtitle: "", notes: ""),
                includesAerial: false,
                frame: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3)
            )
        )
        let share = try #require(printed.share)
        #expect(!share.state.layerIDs.contains(LayerID.nsAerial.rawValue))
        #expect(share.state.layerIDs.contains(LayerID.nsprd.rawValue))
    }
}
