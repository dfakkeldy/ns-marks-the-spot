import Foundation
import Testing

@testable import GeoCore

@Suite("Triangle transform")
struct WarpTransformTests {
    private static let source = (
        PixelPoint(x: 0, y: 0), PixelPoint(x: 400, y: 0), PixelPoint(x: 0, y: 300)
    )
    private static let destination = (
        CanvasPoint(x: 120, y: 40), CanvasPoint(x: 500, y: 90), CanvasPoint(x: 60, y: 380)
    )

    /// The whole contract: the transform takes each source vertex onto its own
    /// destination vertex. Asserted at all three, because a transposed pair of
    /// coefficients still lands the first vertex correctly.
    @Test func eachSourceVertexLandsOnItsOwnDestinationVertex() throws {
        let transform = try #require(
            WarpMesh.transform(source: Self.source, destination: Self.destination)
        )
        for (pixel, canvas) in [
            (Self.source.0, Self.destination.0),
            (Self.source.1, Self.destination.1),
            (Self.source.2, Self.destination.2),
        ] {
            let placed = transform.apply(pixel)
            #expect(abs(placed.x - canvas.x) < 1e-9)
            #expect(abs(placed.y - canvas.y) < 1e-9)
        }
    }

    /// An affine is determined by three points, so the interior follows. This
    /// catches a transform that fits the corners through a shear it should not
    /// have.
    @Test func theInteriorFollowsFromTheCorners() throws {
        let transform = try #require(
            WarpMesh.transform(source: Self.source, destination: Self.destination)
        )
        // Halfway along the first edge, which the affine must place halfway
        // along the destination's first edge.
        let placed = transform.apply(PixelPoint(x: 200, y: 0))
        #expect(abs(placed.x - (120 + 500) / 2) < 1e-9)
        #expect(abs(placed.y - (40 + 90) / 2) < 1e-9)
    }

    /// Three collinear source points — a zero-area crop, or a spline folded
    /// onto itself. The web divides by the determinant anyway and gets
    /// infinities; Core Graphics would accept those as a transform and paint
    /// nothing anybody could interpret.
    @Test(arguments: [
        (PixelPoint(x: 0, y: 0), PixelPoint(x: 100, y: 100), PixelPoint(x: 200, y: 200)),
        (PixelPoint(x: 5, y: 5), PixelPoint(x: 5, y: 5), PixelPoint(x: 400, y: 90)),
        (PixelPoint(x: 0, y: .nan), PixelPoint(x: 100, y: 0), PixelPoint(x: 0, y: 100)),
    ])
    func aDegenerateSourceTriangleHasNoTransform(
        source: (PixelPoint, PixelPoint, PixelPoint)
    ) {
        #expect(WarpMesh.transform(source: source, destination: Self.destination) == nil)
    }

    /// A source triangle a hundredth of a nanometre across. The determinant is
    /// finite and not zero, so nothing about it looks degenerate, and the
    /// differences being divided are entirely rounding error: the transform
    /// that comes back puts two of the three vertices tens of pixels from
    /// where they were solved to go. Found by Codex; the web has the same
    /// formula and the same defect.
    @Test func aTransformThatDoesNotDoWhatItWasSolvedForIsRefused() {
        let source = (
            PixelPoint(x: 4095, y: 3071),
            PixelPoint(x: 4095.000_000_000_01, y: 3071),
            PixelPoint(x: 4095, y: 3071.000_000_000_01)
        )
        let determinant = 1e-11 * 1e-11
        #expect(determinant != 0)
        #expect(WarpMesh.transform(source: source, destination: Self.destination) == nil)
    }

    /// And the refusal is not simply "small triangles". A crop of a few pixels
    /// is an ordinary thing for a user to make, and it solves exactly.
    @Test func aGenuinelySmallButWellConditionedTriangleStillHasATransform() throws {
        let source = (
            PixelPoint(x: 4095, y: 3071), PixelPoint(x: 4098, y: 3071),
            PixelPoint(x: 4095, y: 3074)
        )
        let transform = try #require(
            WarpMesh.transform(source: source, destination: Self.destination)
        )
        let placed = transform.apply(source.1)
        #expect(abs(placed.x - Self.destination.1.x) < 1e-6)
        #expect(abs(placed.y - Self.destination.1.y) < 1e-6)
    }

    /// A destination triangle with no area is not degenerate input — it is a
    /// sheet seen edge on, and the answer is a transform that collapses it.
    /// Refusing here would drop triangles a steeply tilted warp legitimately
    /// produces.
    @Test func aFlatDestinationStillHasATransform() {
        #expect(
            WarpMesh.transform(
                source: Self.source,
                destination: (
                    CanvasPoint(x: 10, y: 10), CanvasPoint(x: 20, y: 10),
                    CanvasPoint(x: 30, y: 10)
                )
            ) != nil
        )
    }
}

@Suite("Source lattice")
struct WarpSourceMeshTests {
    private static let pixelSize = PixelSize(width: 4096, height: 3072)

    /// Row is pixel Y and column is pixel X — the same order as the ground
    /// mesh, because the two are paired vertex for vertex. A transposed source
    /// lattice draws the sheet mirrored through its diagonal and every vertex
    /// still lands inside the raster.
    @Test func theLatticeIsOrderedRowIsPixelYColumnIsPixelX() throws {
        let mesh = try WarpMesh.sourceMesh(pixelSize: Self.pixelSize, gridSize: 4)
        #expect(mesh.count == 5)
        #expect(mesh.allSatisfy { $0.count == 5 })
        #expect(mesh[0][0] == PixelPoint(x: 0, y: 0))
        #expect(mesh[0][4] == PixelPoint(x: 4096, y: 0))
        #expect(mesh[4][0] == PixelPoint(x: 0, y: 3072))
        #expect(mesh[1][2] == PixelPoint(x: 2048, y: 768))
    }

    /// The pairing is the point: both meshes resolve the crop through the same
    /// rectangle, so a sheet cannot be cropped on one side of the pair and not
    /// the other — which would draw the right pixels onto the wrong ground with
    /// neither mesh looking wrong on its own.
    @Test func theCropIsResolvedThroughTheSameRectangleAsTheGroundMesh() throws {
        let crop = PixelRect(x: 100, y: 50, width: 3000, height: 2000)
        let source = try WarpMesh.sourceMesh(
            pixelSize: Self.pixelSize, gridSize: 1, sourceRect: crop
        )
        let ground = try GcpMesh.latLngMesh(
            GeoCore.AffineTransform(a: 3.5, b: -1.25, c: -6_790_000, d: 0.75, e: 4.5, f: 5_780_000),
            pixelSize: Self.pixelSize, sourceRect: crop
        )
        #expect(source.count == ground.count)
        #expect(source[0][0] == PixelPoint(x: 100, y: 50))
        #expect(source[1][1] == PixelPoint(x: 3100, y: 2050))
    }

    @Test func aRectangleTheGroundMeshWouldRefuseIsRefusedHereToo() {
        #expect(throws: GcpMesh.MeshRefusal.outsideRaster) {
            try WarpMesh.sourceMesh(
                pixelSize: Self.pixelSize, gridSize: 4,
                sourceRect: PixelRect(x: 0, y: 0, width: 5000, height: 100)
            )
        }
        #expect(throws: GcpMesh.MeshRefusal.notALattice) {
            try WarpMesh.sourceMesh(pixelSize: Self.pixelSize, gridSize: 0)
        }
    }
}

@Suite("Triangle walk")
struct WarpWalkTests {
    private static func meshes(
        rows: Int, columns: Int
    ) -> ([[PixelPoint]], [[CanvasPoint]]) {
        let source = (0...rows).map { row in
            (0...columns).map { PixelPoint(x: Double($0) * 10, y: Double(row) * 10) }
        }
        let destination = (0...rows).map { row in
            (0...columns).map { CanvasPoint(x: Double($0) * 20, y: Double(row) * 20) }
        }
        return (source, destination)
    }

    @Test func everyCellContributesTwoTriangles() {
        let (source, destination) = Self.meshes(rows: 3, columns: 5)
        let walked = WarpMesh.walk(
            source: source, destination: destination, from: 0, limit: 1000
        )
        #expect(walked.next == 30)
        #expect(walked.triangles.count == 30)
        #expect(WarpMesh.triangleCount(rows: 4, columns: 6) == 30)
    }

    /// The two halves of a cell must cover the cell: between them they use all
    /// four corners, and they share the diagonal. A pair that took the same
    /// diagonal twice would leave one corner of every cell unpainted.
    @Test func theTwoHalvesOfACellCoverIt() {
        let (source, destination) = Self.meshes(rows: 1, columns: 1)
        let triangles = WarpMesh.allTriangles(source: source, destination: destination)
        #expect(triangles.count == 2)
        let used = Set(
            triangles.flatMap { [$0.source.0, $0.source.1, $0.source.2] }
        )
        #expect(used == Set([
            PixelPoint(x: 0, y: 0), PixelPoint(x: 10, y: 0),
            PixelPoint(x: 0, y: 10), PixelPoint(x: 10, y: 10),
        ]))
        // Shared diagonal: the top-right and bottom-left corners are in both.
        for triangle in triangles {
            let corners = Set([triangle.source.0, triangle.source.1, triangle.source.2])
            #expect(corners.contains(PixelPoint(x: 10, y: 0)))
            #expect(corners.contains(PixelPoint(x: 0, y: 10)))
        }
    }

    /// The exact two triangles of one cell, vertex by vertex, in the order
    /// they paint.
    ///
    /// The corner-set test above is blind to three things that all matter:
    /// which half paints first, whether each source vertex is paired with its
    /// own destination vertex, and the winding. Swapping the two halves, or
    /// reversing one destination triplet, leaves every other test in this file
    /// green — and paints the sheet with its cells mirrored, or the shared
    /// strip written in the wrong order.
    @Test func aCellsTrianglesArePinnedVertexByVertexAndInPaintOrder() {
        let (source, destination) = Self.meshes(rows: 1, columns: 1)
        let triangles = WarpMesh.allTriangles(source: source, destination: destination)
        #expect(triangles == [
            MeshTriangle(
                source: (
                    PixelPoint(x: 0, y: 0), PixelPoint(x: 10, y: 0), PixelPoint(x: 0, y: 10)
                ),
                destination: (
                    CanvasPoint(x: 0, y: 0), CanvasPoint(x: 20, y: 0), CanvasPoint(x: 0, y: 20)
                )
            ),
            MeshTriangle(
                source: (
                    PixelPoint(x: 10, y: 0), PixelPoint(x: 10, y: 10), PixelPoint(x: 0, y: 10)
                ),
                destination: (
                    CanvasPoint(x: 20, y: 0), CanvasPoint(x: 20, y: 20), CanvasPoint(x: 0, y: 20)
                )
            ),
        ])
    }

    /// Both halves wind the same way. A cell with one half wound against the
    /// other is a cell drawn mirrored, which on a scan of a map reads as a
    /// plausible sheet rather than as a defect.
    @Test func bothHalvesWindTheSameWay() {
        let (source, destination) = Self.meshes(rows: 2, columns: 2)
        func cross(_ a: CanvasPoint, _ b: CanvasPoint, _ c: CanvasPoint) -> Double {
            (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
        }
        let signs = WarpMesh.allTriangles(source: source, destination: destination)
            .map { cross($0.destination.0, $0.destination.1, $0.destination.2) > 0 }
        #expect(Set(signs).count == 1)
    }

    /// "Draw the rest of it" is a budget a caller can reasonably ask for, and
    /// adding it to the cursor overflows.
    @Test func anUnboundedBudgetFinishesTheWalkRatherThanTrapping() {
        let (source, destination) = Self.meshes(rows: 3, columns: 4)
        let step = WarpMesh.walk(
            source: source, destination: destination, from: 1, limit: .max
        )
        #expect(step.next == 24)
        #expect(step.triangles.count == 23)
    }

    /// Neighbouring triangles overlap by the overdraw ring, so the same pixels
    /// are painted more than once and the last writer wins. A walk split across
    /// frames therefore has to visit triangles in exactly the order one pass
    /// would, or a chunked draw settles to different pixels than an unchunked
    /// one — a difference that shows up as seams only on slow devices.
    @Test func aWalkSplitAcrossChunksVisitsTheSameTrianglesInTheSameOrder() {
        let (source, destination) = Self.meshes(rows: 3, columns: 4)
        let whole = WarpMesh.allTriangles(source: source, destination: destination)

        var chunked = [MeshTriangle]()
        var cursor = 0
        var passes = 0
        while cursor < whole.count {
            let step = WarpMesh.walk(
                source: source, destination: destination, from: cursor, limit: 5
            )
            chunked.append(contentsOf: step.triangles)
            cursor = step.next
            passes += 1
            #expect(passes < 100)
        }
        #expect(chunked == whole)
    }

    /// A zero or negative budget still consumes a triangle. A chunk sequence
    /// that could consume none would spin forever without drawing anything, and
    /// the caller's budget comes from measured frame deltas, which can round to
    /// nothing on a loaded device.
    @Test(arguments: [0, -1])
    func aChunkAlwaysMakesProgress(limit: Int) {
        let (source, destination) = Self.meshes(rows: 2, columns: 2)
        let step = WarpMesh.walk(
            source: source, destination: destination, from: 0, limit: limit
        )
        #expect(step.triangles.count == 1)
        #expect(step.next == 1)
    }

    @Test func aFinishedWalkStaysFinished() {
        let (source, destination) = Self.meshes(rows: 2, columns: 2)
        let step = WarpMesh.walk(
            source: source, destination: destination, from: 8, limit: 10
        )
        #expect(step.triangles.isEmpty)
        #expect(step.next == 8)
    }

    /// A lattice with no cells, and a ragged one. Neither builder here can
    /// produce them; a future caller assembling meshes by hand can, and the
    /// consequence in a renderer is a crash on somebody's sheet rather than a
    /// misplaced pixel.
    @Test func aLatticeWithNoCellsOrRaggedRowsDrawsNothing() {
        let single = [[PixelPoint(x: 0, y: 0)]]
        #expect(
            WarpMesh.walk(
                source: single, destination: [[CanvasPoint(x: 0, y: 0)]], from: 0, limit: 4
            ).triangles.isEmpty
        )

        let (source, destination) = Self.meshes(rows: 2, columns: 2)
        var ragged = source
        ragged[1] = Array(ragged[1].dropLast())
        #expect(
            WarpMesh.walk(
                source: ragged, destination: destination, from: 0, limit: 4
            ).triangles.isEmpty
        )
    }
}

@Suite("Canvas culling and clipping")
struct WarpCullingTests {
    private static func triangle(
        _ points: [(Double, Double)]
    ) -> MeshTriangle {
        MeshTriangle(
            source: (
                PixelPoint(x: 0, y: 0), PixelPoint(x: 10, y: 0), PixelPoint(x: 0, y: 10)
            ),
            destination: (
                CanvasPoint(x: points[0].0, y: points[0].1),
                CanvasPoint(x: points[1].0, y: points[1].1),
                CanvasPoint(x: points[2].0, y: points[2].1)
            )
        )
    }

    @Test func aTriangleWellOffTheCanvasIsCulled() {
        #expect(
            !WarpMesh.intersects(
                Self.triangle([(-500, -500), (-480, -500), (-500, -480)]),
                rect: CanvasRect(x: 0, y: 0, width: 400, height: 300)
            )
        )
        #expect(
            !WarpMesh.intersects(
                Self.triangle([(900, 10), (920, 10), (900, 30)]),
                rect: CanvasRect(x: 0, y: 0, width: 400, height: 300)
            )
        )
    }

    /// The bounding box is grown by the overdraw before the miss test. A
    /// triangle whose own box ends one pixel off the canvas still paints its
    /// overdraw ring, and culling it leaves a notch along the edge of the
    /// sheet — visible exactly where a sheet meets the edge of the screen,
    /// which is most of the time.
    @Test func aTriangleJustOffTheEdgeStillPaintsItsOverdrawRing() {
        #expect(
            WarpMesh.intersects(
                Self.triangle([(-21, 10), (-1.5, 10), (-21, 30)]),
                rect: CanvasRect(x: 0, y: 0, width: 400, height: 300)
            )
        )
        #expect(
            WarpMesh.intersects(
                Self.triangle([(401.5, 10), (420, 10), (401.5, 30)]),
                rect: CanvasRect(x: 0, y: 0, width: 400, height: 300)
            )
        )
    }

    /// Whichever vertex is the bad one. `min` and `max` propagate a NaN only
    /// when it comes first, so a version reading the extremes alone answers
    /// this correctly for the first vertex and wrongly for the other two —
    /// which is worse than answering wrongly for all three, because the first
    /// case is the one a test tends to be written for.
    @Test(arguments: [0, 1, 2])
    func aTriangleWithNoFinitePositionIsNotDrawn(badVertex: Int) {
        var vertices: [(Double, Double)] = [(0, 10), (20, 10), (0, 30)]
        vertices[badVertex] = (.nan, vertices[badVertex].1)
        #expect(
            !WarpMesh.intersects(
                Self.triangle(vertices),
                rect: CanvasRect(x: 0, y: 0, width: 400, height: 300)
            )
        )
    }

    /// Each vertex moves outward from the centroid by exactly the overdraw, so
    /// two triangles sharing an edge overlap along it instead of meeting at a
    /// hairline of background.
    @Test func theClipPathGrowsOutwardByTheOverdraw() {
        let triangle = Self.triangle([(0, 0), (60, 0), (0, 60)])
        let grown = WarpMesh.clipPath(for: triangle)
        let centroid = CanvasPoint(x: 20, y: 20)
        for (before, after) in [
            (triangle.destination.0, grown.0),
            (triangle.destination.1, grown.1),
            (triangle.destination.2, grown.2),
        ] {
            let wasAt = ((before.x - centroid.x) * (before.x - centroid.x)
                + (before.y - centroid.y) * (before.y - centroid.y)).squareRoot()
            let nowAt = ((after.x - centroid.x) * (after.x - centroid.x)
                + (after.y - centroid.y) * (after.y - centroid.y)).squareRoot()
            #expect(abs(nowAt - wasAt - WarpMesh.clipOverdrawDevicePixels) < 1e-9)
        }
    }

    /// A vertex sitting on the centroid has no direction to grow in. It stays
    /// where it is rather than becoming a not-a-number, which would take the
    /// whole clip path with it.
    @Test func aVertexOnTheCentroidStaysPut() {
        let grown = WarpMesh.clipPath(for: Self.triangle([(10, 10), (10, 10), (10, 10)]))
        #expect(grown.0 == CanvasPoint(x: 10, y: 10))
        #expect(grown.1 == CanvasPoint(x: 10, y: 10))
        #expect(grown.2 == CanvasPoint(x: 10, y: 10))
    }
}
