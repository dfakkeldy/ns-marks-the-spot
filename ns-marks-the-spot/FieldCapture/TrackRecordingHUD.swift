import GeoCore
import SwiftUI

/// The recording heads-up card: elapsed time, distance, vertex count, a
/// fix-quality dot, and the transport controls. Mirrors the web's HUD states:
/// the dot is green at ≤ 10 m accuracy, amber at ≤ 25 m (the gate), and red
/// when fixes are currently being rejected.
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
                        Button("Resume") { recorder.resume() }
                            .buttonStyle(.bordered)
                            .disabled(recorder.refusal != nil)
                    } else {
                        Button("Pause") { recorder.pause() }
                            .buttonStyle(.bordered)
                    }
                    Button("Stop", role: .destructive) { onStop() }
                        .buttonStyle(.borderedProminent)
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
            }

            if let message = recorder.autoPauseMessage {
                Label(message, systemImage: "pause.circle")
                    .font(.caption)
                    .foregroundStyle(.orange)
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

            Text("Location stays on this device.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
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

    /// Green ≤ 10 m, amber within the 25 m gate, red when the current fix is
    /// being rejected (or none has arrived yet).
    private var qualityDot: some View {
        let color: Color
        if recorder.status == .paused {
            color = .gray
        } else if recorder.recording.lastFixGated || recorder.lastFix == nil {
            color = .red
        } else if let accuracy = recorder.recording.lastAcceptedAccuracyM, accuracy <= 10 {
            color = .green
        } else {
            color = .orange
        }
        return Circle()
            .fill(color)
            .frame(width: 10, height: 10)
            .accessibilityHidden(true)
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
