import CoreLocation
import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// A checkpoint store over a directory this run owns.
///
/// Not `inApplicationSupport()`: a unit test that wrote there would share one
/// file with every other test in the bundle and with whatever the last real
/// launch on this simulator left behind.
@MainActor
func temporaryCheckpointStore() -> TrackCheckpointStore {
    TrackCheckpointStore(
        directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("track-checkpoint-\(UUID().uuidString)", isDirectory: true)
    )
}

@MainActor
private final class ScriptedSource: LocationFixSource {
    var authorizationStatus: CLAuthorizationStatus = .authorizedWhenInUse
    var servicesEnabled = true
    var deliversInBackground = false
    weak var receiver: (any LocationFixReceiver)?
    func requestWhenInUseAuthorization() {}
    func startUpdatingLocation() {}
    func stopUpdatingLocation() {}

    func deliver(
        latitude: Double, longitude: Double = -63.0, accuracyM: Double = 5, at seconds: TimeInterval
    ) {
        receiver?.locationSource(
            self,
            received: CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                altitude: 0, horizontalAccuracy: accuracyM, verticalAccuracy: -1,
                timestamp: Date(timeIntervalSince1970: seconds)
            )
        )
    }
}

@MainActor
private final class SilentScreen: ScreenWakeLock {
    var isHeldAwake = false
}

@MainActor
private final class SilentBackground: BackgroundActivity {
    var isRunning = false
    var onUnavailable: ((String?) -> Void)?
}

@MainActor
private final class SilentActivity: TrackActivityPresenter {
    var isShowing = false
    func start(_ state: TrackActivityAttributes.ContentState, startedAt: Date) {}
    func update(_ state: TrackActivityAttributes.ContentState) {}
    func end(_ state: TrackActivityAttributes.ContentState) {}
}

/// The walk on disk.
///
/// Since a recording continues while the phone is in a pocket, the process
/// holding it is one iOS ends without warning and without asking. Everything
/// here is about the walk still being there afterwards, and about the app being
/// straight with the reader about which of the several things that can happen
/// to it did.
@Suite("A walk that survives the process")
@MainActor
struct TrackCheckpointTests {
    private func rig() -> (TrackRecorder, ScriptedSource, TrackCheckpointStore) {
        let source = ScriptedSource()
        let store = temporaryCheckpointStore()
        return (
            TrackRecorder(
                source: source, screen: SilentScreen(), background: SilentBackground(),
                activity: SilentActivity(), checkpoint: store
            ),
            source, store
        )
    }

    /// Walks a line, and hands back what a second process would find on disk.
    private func afterTermination(_ store: TrackCheckpointStore) -> TrackCheckpointStore.Found {
        // A fresh store over the same directory is what a relaunch is: the
        // process that was writing is gone, and only the bytes remain.
        TrackCheckpointStore(directory: store.file.deletingLastPathComponent()).read()
    }

    // MARK: - Growing

    /// The walk is written down as it happens, and each fix costs one line
    /// appended to the end. Rewriting the file per fix would be quadratic over
    /// a walk of hours, and would leave the only copy of it half-written for
    /// the length of every rewrite.
    @Test("A walk grows on disk a line at a time, touching nothing already written")
    func aWalkGrowsALineAtATime() throws {
        let (recorder, source, store) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        source.deliver(latitude: 45.0, at: 1_001)
        let afterOne = try #require(try? Data(contentsOf: store.file))

        source.deliver(latitude: 45.0004, at: 1_002)
        source.deliver(latitude: 45.0008, at: 1_003)
        let afterThree = try #require(try? Data(contentsOf: store.file))

        #expect(afterThree.count > afterOne.count)
        // The bytes that were there are the same bytes.
        #expect(afterThree.starts(with: afterOne))
        #expect(
            afterThree.split(separator: 0x0A).count
                == afterOne.split(separator: 0x0A).count + 2
        )
    }

    /// The case the whole change exists for.
    @Test("A walk iOS ended mid-recording comes back with the fixes it took")
    func aWalkEndedMidRecordingComesBack() throws {
        let (recorder, source, store) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        for step in 0..<8 {
            source.deliver(latitude: 45.0 + Double(step) * 0.0004, at: 1_001 + Double(step))
        }
        // No stop. The process simply stops existing.

        guard case .walk(let restored) = afterTermination(store) else {
            Issue.record("the walk was not found on disk")
            return
        }
        #expect(restored.wasInterrupted)
        #expect(restored.result.rawFixCount == 8)
        #expect(restored.result.distanceM > 0)
        // Closed at the last fix, not at the moment it was read back. A walk
        // read three hours later did not record for three hours.
        #expect(restored.result.endedAt == Date(timeIntervalSince1970: 1_008))
    }

    /// The reader's own Stop, and then the app goes away before the save sheet
    /// is answered. Nothing is missing from this walk — and it is a different
    /// sentence from the one above.
    @Test("A walk stopped and never saved comes back saying so")
    func aWalkStoppedAndNeverSavedComesBack() throws {
        let (recorder, source, store) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        source.deliver(latitude: 45.0, at: 1_001)
        source.deliver(latitude: 45.0004, at: 1_002)
        let stopped = try #require(recorder.stop(now: Date(timeIntervalSince1970: 1_010)))

        guard case .walk(let restored) = afterTermination(store) else {
            Issue.record("the stopped walk was not found on disk")
            return
        }
        #expect(restored.wasInterrupted == false)
        #expect(restored.id == stopped.id)
        #expect(restored.result.rawFixCount == stopped.result.rawFixCount)
        #expect(restored.result.distanceM == stopped.result.distanceM)
        #expect(restored.result.endedAt == stopped.result.endedAt)
    }

    /// A pause is a segment boundary, and the journal has to carry it. Without
    /// it a restored walk would draw one unbroken line across the time the
    /// reader was not recording.
    @Test("Pause and resume come back as a segment boundary")
    func pauseAndResumeComeBackAsASegmentBoundary() throws {
        let (recorder, source, store) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        source.deliver(latitude: 45.0, at: 1_001)
        recorder.pause(now: Date(timeIntervalSince1970: 1_002))
        recorder.resume(now: Date(timeIntervalSince1970: 1_500))
        source.deliver(latitude: 45.01, at: 1_501)

        guard case .walk(let restored) = afterTermination(store) else {
            Issue.record("the walk was not found on disk")
            return
        }
        #expect(restored.result.segments.count == 2)
        // And none of the eight minutes it spent paused.
        #expect(restored.result.recordingSeconds < 10)
    }

    // MARK: - Clearing

    /// Stopping is not an answer. The reader has not said what to do with the
    /// walk yet, and the save sheet cannot always be shown at the moment of the
    /// stop — a Lock Screen has nowhere to put it.
    @Test("Stopping leaves the walk on disk; only saving or discarding removes it")
    func stoppingLeavesTheWalkOnDisk() throws {
        let (recorder, source, store) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        source.deliver(latitude: 45.0, at: 1_001)
        _ = recorder.stop(now: Date(timeIntervalSince1970: 1_010))

        #expect(FileManager.default.fileExists(atPath: store.file.path))
        store.clear()
        #expect(!FileManager.default.fileExists(atPath: store.file.path))
        guard case .none = afterTermination(store) else {
            Issue.record("a cleared checkpoint should leave nothing behind")
            return
        }
    }

    /// A walk that has been saved keeps the same identifier from its journal's
    /// first line through to the layer written for it. That is what lets the
    /// app tell "this walk has already been saved" from "this walk is waiting",
    /// so a termination between the layer landing and the checkpoint being
    /// cleared cannot produce the walk twice.
    @Test("A walk keeps one identifier from its first line to its saved layer")
    func aWalkKeepsOneIdentifier() throws {
        let (recorder, source, store) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        source.deliver(latitude: 45.0, at: 1_001)
        let running = recorder.walkID
        let stopped = try #require(recorder.stop(now: Date(timeIntervalSince1970: 1_010)))
        #expect(running == stopped.id)

        guard case .walk(let restored) = afterTermination(store) else {
            Issue.record("the stopped walk was not found on disk")
            return
        }
        #expect(restored.id == stopped.id)
    }

    // MARK: - What cannot be read

    /// The finding this closes: an unreadable checkpoint was reported as *no
    /// walk* and then deleted. Both halves were wrong. A file that cannot be
    /// read is evidence that something was recorded, not evidence that nothing
    /// was — and it is somebody's only copy.
    @Test("A checkpoint that cannot be read is reported as such, and kept")
    func anUnreadableCheckpointIsKept() throws {
        let store = temporaryCheckpointStore()
        let directory = store.file.deletingLastPathComponent()
        try Data("this is not a walk\n".utf8).write(to: store.file)

        guard case .unreadable(let keptAt) = store.read() else {
            Issue.record("bytes that are not a walk must not read as no walk")
            return
        }
        // Moved, not removed.
        #expect(!FileManager.default.fileExists(atPath: store.file.path))
        let kept = try #require(keptAt)
        #expect(FileManager.default.fileExists(atPath: kept.path))
        #expect(try Data(contentsOf: kept) == Data("this is not a walk\n".utf8))
        #expect(kept.deletingLastPathComponent() == directory)
    }

    /// An empty file is the same answer. It is what a walk whose very first
    /// line never landed looks like, and "nothing was recorded" is the one
    /// thing that cannot be concluded from it.
    @Test("An empty checkpoint is not the same as no checkpoint")
    func anEmptyCheckpointIsNotNoCheckpoint() throws {
        let store = temporaryCheckpointStore()
        try Data().write(to: store.file)

        guard case .unreadable = store.read() else {
            Issue.record("an empty checkpoint must not read as no walk")
            return
        }
    }

    /// And a checkpoint that is genuinely not there is genuinely not there.
    @Test("No checkpoint reads as no walk")
    func noCheckpointReadsAsNoWalk() {
        guard case .none = temporaryCheckpointStore().read() else {
            Issue.record("a directory with no journal in it holds no walk")
            return
        }
    }

    /// Starting a new walk over one nobody has answered for keeps the old
    /// bytes. The reader has not said to throw the first one away, and a new
    /// recording is not that answer.
    @Test("A new walk started over an unanswered one keeps the old bytes")
    func aNewWalkKeepsTheOldBytes() throws {
        let (recorder, source, store) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        source.deliver(latitude: 45.0, at: 1_001)
        _ = recorder.stop(now: Date(timeIntervalSince1970: 1_010))
        let firstWalk = try #require(try? Data(contentsOf: store.file))

        recorder.start(now: Date(timeIntervalSince1970: 2_000))
        let directory = store.file.deletingLastPathComponent()
        let kept = try FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        ).filter { $0.lastPathComponent.hasPrefix("recording-kept-") }
        #expect(kept.count == 1)
        #expect(try Data(contentsOf: try #require(kept.first)) == firstWalk)
    }

    // MARK: - Saying so

    /// Two different things happened, and they are told apart in words rather
    /// than left for the reader to work out from a number.
    @Test("The two ways a walk comes back are two different sentences")
    func theTwoWaysAWalkComesBackAreTwoSentences() throws {
        let (recorder, source, store) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        source.deliver(latitude: 45.0, at: 1_001)
        guard case .walk(let interrupted) = afterTermination(store) else {
            Issue.record("the walk was not found on disk")
            return
        }

        let (second, secondSource, secondStore) = rig()
        second.start(now: Date(timeIntervalSince1970: 1_000))
        secondSource.deliver(latitude: 45.0, at: 1_001)
        _ = second.stop(now: Date(timeIntervalSince1970: 1_010))
        guard case .walk(let stopped) = afterTermination(secondStore) else {
            Issue.record("the stopped walk was not found on disk")
            return
        }

        let interruptedText = TrackRestoreNotice.text(for: interrupted)
        let stoppedText = TrackRestoreNotice.text(for: stopped)
        #expect(interruptedText != stoppedText)
        #expect(interruptedText.contains("still recording"))
        #expect(stoppedText.contains("You stopped"))
    }

    /// What the reader is told about bytes that could not be read must not be
    /// "no walk", in any wording.
    @Test("An unreadable checkpoint never claims there was no walk")
    func anUnreadableCheckpointNeverClaimsThereWasNoWalk() {
        let message = TrackRestoreNotice.unreadableMessage(
            keptAt: URL(fileURLWithPath: "/tmp/recording-kept-1.jsonl")
        )
        #expect(message.contains("could not read"))
        #expect(message.contains("recording-kept-1.jsonl"))
        #expect(message.contains("Nothing has been deleted."))
    }
}
