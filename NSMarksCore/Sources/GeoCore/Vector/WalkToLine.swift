import Foundation

/// How far the reader is from a line, and which way it lies.
///
/// The landowner walking a boundary and the researcher finding a listed lot's
/// edge want the same two numbers, and the app already had every ingredient:
/// `SnapEngine.nearest` finds the closest point on a target set and reports the
/// distance, and `Geodesy.initialBearingDegrees` says which way it is. Nothing
/// computed the reader's distance to anything.
///
/// This is that reading, and only that reading. What it deliberately does NOT
/// do: it names no parcel, asserts no boundary, and turns nothing into a
/// position. It measures from a fix the device supplied to geometry the app
/// already has on screen — and both of those carry their own caveats, which
/// travel with the reading rather than being summarised away.
public enum WalkToLine {
    /// One reading, with everything a caller needs to say it honestly.
    public struct Reading: Sendable, Equatable {
        /// Ground distance from the fix to the nearest point on the target.
        public var distanceMetres: Double
        /// Degrees clockwise from TRUE north, or nil when the reader is
        /// standing on the point — where a bearing would be invented.
        public var bearingDegrees: Double?
        /// Which of the two target kinds this reading is against, so the
        /// caller says "to the boundary" or "to your shape" rather than
        /// guessing.
        public var source: SnapEngine.Source
        /// Whether the nearest thing was a corner or a run of edge. A reader
        /// walking to a corner and one walking to a line are doing different
        /// things.
        public var kind: SnapEngine.Kind

        /// Whether the fix's own accuracy is wider than the distance being
        /// reported.
        ///
        /// The one thing a distance readout can quietly get wrong: "3 m to the
        /// boundary" from a fix known to ±12 m is a number whose error bar
        /// swallows it whole, and a reader stepping to that line is trusting
        /// arithmetic the device cannot support. The caller says so; this
        /// says whether to.
        public var isWithinFixAccuracy: Bool
    }

    /// The reading from `fix` to the nearest of `targets`, or nil when there
    /// is nothing to measure to.
    ///
    /// NOT `SnapEngine.nearest`, and the difference matters. That one is
    /// vertex-first: it takes the nearest corner within the tolerance and only
    /// falls back to an edge when no corner is close enough, which is right for
    /// snapping — a gesture near a corner usually means the corner. Asked with
    /// an unbounded tolerance it would answer with the nearest corner every
    /// time, and a reader told "111 m to the boundary" while standing a metre
    /// from its edge has been given the wrong number for the question they
    /// asked.
    ///
    /// Unbounded is right here, though. A boundary forty metres away is exactly
    /// what somebody walking towards it wants to know about, and the caller
    /// decides what is too far to be worth showing.
    public static func reading(
        from fix: GeoPoint,
        accuracyMetres: Double?,
        to targets: [SnapEngine.Target]
    ) -> Reading? {
        var best: (point: GeoPoint, distance: Double, source: SnapEngine.Source, kind: SnapEngine.Kind)?
        let keep = {
            (point: GeoPoint, source: SnapEngine.Source, kind: SnapEngine.Kind) in
            // One ruler for every candidate. A segment projection works in a
            // local flat frame and a vertex is measured on the sphere, and
            // choosing between the two by comparing those numbers decides with
            // two different rulers — which this reading cannot afford, because
            // it removed the parcel-scale bound the projection was written
            // for. The projection says WHERE; the sphere says HOW FAR.
            let distance = Geodesy.distanceMetres(from: fix, to: point)
            guard let current = best else {
                best = (point, distance, source, kind)
                return
            }
            if distance < current.distance {
                best = (point, distance, source, kind)
                return
            }
            // A tie between a corner and a run of edge is a corner: it is the
            // more specific thing to be standing next to, and it is the one
            // that does not depend on which target the caller listed first.
            // A tie between two corners from different sources is genuinely
            // both — the point is on the parcel AND on the shape — and the
            // caller's order decides which is named.
            if distance == current.distance, kind == .vertex, current.kind == .edge {
                best = (point, distance, source, kind)
            }
        }
        for target in targets {
            for vertex in target.vertices {
                keep(vertex, target.source, .vertex)
            }
            for segment in target.segments {
                let hit = Geodesy.nearestPointOnSegment(point: fix, a: segment.0, b: segment.1)
                // A projection that lands on an end of the segment IS that
                // corner. Saying "to the boundary run" when the nearest thing
                // is a corner sends the reader to a line that is not the
                // nearest thing — and a caller may hand over segments with no
                // vertices listed, which is when this is the only thing
                // keeping the answer honest.
                let endpoint = hit.t <= 0.000_1 || hit.t >= 0.999_9
                keep(hit.point, target.source, endpoint ? .vertex : .edge)
            }
        }
        guard let best else { return nil }
        return Reading(
            distanceMetres: best.distance,
            bearingDegrees: Geodesy.initialBearingDegrees(from: fix, to: best.point),
            source: best.source,
            kind: best.kind,
            // An unknown accuracy is not a tight one. "Nil means nought" made
            // every unknown look tight at zero distance, which is exactly
            // where a reader is most likely to act on it.
            isWithinFixAccuracy: accuracyMetres.map { $0 >= 0 && $0 >= best.distance } ?? false
        )
    }
}
