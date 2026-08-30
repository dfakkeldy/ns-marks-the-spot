import GeoCore
import SwiftUI

/// The contract's bulk-placement confirm sheet: in-viewport default-checked,
/// out-of-view checkable, untagged unselectable.
struct BulkPhotoPlacementSheet: View {
    let rows: [BulkPhotoPlacement.Row]
    let names: [String: String]
    var onCancel: () -> Void
    var onPlace: ([String]) -> Void

    @State private var checked: Set<String>

    init(
        rows: [BulkPhotoPlacement.Row],
        names: [String: String],
        onCancel: @escaping () -> Void,
        onPlace: @escaping ([String]) -> Void
    ) {
        self.rows = rows
        self.names = names
        self.onCancel = onCancel
        self.onPlace = onPlace
        _checked = State(initialValue: Set(
            rows.filter(\.checkedByDefault).map(\.candidate.id)
        ))
    }

    private var selectedCount: Int { checked.count }

    var body: some View {
        NavigationStack {
            List {
                ForEach(rows, id: \.candidate.id) { row in
                    Toggle(isOn: Binding(
                        get: { checked.contains(row.candidate.id) },
                        set: { on in
                            if on { checked.insert(row.candidate.id) }
                            else { checked.remove(row.candidate.id) }
                        }
                    )) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(names[row.candidate.id] ?? row.candidate.id)
                                .font(.subheadline)
                            Text(caption(row))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .disabled(!row.isPlaceable)
                }
            }
            .navigationTitle("Place photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create \(selectedCount) point\(selectedCount == 1 ? "" : "s")") {
                        // Row order, not Set order: the stored array order is
                        // contract-meaningful (points-to-path connects
                        // features in the order they were added).
                        onPlace(rows.map(\.candidate.id).filter(checked.contains))
                    }
                    .disabled(selectedCount == 0)
                }
            }
        }
    }

    private func caption(_ row: BulkPhotoPlacement.Row) -> String {
        switch row.inViewport {
        case true: return "In the current view"
        case false: return "Outside the current view"
        case nil: return "No location — cannot place"
        }
    }
}
