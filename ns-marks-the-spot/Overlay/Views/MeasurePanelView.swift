import GeoCore
import SwiftUI

/// The measuring surface: which mode is running, what it currently reads, and
/// the three things a finger can do to the shape.
///
/// A card over the map for the same reason the editing panel is one — the
/// ground being measured has to stay visible while it is measured. The web puts
/// its readout in a `role="status"` line; the equivalent here is a live region,
/// so a distance that changes on each tap is announced rather than silently
/// redrawn.
struct MeasurePanelView: View {
    let session: MeasureSession
    var onUndo: () -> Void
    var onFinish: () -> Void
    var onClear: () -> Void
    var onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(session.mode == .distance ? "Distance" : "Area")
                    .font(.headline)
                Spacer()
                Button("Done") { onClose() }
                    .accessibilityIdentifier("measure-done")
            }

            Text(session.readout)
                .font(.title3.monospacedDigit())
                .accessibilityIdentifier("measure-readout")
                .accessibilityAddTraits(.updatesFrequently)

            // The caveat travels with the number. A measured area is what this
            // app's own geometry says over the sphere the web map uses — it is
            // not a survey, and a reader who only sees "1.42 ha" has no way to
            // know that.
            Text("Measured on the map, not surveyed.")
                .font(.caption)
                .foregroundStyle(.secondary)

            // The floor is on each button, not on the row. A bordered button
            // sizes its capsule around its label — about thirty-four points at
            // the default text size — and a row given a minimum simply centres
            // those capsules inside it, so the thing a finger has to land on
            // stayed thirty-four points however tall the row was.
            HStack(spacing: 8) {
                Button("Undo") { onUndo() }
                    .buttonStyle(.bordered)
                    .frame(minHeight: 44)
                    .disabled(session.isEmpty)

                Button("Finish") { onFinish() }
                    .buttonStyle(.bordered)
                    .frame(minHeight: 44)
                    .disabled(!session.canFinish || session.isFinished)

                Spacer()

                Button("Clear") { onClear() }
                    .buttonStyle(.bordered)
                    .tint(.red)
                    .frame(minHeight: 44)
                    .disabled(session.isEmpty)
            }
        }
        .padding(14)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
        .shadow(color: .black.opacity(0.15), radius: 6, x: 0, y: 3)
    }
}
