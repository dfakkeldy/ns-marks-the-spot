import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// What the page says about a layer the reader switched on and cannot see.
///
/// The compositor only ever hears about shapes, so a zoom-gated, still-loading
/// or failed layer reaches the paper as blank ground and no sentence at all.
/// Blank ground with no sentence reads as ground that was asked about.
@Suite("Layers that were on and put nothing on the page")
@MainActor
struct PrintUndrawnLayerTests {
    private static let framed = GeoBoundingBox(
        south: 45.6, west: -61.4, north: 45.7, east: -61.3
    )

    private static func shape(_ layer: LayerID, at box: GeoBoundingBox) -> FeatureShape {
        FeatureShape(
            id: "\(layer.rawValue)-1",
            layer: layer,
            geometry: .polygon([
                [
                    GeoPoint(lat: box.south, lng: box.west),
                    GeoPoint(lat: box.south, lng: box.east),
                    GeoPoint(lat: box.north, lng: box.east),
                    GeoPoint(lat: box.north, lng: box.west),
                    GeoPoint(lat: box.south, lng: box.west)
                ]
            ]),
            style: VectorFeatureStyle(strokeHex: "#166534", lineWidth: 1.7),
            title: "feature",
            subtitle: nil,
            callout: nil
        )
    }

    /// A shape given exactly as written, so a test can hand over geometry that
    /// is not a rectangle.
    private static func shape(
        _ layer: LayerID, drawing geometry: GeoJSONGeometry, filled: Bool = false
    ) -> FeatureShape {
        FeatureShape(
            id: "\(layer.rawValue)-1",
            layer: layer,
            geometry: geometry,
            style: VectorFeatureStyle(strokeHex: "#166534", lineWidth: 1.7),
            printStyle: VectorFeatureStyle(
                strokeHex: "#333333",
                fillHex: filled ? "#ededed" : nil,
                fillOpacity: filled ? 0.35 : 0,
                lineWidth: 1
            ),
            title: "feature",
            subtitle: nil,
            callout: nil
        )
    }

    private func request(
        statuses: [LayerID: ViewportLayerStatus],
        shapes: [FeatureShape] = [],
        markers: [FeatureMarker] = []
    ) -> PrintExportRequest? {
        let controller = MapController()
        controller.setFeatureShapes(shapes)
        controller.setFeatureMarkers(markers)
        let viewModel = OverlayViewModel.forTesting(
            controller: controller, installing: [.nsprd]
        )
        return viewModel.printExportRequest(
            template: PdfTemplate.template(.landscape),
            fields: PdfComposer.Fields(title: "Sheet", subtitle: "", notes: ""),
            frame: Self.framed,
            featureStatuses: statuses
        )
    }

    /// What the page will name as unprinted, derived from a request exactly as
    /// `PrintExport.build` derives it: ink on the page beats whatever the panel
    /// says the layer is doing.
    private func undrawn(in request: PrintExportRequest) -> [PrintExport.UndrawnFeatureLayer] {
        var drawn = Set(request.features.map(\.layer))
        drawn.formUnion(request.markers.map(\.layer))
        return PrintExport.undrawnFeatureLayers(request.featureLayerStatuses, drawn: drawn)
    }

    /// Three different reasons for the same blank paper, and the reader is
    /// deciding whether to frame tighter, wait, or come back tomorrow.
    @Test("A gated, loading or failed layer is carried to the page with its reason")
    func aGatedLoadingOrFailedLayerIsCarriedToThePageWithItsReason() throws {
        let printed = try #require(
            request(statuses: [
                .zoningHalifax: .zoomGated(minZoom: 12),
                .nsWellLogs: .loading,
                .abandonedMines: .failed
            ])
        )

        // Fixed order, because a dictionary has none and two exports of one
        // view must not produce two differently worded pages.
        #expect(
            undrawn(in: printed).map(\.id)
                == [.abandonedMines, .nsWellLogs, .zoningHalifax]
        )
        let reasons = Dictionary(
            uniqueKeysWithValues: undrawn(in: printed).map { ($0.id, $0.status.printReason) }
        )
        #expect(reasons[.zoningHalifax] == "zoom to 12+ to load")
        #expect(reasons[.nsWellLogs] == "loading visible area")
        #expect(reasons[.abandonedMines] == "source temporarily unavailable")
    }

    /// The distinction the whole feature turns on. A layer that answered and
    /// found nothing here has made a finding, and the page must not overwrite
    /// it with "not printed" — that would turn evidence of absence back into
    /// absence of evidence.
    @Test("A layer that answered with nothing is not called unprinted")
    func aLayerThatAnsweredWithNothingIsNotCalledUnprinted() throws {
        let printed = try #require(
            request(statuses: [
                .nsWellLogs: .ready(drawn: 0, unreadable: 0),
                .zoningHalifax: .off
            ])
        )

        #expect(undrawn(in: printed).isEmpty)
    }

    /// Ink beats status. A layer whose query is refreshing for the next view
    /// still has last view's shapes on this page, and naming it as unprinted
    /// beside its own polygons would be the page contradicting itself.
    @Test("A layer with shapes inside the frame is not named as unprinted")
    func aLayerWithShapesInsideTheFrameIsNotNamedAsUnprinted() throws {
        let printed = try #require(
            request(
                statuses: [.zoningHalifax: .loading],
                shapes: [Self.shape(.zoningHalifax, at: Self.framed)]
            )
        )

        #expect(undrawn(in: printed).isEmpty)
        #expect(printed.features.count == 1)
        // But it does not print as a settled answer either. The map keeps the
        // previous view's shapes on purpose, and on paper that leftover is
        // indistinguishable from a fresh one unless the page says so.
        #expect(
            PrintExport.pageState(forDrawn: printed.featureLayerStatuses[.zoningHalifax])
                == .drawnFromEarlierView(reason: "loading visible area")
        )
    }

    /// A layer whose source went down keeps drawing what it last had. The page
    /// carries that ink — blanking it would state the ground went empty — and
    /// has to say which view the ink answers.
    @Test("Ink left over from a failed refresh says so on the page")
    func inkLeftOverFromAFailedRefreshSaysSoOnThePage() {
        let account = PrintExportPlan.account(
            for: [
                PrintMapCompositor.LayerOutcome(
                    id: "ns-well-logs",
                    name: "Well logs",
                    state: .drawnFromEarlierView(reason: "source temporarily unavailable")
                )
            ],
            swatch: { _ in nil }
        )

        #expect(account.fromEarlierView == ["Well logs (source temporarily unavailable)"])
        // In the legend, because the reader is looking at the ink, and marked,
        // because a bare row would call it this frame's answer.
        #expect(account.legend.map(\.name) == ["Well logs (an earlier view)"])
        let note = account.notes.first { $0.hasPrefix("Showing an earlier view") }
        #expect(note?.contains("Well logs (source temporarily unavailable)") == true)
        #expect(note?.contains("not this frame's answer") == true)
        // Not a layer that put nothing on the page: this one drew.
        #expect(account.notDrawn.isEmpty)
        #expect(account.omitted.isEmpty)
    }

    /// The panel says "3 unreadable" beside the switch. Paper that drops the
    /// second half of that sentence shows the reader fewer things than the
    /// source returned and does not admit it.
    @Test("Features the source sent and this app could not read are counted on the page")
    func featuresTheSourceSentAndThisAppCouldNotReadAreCountedOnThePage() {
        #expect(
            PrintExport.pageState(forDrawn: .ready(drawn: 41, unreadable: 3))
                == .drawnPartlyUnread(count: 3)
        )
        #expect(PrintExport.pageState(forDrawn: .ready(drawn: 41, unreadable: 0)) == .drawn)
        // Nothing said about it is nothing this function may invent.
        #expect(PrintExport.pageState(forDrawn: nil) == .drawn)

        let account = PrintExportPlan.account(
            for: [
                PrintMapCompositor.LayerOutcome(
                    id: "ns-well-logs", name: "Well logs", state: .drawnPartlyUnread(count: 3)
                )
            ],
            swatch: { _ in nil }
        )

        #expect(account.partlyUnread == ["Well logs (3)"])
        #expect(account.legend.map(\.name) == ["Well logs (3 unread)"])
        let note = account.notes.first { $0.hasPrefix("Partly unread") }
        #expect(note?.contains("less than the source returned") == true)
    }

    /// Shapes a hundred kilometres away are not on this page, so as far as this
    /// sheet is concerned the layer drew nothing and owes the reader a reason.
    @Test("Shapes outside the frame do not count as drawn")
    func shapesOutsideTheFrameDoNotCountAsDrawn() throws {
        let elsewhere = GeoBoundingBox(south: 44.0, west: -64.0, north: 44.1, east: -63.9)
        let printed = try #require(
            request(
                statuses: [.zoningHalifax: .loading],
                shapes: [Self.shape(.zoningHalifax, at: elsewhere)]
            )
        )

        #expect(printed.features.isEmpty)
        #expect(undrawn(in: printed).map(\.id) == [.zoningHalifax])
    }

    /// The frame the reader drags is not the page. The export grows it to the
    /// paper's proportions, so on this landscape sheet the printed ground runs
    /// out to -61.4713 where the frame stops at -61.4, and a zone standing in
    /// that strip is on the paper.
    ///
    /// Filtered to the dragged frame instead, the page was composited without
    /// it and then told the reader the layer had drawn nothing — a blank strip
    /// with a sentence agreeing it was blank, over ground the source had
    /// answered for.
    @Test("A shape in the grown margin is on the page")
    func aShapeInTheGrownMarginIsOnThePage() throws {
        let margin = GeoBoundingBox(south: 45.62, west: -61.46, north: 45.66, east: -61.44)
        let printed = try #require(
            request(
                statuses: [.zoningHalifax: .loading],
                shapes: [Self.shape(.zoningHalifax, at: margin)]
            )
        )

        // Outside the frame the reader dragged, and inside the page.
        #expect(margin.east < Self.framed.west)
        #expect(printed.features.count == 1)
        #expect(undrawn(in: printed).isEmpty)
    }

    /// The box around a zone is not the zone. This L wraps the page from the
    /// west and the south, so its box covers the whole sheet while the polygon
    /// itself stays off it.
    ///
    /// Counted from the box, the page came out blank with "Halifax Regional
    /// Municipality" keyed in the legend over it, and the note that would have
    /// said the layer was still loading was suppressed by the same false
    /// positive. Blank paper the reader was told had been answered for is the
    /// one claim this document must not make.
    @Test("A shape whose box covers the page but whose geometry misses it is not drawn")
    func aShapeWhoseBoxCoversThePageButWhoseGeometryMissesItIsNotDrawn() throws {
        let ell = GeoJSONGeometry.polygon([
            [
                GeoPoint(lat: 45.50, lng: -62.00),
                GeoPoint(lat: 45.50, lng: -61.00),
                GeoPoint(lat: 45.55, lng: -61.00),
                GeoPoint(lat: 45.55, lng: -61.50),
                GeoPoint(lat: 45.80, lng: -61.50),
                GeoPoint(lat: 45.80, lng: -62.00),
                GeoPoint(lat: 45.50, lng: -62.00)
            ]
        ])
        // The premise: the box test this replaced said yes here, on the grown
        // page as well as on the dragged frame.
        let page = PrintExportPlan.bounds(
            covering: Self.framed, mapFrame: PdfTemplate.template(.landscape).mapFrame
        )
        #expect(ell.boundingBox?.intersects(page) == true)

        let printed = try #require(
            request(
                statuses: [.zoningHalifax: .loading],
                shapes: [Self.shape(.zoningHalifax, drawing: ell, filled: true)]
            )
        )

        #expect(printed.features.isEmpty)
        #expect(undrawn(in: printed).map(\.id) == [.zoningHalifax])
    }

    /// The other half of the same question. A shape big enough to hold the
    /// whole page strokes its boundary off the paper, so whether it is on the
    /// page is decided by whether the page fills it.
    @Test("A shape that swallows the page counts only when the page fills it")
    func aShapeThatSwallowsThePageCountsOnlyWhenThePageFillsIt() throws {
        let county = GeoJSONGeometry.polygon([
            [
                GeoPoint(lat: 45.0, lng: -62.0),
                GeoPoint(lat: 45.0, lng: -61.0),
                GeoPoint(lat: 46.0, lng: -61.0),
                GeoPoint(lat: 46.0, lng: -62.0),
                GeoPoint(lat: 45.0, lng: -62.0)
            ]
        ])

        let outline = try #require(
            request(
                statuses: [.zoningHalifax: .loading],
                shapes: [Self.shape(.zoningHalifax, drawing: county, filled: false)]
            )
        )
        #expect(outline.features.isEmpty)
        #expect(undrawn(in: outline).map(\.id) == [.zoningHalifax])

        let tinted = try #require(
            request(
                statuses: [.zoningHalifax: .loading],
                shapes: [Self.shape(.zoningHalifax, drawing: county, filled: true)]
            )
        )
        #expect(tinted.features.count == 1)
        #expect(undrawn(in: tinted).isEmpty)
    }

    /// The stroke is centred on the boundary, so a line whose centre line
    /// stands half a line width off the page still lays ink along its edge.
    /// Counted from the centre line alone, that sliver printed with the layer
    /// named beside it as having drawn nothing.
    @Test("A boundary just off the page still counts for its stroke's reach")
    func aBoundaryJustOffThePageStillCountsForItsStrokesReach() throws {
        let page = PrintExportPlan.bounds(
            covering: Self.framed, mapFrame: PdfTemplate.template(.landscape).mapFrame
        )
        // Half of this style's 1 pt stroke on a 736 pt frame is about 13 m of
        // this ground; 0.00008 degrees of longitude here is about 6 m.
        let grazing = GeoJSONGeometry.lineString([
            GeoPoint(lat: 45.62, lng: page.west - 0.00008),
            GeoPoint(lat: 45.68, lng: page.west - 0.00008)
        ])
        let printed = try #require(
            request(
                statuses: [.zoningHalifax: .loading],
                shapes: [Self.shape(.zoningHalifax, drawing: grazing)]
            )
        )
        #expect(printed.features.count == 1)
        #expect(undrawn(in: printed).isEmpty)

        // Beyond the stroke's reach there is no sliver to disown.
        let clear = GeoJSONGeometry.lineString([
            GeoPoint(lat: 45.62, lng: page.west - 0.0003),
            GeoPoint(lat: 45.68, lng: page.west - 0.0003)
        ])
        let blank = try #require(
            request(
                statuses: [.zoningHalifax: .loading],
                shapes: [Self.shape(.zoningHalifax, drawing: clear)]
            )
        )
        #expect(blank.features.isEmpty)
        #expect(undrawn(in: blank).map(\.id) == [.zoningHalifax])
    }

    /// A marker is a circle of fixed page size, not a coordinate. One whose
    /// centre stands just off the page lays part of its circle on it, and a
    /// coordinate test dropped that ink and the layer's legend row with it.
    @Test("A marker just off the page still counts for its printed radius")
    func aMarkerJustOffThePageStillCountsForItsPrintedRadius() throws {
        let page = PrintExportPlan.bounds(
            covering: Self.framed, mapFrame: PdfTemplate.template(.landscape).mapFrame
        )
        // This dot reaches 5.625 pt from its centre — radius five plus half
        // its stroke — which is about 144 m of this ground. The near marker
        // stands about 78 m off the page, the far one about 311 m.
        func well(_ offset: Double) -> FeatureMarker {
            FeatureMarker(
                id: "well-\(offset)",
                layer: .nsWellLogs,
                latitude: 45.65,
                longitude: page.west - offset,
                style: VectorFeatureStyle(strokeHex: "#1d4ed8", lineWidth: 1.25),
                printStyle: VectorFeatureStyle(
                    strokeHex: "#1d4ed8",
                    fillHex: "#ffffff",
                    fillOpacity: 1,
                    lineWidth: 1.25,
                    markerRadius: 5
                ),
                title: "well",
                subtitle: nil
            )
        }
        let printed = try #require(
            request(statuses: [.nsWellLogs: .loading], markers: [well(0.001)])
        )
        #expect(printed.markers.count == 1)
        #expect(undrawn(in: printed).isEmpty)

        let blank = try #require(
            request(statuses: [.nsWellLogs: .loading], markers: [well(0.004)])
        )
        #expect(blank.markers.isEmpty)
        #expect(undrawn(in: blank).map(\.id) == [.nsWellLogs])
    }

    /// The licence has its own sentence on the page, and it is the stronger
    /// one: nothing was ever fetched, so there is nothing to have missed.
    @Test("An unaccepted licence keeps its own words on the page")
    func anUnacceptedLicenceKeepsItsOwnWordsOnThePage() throws {
        let printed = try #require(request(statuses: [.zoningHalifax: .licenceBlocked]))
        #expect(undrawn(in: printed).map(\.id) == [.zoningHalifax])
        #expect(PrintExport.pageState(for: .licenceBlocked) == .licenceBlocked)
        #expect(
            PrintExport.pageState(for: .zoomGated(minZoom: 12))
                == .notDrawn(reason: "zoom to 12+ to load")
        )
    }
}
