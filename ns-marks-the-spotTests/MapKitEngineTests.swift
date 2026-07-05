import MapKit
import Testing
@testable import ns_marks_the_spot

@MainActor
struct MapKitEngineTests {
    @Test func annotationCalloutSubtitleUsesDisplaySubtitle() throws {
        let engine = MapKitEngine()
        let mapView = MKMapView()
        engine.mapView = mapView

        engine.addAnnotation(
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

    @Test func annotationSelectionUsesInternalID() throws {
        let engine = MapKitEngine()
        let mapView = MKMapView()
        engine.mapView = mapView
        var selectedID: String?
        engine.setAnnotationSelectionHandler { id in
            selectedID = id
        }

        engine.addAnnotation(
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
        let coordinator = MapKitMapView.Coordinator(engine: engine)

        coordinator.mapView(mapView, didSelect: annotationView)

        #expect(selectedID == "internal-id")
    }

    @Test func centeringWithoutLocationDefersUntilUserLocationArrives() {
        let engine = MapKitEngine()

        engine.centerOnUserLocation()

        #expect(engine.isWaitingToCenterOnUserLocation == true)
    }

    @Test func currentVisibleBoundsReflectsMapRegion() {
        let engine = MapKitEngine()
        let mapView = MKMapView()
        mapView.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        engine.mapView = mapView
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

        #expect(engine.currentVisibleBounds() == expectedBounds)
        #expect(expectedBounds.minLatitude < 44.5)
        #expect(expectedBounds.maxLatitude > 44.5)
        #expect(expectedBounds.minLongitude < -63.5)
        #expect(expectedBounds.maxLongitude > -63.5)
    }
}
