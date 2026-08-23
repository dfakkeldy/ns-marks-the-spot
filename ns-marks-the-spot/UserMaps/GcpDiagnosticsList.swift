import GeoCore
import SwiftUI

/// The control points, with what the fit says about each one.
///
/// The column heading changes with the method, and that is the substance of the
/// view rather than a detail of it: under an affine the figure is how far this
/// point sits from the fit, so a large one can mean a misplaced point; under a
/// spline the surface passes through every control exactly, so the figure is
/// how far the map would move here if the point were deleted — large meaning
/// load-bearing, not wrong. Sorting by one label and deleting the top of the
/// list took true error on a real sheet from 43 m to 392 m.
struct GcpDiagnosticsList: View {
    let rows: [GcpListPresentation.Row]
    let column: GcpListPresentation.ResidualColumn
    @Binding var sort: GcpListPresentation.Sort
    let onZoomTo: (GcpListPresentation.Row) -> Void
    let onDelete: (String) -> Void

    var body: some View {
        List {
            Section {
                ForEach(rows) { row in
                    GcpDiagnosticsRow(
                        row: row,
                        columnLabel: column.label,
                        onZoomTo: { onZoomTo(row) },
                        onDelete: { onDelete(row.id) }
                    )
                }
            } header: {
                header
            } footer: {
                Text(column.hint)
            }
        }
        .listStyle(.insetGrouped)
    }

    private var header: some View {
        HStack {
            Picker("Order by", selection: $sort.key) {
                Text("Number").tag(GcpListPresentation.SortKey.index)
                Text("Scan").tag(GcpListPresentation.SortKey.scan)
                Text("Map").tag(GcpListPresentation.SortKey.map)
                Text(column.label).tag(GcpListPresentation.SortKey.residual)
            }
            .pickerStyle(.menu)
            Spacer()
            Button {
                sort.descending.toggle()
            } label: {
                Label(
                    sort.descending ? "Largest first" : "Smallest first",
                    systemImage: sort.descending ? "arrow.down" : "arrow.up"
                )
                .font(.caption)
            }
        }
    }
}

private struct GcpDiagnosticsRow: View {
    let row: GcpListPresentation.Row
    let columnLabel: String
    let onZoomTo: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(verbatim: "\(row.number)")
                .font(.caption.monospacedDigit().bold())
                .frame(minWidth: 22, alignment: .trailing)
            VStack(alignment: .leading, spacing: 2) {
                // Verbatim, or SwiftUI localises the interpolation and groups
                // the thousands: a point at pixel (1100, 100) printed as
                // "1,100, 100", which reads as three numbers. The browser
                // prints the rounded pixels plain, and a pixel index is an
                // index rather than a quantity.
                Text(
                    verbatim:
                        "\(Int(row.point.pixel.x.rounded())), "
                        + "\(Int(row.point.pixel.y.rounded()))"
                )
                .font(.caption.monospacedDigit())
                Text(
                    String(
                        format: "%.4f, %.4f", row.point.map.lat, row.point.map.lng
                    )
                )
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(GcpListPresentation.residualText(row.residualMetres))
                    .font(.caption.monospacedDigit())
                    .fontWeight(row.isSuspect ? .bold : .regular)
                Text(columnLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if row.isSuspect {
                // The same phrase the figure's own explanation uses: a
                // consistency claim, not a largest-error one. Under a spline the
                // accused row is often not the biggest number in the column.
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .accessibilityLabel(GcpListPresentation.suspectLabel)
            }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onZoomTo)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAction(named: "Zoom to", onZoomTo)
        .accessibilityAction(named: "Delete", onDelete)
    }

    private var accessibilityLabel: String {
        var parts = [
            "Point \(row.number)",
            "\(columnLabel) \(GcpListPresentation.residualText(row.residualMetres))",
        ]
        if row.isSuspect { parts.append(GcpListPresentation.suspectLabel) }
        return parts.joined(separator: ", ")
    }
}
