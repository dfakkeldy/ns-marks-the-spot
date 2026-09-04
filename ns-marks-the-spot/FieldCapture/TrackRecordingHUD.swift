import GeoCore
import SwiftUI
import UIKit

/// The recording heads-up card: elapsed time, distance, vertex count, the
/// state of the fixes, and the transport controls.
///
/// The dot keeps the web's colours — green at ≤ 10 m, amber for a looser fix
/// that still passed the 25 m gate, red while nothing is being added — and the
/// line under the stats says that state in words and in a shape. The web says
/// it in colour alone; this card is read at arm's length on a woods road, and
/// a hue is not a reading.
struct TrackRecordingHUD: View {
    let recorder: TrackRecorder
    var onStop: () -> Void

    /// A refused start: no clock, no transport, the refusal and a way to
    /// wave it away.
    private var isRefusedOnly: Bool { !recorder.isActive && recorder.refusal != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if !isRefusedOnly { qualityDot }
                Text(
                    isRefusedOnly
                        ? "Recording not started"
                        : recorder.status == .paused ? "Recording paused" : "Recording"
                )
                .font(.headline)
                Spacer()
                if isRefusedOnly {
                    Button {
                        recorder.dismissRefusal()
                    } label: {
                        Text("Dismiss")
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.bordered)
                } else {
                    if recorder.status == .paused {
                        // Off while refused: the refusal under it says why.
                        // A bordered button sizes its capsule around its
                        // label, which is about thirty-four points; these three
                        // are the controls a walker reaches for with wet or
                        // gloved hands.
                        Button("Resume") {
                            recorder.resume()
                            // Only for a transport button that took. The
                            // recorder also pauses itself when the app leaves
                            // the foreground or location is refused mid-walk,
                            // and a buzz then would answer a phone in a pocket
                            // for something nobody just asked for.
                            if recorder.status == .recording {
                                MapHaptics.modeChanged()
                            }
                        }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                        .disabled(recorder.refusal != nil)
                    } else {
                        Button("Pause") {
                            recorder.pause()
                            if recorder.status == .paused {
                                MapHaptics.modeChanged()
                            }
                        }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                    }
                    // Stop is not destructive. It ends the recording and
                    // opens the save sheet, where the walk is still there to
                    // keep; the red belongs on Discard, which is the tap that
                    // destroys it.
                    Button("Stop") { onStop() }
                        .buttonStyle(.borderedProminent)
                        .frame(minHeight: 44)
                        .accessibilityHint("Ends the recording and opens the save screen.")
                }
            }

            // Once a second while recording; the stats are wall-clock.
            if !isRefusedOnly {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let stats = recorder.recording.stats(now: context.date)
                    HStack(spacing: 16) {
                        statView("Time", elapsedText(stats.elapsedSeconds))
                        statView("Distance", Geodesy.formatDistance(stats.distanceM))
                        statView("Points", "\(stats.keptVertexCount)")
                    }
                }

                // The dot's state, said. Red covers both a rejected position
                // and one that has not arrived, because both leave the track
                // where it was; this line is what tells the two apart. The dot
                // stays hidden from VoiceOver so it is heard once, here.
                Label(quality.summary, systemImage: Self.qualitySymbol(quality))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let refusal = recorder.refusal {
                Label(Self.refusalText(refusal), systemImage: "location.slash")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                // Settings only for this app's refusal: the app's page lifts
                // neither a device restriction nor the device-wide switch.
                if refusal == .denied {
                    OpenSettingsButton()
                }
            }

            // What the system will say only once it has already begun, said
            // here before it does. Apple's guidance is that an app tells the
            // reader that updates will continue *before* it goes into the
            // background; the blue indicator appears after, and a locked
            // screen may not show it at all. This app has a further reason:
            // a reader who did not know their phone would keep recording in a
            // pocket has not agreed to it.
            if recorder.status == .recording {
                Text("Recording continues when this app is off screen or the phone is locked.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // And when the system says it will not. A distinct sentence from
            // the refusal above: fixes are arriving now, and will stop the
            // moment the phone goes away.
            if let notice = recorder.backgroundNotice {
                Label(notice, systemImage: "iphone.slash")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text("Location stays on this device.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .mapChromeSurface(interactive: true, shadow: nil)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Track recording")
    }

    /// The same words the locate banner and the mark toast use for each.
    static func refusalText(_ refusal: TrackRecorder.Refusal) -> String {
        switch refusal {
        case .denied:
            "Location permission was not granted. You can keep using the map."
        case .restricted:
            "Location is restricted on this device, for example by Screen Time "
                + "or a management profile. You can keep using the map."
        case .servicesOff:
            "Location Services are off for this device. Turn them on in Settings, "
                + "under Privacy & Security."
        }
    }

    /// What the fixes are doing, as the recording sees them.
    private var quality: TrackRecording.FixQuality { recorder.recording.fixQuality }

    /// Green ≤ 10 m, amber for a looser fix that still passed the gate, red
    /// while nothing is being added. The dot is a glance, not a reading: it
    /// carries no accessibility text of its own because the line under the
    /// stats says the same state, and saying it twice is worse than once.
    private var qualityDot: some View {
        let color: Color =
            switch quality {
            // Idle only reaches here in a preview: the HUD is not on screen
            // without a recording. Grey either way — nothing is being taken.
            case .idle, .paused: .gray
            case .waiting, .rejected: .red
            case .accepted(let accuracyM): accuracyM <= 10 ? .green : .orange
            }
        return Circle()
            .fill(color)
            .frame(width: 10, height: 10)
            .accessibilityHidden(true)
    }

    /// A different shape for each state, so the badge beside the words is not
    /// one more thing that only colour distinguishes.
    private static func qualitySymbol(_ quality: TrackRecording.FixQuality) -> String {
        switch quality {
        case .idle: "circle"
        case .paused: "pause.circle"
        case .waiting: "hourglass"
        case .rejected: "exclamationmark.triangle"
        case .accepted: "location.fill"
        }
    }

    private func statView(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.monospacedDigit())
        }
    }

    private func elapsedText(_ seconds: Double) -> String {
        let whole = max(0, Int(seconds))
        let hours = whole / 3600
        let minutes = (whole % 3600) / 60
        let secs = whole % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, secs)
            : String(format: "%d:%02d", minutes, secs)
    }
}
