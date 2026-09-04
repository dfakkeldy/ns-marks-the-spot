import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// The walk on the Lock Screen and in the Dynamic Island.
///
/// Two numbers and two buttons. Elapsed time counts on its own through
/// `Text(timerInterval:)`, which the system renders without waking this app —
/// so a forty-minute walk costs the updates that distance needs and nothing
/// for the clock.
///
/// What it does not show: where the reader is. A Live Activity is drawn by a
/// system process and is legible to anyone holding the phone, locked or not.
/// Elapsed time and distance describe the recording; a coordinate would
/// describe the person.
struct TrackLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrackActivityAttributes.self) { context in
            LockScreenView(state: context.state)
                .padding(16)
                .activityBackgroundTint(nil)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Stat(title: "Time", value: nil, state: context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Stat(
                        title: "Distance",
                        value: TrackActivityFormat.distance(context.state.distanceMetres),
                        state: nil
                    )
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        if let refusal = context.state.refusalText {
                            Text(refusal)
                                .font(.caption)
                                .foregroundStyle(.orange)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let notice = context.state.backgroundNotice {
                            Text(notice)
                                .font(.caption)
                                .foregroundStyle(.orange)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Controls(
                            isRecording: context.state.isRecording,
                            isRefused: context.state.refusalText != nil
                        )
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.isRecording ? "record.circle" : "pause.circle")
                    .foregroundStyle(context.state.isRecording ? .red : .orange)
            } compactTrailing: {
                Elapsed(state: context.state)
                    .font(.caption2.monospacedDigit())
            } minimal: {
                Image(systemName: context.state.isRecording ? "record.circle" : "pause.circle")
                    .foregroundStyle(context.state.isRecording ? .red : .orange)
            }
            // No `widgetURL`. Tapping the activity opens the app, which is
            // where the walk is drawn, and that is the whole of what a tap
            // should do; a custom scheme would be a second way in for this app
            // to be told what to show, and it has one already.
            .keylineTint(.red)
        }
    }
}

private struct Elapsed: View {
    var state: TrackActivityAttributes.ContentState

    var body: some View {
        if let runningSince = state.runningSince, state.isRecording {
            Text(timerInterval: runningSince...Date.distantFuture, countsDown: false)
                .monospacedDigit()
        } else {
            Text(Self.frozen(state.elapsedSeconds))
                .monospacedDigit()
        }
    }

    static func frozen(_ seconds: TimeInterval) -> String {
        let whole = Int(seconds.rounded())
        let hours = whole / 3_600
        let minutes = (whole % 3_600) / 60
        let secs = whole % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}

private struct Stat: View {
    var title: String
    /// Nil means "the clock", which draws itself.
    var value: String?
    var state: TrackActivityAttributes.ContentState?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            if let value {
                Text(value).font(.headline.monospacedDigit())
            } else if let state {
                Elapsed(state: state).font(.headline)
            }
        }
    }
}

/// Pause and Resume, performed in the app's own process — which is what makes
/// them buttons rather than a shortcut to the screen with the buttons on it.
///
/// Stop is not here. It produces a walk that must survive a process iOS can
/// end at any moment, and that is not something this app can promise from a
/// locked phone yet.
private struct Controls: View {
    var isRecording: Bool
    /// A refused walk loses Resume: resuming into a refusal would run a clock
    /// over fixes that cannot come.
    var isRefused: Bool

    var body: some View {
        HStack(spacing: 12) {
            if isRecording {
                Button(intent: PauseTrackIntent()) {
                    Label("Pause", systemImage: "pause.fill")
                }
                .modifier(LockScreenTarget())
            } else if !isRefused {
                Button(intent: ResumeTrackIntent()) {
                    Label("Resume", systemImage: "play.fill")
                }
                .modifier(LockScreenTarget())
            }
            // No Stop, and the line below says why to the reader rather than
            // leaving them looking for a button that is not there.
            Text("Open the app to stop and save")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.bordered)
        .font(.caption)
    }
}

/// Forty-four points, on the controls a walker reaches for with wet or gloved
/// hands on a locked phone. `.bordered` sizes its capsule around a caption
/// label, which is about thirty-four.
private struct LockScreenTarget: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

private struct LockScreenView: View {
    var state: TrackActivityAttributes.ContentState

    /// "Stopped", never "finished": an activity this app did not close belongs
    /// to a process iOS terminated, and nobody knows whether the walk it was
    /// recording reached anywhere.
    static func heading(_ state: TrackActivityAttributes.ContentState) -> String {
        if state.endedByTermination { return "Recording stopped" }
        return state.isRecording ? "Recording a track" : "Recording paused"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: state.isRecording ? "record.circle" : "pause.circle")
                    .foregroundStyle(state.isRecording ? .red : .orange)
                    .accessibilityHidden(true)
                Text(Self.heading(state))
                    .font(.subheadline.weight(.semibold))
                Spacer()
            }

            HStack(spacing: 24) {
                Stat(title: "Time", value: nil, state: state)
                Stat(
                    title: "Distance",
                    value: TrackActivityFormat.distance(state.distanceMetres),
                    state: nil
                )
            }

            if let refusal = state.refusalText {
                Text(refusal)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // A separate sentence from the refusal above, because it is a
            // separate fact: fixes are arriving now and will stop when the
            // phone goes away.
            if let notice = state.backgroundNotice {
                Text(notice)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Controls(isRecording: state.isRecording, isRefused: state.refusalText != nil)
        }
        .accessibilityElement(children: .contain)
    }
}
