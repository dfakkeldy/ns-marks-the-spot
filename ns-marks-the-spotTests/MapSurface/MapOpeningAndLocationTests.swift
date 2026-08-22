import CoreLocation
import GeoCore
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

/// The opening view and the answer to the location button.
///
/// Both are things a reader notices before touching anything: where the map
/// starts, and whether pressing a button appears to do nothing.
@MainActor
struct MapOpeningAndLocationTests {
    // MARK: - The opening view

    /// The shared default is Cape Breton, and the native map has to use it.
    ///
    /// This was the visible difference: the browser opened on Cape Breton while
    /// the app opened on a province-wide view centred near Halifax, so the same
    /// zoom-dependent layers were drawn on one surface and not the other.
    @Test func theMapOpensWhereTheWebOpens() {
        let controller = MapController()
        let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        controller.mapView = mapView

        let opening = MapPosition.default
        controller.center(
            on: GeoPoint(lat: opening.latitude, lng: opening.longitude),
            zoom: opening.zoom,
            animated: false
        )

        #expect(abs(mapView.region.center.latitude - 46.08) < 0.01)
        #expect(abs(mapView.region.center.longitude - -60.92) < 0.01)
        // 256-point tiles across a 390-point view at zoom 9 is a little over a
        // degree of longitude. Checked as a range, because MapKit rounds a
        // requested region to one it can actually show.
        #expect(mapView.region.span.longitudeDelta > 0.7)
        #expect(mapView.region.span.longitudeDelta < 1.7)
    }

    /// A position asked for before layout is applied once the view has a width.
    ///
    /// The opening view arrives that way: `makeUIView` runs before the map has
    /// any size, and zoom 9 is a count of tiles across a width that does not
    /// exist yet.
    @Test func aPositionAskedForBeforeLayoutIsNotLost() {
        let controller = MapController()
        let unsized = MKMapView()
        controller.mapView = unsized

        controller.center(on: GeoPoint(lat: 46.08, lng: -60.92), zoom: 9, animated: false)
        // Nothing to apply it to yet.
        #expect(abs(unsized.region.center.latitude - 46.08) > 0.01)

        unsized.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        controller.mapViewDidChangeVisibleRegion(unsized)

        #expect(abs(unsized.region.center.latitude - 46.08) < 0.01)
    }

    // MARK: - The location button

    /// A refusal already on file is reported, so the button is not silent.
    ///
    /// This is the case the app had no answer for. The delegate is not called
    /// again for a status that did not change, so a reader who had said no once
    /// could press the button forever and see nothing at all.
    @Test func aRefusalIsWorthSaying() {
        #expect(
            MapController.locationMessage(for: .denied, readerAsked: true) == .denied
        )
        #expect(
            MapController.locationMessage(for: .restricted, readerAsked: true) == .denied
        )
    }

    /// The same refusal, arriving on its own, says nothing.
    ///
    /// Authorization is reported at launch as well as after a tap. Announcing a
    /// refusal nobody asked about would complain about a feature the reader has
    /// not used.
    @Test func aRefusalNobodyAskedAboutIsNotAnnounced() {
        #expect(MapController.locationMessage(for: .denied, readerAsked: false) == nil)
        #expect(MapController.locationMessage(for: .restricted, readerAsked: false) == nil)
    }

    /// Permission that was granted, or not yet asked for, is not a message.
    @Test func onlyARefusalIsAMessage() {
        for status: CLAuthorizationStatus in [
            .authorizedAlways, .authorizedWhenInUse, .notDetermined,
        ] {
            #expect(MapController.locationMessage(for: status, readerAsked: true) == nil)
        }
    }

    /// Pressing the button says so while the fix is still coming.
    @Test func lookingForTheReaderIsSaidOutLoud() {
        let controller = MapController()
        // No fix on a map view nothing has located, which is the state the
        // button is pressed in.
        controller.mapView = MKMapView()

        controller.centerOnUserLocation()

        #expect(controller.locationMessage == .searching)
    }

    /// The words are the web's, which is what makes the two surfaces one
    /// product rather than two apps that both find you.
    @Test func theWordsMatchTheBrowser() {
        #expect(MapController.LocationMessage.searching.rawValue == "Finding your location…")
        #expect(MapController.LocationMessage.found.rawValue == "Your location is shown on the map.")
        #expect(
            MapController.LocationMessage.denied.rawValue
                == "Location permission was not granted. You can keep using the map."
        )
    }
}
