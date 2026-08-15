import Foundation

/// How far a georeference misses the points it was built from, and the points
/// it never saw.
///
/// Ported from `web/src/userMaps/transform/residuals.ts`, measured thresholds
/// and all. Every figure here is in *ground* metres.
public enum GeoreferenceResiduals {
    /// Below this an affine fit passes exactly through every point by
    /// construction, so residuals are all zero and mean nothing.
    ///
    /// Private, because the one caller is `report` below and nothing outside
    /// this file makes the decision it governs. A panel showing "0 m" for three
    /// points would be stating an accuracy it has no evidence for; the caller's
    /// copy is "add a fourth point to check accuracy".
    private static let minimumControlPointsForResiduals = 4

    /// Below this the RMS is reported but nobody is accused.
    ///
    /// Four points fitting three parameters leave a ONE-DIMENSIONAL residual
    /// space: the residual-maker `I - H` has rank `n - p = 1`, so every
    /// attainable residual vector is a scalar multiple of a single direction,
    /// and that direction comes from the design matrix — the pixel coordinates
    /// — alone. Displacing a different control point rescales that vector; it
    /// cannot rotate it.
    ///
    /// So at four points the largest residual identifies where the user
    /// clicked, not which click was wrong, and it is the same index whichever
    /// point is actually bad. That kills raw, leave-one-out and studentized
    /// ranking together, since all three rank by magnitude along one fixed
    /// direction. A 1104-trial sweep on the web agreed: 24% correct against a
    /// 25% baseline. Highlighting a row here would be a coin toss presented as
    /// a diagnosis. At five points there are two residual dimensions, the
    /// direction can respond to the data, and the same sweep scores 60%
    /// against 20%.
    public static let minimumControlPointsForSuspect = 5

    /// Produced by two functions whose numbers mean different things — read
    /// each field with its producer in mind.
    public struct Report: Hashable, Sendable {
        /// Per-point error in ground metres, in the input's order.
        ///
        /// From `report(controlPoints:transform:)` this is the affine *fit*
        /// residual. From `splineReport(controlPoints:)` it is a leave-one-out
        /// *prediction* error, which is a conservative upper bound on true warp
        /// error — measured to overstate it by 1.8× (n=12) to 3.7× (n=4), and
        /// never to be optimistic. Interface copy must frame the spline figure
        /// as a bound ("no worse than …"), not as the error.
        public var metresPerControlPoint: [Double]
        public var rmsMetres: Double
        /// The least consistent point, or nil below the producer's floor.
        ///
        /// Only on the affine path is this the worst-*fitting* point, i.e. the
        /// largest entry above. `splineReport` ranks by the affine fit residual
        /// while displaying leave-one-out magnitudes, so there it is
        /// deliberately not the largest number in the column.
        public var mostInconsistentIndex: Int?
    }

    /// Distance between where the transform predicts each point lands and where
    /// the user actually put it, in ground metres.
    ///
    /// Ground, not Mercator: Mercator inflates by 1/cos(latitude), 1.44× at
    /// Nova Scotian latitudes, so a Mercator-magnitude residual would overstate
    /// every accuracy figure by nearly half. This also makes the figure *not*
    /// directly comparable to QGIS's, which reports in the target CRS's own
    /// units — Mercator metres for EPSG:3857, about 1.44× larger here.
    public static func metres(
        of transform: AffineTransform, at controlPoints: [GroundControlPoint]
    ) -> [Double] {
        controlPoints.map { point in
            let predicted = WebMercator.unproject(
                transform.apply(x: point.pixel.x, y: point.pixel.y)
            )
            return WebMercator.groundMetres(from: predicted, to: point.map)
        }
    }

    public static func rms(_ residuals: [Double]) -> Double {
        guard !residuals.isEmpty else { return 0 }
        return (residuals.reduce(0) { $0 + $1 * $1 } / Double(residuals.count)).squareRoot()
    }

    /// The numbers a control-point list renders for an affine drape.
    ///
    /// An earlier design picked the highlighted row by leave-one-out refit, on
    /// the theory that least squares smears a gross error across every point
    /// and so the largest fit residual accuses an innocent one. The first half
    /// is true; the conclusion is not, because the outlier also corrupts each
    /// refit that still contains it. Measured over 1104 trials, leave-one-out
    /// won 147 times and lost 150 — a wash — while costing an extra solve per
    /// point on every pointer move of a drag. It was dropped for the plain fit
    /// residual.
    public static func report(
        controlPoints: [GroundControlPoint], transform: AffineTransform
    ) -> Report? {
        guard controlPoints.count >= minimumControlPointsForResiduals else { return nil }
        let metresPerControlPoint = metres(of: transform, at: controlPoints)
        return Report(
            metresPerControlPoint: metresPerControlPoint,
            rmsMetres: rms(metresPerControlPoint),
            mostInconsistentIndex: controlPoints.count >= minimumControlPointsForSuspect
                ? worst(of: metresPerControlPoint) : nil
        )
    }

    /// Below this there is nothing to leave out: one point held back from n
    /// leaves n-1 for the refit. Derived from the solver's own floor rather
    /// than written down again, so the two cannot drift apart.
    private static let minimumControlPointsForSplineResiduals =
        ThinPlateSpline.minimumControlPoints + 1

    /// Above this the report is refused entirely — never a partial array.
    ///
    /// Leave-one-out is n solves and a single spline solve is O(n³), so cost
    /// climbs towards n⁴. Measured on the web (node 22, warm, median of 5,
    /// irregular layouts): n=30 → 1.5 ms, 40 → 3.0, 50 → 6.3, 60 → 11.7,
    /// 80 → 31.5, 100 → 68.7, and ~4 s at n=300. It shares a frame with a mesh
    /// rebuild on every pointer move of a drag, so 50 is the largest count that
    /// stays inside half a 16 ms frame.
    ///
    /// Refusing the whole report is the only honest cap, because the two
    /// cheaper-sounding ones are not available. "Report the RMS only" would
    /// print 0 m — the RMS here is computed *from* the leave-one-out array, and
    /// the fit residual it would otherwise come from is identically ~0 for a
    /// spline that interpolates its control points. "Keep the number, drop the
    /// highlight" saves nothing: the highlight is the cheap half, one affine
    /// solve, and leave-one-out is the expensive half.
    ///
    /// The array is full or absent because a list indexes it per row; a short
    /// one renders nothing past its end.
    public static let maximumControlPointsForSplineResiduals = 50

    /// Below this the leave-one-out figures are reported but nobody is accused.
    ///
    /// It lands on the same value as `minimumControlPointsForSuspect` and was
    /// derived independently: that constant's argument is about the rank of a
    /// least-squares residual space, which says nothing about an interpolating
    /// spline. This one is measured, on irregular layouts and never a lattice.
    /// n=4 is a dead wash — 24.98% correct against a 25.00% baseline over
    /// 32 000 pooled trials, flat across every displacement band including
    /// 2-4 km, so no amount of gross error rescues it. n=5 is the first count
    /// that clears chance, 32.4% against 20.0%, and there the signal comes
    /// entirely from errors of roughly 125 m and up.
    public static let minimumControlPointsForSplineSuspect = 5

    /// Why a spline accuracy figure was refused. The three are not
    /// interchangeable at the panel — they take different copy and imply
    /// different remedies — and collapsing them is a defect the web shipped
    /// twice.
    public enum SplineRefusal: Error, Equatable, Sendable {
        /// Fewer than the floor, so there is nothing to leave out. Remedy: add
        /// a point.
        case tooFewPoints
        /// Past the cost cap, where n refits of an O(n³) system would blow the
        /// drag frame. Remedy: none — the drape is unaffected and nothing is
        /// wrong with the points.
        case tooManyPoints
        /// The full set solves, but holding one point back leaves the rest too
        /// thin. Remedy: spread the points out. Measured reachable at n = 4, 5,
        /// 6, 8, 12 and 20 with (n-1) points on a line.
        ///
        /// A reason rather than a plain nil because a caller cannot re-derive
        /// this one: the count-based two are an O(1) length test, but detecting
        /// this from outside would mean running the n solves again, doubling
        /// the exact cost the cap exists to bound.
        case refitRefused
    }

    /// The numbers a control-point list renders under a spline warp.
    ///
    /// The two halves come from different fits, and that is the point:
    ///
    /// - The magnitudes are leave-one-out — refit without each point in turn,
    ///   and measure how far the surface misses the point it never saw. It is
    ///   the only non-zero signal an interpolating spline has, since its fit
    ///   residual is ~0 by construction at every count. What it yields is a
    ///   conservative upper bound, not a point estimate: measured against 60
    ///   held-out checks over 1200 trials per n, the median ratio to true error
    ///   is 3.71 at n=4, 2.20 at n=8, 1.77 at n=12, with a 10th percentile of
    ///   at least 1.09 everywhere — never optimistic. Its Spearman correlation
    ///   with true error runs 0.63 to 0.79, which is what makes it worth
    ///   showing at all.
    /// - The suspect is ranked by the plain *affine* fit residual, even though
    ///   a spline is what is on screen. Measured paired on identical trials: at
    ///   n=8 the affine residual finds the displaced point 62.9% of the time
    ///   against leave-one-out's 46.8%, 943 affine-only wins to 299, z = -18.3.
    ///   The mechanism is the interpolation property again — an outlier left in
    ///   a refit is absorbed into the spline's *shape*, bending the surface
    ///   around itself, which corrupts its neighbours' scores far more than
    ///   least-squares smearing does, so leave-one-out tends to accuse an
    ///   innocent neighbour. Affine is also the cheaper of the two.
    ///
    /// So the highlighted row is often not the largest number in the column.
    /// That is what the row's copy claims — "disagrees most with the other
    /// points" is a consistency claim, not a largest-error one. Do not "fix"
    /// the mismatch by re-ranking to the displayed magnitudes.
    public static func splineReport(
        controlPoints: [GroundControlPoint]
    ) throws(SplineRefusal) -> Report {
        guard controlPoints.count >= minimumControlPointsForSplineResiduals else {
            throw .tooFewPoints
        }
        guard controlPoints.count <= maximumControlPointsForSplineResiduals else {
            throw .tooManyPoints
        }

        // Ahead of the n refits, because it is one cheap solve and it can rule
        // the whole report out: the spline solver refuses everything the affine
        // solver refuses (its destination gate *is* an affine solve), so a
        // refusal here means there is no spline on screen to report an accuracy
        // for.
        //
        // Reported as `refitRefused` rather than earning a fourth reason, and
        // the justification is structural rather than statistical: a session's
        // status evaluates this identical affine solve first and calls the
        // record degenerate, so no caller can surface this branch's copy.
        //
        // Do NOT restate this as "removing a point from a cloud too thin to fit
        // cannot thicken it". That rule is false: pixels (0,0) (0,1) (1,0)
        // (100000,0.5) score 6.6e-6 as a set and ~0.5 once the far point is
        // dropped. The implication survives only because the other subsets
        // still contain the far point and stay thin — which is much weaker than
        // the unreachability above.
        guard let affine = AffineFit.solve(controlPoints: controlPoints) else {
            throw .refitRefused
        }

        var metresPerControlPoint = [Double]()
        for held in controlPoints.indices {
            var rest = controlPoints
            rest.remove(at: held)
            // Dropping a point can leave the rest too thin to solve, and the
            // caller indexes this array per row — so the whole report goes
            // rather than a short one.
            guard let spline = try? ThinPlateSpline.solve(controlPoints: rest) else {
                throw .refitRefused
            }
            let point = controlPoints[held]
            let predicted = WebMercator.unproject(
                spline.apply(x: point.pixel.x, y: point.pixel.y)
            )
            metresPerControlPoint.append(
                WebMercator.groundMetres(from: predicted, to: point.map)
            )
        }

        return Report(
            metresPerControlPoint: metresPerControlPoint,
            rmsMetres: rms(metresPerControlPoint),
            mostInconsistentIndex: controlPoints.count >= minimumControlPointsForSplineSuspect
                ? worst(of: metres(of: affine, at: controlPoints)) : nil
        )
    }

    /// Accuracy at points the fit never saw.
    ///
    /// Every other figure here is measured at the fit's own control points,
    /// which is why they need hedging: an affine fit residual is in-sample, and
    /// the spline figure is a leave-one-out upper bound. This one is neither.
    /// The checks are held out by construction, so their error is the plain
    /// question a georeferencer actually has — is the map in the right place? —
    /// and it is the only figure here that can fall while the others rise.
    ///
    /// That divergence is not hypothetical. On Fletcher sheet 19, deleting the
    /// controls with the largest leave-one-out values took that figure from
    /// 309 m to 140 m while true error at eight frozen checks went from 43 m to
    /// 392 m: the survivors agreed with each other and drifted off the ground
    /// together.
    public struct HeldOutReport: Hashable, Sendable {
        public var count: Int
        public var rmsMetres: Double
        public var maxMetres: Double
    }

    public static func heldOutReport(
        checks: [GroundControlPoint], project: (Double, Double) -> MercatorPoint
    ) -> HeldOutReport? {
        guard !checks.isEmpty else { return nil }
        let metres = checks.map { check in
            WebMercator.groundMetres(
                from: WebMercator.unproject(project(check.pixel.x, check.pixel.y)),
                to: check.map
            )
        }
        // A refused or degenerate transform projects to NaN. Reporting 0 m, or
        // an RMS over a mix of numbers and NaN, would read as a perfect score
        // for a map that cannot be drawn at all.
        guard metres.allSatisfy(\.isFinite) else { return nil }
        return HeldOutReport(
            count: checks.count, rmsMetres: rms(metres), maxMetres: metres.max() ?? 0
        )
    }

    /// Ties go to the first index, so a caller comparing an index it computed
    /// itself against one of these is comparing like with like.
    private static func worst(of metres: [Double]) -> Int? {
        guard !metres.isEmpty else { return nil }
        var best = 0
        for index in 1..<metres.count where metres[index] > metres[best] {
            best = index
        }
        return best
    }
}
