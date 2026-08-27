import GeoCore
import MapCatalog
import NSDataServices
import SwiftUI
import UIKit

struct MapContainerView: View {
    @Environment(\.scenePhase) private var scenePhase

    let controller: MapController
    let navigationModel: NavigationModel
    @State private var overlayVM: OverlayViewModel
    @State private var featureVM: ViewportFeatureViewModel
    @State private var taxSaleVM: TaxSaleViewModel
    @State private var historicalVM: HistoricalTaxSaleViewModel
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
    /// The measurement in progress, or none. Not persisted anywhere: a measured
    /// distance is a question about the map, asked and answered.
    @State private var measure: MeasureSession?
    @State private var isLayersMenuExpanded = false
    /// Which layer sections are open, held here rather than in the panel
    /// because the panel only exists while it is on screen. Nil until the
    /// reader opens or closes one, which is when the panel stops taking the
    /// sections the current setup asks for.
    @State private var openLayerSections: Set<LayerCategoryID>?
    /// How tall the map surface is, so the layer panel can be capped at what
    /// the screen actually has rather than at a number chosen for a shorter
    /// list. Ten sections do not fit any fixed height worth hard-coding.
    @State private var mapHeight: CGFloat = 0
    /// How tall the right-hand controls are, so the column can be given
    /// exactly that height and no more. Zero until the first layout.
    @State private var controlsHeight: CGFloat = 0

    /// How much of the rail the area-selection controls are holding, so the
    /// scrolling part below them gives up the same amount.
    @State private var saveAreaHeight: CGFloat = 0

    /// The same, and zero when they are not on screen.
    private var shownSaveAreaHeight: CGFloat {
        isSelectingSaveArea ? saveAreaHeight : 0
    }
    /// How tall the measuring card is, so the scale bar and the readout
    /// can sit above it rather than behind it.
    @State private var measurePanelHeight: CGFloat = 0
    /// The measured heights of the two pieces of chrome in the bottom-left
    /// corner, each including its own padding. The scale bar sits on top of
    /// the source strip, and every card along the bottom is inset above the
    /// strip, so both numbers are read off the screen rather than assumed.
    @State private var attributionHeight: CGFloat = 0
    @State private var scaleStackHeight: CGFloat = 0
    /// Where the map settled, for the readout. Held rather than read on every
    /// redraw: the map's own bounds are not observable, so the readout would
    /// otherwise show wherever the view happened to be when SwiftUI last ran.
    /// Nil until the map has actually settled somewhere.
    ///
    /// Not seeded with a default: the readout is a coordinate the user can copy
    /// and paste into somebody else's map, and a placeholder that has never
    /// been anywhere near the visible ground is a wrong answer offered with the
    /// same confidence as a right one. Absent until it is true.
    @State private var mapPosition: MapPosition?
    /// How large the ground on screen is, in the terms a paper map states it
    /// in. Nil until the map has settled, and nil again whenever it cannot be
    /// measured.
    @State private var screenScale: String?
    @State private var isSelectingSaveArea = false
    /// Whether the open parcel's sources have had the time they are given to
    /// answer.
    ///
    /// The browser waits fifteen seconds for the evidence behind a research
    /// report and then writes it with whatever arrived. Without the same limit
    /// here, one source that hangs rather than fails leaves the reader unable
    /// to take a dated receipt at all, and nothing on screen tells them the
    /// wait will not end.
    ///
    /// Kept beside the map rather than inside the export sheet because the
    /// clock is about the parcel. The sources have been answering since it was
    /// tapped, and a reader who spent a minute framing a page has already
    /// given them that minute.
    @State private var sourcesHaveHadTheirTime = false
    /// What the system share sheet is currently holding, prepared at the moment
    /// of the tap so an evidence note carries the time it was actually made.
    @State private var share: SharePayload?
    /// Why an evidence note could not be written, when it could not.
    @State private var exportFailure: String?
    /// The export frame being aimed, or none. Held here rather than in the
    /// sheet because the frame is drawn over the live map: the user pans and
    /// zooms under it, which is how a page is aimed at ground that was not on
    /// screen when they reached for the printer.
    @State private var printFrame: PrintFrameGeometry.FrameState?
    /// Whether the reader has asked the system for less movement. Read once
    /// here and passed to every animation this view starts.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        controller: MapController,
        overlayViewModel: OverlayViewModel,
        viewportFeatureViewModel: ViewportFeatureViewModel,
        taxSaleViewModel: TaxSaleViewModel = TaxSaleViewModel(),
        historicalViewModel: HistoricalTaxSaleViewModel = HistoricalTaxSaleViewModel(),
        navigationModel: NavigationModel,
        offlineAreasViewModel: OfflineAreasViewModel,
    ) {
        self.controller = controller
        self.navigationModel = navigationModel
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

        return lifecycle(mapStack)
            .sheet(item: $navigationModel.activeSheet) { route in
                switch route {
                case .offlineStorage:
                    OfflineStorageView(viewModel: offlineVM)
                case .info:
                    InfoSheetView(overlayVM: overlayVM)
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
                case .printExport(let framing):
                    PrintExportSheet(
                        overlayVM: overlayVM,
                        framing: framing,
                        omitted: unprintableLayerNames,
                        featureStatuses: featureVM.statuses,
                        sourcesHaveHadTheirTime: sourcesHaveHadTheirTime
                    ) { url in
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
            // The clock on the open parcel's sources, restarted every time that
            // evidence starts over so a finished wait is never carried onto a
            // set of requests that have just gone out. Keyed on the generation
            // rather than the PID because the same PID's evidence restarts:
            // toggling tax sales rebuilds it, and so does tapping the parcel
            // that is already open.
            .task(id: overlayVM.evidenceGeneration) {
                sourcesHaveHadTheirTime = false
                guard overlayVM.inspection != nil else { return }
                try? await Task.sleep(for: Self.evidenceWait)
                guard !Task.isCancelled else { return }
                sourcesHaveHadTheirTime = true
            }
            // A shared link opened from elsewhere. Nothing registers a scheme or an
            // associated domain yet, so this fires only once one is configured —
            // wired now so the restore path is the same one the tests exercise.
            .onOpenURL { url in
                overlayVM.restore(from: url)
            }
    }

    /// The map and everything drawn over it.
    ///
    /// Split out of `body`, with the lifecycle and the sheets, because the
    /// whole chain in one expression exceeded the type-checker's budget and
    /// failed to compile at all. Each piece here checks on its own.
    private var mapStack: some View {
        ZStack {
            MapSurfaceView(controller: controller)
                .ignoresSafeArea()

            VStack {
                HStack(alignment: .top, spacing: 12) {
                    if !isSelectingSaveArea {
                        ParcelSearchBar(viewModel: overlayVM, availableHeight: mapHeight)
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
                            onEditLayer: { row in
                                beginEditing(row)
                            },
                            onNewDrawingLayer: {
                                Task {
                                    guard let row = await userVectorsVM.newDrawingLayer() else {
                                        return
                                    }
                                    beginEditing(row)
                                }
                            },
                            isExpanded: $isLayersMenuExpanded,
                            expandedCategories: $openLayerSections
                        )
                            .frame(width: 300)
                            .frame(maxHeight: max(320, mapHeight - 132))
                            .transition(.asymmetric(
                                insertion: .move(edge: .trailing).combined(with: .opacity),
                                removal: .move(edge: .trailing).combined(with: .opacity)
                            ))
                            .padding(.top, 60)
                    }

                    // Not while a page is being framed: the framing toolbar
                    // owns the screen, every one of these controls is inert in
                    // that mode, and a rail left at full brightness over the
                    // dimmed map competed with the one task the mode is for.
                    if printFrame == nil {
                        controlColumn
                            .padding(.trailing, 12)
                            .padding(.top, 60)
                    }
                }
                Spacer()
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                mapHeight = height
            }

            // Top-centre, clear of the search bar. The location button sits on
            // the right with nothing under it, so a refusal reported down at
            // the bottom would land under whichever card happens to be open.
            if let locationMessage = controller.locationMessage {
                VStack {
                    Text(locationMessage.rawValue)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.regularMaterial)
                        .clipShape(.rect(cornerRadius: 8))
                        .padding(.horizontal, 16)
                        .padding(.top, 116)

                    Spacer()
                }
                // The message describes the map; it must not take taps from it.
                .allowsHitTesting(false)
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
                            canExportNote: overlayVM.canExportEvidenceNote
                                || sourcesHaveHadTheirTime,
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
                        .padding(.bottom, 12 + attributionHeight)
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
                        controller.setVectorMoveHandle(nil)
                        pushUserVectors()
                    }
                }
                .frame(maxWidth: 420)
                .padding(.horizontal, 12)
                .padding(.bottom, 12 + attributionHeight)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // Bottom-left, and only when nothing else is down there. The cards run
        // the width of the screen, and a readout under one of them would be a
        // control the user can see and cannot reach.
        //
        // Measuring is the exception, because it is the one card whose reader
        // is asking about distance. The browser keeps its scale bar and its
        // coordinates up throughout a measurement, and closing a measurement to
        // read the scale it should be compared against discards it. So the
        // readout is lifted over the measuring card instead of being dropped.
        //
        // Only that card. A parcel opened while a measurement is running still
        // takes the readout down, because the inspector is a card of its own
        // and there is nowhere left to lift to.
        .overlay(alignment: .bottomLeading) {
            // Also not under the layers panel: these chips draw above every
            // sibling overlay, and with the panel open they printed the scale
            // numerals and coordinates straight through its rows.
            if overlayVM.inspection == nil, editSession == nil,
               vectorCallout == nil, featureVM.selection == nil, !isSelectingSaveArea,
               printFrame == nil, !isLayersMenuExpanded, let mapPosition
            {
                VStack(alignment: .leading, spacing: 6) {
                    // Hidden from VoiceOver on purpose. A bar is measured off
                    // the screen, which is not something it can be read out;
                    // the readout under it says the same scale in words and
                    // carries the caveat that goes with it.
                    MapScaleBar(controller: controller)
                        .accessibilityHidden(true)

                    MapPositionReadout(position: mapPosition, screenScale: screenScale)
                }
                // Capped, not frozen: these chips are informational overlays,
                // and at full accessibility sizes the coordinate pair wrapped
                // to a third of an SE-class screen and collided with the
                // control rail. VoiceOver reads the same values regardless of
                // the visual size.
                .dynamicTypeSize(...DynamicTypeSize.xxLarge)
                .padding(.leading, 12)
                // Above the source strip, or above the measuring card when
                // there is one — whichever reaches higher. The card's measured
                // height already includes the strip it was inset above, so the
                // two are compared rather than added.
                .padding(.bottom, 12 + max(attributionHeight, measureLift))
                // Measured rather than guessed: MapKit's own logo and Legal
                // link have to stay clear of whatever is in this corner.
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                    scaleStackHeight = $0
                    controller.setBottomOrnamentInset(max($0, attributionHeight))
                }
                .onDisappear {
                    scaleStackHeight = 0
                    controller.setBottomOrnamentInset(attributionHeight)
                }
            }
        }
        // The source strip stays up while a card is open, and the cards are
        // inset above it. That is what the browser does on a phone, where the
        // parcel panel stops short of the bottom edge rather than covering the
        // attribution.
        //
        // A card is open at exactly the moment provenance matters most: the
        // reader is deciding what a drawn layer means. Taking the credits away
        // then leaves them reading an overlay with nothing on screen saying
        // whose it is.
        //
        // Not while a page is being framed. That is this app's print mode, the
        // framing toolbar owns the bottom of the screen, and the exported page
        // carries its own attribution block. The one credit that cannot wait
        // for the page — OpenStreetMap's, owed while its tiles are on screen —
        // is carried by the framing toolbar itself.
        .overlay(alignment: .bottomLeading) {
            if printFrame == nil {
                MapAttributionStrip(
                    descriptors: overlayVM.rows.filter(\.isVisible).map(\.descriptor),
                    baseMap: overlayVM.baseMapType
                ) {
                    navigationModel.activeSheet = .info
                }
                .padding(.leading, 12)
                .padding(.bottom, 12)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                    attributionHeight = $0
                    controller.setBottomOrnamentInset(max($0, scaleStackHeight))
                }
                .onDisappear {
                    attributionHeight = 0
                    controller.setBottomOrnamentInset(scaleStackHeight)
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let measure {
                MeasurePanelView(
                    session: measure,
                    onUndo: { updateMeasure { $0.undoLastPoint() } },
                    onFinish: { updateMeasure { $0.finish() } },
                    onClear: { updateMeasure { $0.clear() } },
                    onClose: { stopMeasuring() }
                )
                .frame(maxWidth: 420)
                .padding(.horizontal, 12)
                .padding(.bottom, 12 + attributionHeight)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                    measurePanelHeight = $0
                }
                .onDisappear { measurePanelHeight = 0 }
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
                .padding(.bottom, 12 + attributionHeight)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay {
            if printFrame != nil, let framing = controller.printFraming() {
                PrintExportFrameView(
                    container: framing.container,
                    centre: framing.centre,
                    zoom: framing.zoom,
                    state: Binding(
                        get: { printFrame ?? .default },
                        set: { printFrame = $0 }
                    ),
                    // The strip is hidden while framing, so on the
                    // OpenStreetMap ground the frame carries the credit the
                    // tiles behind it require. Apple's maps carry their own
                    // marks and need nothing here.
                    credit: overlayVM.baseMapType == .openStreetMap
                        ? OpenStreetMapBase.credit : nil,
                    onCancel: {
                        printFrame = nil
                        controller.endPrintFraming()
                    },
                    onContinue: { drawn in
                        let state = printFrame ?? .default
                        // Re-read the map here rather than trusting the bounds
                        // the layer drew with. The layer's ground is recomputed
                        // when the map settles, and a Continue tapped during a
                        // pan would otherwise export where the map was rather
                        // than where it is.
                        let bounds = currentFrameBounds(state) ?? drawn
                        printFrame = nil
                        controller.endPrintFraming()
                        navigationModel.activeSheet = .printExport(
                            PrintExportFraming(bounds: bounds, orientation: state.orientation)
                        )
                    }
                )
            }
        }
        .overlay(alignment: .bottom) {
            // Not while the page is being framed: this overlay sits above the
            // frame's own toolbar, and a card left open from an earlier tap
            // would cover Cancel and Continue on a phone.
            if let selection = featureVM.selection, editSession == nil, vectorCallout == nil,
               measure == nil, printFrame == nil
            {
                FeatureCalloutCard(
                    callout: selection.callout,
                    onOpenParcel: { pid in
                        // The proximity layer's card is about a parcel, so
                        // opening it hands the PID to the same search a typed
                        // one goes through — the registry answers, rather than
                        // this card promoting its own copy into a selection.
                        featureVM.clearSelection()
                        overlayVM.searchParcel(pid)
                    },
                    onClose: { featureVM.clearSelection() }
                )
                .frame(maxWidth: 420)
                .padding(.horizontal, 12)
                .padding(.bottom, 12 + attributionHeight)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    /// The way out of area selection, and the shortcut through it.
    ///
    /// Held outside the scrolling column below rather than inserted at the top
    /// of it. A column that was scrolled down when this mode began would put
    /// Cancel above its own visible top, and the only way out of the mode
    /// would be off the screen.
    private var saveAreaControls: some View {
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

            // On a material of its own. A bordered button's fill is
            // translucent, and red text in a faint red capsule over aerial or
            // a marker's label is the one control in this mode a reader
            // cannot find — which is the way out of it.
            Button("Cancel") {
                cancelBoundsSelection()
            }
            .buttonStyle(.bordered)
            .tint(.red)
            .background(.regularMaterial, in: Capsule())
        }
        .transition(.move(edge: .trailing).combined(with: .opacity))
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
            saveAreaHeight = height
        }
    }

    /// The right-hand rail.
    private var controlColumn: some View {
        VStack(alignment: .trailing, spacing: 12) {
            if isSelectingSaveArea {
                saveAreaControls
            }
            scrollingControls
                // Every control below is disabled in this mode, and a scroll
                // view over them still takes the drag that is meant to be
                // drawing the area out on the map. Taken out of the gesture
                // path rather than left as a wall of dimmed buttons that eats
                // the one gesture the mode is for.
                .allowsHitTesting(!isSelectingSaveArea)
        }
    }

    /// The rest of the rail, scrolled when it runs past the bottom.
    ///
    /// Eleven 44-point targets and the space between them are taller than a
    /// phone held sideways, and the ones that fall off the end are Data
    /// Sources, Save Area and Layers: the route to every licence gate, every
    /// layer that failed, and the panel itself. The browser scrolls its own
    /// rail for the same reason.
    ///
    /// Sized to its content rather than to the height it is offered. A
    /// scroll view that took the whole side of the screen would take the
    /// map's vertical drags with it, in a strip where there is usually
    /// nothing to scroll.
    private var scrollingControls: some View {
        ScrollView(.vertical) {
            VStack(spacing: 12) {
                CompassResetButton(controller: controller, reduceMotion: reduceMotion)
                    .disabled(isSelectingSaveArea)

                Button {
                    controller.showsUserLocation = true
                    controller.centerOnUserLocation()
                } label: {
                    MapControlIcon(systemName: "location.fill")
                }
                .accessibilityLabel("Current Location")
                .disabled(isSelectingSaveArea)

                // Two buttons rather than one with a mode, as on the
                // web: distance and area are different questions, and a
                // single toggle would make asking the second one a
                // two-step operation.
                ForEach(MeasureSession.Mode.allCases, id: \.self) { mode in
                    Button {
                        toggleMeasuring(mode)
                    } label: {
                        MapControlIcon(
                            systemName: Self.measureSymbol(mode),
                            isActive: measure?.mode == mode
                        )
                    }
                    .accessibilityLabel(
                        mode == .distance ? "Measure Distance" : "Measure Area"
                    )
                    .accessibilityIdentifier("measure-\(mode.rawValue)")
                    .accessibilityAddTraits(measure?.mode == mode ? .isSelected : [])
                    // Editing owns the map's taps while it is open, so
                    // offering to measure would offer something that
                    // cannot happen.
                    .disabled(isSelectingSaveArea || editSession != nil)
                }

                Button {
                    cancelBoundsSelection()
                    navigationModel.activeSheet = .offlineStorage
                } label: {
                    MapControlIcon(systemName: "externaldrive")
                }
                .accessibilityLabel("Offline Maps")

                // One list at a time, as the web renders one panel at a
                // time. Both on screen at once would let a reader pick a
                // dated result out of one list while the map beside it is
                // answering the other question. Neither, until the reader
                // has asked for tax-sale information at all.
                if !overlayVM.showsTaxSale {
                    EmptyView()
                } else if overlayVM.mapRecordMode == .current {
                Button {
                    cancelBoundsSelection()
                    navigationModel.activeSheet = .taxSaleNotices
                } label: {
                    MapControlIcon(systemName: "banknote")
                }
                .accessibilityLabel("Tax-sale Notices")
                .disabled(isSelectingSaveArea)
                } else {
                Button {
                    cancelBoundsSelection()
                    navigationModel.activeSheet = .historicalTaxSales
                } label: {
                    MapControlIcon(systemName: "clock.arrow.circlepath", tint: .purple)
                }
                .accessibilityLabel("Historical Tax-sale Records")
                .disabled(isSelectingSaveArea)
                }

                Button {
                    share = SharePayload(url: overlayVM.shareURL ?? OverlayViewModel.webMapURL)
                } label: {
                    MapControlIcon(systemName: "square.and.arrow.up")
                }
                .accessibilityLabel("Share This Map View")
                .accessibilityIdentifier("share-map-view")
                .disabled(isSelectingSaveArea)

                Button {
                    cancelBoundsSelection()
                    controller.beginPrintFraming()
                    printFrame = .default
                } label: {
                    MapControlIcon(systemName: "printer")
                }
                .accessibilityLabel("Export This Map As A PDF")
                .accessibilityIdentifier("export-map-pdf")
                .disabled(isSelectingSaveArea)

                Button {
                    cancelBoundsSelection()
                    navigationModel.activeSheet = .info
                } label: {
                    MapControlIcon(systemName: "info.circle")
                }
                .accessibilityLabel("Data Sources and Licenses")
                .disabled(isSelectingSaveArea)

                Button {
                    beginSaveAreaSelection()
                } label: {
                    MapControlIcon(
                        systemName: isSelectingSaveArea
                            ? "square.dashed.inset.filled" : "square.dashed",
                        isActive: isSelectingSaveArea
                    )
                }
                .accessibilityLabel("Save Area")
                .disabled(isSelectingSaveArea)

                Button {
                    withAnimation(
                        .spring(response: 0.35, dampingFraction: 0.85)
                            .unlessReduced(reduceMotion)
                    ) {
                        isLayersMenuExpanded.toggle()
                    }
                } label: {
                    MapControlIcon(
                        systemName: isLayersMenuExpanded
                            ? "square.3.stack.3d.middle.filled" : "square.3.stack.3d",
                        isActive: isLayersMenuExpanded
                    )
                }
                .accessibilityLabel("Toggle Layers Menu")
                .disabled(isSelectingSaveArea)
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                controlsHeight = height
            }
        }
        // The indicator is left visible. It appears only while the column is
        // actually scrolling, and that is the one moment a reader needs to be
        // told there is more of it below the fold.
        .scrollBounceBehavior(.basedOnSize)
        // Named so that a test can swipe this rail rather than the first
        // scroll view it finds, which on this screen can be the search card.
        .accessibilityIdentifier("map-control-rail")
        // The area controls' height counts only while they are up. It is
        // measured when they appear and never unmeasured, so subtracting it
        // unconditionally would leave the rail short for the rest of the
        // session over controls that are no longer there.
        .frame(height: controlsHeight > 0
            ? min(controlsHeight, max(88, mapHeight - 132 - shownSaveAreaHeight)) : nil)
    }

    /// The ground the frame covers as the map stands right now.
    private func currentFrameBounds(
        _ state: PrintFrameGeometry.FrameState
    ) -> GeoBoundingBox? {
        guard let framing = controller.printFraming() else { return nil }
        let rect = PrintFrameGeometry.screenRect(
            container: framing.container,
            aspect: PdfTemplate.template(state.orientation).mapFrameAspect,
            state: state
        )
        return PrintFrameGeometry.bounds(
            forFrame: rect, container: framing.container,
            center: framing.centre, zoom: framing.zoom
        )
    }

    /// The names of things on the map that the page cannot carry.
    ///
    /// A user's own scan and a user's own drawing are both on screen and
    /// neither is composited into the raster. Named before the export rather
    /// than discovered from a finished page, and never silently dropped: a map
    /// missing the layer the user came to print is worse when nobody said so.
    private var unprintableLayerNames: [String] {
        controller.state.userMaps.map(\.record.name)
            + controller.state.userVectors.map(\.record.name)
    }

    /// What the container does as it appears, changes and goes away.
    private func lifecycle(_ content: some View) -> some View {
        content
            .animation(
                .spring(response: 0.35, dampingFraction: 0.9).unlessReduced(reduceMotion),
                value: overlayVM.inspection
            )
            .onAppear {
                controller.events = { event in
                    switch event {
                    case .headingChanged:
                        // The compass reads `controller.mapHeading` itself;
                        // holding a copy here re-evaluated this whole body on
                        // every frame of a rotation gesture.
                        break
                    case .annotationSelected(let annotationID):
                        if annotationID.hasPrefix(MapController.parcelOverviewPrefix) {
                            // The parcel answers, so nothing else may still be
                            // answering: two cards about different ground,
                            // stacked, read as one card about one place.
                            vectorCallout = nil
                            featureVM.clearSelection()
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
                            featureVM.clearSelection()
                            overlayVM.clearParcelSelection()
                            break
                        }
                        if let found = featureVM.callout(annotationID: annotationID) {
                            // Measuring and editing own the map, as they do for
                            // a tap: a dot selected while the user is placing a
                            // corner must not open a card over their work, and
                            // one selected mid-edit must not be waiting for them
                            // when they finish.
                            guard measure == nil, editSession?.isEditing != true else { break }
                            selectFeature(found)
                            break
                        }
                    case .boundsSelected(let bounds):
                        finishBoundsSelection(with: bounds)
                    case .vertexMoved(let featureID, let ring, let vertex, let latitude, let longitude):
                        editSession?.moveVertex(
                            featureID: featureID, ring: ring, vertex: vertex,
                            latitude: latitude, longitude: longitude
                        )
                    case .featureMoved(let featureID, let latitudeDelta, let longitudeDelta):
                        editSession?.moveFeature(
                            featureID: featureID,
                            latitudeDelta: latitudeDelta,
                            longitudeDelta: longitudeDelta
                        )

                    case .visibleRegionSettled:
                        mapPosition = overlayVM.mapPosition
                        // Leaflet rewrites its address bar on every move. This
                        // is the same act: the view the reader stopped on is
                        // the one the next launch opens.
                        overlayVM.rememberSession()
                        screenScale = controller.groundMetresPerPoint()
                            .flatMap { DisplayScale.label(groundMetresPerPoint: $0) }
                        // Leaflet's `moveend`: the viewport layers ask their
                        // services what is in the view the user actually stopped
                        // on, not the ones they panned through.
                        featureVM.refreshAll()
                    case .mapTapped(let latitude, let longitude):
                        // Measuring owns the tap, as the web's capture layer
                        // does: a tap placing a corner must not also identify
                        // the parcel under it and open a card over the shape.
                        if measure != nil {
                            updateMeasure {
                                $0.add(GeoPoint(lat: latitude, lng: longitude))
                            }
                            break
                        }
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
                            featureVM.clearSelection()
                            break
                        }
                        vectorCallout = nil
                        // A parcel already drawn on the map is above every one
                        // of these layers — zoning at 300, mineral proximity at
                        // 390, wells at 405, against 420 for an established
                        // parcel — so a tap inside its outline means the
                        // parcel. Only drawn ones: an unidentified parcel is
                        // not on the map to be tapped, which is why the
                        // catalogued layers are still asked before the identify
                        // request below.
                        if controller.state.parcelShapes.contains(where: {
                            PolygonHitTest.contains(
                                GeoPoint(lat: latitude, lng: longitude),
                                multiPolygon: $0.parts
                            )
                        }) {
                            featureVM.clearSelection()
                            overlayVM.identifyParcel(
                                latitude: latitude, longitude: longitude
                            )
                            break
                        }
                        // Then the catalogued layers that draw shapes rather
                        // than tiles, above the identify request below: a tap
                        // that reached a zone or a stream reach meant that
                        // feature, and asking the registry what parcel is under
                        // it answers a different question.
                        if let found = featureVM.callout(
                            at: GeoPoint(lat: latitude, lng: longitude),
                            toleranceDegrees: fingerTolerance
                        ) {
                            selectFeature(found)
                            break
                        }
                        featureVM.clearSelection()
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
            }
            .task {
                // Concurrently: the two libraries touch different actors and
                // different files, and awaiting the raster previews before the
                // vector load even started kept the user's drawing layers off
                // the map until the last preview image had been read.
                async let maps: Void = userMapsVM.load()
                async let vectors: Void = userVectorsVM.load()
                _ = await (maps, vectors)
            }
            // Spoken as well as drawn, which is what the web's polite live
            // region does. A reader using VoiceOver taps a button and needs to
            // be told the answer, not to go looking for where it appeared.
            .onChange(of: controller.locationMessage) { _, message in
                guard let message else { return }
                AccessibilityNotification.Announcement(message.rawValue).post()
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
            // An import brings the map to what was imported, the way the
            // browser does. Taken rather than read, so a later toggle cannot
            // fire the same journey a second time.
            .onChange(of: userVectorsVM.pendingFit) { _, _ in
                if let box = userVectorsVM.takePendingFit() {
                    controller.frame(box)
                }
            }
            // The same journey for a raster that arrived already placed, or
            // whose PDF frame the reader has just changed.
            .onChange(of: userMapsVM.pendingFit) { _, _ in
                if let box = userMapsVM.takePendingFit() {
                    controller.frame(box)
                }
            }
            // The session's working copy, not the stored one: a shape has to follow
            // the user's finger rather than wait for a write to land. One
            // handler for both responses — pushing the vectors and rebuilding
            // the handles — because two registrations on the same value paid
            // the deep comparison of the whole parsed layer twice per update,
            // and split one event's response across two closures that could
            // drift out of order. The handles are rebuilt from the new
            // geometry: MapKit left the dragged one where the finger did, and
            // every other handle on a closed ring may have moved with it, as
            // may the move handle drawn at the shape's middle.
            .onChange(of: editSession?.parsed) { _, _ in
                pushUserVectors()
                controller.setVectorHandles(selectionHandles())
                controller.setVectorMoveHandle(moveHandle())
            }
            .onChange(of: editSession?.draft) { _, draft in
                controller.setVectorDraft(draftPreview(draft))
            }
            .onChange(of: editSession?.selectedFeatureID) { _, _ in
                controller.setVectorHandles(selectionHandles())
                controller.setVectorMoveHandle(moveHandle())
            }
            .onChange(of: navigationModel.activeSheet) { _, newValue in
                if newValue != nil {
                    cancelBoundsSelection()
                }
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase != .active {
                    cancelBoundsSelection()
                    // A switch thrown without moving the map never settles the
                    // viewport, so this is where that change is written down.
                    // It is also the last moment before the system may kill the
                    // app outright.
                    overlayVM.rememberSession()
                    // The debounce cannot outlive the app. A pending edit that was
                    // still waiting for its timer when the user switched away would
                    // never be written at all.
                    if let editSession {
                        flushProtectedFromSuspension(editSession)
                    }
                }
            }
            .onDisappear {
                cancelBoundsSelection()
                if let editSession {
                    flushProtectedFromSuspension(editSession)
                }
            }
    }

    /// Writes the session's pending edit under a background-task assertion.
    ///
    /// A bare `Task` scheduled during the background transition is not
    /// guaranteed to run before the process suspends, and a suspended task
    /// holding the only copy of the user's shape change is exactly the loss
    /// the flush exists to prevent. The assertion keeps the process alive
    /// until the write lands (or the system calls time, which is minutes —
    /// this write is milliseconds).
    private func flushProtectedFromSuspension(_ session: VectorEditSession) {
        let application = UIApplication.shared
        final class TokenBox: @unchecked Sendable { var value = UIBackgroundTaskIdentifier.invalid }
        let box = TokenBox()
        box.value = application.beginBackgroundTask(withName: "vector-edit-flush") {
            application.endBackgroundTask(box.value)
            box.value = .invalid
        }
        Task {
            await session.flush()
            if box.value != .invalid {
                application.endBackgroundTask(box.value)
                box.value = .invalid
            }
        }
    }


    /// How long the sources are given before a report may be written without
    /// them. The browser's fifteen seconds, so the same hung source produces
    /// the same document on either surface.
    ///
    /// Wall-clock, and deliberately: the browser's own timer runs while its tab
    /// is in the background, and a request that was in flight when this app
    /// went away is usually finished by the time it comes back. Counting only
    /// foreground seconds would mean a reader who checks their messages mid-wait
    /// restarts it, and one who does it twice never gets a page at all.
    private static let evidenceWait = Duration.seconds(15)

    /// Writes the note and hands it to the share sheet.
    ///
    /// Stamped here, at the tap, rather than when the button was drawn: the
    /// note carries a generation time and a reader has no way to tell a stale
    /// stamp from a fresh one.
    private func exportEvidenceNote() {
        guard let note = overlayVM.evidenceNote(
            includingSourcesStillOut: sourcesHaveHadTheirTime
        ) else {
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

        // Two modes that both claim the map's taps. Measuring is the one the
        // user just left, so it ends here rather than lying in wait: a half
        // placed measurement that resumes after the storage rectangle is drawn
        // is a shape the user has forgotten they started.
        stopMeasuring()
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

    // MARK: - Measuring

    private static func measureSymbol(_ mode: MeasureSession.Mode) -> String {
        switch mode {
        case .distance: return "ruler"
        // The same symbol the drawing tools use for an area, so one shape means
        // one thing across the app.
        case .area: return "pentagon"
        }
    }

    /// Turns a mode on, switches to it, or turns it back off — the web's
    /// `toggle`. Switching modes starts a fresh shape rather than reinterpreting
    /// the placed points, because three corners of an area are not a path the
    /// user meant to walk.
    private func toggleMeasuring(_ mode: MeasureSession.Mode) {
        cancelBoundsSelection()
        withAnimation(
            .spring(response: 0.35, dampingFraction: 0.85).unlessReduced(reduceMotion)
        ) {
            if measure?.mode == mode {
                stopMeasuring()
                return
            }
            // The inspector card describes a parcel identified by a tap, and
            // taps now mean measuring; leaving it up would leave a card the map
            // has stopped answering to.
            overlayVM.clearParcelSelection()
            vectorCallout = nil
            featureVM.clearSelection()
            isLayersMenuExpanded = false
            measure = MeasureSession(mode: mode)
            pushMeasureShape()
        }
    }

    /// Opens a catalogue feature's card, and closes whatever it answers over.
    ///
    /// The parcel selection goes with it. A tap means one question, and leaving
    /// the inspector up would put a card about a zone beside a panel about the
    /// property under it, as though the app were answering both — and a parcel
    /// lookup already in flight would land afterwards and open a panel the user
    /// never asked for.
    private func selectFeature(_ found: ViewportFeatureViewModel.FeatureSelection) {
        vectorCallout = nil
        overlayVM.clearParcelSelection()
        featureVM.select(found)
    }

    /// How far the scale bar and readout are lifted to clear the measuring
    /// card. Zero when nothing is being measured.
    private var measureLift: CGFloat {
        measure == nil ? 0 : measurePanelHeight
    }

    private func stopMeasuring() {
        measure = nil
        controller.setVectorDraft(nil)
    }

    /// The single path by which a measurement changes: mutate it, then redraw.
    private func updateMeasure(_ change: (inout MeasureSession) -> Void) {
        guard var session = measure else { return }
        change(&session)
        measure = session
        pushMeasureShape()
    }

    /// Draws the measured shape with the drawing tool's rubber band. Same
    /// overlay, different colour — the web's `#d97706`, so a measurement is not
    /// mistaken for one of the user's saved lines.
    private func pushMeasureShape() {
        guard let measure else {
            controller.setVectorDraft(nil)
            return
        }
        controller.setVectorDraft(
            VectorDraftPreview(
                shape: measure.mode == .distance ? .line : .area,
                vertices: measure.points.map { GeoJsonPosition(lng: $0.lng, lat: $0.lat) },
                colorHex: "#d97706"
            )
        )
    }

    private func beginEditing(_ row: UserVectorsViewModel.Row) {
        // Editing and measuring both claim the map's taps. Beginning an edit
        // ends the measurement rather than leaving a live readout no tap will
        // ever reach.
        stopMeasuring()
        // A session already open ends first, exactly as the Done button ends
        // it. This entry point is reachable mid-edit through the layer panel,
        // and assigning over the live session dropped its debounced write —
        // the only copy of the user's shape change — and left the rename
        // field carrying the previous layer's text. If the write fails, the
        // old session stays, as it does when Done fails.
        if let openSession = editSession {
            Task {
                guard await openSession.end() else { return }
                editSession = nil
                beginFreshEditingSession(row)
            }
            return
        }
        beginFreshEditingSession(row)
    }

    private func beginFreshEditingSession(_ row: UserVectorsViewModel.Row) {
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

    private func moveHandle() -> VectorMoveHandle? {
        guard let session = editSession, let feature = session.selectedFeature else { return nil }
        return VectorMoveHandle(
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
        let hit = VectorEdit.feature(
            at: GeoJsonPosition(lng: longitude, lat: latitude),
            in: parsed,
            toleranceDegrees: fingerTolerance
        )
        if session.tool == .erasing {
            // A tap on open ground erases nothing. Nearest-feature would put
            // the eraser on shapes the finger never covered.
            if let id = hit?.id { session.erase(featureID: id) }
            return
        }
        session.select(featureID: hit?.id)
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

/// The one visual identity for the map control rail.
///
/// Extracted because ten hand-copies of the same nine-modifier chain made any
/// design change a ten-edit hunt — and because the copies froze their glyphs
/// at 18 pt in fixed 44 pt frames, leaving the primary map controls the only
/// part of the app that ignored the reader's Dynamic Type setting.
private struct MapControlIcon: View {
    let systemName: String
    var tint: Color = .blue
    var isActive = false

    /// Scaled with the reader's type size, capped by the metric's own curve:
    /// the control grows enough to match large text without the rail
    /// swallowing the map.
    @ScaledMetric(relativeTo: .title3) private var glyphSize: CGFloat = 18
    @ScaledMetric(relativeTo: .title3) private var diameter: CGFloat = 44

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: glyphSize, weight: .semibold))
            .foregroundStyle(isActive ? Color.white : tint)
            .frame(width: diameter, height: diameter)
            .background(isActive ? Color.blue : Color.primary.opacity(0.001))
            .background(.regularMaterial)
            .clipShape(Circle())
            .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
    }
}

/// Its own leaf view, so only this button re-evaluates as the map rotates.
///
/// The heading changes on every frame of a two-finger rotation; read in the
/// container it re-ran the whole body per frame on 120 Hz devices. Read here,
/// Observation scopes the invalidation to this one control — and the
/// controller only writes `mapHeading` when the value actually changed.
private struct CompassResetButton: View {
    let controller: MapController
    let reduceMotion: Bool

    var body: some View {
        if controller.mapHeading != 0 {
            Button {
                withAnimation(
                    .spring(response: 0.4, dampingFraction: 0.8)
                        .unlessReduced(reduceMotion)
                ) {
                    controller.resetHeading()
                }
            } label: {
                MapControlIcon(systemName: "compass.fill")
                    .rotationEffect(.degrees(-controller.mapHeading))
            }
            .accessibilityLabel("Reset Map Heading")
            .transition(.scale.combined(with: .opacity))
        }
    }
}
