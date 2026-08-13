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
    @Test func sectionsFollowTheCatalogsGroupOrder() {
        let viewModel = OverlayViewModel.forTesting(
            installing: [.contours, .nsprd, .fletcher, .coastalFlood2050]
        )

        let groups = viewModel.sections.map(\.group)
        let positions = groups.compactMap { LayerGroupID.allCases.firstIndex(of: $0) }

        #expect(positions == positions.sorted())
        #expect(Set(groups).count == groups.count, "a group must not be split across two sections")
        // The two ends are the ones the web fixes deliberately: the core layers
        // above every collapsible section, the historical maps below them all.
        #expect(groups.first == .mapLayers)
        #expect(groups.last == .historical)
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

        let sectioned = viewModel.sections.flatMap(\.rows).map(\.id)

        #expect(Set(sectioned) == expected)
        #expect(sectioned.count == expected.count)
    }

    @Test func aGroupWithNothingToShowGetsNoSection() {
        // `forestry`, `zoning`, `groundwater` and `hydro-pilot` are catalogued
        // but arrive with the vector layers. A section that opens onto nothing
        // reads as a broken panel rather than as a phase that has not shipped.
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd])

        let groups = Set(viewModel.sections.map(\.group))

        #expect(groups.contains(.mapLayers))
        #expect(groups.isDisjoint(with: [.forestry, .zoning, .groundwater, .hydroPilot]))
        #expect(viewModel.sections.allSatisfy { $0.rows.isEmpty == false })
    }

    @Test func everySectionCarriesTheGroupsHeading() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.coastalFlood2100])
        let flood = try #require(viewModel.sections.first { $0.group == .floodHazard })

        #expect(flood.title == "Flood hazard context")
        #expect(viewModel.sections.allSatisfy { $0.title.isEmpty == false })
    }

    @Test func theChurchSheetsGetASectionWithoutBeingInstallable() throws {
        // They are catalogued with no tiles, and the rows exist so a reader can
        // see what is coming and who holds the scan. Dropping the section would
        // make four counties silently absent.
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd])
        let church = try #require(viewModel.sections.first { $0.group == .church })

        #expect(church.rows.count == 4)
        #expect(church.rows.allSatisfy { $0.isAvailable == false })
        // No chip on a row with nothing behind it: "Off" would read as a switch
        // the user could move.
        #expect(church.rows.allSatisfy { $0.runtime == nil })
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

    @Test func theSubtitleCountsTheRowsThisPanelIsShowing() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.contours])
        let topography = try #require(viewModel.sections.first { $0.group == .topography })

        #expect(topography.rows.count == 1)
        #expect(topography.subtitle == "1 layer")

        viewModel.toggleVisibility(LayerID.contours.rawValue)

        let afterToggle = try #require(viewModel.sections.first { $0.group == .topography })
        #expect(afterToggle.subtitle == "1 layer · 1 on")
    }

    @Test func thePanelOpensOnTheSectionsThatAreDrawingSomething() {
        // Fletcher is the layer the app launches showing, and it sits in its own
        // section at the bottom: opening only the first section would hide the
        // one thing already on the map.
        let viewModel = OverlayViewModel.forTesting(installing: [.fletcher, .contours])

        let expanded = TransparencySliderView.initiallyExpandedGroups(in: viewModel.sections)

        #expect(expanded.contains(.historical))
        #expect(expanded.contains(.mapLayers))
        #expect(expanded.contains(.topography) == false)
    }

    @Test func theCoreSectionOpensEvenWithEverythingOff() {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd], licence: .declined)

        let expanded = TransparencySliderView.initiallyExpandedGroups(in: viewModel.sections)

        #expect(viewModel.rows.contains { $0.isVisible } == false)
        #expect(expanded == [.mapLayers])
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

        // 360° across a 256-point view is the whole world at one tile: zoom 0.
        mapView.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 0, longitude: 0),
            span: MKCoordinateSpan(latitudeDelta: 90, longitudeDelta: 360)
        )
        #expect(MapController.tileZoomLevel(of: mapView) == 0)

        // Half the longitude across the same view is one level in, and so on.
        mapView.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 0, longitude: 0),
            span: MKCoordinateSpan(latitudeDelta: 45, longitudeDelta: 45)
        )
        #expect(MapController.tileZoomLevel(of: mapView) == 3)
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
