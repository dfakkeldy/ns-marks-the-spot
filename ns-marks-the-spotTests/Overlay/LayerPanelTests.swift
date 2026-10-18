import CoreLocation
import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

/// The words the panel puts on a layer, against the web's own vocabulary.
///
/// These strings are the parity: `web/src/components/LayerRows.tsx`'s
/// `layerRuntimeLabel` returns exactly these, and a user moving between the two
/// surfaces should not have to learn a second set of words for the same six
/// states.
struct LayerRuntimeStatusTests {
    @Test func aLayerThatIsOffSaysSo() {
        let status = LayerRow.runtimeStatus(
            isVisible: false, minZoom: 10, zoomLevel: 14, phase: .ready
        )

        #expect(status.label == "Off")
    }

    @Test func offWinsOverWhateverTheTilesWereDoing() {
        // The tile queues do not stop the instant a switch moves, and a layer
        // the user just turned off must not keep saying "Loading visible area…"
        // while the last requests drain.
        let status = LayerRow.runtimeStatus(
            isVisible: false, minZoom: 10, zoomLevel: 14, phase: .loading
        )

        #expect(status.label == "Off")
    }

    @Test func aLayerTooFarOutSaysHowFarToZoom() {
        let status = LayerRow.runtimeStatus(
            isVisible: true, minZoom: 14, zoomLevel: 11, phase: .idle
        )

        #expect(status.label == "Zoom to 14+ to load")
    }

    @Test func theZoomFloorIsInclusive() {
        // `minimumZ` is the first zoom MapKit will request, so at exactly the
        // floor the layer loads and the panel must not be telling the user to
        // zoom in on a layer that is already drawing.
        let status = LayerRow.runtimeStatus(
            isVisible: true, minZoom: 14, zoomLevel: 14, phase: .ready
        )

        #expect(status.label == "Ready")
    }

    @Test func zoomOutranksTheLoadPhase() {
        // Below the floor MapKit asks for nothing, so the phase sits at `idle`
        // forever. "Ready to load" would be a promise the map is not keeping.
        let status = LayerRow.runtimeStatus(
            isVisible: true, minZoom: 14, zoomLevel: 8, phase: .idle
        )

        #expect(status.label == "Zoom to 14+ to load")
    }

    @Test func theRestOfTheVocabularyMatchesTheWeb() {
        func label(_ phase: TileLoadPhase) -> String {
            LayerRow.runtimeStatus(
                isVisible: true, minZoom: 0, zoomLevel: 12, phase: phase
            ).label
        }

        #expect(label(.idle) == "Ready to load")
        #expect(label(.loading) == "Loading visible area…")
        #expect(label(.ready) == "Ready")
        #expect(label(.failing) == "Source temporarily unavailable")
    }

    @Test func onlyAFailureIsColouredAsOne() {
        func emphasis(_ phase: TileLoadPhase) -> LayerRuntimeStatus.Emphasis {
            LayerRow.runtimeStatus(
                isVisible: true, minZoom: 0, zoomLevel: 12, phase: phase
            ).emphasis
        }

        #expect(emphasis(.failing) == .broken)
        #expect(emphasis(.loading) == .working)
        #expect(emphasis(.ready) == .ready)
        #expect(emphasis(.idle) == .quiet)
    }
}

@MainActor
struct LayerPanelSectionTests {
    @Test func sectionsFollowTheWebsCategoryOrder() {
        // Ten headings in the browser's order. A reader who has used both
        // surfaces should find the same section in the same place.
        let viewModel = OverlayViewModel.forTesting(
            installing: [.contours, .nsprd, .fletcher, .coastalFlood2050]
        )

        let categories = viewModel.sections(addedMapCount: 0).map(\.category)

        #expect(categories == LayerCategory.all.map(\.id))
    }

    @Test func everyPresentedLayerLandsInExactlyOneSection() {
        // The rows come from the catalog rather than from what MapKit was able
        // to install, so a layer quietly dropped on the way into a section is a
        // layer the user can no longer reach.
        //
        // Compared against the install order and the Church group rather than
        // against `viewModel.rows`: both sides of that comparison come from the
        // same list, so dropping a layer from it would take it off both sides
        // and this would still pass. What the panel owes the user is a row for
        // every layer the app installs, plus the Church sheets it shows without
        // installing, and that is a claim only the catalog can settle.
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd])
        let expected = Set(
            LayerCatalog.all
                .filter { NativeLayerTraits.installOrder.contains($0.id) || $0.group == .church }
                .map(\.id.rawValue)
        )

        let sectioned = viewModel.sections(addedMapCount: 0).flatMap(\.rows).map(\.id)

        #expect(Set(sectioned) == expected)
        #expect(sectioned.count == expected.count)
    }

    @Test func theTwoSectionsHoldingNoCataloguedLayerAreStillShown() {
        // Tax Sale carries the master switch and the record modes; My Maps
        // carries the user's own imports. Neither has a catalogued layer, and
        // dropping a section with no rows would take both controls off the
        // panel entirely.
        //
        // Built the way the app builds it, with the viewport view model the
        // queried layers answer through: without it a third section — the one
        // holding the old-growth policy layer — has nothing to show either,
        // and that is a fact about this test rather than about the panel.
        let controller = MapController()
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: .accepted)
            ),
            features: ViewportFeatureViewModel(controller: controller)
        )

        let empty = viewModel.sections(addedMapCount: 0)
            .filter { $0.rows.isEmpty }
            .map(\.category)

        #expect(empty == [.taxSale, .myMaps])
    }

    @Test func everySectionCarriesTheWebsHeadingAndItsSentence() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.coastalFlood2100])
        let sections = viewModel.sections(addedMapCount: 0)
        let hazards = try #require(sections.first { $0.category == .environmentHazards })

        #expect(hazards.title == "Environment & Hazards")
        #expect(hazards.detail == "Flood, health, aquifer, and well information.")
        #expect(sections.allSatisfy { !$0.title.isEmpty && !$0.detail.isEmpty })
    }

    @Test func theChurchSheetsSitWithFletcherWithoutBeingInstallable() throws {
        // They are catalogued with no tiles, and the rows exist so a reader can
        // see what is coming and who holds the scan. Dropping them would make
        // four counties silently absent.
        let viewModel = OverlayViewModel.forTesting(installing: [.fletcher])
        let historical = try #require(
            viewModel.sections(addedMapCount: 0).first { $0.category == .historicalMaps }
        )
        let unavailable = historical.rows.filter { !$0.isAvailable }

        #expect(historical.rows.contains { $0.id == LayerID.fletcher.rawValue })
        #expect(unavailable.count == 4)
        // No chip on a row with nothing behind it: "Off" would read as a switch
        // the user could move.
        #expect(unavailable.allSatisfy { $0.runtime == nil })
    }

    @Test func everyRowHasProvenanceToShow() {
        // The panel puts source date, scale and coverage under every row, and a
        // blank there is worse than no disclosure at all: it reads as "we
        // checked and there is nothing", which is the one conclusion an empty
        // field must never support.
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd])

        for row in viewModel.rows {
            let descriptor = row.descriptor
            #expect(descriptor.sourceDate.isEmpty == false, "\(row.id) has no source date")
            #expect(descriptor.scale.isEmpty == false, "\(row.id) has no scale")
            #expect(descriptor.coverage.isEmpty == false, "\(row.id) has no coverage")
            #expect(descriptor.minZoom <= descriptor.maxZoom, "\(row.id) has an empty zoom range")
        }
    }

    @Test func theSummaryCountsWhatIsDrawing() throws {
        let viewModel = OverlayViewModel.forTesting(installing: NativeLayerTraits.installOrder)
        let water = try #require(
            viewModel.sections(addedMapCount: 0).first { $0.category == .waterTerrain }
        )

        #expect(water.summary == "Off")

        viewModel.toggleVisibility(LayerID.contours.rawValue)

        let afterToggle = try #require(
            viewModel.sections(addedMapCount: 0).first { $0.category == .waterTerrain }
        )

        #expect(afterToggle.summary == "1 on")
    }

    @Test func theSummaryNamesWhichHistoricalMapsCannotBeDrawn() throws {
        // Collapsed, the heading is the only place a reader is told that four
        // of the maps filed under it cannot be drawn yet — and Fletcher missing
        // is a different fact from the Church sheets having no tiles, so one
        // number covering both would hide which of the two this is.
        let viewModel = OverlayViewModel.forTesting(installing: NativeLayerTraits.installOrder)
        let historical = try #require(
            viewModel.sections(addedMapCount: 0).first { $0.category == .historicalMaps }
        )

        #expect(historical.summary == "1 on · 4 Church maps unavailable")
    }

    @Test func theBackgroundSummaryCountsTheBaseMapUnderneath() throws {
        // Only NS Aerial has a catalog row, so counting rows alone would read
        // "Off" over the Apple map the reader can plainly see.
        let viewModel = OverlayViewModel.forTesting(installing: NativeLayerTraits.installOrder)

        func summary() throws -> String {
            try #require(
                viewModel.sections(addedMapCount: 0).first { $0.category == .backgroundMaps }
            ).summary
        }

        #expect(try summary() == "1 on")

        viewModel.setBaseMapType(.blank)

        #expect(try summary() == "Off")

        // NS Aerial is the base map and its own row at once. One map on the
        // screen has to read as one.
        viewModel.setBaseMapType(.nsAerial)

        #expect(try summary() == "1 on")
    }

    @Test func theSummarySaysWhenTheLicenceIsStillInTheWay() throws {
        // A restricted layer whose switch is on is not drawing while the
        // licence is unanswered, so it is not counted as on — and the reason
        // has to be on the heading, or a collapsed section reads as broken.
        let viewModel = OverlayViewModel.forTesting(
            installing: NativeLayerTraits.installOrder, licence: .declined
        )
        let land = try #require(
            viewModel.sections(addedMapCount: 0).first { $0.category == .landProperty }
        )

        #expect(land.summary == "Off · Province licence required")
    }

    @Test func theTaxSaleSummaryIsTheMasterSwitch() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd])

        func summary() throws -> String {
            try #require(
                viewModel.sections(addedMapCount: 0).first { $0.category == .taxSale }
            ).summary
        }

        #expect(try summary() == "Off")

        viewModel.setTaxSaleEnabled(true)

        #expect(try summary() == "On")
    }

    @Test func theMyMapsSummaryCountsWhatTheUserAdded() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd])

        func summary(added: Int) throws -> String {
            try #require(
                viewModel.sections(addedMapCount: added).first { $0.category == .myMaps }
            ).summary
        }

        #expect(try summary(added: 0) == "Add")
        #expect(try summary(added: 2) == "2 added")
    }

    @Test func theZoningNoteStaysWithTheZoningLayers() throws {
        // The sentence is about the zoning rows, not about everything filed
        // under Land & Property, and it is the difference between "no zoning
        // applies here" and "this map has no zoning data for here".
        let controller = MapController()
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: .accepted)
            ),
            features: ViewportFeatureViewModel(controller: controller)
        )
        let sections = viewModel.sections(addedMapCount: 0)
        let land = try #require(sections.first { $0.category == .landProperty })

        #expect(land.notes.count == 1)
        #expect(land.notes[0].contains("publishes no provincial zoning layer"))
        #expect(
            sections
                .filter { $0.category != .landProperty && $0.category != .waterTerrain }
                .allSatisfy { $0.notes.isEmpty }
        )
    }

    /// Contours are the one layer here a reader can look at and think they know
    /// where the water runs, what the ground will hold, and where a house
    /// could go. The web says in the panel that they do not answer any of
    /// that, and so does this.
    @Test func theContourNoteSaysWhatContoursDoNotEstablish() throws {
        let controller = MapController()
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: .accepted)
            ),
            features: ViewportFeatureViewModel(controller: controller)
        )
        let sections = viewModel.sections(addedMapCount: 0)
        let terrain = try #require(sections.first { $0.category == .waterTerrain })
        let note = try #require(terrain.notes.first)

        #expect(terrain.rows.contains { $0.id == LayerID.contours.rawValue })
        for excluded in [
            "surveyed grade", "drainage", "stability", "access", "flood exposure", "buildability",
        ] {
            #expect(note.contains(excluded), "the note drops \(excluded)")
        }
        // The web's own link, so a reader can take the question to the source
        // rather than to the drawing.
        #expect(note.contains("https://data.novascotia.ca/d/j63u-5nkj"))
    }
}

@MainActor
struct LayerRowRuntimeWiringTests {
    @Test func aVisibleLayerReportsWhatItsTilesAreDoing() async {
        let (viewModel, controller) = Self.panel(installing: .crownLands)
        viewModel.toggleVisibility(LayerID.crownLands.rawValue)

        let tile = controller.progress.began(LayerID.crownLands.rawValue)

        await Self.settle()
        #expect(Self.runtimeLabel(viewModel, .crownLands) == "Loading visible area…")

        controller.progress.finished(tile, .served)

        await Self.settle()
        #expect(Self.runtimeLabel(viewModel, .crownLands) == "Ready")
    }

    @Test func aFailingSourceReachesTheRow() async {
        let (viewModel, controller) = Self.panel(installing: .crownLands)
        viewModel.toggleVisibility(LayerID.crownLands.rawValue)

        let tile = controller.progress.began(LayerID.crownLands.rawValue)
        controller.progress.finished(tile, .failed)

        await Self.settle()
        #expect(Self.runtimeLabel(viewModel, .crownLands) == "Source temporarily unavailable")
    }

    @Test func switchingALayerOffForgetsItsFailure() async {
        // Otherwise the layer reopens on an outage that may have ended while it
        // was off, and the only way to clear it is to pan.
        let (viewModel, controller) = Self.panel(installing: .crownLands)
        viewModel.toggleVisibility(LayerID.crownLands.rawValue)

        let tile = controller.progress.began(LayerID.crownLands.rawValue)
        controller.progress.finished(tile, .failed)
        await Self.settle()

        viewModel.toggleVisibility(LayerID.crownLands.rawValue)
        #expect(Self.runtimeLabel(viewModel, .crownLands) == "Off")

        viewModel.toggleVisibility(LayerID.crownLands.rawValue)
        #expect(controller.progress.phase(for: LayerID.crownLands.rawValue) == .idle)
    }

    @Test func aLayerBelowItsZoomFloorSaysHowFarToZoom() throws {
        // `zoomLevel` opens at 0 — no map view has reported a region yet — so
        // this is also what the panel says before the map has laid out, which
        // is the honest answer for a layer that will not load at zoom 0 either.
        let (viewModel, controller) = Self.panel(installing: .nsprd, zoomedIn: false)
        viewModel.toggleVisibility(LayerID.nsprd.rawValue)

        let minZoom = try #require(LayerCatalog.descriptor(for: .nsprd)?.minZoom)
        #expect(minZoom > 0)
        #expect(Self.runtimeLabel(viewModel, .nsprd) == "Zoom to \(minZoom)+ to load")

        controller.recordZoomLevel(minZoom)
        #expect(Self.runtimeLabel(viewModel, .nsprd) == "Ready to load")
    }

    @Test func theZoomReadingIsTheOneTheTilePathUses() throws {
        // `MKTileOverlay.minimumZ` and the `z` in a tile path are the same
        // number, and the panel's floor has to be that number too — a reading
        // one level out would tell the user to zoom in on a layer that is
        // already drawing, or promise one that is not.
        let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 256, height: 256))

        // Asked for, not given: MapKit settles the region it will actually
        // show — a request for the whole world across 256 points comes back a
        // quarter of that — so the readings are checked against spans it
        // honours, and each halving has to move the reading by exactly one.
        for (span, expected) in [(45.0, 3), (22.5, 4), (11.25, 5), (5.625, 6)] {
            mapView.region = MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 0, longitude: 0),
                span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
            )
            #expect(MapController.tileZoomLevel(of: mapView) == expected)
        }
    }

    @Test func aMapWithNoSizeYetReportsNoZoom() {
        // Every call before layout. A zero width computes a zoom of negative
        // infinity, which would put "Zoom to 14+ to load" on every row of a map
        // that has not been drawn.
        let mapView = MKMapView(frame: .zero)

        #expect(MapController.tileZoomLevel(of: mapView) == nil)
    }

    /// A panel with one layer installed and the map zoomed in past that layer's
    /// floor, so the runtime label is reporting the tiles rather than the zoom.
    private static func panel(
        installing id: LayerID,
        licence: ProvinceLicenceState = .accepted,
        zoomedIn: Bool = true
    ) -> (OverlayViewModel, MapController) {
        let controller = MapController()
        let descriptor = LayerCatalog.descriptor(for: id)
        if let descriptor,
           let layer = AppContainer.makeLayer(
               from: descriptor,
               fletcherBaseURL: URL(string: "https://tiles.example.test/fletcher")
           ) {
            controller.addLayer(layer)
        }
        if zoomedIn, let descriptor {
            controller.recordZoomLevel(descriptor.minZoom)
        }
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: licence)
            )
        )
        return (viewModel, controller)
    }

    private static func runtimeLabel(_ viewModel: OverlayViewModel, _ id: LayerID) -> String? {
        viewModel.rows.first { $0.id == id.rawValue }?.runtime?.label
    }

    /// The box reports from wherever the tile queue is and the controller reads
    /// it back on the main actor, so the phase lands a hop later. Yielded on
    /// rather than slept on: the assertion is that it arrives.
    private static func settle() async {
        for _ in 0..<50 {
            await Task.yield()
        }
    }
}
