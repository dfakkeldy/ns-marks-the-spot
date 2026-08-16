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
    @State private var choosingFrame: UserMapsViewModel.Row?

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
                Text("Import a GeoTIFF, PDF, PNG or JPEG to draw it on the map.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(viewModel.rows) { row in
                UserMapRow(
                    row: row,
                    onVisible: { viewModel.setVisible($0, id: row.id) },
                    onOpacity: { viewModel.setOpacity($0, id: row.id) },
                    onPlace: { georeferencing = row },
                    onChooseFrame: { choosingFrame = row },
                    onDelete: { Task { await viewModel.delete(id: row.id) } }
                )
            }

            ForEach(viewModel.notices) { notice in
                // Each message in its own words. They were written for the
                // person who chose that file and they say what to do about it;
                // a generic "import failed" here would throw that away.
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
        .fileImporter(
            isPresented: $isImporting,
            allowedContentTypes: [.tiff, .png, .jpeg, .pdf],
            allowsMultipleSelection: true
        ) { result in
            guard case .success(let urls) = result else { return }
            Task { await load(urls) }
        }
        .sheet(item: $choosingFrame) { row in
            PdfFrameChooser(name: row.record.name, frames: row.frames) { candidate in
                Task { await viewModel.selectFrame(id: row.id, candidateID: candidate.id) }
            }
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
    private func load(_ urls: [URL]) async {
        var files = [(data: Data, name: String)]()
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            // A file the picker handed over but the sandbox will not open —
            // rare, and nothing here can say more about it than the picker
            // already did.
            guard let data = try? Data(contentsOf: url) else { continue }
            files.append((data, url.deletingPathExtension().lastPathComponent))
        }
        await viewModel.importMaps(files)
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
    //
    // Handing one of these to `Binding(set:)` *directly* crashes the Swift
    // 6.3.3 code generator: emitting the isolated-to-`@Sendable` reabstraction
    // thunk asks LLVM for a 4-billion-element vector and aborts. It is not a
    // type error, so it survives `-typecheck` and only appears in a real build.
    // Calling through a closure literal that re-enters the actor explicitly
    // asks for no thunk and keeps the isolation these callbacks are declared
    // with. See `mainActorSetter` below.
    let onVisible: @MainActor (Bool) -> Void
    let onOpacity: @MainActor (CGFloat) -> Void
    let onPlace: () -> Void
    let onChooseFrame: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Toggle(
                    isOn: Binding(get: { row.isVisible }, set: mainActorSetter(onVisible))
                ) {
                    Text(row.record.name).font(.subheadline)
                }
                .toggleStyle(.switch)
                // A sheet nobody has placed cannot draw, so its switch is not
                // a choice yet. Left visible rather than hidden: the row is
                // the user's map and it has to stay findable.
                .disabled(row.needsGeoreferencing)

                Menu {
                    if row.needsFrameSelection {
                        Button("Choose map frame…", action: onChooseFrame)
                    }
                    Button("Place on map…", action: onPlace)
                    Button("Delete", role: .destructive, action: onDelete)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Options for \(row.record.name)")
            }

            if row.needsFrameSelection {
                // The file already knows where each of its frames belongs, so
                // choosing one is a click rather than a georeferencing session.
                // Hand placement stays available in the menu, because the frame
                // the user wants may be one the file never registered.
                Button("Choose map frame…", action: onChooseFrame)
                    .font(.caption)
            } else if row.needsGeoreferencing {
                Button("Place on map…", action: onPlace)
                    .font(.caption)
            } else {
                Slider(
                    value: Binding(get: { row.opacity }, set: mainActorSetter(onOpacity)),
                    in: 0...1
                )
                .disabled(!row.isVisible)
                .accessibilityLabel("Opacity for \(row.record.name)")
            }
        }
    }
}

/// Which frame on the page the sheet actually is.
///
/// A page can carry several honest registrations — a county map with three
/// inset towns, each correctly placed on its own ground. Choosing for the user
/// would drape one of them over the others' territory, and the result would
/// look entirely plausible, so the page waits here instead.
private struct PdfFrameChooser: View {
    let name: String
    let frames: [PdfMapRegistration.Candidate]
    let onChoose: (PdfMapRegistration.Candidate) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(frames) { frame in
                Button {
                    onChoose(frame)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(frame.label ?? "Frame \(index(of: frame))")
                            .font(.subheadline)
                        // The ground it covers and the part of the page it is,
                        // because on an unlabelled page those are the only two
                        // things that tell one frame from another.
                        Text(extent(of: frame))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(area(of: frame))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func index(of frame: PdfMapRegistration.Candidate) -> Int {
        (frames.firstIndex(of: frame) ?? 0) + 1
    }

    /// The corners of the ground the frame claims, to five decimals — about a
    /// metre, which is the scale at which two frames on one page differ.
    private func extent(of frame: PdfMapRegistration.Candidate) -> String {
        let lats = frame.gcps.map(\.map.lat)
        let lngs = frame.gcps.map(\.map.lng)
        guard let south = lats.min(), let north = lats.max(),
              let west = lngs.min(), let east = lngs.max()
        else { return "No extent recorded" }
        return String(
            format: "%.5f, %.5f to %.5f, %.5f", south, west, north, east
        )
    }

    private func area(of frame: PdfMapRegistration.Candidate) -> String {
        let rect = frame.sourceRect
        return String(
            format: "%.0f × %.0f px on the page", rect.width, rect.height
        )
    }
}
