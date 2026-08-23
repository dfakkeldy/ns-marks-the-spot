import Foundation

/// One control point in a georeferencing session: a place on the scan and the
/// place on the ground it is claimed to be, with an identity so it can be
/// dragged and deleted while the list around it changes.
public struct SessionControlPoint: Identifiable, Hashable, Sendable, Codable {
    public var id: String
    public var pixel: PixelPoint
    public var map: GeoPoint

    public init(id: String, pixel: PixelPoint, map: GeoPoint) {
        self.id = id
        self.pixel = pixel
        self.map = map
    }

    public var control: GroundControlPoint {
        GroundControlPoint(pixel: pixel, map: map)
    }
}

/// Which solver draws the sheet.
public enum GeoreferenceMethod: String, Hashable, Sendable, Codable {
    case affine
    case spline
}

/// What the panel can honestly say about the fit right now.
///
/// Ported from `web/src/userMaps/useGeoreferenceSession.ts`. The taxonomy is
/// the substance of the port: a state earns a case when its *remedy* differs,
/// not merely its cause. Folding two together tells a user to do something
/// that will not help.
public enum GeoreferenceStatus: Hashable, Sendable {
    /// Half a pair placed: a scan point waiting for its ground point.
    case awaitingMap
    case awaitingScan
    case needMore(remaining: Int)
    /// Refused by both solvers for a reason they share: a thin cloud, a
    /// non-finite result, or a transform that squashes one axis flat. Not
    /// named "collinear" — none of the three is a straight line on the scan.
    case degenerate
    /// Spline only: two control points on the same scan pixel, which is
    /// usually a double tap. An affine averages duplicates away, so this can
    /// arrive while the affine solve is perfectly healthy. Its own case
    /// because the remedy is concrete and different — delete the duplicate,
    /// not "spread your points out".
    case coincidentPoints
    /// Enough points to solve, too few for an accuracy figure to mean
    /// anything: the fit passes exactly through them by construction.
    case exactFit
    /// Spline only: past the cap, where leave-one-out would be n solves of an
    /// O(n³) system on every drag frame. Distinct from `exactFit` because the
    /// remedy differs — there is nothing to fix, and the sheet is unaffected.
    /// Folded together, a user with fifty-one points was told their fit was
    /// exact and to add a fourth.
    case tooManyPoints
    /// Spline only: the whole set solves and the sheet draws, but holding any
    /// one point back leaves the rest too thin to re-solve, so there is no
    /// leave-one-out figure. Distinct from `degenerate`, and the distinction
    /// is the point: there the map cannot be pinned down at all, here it is
    /// already on the screen. Copy saying the points "can't pin the map down"
    /// would be contradicted by what the user is looking at.
    case refitRefused
    /// Solved, with a figure — and the method that produced it, because the
    /// number means two different things.
    ///
    /// Under an affine it is the fit residual. Under a spline it is
    /// leave-one-out, which overstates true warp error by 1.8× to 3.7× and is
    /// never optimistic: a conservative upper bound, and copy has to frame it
    /// as one. The method is carried here rather than read separately by
    /// whoever renders it, because two derivations of the same fact can
    /// disagree and a caller holding the wrong one would label a bound as a
    /// residual with nothing to catch it.
    case solved(metres: Double, count: Int, method: GeoreferenceMethod)
}

/// A georeferencing session: the control points, what has been half-placed,
/// and everything derived from them.
///
/// A value, and deliberately not an object. The web's version is a React hook
/// whose hardest problems — ref mirrors, StrictMode double invocation,
/// debounced writes — are all consequences of that environment. None of them
/// exist here. What does carry across is every decision about *what the state
/// means*: the status taxonomy, the two-tier lattice during a drag, and when a
/// figure may be shown at all.
///
/// Persistence is not here either. This says what the points are; when to
/// write them down is the app's question.
public struct GeoreferenceSession: Sendable {
    /// A half-placed pair, waiting for its other side.
    public enum Pending: Hashable, Sendable {
        case scan(PixelPoint)
        case map(GeoPoint)
    }

    /// How many edits can be taken back. Deep enough to cover a working
    /// session, bounded so a long drag session cannot grow without limit.
    public static let undoLimit = 50

    public private(set) var controlPoints: [SessionControlPoint] = []
    public private(set) var pending: Pending?
    /// Points imported alongside a fit and deliberately kept out of it, so the
    /// fit can be scored against ground it never saw.
    public private(set) var checks: [GroundControlPoint] = []
    public private(set) var isDragging = false

    public var method: GeoreferenceMethod {
        didSet { if method != oldValue { refresh() } }
    }
    public var pixelSize: PixelSize {
        didSet { if pixelSize != oldValue { refresh() } }
    }
    public var sourceRect: PixelRect? {
        didSet { if sourceRect != oldValue { refresh() } }
    }

    /// An undo step: both point sets, because they are one placement.
    ///
    /// Checks used to sit outside the history. An import replaced them and an
    /// undo put the old control points back without them, leaving an accuracy
    /// figure measured against ground that came from a file no longer loaded —
    /// a number on screen scoring a placement it did not belong to.
    private struct Step {
        var controlPoints: [SessionControlPoint]
        var checks: [GroundControlPoint]
    }

    private var history: [Step] = []
    private var nextNumber = 1
    /// "The last thing that happened was an undo." A drag opens exactly one
    /// undo step, at its start; an undo during that drag consumes it, and
    /// every later move would then commit with nothing underneath it. This
    /// makes the first move after an undo open a fresh step, so the restored
    /// state stays reachable.
    private var undoConsumedStep = false
    /// Which point the live drag holds, so an undo that deletes that point can
    /// cancel the drag. Otherwise no drag-end ever arrives — the marker is
    /// gone — and the sheet stays on the coarse lattice for the rest of the
    /// session.
    private var draggedID: String?

    public private(set) var transform: AffineTransform?
    public private(set) var spline: ThinPlateSpline?
    public private(set) var mesh: [[GeoPoint]]?
    /// The lattice `mesh` was built on.
    ///
    /// Published rather than left for a caller to re-derive, because the choice
    /// has three inputs — the method, the bending threshold, and whether a drag
    /// is live — and a caller that guessed 32 during a drag would pair the
    /// ground mesh against a pixel lattice of a different shape. The renderer
    /// refuses that outright, so the sheet would vanish for exactly as long as
    /// the finger was down.
    public private(set) var meshGridSize = GcpMesh.affineGridSize
    public private(set) var report: GeoreferenceResiduals.Report?
    public private(set) var heldOut: GeoreferenceResiduals.HeldOutReport?
    public private(set) var status: GeoreferenceStatus = .needMore(
        remaining: AffineFit.minimumControlPoints
    )

    private var splineRefusal: ThinPlateSpline.Refusal?
    private var reportRefusal: GeoreferenceResiduals.SplineRefusal?

    public init(
        controlPoints: [SessionControlPoint] = [],
        pixelSize: PixelSize,
        method: GeoreferenceMethod = .affine,
        sourceRect: PixelRect? = nil
    ) {
        self.controlPoints = controlPoints
        self.pixelSize = pixelSize
        self.method = method
        self.sourceRect = sourceRect
        nextNumber = Self.highestNumber(in: controlPoints) + 1
        refresh()
    }

    public var canUndo: Bool { !history.isEmpty }

    // MARK: - Placing points

    /// A tap on the scan. Completes the pair when a ground point is waiting,
    /// and otherwise becomes the half that waits.
    public mutating func pickScanPoint(x: Double, y: Double) {
        if case .map(let map) = pending {
            snapshot()
            controlPoints.append(
                SessionControlPoint(id: mintID(), pixel: PixelPoint(x: x, y: y), map: map)
            )
            pending = nil
            refresh()
            return
        }
        pending = .scan(PixelPoint(x: x, y: y))
        refresh()
    }

    public mutating func pickMapPoint(lat: Double, lng: Double) {
        if case .scan(let pixel) = pending {
            snapshot()
            controlPoints.append(
                SessionControlPoint(
                    id: mintID(), pixel: pixel, map: GeoPoint(lat: lat, lng: lng)
                )
            )
            pending = nil
            refresh()
            return
        }
        pending = .map(GeoPoint(lat: lat, lng: lng))
        refresh()
    }

    /// Where the ground point waiting for its pair probably falls on the scan.
    ///
    /// A map-first tap means the user has named a place and now has to find it
    /// on the engraving, which is the expensive half of placing a point. This
    /// is what lets the scan pane move there so the hunt becomes a glance.
    ///
    /// Nil until three points exist: below that there is no transform, and a
    /// guess would be invention rather than a shortcut. Nil too while a scan
    /// point is the one waiting — the reader is already looking at the scan.
    ///
    /// Affine even when the sheet is warped by a spline, because this drives a
    /// recentre rather than a measurement. See `AffineFit.solveInverse`.
    public var pendingGroundOnScan: PixelPoint? {
        guard case .map(let ground) = pending,
              let inverse = AffineFit.solveInverse(controlPoints: controlPoints.map(\.control))
        else { return nil }
        let mercator = WebMercator.project(ground)
        let pixel = inverse.apply(x: mercator.x, y: mercator.y)
        guard pixel.x.isFinite, pixel.y.isFinite else { return nil }
        return PixelPoint(x: pixel.x, y: pixel.y)
    }

    public mutating func cancelPending() {
        pending = nil
        refresh()
    }

    // MARK: - Moving points

    /// Called when a drag starts, and only then. Snapshotting per touch move
    /// would make undo useless: one drag would fill the whole history with
    /// frames a pixel apart.
    public mutating func beginDrag(_ id: String) {
        draggedID = id
        isDragging = true
        snapshot()
        refresh()
    }

    /// Called when the drag really ends — never from a timer or from "no move
    /// for a while". A drag released without a final move would otherwise
    /// leave the sheet on the coarse lattice for the rest of the session.
    ///
    /// It must not snapshot: the step was opened at the start, and a second
    /// one here would make a single drag cost two undos.
    public mutating func endDrag() {
        draggedID = nil
        isDragging = false
        refresh()
    }

    public mutating func moveOnScan(_ id: String, x: Double, y: Double) {
        reopenStepIfUndoInterrupted()
        guard let index = controlPoints.firstIndex(where: { $0.id == id }) else { return }
        controlPoints[index].pixel = PixelPoint(x: x, y: y)
        refresh()
    }

    public mutating func moveOnMap(_ id: String, lat: Double, lng: Double) {
        reopenStepIfUndoInterrupted()
        guard let index = controlPoints.firstIndex(where: { $0.id == id }) else { return }
        controlPoints[index].map = GeoPoint(lat: lat, lng: lng)
        refresh()
    }

    public mutating func delete(_ id: String) {
        snapshot()
        controlPoints.removeAll { $0.id == id }
        refresh()
    }

    /// Replaces every control point at once, for a points file computed
    /// outside the app.
    ///
    /// Replaces rather than merges: an imported set is a complete proposal for
    /// the sheet, and merging would need a collision policy no caller could
    /// reason about. One undo takes the whole import back, so what was there
    /// before is recoverable rather than gone.
    public mutating func replaceAll(
        with imported: [SessionControlPoint], checks: [GroundControlPoint] = []
    ) {
        snapshot()
        // A half-placed pair must not survive the replacement: its other half
        // would be matched against a set it was never picked in.
        pending = nil
        controlPoints = imported
        // Re-seeded from the imported set. Imported ids are the file's own
        // labels and normally do not look like this session's, but a file that
        // used the same form would otherwise hand the next placed point an id
        // that already exists — and two points sharing an id cannot be dragged
        // or deleted apart.
        nextNumber = Self.highestNumber(in: imported) + 1
        self.checks = checks
        refresh()
    }

    public mutating func undo() {
        guard let step = history.popLast() else { return }
        let restored = step.controlPoints
        controlPoints = restored
        checks = step.checks
        pending = nil
        if let draggedID, !restored.contains(where: { $0.id == draggedID }) {
            // This undo deleted the point the live drag holds. Its marker is
            // gone, so the drag can never end on its own, and the sheet would
            // sit on the coarse lattice until the next drag. Cancelled here
            // and only here: an undo the dragged point survives keeps the
            // tier, because the finger is still down and moves are still
            // arriving.
            self.draggedID = nil
            isDragging = false
        }
        undoConsumedStep = true
        refresh()
    }

    // MARK: - Derivation

    private mutating func snapshot() {
        undoConsumedStep = false
        history.append(Step(controlPoints: controlPoints, checks: checks))
        if history.count > Self.undoLimit { history.removeFirst() }
    }

    private mutating func reopenStepIfUndoInterrupted() {
        if undoConsumedStep { snapshot() }
    }

    private mutating func mintID() -> String {
        defer { nextNumber += 1 }
        return "gcp-\(nextNumber)"
    }

    private static func highestNumber(in points: [SessionControlPoint]) -> Int {
        points.reduce(0) { highest, point in
            guard point.id.hasPrefix("gcp-"),
                  let number = Int(point.id.dropFirst(4))
            else { return highest }
            return max(highest, number)
        }
    }

    private mutating func refresh() {
        let controls = controlPoints.map(\.control)
        transform = AffineFit.solve(controlPoints: controls)

        // Solved only when the spline is the chosen method: it is an O(n³)
        // factorisation and this runs on every touch move of a drag. `nil`
        // therefore means "not asked" as often as it means "refused", which is
        // why the refusal is kept separately rather than inferred from it.
        spline = nil
        splineRefusal = nil
        if method == .spline {
            do {
                spline = try ThinPlateSpline.solve(controlPoints: controls)
            } catch {
                splineRefusal = error
            }
        }

        (mesh, meshGridSize) = buildMesh()
        (report, reportRefusal) = buildReport(controls)
        heldOut = buildHeldOut()
        status = buildStatus()
    }

    /// The lattice and the mesh together, because they are one decision: a
    /// caller holding one without the other cannot pair them.
    private func buildMesh() -> ([[GeoPoint]]?, Int) {
        // Below the bending threshold a spline session takes the affine
        // lattice, because at three points the bending weights are exactly
        // zero and the two sheets agree to a nanometre. The only thing a
        // 32×32 lattice buys there is two thousand draws in place of two.
        if method == .spline,
           controlPoints.count >= ThinPlateSpline.minimumBendingControlPoints {
            let gridSize = isDragging ? GcpMesh.splineDragGridSize : GcpMesh.splineGridSize
            guard let spline else { return (nil, gridSize) }
            // Two tiers, and only on the spline path. Each cell costs two
            // clipped draws of the whole source, and a drag emits state on
            // every touch move; the coarse tier is what keeps that a live warp
            // rather than a slideshow. The affine path deliberately does not
            // switch tiers — one cell is already exact, so a "drag tier" there
            // would cost hundreds of draws in place of two and buy nothing.
            return (
                try? GcpMesh.latLngMesh(
                    spline, pixelSize: pixelSize, gridSize: gridSize, sourceRect: sourceRect
                ),
                gridSize
            )
        }
        guard let transform else { return (nil, GcpMesh.affineGridSize) }
        return (
            try? GcpMesh.latLngMesh(
                transform, pixelSize: pixelSize, sourceRect: sourceRect
            ),
            GcpMesh.affineGridSize
        )
    }

    /// Method-aware, because the two fits have completely different residual
    /// signals and only one of them is ever non-zero.
    ///
    /// The spline path re-solves n times, each time without one control point,
    /// and measures how far the surface misses the point it never saw. A
    /// spline passes exactly through its control points, so the full-set fit
    /// residual — the number the affine path reports — reads about zero at
    /// every point at every count, and showing it under a bent sheet would
    /// print "0 m" for a visibly wrong map.
    private func buildReport(
        _ controls: [GroundControlPoint]
    ) -> (GeoreferenceResiduals.Report?, GeoreferenceResiduals.SplineRefusal?) {
        if method == .spline {
            do {
                return (try GeoreferenceResiduals.splineReport(controlPoints: controls), nil)
            } catch {
                return (nil, error)
            }
        }
        guard let transform else { return (nil, nil) }
        return (
            GeoreferenceResiduals.report(controlPoints: controls, transform: transform),
            nil
        )
    }

    /// Scored with the same transform the sheet is drawn with, so the figure
    /// cannot disagree with what the user is looking at.
    private func buildHeldOut() -> GeoreferenceResiduals.HeldOutReport? {
        guard !checks.isEmpty else { return nil }
        if method == .spline {
            guard let spline else { return nil }
            return GeoreferenceResiduals.heldOutReport(checks: checks) {
                spline.apply(x: $0, y: $1)
            }
        }
        guard let transform else { return nil }
        return GeoreferenceResiduals.heldOutReport(checks: checks) {
            transform.apply(x: $0, y: $1)
        }
    }

    private func buildStatus() -> GeoreferenceStatus {
        // A half-placed pair is the most urgent thing to say, so it outranks
        // the count.
        switch pending {
        case .scan: return .awaitingMap
        case .map: return .awaitingScan
        case nil: break
        }
        if controlPoints.count < AffineFit.minimumControlPoints {
            return .needMore(remaining: AffineFit.minimumControlPoints - controlPoints.count)
        }
        if splineRefusal == .coincidentPoints {
            return .coincidentPoints
        }
        // Every refusal the two solvers share arrives here. The second clause
        // is not redundant and the implication runs one way: the spline
        // refuses a strict superset of what the affine does, and it also
        // solves its own interpolation system, which can come out singular
        // while the affine and both conditioning gates are healthy. Testing
        // only the affine would report "solved" over a sheet that draws
        // nothing.
        if transform == nil || (method == .spline && spline == nil) {
            return .degenerate
        }
        if let reportRefusal {
            // Told apart by the reason the solver handed back rather than by a
            // predicate re-derived out here. Re-deriving is not even available:
            // a refused refit is only knowable by running the n leave-one-out
            // solves, which is the cost the cap exists to bound.
            switch reportRefusal {
            case .tooFewPoints:
                // The same claim the affine path makes below, true for the
                // same reason: with three points the spline is the affine
                // through them, so there is nothing to hold back.
                return .exactFit
            case .tooManyPoints:
                return .tooManyPoints
            case .refitRefused:
                return .refitRefused
            }
        }
        guard let report else {
            // Affine only — the spline path has returned above whether or not
            // it has numbers. Enough points to solve, too few for a residual
            // to mean anything.
            return .exactFit
        }
        return .solved(
            metres: report.rmsMetres, count: controlPoints.count, method: method
        )
    }
}
