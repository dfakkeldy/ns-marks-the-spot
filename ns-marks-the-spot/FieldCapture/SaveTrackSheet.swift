import GeoCore
import SwiftUI

/// The stop-time dialog: the recording's stats, the simplify presets with
/// live before/after vertex counts, a name, and save or discard. Mirrors the
/// web's SaveTrackDialog; the chosen tolerance is recorded on the feature in
/// `nsmts:recording.simplifyToleranceM`.
struct SaveTrackSheet: View {
    let result: TrackRecording.StopResult
    /// Why the last save attempt failed, or nil. The sheet stays up on a
    /// failed write — it holds the only copy of the walk — so the failure
    /// has to be said here, where Save and Discard still work.
    var saveError: String?
    /// Location was refused during the recording, so no fix could arrive:
    /// an empty result is that, not weak GPS.
    var stoppedWhileRefused = false
    var onSave: (_ name: String, _ simplifyToleranceM: Double) -> Void
    var onDiscard: () -> Void

    @State private var name: String
    @State private var toleranceM = CaptureSpec.Simplify.defaultToleranceM

    init(
        result: TrackRecording.StopResult,
        saveError: String? = nil,
        stoppedWhileRefused: Bool = false,
        onSave: @escaping (_ name: String, _ simplifyToleranceM: Double) -> Void,
        onDiscard: @escaping () -> Void
    ) {
        self.result = result
        self.saveError = saveError
        self.stoppedWhileRefused = stoppedWhileRefused
        self.onSave = onSave
        self.onDiscard = onDiscard
        _name = State(initialValue: TrackFeature.defaultTrackName(startedAt: result.startedAt))
    }

    /// Vertices before simplification, drawable segments only.
    private var keptVertexCount: Int {
        result.segments.filter { $0.count >= 2 }.reduce(0) { $0 + $1.count }
    }

    private func simplifiedVertexCount(toleranceM: Double) -> Int {
        TrackSimplify.simplifySegments(result.segments, toleranceM: toleranceM)
            .filter { $0.count >= 2 }
            .reduce(0) { $0 + $1.count }
    }

    /// Nothing drawable survived the filter — the honest state, offered as
    /// its own screen rather than a save button that quietly writes nothing.
    private var isEmpty: Bool {
        keptVertexCount == 0
    }

    var body: some View {
        NavigationStack {
            Form {
                if let saveError {
                    Section {
                        Label(saveError, systemImage: "exclamationmark.triangle")
                            .font(.callout)
                            .foregroundStyle(.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if isEmpty {
                    Section {
                        Text(
                            stoppedWhileRefused
                                ? "No usable track was recorded. Location was refused during "
                                    + "the recording, so no fixes could arrive. The recording can "
                                    + "only be discarded."
                                : "No usable track was recorded. Every fix was filtered "
                                    + "out — usually weak GPS. The recording can only "
                                    + "be discarded."
                        )
                        .font(.callout)
                    }
                } else {
                    Section("Name") {
                        TextField("Track name", text: $name)
                    }
                }

                Section("Recording") {
                    row("Time", elapsedText(result.recordingSeconds))
                    row("Distance", Geodesy.formatDistance(result.distanceM))
                    row("Fixes received", "\(result.rawFixCount)")
                    row("Fixes accepted", "\(result.acceptedFixCount)")
                    if result.segments.count > 1 {
                        row("Segments", "\(result.segments.count)")
                    }
                }

                if !isEmpty {
                    Section {
                        Picker("Simplify", selection: $toleranceM) {
                            ForEach(CaptureSpec.Simplify.presetsM, id: \.self) { preset in
                                Text(presetLabel(preset)).tag(preset)
                            }
                        }
                        .pickerStyle(.menu)
                        // Before and after, live, so the slider is a decision
                        // rather than a guess.
                        row(
                            "Points",
                            toleranceM > 0
                                ? "\(keptVertexCount) → \(simplifiedVertexCount(toleranceM: toleranceM))"
                                : "\(keptVertexCount)"
                        )
                    } footer: {
                        Text(
                            "Smoothing and simplification change the saved line. "
                                + "The raw recording is kept with the layer as "
                                + "\"Raw recording (GPX)\"."
                        )
                    }
                }
            }
            .navigationTitle(isEmpty ? "Nothing to save" : "Save track")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Discard", role: .destructive) { onDiscard() }
                }
                if !isEmpty {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                            onSave(
                                trimmed.isEmpty
                                    ? TrackFeature.defaultTrackName(startedAt: result.startedAt)
                                    : trimmed,
                                toleranceM
                            )
                        }
                    }
                }
            }
        }
    }

    private func presetLabel(_ preset: Double) -> String {
        if preset == 0 { return "Off" }
        if preset == preset.rounded() { return "\(Int(preset)) m" }
        return "\(preset) m"
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundStyle(.secondary).monospacedDigit()
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
