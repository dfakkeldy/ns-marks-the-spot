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

        controller.mapView = mapView
        return mapView
    }

    func updateUIView(_ uiView: MKMapView, context: Context) {
    }
}
