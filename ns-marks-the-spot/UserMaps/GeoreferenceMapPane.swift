import CoreGraphics
import GeoCore
import MapKit
import SwiftUI

/// A request to bring one place to the middle of a pane.
///
/// Carries a number that goes up on every request, so asking for the *same*
/// point twice still moves the pane: the view compares requests by value, and a
/// bare coordinate would be equal the second time and do nothing.
struct PaneFocusRequest: Equatable {
    var requestID: Int
}

/// The placement as it stands right now, for drawing under the markers.
///
/// The mesh and the lattice it was built on travel together — pairing a ground
/// mesh against a pixel lattice of another shape draws nothing at all, and the
/// lattice changes tier while a finger is down.
struct GeoreferenceDraft: Equatable {
    var mesh: [[GeoPoint]]
    var gridSize: Int
    var pixelSize: PixelSize
    var sourceRect: PixelRect?
    var image: CGImage

    static func == (lhs: GeoreferenceDraft, rhs: GeoreferenceDraft) -> Bool {
        lhs.mesh == rhs.mesh && lhs.gridSize == rhs.gridSize
            && lhs.pixelSize == rhs.pixelSize && lhs.sourceRect == rhs.sourceRect
            && lhs.image === rhs.image
    }
}

/// The map half of the georeferencer: the ground the scan is being placed on,
/// the scan drawn where it currently lands, and a numbered draggable marker per
/// control point.
///
/// Its own map rather than the app's: a tap here means one thing only, and a
/// tap that might instead have selected a parcel would place control points by
/// accident.
struct GeoreferenceMapPane: UIViewRepresentable {
    @Binding var region: MKCoordinateRegion
    let points: [SessionControlPoint]
    let pending: GeoreferenceSession.Pending?
    /// Nil while the points cannot place the sheet. Nothing is drawn then,
    /// which is the honest picture: there is no placement to look at yet.
    let draft: GeoreferenceDraft?
    let focus: (point: GeoPoint, request: PaneFocusRequest)?
    let onTap: (CLLocationCoordinate2D) -> Void
    let onDragBegin: (String) -> Void
    let onMove: (String, CLLocationCoordinate2D) -> Void
    let onDragEnd: (String) -> Void

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.setRegion(region, animated: false)
        mapView.delegate = context.coordinator
        mapView.showsCompass = false
        let tap = UITapGestureRecognizer(
            target: context.coordinator, action: #selector(Coordinator.handleTap(_:))
        )
        mapView.addGestureRecognizer(tap)
        context.coordinator.mapView = mapView
        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        context.coordinator.onTap = onTap
        context.coordinator.onDragBegin = onDragBegin
        context.coordinator.onMove = onMove
        context.coordinator.onDragEnd = onDragEnd
        context.coordinator.apply(points: points, pending: pending)
        context.coordinator.apply(draft: draft)
        context.coordinator.apply(focus: focus)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onTap: onTap, onDragBegin: onDragBegin, onMove: onMove, onDragEnd: onDragEnd)
    }

    /// One control point on the ground, carrying the id the session knows it by
    /// and the number the user reads.
    nonisolated final class GcpAnnotation: MKPointAnnotation {
        let pointID: String
        var number: Int?

        init(pointID: String, number: Int?) {
            self.pointID = pointID
            self.number = number
            super.init()
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var onTap: (CLLocationCoordinate2D) -> Void
        var onDragBegin: (String) -> Void
        var onMove: (String, CLLocationCoordinate2D) -> Void
        var onDragEnd: (String) -> Void
        weak var mapView: MKMapView?

        private var annotations: [String: GcpAnnotation] = [:]
        private var pendingAnnotation: GcpAnnotation?
        private var draftOverlay: UserMapOverlay?
        private var lastDraft: GeoreferenceDraft?
        private var lastFocus: PaneFocusRequest?
        /// The point currently under a finger. Its coordinate is not written
        /// back from state while the drag is live: the finger is the authority,
        /// and echoing the state back would fight it a frame later.
        private var draggingID: String?

        init(
            onTap: @escaping (CLLocationCoordinate2D) -> Void,
            onDragBegin: @escaping (String) -> Void,
            onMove: @escaping (String, CLLocationCoordinate2D) -> Void,
            onDragEnd: @escaping (String) -> Void
        ) {
            self.onTap = onTap
            self.onDragBegin = onDragBegin
            self.onMove = onMove
            self.onDragEnd = onDragEnd
        }

        @objc func handleTap(_ recognizer: UITapGestureRecognizer) {
            guard let mapView else { return }
            let point = recognizer.location(in: mapView)
            // A tap that landed on a marker is aimed at that marker, not at the
            // ground behind it. Without this, reaching for a point places a new
            // one on top of it — two controls on the same spot, which the
            // spline then refuses.
            var hit = mapView.hitTest(point, with: nil)
            while let view = hit {
                if view is MKAnnotationView { return }
                hit = view.superview
            }
            onTap(mapView.convert(point, toCoordinateFrom: mapView))
        }

        /// Coordinates have no equality of their own, and this only needs to
        /// know whether a write would move the marker at all.
        private static func same(
            _ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D
        ) -> Bool {
            a.latitude == b.latitude && a.longitude == b.longitude
        }

        func apply(points: [SessionControlPoint], pending: GeoreferenceSession.Pending?) {
            guard let mapView else { return }
            var live = Set<String>()
            for (index, point) in points.enumerated() {
                live.insert(point.id)
                let coordinate = CLLocationCoordinate2D(
                    latitude: point.map.lat, longitude: point.map.lng
                )
                if let existing = annotations[point.id] {
                    if existing.number != index + 1 {
                        existing.number = index + 1
                        mapView.view(for: existing)?.image = GcpMarkerImage.image(
                            number: index + 1
                        )
                    }
                    // Never while this one is being dragged: the finger owns
                    // its position until it lifts.
                    if point.id != draggingID, !Self.same(existing.coordinate, coordinate) {
                        existing.coordinate = coordinate
                    }
                } else {
                    let annotation = GcpAnnotation(pointID: point.id, number: index + 1)
                    annotation.coordinate = coordinate
                    annotations[point.id] = annotation
                    mapView.addAnnotation(annotation)
                }
            }
            for (id, annotation) in annotations where !live.contains(id) {
                mapView.removeAnnotation(annotation)
                annotations[id] = nil
                // A point deleted mid-drag — by an undo — takes the drag with
                // it. Otherwise no end ever arrives and the sheet stays on the
                // coarse lattice for the rest of the session.
                if id == draggingID { draggingID = nil }
            }

            let pendingCoordinate: CLLocationCoordinate2D? = {
                if case .map(let ground) = pending {
                    return CLLocationCoordinate2D(latitude: ground.lat, longitude: ground.lng)
                }
                return nil
            }()
            if let pendingCoordinate {
                if let existing = pendingAnnotation {
                    existing.coordinate = pendingCoordinate
                } else {
                    let annotation = GcpAnnotation(pointID: "pending", number: nil)
                    annotation.coordinate = pendingCoordinate
                    pendingAnnotation = annotation
                    mapView.addAnnotation(annotation)
                }
            } else if let existing = pendingAnnotation {
                mapView.removeAnnotation(existing)
                pendingAnnotation = nil
            }
        }

        func apply(draft: GeoreferenceDraft?) {
            guard let mapView, draft != lastDraft else { return }
            lastDraft = draft
            if let draftOverlay {
                mapView.removeOverlay(draftOverlay)
                self.draftOverlay = nil
            }
            guard let draft,
                  let overlay = UserMapOverlay(
                      draftID: "georeference-draft",
                      mesh: draft.mesh,
                      pixelSize: draft.pixelSize,
                      gridSize: draft.gridSize,
                      sourceRect: draft.sourceRect,
                      image: draft.image,
                      // Part transparent so the ground the scan is being
                      // matched against stays readable underneath it. This is
                      // the working view, not the drape the panel controls.
                      alpha: 0.7
                  )
            else { return }
            draftOverlay = overlay
            mapView.addOverlay(overlay)
        }

        func apply(focus: (point: GeoPoint, request: PaneFocusRequest)?) {
            guard let mapView, let focus, focus.request != lastFocus else { return }
            lastFocus = focus.request
            let centre = CLLocationCoordinate2D(
                latitude: focus.point.lat, longitude: focus.point.lng
            )
            // Zoom in only, never back out: a user who has moved closer to
            // check a point must not be pulled away from what they are reading.
            let span = min(mapView.region.span.latitudeDelta, 0.02)
            mapView.setRegion(
                MKCoordinateRegion(
                    center: centre,
                    span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
                ),
                animated: true
            )
        }

        func mapView(
            _ mapView: MKMapView, rendererFor overlay: any MKOverlay
        ) -> MKOverlayRenderer {
            guard let userMap = overlay as? UserMapOverlay else {
                return MKOverlayRenderer(overlay: overlay)
            }
            return UserMapOverlayRenderer(userMap: userMap)
        }

        func mapView(
            _ mapView: MKMapView, viewFor annotation: any MKAnnotation
        ) -> MKAnnotationView? {
            guard let gcp = annotation as? GcpAnnotation else { return nil }
            let identifier = "gcp"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)
            view.annotation = annotation
            view.image = GcpMarkerImage.image(
                number: gcp.number, pending: gcp.number == nil
            )
            view.centerOffset = .zero
            // MapKit's own bubble says nothing this pane needs and would open
            // over the point the user is trying to place.
            view.canShowCallout = false
            // A half-placed point is a note to the user, not a handle: it has
            // no id in the session yet, so there is nothing to move.
            if gcp.number != nil {
                if view.gestureRecognizers?.isEmpty != false {
                    let pan = UIPanGestureRecognizer(
                        target: self, action: #selector(handleMarkerPan(_:))
                    )
                    view.addGestureRecognizer(pan)
                }
                view.isUserInteractionEnabled = true
            } else {
                view.isUserInteractionEnabled = false
            }
            return view
        }

        /// A pan of our own rather than MapKit's `isDraggable`.
        ///
        /// MapKit reports a dragged annotation once, when the finger lifts. The
        /// point of dragging a control point is watching the sheet move under
        /// it, so the position is read on every step and handed to the session,
        /// which is what puts it on the coarse lattice for the duration.
        @objc private func handleMarkerPan(_ recognizer: UIPanGestureRecognizer) {
            guard let mapView,
                  let view = recognizer.view as? MKAnnotationView,
                  let annotation = view.annotation as? GcpAnnotation
            else { return }
            let location = recognizer.location(in: mapView)
            let coordinate = mapView.convert(location, toCoordinateFrom: mapView)
            switch recognizer.state {
            case .began:
                draggingID = annotation.pointID
                onDragBegin(annotation.pointID)
            case .changed:
                guard draggingID == annotation.pointID else { return }
                annotation.coordinate = coordinate
                onMove(annotation.pointID, coordinate)
            case .ended, .cancelled, .failed:
                guard draggingID == annotation.pointID else { return }
                if recognizer.state == .ended {
                    annotation.coordinate = coordinate
                    onMove(annotation.pointID, coordinate)
                }
                draggingID = nil
                // The real end, never a timer: a drag released without a final
                // move would otherwise leave the sheet coarse for good.
                onDragEnd(annotation.pointID)
            default:
                break
            }
        }
    }
}
