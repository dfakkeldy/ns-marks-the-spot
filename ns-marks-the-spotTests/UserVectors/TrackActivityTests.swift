import CoreLocation
import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// A Lock Screen a test drives.
@MainActor
private final class SpyActivity: TrackActivityPresenter {
    private(set) var started: [TrackActivityAttributes.ContentState] = []
    private(set) var updated: [TrackActivityAttributes.ContentState] = []
    private(set) var ended: [TrackActivityAttributes.ContentState] = []

    var isShowing = false

    func start(_ state: TrackActivityAttributes.ContentState, startedAt: Date) {
        started.append(state)
        isShowing = true
    }

    func update(_ state: TrackActivityAttributes.ContentState) { updated.append(state) }

    func end(_ state: TrackActivityAttributes.ContentState) {
        ended.append(state)
        isShowing = false
    }
}

@MainActor
private final class QuietSource: LocationFixSource {
    var authorizationStatus: CLAuthorizationStatus = .authorizedWhenInUse
    var servicesEnabled = true
    var deliversInBackground = false
    weak var receiver: (any LocationFixReceiver)?
    func requestWhenInUseAuthorization() {}
    func startUpdatingLocation() {}
    func stopUpdatingLocation() {}

    func deliver(latitude: Double, longitude: Double, accuracyM: Double, at seconds: TimeInterval) {
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
private final class QuietScreen: ScreenWakeLock {
    var isHeldAwake = false
}

@MainActor
private final class QuietBackground: BackgroundActivity {
    var isRunning = false
    var onUnavailable: ((String?) -> Void)?
}

/// What the Lock Screen is told about a walk, and how often.
///
/// §12.11's Live Activity. The reader's phone is in a pocket, so the only
/// account of the recording they can get is this one — which makes "what it
/// says" and "when it stops saying it" the whole of the contract.
@Suite("The walk on the Lock Screen")
@MainActor
struct TrackActivityTests {
    private func rig() -> (TrackRecorder, QuietSource, SpyActivity) {
        let source = QuietSource()
        let activity = SpyActivity()
        return (
            TrackRecorder(
                source: source, screen: QuietScreen(),
                background: QuietBackground(), activity: activity
            ),
            source, activity
        )
    }

    @Test("A walk starts one activity and ends it with what the walk came to")
    func aWalkStartsOneActivityAndEndsItWithWhatTheWalkCameTo() {
        let (recorder, source, activity) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        #expect(activity.started.count == 1)
        #expect(activity.started[0].isRecording)
        #expect(activity.started[0].distanceMetres == 0)

        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_001)

        _ = recorder.stop(now: Date(timeIntervalSince1970: 1_060))
        #expect(activity.ended.count == 1)
        // Ended saying it has ended. A Live Activity left claiming to be
        // recording is a claim on the Lock Screen that the walk goes on.
        #expect(activity.ended[0].isRecording == false)
        #expect(activity.ended[0].runningSince == nil)
        #expect(!activity.isShowing)
    }

    /// The clock on the Lock Screen counts by itself from `runningSince`, so
    /// the app is never woken to say what a clock already knows. Pausing
    /// freezes it at the elapsed seconds; resuming hands it a new instant to
    /// count from rather than the original start, or the paused minutes would
    /// reappear in the total.
    @Test("Pausing freezes the clock and resuming restarts it from what was banked")
    func pausingFreezesTheClockAndResumingRestartsIt() throws {
        let (recorder, _, activity) = rig()
        let start = Date(timeIntervalSince1970: 1_000)
        recorder.start(now: start)
        #expect(activity.started[0].runningSince == start)

        recorder.pause(now: start.addingTimeInterval(60))
        let paused = try #require(activity.updated.last)
        #expect(paused.isRecording == false)
        #expect(paused.runningSince == nil)
        #expect(abs(paused.elapsedSeconds - 60) < 0.001)

        // Resumed five minutes later: the clock counts from an instant that
        // already has the first minute in it, and not from five minutes ago.
        let resumedAt = start.addingTimeInterval(360)
        recorder.resume(now: resumedAt)
        let resumed = try #require(activity.updated.last)
        #expect(resumed.isRecording)
        let runningSince = try #require(resumed.runningSince)
        #expect(abs(runningSince.timeIntervalSince(resumedAt) + 60) < 0.001)
    }

    /// ActivityKit budgets updates from a backgrounded app, and the clock
    /// needs none of them: only the distance does. So fixes are not one update
    /// each — but a change of state is pushed the moment it happens, because
    /// that is what a reader looking at a Lock Screen is waiting for.
    @Test("Fixes do not each buy an update, and a state change always does")
    func fixesDoNotEachBuyAnUpdateAndAStateChangeAlwaysDoes() {
        let (recorder, source, activity) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        let updatesAtStart = activity.updated.count

        // A minute of walking, a fix a second.
        for second in 1...50 {
            source.deliver(
                latitude: 45.0 + Double(second) * 0.0001, longitude: -63.0,
                accuracyM: 5, at: 1_000 + Double(second)
            )
        }
        let pushed = activity.updated.count - updatesAtStart
        #expect(pushed > 0)
        // Fifty fixes, ten seconds apart at most: five or so, not fifty.
        #expect(pushed <= 6)

        // And the pause is not on a cadence.
        recorder.pause(now: Date(timeIntervalSince1970: 1_051))
        #expect(activity.updated.last?.isRecording == false)
    }

    /// The one thing a Lock Screen must not do: say a walk is being recorded
    /// while the system has refused to let it continue off screen. That merges
    /// *blocked* into *working*, and the reader with the phone in their pocket
    /// has no other way to find out.
    @Test("A background session the system refused reaches the Lock Screen at once")
    func aBackgroundSessionTheSystemRefusedReachesTheLockScreenAtOnce() throws {
        let source = QuietSource()
        let background = QuietBackground()
        let activity = SpyActivity()
        let recorder = TrackRecorder(
            source: source, screen: QuietScreen(), background: background, activity: activity
        )
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        #expect(activity.started[0].backgroundNotice == nil)

        background.onUnavailable?("Recording may stop when this app is off screen.")

        // Not on the ten-second cadence: this changes what the reader should
        // do with the phone in their hand.
        let pushed = try #require(activity.updated.last)
        #expect(pushed.backgroundNotice == "Recording may stop when this app is off screen.")
        #expect(pushed.isRecording)
    }

    /// The Lock Screen's numbers are the HUD's numbers. Two screens, one walk.
    @Test("The Lock Screen rounds a distance the way the map does")
    func theLockScreenRoundsADistanceTheWayTheMapDoes() {
        for metres in [0.0, 1.4, 1.5, 141.49, 999.4, 999.5, 1_000, 1_234.5, 12_345.6] {
            #expect(
                TrackActivityFormat.distance(metres) == Geodesy.formatDistance(metres),
                "the Lock Screen and the HUD must not disagree at \(metres) m"
            )
        }
    }
}

/// A walk stopped where the save sheet cannot be shown.
@Suite("A stopped walk waiting to be saved")
@MainActor
struct PendingTrackSaveTests {
    private func store() throws -> (PendingTrackSaveStore, URL) {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return (PendingTrackSaveStore(directory: root), root)
    }

    private func walk() -> TrackRecording.StopResult {
        TrackRecording.StopResult(
            startedAt: Date(timeIntervalSince1970: 1_000),
            endedAt: Date(timeIntervalSince1970: 1_600),
            segments: [[
                TrackPoint(lat: 45.0, lng: -63.0, altitudeM: 12, accuracyM: 5,
                           timestamp: Date(timeIntervalSince1970: 1_001)),
                TrackPoint(lat: 45.001, lng: -63.0, altitudeM: nil, accuracyM: 6,
                           timestamp: Date(timeIntervalSince1970: 1_060)),
            ]],
            rawSegments: [[
                TrackFix(latitude: 45.0, longitude: -63.0, altitudeM: 12, accuracyM: 5,
                         timestamp: Date(timeIntervalSince1970: 1_001)),
            ]],
            rawFixCount: 1,
            acceptedFixCount: 2,
            distanceM: 111.2,
            recordingSeconds: 600
        )
    }

    /// The exposure Stop-from-the-Lock-Screen created: the map's Stop opens
    /// the sheet while the reader is looking at it, and a locked phone's Stop
    /// cannot. Between the two, iOS may terminate the app.
    @Test("A stopped walk survives being written down and read back")
    func aStoppedWalkSurvivesBeingWrittenDownAndReadBack() throws {
        let (store, root) = try self.store()
        defer { try? FileManager.default.removeItem(at: root) }
        if case .none = store.read() {} else { Issue.record("expected nothing yet") }

        let original = walk()
        #expect(store.write(.init(result: original, stoppedWhileRefused: true)))

        // A different process would build a different store over the same
        // directory, which is what this is.
        let reopened = PendingTrackSaveStore(directory: root)
        guard case .pending(let pending) = reopened.read() else {
            Issue.record("expected a pending walk")
            return
        }
        #expect(pending.stoppedWhileRefused)
        #expect(pending.result.segments.first?.count == 2)
        #expect(pending.result.segments.first?.first?.lat == 45.0)
        // Nothing zero-filled on the way through: a missing altitude is still
        // missing, not nought at sea level.
        #expect(pending.result.segments.first?.last?.altitudeM == nil)
        #expect(pending.result.rawSegments.first?.count == 1)
        #expect(pending.result.distanceM == 111.2)
    }

    /// Cleared by the reader saving it or saying to throw it away, and by
    /// nothing else.
    @Test("Only the reader's answer clears it")
    func onlyTheReadersAnswerClearsIt() throws {
        let (store, root) = try self.store()
        defer { try? FileManager.default.removeItem(at: root) }
        store.write(.init(result: walk(), stoppedWhileRefused: false))
        if case .pending = store.read() {} else { Issue.record("expected a pending walk") }
        if case .pending = store.read() {} else { Issue.record("reading is not consuming") }

        store.clear()
        if case .none = store.read() {} else { Issue.record("expected nothing") }
    }

    /// "There is no walk" and "there is a walk this app could not read" are
    /// different facts, and the second one is a walk. Merging them would tell
    /// a reader whose file was momentarily unreadable that it had never
    /// existed — and deleting it would be a discard they never asked for.
    @Test("A file that cannot be read is not nothing, and is not thrown away")
    func aFileThatCannotBeReadIsNotNothingAndIsNotThrownAway() throws {
        let (store, root) = try self.store()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("pending-track-save.json")
        try Data("not a walk".utf8).write(to: file)

        if case .unreadable = store.read() {} else { Issue.record("expected unreadable") }
        #expect(FileManager.default.fileExists(atPath: file.path))
    }

    /// The one the second review round found: the recorder used to let go of
    /// the walk and *then* try to write it down, ignoring the answer. On a
    /// full device that cleared the recorder, ended the Live Activity, buzzed
    /// a success and left the walk nowhere.
    @Test("A walk that cannot be written down is not stopped")
    func aWalkThatCannotBeWrittenDownIsNotStopped() {
        let source = QuietSource()
        let activity = SpyActivity()
        let recorder = TrackRecorder(
            source: source, screen: QuietScreen(),
            background: QuietBackground(), activity: activity
        )
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_001)

        let refused = recorder.stop(now: Date(timeIntervalSince1970: 1_100)) { _ in false }
        #expect(refused == nil)
        // Everything still where it was: the walk, the Lock Screen, the fix.
        #expect(recorder.status == .recording)
        #expect(recorder.lastFix != nil)
        #expect(activity.ended.isEmpty)

        // And a keep that works stops it properly.
        let kept = recorder.stop(now: Date(timeIntervalSince1970: 1_200)) { _ in true }
        #expect(kept != nil)
        #expect(recorder.status == .idle)
        #expect(activity.ended.count == 1)
    }
}

/// The buttons on a Lock Screen, when there is nothing behind them.
@Suite("Lock Screen buttons with no recorder")
@MainActor
struct TrackActivityActionsTests {
    /// iOS terminated the app with an activity still up; a tap relaunches the
    /// process to perform the intent. If the actions are not installed by
    /// then, the tap did nothing — and reporting success would leave the
    /// reader walking on believing they had paused.
    @Test("An action with nothing installed reports that it did nothing")
    func anActionWithNothingInstalledReportsThatItDidNothing() {
        let actions = TrackActivityActions.shared
        actions.install(pause: { true }, resume: { true }, stop: { true })
        #expect(actions.pause())

        actions.uninstall()
        #expect(!actions.pause())
        #expect(!actions.resume())
        #expect(!actions.stop())
    }

    /// Actions outlive the recording they were installed for. A stale button
    /// on a Lock Screen reaching an idle recorder must not be answered "done":
    /// that is the same lie as answering with nothing installed at all.
    @Test("An action that changed nothing says so, even though it was installed")
    func anActionThatChangedNothingSaysSo() {
        let actions = TrackActivityActions.shared
        actions.install(pause: { false }, resume: { false }, stop: { false })
        #expect(!actions.pause())
        #expect(!actions.resume())
        #expect(!actions.stop())
        actions.uninstall()
    }
}
