import Foundation

/// The live per-fix pipeline from the field-capture contract, applied in fix
/// order against the last accepted fix: accuracy gate, teleport rejection,
/// exponential smoothing, then adaptive minimum spacing. Every constant comes
/// from `CaptureSpec` (pinned in the parity fixture) — never restate the
/// numbers here. Pure: the recorder owns the state and threads it through.
/// Ported case-for-case from `web/src/location/trackFilter.ts`.

/// A vertex the recorder keeps: smoothed position, the fix's own metadata.
public struct TrackPoint: Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public var altitudeM: Double?
    public var accuracyM: Double
    public var timestamp: Date

    public init(
        lat: Double, lng: Double, altitudeM: Double?, accuracyM: Double, timestamp: Date
    ) {
        self.lat = lat
        self.lng = lng
        self.altitudeM = altitudeM
        self.accuracyM = accuracyM
        self.timestamp = timestamp
    }
}

public struct TrackFilterState: Hashable, Sendable {
    /// Raw position of the last gate-passing fix — the speed check's anchor.
    /// Smoothing must not soften the teleport test.
    public var lastAcceptedRaw: TrackFix?
    /// Exponential-smoothing state over accepted fixes.
    public var smoothed: GeoPoint?
    /// Last vertex actually emitted (smoothed position).
    public var lastKept: GeoPoint?
    /// Last accepted (smoothed) point, kept or not — the contract's "final
    /// fix on stop is always kept" appends this when a segment closes.
    public var lastAccepted: TrackPoint?

    public init() {}
}

public enum TrackFilter {
    public struct FixResult: Sendable {
        public var next: TrackFilterState
        /// Non-nil when the fix passed the gates (counts as accepted).
        public var accepted: TrackPoint?
        /// True when the accepted point also became a vertex.
        public var kept: Bool
    }

    public static func applyFix(_ state: TrackFilterState, fix: TrackFix) -> FixResult {
        // Accuracy gate: a non-positive accuracy is a broken fix, not a
        // perfect one.
        guard fix.accuracyM > 0, fix.accuracyM <= CaptureSpec.TrackFilter.accuracyGateM else {
            return FixResult(next: state, accepted: nil, kept: false)
        }

        // Teleport rejection against the last accepted RAW position, and
        // out-of-order timestamps are rejected too.
        if let last = state.lastAcceptedRaw {
            let dtSeconds = fix.timestamp.timeIntervalSince(last.timestamp)
            guard dtSeconds > 0 else {
                return FixResult(next: state, accepted: nil, kept: false)
            }
            let metres = Geodesy.distanceMetres(
                from: GeoPoint(lat: last.latitude, lng: last.longitude),
                to: GeoPoint(lat: fix.latitude, lng: fix.longitude)
            )
            guard metres / dtSeconds <= CaptureSpec.TrackFilter.maxSpeedMps else {
                return FixResult(next: state, accepted: nil, kept: false)
            }
        }

        let alpha = CaptureSpec.TrackFilter.smoothingAlpha
        let smoothed: GeoPoint
        if let previous = state.smoothed {
            smoothed = GeoPoint(
                lat: previous.lat + alpha * (fix.latitude - previous.lat),
                lng: previous.lng + alpha * (fix.longitude - previous.lng)
            )
        } else {
            smoothed = GeoPoint(lat: fix.latitude, lng: fix.longitude)
        }

        let accepted = TrackPoint(
            lat: smoothed.lat,
            lng: smoothed.lng,
            altitudeM: fix.altitudeM,
            accuracyM: fix.accuracyM,
            timestamp: fix.timestamp
        )
        var next = state
        next.lastAcceptedRaw = fix
        next.smoothed = smoothed
        next.lastAccepted = accepted

        // Adaptive spacing: movement smaller than half the error radius is
        // noise, with a floor so a stationary pin-drop doesn't accumulate
        // vertices.
        let spacingM = max(
            CaptureSpec.TrackFilter.minSpacingFloorM,
            CaptureSpec.TrackFilter.spacingAccuracyFactor * fix.accuracyM
        )
        if let lastKept = state.lastKept,
           Geodesy.distanceMetres(from: lastKept, to: smoothed) < spacingM
        {
            return FixResult(next: next, accepted: accepted, kept: false)
        }
        next.lastKept = smoothed
        return FixResult(next: next, accepted: accepted, kept: true)
    }
}

/// Douglas-Peucker in local planar metres, ported from
/// `web/src/location/simplifyTrack.ts`. Vertices project to a plane about
/// the segment's mean latitude — the equirectangular error over track
/// extents is micrometres against metre tolerances. Stack-based on purpose:
/// a long recording must not recurse thousands of frames deep. Endpoints are
/// always kept, and the same kept indices apply to the parallel times array,
/// which is why the primitive returns indices rather than points.
public enum TrackSimplify {
    private struct Planar {
        var x: Double
        var y: Double
    }

    private static func project(_ points: [GeoPoint]) -> [Planar] {
        let meanLat = points.reduce(0) { $0 + $1.lat } / Double(points.count)
        let metresPerLngDegree =
            Geodesy.earthRadiusMetres * Geodesy.degreesToRadians
            * cos(meanLat * Geodesy.degreesToRadians)
        let metresPerLatDegree = Geodesy.earthRadiusMetres * Geodesy.degreesToRadians
        return points.map {
            Planar(x: $0.lng * metresPerLngDegree, y: $0.lat * metresPerLatDegree)
        }
    }

    private static func perpendicularDistance(_ point: Planar, _ a: Planar, _ b: Planar)
        -> Double
    {
        let dx = b.x - a.x
        let dy = b.y - a.y
        let lengthSquared = dx * dx + dy * dy
        if lengthSquared == 0 {
            return ((point.x - a.x) * (point.x - a.x) + (point.y - a.y) * (point.y - a.y))
                .squareRoot()
        }
        let t = max(0, min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
        let px = point.x - (a.x + t * dx)
        let py = point.y - (a.y + t * dy)
        return (px * px + py * py).squareRoot()
    }

    /// Kept indices, ascending; tolerance 0 (or fewer than 3 points) keeps
    /// all.
    public static func simplifyIndices(_ points: [GeoPoint], toleranceM: Double) -> [Int] {
        guard toleranceM > 0, points.count > 2 else {
            return Array(points.indices)
        }
        let planar = project(points)
        var keep = [Bool](repeating: false, count: points.count)
        keep[0] = true
        keep[points.count - 1] = true
        var stack: [(Int, Int)] = [(0, points.count - 1)]
        while let (first, last) = stack.popLast() {
            var maxDistance = 0.0
            var maxIndex = -1
            for index in (first + 1)..<last {
                let distance = perpendicularDistance(planar[index], planar[first], planar[last])
                if distance > maxDistance {
                    maxDistance = distance
                    maxIndex = index
                }
            }
            if maxIndex != -1, maxDistance > toleranceM {
                keep[maxIndex] = true
                stack.append((first, maxIndex))
                stack.append((maxIndex, last))
            }
        }
        return points.indices.filter { keep[$0] }
    }

    /// Runs per segment, so a pause boundary is never simplified across.
    public static func simplifySegments(
        _ segments: [[TrackPoint]], toleranceM: Double
    ) -> [[TrackPoint]] {
        segments.map { segment in
            simplifyIndices(
                segment.map { GeoPoint(lat: $0.lat, lng: $0.lng) }, toleranceM: toleranceM
            ).map { segment[$0] }
        }
    }
}
