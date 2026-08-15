import NSDataServices
import SwiftUI

struct MapContainerView: View {
    @Environment(\.scenePhase) private var scenePhase

    let controller: MapController
    let navigationModel: NavigationModel
    let isUITestMode: Bool
    @State private var overlayVM: OverlayViewModel
    @State private var featureVM: ViewportFeatureViewModel
    @State private var taxSaleVM: TaxSaleViewModel
    @State private var historicalVM: HistoricalTaxSaleViewModel
    private let poiVM: POIViewModel
    private let offlineVM: OfflineAreasViewModel
    /// The user's own maps. Owned here rather than injected: nothing outside
    /// this view needs them, and they never leave the device.
    @State private var userMapsVM = UserMapsViewModel()
    @State private var userVectorsVM = UserVectorsViewModel()
    /// One open editing session, or none. Its own object so the layer list
    /// stays a list: editing is a mode the rest of the panel does not need to
    /// know about.
    @State private var editSession: VectorEditSession?
    @State private var vectorCallout: UserVectorCalloutItem?
    @State private var isLayersMenuExpanded = false
    @State private var mapHeading: Double = 0
    @State private var isSelectingSaveArea = false
    /// What the system share sheet is currently holding, prepared at the moment
    /// of the tap so an evidence note carries the time it was actually made.
    @State private var share: SharePayload?
    /// Why an evidence note could not be written, when it could not.
    @State private var exportFailure: String?

    init(
        controller: MapController,
        overlayViewModel: OverlayViewModel,
        viewportFeatureViewModel: ViewportFeatureViewModel,
        taxSaleViewModel: TaxSaleViewModel = TaxSaleViewModel(),
        historicalViewModel: HistoricalTaxSaleViewModel = HistoricalTaxSaleViewModel(),
        navigationModel: NavigationModel,
        poiViewModel: POIViewModel,
        offlineAreasViewModel: OfflineAreasViewModel,
        isUITestMode: Bool = false
    ) {
        self.controller = controller
        self.navigationModel = navigationModel
        self.isUITestMode = isUITestMode
        self.poiVM = poiViewModel
        self.offlineVM = offlineAreasViewModel
        // Supplied rather than built here: it needs the licence store and the
        // clearance the tile path reads, and a second store built in a view
        // would be a second answer to the same question.
        _overlayVM = State(initialValue: overlayViewModel)
        _featureVM = State(initialValue: viewportFeatureViewModel)
        _taxSaleVM = State(initialValue: taxSaleViewModel)
        _historicalVM = State(initialValue: historicalViewModel)
    }

    var body: some View {
        @Bindable var navigationModel = navigationModel

        ZStack {
            MapSurfaceView(controller: controller)
                .ignoresSafeArea()

            VStack {
                HStack(alignment: .top, spacing: 12) {
                    if !isSelectingSaveArea {
                        ParcelSearchBar(viewModel: overlayVM)
                            .frame(maxWidth: 260, alignment: .leading)
                            .padding(.leading, 12)
                            .padding(.top, 60)
                    }

                    Spacer()

                    if isLayersMenuExpanded {
                        TransparencySliderView(
                            viewModel: overlayVM,
                            userMaps: userMapsVM,
                            userVectors: userVectorsVM,
                            onZoomToLayer: { controller.frame($0) },
                            onNewDrawingLayer: {
                                Task {
                                    guard let row = await userVectorsVM.newDrawingLayer() else {
                                        return
                                    }
                                    beginEditing(row)
                                }
                            },
                            onEditLayer: { row in
                                beginEditing(row)
                            },
                            isExpanded: $isLayersMenuExpanded
                        )
                            .frame(width: 300)
                            .transition(.asymmetric(
                                insertion: .move(edge: .trailing).combined(with: .opacity),
                                removal: .move(edge: .trailing).combined(with: .opacity)
                            ))
                            .padding(.top, 60)
                    }

                    VStack(spacing: 12) {
                        if isSelectingSaveArea {
                            VStack(alignment: .trailing, spacing: 8) {
                                Text("Drag to select an area")
                                    .font(.subheadline)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(.regularMaterial)
                                    .clipShape(.rect(cornerRadius: 16))

                                Button("Use Visible Map") {
                                    saveVisibleMapArea()
                                }
                                .buttonStyle(.borderedProminent)

                                Button("Cancel") {
                                    cancelBoundsSelection()
                                }
                                .buttonStyle(.bordered)
                                .tint(.red)
                            }
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                        }

                        if mapHeading != 0 {
                            Button {
                                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                    controller.resetHeading()
                                }
                            } label: {
                                Image(systemName: "compass.fill")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundStyle(.blue)
                                    .frame(width: 44, height: 44)
                                    .background(.regularMaterial)
                                    .clipShape(Circle())
                                    .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                                    .rotationEffect(.degrees(-mapHeading))
                            }
                            .accessibilityLabel("Reset Map Heading")
                            .transition(.scale.combined(with: .opacity))
                            .disabled(isSelectingSaveArea)
                        }

                        Button {
                            controller.showsUserLocation = true
                            controller.centerOnUserLocation()
                        } label: {
                            Image(systemName: "location.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.blue)
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Current Location")
                        .disabled(isSelectingSaveArea)

                        Button {
                            cancelBoundsSelection()
                            navigationModel.activeSheet = .offlineStorage
                        } label: {
                            Image(systemName: "externaldrive")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.blue)
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Offline Maps")

                        // One list at a time, as the web renders one panel at a
                        // time. Both on screen at once would let a reader pick a
                        // dated result out of one list while the map beside it is
                        // answering the other question.
                        if overlayVM.mapRecordMode == .current {
                        Button {
                            cancelBoundsSelection()
                            navigationModel.activeSheet = .taxSaleNotices
                        } label: {
                            Image(systemName: "banknote")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.blue)
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Tax-sale Notices")
                        .disabled(isSelectingSaveArea)
                        } else {
                        Button {
                            cancelBoundsSelection()
                            navigationModel.activeSheet = .historicalTaxSales
                        } label: {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.purple)
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Historical Tax-sale Records")
                        .disabled(isSelectingSaveArea)
                        }

                        Button {
                            share = SharePayload(url: overlayVM.shareURL ?? OverlayViewModel.webMapURL)
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.blue)
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Share This Map View")
                        .accessibilityIdentifier("share-map-view")
                        .disabled(isSelectingSaveArea)

                        Button {
                            cancelBoundsSelection()
                            navigationModel.activeSheet = .printExport
                        } label: {
                            Image(systemName: "printer")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.blue)
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Export This Map As A PDF")
                        .accessibilityIdentifier("export-map-pdf")
                        .disabled(isSelectingSaveArea)

                        Button {
                            cancelBoundsSelection()
                            navigationModel.activeSheet = .info
                        } label: {
                            Image(systemName: "info.circle")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.blue)
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Data Sources and Licenses")
                        .disabled(isSelectingSaveArea)

                        Button {
                            beginSaveAreaSelection()
                        } label: {
                            Image(systemName: isSelectingSaveArea ? "square.dashed.inset.filled" : "square.dashed")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(isSelectingSaveArea ? .white : .blue)
                                .frame(width: 44, height: 44)
                                .background(isSelectingSaveArea ? Color.blue : Color.clear)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Save Area")
                        .disabled(isSelectingSaveArea)

                        Button {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                isLayersMenuExpanded.toggle()
                            }
                        } label: {
                            Image(systemName: isLayersMenuExpanded ? "square.3.stack.3d.middle.filled" : "square.3.stack.3d")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(isLayersMenuExpanded ? .white : .blue)
                                .frame(width: 44, height: 44)
                                .background(isLayersMenuExpanded ? Color.blue : Color.primary.opacity(0.001))
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Toggle Layers Menu")
                        .disabled(isSelectingSaveArea)
                    }
                    .padding(.trailing, 12)
                    .padding(.top, 60)
                }
                Spacer()
            }

            if let waterfallFetchErrorMessage = poiVM.waterfallFetchErrorMessage {
                VStack {
                    Spacer()

                    HStack(spacing: 12) {
                        Label(waterfallFetchErrorMessage, systemImage: "exclamationmark.triangle")
                            .font(.footnote)

                        Button("Retry") {
                            Task {
                                await poiVM.fetchRemoteWaterfalls(controller: controller, force: true)
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.regularMaterial)
                    .clipShape(.rect(cornerRadius: 8))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
                .accessibilityElement(children: .combine)
            }

            // A card rather than a sheet, and not in `activeSheet`: the panel
            // describes an outline on the map, so the map has to stay visible
            // and draggable underneath it. Hidden during area selection, which
            // owns the whole surface.
            if let inspection = overlayVM.inspection, !isSelectingSaveArea {
                GeometryReader { proxy in
                    VStack {
                        Spacer()

                        ParcelInspectorView(
                            inspection: inspection,
                            onClose: { overlayVM.clearParcelSelection() },
                            canExportNote: overlayVM.canExportEvidenceNote,
                            onShareMapLink: {
                                share = SharePayload(
                                    url: overlayVM.shareURL ?? OverlayViewModel.webMapURL
                                )
                            },
                            onExportNote: exportEvidenceNote
                        )
                        // Height off the screen rather than a fixed 360: the
                        // control column above runs to roughly 330 points from
                        // the top, and on a 667-point phone a fixed card
                        // reaches up under the layers button and swallows its
                        // taps.
                        .frame(maxHeight: min(360, proxy.size.height * 0.45))
                        .padding(.horizontal, 12)
                        .padding(.bottom, 12)
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay(alignment: .bottom) {
            if let editSession {
                VectorEditPanel(session: editSession) {
                    Task {
                        // Only closed once the last edit is on disk. A session
                        // dismissed over a failed write would take the only
                        // copy of the shape with it.
                        guard await editSession.end() else { return }
                        self.editSession = nil
                        controller.setVectorDraft(nil)
                        controller.setVectorHandles(nil)
                        pushUserVectors()
                    }
                }
                .frame(maxWidth: 420)
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay(alignment: .bottom) {
            if let vectorCallout, editSession == nil {
                UserVectorCalloutCard(
                    callout: vectorCallout.callout,
                    layerName: vectorCallout.layerName
                ) {
                    self.vectorCallout = nil
                }
                .frame(maxWidth: 420)
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.9), value: overlayVM.inspection)
        .onAppear {
            controller.events = { event in
                switch event {
                case .headingChanged(let heading):
                    mapHeading = heading
                case .annotationSelected(let annotationID):
                    if annotationID.hasPrefix(MapController.parcelOverviewPrefix) {
                        overlayVM.selectOverviewMarker(
                            pid: String(
                                annotationID.dropFirst(
                                    MapController.parcelOverviewPrefix.count
                                )
                            )
                        )
                        break
                    }
                    // A marker of the user's own says so, in the same card
                    // every other geometry type of theirs uses.
                    if let item = userVectorsVM.feature(annotationID: annotationID) {
                        vectorCallout = item
                        break
                    }
                    if let poi = poiVM.points.first(where: { $0.id == annotationID }) {
                        navigationModel.activeSheet = .poiDetail(poi)
                    }
                case .boundsSelected(let bounds):
                    finishBoundsSelection(with: bounds)
                case .vertexMoved(let featureID, let ring, let vertex, let latitude, let longitude):
                    editSession?.moveVertex(
                        featureID: featureID, ring: ring, vertex: vertex,
                        latitude: latitude, longitude: longitude
                    )

                case .visibleRegionSettled:
                    // Leaflet's `moveend`: the viewport layers ask their
                    // services what is in the view the user actually stopped
                    // on, not the ones they panned through.
                    featureVM.refreshAll()
                case .mapTapped(let latitude, let longitude):
                    if let editSession, editSession.isEditing {
                        // While editing, a tap belongs to the layer being
                        // edited: identifying a parcel under the shape the user
                        // is tracing would open a panel over their own work.
                        handleEditTap(
                            session: editSession, latitude: latitude, longitude: longitude
                        )
                        break
                    }
                    // The user's own layers answer first. They are drawn above
                    // every catalogued one, so a tap that landed on a track the
                    // user imported means the track — identifying the parcel
                    // underneath would answer a question they did not ask.
                    if let item = userVectorsVM.feature(
                        at: GeoJsonPosition(lng: longitude, lat: latitude),
                        toleranceDegrees: fingerTolerance
                    ) {
                        vectorCallout = item
                        break
                    }
                    vectorCallout = nil
                    // The view model decides whether a tap means anything: the
                    // parcel layer has to be on and the map zoomed in far
                    // enough for a finger to be pointing at one property.
                    overlayVM.identifyParcel(latitude: latitude, longitude: longitude)
                }
            }
            // The advertised parcels, asked for once. Not gated on the sheet
            // being opened: the map draws them, and a user who never opens the
            // panel would otherwise see a map with no tax sales on it.
            overlayVM.loadListedParcels()
            if isUITestMode {
                poiVM.points = []
                poiVM.syncAnnotations(to: controller)
            } else {
                Task {
                    await poiVM.fetchRemoteWaterfalls(controller: controller)
                }
            }
        }
        .task {
            await userMapsVM.load()
            await userVectorsVM.load()
        }
        // The view model owns the rows; the map only ever draws what they
        // currently say. Pushed on change rather than on a timer so a slider
        // drag moves the drape it is under.
        .onChange(of: userMapsVM.drapes) { _, drapes in
            controller.setUserMaps(drapes)
        }
        .onChange(of: userVectorsVM.drawings) { _, _ in
            pushUserVectors()
        }
        // The session's working copy, not the stored one: a shape has to follow
        // the user's finger rather than wait for a write to land.
        .onChange(of: editSession?.parsed) { _, _ in
            pushUserVectors()
        }
        .onChange(of: editSession?.draft) { _, draft in
            controller.setVectorDraft(draftPreview(draft))
        }
        .onChange(of: editSession?.selectedFeatureID) { _, _ in
            controller.setVectorHandles(selectionHandles())
        }
        // After a vertex moves, the handles are rebuilt from the new geometry:
        // MapKit left the dragged one where the finger did, and every other
        // handle on a closed ring may have moved with it.
        .onChange(of: editSession?.parsed) { _, _ in
            controller.setVectorHandles(selectionHandles())
        }
        .onChange(of: navigationModel.activeSheet) { _, newValue in
            if newValue != nil {
                cancelBoundsSelection()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase != .active {
                cancelBoundsSelection()
                // The debounce cannot outlive the app. A pending edit that was
                // still waiting for its timer when the user switched away would
                // never be written at all.
                if let editSession {
                    Task { await editSession.flush() }
                }
            }
        }
        .onDisappear {
            cancelBoundsSelection()
            if let editSession {
                Task { await editSession.flush() }
            }
        }
        .sheet(item: $navigationModel.activeSheet) { route in
            switch route {
            case .poiDetail(let poi):
                POIDetailView(poi: poi)
            case .offlineStorage:
                OfflineStorageView(viewModel: offlineVM)
            case .info:
                InfoSheetView()
            case .taxSaleNotices:
                TaxSaleNoticesView(
                    viewModel: taxSaleVM,
                    overlayViewModel: overlayVM
                ) {
                    // The property's parcel card is behind this sheet.
                    navigationModel.activeSheet = nil
                }
            case .historicalTaxSales:
                HistoricalTaxSalesView(
                    viewModel: historicalVM,
                    overlayViewModel: overlayVM
                ) {
                    // The property's parcel card is behind this sheet.
                    navigationModel.activeSheet = nil
                }
            case .saveAreaDraft(let bounds):
                NavigationStack {
                    SaveAreaDraftView(viewModel: offlineVM, bounds: bounds)
                }
            case .printExport:
                PrintExportSheet(overlayVM: overlayVM) { url in
                    // The finished page goes straight to the share sheet, and
                    // the export sheet stays up: it is holding the account of
                    // which layers did not print.
                    share = SharePayload(url: url)
                }
            }
        }
        .sheet(item: $share) { payload in
            ShareSheet(items: payload.items)
        }
        .alert(
            "The evidence note could not be written.",
            isPresented: .init(
                get: { exportFailure != nil },
                set: { if !$0 { exportFailure = nil } }
            ),
            presenting: exportFailure
        ) { _ in
            Button("OK", role: .cancel) { exportFailure = nil }
        } message: { reason in
            Text(reason)
        }
        // A shared link opened from elsewhere. Nothing registers a scheme or an
        // associated domain yet, so this fires only once one is configured —
        // wired now so the restore path is the same one the tests exercise.
        .onOpenURL { url in
            overlayVM.restore(from: url)
        }
    }

    /// Writes the note and hands it to the share sheet.
    ///
    /// Stamped here, at the tap, rather than when the button was drawn: the
    /// note carries a generation time and a reader has no way to tell a stale
    /// stamp from a fresh one.
    private func exportEvidenceNote() {
        guard let note = overlayVM.evidenceNote() else {
            exportFailure = "Not every source has answered yet."
            return
        }
        guard let payload = SharePayload(text: note.markdown, filename: note.filename) else {
            exportFailure = "The file could not be written to this device's temporary storage."
            return
        }
        share = payload
    }

    private func beginSaveAreaSelection() {
        guard !isSelectingSaveArea else { return }

        isSelectingSaveArea = true
        controller.beginBoundsSelection()
    }

    private func finishBoundsSelection(with bounds: MapBounds) {
        controller.endBoundsSelection()
        isSelectingSaveArea = false
        navigationModel.activeSheet = .saveAreaDraft(bounds.normalized)
    }

    /// What the map should draw: the stored layers, with the layer under edit
    /// replaced by the session's live copy.
    ///
    /// Substituted rather than added, so the layer is never drawn twice — once
    /// as it was saved and once as it is now, a half-second apart.
    private func pushUserVectors() {
        var drawings = userVectorsVM.drawings
        if let session = editSession, let record = session.record, let parsed = session.parsed {
            let live = UserVectorDrawing(record: record, parsed: parsed)
            if let index = drawings.firstIndex(where: { $0.id == record.id }) {
                drawings[index] = live
            } else {
                // A layer switched off is still the one being edited: hiding it
                // mid-edit would leave the user drawing on nothing.
                drawings.append(live)
            }
        }
        controller.setUserVectors(drawings)
    }

    /// The finger's reach in degrees of longitude at this zoom, so a line stays
    /// tappable zoomed out without swallowing its neighbours zoomed in. Roughly
    /// 22 points of screen, which is the touch target Apple asks for halved.
    private var fingerTolerance: Double {
        22 * 360 / (256 * pow(2, Double(controller.zoomLevel)))
    }

    private func beginEditing(_ row: UserVectorsViewModel.Row) {
        let session = VectorEditSession(viewModel: userVectorsVM)
        session.begin(row)
        editSession = session
        // A callout and an editing panel would be two cards over the same map.
        vectorCallout = nil
        // The layer panel would cover the ground being drawn on.
        isLayersMenuExpanded = false
    }

    /// The handles for whichever feature is selected, or none.
    private func selectionHandles() -> VectorSelectionHandles? {
        guard let session = editSession, let feature = session.selectedFeature else { return nil }
        return VectorSelectionHandles(
            feature: feature, colorHex: session.record?.colorHex ?? "#d55e00"
        )
    }

    private func draftPreview(_ draft: VectorDraft?) -> VectorDraftPreview? {
        guard let draft, let session = editSession else { return nil }
        return VectorDraftPreview(
            shape: draft.shape,
            vertices: draft.vertices,
            colorHex: session.record?.colorHex ?? "#d55e00"
        )
    }

    /// A tap while editing: a vertex when a drawing tool is up, otherwise the
    /// feature under the finger.
    private func handleEditTap(
        session: VectorEditSession, latitude: Double, longitude: Double
    ) {
        if case .drawing = session.tool {
            session.handleTap(latitude: latitude, longitude: longitude)
            return
        }
        guard let parsed = session.parsed else { return }
        let tolerance = fingerTolerance
        session.select(
            featureID: VectorEdit.feature(
                at: GeoJsonPosition(lng: longitude, lat: latitude),
                in: parsed,
                toleranceDegrees: tolerance
            )?.id
        )
    }

    private func saveVisibleMapArea() {
        guard let bounds = controller.currentVisibleBounds() else { return }
        finishBoundsSelection(with: bounds)
    }

    private func cancelBoundsSelection() {
        guard isSelectingSaveArea else { return }

        controller.endBoundsSelection()
        isSelectingSaveArea = false
    }
}
