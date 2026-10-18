import Foundation
import Testing

@testable import GeoCore

/// A walk written down while it happens, and read back afterwards.
///
/// The recording used to live only in memory. Since the walk continues while
/// the phone is in a pocket, the process holding it is one iOS can end at any
/// moment — so what these check is that the journal is enough to rebuild the
/// walk, and that it never says more about it than was written down.
@Suite("A walk written down")
struct TrackJournalTests {
    private func fix(
        _ seconds: TimeInterval,
        lat: Double = 45.0,
        lng: Double = -63.0,
        altitudeM: Double? = nil,
        accuracyM: Double = 5
    ) -> TrackFix {
        TrackFix(
            latitude: lat,
            longitude: lng,
            altitudeM: altitudeM,
            accuracyM: accuracyM,
            timestamp: Date(timeIntervalSince1970: seconds)
        )
    }

    /// A walk twenty metres up a line, with a pause in the middle of it.
    private func walkEntries() -> [TrackJournal.Entry] {
        var entries: [TrackJournal.Entry] = [
            .started(id: UUID(uuidString: "00000000-0000-0000-0000-0000000000AA")!,
                     at: Date(timeIntervalSince1970: 1_000))
        ]
        for step in 0..<6 {
            entries.append(
                .fix(fix(1_001 + Double(step), lat: 45.0 + Double(step) * 0.0002))
            )
        }
        entries.append(.paused(at: Date(timeIntervalSince1970: 1_010)))
        entries.append(.resumed(at: Date(timeIntervalSince1970: 1_100)))
        for step in 0..<6 {
            entries.append(
                .fix(fix(1_101 + Double(step), lat: 45.01 + Double(step) * 0.0002))
            )
        }
        return entries
    }

    /// The whole claim of the journal in one test: replaying the recorder's
    /// inputs produces the walk the recorder produced. Nothing derived is
    /// stored, so nothing derived can be stored wrongly.
    @Test("Read back, it is the same walk")
    func readBackItIsTheSameWalk() throws {
        let entries = walkEntries()
        var live = TrackRecording()
        for entry in entries {
            switch entry {
            case .started(_, let at): live.start(now: at)
            case .fix(let fix): live.addFix(fix)
            case .paused(let at): live.pause(now: at)
            case .resumed(let at): live.resume(now: at)
            case .stopped: break
            }
        }
        let stoppedAt = Date(timeIntervalSince1970: 1_110)
        let stopped = live.stop(now: stoppedAt)
        let expected = try #require(stopped)

        let restored = try #require(
            TrackJournal.replay(
                TrackJournal.decode(TrackJournal.encode(entries + [.stopped(at: stoppedAt)]))
            )
        )
        #expect(restored.wasInterrupted == false)
        #expect(restored.result.startedAt == expected.startedAt)
        #expect(restored.result.endedAt == expected.endedAt)
        #expect(restored.result.rawFixCount == expected.rawFixCount)
        #expect(restored.result.acceptedFixCount == expected.acceptedFixCount)
        #expect(restored.result.recordingSeconds == expected.recordingSeconds)
        #expect(restored.result.distanceM == expected.distanceM)
        #expect(restored.result.segments == expected.segments)
        #expect(restored.result.rawSegments == expected.rawSegments)
    }

    /// The pause is a segment boundary, and it has to survive the round trip
    /// as one. A journal that recorded only fixes would replay ninety seconds
    /// of standing still as a straight line drawn across it.
    @Test("A pause is still a segment boundary after a round trip")
    func aPauseIsStillASegmentBoundary() throws {
        let restored = try #require(
            TrackJournal.replay(TrackJournal.decode(TrackJournal.encode(walkEntries())))
        )
        #expect(restored.result.segments.count == 2)
        #expect(restored.result.rawSegments.count == 2)
        #expect(restored.result.rawSegments.allSatisfy { !$0.isEmpty })
    }

    /// An altitude the fix did not carry must not come back as zero metres.
    /// Zero is a claim about the ground; absent is the truth.
    @Test("An absent altitude comes back absent, never zero")
    func anAbsentAltitudeComesBackAbsent() throws {
        let id = UUID()
        let entries: [TrackJournal.Entry] = [
            .started(id: id, at: Date(timeIntervalSince1970: 1_000)),
            .fix(fix(1_001, altitudeM: nil)),
            .fix(fix(1_002, lat: 45.001, altitudeM: 31.5)),
        ]
        let decoded = TrackJournal.decode(TrackJournal.encode(entries))
        #expect(decoded == entries)
        let restored = try #require(TrackJournal.replay(decoded))
        let raw = try #require(restored.result.rawSegments.first)
        #expect(raw[0].altitudeM == nil)
        #expect(raw[1].altitudeM == 31.5)
    }

    /// A process killed in the middle of an append leaves half a line. What
    /// was written whole is the walk; the fragment is not a fix and is not
    /// guessed at.
    @Test("A half-written last line is dropped and everything before it kept")
    func aHalfWrittenLastLineIsDropped() throws {
        let entries = walkEntries()
        var bytes = TrackJournal.encode(entries)
        // A fix that was being written when the process ended.
        let torn = try #require(TrackJournal.line(for: .fix(fix(1_200))))
        bytes.append(torn.prefix(torn.count / 2))

        let decoded = TrackJournal.decode(bytes)
        #expect(decoded == entries)
        let restored = try #require(TrackJournal.replay(decoded))
        #expect(restored.result.rawFixCount == 12)
    }

    /// The distinction the whole restore rests on: a journal that runs out
    /// while the walk is going was ended by something other than the reader.
    @Test("A journal that runs out mid-walk reads as interrupted")
    func aJournalThatRunsOutMidWalkReadsAsInterrupted() throws {
        let restored = try #require(
            TrackJournal.replay(TrackJournal.decode(TrackJournal.encode(walkEntries())))
        )
        #expect(restored.wasInterrupted)
    }

    /// And it ends where the journal ended, not when it was read.
    ///
    /// An app terminated in the morning and opened in the evening did not
    /// record all afternoon. A walk that says it did is a measurement nobody
    /// took.
    @Test("An interrupted walk ends at its last fix, not at the time it is read")
    func anInterruptedWalkEndsAtItsLastFix() throws {
        let restored = try #require(
            TrackJournal.replay(TrackJournal.decode(TrackJournal.encode(walkEntries())))
        )
        // The last fix in the fixture.
        #expect(restored.result.endedAt == Date(timeIntervalSince1970: 1_106))
        // The first six seconds and the six after the resume, and none of the
        // ninety seconds it stood paused.
        #expect(abs(restored.result.recordingSeconds - 16) < 0.001)
    }

    /// A walk paused when the process ended banks no time for the gap either.
    @Test("A walk interrupted while paused banks nothing for the pause")
    func aWalkInterruptedWhilePausedBanksNothing() throws {
        let entries: [TrackJournal.Entry] = [
            .started(id: UUID(), at: Date(timeIntervalSince1970: 1_000)),
            .fix(fix(1_010)),
            .paused(at: Date(timeIntervalSince1970: 1_020)),
        ]
        let restored = try #require(TrackJournal.replay(entries))
        #expect(restored.wasInterrupted)
        #expect(abs(restored.result.recordingSeconds - 20) < 0.001)
    }

    /// The reader's own Stop, read back. Nothing is missing from this walk;
    /// it was simply never saved.
    @Test("A stopped walk reads back as stopped, not interrupted")
    func aStoppedWalkReadsBackAsStopped() throws {
        let restored = try #require(
            TrackJournal.replay(
                walkEntries() + [.stopped(at: Date(timeIntervalSince1970: 1_110))]
            )
        )
        #expect(restored.wasInterrupted == false)
        #expect(restored.result.endedAt == Date(timeIntervalSince1970: 1_110))
    }

    /// Bytes that are not a walk are not a walk. The caller has to be able to
    /// tell that from a walk with nothing in it, which is the next test.
    @Test("Entries that are not a walk replay as nothing")
    func entriesThatAreNotAWalkReplayAsNothing() {
        #expect(TrackJournal.replay([]) == nil)
        #expect(TrackJournal.replay([.fix(fix(1_001))]) == nil)
        #expect(TrackJournal.decode(Data("not json at all\n".utf8)).isEmpty)
        // Two walks in one file is a file that was reused without being
        // cleared. Which one the reader meant is not a thing to guess at with
        // the only copy.
        #expect(
            TrackJournal.replay([
                .started(id: UUID(), at: Date(timeIntervalSince1970: 1_000)),
                .started(id: UUID(), at: Date(timeIntervalSince1970: 2_000)),
            ]) == nil
        )
    }

    /// A recording that collected nothing is still a recording. The save
    /// sheet has a screen for it; "no walk" would be the wrong answer.
    @Test("A walk with no fixes in it is still a walk")
    func aWalkWithNoFixesIsStillAWalk() throws {
        let restored = try #require(
            TrackJournal.replay([
                .started(id: UUID(), at: Date(timeIntervalSince1970: 1_000))
            ])
        )
        #expect(restored.result.rawFixCount == 0)
        #expect(restored.wasInterrupted)
    }

    /// A fix carrying a timestamp before the pause that follows it must not
    /// bank negative seconds. Device clocks and wall clocks are two clocks.
    @Test("An out-of-order timestamp never banks negative time")
    func anOutOfOrderTimestampNeverBanksNegativeTime() throws {
        let restored = try #require(
            TrackJournal.replay([
                .started(id: UUID(), at: Date(timeIntervalSince1970: 1_000)),
                .fix(fix(1_050)),
                // The wall clock says earlier than the fix did.
                .paused(at: Date(timeIntervalSince1970: 1_040)),
                .stopped(at: Date(timeIntervalSince1970: 1_045)),
            ])
        )
        #expect(restored.result.recordingSeconds >= 0)
    }

    /// One line per entry, and appending one costs one line. The recorder
    /// writes a fix a second for hours; rewriting the walk each time would
    /// cost a quadratic number of bytes and leave the only copy half-written
    /// for the length of every rewrite.
    @Test("Appending an entry appends exactly one line and touches nothing before it")
    func appendingAnEntryAppendsOneLine() throws {
        let entries = walkEntries()
        let before = TrackJournal.encode(entries)
        let after = TrackJournal.encode(entries + [.fix(fix(1_200))])
        #expect(after.starts(with: before))
        #expect(
            after.split(separator: 0x0A).count == before.split(separator: 0x0A).count + 1
        )
    }
}
