import GeoCore
import SwiftUI
import UniformTypeIdentifiers

/// The user's own vector layers, as a section of the layer panel.
///
/// Its own section, beside the imported scans and apart from the catalogued
/// layers, for the same reason: everything else in the panel is a published
/// source with a provenance, and these are files the user brought in or shapes
/// they drew themselves.
struct UserVectorRowsView: View {
    @Bindable var viewModel: UserVectorsViewModel
    /// Called with a layer's extent when the user asks to see it. Optional so
    /// the panel can be shown — in a preview, in a test — without a map.
    var onZoom: ((GeoBoundingBox) -> Void)?
    /// Called to open the editor on a layer. Optional for the same reason: the
    /// panel is still the panel without a map behind it.
    var onEdit: ((UserVectorsViewModel.Row) -> Void)?

    @State private var isImporting = false
    @State private var sharing: SharePayload?
    @State private var renaming: UserVectorsViewModel.Row?
    @State private var newName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Your Data")
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
                Text("Import GeoJSON, KML, KMZ, GPX or a zipped shapefile.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(viewModel.rows) { row in
                UserVectorRow(
                    row: row,
                    onVisible: { viewModel.setVisible($0, id: row.id) },
                    onZoom: row.record.bbox.flatMap { box in onZoom.map { zoom in { zoom(box) } } },
                    onRename: {
                        newName = row.record.name
                        renaming = row
                    },
                    onEdit: onEdit.map { edit in { edit(row) } },
                    onExport: row.parsed.map { parsed in
                        { format in sharing = Self.payload(row.record, parsed, format) }
                    },
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
        .sheet(item: $sharing) { payload in
            ShareSheet(items: payload.items)
        }
        .fileImporter(
            isPresented: $isImporting,
            // `.data` as well as the named types: the sniffer reads the bytes,
            // and a GeoJSON exported as `.txt` or a KML the system does not
            // recognise would otherwise be unpickable rather than refused with
            // a reason.
            allowedContentTypes: [.json, .xml, .zip, .data],
            allowsMultipleSelection: false
        ) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            Task { await load(url) }
        }
        .alert(
            "Rename layer",
            isPresented: Binding(
                get: { renaming != nil },
                // A dismissal that did not clear this would reopen the alert
                // on the next redraw.
                set: { if !$0 { renaming = nil } }
            )
        ) {
            TextField("Name", text: $newName)
            Button("Cancel", role: .cancel) { renaming = nil }
            Button("Save") {
                if let row = renaming {
                    Task { await viewModel.rename(id: row.id, to: newName) }
                }
                renaming = nil
            }
        }
    }

    /// What a layer can be handed to another app as.
    ///
    /// Both, rather than GeoJSON alone: GeoJSON is what another mapping tool
    /// wants, and KML is what Google Earth opens. Neither is a conversion of the
    /// other's meaning — the KML carries the authored styling, the GeoJSON
    /// carries every property the file arrived with.
    enum ExportFormat: String, CaseIterable {
        case geoJson = "GeoJSON"
        case kml = "KML"

        var fileExtension: String { self == .geoJson ? "geojson" : "kml" }
    }

    /// The layer written to a temporary file under its own name.
    ///
    /// Named for the layer rather than its id, because the id is this app's
    /// bookkeeping and the name is what the user called it. `nil` if it cannot
    /// be written or encoded: a share that silently handed over nothing would
    /// look like the other app refused it.
    static func payload(
        _ record: UserVectorLayerRecord, _ parsed: ParsedVector, _ format: ExportFormat
    ) -> SharePayload? {
        let safe = record.name
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        let filename = "\(safe.isEmpty ? "layer" : safe).\(format.fileExtension)"
        switch format {
        case .geoJson:
            guard let data = try? VectorExport.geoJson(parsed),
                let text = String(data: data, encoding: .utf8)
            else { return nil }
            return SharePayload(text: text, filename: filename)
        case .kml:
            return SharePayload(
                text: VectorExport.kml(layerName: record.name, parsed: parsed),
                filename: filename
            )
        }
    }

    /// Reads the chosen file into memory, under the security scope the picker
    /// hands over.
    ///
    /// Read rather than referenced: the scope ends when this returns, and a
    /// record holding a URL into another app's container would be a layer that
    /// worked until the user moved the file.
    private func load(_ url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return }
        await viewModel.importFile(data: data, filename: url.lastPathComponent)
    }
}

private struct UserVectorRow: View {
    let row: UserVectorsViewModel.Row
    let onVisible: (Bool) -> Void
    let onZoom: (() -> Void)?
    let onRename: () -> Void
    let onEdit: (() -> Void)?
    /// Nil while the layer's features are still being read: there is nothing to
    /// hand over yet, and an export of an unloaded layer would be an empty file.
    let onExport: ((UserVectorRowsView.ExportFormat) -> Void)?
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                // The layer's own colour, so a row can be matched to what it
                // drew without switching it off to find out.
                Circle()
                    .fill(Color(uiColor: UIColor(featureHex: row.record.colorHex)))
                    .frame(width: 10, height: 10)

                Toggle(isOn: Binding(get: { row.isVisible }, set: onVisible)) {
                    Text(row.record.name).font(.subheadline)
                }
                .toggleStyle(.switch)

                Menu {
                    if let onZoom {
                        Button("Zoom to layer", action: onZoom)
                    }
                    if let onEdit {
                        Button("Edit…", action: onEdit)
                    }
                    if let onExport {
                        Menu("Export") {
                            ForEach(UserVectorRowsView.ExportFormat.allCases, id: \.self) { format in
                                Button(format.rawValue) { onExport(format) }
                            }
                        }
                    }
                    Button("Rename…", action: onRename)
                    Button("Delete", role: .destructive, action: onDelete)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Options for \(row.record.name)")
            }

            // The provenance, on the row rather than only in a popup: this is
            // the user's own material, and the panel is where they decide what
            // they are looking at.
            Text("\(row.record.featureCount) features · \(row.record.origin.provenanceText)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
