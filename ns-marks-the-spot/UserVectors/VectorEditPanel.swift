import GeoCore
import SwiftUI

/// The editing surface: the drawing tools, the layer's name, and the selected
/// feature's details.
///
/// A panel over the map rather than a sheet, because drawing needs the map: a
/// modal that covered it would put the ground the user is tracing behind the
/// controls they are tracing it with.
struct VectorEditPanel: View {
    @Bindable var session: VectorEditSession
    var onDone: () -> Void

    @State private var layerName = ""
    @State private var featureName = ""
    @State private var featureDescription = ""
    @State private var isConfirmingDelete = false

    private static let tools: [(shape: VectorEditShape, label: String, symbol: String)] = [
        (.point, "Point", "mappin"),
        (.line, "Line", "scribble"),
        (.area, "Area", "pentagon"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Editing")
                    .font(.headline)
                Spacer()
                Button("Done") { onDone() }
            }

            if let storageError = session.storageError {
                // The refusal's own words: they say what to do about it, and
                // the edit is still on screen while they are read.
                Label(storageError, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                ForEach(Self.tools, id: \.shape) { tool in
                    Button {
                        if session.tool == .drawing(tool.shape) {
                            session.cancelDrawing()
                        } else {
                            session.startDrawing(tool.shape)
                        }
                    } label: {
                        Label(tool.label, systemImage: tool.symbol)
                            .font(.caption)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .tint(session.tool == .drawing(tool.shape) ? .accentColor : .secondary)
                    .accessibilityLabel("Draw \(tool.label.lowercased())")
                    .accessibilityAddTraits(
                        session.tool == .drawing(tool.shape) ? .isSelected : []
                    )
                }
            }

            if let draft = session.draft, draft.shape != .point {
                HStack {
                    Text("\(draft.vertices.count) placed")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Undo point") { session.undoLastVertex() }
                        .font(.caption)
                        .disabled(draft.vertices.isEmpty)
                    Button("Finish") { session.finishDrawing() }
                        .font(.caption)
                        // A shape that is not one yet cannot be saved as one:
                        // two taps is not an area.
                        .disabled(!draft.canFinish)
                }
            } else if case .drawing = session.tool {
                Text("Tap the map to place a point.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            TextField("Layer name", text: $layerName)
                .textFieldStyle(.roundedBorder)
                .onSubmit { Task { await session.renameLayer(layerName) } }

            if let feature = session.selectedFeature {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Feature name", text: $featureName)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { commitFeature() }
                    TextField("Feature description", text: $featureDescription, axis: .vertical)
                        .lineLimit(2...4)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { commitFeature() }
                    // Named because the two kinds of handle look different and
                    // do different things, and nothing else on screen says so:
                    // a user who drags the middle one expecting a vertex would
                    // move their whole shape and not know why.
                    Text("Drag the arrows in the middle to move the whole feature.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Delete this feature", role: .destructive) {
                        isConfirmingDelete = true
                    }
                    .font(.caption)
                }
                .id(feature.id)
            } else {
                Text("Tap a feature to name it, or pick a tool to draw one.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
        .onAppear { layerName = session.record?.name ?? "" }
        // The fields follow the selection rather than the other way round: a
        // user who taps a second feature must not have the first one's name
        // written onto it.
        .onChange(of: session.selectedFeatureID) { _, _ in
            featureName = session.selectedFeature?.properties["name"]?.stringValue ?? ""
            featureDescription =
                session.selectedFeature?.properties["description"]?.stringValue ?? ""
        }
        .alert("Delete this feature?", isPresented: $isConfirmingDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { session.deleteSelectedFeature() }
        } message: {
            Text("This cannot be undone.")
        }
    }

    private func commitFeature() {
        session.updateSelectedFeature(name: featureName, description: featureDescription)
    }
}
