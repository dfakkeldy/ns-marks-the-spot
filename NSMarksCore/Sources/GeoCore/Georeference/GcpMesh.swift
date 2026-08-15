import Foundation

/// The raster's size in its own pixels.
public struct PixelSize: Hashable, Sendable {
    public var width: Double
    public var height: Double

    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }
}

/// A rectangle of the raster, in the same pixels — the part of a scan the user
/// kept, when they cropped the margins off a sheet.
public struct PixelRect: Hashable, Sendable {
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

/// Lattices of ground positions over a raster, one vertex per grid node.
///
/// Ported from `web/src/userMaps/transform/gcpMesh.ts`, including the two grid
/// sizes and the reasons they are what they are. The measurements quoted in
/// those comments were taken in a browser and are carried across as the record
/// of why the numbers were chosen; they are not claims about this renderer,
/// which draws the mesh through a different path and will need its own.
public enum GcpMesh {
    /// Why a lattice cannot be built.
    public enum MeshRefusal: Error, Equatable, Sendable {
        /// Not a rectangle: a non-finite edge, or no area.
        case degenerate
        /// Asks for pixels the raster does not have.
        case outsideRaster
        /// A grid size below one. Silently rounding it up to a single cell
        /// would throw away a spline's whole bending term — a hundred metres
        /// on a county-scale sheet — and report success.
        case notALattice
    }

    /// How far outside the raster an edge may sit and still be read as sitting
    /// on it. A crop expressed as a fraction of the width lands a hair past the
    /// last pixel often enough that refusing it would refuse ordinary work.
    static let edgeTolerancePixels = 1e-7

    /// One cell, two triangles — and that is exact, not an approximation.
    ///
    /// The screen's space is Web Mercator scaled and translated, so a
    /// pixel-to-Mercator affine composes with it into a map that is still
    /// affine all the way to the canvas. There is no curvature for a denser
    /// lattice to absorb. (An embedded-GeoTIFF path needs more, because it goes
    /// pixel to UTM to WGS 84 to Mercator, and UTM to Mercator genuinely
    /// curves.)
    ///
    /// It is also the performance answer: the georeferencer re-solves on every
    /// touch move during a drag, and each cell costs two clipped draws over the
    /// whole preview.
    public static let affineGridSize = 1

    /// Coarse tier for a spline mesh while a control point is being dragged.
    ///
    /// On the web, at 16 the mesh error measured 44.3/10.9/15.9 ground metres
    /// (max, over three real Church control sets) and re-solving stayed inside
    /// a 16 ms frame up to 300 control points. That budget is what chose 16.
    ///
    /// Error is not monotone in grid size: measured, 12 beat 16 (43.87 m vs
    /// 44.28 m) and 24 beat 32 (17.70 m vs 17.78 m) on those same sets, because
    /// lattice vertices landing near control points locally cancel error.
    /// Nothing here may be read as "denser is always better".
    public static let splineDragGridSize = 16

    /// Settled tier, once the pointer stops moving.
    ///
    /// On the web, 64 bought 6.0/1.1/2.0 m of mesh error against 32's
    /// 17.70–17.78 m and cost about 3.5x the time-to-sharp after every zoom
    /// settle and about 3.6x the block on every control-point release. Per the
    /// non-monotonicity above, 64 is not even a local optimum — 24 measured
    /// slightly better.
    ///
    /// What would actually move this number is not the number: per-triangle
    /// cost is dominated by source size, not triangle count. Same destination
    /// and same triangle count, varying only the source, the web measured
    /// 7.1 Mpx at 13 ms against 9.7 Mpx at 587 ms — a roughly 45x cliff where
    /// the source stops fitting the GPU image cache and every clipped draw
    /// re-uploads it. Real scanned sheets are always past that cliff, so
    /// drawing from a resolution-appropriate downscale is the lever, and it is
    /// separate work.
    public static let splineGridSize = 32

    /// The rectangle to evaluate over: the one given, checked against the
    /// raster, or the whole raster when none was given.
    public static func resolve(
        pixelSize: PixelSize, sourceRect: PixelRect?
    ) throws(MeshRefusal) -> PixelRect {
        let rect = sourceRect ?? PixelRect(
            x: 0, y: 0, width: pixelSize.width, height: pixelSize.height
        )
        let edges = [rect.x, rect.y, rect.width, rect.height,
                     pixelSize.width, pixelSize.height]
        guard edges.allSatisfy(\.isFinite), rect.width > 0, rect.height > 0 else {
            throw .degenerate
        }
        guard rect.x >= -Self.edgeTolerancePixels,
              rect.y >= -Self.edgeTolerancePixels,
              rect.x + rect.width <= pixelSize.width + Self.edgeTolerancePixels,
              rect.y + rect.height <= pixelSize.height + Self.edgeTolerancePixels
        else {
            throw .outsideRaster
        }
        // Clamped rather than trusted: the tolerance above admits an edge a
        // hair outside the raster, and sampling there would read pixels that
        // do not exist.
        let x = min(max(0, rect.x), pixelSize.width)
        let y = min(max(0, rect.y), pixelSize.height)
        let width = min(rect.width, pixelSize.width - x)
        let height = min(rect.height, pixelSize.height - y)
        // A crop narrower than the tolerance, sitting a hair past the right or
        // bottom edge, passes the check above and clamps to a negative extent —
        // a lattice that runs backwards out of the raster. There is no
        // rectangle there to evaluate, so it is refused rather than drawn.
        guard width > 0, height > 0 else { throw .outsideRaster }
        return PixelRect(x: x, y: y, width: width, height: height)
    }

    /// Lattice of ground positions for an affine warp.
    ///
    /// Row is pixel Y and column is pixel X, so a renderer can consume either
    /// this or the spline mesh without knowing which solver produced it.
    public static func latLngMesh(
        _ transform: AffineTransform,
        pixelSize: PixelSize,
        gridSize: Int = affineGridSize,
        sourceRect: PixelRect? = nil
    ) throws(MeshRefusal) -> [[GeoPoint]] {
        try mesh(pixelSize: pixelSize, gridSize: gridSize, sourceRect: sourceRect) {
            transform.apply(x: $0, y: $1)
        }
    }

    /// Lattice of ground positions for a spline warp.
    ///
    /// Unlike the affine mesh, a spline surface is not affine anywhere — the
    /// bending term means straight lines in pixel space do not stay straight —
    /// so one cell cannot represent it and a real lattice is required rather
    /// than merely offered.
    public static func latLngMesh(
        _ spline: ThinPlateSpline,
        pixelSize: PixelSize,
        gridSize: Int = splineGridSize,
        sourceRect: PixelRect? = nil
    ) throws(MeshRefusal) -> [[GeoPoint]] {
        try mesh(pixelSize: pixelSize, gridSize: gridSize, sourceRect: sourceRect) {
            spline.apply(x: $0, y: $1)
        }
    }

    private static func mesh(
        pixelSize: PixelSize,
        gridSize: Int,
        sourceRect: PixelRect?,
        project: (Double, Double) -> MercatorPoint
    ) throws(MeshRefusal) -> [[GeoPoint]] {
        // A lattice needs at least the one cell the affine tier uses; zero
        // would divide by zero and a negative would produce nothing at all.
        guard gridSize >= 1 else { throw .notALattice }
        let rect = try resolve(pixelSize: pixelSize, sourceRect: sourceRect)
        let steps = gridSize
        return (0...steps).map { row in
            let y = rect.y + rect.height * Double(row) / Double(steps)
            return (0...steps).map { col in
                let x = rect.x + rect.width * Double(col) / Double(steps)
                return WebMercator.unproject(project(x, y))
            }
        }
    }
}
