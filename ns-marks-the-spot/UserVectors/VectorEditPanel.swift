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
    @State private var isConvertExpanded = false
    @State private var keepSourcePoints = true
    /// The tool change waiting on the reader's answer about a partial draft.
    @State private var pendingDraftAction: PendingDraftAction?

    /// What the reader was doing when a partial draft got in the way.
    private enum PendingDraftAction {
        case done
        case putToolDown
        case draw(VectorEditShape)
        case erase
    }

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
                if session.isEnding {
                    // The last write is still landing; a tap on the map now
                    // would be lost with the session, so nothing takes taps.
                    ProgressView()
                        .accessibilityLabel("Saving")
                } else {
                    Button("Done") { leavingDraft(then: .done) }
                }
            }

            if session.layerIsHidden {
                // Said here because the switch lives in the layers panel,
                // which closed when editing began. The map draws the session's
                // copy meanwhile, so what is drawn is on screen either way.
                HStack(alignment: .firstTextBaseline) {
                    Label(
                        "This layer is switched off in Layers. It is drawn while you "
                            + "edit it, and any change you make will switch it on when you tap Done.",
                        systemImage: "eye.slash"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer()
                    Button {
                        // Registered before any task starts, so a Done tapped
                        // a moment later waits for it.
                        session.requestShowLayer()
                    } label: {
                        Text("Show now")
                            .font(.caption)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.borderless)
                }
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
                            leavingDraft(then: .putToolDown)
                        } else {
                            leavingDraft(then: .draw(tool.shape))
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
                        leavingDraft(then: .erase)
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

            if let snapNotice = session.snapNotice {
                Text(snapNotice)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .transition(.opacity)
            }

            if let draft = session.draft, draft.shape != .point {
                HStack {
                    Text(
                        draft.canFinish
                            ? "\(draft.vertices.count) placed"
                            : "\(draft.vertices.count) placed · needs "
                                + "\(draft.requiredVertices) for \(Self.article(draft.shape))"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    Spacer()
                    Button("Undo point") { session.undoLastVertex() }
                        .font(.caption)
                        .disabled(draft.vertices.isEmpty)
                    // Prominent, and counting: the small caption this used to
                    // be was the only thing that committed a line or area, and
                    // readers tapped Done instead and lost the shape.
                    Button {
                        session.finishDrawing()
                    } label: {
                        Text("Finish \(Self.noun(draft.shape)) · \(draft.vertices.count)")
                            .font(.caption.weight(.semibold))
                            // The target, not only the label: 32 points was
                            // under the minimum.
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.borderedProminent)
                    // A stable name for the control; the count is its value,
                    // so VoiceOver does not hear a new button on every tap.
                    .accessibilityLabel("Finish \(Self.noun(draft.shape))")
                    .accessibilityValue("\(draft.vertices.count) corners")
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

            snapSection

            convertSection

            if let feature = session.selectedFeature {
                // Scrolls because attributes and photos grow with the
                // feature; a panel taller than the phone would put its own
                // Done button off screen.
                ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Feature name", text: $featureName)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: featureName) { _, _ in commitFeature() }
                    TextField("Feature description", text: $featureDescription, axis: .vertical)
                        .lineLimit(2...4)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: featureDescription) { _, _ in commitFeature() }

                    FeatureAttributesEditor(feature: feature) { patch in
                        guard let id = feature.id else { return }
                        session.updateFeatureProperties(featureID: id, patch: patch)
                    }

                    FeaturePhotoStrip(session: session, feature: feature)
                    if feature.properties[CaptureSpec.tracedKey]?.stringValue
                        == CaptureSpec.tracedParcelValue
                    {
                        // The whole provenance, as the callout and the export
                        // give it: the Province's attribution and licence line
                        // travel with a traced corner wherever it is shown,
                        // and the panel replaces the callout while editing.
                        Text(VectorExport.tracedProvenanceNote)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
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
                }
                .frame(maxHeight: 300)
                .scrollBounceBehavior(.basedOnSize)
            } else if session.tool != .erasing {
                Text("Tap a feature to name it, or pick a tool to draw one.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
        .allowsHitTesting(!session.isEnding)
        .onAppear {
            layerName = session.record?.name ?? ""
            syncFeatureFields()
        }
        // Spoken as well as shown: the caption comes and goes while VoiceOver
        // focus is on the map, and a snap that is only visual is a tap that
        // did nothing to a reader who cannot see the caption.
        // On the count, not the text: the same outcome twice in a row is two
        // events to a VoiceOver reader, and equal text is no change to SwiftUI.
        .onChange(of: session.snapNoticeGeneration) { _, _ in
            if let notice = session.snapNotice {
                AccessibilityNotification.Announcement(notice).post()
            }
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
        // What the parcel fetch came to is said out loud as well as drawn:
        // "Zoom in", "Too many parcels" and "none here" arrived silently for
        // a VoiceOver reader with the toggle just thrown.
        .onChange(of: session.parcelSnapNote) { _, note in
            if let note {
                AccessibilityNotification.Announcement(note).post()
            }
        }
        // Asked only for a draft too short to be a shape. One that is a shape
        // is finished on the way out, and an empty one is nothing to ask about.
        .alert(
            "Discard this unfinished \(Self.noun(session.draft?.shape ?? .line))?",
            isPresented: Binding(
                get: { pendingDraftAction != nil },
                set: { if !$0 { pendingDraftAction = nil } }
            ),
            presenting: pendingDraftAction
        ) { action in
            Button("Keep drawing", role: .cancel) { pendingDraftAction = nil }
            Button("Discard", role: .destructive) {
                session.discardDraft()
                perform(action)
            }
        } message: { _ in
            Text(
                "It has \(session.draft?.vertices.count ?? 0) of the "
                    + "\(session.draft?.requiredVertices ?? 0) points it needs."
            )
        }
    }

    /// Runs `action` once the draft is out of the way: finished if it is a
    /// shape, dropped if it is empty, or held behind the alert if it is
    /// neither.
    private func leavingDraft(then action: PendingDraftAction) {
        switch session.settleDraft() {
        case .cleared, .finished:
            perform(action)
        case .needsConfirmation:
            pendingDraftAction = action
        }
    }

    private func perform(_ action: PendingDraftAction) {
        pendingDraftAction = nil
        switch action {
        case .done: onDone()
        case .putToolDown: session.cancelDrawing()
        case .draw(let shape): session.startDrawing(shape)
        case .erase: session.startErasing()
        }
    }

    private static func noun(_ shape: VectorEditShape) -> String {
        switch shape {
        case .point: "point"
        case .line: "line"
        case .area: "area"
        }
    }

    private static func article(_ shape: VectorEditShape) -> String {
        shape == .area ? "an area" : "a \(noun(shape))"
    }

    /// "Make line or area from points", per the field-capture contract:
    /// stored array order, live length/area stats, keep-source default, and
    /// a one-shot undo. Collapsed until asked for — most sessions never
    /// convert — and absent entirely when the layer has no points to
    /// connect.
    @ViewBuilder
    private var convertSection: some View {
        let linePlan = session.convertPlanLine
        let areaPlan = session.convertPlanArea
        if session.conversionUndo != nil {
            HStack {
                Text("Points connected.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Undo") { session.undoConversion() }
                    .font(.caption)
            }
        } else if let linePlan, linePlan.sourcePointCount >= 2 {
            DisclosureGroup(
                isExpanded: Binding(
                    get: { isConvertExpanded },
                    set: { expanded in
                        isConvertExpanded = expanded
                        // The map draws the connect-the-dots order while the
                        // section is open, so the order is seen before it is
                        // committed.
                        session.isPreviewingConversion = expanded
                    }
                )
            ) {
                VStack(alignment: .leading, spacing: 8) {
                    // The order is the stored order; there is no reordering
                    // in v1, so say what will happen before it does.
                    Text(
                        "Connects the layer's \(linePlan.sourcePointCount) points "
                            + "in the order they were added."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                    if linePlan.selfIntersects || areaPlan?.selfIntersects == true {
                        Label(
                            "The path crosses itself. It can still be made.",
                            systemImage: "exclamationmark.triangle"
                        )
                        .font(.caption)
                        .foregroundStyle(.orange)
                    }

                    Toggle(isOn: $keepSourcePoints) {
                        Text("Keep the points").font(.caption)
                    }

                    HStack(spacing: 8) {
                        Button {
                            session.convertPoints(shape: .line, keepSourcePoints: keepSourcePoints)
                            isConvertExpanded = false
                            session.isPreviewingConversion = false
                        } label: {
                            Text("Line · \(Geodesy.formatDistance(linePlan.lengthM))")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        .disabled(!linePlan.viable)

                        if let areaPlan {
                            Button {
                                session.convertPoints(
                                    shape: .area, keepSourcePoints: keepSourcePoints
                                )
                                isConvertExpanded = false
                                session.isPreviewingConversion = false
                            } label: {
                                Text(
                                    areaPlan.viable
                                        ? "Area · \(Geodesy.formatArea(areaPlan.areaM2 ?? 0))"
                                        : "Area · needs 3 points"
                                )
                                .font(.caption)
                            }
                            .buttonStyle(.bordered)
                            .disabled(!areaPlan.viable)
                        }
                    }
                }
                .padding(.top, 4)
            } label: {
                Text("Make line or area from points")
                    .font(.caption)
            }
        }
    }

    @ViewBuilder
    private var snapSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle("Snap while drawing", isOn: $session.snapEnabled)
                .font(.caption)
            if session.snapEnabled {
                Toggle("My features", isOn: $session.snapOwnFeatures)
                    .font(.caption)
                Toggle("Parcel boundaries (NSPRD)", isOn: $session.snapParcels)
                    .font(.caption)
                // Wherever the toggle is visible, as the contract pins it and
                // the web shows it: not only once it is on.
                Text(CaptureSpec.Snap.parcelCaveat)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let note = session.parcelSnapNote {
                    Text(note)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
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
