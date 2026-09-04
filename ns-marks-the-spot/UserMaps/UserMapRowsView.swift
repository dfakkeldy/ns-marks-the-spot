import GeoCore
import MapKit
import SwiftUI

/// The user's own maps, as a section of the layer panel.
///
/// Its own section rather than rows mixed in with the catalogued layers,
/// because the distinction is one the user has to be able to see: everything
/// else in the panel is a published source with a provenance, and these are
/// files the user brought in and placed themselves. A hand-placed scan is
/// research, not a record.
struct UserMapRowsView: View {
    @Bindable var viewModel: UserMapsViewModel

    /// Read here rather than inside the sheet: the opening view has to be
    /// known before the georeferencer's map pane is built.
    @Environment(\.georeferenceReferences) private var referenceServices

    @State private var georeferencing: UserMapsViewModel.Row?
    @State private var choosingFrame: UserMapsViewModel.Row?
    /// The map a delete is waiting on an answer about.
    ///
    /// Asked because the map cannot be got back. A scan the reader spent an
    /// evening placing by hand is gone with the points that placed it, and the
    /// menu item sits directly under "Place on map…" where a slipped thumb
    /// reaches it. The browser asks the same question.
    @State private var deleting: UserMapsViewModel.Row?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your Maps")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)

            if viewModel.rows.isEmpty, !viewModel.isLibrarySealed {
                // Not over a library this build could not read: the reader's
                // maps may all be in it, and inviting an import that the
                // notice below refuses would be an empty list claiming to be
                // the answer.
                Text("Import a GeoTIFF, PDF, PNG or JPEG to draw it on the map.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(viewModel.rows) { row in
                UserMapRow(
                    row: row,
                    onVisible: { viewModel.setVisible($0, id: row.id) },
                    onOpacity: { viewModel.setOpacity($0, id: row.id) },
                    // Through the ensure call, not the row value in hand: a
                    // hidden row's preview is evicted, and both sheets draw
                    // the page itself.
                    onPlace: {
                        Task { georeferencing = await viewModel.rowEnsuringPreview(id: row.id) }
                    },
                    onChooseFrame: {
                        Task { choosingFrame = await viewModel.rowEnsuringPreview(id: row.id) }
                    },
                    onDelete: { deleting = row }
                )
            }

            if !viewModel.notices.isEmpty {
                HStack {
                    Text("Messages")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        viewModel.clearNotices()
                    } label: {
                        Text("Dismiss")
                            .font(.caption)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                }
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
        .sheet(item: $choosingFrame) { row in
            PdfFrameChooser(
                name: row.record.name,
                preview: row.preview,
                pixelSize: row.record.pixelSize,
                frames: row.frames,
                selectedFrameID: row.selectedFrameID,
                replacesUserWork: row.frameChangeReplacesUserWork
            ) { candidate in
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
                method: method(of: row),
                openingRegion: referenceServices?.mainMapRegion
            ) { points, method in
                await viewModel.place(id: row.id, controlPoints: points, method: method)
            }
        }
        // `presenting:` rather than the row read out of the state: the actions
        // and the message are handed the map the dialog opened on, so clearing
        // the state on the way out cannot change what the sheet says while it
        // is still animating away. The name is in the message for the same
        // reason — a title is read from outside the closure.
        .confirmationDialog(
            "Remove this map?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible,
            presenting: deleting
        ) { row in
            Button("Remove", role: .destructive) {
                deleting = nil
                Task { await viewModel.delete(id: row.id) }
            }
            Button("Keep", role: .cancel) { deleting = nil }
        } message: { row in
            // The same promise the browser makes, in the words iOS makes it
            // true in: the file the reader imported from stays where it is,
            // whether that is Files, iCloud Drive or another app.
            Text("\(row.record.name) goes from this device. The file you imported is not affected.")
        }
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
                    } else if row.canChangeFrame {
                        // The sheet is drawn on ground the file named, and the
                        // user is the only one who can know it named the wrong
                        // frame of the several the page carried.
                        Button("Change map frame…", action: onChooseFrame)
                    }
                    Button("Place on map…", action: onPlace)
                    Button("Delete", role: .destructive, action: onDelete)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Options for \(row.record.name)")
            }

            if let provenance = row.provenance {
                // What placed this sheet, said in the row. Once a file-placed
                // map and a hand-placed one are both drawn, this line is the
                // only thing that tells them apart.
                Text(provenance)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if row.needsFrameSelection {
                // The file already knows where each of its frames belongs, so
                // choosing one is a click rather than a georeferencing session.
                // Hand placement stays available in the menu, because the frame
                // the user wants may be one the file never registered.
                Button(action: onChooseFrame) {
                    Text("Choose map frame…")
                        .font(.caption)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
            } else if row.needsGeoreferencing {
                Button(action: onPlace) {
                    Text("Place on map…")
                        .font(.caption)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
            } else {
                // Live whether or not the sheet is showing, as the browser's
                // is. Setting a scan to a third before revealing it is how a
                // comparison gets prepared; a slider that only works once the
                // sheet is up makes the reader blot out the map they are
                // comparing against first, then dial back.
                Slider(
                    value: Binding(get: { row.opacity }, set: mainActorSetter(onOpacity)),
                    in: 0...1
                )
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
///
/// The page itself is the chooser, with the selected frame drawn on it. A list
/// of coordinates would be asking the user to identify a map from its corner
/// numbers; the outline shows them which part of their own sheet they are
/// about to place, which is the question they can actually answer.
private struct PdfFrameChooser: View {
    let name: String
    let preview: CGImage?
    let pixelSize: PixelSize
    let frames: [PdfMapRegistration.Candidate]
    let selectedFrameID: String?
    /// Switching would replace points the user moved themselves.
    let replacesUserWork: Bool
    let onChoose: (PdfMapRegistration.Candidate) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var chosenID: String?
    @State private var isConfirming = false

    private var chosen: PdfMapRegistration.Candidate? {
        frames.first { $0.id == chosenID }
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("Choose the map or inset to draw. Its own coordinates place it.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                page

                List(Array(frames.enumerated()), id: \.element.id) { index, frame in
                    Button {
                        chosenID = frame.id
                    } label: {
                        HStack {
                            Text(PdfImportMetadata.label(at: index, in: frames))
                                .font(.subheadline)
                            Spacer()
                            if frame.id == chosenID {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                    .accessibilityAddTraits(
                        frame.id == chosenID ? [.isSelected] : []
                    )
                }
                .listStyle(.plain)
            }
            .padding(.horizontal)
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Use this frame") {
                        // Only if there is work to lose. A first choice, or a
                        // switch between two frames the user has not touched,
                        // is not worth a dialog.
                        if replacesUserWork, chosenID != selectedFrameID {
                            isConfirming = true
                        } else {
                            use()
                        }
                    }
                    .disabled(chosen == nil)
                }
            }
            .confirmationDialog(
                """
                Placing this frame replaces the points you moved with the \
                frame's own coordinates.
                """,
                isPresented: $isConfirming,
                titleVisibility: .visible
            ) {
                Button("Replace my points", role: .destructive) { use() }
                Button("Keep my points", role: .cancel) {}
            }
            .onAppear { chosenID = chosenID ?? selectedFrameID }
        }
    }

    /// The page, with the frame about to be placed outlined on it.
    private var page: some View {
        GeometryReader { geometry in
            let scale = min(
                geometry.size.width / pixelSize.width,
                geometry.size.height / pixelSize.height
            )
            let drawn = CGSize(
                width: pixelSize.width * scale, height: pixelSize.height * scale
            )
            ZStack(alignment: .topLeading) {
                if let preview {
                    Image(decorative: preview, scale: 1)
                        .resizable()
                        .frame(width: drawn.width, height: drawn.height)
                } else {
                    // The pixels have not loaded, or are gone. The outline is
                    // still worth showing: it is where on the sheet the frame
                    // sits, which is the whole question.
                    Rectangle()
                        .fill(.quaternary)
                        .frame(width: drawn.width, height: drawn.height)
                }
                if let rect = chosen?.sourceRect {
                    Rectangle()
                        .strokeBorder(.tint, lineWidth: 2)
                        .frame(
                            width: rect.width * scale, height: rect.height * scale
                        )
                        .offset(x: rect.x * scale, y: rect.y * scale)
                }
            }
            .frame(
                width: geometry.size.width, height: geometry.size.height,
                alignment: .top
            )
        }
        .frame(height: 240)
        .accessibilityLabel("Page 1 of \(name)")
    }

    private func use() {
        guard let chosen else { return }
        onChoose(chosen)
        dismiss()
    }
}
