import MapKit
import SwiftUI

struct MapKitMapView: UIViewRepresentable {
    let engine: MapKitEngine

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.accessibilityLabel = "Map of Nova Scotia"
        mapView.showsCompass = false

        let center = CLLocationCoordinate2D(latitude: 44.68, longitude: -63.74)
        let span = MKCoordinateSpan(latitudeDelta: 5.0, longitudeDelta: 5.0)
        mapView.region = MKCoordinateRegion(center: center, span: span)

        engine.mapView = mapView
        return mapView
    }

    func updateUIView(_ uiView: MKMapView, context: Context) {
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(engine: engine)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        weak var engine: MapKitEngine?

        init(engine: MapKitEngine) {
            self.engine = engine
        }

        func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
            let heading = mapView.camera.heading
            engine?.mapHeading = heading
            engine?.headingChangeHandler?(heading)
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let tileOverlay = overlay as? OpacityTileOverlay else {
                return MKOverlayRenderer(overlay: overlay)
            }
            let renderer = MKTileOverlayRenderer(tileOverlay: tileOverlay)
            if let layer = tileOverlay.mapLayer {
                renderer.alpha = layer.isVisible ? layer.opacity : 0.0
            } else {
                renderer.alpha = 1.0
            }
            tileOverlay.renderer = renderer
            return renderer
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard !(annotation is MKUserLocation) else { return nil }
            guard annotation is MKPointAnnotation else { return nil }

            let identifier = "POIAnnotation"
            let view: MKMarkerAnnotationView
            if let dequeued = mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? MKMarkerAnnotationView {
                dequeued.annotation = annotation
                view = dequeued
            } else {
                view = MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: identifier)
            }
            view.canShowCallout = true
            view.markerTintColor = .systemRed
            view.glyphImage = UIImage(systemName: "mappin")
            return view
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            guard let point = view.annotation as? MKPointAnnotation,
                  let id = point.subtitle else { return }
            engine?.handleAnnotationSelected(id: id)
        }
    }
}
