import GeoCore
import MapKit
import NSDataServices
import SwiftUI

struct MapSurfaceView: UIViewRepresentable {
    let controller: MapController

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = controller
        mapView.accessibilityLabel = "Map of Nova Scotia"
        mapView.showsCompass = false

        // The web's opening view, not a province-wide one: both surfaces open
        // on Cape Breton at zoom 9, so a reader who has one open beside the
        // other is looking at the same ground before touching anything. The
        // span here is only what fills the first frame — zoom 9 is a count of
        // tiles across the view, so the width has to exist before it can be
        // turned into a region, which is what the call below waits for.
        let opening = MapPosition.default
        mapView.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: opening.latitude, longitude: opening.longitude
            ),
            span: MKCoordinateSpan(latitudeDelta: 1.1, longitudeDelta: 1.1)
        )

        let selectionPan = UIPanGestureRecognizer(
            target: controller,
            action: #selector(MapController.handleSelectionPan(_:))
        )
        selectionPan.name = "BoundsSelectionPan"
        selectionPan.delegate = controller
        selectionPan.cancelsTouchesInView = true
        mapView.addGestureRecognizer(selectionPan)

        let identifyTap = UITapGestureRecognizer(
            target: controller,
            action: #selector(MapController.handleIdentifyTap(_:))
        )
        identifyTap.name = MapController.identifyTapName
        identifyTap.delegate = controller
        // Not consumed: MapKit's own recognizers still need this touch, and a
        // tap that identified a parcel while swallowing the map's handling of
        // it would make the map feel dead under the finger.
        identifyTap.cancelsTouchesInView = false
        // A double tap zooms. Waiting for MapKit's own double-tap recognizers
        // to fail is what stops a zoom from also identifying whatever happened
        // to be under the first tap — the web spends 250 ms guessing at the
        // same thing.
        for recognizer in mapView.gestureRecognizers ?? [] {
            guard let tap = recognizer as? UITapGestureRecognizer,
                  tap.numberOfTapsRequired > 1 else { continue }
            identifyTap.require(toFail: tap)
        }
        mapView.addGestureRecognizer(identifyTap)

        controller.mapView = mapView
        // Held until layout, then applied without animation. A link opened at
        // the same moment replaces it, which is the right order: the reader
        // asked for that position and did not ask for this one.
        controller.center(
            on: GeoPoint(lat: opening.latitude, lng: opening.longitude),
            zoom: opening.zoom,
            animated: false
        )
        return mapView
    }

    func updateUIView(_ uiView: MKMapView, context: Context) {
    }
}
