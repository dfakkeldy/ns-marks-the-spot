import CoreGraphics
import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// The official layers a scan can be lined up against, and the licence they
/// stay behind.
@Suite("Reference layers in the georeferencer")
@MainActor
struct GeoreferenceReferencesTests {
    private func services(
        licence: ProvinceLicenceState = .accepted,
        installing ids: [LayerID] = [],
        visible: Set<LayerID> = []
    ) -> GeoreferenceReferenceServices {
        let cache = TileCache()
        let controller = MapController()
        for id in ids {
            guard let descriptor = LayerCatalog.descriptor(for: id),
                  var layer = AppContainer.makeLayer(from: descriptor, fletcherBaseURL: nil)
            else { continue }
            layer.isVisible = visible.contains(id)
            controller.addLayer(layer)
        }
        let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage())
        switch licence {
        case .accepted: store.accept()
        case .declined: store.decline()
        case .unknown: break
        }
        return GeoreferenceReferenceServices(
            tileCache: cache,
            tileFetcher: TileFetcher(tileCache: cache),
            clearanceBox: LicenceClearanceBox(),
            licenceStore: store,
            controller: controller
        )
    }

    /// A catalog edit that renamed or dropped either layer would leave the
    /// panel with two switches that turn nothing on, and nothing would say so.
    @Test("Both reference switches name a layer the catalog still has")
    func bothReferenceSwitchesNameALayerTheCatalogStillHas() {
        for reference in GeoreferenceReference.allCases {
            let descriptor = LayerCatalog.descriptor(for: reference.layerID)
            #expect(descriptor != nil, "\(reference.rawValue) has no catalogue entry")
            #expect(descriptor?.delivery == .mapExport)
            #expect(descriptor?.licence == .provinceRestricted)
        }
    }

    /// The overlays are built from the catalogue rather than from figures
    /// written down here, so the pane draws the same source at the same limits
    /// as the layer of that name on the main map.
    @Test("A reference layer is drawn at the catalogue's limits")
    func aReferenceLayerIsDrawnAtTheCataloguesLimits() throws {
        let services = services()
        for reference in GeoreferenceReference.allCases {
            let installed = try #require(services.overlay(for: reference))
            let descriptor = try #require(LayerCatalog.descriptor(for: reference.layerID))
            #expect(installed.overlay.configuration.id == reference.layerID.rawValue)
            #expect(installed.overlay.minimumZ == descriptor.minZoom)
            #expect(
                installed.overlay.maximumZ == (descriptor.maxNativeZoom ?? descriptor.maxZoom)
            )
            #expect(installed.alpha == CGFloat(descriptor.opacity ?? 1))
            // The base map has to stay visible: this pane exists to compare
            // a scan against ground the user can still see.
            #expect(installed.overlay.canReplaceMapContent == false)
        }
    }

    /// The web georeferences on the live map, so its order is the main map's:
    /// imagery under the scan, boundaries over it. A lot line hidden behind an
    /// 1884 sheet is the comparison the reader turned parcels on to make.
    @Test("Imagery goes under the scan and boundaries over it")
    func imageryGoesUnderTheScanAndBoundariesOverIt() throws {
        let mapView = MKMapView()
        let coordinator = Self.coordinator(on: mapView)
        let scan = try #require(Self.placedScan())
        mapView.installInDrawOrder(scan)
        coordinator.apply(references: Set(GeoreferenceReference.allCases), services: services())

        let ids = Self.installedIDs(on: mapView)
        #expect(ids == ["ns-aerial", "scan", "nsprd"])
    }

    /// The order cannot depend on which the reader reached for first. A drag
    /// rebuilds the scan on every frame, and an appended overlay would climb
    /// over the boundaries it is being checked against.
    @Test("Rebuilding the scan does not move it above the boundaries")
    func rebuildingTheScanDoesNotMoveItAboveTheBoundaries() throws {
        let mapView = MKMapView()
        let coordinator = Self.coordinator(on: mapView)
        coordinator.apply(references: Set(GeoreferenceReference.allCases), services: services())
        for _ in 0..<2 {
            for overlay in mapView.overlays where overlay is UserMapOverlay {
                mapView.removeOverlay(overlay)
            }
            mapView.installInDrawOrder(try #require(Self.placedScan()))
        }
        #expect(Self.installedIDs(on: mapView) == ["ns-aerial", "scan", "nsprd"])
    }

    /// Switching one off takes out that overlay and only that one.
    @Test("Turning a reference off removes its overlay alone")
    func turningAReferenceOffRemovesItsOverlayAlone() {
        let mapView = MKMapView()
        let coordinator = Self.coordinator(on: mapView)
        let services = services()
        coordinator.apply(references: [.aerial, .parcels], services: services)
        coordinator.apply(references: [.parcels], services: services)
        #expect(Self.installedIDs(on: mapView) == ["nsprd"])
        // And back, at its own place in the order rather than on top.
        coordinator.apply(references: [.aerial, .parcels], services: services)
        #expect(Self.installedIDs(on: mapView) == ["ns-aerial", "nsprd"])
    }

    /// How a withdrawn licence reaches tiles MapKit has already drawn: the
    /// panel hands down an empty set, and the overlays come out. Stopping the
    /// next fetch is not enough — the imagery is on screen.
    @Test("An empty set takes the drawn imagery back off the map")
    func anEmptySetTakesTheDrawnImageryBackOffTheMap() {
        let mapView = MKMapView()
        let coordinator = Self.coordinator(on: mapView)
        let services = services()
        coordinator.apply(references: [.aerial, .parcels], services: services)
        #expect(!Self.installedIDs(on: mapView).isEmpty)
        coordinator.apply(references: [], services: services)
        #expect(Self.installedIDs(on: mapView).isEmpty)
    }

    /// A preview or a test has no app container to lend a cache and a clearance
    /// from. Nothing is drawn then — never a fetch of this pane's own.
    @Test("With no services nothing is installed")
    func withNoServicesNothingIsInstalled() {
        let mapView = MKMapView()
        let coordinator = Self.coordinator(on: mapView)
        coordinator.apply(references: [.aerial, .parcels], services: nil)
        #expect(Self.installedIDs(on: mapView).isEmpty)
    }

    /// The starting clearance is `.unknown`, and the panel reads this to decide
    /// whether the switches are usable at all.
    @Test("Nothing is offered before the licence is answered")
    func nothingIsOfferedBeforeTheLicenceIsAnswered() {
        #expect(services(licence: .unknown).allowsRestrictedLayers == false)
        #expect(services(licence: .declined).allowsRestrictedLayers == false)
        #expect(services(licence: .accepted).allowsRestrictedLayers)
    }

    /// The panel reads the store rather than a clearance copied out of it,
    /// so a licence revoked in Settings while the sheet is open closes the
    /// switches instead of waiting for the sheet to be opened again.
    @Test("Revoking while the panel is open closes the switches")
    func revokingWhileThePanelIsOpenClosesTheSwitches() {
        let services = services(installing: [.nsAerial], visible: [.nsAerial])
        #expect(services.allowsRestrictedLayers)
        #expect(services.activeOnTheMainMap == [.aerial])
        services.licenceStore.revoke()
        #expect(services.allowsRestrictedLayers == false)
        #expect(services.activeOnTheMainMap.isEmpty)
    }

    /// The browser's editor opens over the layers the map was already showing,
    /// because it is the same map. This one copies them.
    @Test("The pane opens showing what the main map was showing")
    func thePaneOpensShowingWhatTheMainMapWasShowing() {
        let showing = services(
            installing: [.nsAerial, .nsprd], visible: [.nsAerial]
        )
        #expect(showing.activeOnTheMainMap == [.aerial])

        // Never against an unanswered licence: an installed layer starts hidden
        // and could only be visible through an acceptance, but a seed that
        // trusted the flag alone would be a second opinion about clearance.
        let unlicensed = services(
            licence: .declined, installing: [.nsAerial, .nsprd], visible: [.nsAerial, .nsprd]
        )
        #expect(unlicensed.activeOnTheMainMap.isEmpty)
    }

    /// The gate that matters is the one on the tile, not the one on the
    /// switch: a state restored from somewhere else, or an accessibility
    /// action, must not reach the service either.
    @Test("An unaccepted reference layer draws nothing and fetches nothing")
    func anUnacceptedReferenceLayerDrawsNothingAndFetchesNothing() async throws {
        let services = services(licence: .unknown)
        for reference in GeoreferenceReference.allCases {
            let installed = try #require(services.overlay(for: reference))
            let (data, outcome, substance) = try await installed.overlay.exportTile(
                at: MKTileOverlayPath(x: 41, y: 46, z: 14, contentScaleFactor: 1)
            )
            // Refused, and said so — not "the source had nothing here", which
            // is what a reader would otherwise conclude from a blank square.
            #expect(substance == .licenceRefused)
            #expect(outcome == .served)
            #expect(!data.isEmpty)
        }
    }

    /// What the panel has to print beside the imagery. The OpenStreetMap
    /// ground's credit leads and is owed even with every switch off — the
    /// tiles are on screen regardless — and two restricted layers from one
    /// publisher are one credit after it.
    @Test("Drawn layers carry the licence's own words")
    func drawnLayersCarryTheLicencesOwnWords() throws {
        let services = services()
        #expect(services.credits(for: []) == [ActiveAttribution.openStreetMapCredit])
        let credits = services.credits(for: [.aerial, .parcels])
        // OpenStreetMap's ground, the aerial credit with the Service Nova
        // Scotia copyright it must carry, and the parcels' Province credit.
        #expect(credits.count == 3)
        #expect(credits[0] == ActiveAttribution.openStreetMapCredit)
        #expect(credits[1].copyright == "Service Nova Scotia")
        #expect(credits.dropFirst().allSatisfy { $0.provider == "Province of Nova Scotia" })
        #expect(credits.dropFirst().allSatisfy { !$0.disclaimer.isEmpty })
    }

    /// Property boundaries begin at zoom 14, and the panel warns below it.
    @Test("The catalogue says where each layer starts drawing")
    func theCatalogueSaysWhereEachLayerStartsDrawing() {
        let services = services()
        #expect(services.minimumZoom(for: .parcels) == 14)
        #expect(services.minimumZoom(for: .aerial) == 10)
    }

    /// The pane's ground is the map the placed scan will be shown over: the
    /// OpenStreetMap base, under the imagery, the scan and the boundaries —
    /// even though the references arrive after it, one switch at a time.
    @Test("The OpenStreetMap ground stays under the imagery and the scan")
    func theOpenStreetMapGroundStaysUnderTheImageryAndTheScan() throws {
        let mapView = MKMapView()
        let coordinator = Self.coordinator(on: mapView)
        // As `makeUIView` installs it: first, before anything else is drawn.
        mapView.installInDrawOrder(OSMBaseOverlay())
        mapView.installInDrawOrder(try #require(Self.placedScan()))
        coordinator.apply(references: Set(GeoreferenceReference.allCases), services: services())
        #expect(Self.installedIDs(on: mapView) == ["osm", "ns-aerial", "scan", "nsprd"])
    }

    /// The base-replacing overlay needs a tile renderer of its own. The
    /// pane's fallback is a bare `MKOverlayRenderer`, which draws nothing —
    /// and nothing on the base is a black map.
    @Test("The pane gives the ground a renderer that draws its tiles")
    func thePaneGivesTheGroundARendererThatDrawsItsTiles() {
        let mapView = MKMapView()
        let coordinator = Self.coordinator(on: mapView)
        let renderer = coordinator.mapView(mapView, rendererFor: OSMBaseOverlay())
        #expect(renderer is MKTileOverlayRenderer)
    }

    // MARK: - Fixtures

    private static func coordinator(on mapView: MKMapView) -> GeoreferenceMapPane.Coordinator {
        let coordinator = GeoreferenceMapPane.Coordinator(
            onTap: { _ in }, onDragBegin: { _ in }, onMove: { _, _ in },
            onDragEnd: { _ in }, onZoomChange: { _ in }
        )
        coordinator.mapView = mapView
        return coordinator
    }

    /// The installed overlays bottom-up, named by what they are. Index is
    /// z-order in MapKit, which is the whole question here.
    private static func installedIDs(on mapView: MKMapView) -> [String] {
        mapView.overlays.map { overlay in
            if overlay is OSMBaseOverlay { return "osm" }
            if let tile = overlay as? OpacityTileOverlay { return tile.configuration.id }
            if overlay is UserMapOverlay { return "scan" }
            return "?"
        }
    }

    /// A one-pixel sheet placed on real ground. Only its draw order is read,
    /// but it has to be a real overlay: the number comes from the class rather
    /// than from anything a stub could stand in for.
    private static func placedScan() -> UserMapOverlay? {
        let context = CGContext(
            data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
        guard let image = context?.makeImage() else { return nil }
        let record = UserMapRecord(
            id: "order", name: "Order", pixelSize: PixelSize(width: 1, height: 1),
            placement: .controlPoints(
                [
                    SessionControlPoint(
                        id: "nw", pixel: PixelPoint(x: 0, y: 0),
                        map: GeoPoint(lat: 44.7, lng: -63.7)
                    ),
                    SessionControlPoint(
                        id: "ne", pixel: PixelPoint(x: 1, y: 0),
                        map: GeoPoint(lat: 44.7, lng: -63.5)
                    ),
                    SessionControlPoint(
                        id: "sw", pixel: PixelPoint(x: 0, y: 1),
                        map: GeoPoint(lat: 44.6, lng: -63.7)
                    ),
                ],
                method: .affine
            )
        )
        return UserMapOverlay(record: record, image: image, alpha: 1)
    }
}
