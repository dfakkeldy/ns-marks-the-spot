import MapKit
import Testing
@testable import ns_marks_the_spot

@MainActor
struct MapControllerTests {
    @Test func annotationCalloutSubtitleUsesDisplaySubtitle() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView

        controller.addAnnotation(
            MapAnnotation(
                id: "internal-id",
                latitude: 44.6488,
                longitude: -63.5752,
                title: "Crystal Falls",
                subtitle: "waterfall"
            )
        )

        let annotation = try #require(mapView.annotations.compactMap { $0 as? MKPointAnnotation }.first)

        #expect(annotation.title == "Crystal Falls")
        #expect(annotation.subtitle == "waterfall")
    }

    @Test func annotationSelectionEmitsInternalID() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        var selectedID: String?
        controller.events = { event in
            if case .annotationSelected(let id) = event {
                selectedID = id
            }
        }

        controller.addAnnotation(
            MapAnnotation(
                id: "internal-id",
                latitude: 44.6488,
                longitude: -63.5752,
                title: "Crystal Falls",
                subtitle: "waterfall"
            )
        )

        let annotation = try #require(mapView.annotations.compactMap { $0 as? MKPointAnnotation }.first)
        let annotationView = MKAnnotationView(annotation: annotation, reuseIdentifier: nil)

        controller.mapView(mapView, didSelect: annotationView)

        #expect(selectedID == "internal-id")
    }

    @Test func stateAppliedBeforeMapViewAttachSyncsOnAttach() {
        let controller = MapController()
        controller.addAnnotation(
            MapAnnotation(id: "pending", latitude: 44.0, longitude: -63.0, title: "Pending")
        )
        controller.addLayer(makeLayer(id: "fletcher"))

        let mapView = MKMapView()
        controller.mapView = mapView

        #expect(mapView.annotations.contains { ($0 as? MapKitPointAnnotation)?.mapAnnotationID == "pending" })
        #expect(mapView.overlays.contains { ($0 as? OpacityTileOverlay)?.configuration.id == "fletcher" })
    }

    @Test func centeringWithoutLocationDefersUntilUserLocationArrives() {
        let controller = MapController()

        controller.centerOnUserLocation()

        #expect(controller.isWaitingToCenterOnUserLocation == true)
    }

    @Test func currentVisibleBoundsReflectsMapRegion() {
        let controller = MapController()
        let mapView = MKMapView()
        mapView.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        controller.mapView = mapView
        mapView.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 44.5, longitude: -63.5),
            span: MKCoordinateSpan(latitudeDelta: 2, longitudeDelta: 4)
        )
        let region = mapView.region
        let expectedBounds = MapBounds(
            minLatitude: region.center.latitude - region.span.latitudeDelta / 2,
            minLongitude: region.center.longitude - region.span.longitudeDelta / 2,
            maxLatitude: region.center.latitude + region.span.latitudeDelta / 2,
            maxLongitude: region.center.longitude + region.span.longitudeDelta / 2
        ).normalized

        #expect(controller.currentVisibleBounds() == expectedBounds)
        #expect(expectedBounds.minLatitude < 44.5)
        #expect(expectedBounds.maxLatitude > 44.5)
        #expect(expectedBounds.minLongitude < -63.5)
        #expect(expectedBounds.maxLongitude > -63.5)
    }

    @Test func boundsSelectionEmitsNormalizedBoundsWhileSelecting() {
        let controller = MapController()
        var received: MapBounds?
        controller.events = { event in
            if case .boundsSelected(let bounds) = event {
                received = bounds
            }
        }

        controller.beginBoundsSelection()
        controller.completeBoundsSelection(
            with: MapBounds(
                minLatitude: 45.0,
                minLongitude: -63.0,
                maxLatitude: 44.0,
                maxLongitude: -64.0
            )
        )

        #expect(
            received == MapBounds(
                minLatitude: 44.0,
                minLongitude: -64.0,
                maxLatitude: 45.0,
                maxLongitude: -63.0
            )
        )
    }

    @Test func endingSelectionStopsBoundsDelivery() {
        let controller = MapController()
        var deliveryCount = 0
        controller.events = { event in
            if case .boundsSelected = event {
                deliveryCount += 1
            }
        }

        controller.beginBoundsSelection()
        controller.endBoundsSelection()
        controller.completeBoundsSelection(
            with: MapBounds(
                minLatitude: 44.0,
                minLongitude: -64.0,
                maxLatitude: 45.0,
                maxLongitude: -63.0
            )
        )

        #expect(deliveryCount == 0)
    }

    @Test func setOpacityClampsToUnitRange() {
        let controller = MapController()
        controller.addLayer(makeLayer(id: "l1"))

        controller.setOpacity(for: "l1", to: -0.5)
        #expect(controller.layers.first?.opacity == 0.0)

        controller.setOpacity(for: "l1", to: 1.8)
        #expect(controller.layers.first?.opacity == 1.0)
    }

    @Test func setVisibleTogglesLayerVisibility() {
        let controller = MapController()
        controller.addLayer(makeLayer(id: "l1"))

        controller.setVisible(for: "l1", to: false)
        #expect(controller.layers.first?.isVisible == false)

        controller.setVisible(for: "l1", to: true)
        #expect(controller.layers.first?.isVisible == true)
    }

    @Test func setVisibleOnUnknownLayerDoesNotCrash() {
        let controller = MapController()
        controller.setVisible(for: "nonexistent", to: false)
    }

    @Test func addingDuplicateAnnotationIDIsIgnored() {
        let controller = MapController()
        let annotation = MapAnnotation(id: "dup", latitude: 44.0, longitude: -63.0, title: "First")

        controller.addAnnotation(annotation)
        controller.addAnnotation(
            MapAnnotation(id: "dup", latitude: 45.0, longitude: -64.0, title: "Second")
        )

        #expect(controller.annotations.count == 1)
        #expect(controller.annotations.first?.title == "First")
    }

    @Test func retryingAFailedLayerPutsItBackOnTheStartLine() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.addLayer(makeLayer(id: "nsprd"))

        controller.retryTiles(for: "nsprd")

        #expect(controller.layerLoadPhases["nsprd"] == .idle)
        // Replaced, not duplicated: two overlays for one layer would draw the
        // failed squares over the retried ones.
        #expect(mapView.overlays.compactMap { $0 as? OpacityTileOverlay }.count == 1)
    }

    @Test func aLayerThatIsOffIsNotRetried() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.addLayer(makeLayer(id: "nsprd", isVisible: false))

        controller.retryTiles(for: "nsprd")

        // Switching a layer on is already its own retry; refetching one nobody
        // is looking at spends a field user's data on nothing.
        #expect(controller.layerLoadPhases["nsprd"] == nil)
    }

    private func makeLayer(id: String, opacity: CGFloat = 1.0, isVisible: Bool = true) -> MapLayerState {
        MapLayerState(
            configuration: TileLayerConfiguration(
                id: id,
                name: id,
                source: .tile(URL(fileURLWithPath: "/"))
            ),
            opacity: opacity,
            isVisible: isVisible
        )
    }
}
