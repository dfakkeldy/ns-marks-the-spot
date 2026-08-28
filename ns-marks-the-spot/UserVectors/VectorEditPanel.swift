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

                // A mode rather than a confirmation per feature, as the
                // browser's removal tool is. Clearing a session's worth of
                // marks one alert at a time is what the mode exists to avoid;
                // arming it deliberately, and being able to put every erase
                // back while it is up, is the safety instead.
                Button {
                    if session.tool == .erasing {
                        session.stopErasing()
                    } else {
                        session.startErasing()
                    }
                } label: {
                    Label("Erase", systemImage: "eraser")
                        .font(.caption)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(session.tool == .erasing ? .red : .secondary)
                .accessibilityLabel("Delete features")
                .accessibilityAddTraits(session.tool == .erasing ? .isSelected : [])
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
            } else if session.tool == .erasing {
                HStack {
                    Text(
                        session.erasedCount == 0
                            ? "Tap a feature to delete it."
                            : "\(session.erasedCount) deleted."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    Spacer()
                    Button("Undo") { session.undoLastErase() }
                        .font(.caption)
                        .disabled(session.erasedCount == 0)
                }
            }

            // Committed as it is typed, not on Return. The description field is
            // multiline, where Return inserts a newline and `onSubmit` never
            // fires at all — so the one field carrying the finding ("no road
            // frontage, culvert washed out") was the one field that could not
            // be saved from its own keyboard. Tapping the next feature then
            // overwrote it.
            TextField("Layer name", text: $layerName)
                .textFieldStyle(.roundedBorder)
                .onChange(of: layerName) { _, name in session.setLayerName(name) }

            if let feature = session.selectedFeature {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Feature name", text: $featureName)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: featureName) { _, _ in commitFeature() }
                    TextField("Feature description", text: $featureDescription, axis: .vertical)
                        .lineLimit(2...4)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: featureDescription) { _, _ in commitFeature() }
                    // Named because the two kinds of handle look different and
                    // do different things, and nothing else on screen says so:
                    // a user who drags the middle one expecting a vertex would
                    // move their whole shape and not know why.
                    Text("Drag the arrows in the middle to move the whole feature.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if !VectorSelectionHandles.isReshapable(feature) {
                        // Said out loud, because a selected shape that grew no
                        // corner handles otherwise reads as the app failing to
                        // notice the tap.
                        Text(
                            "This shape has too many corners to drag on a phone. "
                                + "It can still be moved, named or deleted."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    Button("Delete this feature", role: .destructive) {
                        isConfirmingDelete = true
                    }
                    .font(.caption)
                }
                .id(feature.id)
            } else if session.tool != .erasing {
                Text("Tap a feature to name it, or pick a tool to draw one.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
        .onAppear {
            layerName = session.record?.name ?? ""
            syncFeatureFields()
        }
        // The fields follow the selection rather than the other way round: a
        // user who taps a second feature must not have the first one's name
        // written onto it.
        .onChange(of: session.selectedFeatureID) { _, _ in syncFeatureFields() }
        .alert("Delete this feature?", isPresented: $isConfirmingDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { session.deleteSelectedFeature() }
        } message: {
            Text("This cannot be undone.")
        }
    }

    private func syncFeatureFields() {
        featureName = session.selectedFeature?.properties["name"]?.stringValue ?? ""
        featureDescription =
            session.selectedFeature?.properties["description"]?.stringValue ?? ""
    }

    /// Writes the typed text, unless it is already what the feature says.
    ///
    /// The guard is what makes commit-on-change safe: selecting a feature
    /// fills these fields from it, which fires the same change handler, and
    /// without the comparison every tap on the map would rewrite a feature
    /// with its own values and date the layer as edited.
    private func commitFeature() {
        guard let feature = session.selectedFeature else { return }
        let storedName = feature.properties["name"]?.stringValue ?? ""
        let storedDescription = feature.properties["description"]?.stringValue ?? ""
        guard featureName != storedName || featureDescription != storedDescription else { return }
        session.updateSelectedFeature(name: featureName, description: featureDescription)
    }
}
