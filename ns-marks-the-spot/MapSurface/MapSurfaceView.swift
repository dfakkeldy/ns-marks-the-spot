import MapKit
import SwiftUI

struct MapSurfaceView: UIViewRepresentable {
    let controller: MapController

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = controller
        mapView.accessibilityLabel = "Map of Nova Scotia"
        mapView.showsCompass = false

        let center = CLLocationCoordinate2D(latitude: 44.68, longitude: -63.74)
        let span = MKCoordinateSpan(latitudeDelta: 5.0, longitudeDelta: 5.0)
        mapView.region = MKCoordinateRegion(center: center, span: span)

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
        return mapView
    }

    func updateUIView(_ uiView: MKMapView, context: Context) {
    }
}
