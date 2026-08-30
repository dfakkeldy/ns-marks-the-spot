import Foundation
import Testing

@testable import GeoCore

@Suite("The track recorder state machine")
struct TrackRecordingTests {
    private let start = Date(timeIntervalSince1970: 1_700_000_000)

    private func fix(
        lat: Double, lng: Double = -63.5, accuracy: Double = 5, secondsIn: Double
    ) -> TrackFix {
        TrackFix(
            latitude: lat, longitude: lng, altitudeM: nil,
            accuracyM: accuracy, timestamp: start.addingTimeInterval(secondsIn)
        )
    }

    @Test func aWalkRecordsOneSegmentWithItsSpan() throws {
        var recording = TrackRecording()
        recording.start(now: start)
        // Four fixes ~11 m apart, ten seconds between them.
        for index in 0...3 {
            recording.addFix(fix(lat: 44.6 + Double(index) * 0.0001, secondsIn: Double(index * 10)))
        }
        let result = try #require(recording.stop(now: start.addingTimeInterval(30)))
        #expect(result.segments.count == 1)
        #expect(result.rawFixCount == 4)
        #expect(result.acceptedFixCount == 4)
        #expect(result.startedAt == start)
        #expect(result.endedAt == start.addingTimeInterval(30))
        #expect(result.recordingSeconds == 30)
        #expect(recording.status == .idle)
    }

    @Test func pauseClosesTheSegmentAndResumeOpensAFreshOne() throws {
        var recording = TrackRecording()
        recording.start(now: start)
        recording.addFix(fix(lat: 44.6, secondsIn: 0))
        recording.addFix(fix(lat: 44.6002, secondsIn: 10))
        recording.pause(now: start.addingTimeInterval(15))
        // A fix while paused is dropped entirely — not recorded, not raw.
        recording.addFix(fix(lat: 44.7, secondsIn: 20))
        recording.resume(now: start.addingTimeInterval(60))
        recording.addFix(fix(lat: 44.61, secondsIn: 60))
        recording.addFix(fix(lat: 44.6102, secondsIn: 70))
        let result = try #require(recording.stop(now: start.addingTimeInterval(75)))

        #expect(result.segments.count == 2)
        #expect(result.rawSegments.count == 2)
        #expect(result.rawFixCount == 4)
        // Only recording time counts: 15 s before the pause, 15 s after.
        #expect(result.recordingSeconds == 30)
        // The resumed segment's filter state is fresh — its first vertex is
        // the raw resumed position, not something smoothed across the gap.
        #expect(result.segments[1].first?.lat == 44.61)
    }

    @Test func theFinalAcceptedFixIsKeptWhenASegmentCloses() throws {
        var recording = TrackRecording()
        recording.start(now: start)
        recording.addFix(fix(lat: 44.6, secondsIn: 0))
        // ~1.1 m of movement: accepted, suppressed by the 2 m spacing floor.
        recording.addFix(fix(lat: 44.60001, secondsIn: 10))
        let result = try #require(recording.stop(now: start.addingTimeInterval(12)))
        // The track ends where the user did: the suppressed point is
        // appended on close.
        #expect(result.segments[0].count == 2)
        #expect(result.acceptedFixCount == 2)
    }

    @Test func rejectedFixesStayInTheRawLog() throws {
        var recording = TrackRecording()
        recording.start(now: start)
        recording.addFix(fix(lat: 44.6, secondsIn: 0))
        // Gated by accuracy; never a vertex, always evidence.
        recording.addFix(fix(lat: 44.6001, accuracy: 80, secondsIn: 10))
        #expect(recording.lastFixGated)
        let result = try #require(recording.stop(now: start.addingTimeInterval(12)))
        #expect(result.rawFixCount == 2)
        #expect(result.acceptedFixCount == 1)
        #expect(result.rawSegments[0].count == 2)
        #expect(result.segments[0].count == 1)
    }

    @Test func statsCountElapsedRecordingTimeOnly() {
        var recording = TrackRecording()
        recording.start(now: start)
        recording.addFix(fix(lat: 44.6, secondsIn: 0))
        recording.addFix(fix(lat: 44.6004, secondsIn: 20))
        let live = recording.stats(now: start.addingTimeInterval(20))
        #expect(live.status == .recording)
        #expect(live.elapsedSeconds == 20)
        #expect(live.keptVertexCount == 2)
        // ~44 m of northward walk at Halifax's latitude.
        #expect(abs(live.distanceM - 44.5) < 1)

        recording.pause(now: start.addingTimeInterval(30))
        let paused = recording.stats(now: start.addingTimeInterval(300))
        #expect(paused.status == .paused)
        #expect(paused.elapsedSeconds == 30)
    }

    @Test func startIsIdempotentAndStopWhileIdleReturnsNothing() {
        var recording = TrackRecording()
        #expect(recording.stop(now: start) == nil)
        recording.start(now: start)
        recording.start(now: start.addingTimeInterval(100))
        #expect(recording.stats(now: start.addingTimeInterval(10)).elapsedSeconds == 10)
    }
}
