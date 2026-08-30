import GeoCore
import SwiftUI

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
    @State private var sharing: SharePayload?
    @State private var deleting: UserVectorsViewModel.Row?
    @State private var renaming: UserVectorsViewModel.Row?
    @State private var newName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your Data")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)

            if viewModel.rows.isEmpty {
                Text("Draw your own, or import GeoJSON, KML, KMZ, GPX or a zipped shapefile.")
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
                        { format in
                            switch format {
                            case .original:
                                Task {
                                    sharing = await originalPayload(row)
                                }
                            case .kmz:
                                Task {
                                    sharing = await kmzPayload(row, parsed)
                                }
                            default:
                                sharing = Self.payload(row.record, parsed, format)
                            }
                        }
                    },
                    hasOriginal: row.record.originalFileID != nil,
                    hasPhotos: row.parsed.map(Self.hasPhotos) ?? false,
                    onDelete: { deleting = row }
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

            if !viewModel.importNotices.isEmpty {
                HStack {
                    Text("Messages")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Dismiss") { viewModel.clearNotices() }
                        .font(.caption)
                }
            }

            // Named, one per file: a selection of ten reports ten times, and
            // the reader can tell which of their files did not come.
            ForEach(viewModel.importNotices) { notice in
                Label(
                    "\(notice.name): \(notice.message)",
                    systemImage: notice.isRefusal
                        ? "exclamationmark.triangle" : "info.circle"
                )
                .font(.caption)
                .foregroundStyle(notice.isRefusal ? .orange : .secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        // Confirmed, because a drawn layer has no file to import again: the
        // copy on this device is the only one there is.
        .alert(
            "Delete \(deleting?.record.name ?? "this layer")?",
            isPresented: Binding(
                get: { deleting != nil },
                set: { if !$0 { deleting = nil } }
            )
        ) {
            Button("Cancel", role: .cancel) { deleting = nil }
            Button("Delete", role: .destructive) {
                if let row = deleting {
                    Task { await viewModel.delete(id: row.id) }
                }
                deleting = nil
            }
        } message: {
            Text(
                deleting?.record.source == .drawn
                    ? "This layer was drawn here and isn't saved anywhere else."
                    : "This removes it from the map. Your original file is untouched."
            )
        }
        .sheet(item: $sharing) { payload in
            ShareSheet(items: payload.items)
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
        /// The field-capture interchange profile: doc.kml plus the layer's
        /// photos, which the plain formats cannot carry.
        case kmz = "KMZ (with photos)"
        /// The bytes the user imported, byte for byte.
        ///
        /// Offered because the two above are conversions, and a conversion is
        /// not the thing it converted: the KML the user brought in carries its
        /// author's styling and the shapefile carries its own projection
        /// metadata, none of which survives the trip through GeoJSON.
        case original = "Original file"

        var fileExtension: String {
            switch self {
            case .geoJson: return "geojson"
            case .kml: return "kml"
            case .kmz: return "kmz"
            case .original: return "original"
            }
        }
    }

    /// Whether any feature carries photo descriptors — the export menu's
    /// honest note hangs off it.
    static func hasPhotos(_ parsed: ParsedVector) -> Bool {
        parsed.features.contains { !PhotoDescriptor.read(from: $0.properties).isEmpty }
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
        case .kmz, .original:
            // Handled by their callers, which have to read bytes off disk.
            return nil
        }
    }

    /// The safe filename stem the payloads share.
    static func safeName(_ name: String) -> String {
        let safe = name
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        return safe.isEmpty ? "layer" : safe
    }

    /// The KMZ payload: the layer's photo bytes gathered from the store,
    /// the archive built per the interchange profile, and any photos whose
    /// bytes could not be read reported rather than dangled.
    private func kmzPayload(
        _ row: UserVectorsViewModel.Row, _ parsed: ParsedVector
    ) async -> SharePayload? {
        var photoBytes: [String: Data] = [:]
        for feature in parsed.features {
            for descriptor in PhotoDescriptor.read(from: feature.properties)
            where photoBytes[descriptor.id] == nil {
                if let data = await viewModel.photoData(
                    layerID: row.id, photoID: descriptor.id, thumb: false
                ) {
                    photoBytes[descriptor.id] = data
                }
            }
        }
        guard let export = VectorExport.kmz(
            layerName: row.record.name, parsed: parsed, photos: photoBytes
        ) else { return nil }
        if export.photosMissing > 0 {
            viewModel.reportExportShortfall(
                layerName: row.record.name,
                message:
                    "\(export.photosMissing) photo\(export.photosMissing == 1 ? "" : "s") "
                    + "couldn't be read and were left out of the KMZ."
            )
        }
        let url = FileManager.default.temporaryDirectory
            .appending(path: "\(Self.safeName(row.record.name)).kmz")
        guard (try? export.data.write(to: url, options: .atomic)) != nil else { return nil }
        return SharePayload(url: url)
    }

    /// The imported file under the name it arrived with.
    ///
    /// Its own name rather than the layer's, because this is the file the user
    /// gave us and handing it back renamed would make it look converted. A
    /// recorded layer's original came from no file, so it goes out under the
    /// layer's name with the extension it actually is: raw GPX.
    private func originalPayload(_ row: UserVectorsViewModel.Row) async -> SharePayload? {
        let filename: String
        switch row.record.origin {
        case .imported(let imported, _):
            filename = imported
        case .recorded:
            let safe = row.record.name
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
                .joined(separator: "-")
            filename = "\(safe.isEmpty ? "track" : safe).gpx"
        case .drawn:
            return nil
        }
        guard let data = await viewModel.originalFile(for: row.id) else { return nil }
        let url = FileManager.default.temporaryDirectory.appending(path: filename)
        guard (try? data.write(to: url, options: .atomic)) != nil else { return nil }
        return SharePayload(url: url)
    }

    /// Reads the chosen file into memory, under the security scope the picker
    /// hands over.
    ///
    /// Read rather than referenced: the scope ends when this returns, and a
    /// record holding a URL into another app's container would be a layer that
    /// worked until the user moved the file.
}

private struct UserVectorRow: View {
    let row: UserVectorsViewModel.Row
    // See `UserMapRow`: an isolated closure is what `Binding`'s `@Sendable`
    // setter will take.
    let onVisible: @MainActor (Bool) -> Void
    let onZoom: (() -> Void)?
    let onRename: () -> Void
    let onEdit: (() -> Void)?
    /// Nil while the layer's features are still being read: there is nothing to
    /// hand over yet, and an export of an unloaded layer would be an empty file.
    let onExport: ((UserVectorRowsView.ExportFormat) -> Void)?
    /// Whether this build still holds the file the layer was imported from.
    let hasOriginal: Bool
    /// Whether any feature carries photos, for the export menu's honest note.
    let hasPhotos: Bool
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                // The layer's own colour, so a row can be matched to what it
                // drew without switching it off to find out.
                Circle()
                    .fill(Color(uiColor: UIColor(featureHex: row.record.colorHex)))
                    .frame(width: 10, height: 10)

                Toggle(isOn: Binding(get: { row.isVisible }, set: mainActorSetter(onVisible))) {
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
                                if format != .original || hasOriginal {
                                    // A recorded layer's original is the raw
                                    // GPX of every fix — named for what it is,
                                    // so the evidence is never mistaken for
                                    // the processed line.
                                    Button(
                                        format == .original && row.record.source == .recorded
                                            ? "Raw recording (GPX)" : format.rawValue
                                    ) { onExport(format) }
                                }
                            }
                            if hasPhotos {
                                // The honest note the web shows under its
                                // export buttons: the plain formats cannot
                                // carry photo bytes.
                                Text("Photos aren't included in GeoJSON or KML. Use KMZ to carry photos.")
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
            Text("\(row.record.featureCount) features · \(row.record.provenanceText)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
