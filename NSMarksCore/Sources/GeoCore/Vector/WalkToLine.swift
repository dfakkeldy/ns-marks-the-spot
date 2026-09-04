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
            (point: GeoPoint, distance: Double, source: SnapEngine.Source, kind: SnapEngine.Kind) in
            // Strictly nearer, so a tie goes to whatever was found first — and
            // vertices are walked first, which is the answer a reader standing
            // exactly on a corner should get.
            if best.map({ distance < $0.distance }) ?? true {
                best = (point, distance, source, kind)
            }
        }
        for target in targets {
            for vertex in target.vertices {
                keep(vertex, Geodesy.distanceMetres(from: fix, to: vertex), target.source, .vertex)
            }
            for segment in target.segments {
                let hit = Geodesy.nearestPointOnSegment(point: fix, a: segment.0, b: segment.1)
                keep(hit.point, hit.distanceMetres, target.source, .edge)
            }
        }
        guard let best else { return nil }
        return Reading(
            distanceMetres: best.distance,
            bearingDegrees: Geodesy.initialBearingDegrees(from: fix, to: best.point),
            source: best.source,
            kind: best.kind,
            isWithinFixAccuracy: (accuracyMetres ?? 0) >= best.distance
        )
    }
}
