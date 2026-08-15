import Foundation

/// A raster the user brought in, and what is known about where it belongs.
public struct UserMapRecord: Identifiable, Hashable, Sendable, Codable {
    /// How the sheet is placed.
    public enum Placement: Hashable, Sendable {
        /// The file said so itself — a GeoTIFF's tags.
        case embedded(RasterProjection.EmbeddedGeoreference)
        /// The user said so, by clicking the same feature on the scan and on
        /// the map.
        case controlPoints([SessionControlPoint], method: GeoreferenceMethod)
    }

    public var id: String
    public var name: String
    /// The original raster's size, never a preview's.
    ///
    /// Control-point pixels live in these pixels. A preview's dimensions here
    /// would misplace every corner of any scan large enough to have been
    /// downscaled for display, and the arithmetic would look perfectly healthy
    /// while it did.
    public var pixelSize: PixelSize
    /// The part of the scan the user kept, when they cropped the margins off.
    public var sourceRect: PixelRect?
    public var placement: Placement

    public init(
        id: String,
        name: String,
        pixelSize: PixelSize,
        sourceRect: PixelRect? = nil,
        placement: Placement
    ) {
        self.id = id
        self.name = name
        self.pixelSize = pixelSize
        self.sourceRect = sourceRect
        self.placement = placement
    }

    /// The lattice this record draws through, or nil when it cannot be placed
    /// yet: fewer than three control points, a cloud too thin to determine a
    /// transform, or a transform the acceptance gates refuse. A spline adds
    /// two refusals of its own — two points on one pixel, and an interpolation
    /// system that comes out singular.
    ///
    /// Nil means draw nothing. It never means draw at the origin.
    ///
    /// This, and not the georeferencing session, is what a saved layer draws
    /// through. The session's own lattice lives only as long as the panel is
    /// open, so a version here that ignored the method would show the user a
    /// spline while they edited and snap the layer back to an affine the
    /// moment they closed the panel — with the panel's own tests still green.
    public var mesh: [[GeoPoint]]? {
        switch placement {
        case .embedded(let georeference):
            return try? RasterProjection.latLngMesh(
                georeference, pixelSize: pixelSize, sourceRect: sourceRect
            )
        case .controlPoints(let points, let method):
            let controls = points.map(\.control)
            // Below the bending threshold the spline is the affine through the
            // same points — measured at a nanometre — so the dense lattice
            // buys nothing and costs two thousand clipped full-image draws per
            // redraw in place of two. A record reaches that state by having a
            // point deleted after the warp was chosen, at which point the user
            // cannot switch back.
            if method == .spline,
               controls.count >= ThinPlateSpline.minimumBendingControlPoints {
                guard let spline = try? ThinPlateSpline.solve(controlPoints: controls)
                else { return nil }
                return try? GcpMesh.latLngMesh(
                    spline, pixelSize: pixelSize, sourceRect: sourceRect
                )
            }
            guard let transform = AffineFit.solve(controlPoints: controls)
            else { return nil }
            return try? GcpMesh.latLngMesh(
                transform, pixelSize: pixelSize, sourceRect: sourceRect
            )
        }
    }

    /// The lattice's grid size — one fewer than the rows `mesh` returns.
    ///
    /// Stated here, beside the branch that chooses it, because the renderer
    /// has to build a *pixel* lattice of the same shape to pair with it. A
    /// caller that guessed would pair a 33-row ground mesh against a 9-row
    /// pixel one, and the honest thing a renderer can do with that is refuse
    /// to draw — a sheet that vanishes when the user switches to a spline.
    public var meshGridSize: Int {
        switch placement {
        case .embedded:
            return RasterProjection.embeddedGridSize
        case .controlPoints(let points, let method):
            return method == .spline
                && points.count >= ThinPlateSpline.minimumBendingControlPoints
                ? GcpMesh.splineGridSize
                : GcpMesh.affineGridSize
        }
    }

    /// Whether this record still needs a user to place it.
    ///
    /// True exactly when there is no lattice to draw. Derived from the same
    /// answer rather than from a second rule, so a record cannot be badged as
    /// placed while nothing draws, or badged as unplaced while a sheet is on
    /// the screen.
    public var needsGeoreferencing: Bool { mesh == nil }
}
