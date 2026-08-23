import Foundation
import GeoCore

/// Where the export frame sits over the live map, and what ground it covers.
///
/// Ported from `web/src/print/pdf/frameGeometry.ts`. The frame is dragged and
/// resized on screen, and the bounds it turns into are what the exported page
/// claims to show — so the two have to be the same arithmetic on both surfaces
/// or the same drag would export different ground.
public enum PrintFrameGeometry {
    /// How the reader has placed the frame.
    ///
    /// `scale` is a fraction of the container's limiting dimension; the offsets
    /// are drag distances in points from the container's centre.
    public struct FrameState: Hashable, Sendable {
        public var orientation: PdfTemplate.ID
        public var scale: Double
        public var offsetX: Double
        public var offsetY: Double

        public init(
            orientation: PdfTemplate.ID = .landscape,
            scale: Double = 0.7,
            offsetX: Double = 0,
            offsetY: Double = 0
        ) {
            self.orientation = orientation
            self.scale = scale
            self.offsetX = offsetX
            self.offsetY = offsetY
        }

        public static let `default` = FrameState()
    }

    public struct ScreenRect: Hashable, Sendable {
        public var x: Double
        public var y: Double
        public var width: Double
        public var height: Double
    }

    public static let minimumScale = 0.25
    public static let maximumScale = 0.95

    /// The frame's rectangle on screen, kept inside the container.
    ///
    /// `scale` is a fraction of the largest frame of this aspect that the
    /// container can hold, not of the container's height. On a wide screen the
    /// two are the same thing, which is why the browser could use the height.
    /// On a phone they are not: a portrait page is taller than it is wide, but
    /// so is the screen, so height alone puts every scale above about 0.4 hard
    /// against the side of the display — the handle then moves nothing for most
    /// of its travel and the reader concludes it is broken. Fitting to the
    /// limiting dimension makes the whole range of the drag do something on
    /// every screen, and leaves the printed aspect untouched either way.
    public static func screenRect(
        container: (width: Double, height: Double),
        aspect: Double,
        state: FrameState
    ) -> ScreenRect {
        let scale = min(maximumScale, max(minimumScale, state.scale))
        let fitted = fittedHeight(container: container, aspect: aspect)
        var height = fitted * scale
        var width = height * aspect
        if width > container.width * maximumScale {
            width = container.width * maximumScale
            height = width / aspect
        }
        let x = container.width / 2 - width / 2 + state.offsetX
        let y = container.height / 2 - height / 2 + state.offsetY
        return ScreenRect(
            x: max(0, min(container.width - width, x)),
            y: max(0, min(container.height - height, y)),
            width: width,
            height: height
        )
    }

    /// The height of the largest frame of this aspect the container can hold —
    /// the dimension `FrameState.scale` is a fraction of.
    public static func fittedHeight(
        container: (width: Double, height: Double), aspect: Double
    ) -> Double {
        min(container.height, container.width / aspect)
    }

    /// The scale a resize drag lands on, clamped the same way `screenRect`
    /// clamps what it is handed, so a drag cannot leave the frame in a state
    /// the next layout has to rescue.
    ///
    /// The drag is divided by the same fitted dimension the scale is a fraction
    /// of, so the frame edge tracks the finger. Dividing by the container's full
    /// height — which is what the browser does, and what is correct there
    /// because on a wide screen the two are the same number — makes the handle
    /// travel a fraction of the drag on a phone in landscape paper, where the
    /// width is the limit; it then reads as broken rather than slow.
    public static func scaleAfterResizeDrag(
        startScale: Double,
        deltaY: Double,
        containerFit: Double
    ) -> Double {
        guard containerFit > 0 else { return min(maximumScale, max(minimumScale, startScale)) }
        return min(maximumScale, max(minimumScale, startScale + deltaY / containerFit))
    }

    /// Drag offsets held to the travel the frame actually has.
    ///
    /// `screenRect` already refuses to put the frame outside the container, but
    /// it clamps what it draws, not what is stored. Without this the offset goes
    /// on accumulating past the edge, and the reader who overshoots has to drag
    /// all the way back through that invisible surplus before the frame moves
    /// again — which reads as the frame having stuck.
    public static func clampedOffsets(
        _ state: FrameState,
        container: (width: Double, height: Double),
        aspect: Double
    ) -> FrameState {
        let rect = screenRect(container: container, aspect: aspect, state: state)
        let travelX = max(0, (container.width - rect.width) / 2)
        let travelY = max(0, (container.height - rect.height) / 2)
        var clamped = state
        clamped.offsetX = min(travelX, max(-travelX, state.offsetX))
        clamped.offsetY = min(travelY, max(-travelY, state.offsetY))
        return clamped
    }

    /// The ground the frame covers, using the same spherical-Mercator scale the
    /// map is drawn at, so the export shows exactly what was framed.
    ///
    /// `rect` is in screen points with y running down from the container's top,
    /// which is what both a `MKMapView` and a browser hand out.
    public static func bounds(
        forFrame rect: ScreenRect,
        container: (width: Double, height: Double),
        center: GeoPoint,
        zoom: Double
    ) -> GeoBoundingBox {
        let metresPerPoint = (2 * TileMath.webMercatorWorldExtent) / (256 * pow(2, zoom))
        let centre = WebMercator.project(center)
        let west = centre.x + (rect.x - container.width / 2) * metresPerPoint
        let east = west + rect.width * metresPerPoint
        let north = centre.y + (container.height / 2 - rect.y) * metresPerPoint
        let south = north - rect.height * metresPerPoint
        let northWest = WebMercator.unproject(MercatorPoint(x: west, y: north))
        let southEast = WebMercator.unproject(MercatorPoint(x: east, y: south))
        return GeoBoundingBox(
            south: southEast.lat,
            west: northWest.lng,
            north: northWest.lat,
            east: southEast.lng
        )
    }
}
