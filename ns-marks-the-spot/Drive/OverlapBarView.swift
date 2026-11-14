import GeoCore
import SwiftUI

struct OverlapBarView: View {
    @ScaledMetric(relativeTo: .title3) private var textSize: CGFloat = 18
    @Bindable var model: DriveModeModel
    @Bindable var catalogues: DriveCataloguesViewModel
    let catalogue: DriveCatalogue
    let rows: [UserMapsViewModel.Row]

    private var topID: String? { model.output.contained.first }
    private var topName: String { topID.flatMap { id in rows.first { $0.id == id }?.record.name } ?? "Sheet" }
    private var hidden: Bool { topID.map { model.dismissed.contains($0) } ?? false }
    private var topDescription: String {
        if hidden { return "\(topName) (hidden)" }
        if let id = topID, !model.isInsideNow(id) { return "\(topName) (nearby)" }
        return topName
    }
    static func isVisible(for status: SheetActivationOutput.Status) -> Bool { status == .overlap }

    var body: some View {
        VStack(spacing: 6) {
            Text("\(model.insideCount) sheets here · top: \(topDescription)")
                .font(.system(size: max(18, textSize), weight: .semibold)).lineLimit(2)
            HStack(spacing: 8) {
                Button {
                    Task {
                        if await catalogues.cycleTop(in: catalogue.id, entered: Set(model.output.contained)) {
                            MapHaptics.modeChanged()
                        } else { MapHaptics.refused() }
                    }
                } label: {
                    Label("Swap", systemImage: "arrow.left.arrow.right")
                        .font(.system(size: max(18, textSize), weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 64)
                }
                .disabled(!catalogues.canEdit || topID == nil)
                .accessibilityLabel("Swap. Top sheet is \(topName)")
                .accessibilityHint(catalogues.canEdit ? "Changes the saved sheet order." : "Catalogue order is unavailable.")
                .accessibilityIdentifier("drive-overlap-swap")
                Button {
                    guard let id = topID else { return }
                    model.setVisible(hidden, id: id)
                    MapHaptics.modeChanged()
                } label: {
                    Label(hidden ? "Show top" : "Hide top", systemImage: hidden ? "eye" : "eye.slash")
                        .font(.system(size: max(18, textSize), weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 64)
                }
                .disabled(topID == nil)
                .accessibilityLabel("\(hidden ? "Show" : "Hide") top. Top sheet is \(topName)")
                .accessibilityIdentifier("drive-overlap-visibility")
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
