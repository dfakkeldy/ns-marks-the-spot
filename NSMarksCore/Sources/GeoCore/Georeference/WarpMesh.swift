import Foundation

/// A point on the device's drawing surface, in device pixels.
public struct CanvasPoint: Hashable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// A rectangle of the drawing surface, in the same units as `CanvasPoint`.
public struct CanvasRect: Hashable, Sendable {
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

/// A source triangle and where on the canvas it goes.
public struct MeshTriangle: Hashable, Sendable {
    public var source: (PixelPoint, PixelPoint, PixelPoint)
    public var destination: (CanvasPoint, CanvasPoint, CanvasPoint)

    public init(
        source: (PixelPoint, PixelPoint, PixelPoint),
        destination: (CanvasPoint, CanvasPoint, CanvasPoint)
    ) {
        self.source = source
        self.destination = destination
    }

    public static func == (lhs: MeshTriangle, rhs: MeshTriangle) -> Bool {
        lhs.source == rhs.source && lhs.destination == rhs.destination
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(source.0)
        hasher.combine(source.1)
        hasher.combine(source.2)
        hasher.combine(destination.0)
        hasher.combine(destination.1)
        hasher.combine(destination.2)
    }
}

/// The geometry a warped raster is drawn through: the pixel-space lattice that
/// pairs with a ground mesh, the exact triangle-to-triangle transform each cell
/// half is drawn under, and the order the walk visits them in.
///
/// Ported from `web/src/userMaps/render/mesh.ts`. The drawing itself is not
/// here — that is Core Graphics in the app target, as it was canvas in the web
/// — but every number that decides where the ink lands is, because that is the
/// part that can be wrong in a way a screenshot does not show.
public enum WarpMesh {
    /// `X = a·x + c·y + e ; Y = b·x + d·y + f`.
    ///
    /// This is `CGAffineTransform(a:b:c:d:tx:ty:)` member for member, and the
    /// canvas `setTransform` order the web uses. Deliberately not `GeoCore`'s
    /// own `AffineTransform`, which orders its coefficients differently and
    /// means pixels-to-Mercator rather than pixels-to-screen; sharing one type
    /// between the two would make a transposition silent.
    public struct CanvasTransform: Hashable, Sendable {
        public var a: Double
        public var b: Double
        public var c: Double
        public var d: Double
        public var e: Double
        public var f: Double

        public init(a: Double, b: Double, c: Double, d: Double, e: Double, f: Double) {
            self.a = a
            self.b = b
            self.c = c
            self.d = d
            self.e = e
            self.f = f
        }

        public func apply(_ point: PixelPoint) -> CanvasPoint {
            CanvasPoint(x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f)
        }
    }

    /// How far each clip-path vertex is pushed out from its triangle's
    /// centroid, in device pixels.
    ///
    /// Neighbouring triangles share an edge, and a clip path drawn exactly on
    /// that edge leaves a hairline of background showing through where the two
    /// antialiased edges meet. Overlapping them by a couple of pixels covers
    /// the seam; the cost is that the shared strip is painted twice, which is
    /// why the walk's ordering has to be stable.
    public static let clipOverdrawDevicePixels = 2.0

    /// The exact affine taking one source triangle onto one destination
    /// triangle.
    ///
    /// Nil for a degenerate source triangle — three collinear lattice points,
    /// which a zero-area crop or a folded spline can produce. The web divides
    /// by the determinant regardless and gets infinities, which Core Graphics
    /// would take as a transform and paint nothing useful under.
    public static func transform(
        source: (PixelPoint, PixelPoint, PixelPoint),
        destination: (CanvasPoint, CanvasPoint, CanvasPoint)
    ) -> CanvasTransform? {
        let (s0, s1, s2) = source
        let (d0, d1, d2) = destination
        let u1 = s1.x - s0.x
        let v1 = s1.y - s0.y
        let u2 = s2.x - s0.x
        let v2 = s2.y - s0.y
        let determinant = u1 * v2 - u2 * v1
        guard determinant.isFinite, determinant != 0 else { return nil }

        let a = ((d1.x - d0.x) * v2 - (d2.x - d0.x) * v1) / determinant
        let c = ((d2.x - d0.x) * u1 - (d1.x - d0.x) * u2) / determinant
        let b = ((d1.y - d0.y) * v2 - (d2.y - d0.y) * v1) / determinant
        let d = ((d2.y - d0.y) * u1 - (d1.y - d0.y) * u2) / determinant
        let transform = CanvasTransform(
            a: a, b: b, c: c, d: d,
            e: d0.x - a * s0.x - c * s0.y,
            f: d0.y - b * s0.x - d * s0.y
        )
        guard [a, b, c, d, transform.e, transform.f].allSatisfy(\.isFinite) else { return nil }

        // Finite is not the same as right. A source triangle a hundredth of a
        // nanometre across — reachable through a crop of that size, which the
        // rectangle gates accept because it is positive — divides differences
        // that are all rounding error, and the result is a perfectly finite
        // transform that puts the vertices tens of pixels from where they
        // belong. So the transform is asked to do the one job it was solved
        // for, and checked against the answer that was already known.
        //
        // The tolerance is relative to the destination triangle, because that
        // is the space the error appears in: a thousandth of the triangle's
        // own extent is far below anything visible at the seam and far above
        // the rounding of a well-conditioned solve.
        let extent = max(
            max(d0.x, d1.x, d2.x) - min(d0.x, d1.x, d2.x),
            max(d0.y, d1.y, d2.y) - min(d0.y, d1.y, d2.y)
        )
        let tolerance = max(extent, 1) * 1e-3
        for (sourcePoint, expected) in [(s0, d0), (s1, d1), (s2, d2)] {
            let mapped = transform.apply(sourcePoint)
            guard abs(mapped.x - expected.x) <= tolerance,
                  abs(mapped.y - expected.y) <= tolerance
            else { return nil }
        }
        return transform
    }

    /// The pixel-space lattice, in the same row and column order as the ground
    /// mesh it is drawn against.
    ///
    /// Built through the same `GcpMesh.resolve` the ground mesh uses, so a crop
    /// cannot be honoured on one side of the pairing and not the other — which
    /// would draw the right pixels onto the wrong ground with nothing in either
    /// mesh looking wrong on its own.
    public static func sourceMesh(
        pixelSize: PixelSize,
        gridSize: Int,
        sourceRect: PixelRect? = nil
    ) throws(GcpMesh.MeshRefusal) -> [[PixelPoint]] {
        guard gridSize >= 1 else { throw .notALattice }
        let rect = try GcpMesh.resolve(pixelSize: pixelSize, sourceRect: sourceRect)
        return (0...gridSize).map { row in
            let y = rect.y + rect.height * Double(row) / Double(gridSize)
            return (0...gridSize).map { col in
                PixelPoint(x: rect.x + rect.width * Double(col) / Double(gridSize), y: y)
            }
        }
    }

    /// Whether a triangle can put ink inside `rect`.
    ///
    /// The bounding box is grown by the overdraw first: a triangle whose raw
    /// box ends a pixel outside still paints its overdraw ring there, and
    /// culling it would leave a visible notch along the edge of the sheet.
    ///
    /// `overdraw` is in the same units as the rectangle, which is why it is a
    /// parameter rather than the constant. A canvas measures in device pixels;
    /// a MapKit overlay renderer measures in map points, where two device
    /// pixels is two divided by the zoom scale.
    public static func intersects(
        _ triangle: MeshTriangle,
        rect: CanvasRect,
        overdraw: Double = clipOverdrawDevicePixels
    ) -> Bool {
        let xs = [triangle.destination.0.x, triangle.destination.1.x, triangle.destination.2.x]
        let ys = [triangle.destination.0.y, triangle.destination.1.y, triangle.destination.2.y]
        // Every coordinate, not just the extremes: `min` and `max` propagate a
        // NaN only when it comes first, so a triangle with one unplaceable
        // vertex in the middle would otherwise report finite bounds and be
        // kept — the answer depending on which vertex was bad rather than on
        // whether one was.
        guard (xs + ys).allSatisfy(\.isFinite),
              let minX = xs.min(), let maxX = xs.max(),
              let minY = ys.min(), let maxY = ys.max()
        else { return false }
        return maxX + overdraw > rect.x && maxY + overdraw > rect.y
            && minX - overdraw < rect.x + rect.width
            && minY - overdraw < rect.y + rect.height
    }

    /// The clip path for one triangle: its vertices pushed out from the
    /// centroid, so neighbours overlap rather than leaving a hairline seam.
    public static func clipPath(
        for triangle: MeshTriangle,
        overdraw: Double = clipOverdrawDevicePixels
    ) -> (CanvasPoint, CanvasPoint, CanvasPoint) {
        let (d0, d1, d2) = triangle.destination
        let cx = (d0.x + d1.x + d2.x) / 3
        let cy = (d0.y + d1.y + d2.y) / 3
        func grown(_ point: CanvasPoint) -> CanvasPoint {
            let dx = point.x - cx
            let dy = point.y - cy
            // A vertex sitting exactly on the centroid has no direction to
            // grow in; the web divides by a substituted 1 and leaves it where
            // it is, which is the only answer available.
            let length = (dx * dx + dy * dy).squareRoot()
            guard length > 0 else { return point }
            return CanvasPoint(
                x: point.x + dx / length * overdraw,
                y: point.y + dy / length * overdraw
            )
        }
        return (grown(d0), grown(d1), grown(d2))
    }

    /// How many triangles a lattice of this shape draws.
    public static func triangleCount(rows: Int, columns: Int) -> Int {
        max(0, rows - 1) * max(0, columns - 1) * 2
    }

    /// A contiguous run of at most `limit` triangles, and the index to resume
    /// from — equal to the total once the walk is done.
    ///
    /// Chunked by triangle count rather than by elapsed time because a clock on
    /// this side cannot see the work: a clipped draw returns when the command
    /// is queued and the raster lands later. On the web a walk reporting 8 ms
    /// of elapsed script time cost 750 ms of completed GPU work.
    ///
    /// Cell-major, and each cell's two halves adjacent: cell (row, column) owns
    /// triangles `2·(row·columns + column)` and its successor. A walk split
    /// across several calls therefore paints the shared-edge overdraw in the
    /// same order as a single pass and converges to the same pixels.
    ///
    /// Off-canvas triangles are returned rather than dropped, and count against
    /// the limit. Filtering here would let one chunk traverse an unbounded
    /// off-canvas remainder looking for its quota; the caller culls with
    /// `isOnCanvas` as it draws.
    public static func walk(
        source: [[PixelPoint]],
        destination: [[CanvasPoint]],
        from start: Int,
        limit: Int
    ) -> (triangles: [MeshTriangle], next: Int) {
        let rows = min(source.count, destination.count) - 1
        let columns = min(
            source.first?.count ?? 0, destination.first?.count ?? 0
        ) - 1
        guard rows >= 1, columns >= 1 else { return ([], 0) }
        // Ragged input would index out of bounds partway through a walk, which
        // in a renderer means a crash on somebody's sheet rather than a wrong
        // pixel. Neither mesh builder here can produce one, so this is a guard
        // against a future caller assembling meshes by hand.
        guard source.allSatisfy({ $0.count > columns }),
              destination.allSatisfy({ $0.count > columns })
        else { return ([], 0) }

        let total = rows * columns * 2
        let begin = min(max(0, start), total)
        // At least one triangle, or a chunked sequence with a zero budget
        // never finishes. Compared against the remainder rather than added to
        // `begin`, because a caller asking for `Int.max` — "draw the rest" —
        // would otherwise overflow and trap.
        let budget = max(1, limit)
        let stop = budget >= total - begin ? total : begin + budget
        guard begin < stop else { return ([], total) }

        var triangles = [MeshTriangle]()
        triangles.reserveCapacity(stop - begin)
        for index in begin..<stop {
            let cell = index / 2
            let row = cell / columns
            let column = cell % columns
            if index % 2 == 0 {
                triangles.append(
                    MeshTriangle(
                        source: (
                            source[row][column], source[row][column + 1],
                            source[row + 1][column]
                        ),
                        destination: (
                            destination[row][column], destination[row][column + 1],
                            destination[row + 1][column]
                        )
                    )
                )
            } else {
                triangles.append(
                    MeshTriangle(
                        source: (
                            source[row][column + 1], source[row + 1][column + 1],
                            source[row + 1][column]
                        ),
                        destination: (
                            destination[row][column + 1], destination[row + 1][column + 1],
                            destination[row + 1][column]
                        )
                    )
                )
            }
        }
        return (triangles, stop)
    }

    /// Every triangle in the lattice, in walk order.
    public static func allTriangles(
        source: [[PixelPoint]], destination: [[CanvasPoint]]
    ) -> [MeshTriangle] {
        walk(
            source: source, destination: destination, from: 0,
            limit: triangleCount(rows: source.count, columns: source.first?.count ?? 0)
        ).triangles
    }
}
