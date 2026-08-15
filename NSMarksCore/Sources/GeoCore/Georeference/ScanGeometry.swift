import Foundation

/// Where a point on the scan pane is, in the raster's own pixels, and back.
///
/// The web does this with a Leaflet CRS whose whole job is the y-flip; there is
/// no map engine under the scan pane here, so the fit is arithmetic. It lives
/// in GeoCore rather than in the view because it is the step that decides which
/// pixel of the sheet a user's finger meant, and a sign error in it places
/// every control point somewhere the user did not tap — while the panel, the
/// residuals and the drape all agree with each other about the wrong answer.
///
/// Everything here is in ORIGINAL raster pixels, never the preview's. Control
/// points are recorded in those, and a preview is a display convenience that
/// can change size without changing where anything is.
public enum ScanGeometry {
    /// A rectangle in the pane's own coordinates.
    public struct PaneRect: Hashable, Sendable {
        public var x: Double
        public var y: Double
        public var width: Double
        public var height: Double

        public init(x: Double, y: Double, width: Double, height: Double) {
            self.x = x
            self.y = y
            self.width = width
            self.height = height
        }
    }

    /// The largest centred rectangle of `pane` with the raster's aspect ratio.
    ///
    /// Nil when either side has no size: a pane before layout, or a raster
    /// that claims no pixels. Returning a zero rectangle instead would divide
    /// by zero one line later, in the mapping, where the answer would be a
    /// coordinate rather than an error.
    public static func fitted(_ pixelSize: PixelSize, in pane: PaneRect) -> PaneRect? {
        guard pixelSize.width > 0, pixelSize.height > 0,
              pane.width > 0, pane.height > 0,
              pixelSize.width.isFinite, pixelSize.height.isFinite,
              pane.width.isFinite, pane.height.isFinite
        else { return nil }
        let scale = min(pane.width / pixelSize.width, pane.height / pixelSize.height)
        let width = pixelSize.width * scale
        let height = pixelSize.height * scale
        return PaneRect(
            x: pane.x + (pane.width - width) / 2,
            y: pane.y + (pane.height - height) / 2,
            width: width, height: height
        )
    }

    /// The raster pixel under a point in the pane, clamped to the raster.
    ///
    /// Clamped rather than refused: a tap a few points outside the image is a
    /// user aiming at its very edge, which is where the corner features they
    /// are pinning tend to be. Nothing downstream would reject a negative
    /// pixel — the solver takes it as ordinary input and it persists into the
    /// saved record — so the edge is enforced here.
    public static func pixel(
        at point: (x: Double, y: Double), pixelSize: PixelSize, fitted: PaneRect
    ) -> PixelPoint? {
        guard fitted.width > 0, fitted.height > 0,
              point.x.isFinite, point.y.isFinite
        else { return nil }
        return clampToRaster(
            PixelPoint(
                x: (point.x - fitted.x) / fitted.width * pixelSize.width,
                y: (point.y - fitted.y) / fitted.height * pixelSize.height
            ),
            pixelSize: pixelSize
        )
    }

    /// Where a control point sits in the pane, for drawing its marker.
    public static func point(
        for pixel: PixelPoint, pixelSize: PixelSize, fitted: PaneRect
    ) -> (x: Double, y: Double)? {
        guard pixelSize.width > 0, pixelSize.height > 0 else { return nil }
        return (
            x: fitted.x + pixel.x / pixelSize.width * fitted.width,
            y: fitted.y + pixel.y / pixelSize.height * fitted.height
        )
    }

    public static func clampToRaster(
        _ pixel: PixelPoint, pixelSize: PixelSize
    ) -> PixelPoint {
        PixelPoint(
            x: min(max(pixel.x, 0), pixelSize.width),
            y: min(max(pixel.y, 0), pixelSize.height)
        )
    }
}
