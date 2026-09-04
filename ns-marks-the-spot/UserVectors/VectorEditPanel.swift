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
    /// The coordinate under the middle of the map, for moving a corner
    /// without dragging it. Nil before the map has laid out.
    var mapCentre: () -> GeoJsonPosition? = { nil }
    /// Pans the map to a corner, so the reader can see which one the
    /// stepper is on.
    var showCorner: (GeoJsonPosition) -> Void = { _ in }

    /// What a move to the map centre lands on: the centre itself, or the
    /// snap target under it, resolved by the container with the same rules
    /// as a drag — own features, the parcel fabric under its licence, the
    /// same tolerance — so the panel's move and a finger's move agree.
    struct CentreTarget {
        var position: GeoJsonPosition
        var parcelSnap = false
        var note: String?
    }
    var snapCentre: (GeoJsonPosition, String) -> CentreTarget = { position, _ in
        CentreTarget(position: position)
    }

    /// Places at the crosshair in the middle of the map, as the crosshair's
    /// own button does; nil while the middle of the map has no ground under
    /// it. Always on screen, so a reader who cannot reach the crosshair's
    /// button — no room for it, or no aim — still has the placement.
    var placeAtCentre: (() -> Void)?
    /// The coordinate the placement would land on, and what it snaps to.
    var placeAtCentreValue: () -> String? = { nil }
    /// Whether that placement would close the area being drawn.
    var placeAtCentreFinishesArea: () -> Bool = { false }

    @State private var layerName = ""
    @State private var featureName = ""
    @State private var featureDescription = ""
    @State private var isConfirmingDelete = false
    @State private var isConvertExpanded = false
    @State private var keepSourcePoints = true
    /// Which corner the non-drag mover is on. Reset with the selection.
    @State private var cornerIndex = 0
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
                    Button {
                        session.undoLastVertex()
                    } label: {
                        Text("Undo point")
                            .font(.caption)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
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
                // Beside the draft's own controls, not instead of them: the
                // panel's placement used to disappear at the first corner of
                // a line or area — exactly when a covered map leaves the
                // crosshair's own button no room — and the account of a
                // centre above the horizon went with it.
                if case .drawing(let shape) = session.tool {
                    placementRow(shape)
                }
            } else if case .drawing(let shape) = session.tool {
                placementRow(shape)
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
                    Button {
                        session.undoLastErase()
                    } label: {
                        Text("Undo")
                            .font(.caption)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
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
                    // move their whole shape and not know why. And press-and-
                    // hold is MapKit's drag gesture, which nothing on screen
                    // says either. A point has one handle and is called a
                    // point, not a corner.
                    let corners = VectorSelectionHandles.corners(of: feature)
                    if corners.count == 1 {
                        Text("Press and hold the handle to drag the point.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if !corners.isEmpty {
                        Text("Press and hold a corner handle to drag it.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Drag the arrows in the middle to move the whole feature.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    cornerMover(feature, corners: corners)
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
                    Button(role: .destructive) {
                        isConfirmingDelete = true
                    } label: {
                        Text("Delete this feature")
                            .font(.caption)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
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
    /// The crosshair's placement, reachable from the panel.
    private func placementRow(_ shape: VectorEditShape) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                placeAtCentre?()
            } label: {
                Label(Self.placeLabel(shape, finishesArea: placeAtCentreFinishesArea()), systemImage: "scope")
                    .font(.caption)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.bordered)
            .disabled(placeAtCentre == nil)
            .accessibilityValue(placeAtCentreValue() ?? "No ground under the crosshair")
            .accessibilityHint(
                placeAtCentre == nil
                    ? "Flatten the map until the crosshair is over ground."
                    : "Places at the crosshair in the middle of the map."
            )
            Text(
                placeAtCentre == nil
                    ? "The middle of the map is above the horizon. Flatten the map to place there."
                    : "Tap the map, press and hold, or place at the crosshair."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    static func placeLabel(_ shape: VectorEditShape, finishesArea: Bool) -> String {
        switch shape {
        case .point: "Place point at crosshair"
        case .line: "Add line point at crosshair"
        case .area: finishesArea ? "Finish area at crosshair" : "Add area corner at crosshair"
        }
    }

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
                Button {
                    session.undoConversion()
                } label: {
                    Text("Undo")
                        .font(.caption)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
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
        cornerIndex = 0
    }

    /// The way to move a corner without dragging it: step to the corner,
    /// pan the map until its middle is where the corner belongs, and move
    /// the corner there. What VoiceOver and Switch Control readers have
    /// instead of a press-and-hold drag, and a steadier hand for anyone.
    @ViewBuilder
    private func cornerMover(
        _ feature: GeoJsonFeature, corners: [VectorSelectionHandles.Corner]
    ) -> some View {
        // The whole shape first, and for every shape that has a middle: a
        // feature with too many corners for handles can still be moved, and
        // a reader who cannot press-and-hold the arrows handle needs this
        // button most of all for exactly those.
        if let featureID = feature.id, corners.count != 1,
           let middle = VectorMoveHandle(feature: feature, colorHex: "#000000")?.centre
        {
            Button {
                guard let centre = mapCentre() else { return }
                session.announce(
                    session.moveFeature(
                        featureID: featureID,
                        latitudeDelta: centre.lat - middle.lat,
                        longitudeDelta: centre.lng - middle.lng
                    ),
                    of: "The feature"
                )
            } label: {
                Label(
                    "Move whole feature to map centre",
                    systemImage: "arrow.up.and.down.and.arrow.left.and.right"
                )
                .font(.caption)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.bordered)
            // Off, not silent, while the map has no centre to move to.
            .disabled(mapCentre() == nil)
            .accessibilityHint(
                "Pan the map until its middle is where the feature's middle belongs, then move it there."
            )
        }
        if !corners.isEmpty, let featureID = feature.id {
            let index = min(cornerIndex, corners.count - 1)
            let corner = corners[index]
            VStack(alignment: .leading, spacing: 6) {
                if corners.count > 1 {
                    Stepper(
                        value: Binding(
                            get: { index },
                            set: { next in
                                cornerIndex = next
                                showCorner(corners[next].position)
                            }
                        ),
                        in: 0...(corners.count - 1)
                    ) {
                        Text("Corner \(index + 1) of \(corners.count)")
                            .font(.caption)
                    }
                    .accessibilityHint("Moves the map to that corner.")
                }
                Button {
                    guard let centre = mapCentre() else { return }
                    let target = snapCentre(centre, featureID)
                    session.announce(
                        session.moveVertex(
                            featureID: featureID, ring: corner.ring, vertex: corner.vertex,
                            latitude: target.position.lat, longitude: target.position.lng,
                            parcelSnap: target.parcelSnap
                        ),
                        of: corners.count > 1 ? "Corner \(index + 1)" : "The point",
                        snapNote: target.note
                    )
                } label: {
                    Label(
                        corners.count > 1
                            ? "Move corner \(index + 1) to map centre"
                            : "Move point to map centre",
                        systemImage: "scope"
                    )
                    .font(.caption)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.bordered)
                .disabled(mapCentre() == nil)
                .accessibilityHint(
                    corners.count > 1
                        ? "Pan the map until its middle is where the corner belongs, then move it there."
                        : "Pan the map until its middle is where the point belongs, then move it there."
                )
            }
        }
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
