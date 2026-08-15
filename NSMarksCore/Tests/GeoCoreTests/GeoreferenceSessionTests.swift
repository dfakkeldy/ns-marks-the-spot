import Foundation
import Testing

@testable import GeoCore

@Suite("Placing control points")
struct GeoreferenceSessionPlacementTests {
    private static func session(
        _ method: GeoreferenceMethod = .affine
    ) -> GeoreferenceSession {
        GeoreferenceSession(
            pixelSize: PixelSize(width: 2000, height: 1700), method: method
        )
    }

    @Test func aPairIsMadeFromEitherSideFirst() {
        var session = Self.session()
        session.pickScanPoint(x: 100, y: 200)
        #expect(session.status == .awaitingMap)
        session.pickMapPoint(lat: 46.1, lng: -61.4)
        #expect(session.controlPoints.count == 1)
        #expect(session.pending == nil)

        session.pickMapPoint(lat: 46.2, lng: -61.3)
        #expect(session.status == .awaitingScan)
        session.pickScanPoint(x: 300, y: 400)
        #expect(session.controlPoints.count == 2)
        #expect(session.controlPoints[1].pixel == PixelPoint(x: 300, y: 400))
        #expect(session.controlPoints[1].map == GeoPoint(lat: 46.2, lng: -61.3))
    }

    /// A half-placed pair outranks the count, because it is the thing the user
    /// has to finish before anything else they might do means anything.
    @Test func aHalfPlacedPairOutranksTheCount() {
        var session = Self.session()
        #expect(session.status == .needMore(remaining: 3))
        session.pickScanPoint(x: 10, y: 10)
        #expect(session.status == .awaitingMap)
        session.cancelPending()
        #expect(session.status == .needMore(remaining: 3))
    }

    /// Two taps on the same side replace the waiting half rather than stacking
    /// up: the second tap is the user correcting the first.
    @Test func asecondTapOnTheSameSideReplacesTheWaitingHalf() {
        var session = Self.session()
        session.pickScanPoint(x: 10, y: 10)
        session.pickScanPoint(x: 20, y: 20)
        #expect(session.pending == .scan(PixelPoint(x: 20, y: 20)))
        session.pickMapPoint(lat: 46, lng: -61)
        #expect(session.controlPoints.count == 1)
        #expect(session.controlPoints[0].pixel == PixelPoint(x: 20, y: 20))
    }

    /// Ids are minted from the highest already in the list, not from one. A
    /// session reopened on saved points that already hold `gcp-1` upward would
    /// otherwise mint a duplicate, and two points sharing an id move and delete
    /// together.
    @Test func idsDoNotRestartOverSavedPoints() {
        var session = GeoreferenceSession(
            controlPoints: [
                SessionControlPoint(
                    id: "gcp-7", pixel: PixelPoint(x: 1, y: 1),
                    map: GeoPoint(lat: 46, lng: -61)
                )
            ],
            pixelSize: PixelSize(width: 100, height: 100)
        )
        session.pickScanPoint(x: 2, y: 2)
        session.pickMapPoint(lat: 46.1, lng: -61.1)
        #expect(session.controlPoints.map(\.id) == ["gcp-7", "gcp-8"])
    }

    /// An imported file's own labels are normally nothing like this session's,
    /// but a file that used the same form would hand the next placed point an
    /// id that already exists.
    @Test func idsAreReseededFromAnImportedFile() {
        var session = Self.session()
        session.replaceAll(with: [
            SessionControlPoint(
                id: "gcp-12", pixel: PixelPoint(x: 1, y: 1),
                map: GeoPoint(lat: 46, lng: -61)
            )
        ])
        session.pickScanPoint(x: 2, y: 2)
        session.pickMapPoint(lat: 46.1, lng: -61.1)
        #expect(session.controlPoints.map(\.id) == ["gcp-12", "gcp-13"])
    }

    /// An import replaces, and a half-placed pair must not survive it: its
    /// other half was picked against a set that is no longer there.
    @Test func anImportReplacesAndDropsAHalfPlacedPair() {
        var session = Self.session()
        session.pickScanPoint(x: 5, y: 5)
        session.pickMapPoint(lat: 46, lng: -61)
        session.pickScanPoint(x: 9, y: 9)
        #expect(session.pending != nil)

        session.replaceAll(with: [
            SessionControlPoint(
                id: "a", pixel: PixelPoint(x: 1, y: 1), map: GeoPoint(lat: 46, lng: -61)
            )
        ])
        #expect(session.controlPoints.map(\.id) == ["a"])
        #expect(session.pending == nil)
        // And one undo takes the whole import back.
        session.undo()
        #expect(session.controlPoints.count == 1)
        #expect(session.controlPoints[0].id == "gcp-1")
    }
}

@Suite("Undo and dragging")
struct GeoreferenceSessionUndoTests {
    private static func placed(_ count: Int) -> GeoreferenceSession {
        var session = GeoreferenceSession(pixelSize: PixelSize(width: 2000, height: 1700))
        for index in 0..<count {
            session.pickScanPoint(x: Double(index) * 100, y: Double(index) * 70)
            session.pickMapPoint(
                lat: 46 + Double(index) * 0.01, lng: -61 - Double(index) * 0.01
            )
        }
        return session
    }

    /// One drag is one undo, however many moves it emitted. Snapshotting per
    /// move would fill the history with frames a pixel apart.
    @Test func aWholeDragCollapsesIntoOneStep() {
        var session = Self.placed(3)
        let id = session.controlPoints[1].id
        session.beginDrag(id)
        for step in 1...20 {
            session.moveOnScan(id, x: 100 + Double(step), y: 70)
        }
        session.endDrag()

        session.undo()
        #expect(session.controlPoints[1].pixel == PixelPoint(x: 100, y: 70))
    }

    /// An undo mid-drag consumes the step the drag opened. Without re-opening
    /// one, every later move commits with nothing underneath it and the user
    /// ends up parked on a position they never confirmed with undo greyed out.
    @Test func aMoveAfterAnUndoReopensAStep() {
        var session = Self.placed(3)
        let id = session.controlPoints[1].id
        session.beginDrag(id)
        session.moveOnScan(id, x: 500, y: 500)
        session.undo()
        #expect(session.controlPoints[1].pixel == PixelPoint(x: 100, y: 70))

        session.moveOnScan(id, x: 600, y: 600)
        #expect(session.canUndo)
        session.undo()
        #expect(session.controlPoints[1].pixel == PixelPoint(x: 100, y: 70))
    }

    /// An undo that deletes the point the finger is holding cancels the drag.
    /// Nothing can ever end it — the marker is gone — so the sheet would stay
    /// on the coarse lattice for the rest of the session.
    @Test func anUndoPastTheDraggedPointsCreationCancelsTheDrag() {
        var session = Self.placed(4)
        session.method = .spline
        let id = session.controlPoints[3].id
        session.beginDrag(id)
        session.moveOnScan(id, x: 400, y: 400)
        #expect(session.isDragging)

        session.undo()  // back to the move's start
        session.undo()  // back past the point's creation
        #expect(!session.controlPoints.contains { $0.id == id })
        #expect(!session.isDragging)
    }

    /// An undo the dragged point survives keeps the drag, and keeps the coarse
    /// tier with it: the finger is still down and moves are still arriving.
    @Test func anUndoTheDraggedPointSurvivesKeepsTheDrag() {
        var session = Self.placed(4)
        let id = session.controlPoints[1].id
        session.beginDrag(id)
        session.moveOnScan(id, x: 900, y: 900)
        session.undo()
        #expect(session.isDragging)
        #expect(session.controlPoints.contains { $0.id == id })
    }

    @Test func theHistoryIsBounded() {
        var session = Self.placed(2)
        for step in 0..<(GeoreferenceSession.undoLimit + 20) {
            session.pickScanPoint(x: Double(step), y: 0)
            session.pickMapPoint(lat: 46, lng: -61)
        }
        for _ in 0...(GeoreferenceSession.undoLimit + 40) { session.undo() }
        #expect(!session.canUndo)
        // The oldest states fell off the end rather than the newest, so the
        // reachable past is the recent past.
        #expect(session.controlPoints.count > 2)
    }
}

@Suite("What the session can honestly say")
struct GeoreferenceSessionStatusTests {
    private static let size = PixelSize(width: 2000, height: 1700)

    private static func session(
        _ points: [GroundControlPoint], method: GeoreferenceMethod = .affine
    ) -> GeoreferenceSession {
        GeoreferenceSession(
            controlPoints: points.enumerated().map {
                SessionControlPoint(id: "gcp-\($0 + 1)", pixel: $1.pixel, map: $1.map)
            },
            pixelSize: size,
            method: method
        )
    }

    /// Three points is a solve and not an accuracy figure: an affine passes
    /// exactly through three by construction, so a residual would read zero
    /// whatever the points are.
    @Test func threePointsSolveAndSayNothingAboutAccuracy() {
        let session = Self.session(Array(GeoreferenceFixtures.bent.prefix(3)))
        #expect(session.status == .exactFit)
        #expect(session.transform != nil)
        #expect(session.mesh != nil)
    }

    @Test func aRealFitReportsItsMethodWithItsNumber() {
        let affine = Self.session(GeoreferenceFixtures.bent)
        guard case .solved(let metres, let count, let method) = affine.status else {
            Issue.record("expected a solved status, got \(affine.status)")
            return
        }
        #expect(count == 8)
        #expect(method == .affine)
        #expect(metres > 0)

        // The same points under the spline report a different number from a
        // different fit — leave-one-out rather than the fit residual — and the
        // status carries which, so copy cannot frame a bound as a residual.
        let spline = Self.session(GeoreferenceFixtures.bent, method: .spline)
        guard case .solved(let bound, _, let splineMethod) = spline.status else {
            Issue.record("expected a solved status, got \(spline.status)")
            return
        }
        #expect(splineMethod == .spline)
        #expect(bound != metres)
    }

    /// A spline passes exactly through its control points, so the affine
    /// path's fit residual would read about zero under a visibly bent sheet.
    /// The two numbers must not come from the same fit.
    @Test func theSplineDoesNotReportTheAffinesResidual() throws {
        let spline = try ThinPlateSpline.solve(
            controlPoints: GeoreferenceFixtures.bent
        )
        // Measured at the spline's own control points, the miss is nothing:
        // the surface goes through them.
        let atItsOwnPoints = GeoreferenceFixtures.bent.map { point in
            WebMercator.groundMetres(
                from: WebMercator.unproject(spline.apply(x: point.pixel.x, y: point.pixel.y)),
                to: point.map
            )
        }
        #expect(atItsOwnPoints.allSatisfy { $0 < 1e-6 })

        // What the session reports is a different measurement entirely, and it
        // is not zero.
        let session = Self.session(GeoreferenceFixtures.bent, method: .spline)
        let report = try #require(session.report)
        #expect(report.rmsMetres > 1)
    }

    /// Two points on the same scan pixel are usually a double tap. The affine
    /// averages them away, so this arrives with a perfectly healthy affine
    /// solve — and the remedy is to delete one, not to spread the points out.
    @Test func twoPointsOnOnePixelSayThatRatherThanDegenerate() {
        var points = GeoreferenceFixtures.bent
        points[5] = GroundControlPoint(
            pixel: points[4].pixel, map: GeoPoint(lat: 46.3, lng: -61.3)
        )
        let session = Self.session(points, method: .spline)
        #expect(session.status == .coincidentPoints)
        // And the affine path, which does not have this problem, does not
        // borrow the message.
        #expect(Self.session(points).status != .coincidentPoints)
    }

    /// A cloud too thin to pin anything down is refused by both solvers and
    /// gets the shared status. Not called "collinear": the cloud is not a
    /// straight line, it is merely too close to one.
    @Test func aThinCloudIsDegenerateOnBothPaths() {
        let thin = (0..<6).map { index in
            GroundControlPoint(
                pixel: PixelPoint(x: Double(index) * 100, y: Double(index) * 100.05),
                map: GeoPoint(lat: 46 + Double(index) * 0.01, lng: -61 + Double(index) * 0.01)
            )
        }
        #expect(Self.session(thin).status == .degenerate)
        #expect(Self.session(thin, method: .spline).status == .degenerate)
    }

    /// Past the cap there is no leave-one-out figure, and the remedy differs
    /// from every other silence: there is nothing to fix and the sheet is
    /// unaffected. Folded into `exactFit`, a user with fifty-one points would
    /// be told their fit was exact and to add a fourth.
    @Test func pastTheCapTheSessionSaysThereIsNoFigureNotThatTheFitIsExact() {
        let many = GeoreferenceFixtures.irregular(
            count: GeoreferenceResiduals.maximumControlPointsForSplineResiduals + 1
        )
        let session = Self.session(many, method: .spline)
        #expect(session.status == .tooManyPoints)
        // The sheet still draws: this is a missing figure, not a missing fit.
        #expect(session.mesh != nil)
    }

    /// A spline session below the bending threshold takes the affine lattice,
    /// because at three points the bending weights are exactly zero and the
    /// two sheets agree to a nanometre. The only thing a 32×32 lattice buys
    /// there is two thousand draws in place of two.
    @Test func aSplineWithNoBendTakesTheAffineLattice() {
        let session = Self.session(
            Array(GeoreferenceFixtures.bent.prefix(3)), method: .spline
        )
        #expect(session.mesh?.count == GcpMesh.affineGridSize + 1)
    }

    /// The lattice coarsens while a point is under the finger and refines when
    /// it is released. This is the whole reason the drag state is tracked.
    @Test func theLatticeCoarsensDuringADragAndRefinesAfterIt() {
        var session = Self.session(GeoreferenceFixtures.bent, method: .spline)
        #expect(session.mesh?.count == GcpMesh.splineGridSize + 1)

        session.beginDrag(session.controlPoints[0].id)
        #expect(session.mesh?.count == GcpMesh.splineDragGridSize + 1)

        session.endDrag()
        #expect(session.mesh?.count == GcpMesh.splineGridSize + 1)
    }

    /// The affine path deliberately does not switch tiers: one cell is already
    /// exact, so a coarse drag tier would cost draws and buy nothing.
    @Test func theAffineLatticeDoesNotSwitchTiers() {
        var session = Self.session(GeoreferenceFixtures.bent)
        let settled = session.mesh?.count
        session.beginDrag(session.controlPoints[0].id)
        #expect(session.mesh?.count == settled)
    }

    /// Held-out points are scored with the same transform the sheet is drawn
    /// with, so the figure cannot disagree with what the user is looking at.
    @Test func heldOutPointsAreScoredWithTheSheetsOwnTransform() {
        var session = Self.session(GeoreferenceFixtures.bent)
        #expect(session.heldOut == nil)

        let checks = [
            GroundControlPoint(
                pixel: PixelPoint(x: 900, y: 800), map: GeoPoint(lat: 46.35, lng: -61.39)
            )
        ]
        session.replaceAll(
            with: session.controlPoints, checks: checks
        )
        let affine = session.heldOut
        #expect(affine?.count == 1)

        session.method = .spline
        let spline = session.heldOut
        #expect(spline?.count == 1)
        // Different fits, so a different answer at the same held-out point.
        #expect(spline?.rmsMetres != affine?.rmsMetres)
    }

    /// Switching the method re-derives everything at once. A session holding a
    /// spline's figure under an affine's sheet would be labelling one fit with
    /// another's number.
    @Test func switchingMethodRederivesTheWholeSession() {
        var session = Self.session(GeoreferenceFixtures.bent)
        let affineMesh = session.mesh?.count
        session.method = .spline
        #expect(session.mesh?.count != affineMesh)
        #expect(session.spline != nil)

        session.method = .affine
        #expect(session.mesh?.count == affineMesh)
        // The spline is dropped rather than kept stale: `nil` here means "not
        // asked", and a leftover would be a fit nothing on screen came from.
        #expect(session.spline == nil)
    }
}
