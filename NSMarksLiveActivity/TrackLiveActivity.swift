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
                    if let refusal = context.state.refusalText {
                        Text(refusal)
                            .font(.caption)
                            .foregroundStyle(.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Controls(isRecording: context.state.isRecording)
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

/// Pause and Stop, performed in the app's own process — which is what makes
/// them buttons rather than a shortcut to the screen with the buttons on it.
private struct Controls: View {
    var isRecording: Bool

    var body: some View {
        HStack(spacing: 12) {
            if isRecording {
                Button(intent: PauseTrackIntent()) {
                    Label("Pause", systemImage: "pause.fill")
                }
            } else {
                Button(intent: ResumeTrackIntent()) {
                    Label("Resume", systemImage: "play.fill")
                }
            }
            // Not destructive, and not red: Stop ends the recording and holds
            // the walk for the save screen. The red belongs on Discard, which
            // is the tap that throws it away — and which is not offered here,
            // because a walk must not be destroyed from a locked phone.
            Button(intent: StopTrackIntent()) {
                Label("Stop", systemImage: "stop.fill")
            }
        }
        .buttonStyle(.bordered)
        .font(.caption)
    }
}

private struct LockScreenView: View {
    var state: TrackActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: state.isRecording ? "record.circle" : "pause.circle")
                    .foregroundStyle(state.isRecording ? .red : .orange)
                    .accessibilityHidden(true)
                Text(state.isRecording ? "Recording a track" : "Recording paused")
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
            } else {
                Controls(isRecording: state.isRecording)
            }
        }
        .accessibilityElement(children: .contain)
    }
}
