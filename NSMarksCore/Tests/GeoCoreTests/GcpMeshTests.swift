import Foundation
import Testing

@testable import GeoCore

/// Bilinear interpolation of one mesh cell, in the renderer's space.
///
/// The screen is Web Mercator scaled and translated, so the straight line a
/// triangle draws between two vertices is straight in Mercator metres, not in
/// degrees. Averaging latitudes instead would measure a different mesh from the
/// one that actually gets drawn.
enum MeshInterpolation {
    static func point(
        in mesh: [[GeoPoint]], atX fx: Double, y fy: Double,
        row: Int = 0, column: Int = 0
    ) -> GeoPoint {
        let weighted = [
            (mesh[row][column], (1 - fx) * (1 - fy)),
            (mesh[row][column + 1], fx * (1 - fy)),
            (mesh[row + 1][column], (1 - fx) * fy),
            (mesh[row + 1][column + 1], fx * fy),
        ].map { (WebMercator.project($0.0), $0.1) }
        return WebMercator.unproject(
            MercatorPoint(
                x: weighted.reduce(0) { $0 + $1.0.x * $1.1 },
                y: weighted.reduce(0) { $0 + $1.0.y * $1.1 }
            )
        )
    }

    static func centre(of mesh: [[GeoPoint]], row: Int = 0, column: Int = 0) -> GeoPoint {
        point(in: mesh, atX: 0.5, y: 0.5, row: row, column: column)
    }
}

@Suite("Affine mesh")
struct AffineGcpMeshTests {
    private static let truth = GeoCore.AffineTransform(
        a: 3.5, b: -1.25, c: -6_790_000, d: 0.75, e: 4.5, f: 5_780_000
    )
    private static let pixelSize = PixelSize(width: 4096, height: 3072)

    private static func corner(_ x: Double, _ y: Double) -> GeoPoint {
        WebMercator.unproject(truth.apply(x: x, y: y))
    }

    @Test func oneCellIsTheDefaultBecauseAnAffineNeedsNoLattice() throws {
        #expect(GcpMesh.affineGridSize == 1)
        let mesh = try GcpMesh.latLngMesh(Self.truth, pixelSize: Self.pixelSize)
        #expect(mesh.count == 2)
        #expect(mesh.allSatisfy { $0.count == 2 })
    }

    /// Row is pixel Y and column is pixel X. On a non-square raster a
    /// transposed evaluation lands somewhere else entirely, and the corner at
    /// full width is what catches it.
    @Test func theCornersLandWhereTheTransformSaysTheyDo() throws {
        let mesh = try GcpMesh.latLngMesh(Self.truth, pixelSize: Self.pixelSize)
        #expect(mesh[0][0] == Self.corner(0, 0))
        #expect(mesh[0][1] == Self.corner(4096, 0))
        #expect(mesh[1][0] == Self.corner(0, 3072))
        #expect(mesh[1][1] == Self.corner(4096, 3072))
    }

    @Test func aDenserGridIsGridSizePlusOneSquare() throws {
        let mesh = try GcpMesh.latLngMesh(Self.truth, pixelSize: Self.pixelSize, gridSize: 8)
        #expect(mesh.count == 9)
        #expect(mesh.allSatisfy { $0.count == 9 })
        #expect(mesh[4][2] == Self.corner(1024, 1536))
    }

    /// The claim the default rests on: interpolating the one-cell mesh —
    /// which is what the renderer does between vertices, in Web Mercator, not
    /// in degrees — lands where the transform itself says the ground is.
    ///
    /// Comparing a dense mesh's vertex against the transform at the same pixel
    /// would proves nothing: both sides evaluate the same expression, so the
    /// test passes however wrong the projection is. What has to be measured is
    /// the gap between the vertices, because that gap is the whole reason a
    /// lattice would be needed.
    @Test func aDenserGridBuysNothing() throws {
        let coarse = try GcpMesh.latLngMesh(Self.truth, pixelSize: Self.pixelSize)
        let interpolated = MeshInterpolation.centre(of: coarse)
        let truth = Self.corner(2048, 1536)
        #expect(WebMercator.groundMetres(from: interpolated, to: truth) < 1e-6)

        // And at the quarter points too, so a mesh that happened to be right at
        // its own centre and bowed either side of it would still fail.
        for (pixel, mercator) in [(1024.0, 0.25), (3072.0, 0.75)] {
            let along = MeshInterpolation.point(in: coarse, atX: mercator, y: mercator)
            #expect(
                WebMercator.groundMetres(from: along, to: Self.corner(pixel, pixel * 0.75))
                    < 1e-6
            )
        }
    }


    /// A quarter-turn transform is where a mesh that quietly swaps its axes
    /// still looks plausible, because the raster's own corners come back in a
    /// different order.
    @Test func aRotatedTransformDoesNotSwapTheAxes() throws {
        let rotated = GeoCore.AffineTransform(
            a: 0, b: 4, c: -6_790_000, d: -4, e: 0, f: 5_780_000
        )
        let mesh = try GcpMesh.latLngMesh(
            rotated, pixelSize: PixelSize(width: 100, height: 50)
        )
        #expect(mesh[0][1] == WebMercator.unproject(rotated.apply(x: 100, y: 0)))
        #expect(mesh[1][0] == WebMercator.unproject(rotated.apply(x: 0, y: 50)))
    }

    /// A cropped sheet is warped over what the user kept, not over the scan
    /// they cropped it from.
    @Test func onlyTheSelectedRectangleIsEvaluated() throws {
        let mesh = try GcpMesh.latLngMesh(
            Self.truth,
            pixelSize: Self.pixelSize,
            sourceRect: PixelRect(x: 100, y: 50, width: 3000, height: 2000)
        )
        #expect(mesh[0][0] == Self.corner(100, 50))
        #expect(mesh[1][1] == Self.corner(3100, 2050))
    }
}

@Suite("Source rectangle")
struct SourceRectangleTests {
    private static let pixelSize = PixelSize(width: 4096, height: 3072)

    @Test func noRectangleMeansTheWholeRaster() throws {
        let rect = try GcpMesh.resolve(pixelSize: Self.pixelSize, sourceRect: nil)
        #expect(rect == PixelRect(x: 0, y: 0, width: 4096, height: 3072))
    }

    /// A crop written as a fraction of the width lands a hair past the last
    /// pixel often enough that refusing it would refuse ordinary work. It is
    /// admitted and then clamped, so nothing samples pixels the raster does not
    /// have.
    @Test func anEdgeAHairOutsideIsAdmittedAndThenClamped() throws {
        let rect = try GcpMesh.resolve(
            pixelSize: Self.pixelSize,
            sourceRect: PixelRect(x: -1e-9, y: 0, width: 4096 + 1e-9, height: 3072)
        )
        #expect(rect.x == 0)
        #expect(rect.width == 4096)
    }

    @Test(arguments: [
        PixelRect(x: 0, y: 0, width: 0, height: 100),
        PixelRect(x: 0, y: 0, width: 100, height: -5),
        PixelRect(x: .nan, y: 0, width: 100, height: 100),
        PixelRect(x: 0, y: 0, width: .infinity, height: 100),
    ])
    func aRectangleWithNoAreaIsRefused(rect: PixelRect) {
        #expect(throws: GcpMesh.MeshRefusal.degenerate) {
            try GcpMesh.resolve(pixelSize: Self.pixelSize, sourceRect: rect)
        }
    }

    /// Refused rather than clamped down to what fits, and separately from a
    /// degenerate one: a rectangle reaching past the scan means the caller's
    /// idea of the raster's size disagrees with the raster's, and silently
    /// shrinking it would warp a sheet over ground the user never selected.
    @Test(arguments: [
        PixelRect(x: 0, y: 0, width: 5000, height: 100),
        PixelRect(x: 4000, y: 0, width: 200, height: 100),
        PixelRect(x: -1, y: 0, width: 100, height: 100),
        PixelRect(x: 0, y: 3000, width: 100, height: 200),
    ])
    func aRectangleReachingPastTheRasterIsRefused(rect: PixelRect) {
        #expect(throws: GcpMesh.MeshRefusal.outsideRaster) {
            try GcpMesh.resolve(pixelSize: Self.pixelSize, sourceRect: rect)
        }
    }

    /// A crop narrower than the edge tolerance, sitting a hair past the right
    /// edge, passes the tolerance check and would clamp to a negative width —
    /// a lattice running backwards out of the raster, sampling pixels that do
    /// not exist. Microscopic, and still not a rectangle.
    @Test(arguments: [
        PixelRect(x: 4096.00000005, y: 0, width: 0.00000001, height: 1),
        PixelRect(x: 0, y: 3072.00000005, width: 1, height: 0.00000001),
    ])
    func aRectangleTheToleranceAdmitsCannotClampToNothing(rect: PixelRect) {
        #expect(throws: GcpMesh.MeshRefusal.outsideRaster) {
            try GcpMesh.resolve(pixelSize: Self.pixelSize, sourceRect: rect)
        }
    }
}

@Suite("Grid size")
struct GridSizeTests {
    /// Rounded up to one cell, a spline mesh would lose its whole bending term
    /// — over a hundred metres on the fixture above — and report success. The
    /// caller asked for a lattice it did not get, so it is told.
    @Test(arguments: [0, -1, Int.min])
    func aGridSizeBelowOneIsRefusedRatherThanRoundedUp(gridSize: Int) throws {
        let size = PixelSize(width: 2000, height: 1700)
        let spline = try ThinPlateSpline.solve(controlPoints: GeoreferenceFixtures.bent)
        #expect(throws: GcpMesh.MeshRefusal.notALattice) {
            try GcpMesh.latLngMesh(spline, pixelSize: size, gridSize: gridSize)
        }
        #expect(throws: GcpMesh.MeshRefusal.notALattice) {
            try GcpMesh.latLngMesh(
                GeoCore.AffineTransform(a: 1, b: 0, c: 0, d: 0, e: 1, f: 0),
                pixelSize: size, gridSize: gridSize
            )
        }
        #expect(throws: GcpMesh.MeshRefusal.notALattice) {
            try RasterProjection.latLngMesh(
                RasterProjection.EmbeddedGeoreference(
                    crs: "EPSG:26920", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
                ),
                pixelSize: size, gridSize: gridSize
            )
        }
    }
}

@Suite("Spline mesh")
struct SplineGcpMeshTests {
    private static func solved() throws -> ThinPlateSpline {
        try ThinPlateSpline.solve(controlPoints: GeoreferenceFixtures.bent)
    }

    @Test func everyRowIsGridSizePlusOneLong() throws {
        let mesh = try GcpMesh.latLngMesh(
            try Self.solved(),
            pixelSize: PixelSize(width: 2000, height: 1700),
            gridSize: 4
        )
        #expect(mesh.count == 5)
        // Every row, not just the first: a lattice built one row short in the
        // middle still passes a check on `mesh[0]`.
        #expect(mesh.allSatisfy { $0.count == 5 })
    }

    /// Asserted away from the origin on a non-square raster. `mesh[0][0]` is
    /// the same point for any size and for a transposed evaluation, so it
    /// cannot catch a swapped extent.
    @Test func theLatticeSpansTheRastersRealExtent() throws {
        let spline = try Self.solved()
        let size = PixelSize(width: 2000, height: 500)
        let mesh = try GcpMesh.latLngMesh(spline, pixelSize: size, gridSize: 2)

        let atFullWidth = WebMercator.unproject(spline.apply(x: 2000, y: 0))
        let atFullHeight = WebMercator.unproject(spline.apply(x: 0, y: 500))
        #expect(abs(mesh[0][2].lat - atFullWidth.lat) < 1e-9)
        #expect(abs(mesh[0][2].lng - atFullWidth.lng) < 1e-9)
        #expect(abs(mesh[2][0].lat - atFullHeight.lat) < 1e-9)
        #expect(abs(mesh[2][0].lng - atFullHeight.lng) < 1e-9)
    }

    @Test func theLatticeIsOrderedRowIsPixelYColumnIsPixelX() throws {
        let mesh = try GcpMesh.latLngMesh(
            try Self.solved(),
            pixelSize: PixelSize(width: 2000, height: 500),
            gridSize: 2
        )
        // Stepping a column moves mostly east; stepping a row moves mostly
        // north. On this fixture the warp is close enough to north-up for that
        // to be the whole test.
        #expect(abs(mesh[0][1].lng - mesh[0][0].lng) > abs(mesh[0][1].lat - mesh[0][0].lat))
        #expect(abs(mesh[1][0].lat - mesh[0][0].lat) > abs(mesh[1][0].lng - mesh[0][0].lng))
    }

    @Test func onlyTheSelectedRectangleIsEvaluated() throws {
        let spline = try Self.solved()
        let mesh = try GcpMesh.latLngMesh(
            spline,
            pixelSize: PixelSize(width: 2000, height: 500),
            gridSize: 1,
            sourceRect: PixelRect(x: 100, y: 50, width: 1200, height: 300)
        )
        #expect(mesh[0][0] == WebMercator.unproject(spline.apply(x: 100, y: 50)))
        #expect(mesh[1][1] == WebMercator.unproject(spline.apply(x: 1300, y: 350)))
    }

    /// A spline mesh at one cell is the affine mesh — it samples only the
    /// corners, and the bend between them is exactly what is lost. This is
    /// asserted so that a future caller cannot quietly pass 1 and believe it
    /// got a spline warp.
    @Test func oneCellThrowsAwayTheBendWhichIsWhyTheDefaultIsNotOne() throws {
        let spline = try Self.solved()
        let size = PixelSize(width: 2000, height: 1700)
        let coarse = try GcpMesh.latLngMesh(spline, pixelSize: size, gridSize: 1)
        let dense = try GcpMesh.latLngMesh(spline, pixelSize: size, gridSize: 2)

        // Where the renderer would put the centre from the coarse cell alone,
        // against where the spline says the ground is.
        let missed = WebMercator.groundMetres(
            from: MeshInterpolation.centre(of: coarse), to: dense[1][1]
        )
        #expect(missed > 100)
        #expect(GcpMesh.splineGridSize > 1)
        #expect(GcpMesh.splineDragGridSize > 1)
    }
}
