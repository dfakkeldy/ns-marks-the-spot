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

    /// ActivityKit's `Activity` is a **non-Sendable class** whose `update` and
    /// `end` are `@concurrent`, so a handle held on the main actor cannot be
    /// handed to either — and no arrangement of actors fixes that, because the
    /// handle has to outlive each call. There is no safe spelling of the API's
    /// own shape; this box is the unsafety, in one place, named.
    ///
    /// What bounds it: the handle is only ever read and written here, on the
    /// main actor, and the only other thing that touches it is ActivityKit,
    /// which is the framework that handed it out and which documents these
    /// methods as callable from anywhere.
    private nonisolated struct Handle: @unchecked Sendable {
        let activity: Activity<TrackActivityAttributes>

        // The calls live in here so the handle itself never crosses: taking
        // `activity` back out would send a non-Sendable value again, which is
        // the very thing the box exists to stop.
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
        let handle = Handle(activity: activity)
        Task { await handle.update(state) }
    }

    func end(_ state: TrackActivityAttributes.ContentState) {
        guard let activity else { return }
        self.activity = nil
        let handle = Handle(activity: activity)
        Task { await handle.end(state) }
    }
}
