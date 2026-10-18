import Foundation
import Testing

@testable import GeoCore

@Suite("The track filter pipeline")
struct TrackFilterTests {
    private let start = Date(timeIntervalSince1970: 1_700_000_000)

    private func fix(
        lat: Double, lng: Double, accuracy: Double = 5, secondsIn: Double,
        altitude: Double? = nil
    ) -> TrackFix {
        TrackFix(
            latitude: lat, longitude: lng, altitudeM: altitude,
            accuracyM: accuracy, timestamp: start.addingTimeInterval(secondsIn)
        )
    }

    @Test func theFirstCleanFixIsAcceptedAndKept() {
        let result = TrackFilter.applyFix(
            TrackFilterState(), fix: fix(lat: 44.6, lng: -63.5, secondsIn: 0)
        )
        #expect(result.kept)
        #expect(result.accepted?.lat == 44.6)
        #expect(result.accepted?.lng == -63.5)
    }

    @Test func theAccuracyGateRejectsRoughAndBrokenFixes() {
        let state = TrackFilterState()
        // Worse than the 25 m gate.
        let rough = TrackFilter.applyFix(
            state, fix: fix(lat: 44.6, lng: -63.5, accuracy: 26, secondsIn: 0)
        )
        #expect(rough.accepted == nil)
        // A non-positive accuracy is a broken fix, not a perfect one.
        let broken = TrackFilter.applyFix(
            state, fix: fix(lat: 44.6, lng: -63.5, accuracy: 0, secondsIn: 0)
        )
        #expect(broken.accepted == nil)
        // Exactly at the gate passes.
        let atGate = TrackFilter.applyFix(
            state, fix: fix(lat: 44.6, lng: -63.5, accuracy: 25, secondsIn: 0)
        )
        #expect(atGate.accepted != nil)
    }

    @Test func aTeleportIsRejectedAgainstTheRawAnchor() {
        let first = TrackFilter.applyFix(
            TrackFilterState(), fix: fix(lat: 44.6, lng: -63.5, secondsIn: 0)
        )
        // ~111 m north in one second is far over 30 m/s.
        let teleport = TrackFilter.applyFix(
            first.next, fix: fix(lat: 44.601, lng: -63.5, secondsIn: 1)
        )
        #expect(teleport.accepted == nil)
        // The same move over ten seconds is a brisk walk-adjacent 11 m/s.
        let walked = TrackFilter.applyFix(
            first.next, fix: fix(lat: 44.601, lng: -63.5, secondsIn: 10)
        )
        #expect(walked.accepted != nil)
    }

    @Test func anOutOfOrderTimestampIsRejected() {
        let first = TrackFilter.applyFix(
            TrackFilterState(), fix: fix(lat: 44.6, lng: -63.5, secondsIn: 5)
        )
        let backwards = TrackFilter.applyFix(
            first.next, fix: fix(lat: 44.6001, lng: -63.5, secondsIn: 5)
        )
        #expect(backwards.accepted == nil)
    }

    @Test func acceptedFixesAreExponentiallySmoothed() throws {
        let first = TrackFilter.applyFix(
            TrackFilterState(), fix: fix(lat: 44.6, lng: -63.5, secondsIn: 0)
        )
        let second = TrackFilter.applyFix(
            first.next, fix: fix(lat: 44.6008, lng: -63.5, secondsIn: 10)
        )
        let accepted = try #require(second.accepted)
        // smoothed = prev + 0.6 × (fix − prev)
        #expect(abs(accepted.lat - (44.6 + 0.6 * 0.0008)) < 1e-12)
        #expect(accepted.lng == -63.5)
    }

    @Test func movementSmallerThanTheAdaptiveSpacingIsAcceptedButNotKept() throws {
        // Accuracy 20 means the spacing floor is max(2, 0.5 × 20) = 10 m.
        let first = TrackFilter.applyFix(
            TrackFilterState(),
            fix: fix(lat: 44.6, lng: -63.5, accuracy: 20, secondsIn: 0)
        )
        // ~4.5 m of raw northward movement smooths to ~2.7 m — noise at 20 m
        // accuracy.
        let jitter = TrackFilter.applyFix(
            first.next, fix: fix(lat: 44.60004, lng: -63.5, accuracy: 20, secondsIn: 5)
        )
        #expect(jitter.accepted != nil)
        #expect(!jitter.kept)
        // The suppressed point is remembered as the segment's last accepted
        // fix — the final-fix rule appends it when the segment closes.
        #expect(jitter.next.lastAccepted != nil)
    }
}

@Suite("Track simplification")
struct TrackSimplifyTests {
    private func point(_ lat: Double, _ lng: Double) -> GeoPoint {
        GeoPoint(lat: lat, lng: lng)
    }

    @Test func toleranceZeroKeepsEveryVertex() {
        let points = [point(44.6, -63.5), point(44.6001, -63.5), point(44.6002, -63.5)]
        #expect(TrackSimplify.simplifyIndices(points, toleranceM: 0) == [0, 1, 2])
    }

    @Test func collinearMiddleVerticesAreDropped() {
        // Points on a straight north-going line, ~11 m apart.
        let points = (0...5).map { point(44.6 + Double($0) * 0.0001, -63.5) }
        #expect(TrackSimplify.simplifyIndices(points, toleranceM: 1) == [0, 5])
    }

    @Test func aSpikeAboveToleranceIsKept() {
        // ~8 m eastward spike at index 2 on an otherwise straight line.
        let points = [
            point(44.6, -63.5),
            point(44.6001, -63.5),
            point(44.6002, -63.5001),
            point(44.6003, -63.5),
            point(44.6004, -63.5),
        ]
        let kept = TrackSimplify.simplifyIndices(points, toleranceM: 1)
        #expect(kept.contains(2))
        #expect(kept.first == 0)
        #expect(kept.last == 4)
        // The same spike vanishes under a 10 m tolerance.
        #expect(TrackSimplify.simplifyIndices(points, toleranceM: 10) == [0, 4])
    }

    @Test func segmentsSimplifyIndependently() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        func trackPoint(_ lat: Double, _ index: Int) -> TrackPoint {
            TrackPoint(
                lat: lat, lng: -63.5, altitudeM: nil, accuracyM: 5,
                timestamp: start.addingTimeInterval(Double(index))
            )
        }
        let segments = [
            [trackPoint(44.6, 0), trackPoint(44.6001, 1), trackPoint(44.6002, 2)],
            [trackPoint(44.7, 3), trackPoint(44.7001, 4)],
        ]
        let simplified = TrackSimplify.simplifySegments(segments, toleranceM: 1)
        #expect(simplified.count == 2)
        // The straight middle vertex of the first segment goes; the second
        // segment is two points and is untouched.
        #expect(simplified[0].count == 2)
        #expect(simplified[1].count == 2)
        // Kept vertices keep their own timestamps — the parallel times array
        // depends on index selection, not interpolation.
        #expect(simplified[0].last?.timestamp == start.addingTimeInterval(2))
    }
}
