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

        let selectionPan = UIPanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleSelectionPan(_:))
        )
        selectionPan.name = "BoundsSelectionPan"
        selectionPan.delegate = context.coordinator
        selectionPan.cancelsTouchesInView = true
        mapView.addGestureRecognizer(selectionPan)

        engine.mapView = mapView
        return mapView
    }

    func updateUIView(_ uiView: MKMapView, context: Context) {
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(engine: engine)
    }

    final class Coordinator: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {
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
            if let polygon = overlay as? MKPolygon {
                let renderer = MKPolygonRenderer(polygon: polygon)
                renderer.fillColor = UIColor.systemBlue.withAlphaComponent(0.15)
                renderer.strokeColor = .systemBlue
                renderer.lineWidth = 2
                return renderer
            }

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

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            engine?.isSelectingBounds == true
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            false
        }

        @objc func handleSelectionPan(_ recognizer: UIPanGestureRecognizer) {
            guard let mapView = recognizer.view as? MKMapView,
                  let engine else { return }

            let point = recognizer.location(in: mapView)
            let coordinate = mapView.convert(point, toCoordinateFrom: mapView)

            switch recognizer.state {
            case .began:
                engine.selectionStartCoordinate = coordinate
                engine.updateSelectionOverlay(from: coordinate, to: coordinate)
            case .changed:
                guard let start = engine.selectionStartCoordinate else { return }
                engine.updateSelectionOverlay(from: start, to: coordinate)
            case .ended:
                guard let start = engine.selectionStartCoordinate else { return }
                let bounds = MapBounds(
                    minLatitude: min(start.latitude, coordinate.latitude),
                    minLongitude: min(start.longitude, coordinate.longitude),
                    maxLatitude: max(start.latitude, coordinate.latitude),
                    maxLongitude: max(start.longitude, coordinate.longitude)
                )
                engine.boundsSelectionHandler?(bounds.normalized)
                engine.endBoundsSelection()
            case .cancelled, .failed:
                engine.endBoundsSelection()
            default:
                break
            }
        }
    }
}
