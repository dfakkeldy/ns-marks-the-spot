import ActivityKit
import Foundation

/// The Lock Screen, behind a seam — the same reason as `LocationFixSource`,
/// `ScreenWakeLock` and `BackgroundActivity`: what the recorder does with a
/// system service is a rule, and a rule wants a test rather than a comment.
@MainActor
protocol TrackActivityPresenter: AnyObject {
    /// Whether an activity is on screen at all.
    var isShowing: Bool { get }
    func start(_ state: TrackActivityAttributes.ContentState, startedAt: Date)
    func update(_ state: TrackActivityAttributes.ContentState)
    /// Takes it down now rather than leaving it to time out. A Live Activity
    /// for a walk that has ended is a claim on the Lock Screen that the walk
    /// is still going.
    func end(_ state: TrackActivityAttributes.ContentState)
}

/// The real one.
///
/// Every call is guarded by `areActivitiesEnabled`: the reader can switch Live
/// Activities off for this app in Settings, and a recorder that treated a
/// refusal there as a failure would be reading a preference as an error.
/// Recording works exactly the same with the switch off; the Lock Screen is
/// simply not used.
@MainActor
final class LiveActivityPresenter: TrackActivityPresenter {
    private var activity: Activity<TrackActivityAttributes>?
    /// The tail of the queue. Every call chains onto it, so the Lock Screen is
    /// told things in the order they happened.
    ///
    /// Without this each call was its own unstructured task and ActivityKit's
    /// `update` suspends: Pause immediately followed by Resume could finish in
    /// either order, and finishing in the wrong one leaves "Recording paused"
    /// on the Lock Screen over a recorder that is taking fixes in. A walk that
    /// says it is paused when it is not is worse than no Lock Screen at all.
    private var queue: Task<Void, Never>?

    /// ActivityKit's `Activity` is a **non-Sendable class**, so it cannot be
    /// captured by the `@Sendable` closure of the task that has to await its
    /// async methods. This box is that unsafety, in one place, named — with the
    /// calls inside it so the handle itself never crosses.
    ///
    /// What bounds it is `queue`: every operation on a given handle runs on one
    /// chain, one at a time, in order. Nothing else touches it. Remove the
    /// chain and this conformance becomes a lie.
    private nonisolated struct Handle: @unchecked Sendable {
        let activity: Activity<TrackActivityAttributes>

        nonisolated func update(_ state: TrackActivityAttributes.ContentState) async {
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }

        nonisolated func end(_ state: TrackActivityAttributes.ContentState) async {
            await activity.end(
                ActivityContent(state: state, staleDate: nil), dismissalPolicy: .immediate
            )
        }
    }

    var isShowing: Bool { activity != nil }

    func start(_ state: TrackActivityAttributes.ContentState, startedAt: Date) {
        guard activity == nil, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        activity = try? Activity.request(
            attributes: TrackActivityAttributes(startedAt: startedAt),
            content: ActivityContent(state: state, staleDate: nil),
            pushType: nil
        )
    }

    func update(_ state: TrackActivityAttributes.ContentState) {
        guard let activity else { return }
        enqueue(Handle(activity: activity)) { await $0.update(state) }
    }

    func end(_ state: TrackActivityAttributes.ContentState) {
        guard let activity else { return }
        self.activity = nil
        enqueue(Handle(activity: activity)) { await $0.end(state) }
    }

    /// The activities that were already on the Lock Screen when this process
    /// started, named now so a walk begun a moment later cannot be mistaken
    /// for one.
    ///
    /// Read synchronously at launch and ended afterwards, because the ending
    /// suspends: enumerating inside the async work would have swept up an
    /// activity the reader had started in between and torn their new
    /// recording's Lock Screen away while it went on collecting fixes.
    static func orphanIDs() -> [String] {
        Activity<TrackActivityAttributes>.activities.map(\.id)
    }

    /// Ends the activities this app left behind, saying the walk stopped.
    ///
    /// A process this app did not close leaves its Live Activity on the Lock
    /// Screen with the last thing it was told — "Recording a track", with a
    /// clock still counting — and a fresh launch has an idle recorder that
    /// knows nothing about it. The reader would be looking at a recording that
    /// does not exist, with buttons aimed at nothing.
    static func endOrphans(_ ids: [String], now: Date = Date()) async {
        let wanted = Set(ids)
        for activity in Activity<TrackActivityAttributes>.activities
        where wanted.contains(activity.id) {
            var state = activity.content.state
            // Bank the part of the clock that was still running, or a walk of
            // forty minutes ends its life on the Lock Screen reading 0:00.
            if let runningSince = state.runningSince {
                state.elapsedSeconds += max(0, now.timeIntervalSince(runningSince))
            }
            state.isRecording = false
            state.runningSince = nil
            state.endedByTermination = true
            await activity.end(
                ActivityContent(state: state, staleDate: nil), dismissalPolicy: .immediate
            )
        }
    }

    private func enqueue(
        _ handle: Handle, _ work: @escaping @Sendable (Handle) async -> Void
    ) {
        let previous = queue
        queue = Task {
            await previous?.value
            await work(handle)
        }
    }
}
