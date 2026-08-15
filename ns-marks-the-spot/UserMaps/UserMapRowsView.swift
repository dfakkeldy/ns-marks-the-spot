import GeoCore
import SwiftUI
import UniformTypeIdentifiers

/// The user's own maps, as a section of the layer panel.
///
/// Its own section rather than rows mixed in with the catalogued layers,
/// because the distinction is one the user has to be able to see: everything
/// else in the panel is a published source with a provenance, and these are
/// files the user brought in and placed themselves. A hand-placed scan is
/// research, not a record.
struct UserMapRowsView: View {
    @Bindable var viewModel: UserMapsViewModel

    @State private var isImporting = false
    @State private var georeferencing: UserMapsViewModel.Row?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Your Maps")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    isImporting = true
                } label: {
                    Label("Import", systemImage: "plus")
                        .font(.caption)
                }
            }

            if viewModel.rows.isEmpty {
                Text("Import a GeoTIFF, PNG or JPEG to draw it on the map.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(viewModel.rows) { row in
                UserMapRow(
                    row: row,
                    onVisible: { viewModel.setVisible($0, id: row.id) },
                    onOpacity: { viewModel.setOpacity($0, id: row.id) },
                    onPlace: { georeferencing = row },
                    onDelete: { Task { await viewModel.delete(id: row.id) } }
                )
            }

            if let refusal = viewModel.lastRefusal {
                // The refusal's own words. They were written for the person who
                // chose the file and they say what to do about it; a generic
                // "import failed" here would throw that away.
                Label(refusal.userMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .fileImporter(
            isPresented: $isImporting,
            allowedContentTypes: [.tiff, .png, .jpeg, .pdf],
            allowsMultipleSelection: false
        ) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            Task { await load(url) }
        }
        .sheet(item: $georeferencing) { row in
            GeoreferenceView(
                identifier: row.record.id,
                name: row.record.name,
                preview: row.preview,
                pixelSize: row.record.pixelSize,
                controlPoints: controlPoints(of: row),
                method: method(of: row)
            ) { points, method in
                Task { await viewModel.place(id: row.id, controlPoints: points, method: method) }
            }
        }
    }

    /// Reads the chosen file into memory, under the security scope the picker
    /// hands over.
    ///
    /// Read rather than referenced: the scope ends when this returns, and a
    /// record holding a URL into another app's container would be a map that
    /// worked until the user moved the file.
    private func load(_ url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return }
        await viewModel.importMap(
            data: data, name: url.deletingPathExtension().lastPathComponent
        )
    }

    private func controlPoints(of row: UserMapsViewModel.Row) -> [SessionControlPoint] {
        if case .controlPoints(let points, _) = row.record.placement { return points }
        return []
    }

    /// A sheet that came with its own georeferencing opens on the straight
    /// fit. Its embedded placement is not control points and cannot be edited
    /// as them; placing it by hand replaces what the file said.
    private func method(of row: UserMapsViewModel.Row) -> GeoreferenceMethod {
        if case .controlPoints(_, let method) = row.record.placement { return method }
        return .affine
    }
}

private struct UserMapRow: View {
    let row: UserMapsViewModel.Row
    // `@MainActor`, not a bare function type: `Binding(get:set:)` wants a
    // `@Sendable` setter, and a plain closure property is not one. An
    // actor-isolated closure is Sendable-convertible because it can only
    // ever run on that actor — which is where a row's callbacks belong.
    let onVisible: @MainActor (Bool) -> Void
    let onOpacity: @MainActor (CGFloat) -> Void
    let onPlace: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Toggle(
                    isOn: Binding(get: { row.isVisible }, set: onVisible)
                ) {
                    Text(row.record.name).font(.subheadline)
                }
                .toggleStyle(.switch)
                // A sheet nobody has placed cannot draw, so its switch is not
                // a choice yet. Left visible rather than hidden: the row is
                // the user's map and it has to stay findable.
                .disabled(row.needsGeoreferencing)

                Menu {
                    Button("Place on map…", action: onPlace)
                    Button("Delete", role: .destructive, action: onDelete)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Options for \(row.record.name)")
            }

            if row.needsGeoreferencing {
                Button("Place on map…", action: onPlace)
                    .font(.caption)
            } else {
                Slider(
                    value: Binding(get: { row.opacity }, set: onOpacity),
                    in: 0...1
                )
                .disabled(!row.isVisible)
                .accessibilityLabel("Opacity for \(row.record.name)")
            }
        }
    }
}
