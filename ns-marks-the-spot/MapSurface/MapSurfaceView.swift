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

        // Where the reader left off, or a link they just opened, and otherwise
        // the web's opening view rather than a province-wide one: both surfaces
        // open on Cape Breton at zoom 9, so a reader who has one open beside
        // the other is looking at the same ground before touching anything.
        //
        // The span is the same arithmetic done in advance. A zoom is a count of
        // tiles across the view, so turning one into a region needs a width the
        // view does not have yet, which is what the call below waits for — but
        // every zoom level past the opening one halves the span, and the
        // opening span is known. What it assumes is that the first frame is
        // about as wide as the one that constant was measured on. What it buys
        // is a reader who left the map at street level not watching it fall
        // from the county and settle.
        let held = controller.heldPosition
        let opening = held ?? MapPosition.default
        let delta = 1.1 * pow(2, Double(MapPosition.default.zoom - opening.zoom))
        mapView.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: opening.latitude, longitude: opening.longitude
            ),
            span: MKCoordinateSpan(latitudeDelta: delta, longitudeDelta: delta)
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

        // Press-and-hold places a point while a drawing tool is armed. It
        // yields to MapKit over annotation views (the delegate refuses it
        // there), because press-and-hold on a handle is a drag.
        let placeLongPress = UILongPressGestureRecognizer(
            target: controller,
            action: #selector(MapController.handlePlaceLongPress(_:))
        )
        placeLongPress.name = MapController.placeLongPressName
        placeLongPress.minimumPressDuration = 0.45
        placeLongPress.delegate = controller
        placeLongPress.cancelsTouchesInView = false
        mapView.addGestureRecognizer(placeLongPress)

        controller.mapView = mapView
        // Held until layout, then applied without animation. Skipped when
        // something is already held: a link or a resumed session asked for that
        // position, and asking again for this one would overwrite it with the
        // view of the province nobody asked for.
        if held == nil {
            controller.center(
                on: GeoPoint(lat: opening.latitude, lng: opening.longitude),
                zoom: opening.zoom,
                animated: false
            )
        }
        return mapView
    }

    func updateUIView(_ uiView: MKMapView, context: Context) {
    }
}
