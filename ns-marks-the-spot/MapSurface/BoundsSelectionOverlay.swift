import MapKit
import UIKit

/// The rectangle being dragged during offline-area selection.
///
/// One persistent overlay whose renderer redraws as the corners move, instead
/// of a fresh `MKPolygon` removed and re-added on every pan event — which was
/// an allocation, a renderer creation and an overlay-churn pass per touch
/// move, up to 120 times a second on ProMotion devices, for what is a single
/// stretching rectangle.
nonisolated final class BoundsSelectionOverlay: NSObject, MKOverlay {
    /// Corners in map points, written by the gesture on the main actor and
    /// read by the renderer on MapKit's background drawing queues.
    private let lock = NSLock()
    private var corners: (start: MKMapPoint, end: MKMapPoint)?

    /// The whole world: any dragged rectangle is inside the declared region,
    /// so moving a corner never needs a new overlay, only a redraw. Fine for
    /// an interaction affordance that exists only during the drag.
    var boundingMapRect: MKMapRect { .world }
    var coordinate: CLLocationCoordinate2D {
        MKMapPoint(x: MKMapRect.world.midX, y: MKMapRect.world.midY).coordinate
    }

    func set(start: CLLocationCoordinate2D, end: CLLocationCoordinate2D) {
        lock.lock()
        corners = (MKMapPoint(start), MKMapPoint(end))
        lock.unlock()
    }

    var currentRect: MKMapRect? {
        lock.lock()
        defer { lock.unlock() }
        guard let corners else { return nil }
        return MKMapRect(
            x: min(corners.start.x, corners.end.x),
            y: min(corners.start.y, corners.end.y),
            width: abs(corners.end.x - corners.start.x),
            height: abs(corners.end.y - corners.start.y)
        )
    }
}

/// Draws the rectangle in the same blue the old per-event polygon used.
nonisolated final class BoundsSelectionRenderer: MKOverlayRenderer {
    private let selection: BoundsSelectionOverlay

    init(selection: BoundsSelectionOverlay) {
        self.selection = selection
        super.init(overlay: selection)
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        guard let mapRectToDraw = selection.currentRect,
              mapRectToDraw.size.width > 0 || mapRectToDraw.size.height > 0
        else { return }
        let drawRect = rect(for: mapRectToDraw)
        context.setFillColor(UIColor.systemBlue.withAlphaComponent(0.15).cgColor)
        context.fill(drawRect)
        context.setStrokeColor(UIColor.systemBlue.cgColor)
        context.setLineWidth(zoomScale > 0 ? 2 / zoomScale : 2)
        context.stroke(drawRect)
    }
}
