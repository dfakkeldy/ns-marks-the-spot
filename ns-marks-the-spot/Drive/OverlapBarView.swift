import GeoCore
import SwiftUI

struct OverlapBarView: View {
    @ScaledMetric(relativeTo: .title3) private var textSize: CGFloat = 18
    @Bindable var model: DriveModeModel
    @Bindable var catalogues: DriveCataloguesViewModel
    let catalogue: DriveCatalogue
    let rows: [UserMapsViewModel.Row]
    var compact = false

    private var topID: String? { model.output.contained.first }
    private var topName: String { topID.flatMap { id in rows.first { $0.id == id }?.record.name } ?? "Sheet" }
    private var hidden: Bool { topID.map { model.dismissed.contains($0) } ?? false }
    private var topDescription: String {
        if hidden { return "Hidden: \(topName)" }
        if let id = topID, !model.isInsideNow(id) { return "Nearby: \(topName)" }
        return "Top: \(topName)"
    }
    static func isVisible(for status: SheetActivationOutput.Status) -> Bool { status == .overlap }

    var body: some View {
        VStack(spacing: 6) {
            Text("\(model.insideCount) sheets here · \(topDescription)")
                .font(.system(size: max(18, textSize), weight: .semibold)).lineLimit(2)
            HStack(spacing: 8) {
                Button {
                    Task {
                        if await catalogues.cycleTop(in: catalogue.id, entered: Set(model.output.contained)) {
                            MapHaptics.modeChanged()
                        } else { MapHaptics.refused() }
                    }
                } label: {
                    controlLabel("Swap", systemImage: "arrow.left.arrow.right")
                }
                .disabled(!catalogues.canEdit || topID == nil)
                .accessibilityLabel("Swap. Top sheet is \(topName)")
                .accessibilityHint(!catalogues.canEdit ? "Catalogue order is unavailable." : (topID == nil ? "No entered sheet is available." : "Changes the saved sheet order."))
                .accessibilityIdentifier("drive-overlap-swap")
                Button {
                    guard let id = topID else { return }
                    model.setVisible(hidden, id: id)
                    MapHaptics.modeChanged()
                } label: {
                    controlLabel(hidden ? "Show top" : "Hide top", systemImage: hidden ? "eye" : "eye.slash")
                }
                .disabled(topID == nil)
                .accessibilityLabel("\(hidden ? "Show" : "Hide") top. Top sheet is \(topName)")
                .accessibilityIdentifier("drive-overlap-visibility")
            }
            .buttonStyle(.borderedProminent)
            if !catalogues.canEdit { Text("Catalogue order is unavailable.").font(.system(size: max(18, textSize))) }
        }
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func controlLabel(_ title: String, systemImage: String) -> some View {
        Group {
            if compact {
                VStack(spacing: 2) {
                    Image(systemName: systemImage)
                    Text(title).fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Label(title, systemImage: systemImage)
            }
        }
        .font(.system(size: max(18, textSize), weight: .semibold))
        .frame(maxWidth: .infinity, minHeight: 64)
    }
}
