import GeoCore
import SwiftUI

struct OverlapBarView: View {
    @Bindable var model: DriveModeModel
    @Bindable var catalogues: DriveCataloguesViewModel
    let catalogue: DriveCatalogue
    let rows: [UserMapsViewModel.Row]

    private var topID: String? { model.output.contained.first }
    private var topName: String { topID.flatMap { id in rows.first { $0.id == id }?.record.name } ?? "Sheet" }
    private var hidden: Bool { topID.map { model.dismissed.contains($0) } ?? false }

    var body: some View {
        VStack(spacing: 6) {
            Text("\(model.insideCount) sheets here · top: \(topName)")
                .font(.headline).lineLimit(2)
            HStack(spacing: 8) {
                Button {
                    Task {
                        if await catalogues.cycleTop(in: catalogue.id, entered: Set(model.output.contained)) {
                            MapHaptics.modeChanged()
                        } else { MapHaptics.refused() }
                    }
                } label: {
                    Label("Swap", systemImage: "arrow.left.arrow.right")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 64)
                }
                .disabled(!catalogues.canEdit || topID == nil)
                .accessibilityLabel("Swap. Top sheet is \(topName)")
                Button {
                    guard let id = topID else { return }
                    model.setVisible(hidden, id: id)
                    MapHaptics.modeChanged()
                } label: {
                    Label(hidden ? "Show top" : "Hide top", systemImage: hidden ? "eye" : "eye.slash")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 64)
                }
                .disabled(topID == nil)
                .accessibilityLabel("\(hidden ? "Show" : "Hide") top. Top sheet is \(topName)")
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
