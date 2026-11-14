import GeoCore
import SwiftUI

struct DriveStatusChip: View {
    let model: DriveModeModel
    let catalogue: DriveCatalogue?
    let rows: [UserMapsViewModel.Row]
    let fix: TrackFix?
    let signalLost: Bool
    let failedSheetID: String?
    let autoEnabled: Bool

    private func name(_ id: String) -> String { rows.first { $0.id == id }?.record.name ?? "Sheet" }
    private var message: String {
        if catalogue != nil && !autoEnabled { return "Auto off. Sheets use their saved settings." }
        if model.autoPaused { return "Auto paused. Tap Follow." }
        if let failedSheetID { return "\(name(failedSheetID)) could not be drawn." }
        if signalLost || model.locationUnavailable || fix == nil { return "No location right now. Sheet not changed." }
        if model.output.reason == .heldPoorFix {
            if let accuracy = fix?.accuracyM, accuracy.isFinite, accuracy > 0 {
                return "Location is rough (±\(Int(accuracy.rounded(.up))) m). Sheet not changed."
            }
            return "Location is rough. Sheet not changed."
        }
        guard let catalogue else { return "Drive mode on · Screen stays on" }
        switch model.output.status {
        case .onSheet:
            return "\(catalogue.name) · \(model.output.shown.first.map(name) ?? "No sheet drawn")"
        case .overlap:
            return "\(catalogue.name) · \(model.output.shown.first.map(name) ?? "No sheet drawn") · \(model.output.contained.count) here"
        case .offSheets:
            guard let nearest = model.output.nearest else { return "Off the sheets" }
            let direction = nearest.bearingDegrees.map { " · \(Geodesy.compassPoint(forBearingDegrees: $0))" } ?? ""
            return "Off the sheets · Nearest: \(name(nearest.id)) · \(Geodesy.formatDistance(nearest.distanceM))\(direction)"
        }
    }
    var body: some View {
        VStack(alignment: .leading) {
            Text(message)
            if model.output.notDrawn > 0 { Text("\(model.output.notDrawn) more sheets here are not drawn.") }
        }
        .font(.caption).padding(10).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }
}
