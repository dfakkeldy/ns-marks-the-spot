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
    let searching: Bool

    private func name(_ id: String) -> String { rows.first { $0.id == id }?.record.name ?? "Sheet" }
    var message: String {
        guard let catalogue else { return "Drive mode on" }
        if !autoEnabled { return "Auto off. Sheets use their saved settings." }
        if searching { return "Waiting for location. Sheet not changed." }
        if model.autoPaused { return "Auto paused. Tap Follow." }
        if let failedSheetID { return "\(name(failedSheetID)) could not be drawn." }
        if signalLost || model.locationUnavailable || fix == nil { return "No location right now. Sheet not changed." }
        if model.output.reason == .heldPoorFix {
            if let accuracy = fix?.accuracyM, accuracy.isFinite, accuracy > 0 {
                return "Location is rough (±\(Int(accuracy.rounded(.up))) m). Sheet not changed."
            }
            return "Location is rough. Sheet not changed."
        }
        if !model.hasUsableActivation { return "Waiting for location. Sheet not changed." }
        switch model.output.status {
        case .onSheet:
            return "\(catalogue.name) · \(model.output.shown.first.map(name) ?? "No sheet drawn")"
        case .overlap:
            return "\(catalogue.name) · \(model.topShownHere.map(name) ?? "No sheet here drawn") · \(model.insideCount) sheets here"
        case .offSheets:
            guard let nearest = model.output.nearest else { return "Off the sheets" }
            let direction = nearest.bearingDegrees.map { " · \(Geodesy.compassPoint(forBearingDegrees: $0))" } ?? ""
            return "Off the sheets · Nearest: \(name(nearest.id)) · \(Geodesy.formatDistance(nearest.distanceM))\(direction)"
        }
    }
    var body: some View {
        VStack(alignment: .leading) {
            Text(message)
            Text("Screen stays on")
            if let notice = model.manualNotice { Text(notice) }
            if model.output.notDrawn > 0 { Text("\(model.output.notDrawn) more sheets here are not drawn.") }
        }
        .font(.caption).padding(10).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }
}
