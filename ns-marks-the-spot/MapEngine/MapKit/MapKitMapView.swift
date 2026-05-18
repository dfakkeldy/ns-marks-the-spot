import MapKit
import SwiftUI

struct MapKitMapView: UIViewRepresentable {
    let engine: MapKitEngine

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator

        let center = CLLocationCoordinate2D(latitude: 44.68, longitude: -63.74)
        let span = MKCoordinateSpan(latitudeDelta: 5, longitudeDelta: 5)
        mapView.region = MKCoordinateRegion(center: center, span: span)

        engine.mapView = mapView
        return mapView
    }

    func updateUIView(_ uiView: MKMapView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let tileOverlay = overlay as? OpacityTileOverlay else {
                return MKOverlayRenderer(overlay: overlay)
            }
            let renderer = MKTileOverlayRenderer(tileOverlay: tileOverlay)
            renderer.alpha = tileOverlay.mapLayer?.opacity ?? 1.0
            tileOverlay.renderer = renderer
            return renderer
        }
    }
}
