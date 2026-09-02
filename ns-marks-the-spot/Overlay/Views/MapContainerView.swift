import GeoCore
import MapCatalog
import NSDataServices
import PhotosUI
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
    @State private var photoMapVM = PhotoMapViewModel()
    @State private var bulkPlacement: BulkPlacementDraft?
    /// One open editing session, or none. Its own object so the layer list
    /// stays a list: editing is a mode the rest of the panel does not need to
    /// know about.
    @State private var editSession: VectorEditSession?
    /// Which mark toast is up, so only its own timer takes it down.
    @State private var markOutcomeGeneration = 0
    /// Counts Edit taps on layers still loading, so a load that returns
    /// after a newer tap does not open a session over the newer one.
    @State private var editLoadGeneration = 0
    @State private var parcelSnapTask: Task<Void, Never>?
    /// The recording HUD's measured height while it is up, so the notice
    /// stack sits below it rather than under it.
    @State private var hudHeight: CGFloat = 0
    /// Counts parcel-snap refreshes, so a fetch overtaken by a later one
    /// cannot write its answer, or its failure, over the current viewport's.
    @State private var parcelSnapGeneration = 0
    @State private var vectorCallout: UserVectorCalloutItem?
    /// The GPS track recorder. Foreground-only; owns its own location
    /// manager so recording works without the map's location dot.
    @State private var recorder = TrackRecorder()
    /// One-tap mark-my-location, with its own one-shot fix request.
    @State private var markLocation = MarkLocation()
    /// A finished recording waiting in the save dialog. Identifiable so the
    /// sheet can present it; the recording is the only copy of the walk, so
    /// the sheet cannot be swiped away.
    @State private var saveTrack: SaveTrackPayload?
    /// Why the last save attempt failed, shown inside the sheet — which
    /// stays up on failure, holding the only copy of the walk.
    @State private var saveTrackError: String?
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
    /// How wide that rail is, so the layers panel can be floated clear of it.
    /// Measured rather than allowed for: the rail's icons are scaled metrics,
    /// and at an accessibility text size a fixed allowance puts the panel
    /// under the buttons it is meant to sit beside. Starts at the rail's own
    /// unscaled width so the first layout is already clear of it.
    @State private var controlsWidth: CGFloat = 44

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

    private var surfaceAndSheets: some View {
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
            .sheet(item: $saveTrack) { payload in
                SaveTrackSheet(result: payload.result, saveError: saveTrackError) {
                    name, toleranceM in
                    saveRecordedTrack(payload.result, name: name, toleranceM: toleranceM)
                } onDiscard: {
                    saveTrackError = nil
                    saveTrack = nil
                }
                // Save or Discard, said out loud: the stopped recording is
                // the only copy of the walk, and a sheet swiped away would
                // throw it out without asking.
                .interactiveDismissDisabled()
            }
            .sheet(item: $bulkPlacement) { draft in
                BulkPhotoPlacementSheet(
                    rows: draft.rows,
                    names: draft.names,
                    onCancel: { bulkPlacement = nil },
                    onPlace: { ids in
                        let placements = ids.compactMap { draft.payloads[$0] }
                        bulkPlacement = nil
                        Task {
                            guard let row = await userVectorsVM.addPhotosLayer(
                                placements: placements
                            ) else { return }
                            if let box = row.record.bbox {
                                controller.frame(box)
                            }
                        }
                    }
                )
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

            // Floated over the map rather than laid out in the row above.
            //
            // The panel is 300 points wide, the search column asks for up to
            // 260, and the control rail takes the rest; on a phone the three
            // together are wider than the screen. A row that cannot fit does
            // not shrink — it overflows, and an overflowing row grows the
            // stack it sits in. That took every other thing drawn over the
            // map with it: the parcel card was laid out hundreds of points
            // wider than the phone and centred, so its title, its figures and
            // the attribution strip all hung off both edges.
            //
            // Anchored to the trailing edge and capped at 300, it keeps the
            // place it had beside the rail on a screen with room for both, and
            // on a phone it covers the search field instead of shoving it off
            // the screen. The outer flexible frame is what holds the line: it
            // reports the size it was offered, so nothing in here can grow the
            // stack again.
            if isLayersMenuExpanded {
                layersPanel
                    .frame(maxWidth: 300)
                    .frame(maxHeight: max(320, mapHeight - 132))
                    // Attached to the panel itself rather than to the frame
                    // that positions it, so the slide is the width of the
                    // panel and not the width of the screen.
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .trailing).combined(with: .opacity)
                    ))
                    .padding(.top, 60)
                    // Clear of the rail at any text size: its icons are
                    // scaled metrics, so a fixed allowance would slide the
                    // panel under them at an accessibility size.
                    .padding(.trailing, 24 + controlsWidth)
                    .frame(
                        maxWidth: .infinity,
                        maxHeight: .infinity,
                        alignment: .topTrailing
                    )
            }

            // Top-centre, clear of the search bar, one notice above another:
            // the location button and the mark button sit on the right with
            // nothing under them, so an answer reported down at the bottom
            // would land under whichever card happens to be open — and two
            // answers at one spot covered each other's buttons.
            VStack(spacing: 8) {
                if let locationMessage = controller.locationMessage {
                    // Settings helps only with this app's own settings: its
                    // permission and its Precise Location switch. Neither a
                    // device restriction nor the device-wide Location Services
                    // switch lives on that page. A message that asks for a
                    // decision stays until the reader makes one or waves it
                    // away; a timer took the button down before a VoiceOver
                    // reader reached it.
                    let isRefusal = MapController.staysUntilDismissed(locationMessage)
                    VStack(spacing: 6) {
                        Text(locationMessage.rawValue)
                            .font(.footnote)
                            .multilineTextAlignment(.center)
                        if isRefusal {
                            HStack(spacing: 16) {
                                if MapController.offersSettings(locationMessage) {
                                    // Opening Settings is not dismissal: the
                                    // notice stays until the state changes or
                                    // the reader waves it away.
                                    OpenSettingsButton()
                                }
                                DismissNoticeButton { controller.dismissLocationMessage() }
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.regularMaterial)
                    .clipShape(.rect(cornerRadius: 8))
                    // The message describes the map; it must not take taps
                    // from it. The one exception is the button a refusal
                    // carries.
                    .allowsHitTesting(isRefusal)
                    .accessibilityElement(children: isRefusal ? .contain : .combine)
                }

                if let outcome = markLocation.outcome {
                    let isRefusal = Self.markOutcomeStaysUntilDismissed(outcome)
                    VStack(spacing: 6) {
                        Text(outcome.message)
                            .font(.footnote)
                            .multilineTextAlignment(.center)
                        if isRefusal {
                            HStack(spacing: 16) {
                                if outcome == .denied {
                                    OpenSettingsButton()
                                }
                                DismissNoticeButton { markLocation.clearOutcome() }
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.regularMaterial)
                    .clipShape(.rect(cornerRadius: 8))
                    .allowsHitTesting(isRefusal)
                    .accessibilityElement(children: isRefusal ? .contain : .combine)
                } else if markLocation.isAcquiring {
                    // While the fix is being requested. The rail button is
                    // only dimmed meanwhile, and up to ten silent seconds
                    // after a tap read as a button that did nothing.
                    Text(MarkLocation.acquiringMessage)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.regularMaterial)
                        .clipShape(.rect(cornerRadius: 8))
                        .allowsHitTesting(false)
                        .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, 16)
            // Below the recording HUD while it is up, measured rather than
            // guessed: the HUD grows with Dynamic Type.
            .padding(.top, recorder.isActive ? 60 + hudHeight + 8 : 116)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            // The photo map's cap, on the map: the row that also says it is
            // behind the closed layers panel while the pins are looked at.
            // It shares the top slot with the location and mark notices and
            // yields to them: the answer to the tap just made comes first,
            // and the cap is still there when it has gone.
            if let note = photoMapVM.truncationNote, printFrame == nil,
               controller.locationMessage == nil, markLocation.outcome == nil,
               !markLocation.isAcquiring
            {
                VStack {
                    Text(note)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.regularMaterial)
                        .clipShape(.rect(cornerRadius: 8))
                        .padding(.horizontal, 16)
                        // Under the recording HUD when there is one, as the
                        // notices it shares the slot with are.
                        .padding(.top, recorder.isActive ? 60 + hudHeight + 8 : 116)

                    Spacer()
                }
                .allowsHitTesting(false)
                .accessibilityElement(children: .combine)
            }

            // The recording HUD, top-centre: the bottom belongs to the edit
            // panel and callout cards, and recording during an edit (marking
            // culverts along a walked line) is a supported combination.
            if recorder.isActive, printFrame == nil {
                VStack {
                    TrackRecordingHUD(recorder: recorder) {
                        if let result = recorder.stop() {
                            saveTrack = SaveTrackPayload(result: result)
                        }
                        // The live trace is drawn from the recorder, which
                        // just went idle.
                        pushUserVectors()
                    }
                    .frame(maxWidth: 420)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { hudHeight = $0 }
                    .padding(.horizontal, 16)
                    .padding(.top, 60)

                    Spacer()
                }
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
                        .coversMapBottom(.parcel, on: controller)
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay(alignment: .bottom) {
            if let editSession {
                VectorEditPanel(
                    session: editSession,
                    onDone: {
                        // Done outranks any Edit tap still loading its layer.
                        editLoadGeneration += 1
                        Task {
                            // Only closed once the last edit is on disk. A
                            // session dismissed over a failed write would take
                            // the only copy of the shape with it.
                            guard await editSession.end() else { return }
                            self.editSession = nil
                            controller.setVectorDraft(nil)
                            controller.setVectorHandles(nil)
                            controller.setVectorMoveHandle(nil)
                            pushUserVectors()
                        }
                    },
                    mapCentre: {
                        controller.visibleCentre().map { GeoJsonPosition(lng: $0.lng, lat: $0.lat) }
                    },
                    showCorner: { position in
                        // Without animation: the reader may tap "Move corner to
                        // map centre" straight after stepping, and a centre read
                        // mid-flight would move the corner somewhere between.
                        // It also honours Reduce Motion by construction.
                        controller.pan(to: GeoPoint(lat: position.lat, lng: position.lng), animated: false)
                    },
                    snapCentre: { centre, featureID in
                        // The same resolution as a drag's release, tick
                        // included; the snap is said with the move.
                        guard let hit = snapHit(
                            at: centre.lat, longitude: centre.lng, excludingFeatureID: featureID
                        ) else {
                            return VectorEditPanel.CentreTarget(position: centre)
                        }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        return VectorEditPanel.CentreTarget(
                            position: GeoJsonPosition(lng: hit.point.lng, lat: hit.point.lat),
                            parcelSnap: hit.source == .parcel,
                            note: VectorEditSession.snapNoticeText(
                                source: hit.source, kind: hit.kind, pointToolArmed: false
                            )
                        )
                    }
                )
                .frame(maxWidth: 420)
                .padding(.horizontal, 12)
                .padding(.bottom, 12 + attributionHeight)
                .coversMapBottom(.editPanel, on: controller)
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
                .coversMapBottom(.measure, on: controller)
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
                    layerName: vectorCallout.layerName,
                    photos: vectorCallout.photos,
                    loadPhoto: { photoID, thumb in
                        // The photo map's points are library assets, loaded
                        // through PhotoKit; every other layer's photos are
                        // the store's own files.
                        if vectorCallout.layerID == PhotoMapViewModel.layerID {
                            return await photoMapVM.imageData(assetID: photoID, thumb: thumb)
                        }
                        return await userVectorsVM.photoData(
                            layerID: vectorCallout.layerID, photoID: photoID, thumb: thumb
                        )
                    },
                    loadProgress: { photoID in photoMapVM.downloadProgress[photoID] }
                ) {
                    self.vectorCallout = nil
                }
                .frame(maxWidth: 420)
                .padding(.horizontal, 12)
                .padding(.bottom, 12 + attributionHeight)
                .coversMapBottom(.vectorCallout, on: controller)
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
                .coversMapBottom(.featureCallout, on: controller)
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

    /// The layers panel, without the placement that floats it over the map.
    private var layersPanel: some View {
        TransparencySliderView(
            viewModel: overlayVM,
            userMaps: userMapsVM,
            userVectors: userVectorsVM,
            onZoomToLayer: { controller.frame($0) },
            onEditLayer: { row in
                requestEdit(row)
            },
            onNewDrawingLayer: {
                // An intent like any other Edit tap: a newer intent, or a
                // session begun meanwhile, outranks the layer when it arrives.
                editLoadGeneration += 1
                let mine = editLoadGeneration
                Task {
                    guard let row = await userVectorsVM.newDrawingLayer() else {
                        return
                    }
                    guard mine == editLoadGeneration, editSession == nil else {
                        // Overtaken: the empty layer it made is not left in
                        // the list for the reader to wonder about.
                        await userVectorsVM.delete(id: row.id)
                        return
                    }
                    beginEditing(row)
                }
            },
            photoMap: photoMapVM,
            onPlacePhotos: { items in
                Task { await beginBulkPlacement(from: items) }
            },
            isExpanded: $isLayersMenuExpanded,
            expandedCategories: $openLayerSections
        )
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
                    // The panel covers the ground the dot is about to be put
                    // on, as it would cover a shape being drawn.
                    if isLayersMenuExpanded {
                        withAnimation(
                            .spring(response: 0.35, dampingFraction: 0.85)
                                .unlessReduced(reduceMotion)
                        ) {
                            isLayersMenuExpanded = false
                        }
                    }
                    controller.animatesLocate = !reduceMotion
                    controller.showsUserLocation = true
                    controller.centerOnUserLocation()
                } label: {
                    LocationButtonIcon(controller: controller)
                }
                .accessibilityLabel("Current Location")
                .disabled(isSelectingSaveArea)

                Button {
                    // Registered with the session on the tap itself, before
                    // the task that finds the fix has run: a scene change
                    // between the two would otherwise drain nothing and let
                    // the mark run unowned while the app is away.
                    let destination = editSession
                    let operation = destination?.beginOperation()
                    // And, session or not, the mark holds a background
                    // assertion from the tap: a fix can take ten seconds, and
                    // a Field-notes write put away with the app was lost.
                    let application = UIApplication.shared
                    final class TokenBox: @unchecked Sendable { var value = UIBackgroundTaskIdentifier.invalid }
                    let box = TokenBox()
                    box.value = application.beginBackgroundTask(withName: "mark-my-location") {
                        application.endBackgroundTask(box.value)
                        box.value = .invalid
                    }
                    Task {
                        await markMyLocation(destination: destination, operation: operation)
                        if box.value != .invalid {
                            application.endBackgroundTask(box.value)
                            box.value = .invalid
                        }
                    }
                } label: {
                    MapControlIcon(systemName: "mappin.and.ellipse")
                }
                .accessibilityLabel("Mark My Location")
                .accessibilityIdentifier("mark-my-location")
                // Off while Done is saving: the session takes no mark then,
                // and "the layer changed" would not be what happened.
                .disabled(isSelectingSaveArea || markLocation.isAcquiring || editSession?.isEnding == true)

                Button {
                    controller.showsUserLocation = true
                    recorder.start()
                } label: {
                    MapControlIcon(
                        systemName: recorder.isActive ? "record.circle.fill" : "record.circle",
                        tint: .red,
                        isActive: recorder.isActive
                    )
                }
                .accessibilityLabel("Record a Track")
                .accessibilityIdentifier("record-track")
                // While a recording runs, the HUD owns pause and stop; the
                // rail button just shows the mode is on.
                .disabled(isSelectingSaveArea || recorder.isActive)

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

                // Share, print and info live behind one control. Nine
                // always-visible circles was the heaviest rail an app of this
                // kind carries, it nearly filled an SE-class screen, and these
                // three are occasional actions rather than map modes — every
                // mode toggle stays a top-level control, and the menu costs
                // one extra tap on the rail's least-used third.
                Menu {
                    Button {
                        share = SharePayload(url: overlayVM.shareURL ?? OverlayViewModel.webMapURL)
                    } label: {
                        Label("Share This Map View", systemImage: "square.and.arrow.up")
                    }
                    .accessibilityIdentifier("share-map-view")

                    Button {
                        cancelBoundsSelection()
                        controller.beginPrintFraming()
                        printFrame = .default
                    } label: {
                        Label("Export This Map As A PDF", systemImage: "printer")
                    }
                    .accessibilityIdentifier("export-map-pdf")

                    Button {
                        cancelBoundsSelection()
                        navigationModel.activeSheet = .info
                    } label: {
                        Label("Data Sources and Licenses", systemImage: "info.circle")
                    }
                } label: {
                    MapControlIcon(systemName: "ellipsis")
                }
                .accessibilityLabel("More Map Actions")
                .accessibilityIdentifier("more-map-actions")
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
                // Not while editing, as the measure buttons are not: the
                // panel's first map tap closes it instead of drawing, and its
                // Edit rows would end the session under the reader's feet.
                .disabled(isSelectingSaveArea || editSession != nil)
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                controlsHeight = height
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
                controlsWidth = width
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
        controller.userMapDrapes.map(\.record.name)
            + controller.userVectorDrawings.map(\.record.name)
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
                        // every other geometry type of theirs uses — unless
                        // the reader is measuring or editing, which own the
                        // map the same way they do for a tap.
                        if let item = userVectorsVM.feature(annotationID: annotationID)
                            ?? photoMapVM.callout(annotationID: annotationID)
                        {
                            guard measure == nil, editSession?.isEditing != true else { break }
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
                        let hit = snapHit(
                            at: latitude, longitude: longitude,
                            excludingFeatureID: featureID
                        )
                        let outcome = editSession?.moveVertex(
                            featureID: featureID, ring: ring, vertex: vertex,
                            latitude: hit?.point.lat ?? latitude,
                            longitude: hit?.point.lng ?? longitude,
                            parcelSnap: hit?.source == .parcel
                        )
                        // The tick and the words only for a snap that took:
                        // a session on its way out refuses the move, and
                        // "Snapped to a parcel corner" over a handle that
                        // sprang back would be a lie.
                        if let hit, outcome != .refused {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            // In words as well as the tick, as a drawing tap
                            // is: the caption names what was snapped to, and
                            // VoiceOver hears it.
                            editSession?.noteSnap(hit)
                        }
                        // A snap back onto the stored coordinate changes no
                        // geometry, so nothing rebuilds the handles, and the
                        // dragged one would stay where the finger let go.
                        if outcome != .moved {
                            controller.reinstallVectorHandles()
                        }
                        if outcome == .refused {
                            editSession?.noteMoveRefused()
                        }
                    case .featureMoved(let featureID, let latitudeDelta, let longitudeDelta):
                        let outcome = editSession?.moveFeature(
                            featureID: featureID,
                            latitudeDelta: latitudeDelta,
                            longitudeDelta: longitudeDelta
                        )
                        // A refused or empty move leaves the arrows where the
                        // finger let go unless they are put back.
                        if outcome != .moved {
                            controller.reinstallVectorHandles()
                        }
                        if outcome == .refused {
                            editSession?.noteMoveRefused()
                        }

                    case .clusterSelected(let ids):
                        // Several photos from one spot: one card with all of
                        // them, from the photo map or from one of the
                        // reader's own photo layers. Clusters never span
                        // layers, so one of the two answers. Not over
                        // measuring or editing, as for any other annotation.
                        guard measure == nil, editSession?.isEditing != true else { break }
                        if let item = photoMapVM.callout(clusterMemberIDs: ids)
                            ?? userVectorsVM.callout(clusterMemberIDs: ids)
                        {
                            vectorCallout = item
                            featureVM.clearSelection()
                            overlayVM.clearParcelSelection()
                            // MapKit deselects the cluster at once and the card
                            // arrives below: said, so the double-tap has a
                            // spoken result wherever focus was left.
                            AccessibilityNotification.Announcement(item.callout.title).post()
                        }
                    case .visibleRegionSettled:
                        // The readout says where the map is, following or not.
                        mapPosition = overlayVM.currentPosition
                        // What is written down is the view the reader chose:
                        // a followed position is not remembered, shared or
                        // printed.
                        overlayVM.notePositionSettled()
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
                        refreshParcelSnap()
                        refreshPhotoMap()
                    case .mapTapped(let latitude, let longitude):
                        // An open layers panel takes the first tap on the map
                        // and spends it on closing itself.
                        //
                        // The panel covers most of a phone screen, so a tap on
                        // what is left of the map is far more often a reader
                        // reaching past the panel than one asking about the
                        // ground under their finger — and the answer used to
                        // be a parcel card opened behind the panel, about a
                        // parcel nobody was aiming at. Only the tap is taken:
                        // panning and zooming still reach the map, so the
                        // panel can be left up while the view is moved under
                        // it.
                        if isLayersMenuExpanded {
                            withAnimation(
                                .spring(response: 0.35, dampingFraction: 0.85)
                                    .unlessReduced(reduceMotion)
                            ) {
                                isLayersMenuExpanded = false
                            }
                            break
                        }
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
                            // While the session is ending, it belongs to nobody.
                            guard !editSession.isEnding else { break }
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
                        if controller.parcelShapes.contains(where: {
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
    }

    // The surface and its observation wiring are separate declarations, not
    // one expression: the single chain grew past what the type checker will
    // solve in reasonable time, so the modifiers are grouped into wiring
    // functions of a size it can.
    var body: some View {
        sceneWiring(editWiring(snapWiring(contentWiring(surfaceAndSheets))))
    }

    private func contentWiring(_ content: some View) -> some View {
        content
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
            .onChange(of: markLocation.outcome) { _, outcome in
                guard let outcome else { return }
                AccessibilityNotification.Announcement(outcome.message).post()
            }
            // The wait is said too: up to ten silent seconds after a tap read
            // as a button that did nothing.
            .onChange(of: markLocation.isAcquiring) { _, acquiring in
                guard acquiring else { return }
                AccessibilityNotification.Announcement(MarkLocation.acquiringMessage).post()
            }
            // The live trace follows the fixes as they arrive.
            .onChange(of: recorder.recording.liveSegments) { _, _ in
                pushUserVectors()
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
            .onChange(of: photoMapVM.isVisible) { _, visible in
                refreshPhotoMap()
                // The layer off, access gone, or a read failed: a card about
                // one of its photos closes with its pin.
                if !visible, vectorCallout?.layerID == PhotoMapViewModel.layerID {
                    vectorCallout = nil
                }
            }
            // On the snapshot itself, not on the falling edge of an indexing
            // flag: a second read finishing early cleared the flag before the
            // first had written its snapshot, and the pins waited for a pan.
            .onChange(of: photoMapVM.snapshotGeneration) { _, _ in
                refreshPhotoMap()
                reconcilePhotoMapCallout()
            }
    }


    /// The snapping observers, apart from the rest so the type checker can
    /// take each chain in reasonable time.
    private func snapWiring(_ content: some View) -> some View {
        content
            .onChange(of: editSession?.snapParcels) { _, armed in
                // The one moment the licence sheet may be raised: the user
                // just threw the parcel switch.
                refreshParcelSnap(promptLicence: armed == true)
            }
            .onChange(of: editSession?.snapEnabled) { _, _ in
                refreshParcelSnap()
            }
            // Both ways: withdrawing the licence must drop the parcel targets
            // as surely as accepting it mounts them.
            .onChange(of: overlayVM.hasAcceptedProvinceLicence) { _, _ in
                refreshParcelSnap()
            }
            // The sheet closed without acceptance: the switch goes back to
            // off, as the web's does, rather than reading On for a capability
            // that is blocked.
            .onChange(of: overlayVM.isShowingLicenceSheet) { _, showing in
                if !showing, !overlayVM.hasAcceptedProvinceLicence, editSession?.snapParcels == true {
                    editSession?.snapParcels = false
                }
            }
    }

    private func editWiring(_ content: some View) -> some View {
        content
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
                pushDraftPreview()
            }
            .onChange(of: editSession?.draft) { _, _ in
                pushDraftPreview()
            }
            // The just-committed halo coming on and, a moment later, off.
            .onChange(of: editSession?.recentlyCommittedFeatureID) { _, _ in
                pushUserVectors()
            }
            // The connect-the-dots order, drawn while the convert section is
            // open so the stored order is seen before it is committed.
            .onChange(of: editSession?.isPreviewingConversion) { _, _ in
                pushDraftPreview()
            }
            .onChange(of: editSession?.selectedFeatureID) { _, _ in
                controller.setVectorHandles(selectionHandles())
                controller.setVectorMoveHandle(moveHandle())
            }
            // Done draining takes the handles down with the panel's controls,
            // so a drag cannot be attempted and refused; they come back if
            // Done fails and the session stays open.
            .onChange(of: editSession?.isEnding) { _, ending in
                if ending == true {
                    controller.setVectorHandles(nil)
                    controller.setVectorMoveHandle(nil)
                } else if ending == false {
                    controller.setVectorHandles(selectionHandles())
                    controller.setVectorMoveHandle(moveHandle())
                }
            }
    }

    private func sceneWiring(_ content: some View) -> some View {
        content
            .onChange(of: navigationModel.activeSheet) { _, newValue in
                if newValue != nil {
                    cancelBoundsSelection()
                }
            }
            .onChange(of: scenePhase) { _, newPhase in
                // Recording is foreground-only: leaving the app pauses it and
                // says so, rather than drawing a straight line across ground
                // nobody walked.
                recorder.scenePhaseChanged(isActive: newPhase == .active)
                if newPhase == .active {
                    // The session takes work again only once the scene is
                    // back, not when its suspension flush returns.
                    editSession?.endSuspension()
                    refreshPhotoMapAfterReturning()
                    // A refusal notice may describe a cause changed in
                    // Settings while the app was away.
                    controller.reconcileLocationNotice()
                    markLocation.reconcileOutcome()
                }
                if newPhase != .active {
                    cancelBoundsSelection()
                    // A switch thrown without moving the map never settles the
                    // viewport, so this is where that change is written down.
                    // It is also the last moment before the system may kill the
                    // app outright.
                    overlayVM.rememberSession()
                    // The debounce cannot outlive the app. A pending edit that was
                    // still waiting for its timer when the user switched away would
                    // never be written at all. A draft is finished only on the
                    // way to the background: `.inactive` is Control Center or
                    // an incoming call, and a line the reader was still drawing
                    // must not be committed under them for that.
                    if let editSession {
                        flushProtectedFromSuspension(
                            editSession, settlingDraft: newPhase == .background
                        )
                    }
                }
            }
            .onDisappear {
                cancelBoundsSelection()
                if let editSession {
                    flushProtectedFromSuspension(editSession, settlingDraft: true)
                }
            }
    }

    /// Saves the stopped recording as a layer. The sheet stays up until the
    /// write lands: the recording is the only copy of the walk, and
    /// dismissing before a failed save would throw it out while telling the
    /// user to try again.
    private func saveRecordedTrack(
        _ result: TrackRecording.StopResult, name: String, toleranceM: Double
    ) {
        Task {
            guard let row = await userVectorsVM.addRecordedLayer(
                result, name: name, simplifyToleranceM: toleranceM
            ) else {
                saveTrackError = "This track could not be saved to your "
                    + "device. Free some space and save again, or discard it."
                return
            }
            saveTrackError = nil
            saveTrack = nil
            if let box = row.record.bbox {
                controller.frame(box)
            }
        }
    }

    /// Photos change while the app is away — deletions, new shots, a limited
    /// selection edited through the photo-map row's own Manage button — and a
    /// pin for a deleted photo is a location claim about nothing. Runs on
    /// return to the foreground while the photo map is on: setVisible
    /// re-checks access and applies persistent changes; an unchanged token
    /// returns without a rebuild.
    private func refreshPhotoMapAfterReturning() {
        // Access is re-read whether or not the layer is on: it changes in
        // Settings, and a revocation does not relaunch the app.
        photoMapVM.refreshAccess()
        guard photoMapVM.isOn else { return }
        Task {
            await photoMapVM.refreshIndex()
            refreshPhotoMap()
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
    /// What the parcel-snap fetch came to, in words that keep an empty answer
    /// apart from parcels that came back without a readable boundary: a
    /// boundary the service did not supply, or one this app could not read,
    /// is not "no parcels here".
    static func parcelSnapNote(
        shapes: Int, notSupplied: Int, unreadable: Int, unidentified: Int = 0
    ) -> String? {
        var parts: [String] = []
        if unidentified > 0 {
            parts.append("\(unidentified) parcel result\(unidentified == 1 ? "" : "s") could not be identified")
        }
        if notSupplied > 0 {
            parts.append("\(notSupplied) parcel\(notSupplied == 1 ? "" : "s") returned without a boundary")
        }
        if unreadable > 0 {
            parts.append("\(unreadable) parcel boundar\(unreadable == 1 ? "y" : "ies") could not be read")
        }
        if shapes == 0 {
            if parts.isEmpty { return "0 parcels snappable in this view." }
            return parts.joined(separator: "; ") + "; nothing here to snap to."
        }
        return parts.isEmpty ? nil : parts.joined(separator: "; ") + "."
    }

    private func flushProtectedFromSuspension(_ session: VectorEditSession, settlingDraft: Bool) {
        // Closed now, synchronously: a task the last tap started has not run
        // yet, and must find the gate shut when it does.
        session.beginSuspension()
        // A draft that is already a shape is committed before the flush when
        // the app is being put away: the flush writes only what was
        // committed, and a line placed and left unfinished was gone if iOS
        // ended the process. A partial draft stays a draft; nobody can be
        // asked.
        let application = UIApplication.shared
        final class TokenBox: @unchecked Sendable { var value = UIBackgroundTaskIdentifier.invalid }
        let box = TokenBox()
        box.value = application.beginBackgroundTask(withName: "vector-edit-flush") {
            application.endBackgroundTask(box.value)
            box.value = .invalid
        }
        Task {
            // Everything Done would wait for — attachments, operations, the
            // flush, a hidden layer switched on — under the one assertion, so
            // a photo accepted a moment before the app was put away is not
            // lost with the process.
            await session.prepareForSuspension(settlingDraft: settlingDraft)
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
            var live = UserVectorDrawing(record: record, parsed: parsed)
            live.highlightedFeatureID = session.recentlyCommittedFeatureID
            if let index = drawings.firstIndex(where: { $0.id == record.id }) {
                drawings[index] = live
            } else {
                // A layer switched off is still the one being edited: hiding it
                // mid-edit would leave the user drawing on nothing.
                drawings.append(live)
            }
        }
        if let trace = liveTraceDrawing() {
            drawings.append(trace)
        }
        if let snap = parcelSnapDrawing() {
            drawings.append(snap)
        }
        if let photos = photoMapVM.drawing() {
            drawings.append(photos)
        }
        controller.setUserVectors(drawings)
    }

    /// The recording's accepted vertices as a transient drawing — the live
    /// trace. Not a stored layer: it exists only while the recorder runs, is
    /// never hit-tested (it is not in the view model's rows), and the saved
    /// layer replaces it at stop time.
    private func liveTraceDrawing() -> UserVectorDrawing? {
        guard recorder.isActive else { return nil }
        let segments = recorder.recording.liveSegments.filter { $0.count >= 2 }
        guard !segments.isEmpty else { return nil }
        let geometry: GeoJsonGeometry =
            segments.count == 1 ? .lineString(segments[0]) : .multiLineString(segments)
        // Fixed dates so successive pushes compare equal in the state diff.
        let epoch = Date(timeIntervalSince1970: 0)
        let record = UserVectorLayerRecord(
            id: "recording-live-trace",
            name: "Recording",
            source: .recorded,
            origin: .recorded(startedAt: epoch, endedAt: epoch),
            createdAt: epoch,
            colorHex: "#0072b2",
            featureCount: 1,
            bbox: nil
        )
        return UserVectorDrawing(
            record: record,
            parsed: ParsedVector(
                features: [GeoJsonFeature(id: "recording-live-trace", geometry: geometry)],
                bbox: nil
            )
        )
    }

    /// Faint parcel rings currently armed for snapping. Not a stored layer,
    /// not hit-tested, cleared when parcels are disarmed.
    private func parcelSnapDrawing() -> UserVectorDrawing? {
        // Not drawn without the licence, whatever the rings still hold: the
        // faint boundaries are restricted data too.
        guard let session = editSession, session.snapEnabled, session.snapParcels,
              overlayVM.hasAcceptedProvinceLicence, !session.parcelSnapRings.isEmpty
        else { return nil }
        let epoch = Date(timeIntervalSince1970: 0)
        let record = UserVectorLayerRecord(
            id: "snap-parcel-targets",
            name: "Parcel snap",
            source: .drawn,
            origin: .drawn(createdAt: epoch),
            createdAt: epoch,
            colorHex: "#64748b",
            featureCount: session.parcelSnapRings.count,
            bbox: nil
        )
        let features = session.parcelSnapRings.enumerated().map { index, rings in
            GeoJsonFeature(
                id: "snap-parcel-\(index)",
                geometry: .polygon(rings),
                properties: ["fill-opacity": .number(0.05), "stroke-opacity": .number(0.55)]
            )
        }
        return UserVectorDrawing(
            record: record,
            parsed: ParsedVector(features: features, bbox: nil)
        )
    }

    /// `excludingFeatureID` is the feature a drag is editing: its own
    /// pre-drag geometry is still in `session.parsed`, and offering it as a
    /// target would snap the dragged vertex back to where it started — the
    /// web's Geoman snapping excludes the dragged layer the same way.
    private func snapHit(
        at latitude: Double, longitude: Double, excludingFeatureID: String? = nil
    ) -> SnapEngine.Hit? {
        guard let session = editSession, session.snapEnabled else { return nil }
        let point = GeoPoint(lat: latitude, lng: longitude)
        var targets: [SnapEngine.Target] = []
        if session.snapOwnFeatures, let parsed = session.parsed {
            for feature in parsed.features
            where excludingFeatureID == nil || feature.id != excludingFeatureID {
                // With the Point tool armed, the layer's own points are not
                // targets: a new point snapped onto one was an invisible
                // duplicate at the same coordinate.
                if let geometry = feature.geometry,
                   let target = VectorEditSession.snapTargetGeometry(geometry, tool: session.tool)
                {
                    targets.append(.ownFeature(target))
                }
            }
            if let draft = session.draft, draft.vertices.count >= 1 {
                let points = draft.vertices.map(\.point)
                var segments: [(GeoPoint, GeoPoint)] = []
                if points.count >= 2 {
                    for index in 1..<points.count {
                        segments.append((points[index - 1], points[index]))
                    }
                }
                targets.append(
                    SnapEngine.Target(source: .ownFeature, vertices: points, segments: segments)
                )
            }
        }
        // Checked at the tap as well as at the mount: targets fetched under a
        // licence since withdrawn are not offered.
        if session.snapParcels, overlayVM.hasAcceptedProvinceLicence {
            targets.append(contentsOf: session.parcelSnapTargets)
        }
        let metresPerPoint = controller.groundMetresPerPoint() ?? 1
        let tolerance = CaptureSpec.Snap.toleranceScreenUnits * metresPerPoint
        return SnapEngine.nearest(to: point, among: targets, toleranceMetres: tolerance)
    }

    /// `promptLicence` is true only when the user just armed parcel
    /// snapping: the licence sheet is an answer to that gesture, and raising
    /// it again on every region settle would re-present a sheet the user
    /// swiped away to think about.
    private func refreshParcelSnap(promptLicence: Bool = false) {
        // Whatever the early exit below, a fetch still in flight must not
        // land afterwards: it was made under a licence or a setting that
        // this refresh is here to withdraw.
        parcelSnapTask?.cancel()
        parcelSnapTask = nil
        parcelSnapGeneration += 1
        let generation = parcelSnapGeneration
        guard let session = editSession, session.snapEnabled, session.snapParcels else {
            editSession?.parcelSnapTargets = []
            editSession?.parcelSnapRings = []
            editSession?.parcelSnapNote = nil
            pushUserVectors()
            return
        }
        if !overlayVM.hasAcceptedProvinceLicence {
            session.parcelSnapTargets = []
            session.parcelSnapRings = []
            session.parcelSnapNote = "Accept the Province licence to snap to parcels."
            if promptLicence {
                overlayVM.promptProvinceLicence(for: .nsprd)
            }
            pushUserVectors()
            return
        }
        // The licence first, then the zoom: the reader asked for restricted
        // data, and the answer to that is the gate, not "zoom in".
        if controller.zoomLevel < CaptureSpec.Snap.minZoom {
            session.parcelSnapTargets = []
            session.parcelSnapRings = []
            session.parcelSnapNote = "Zoom in to snap to parcels."
            pushUserVectors()
            return
        }
        guard let bounds = controller.currentVisibleBounds() else { return }
        let box = GeoBoundingBox(
            south: bounds.minLatitude, west: bounds.minLongitude,
            north: bounds.maxLatitude, east: bounds.maxLongitude
        )
        session.parcelSnapNote = nil
        parcelSnapTask = Task {
            let clearance = overlayVM.clearanceBox.clearance
            do {
                let collection = try await ParcelFetcher().parcels(in: box, clearance: clearance)
                // Re-checked after the wait, not only before it: the licence
                // can be withdrawn, and the toggles thrown, while the request
                // is out; and a later refresh may have taken over.
                guard parcelSnapStillWanted(session, generation: generation),
                      overlayVM.hasAcceptedProvinceLicence
                else { return }
                var targets: [SnapEngine.Target] = []
                var rings: [[[GeoJsonPosition]]] = []
                var notSupplied = 0
                var unreadable = 0
                for feature in collection.identifiedFeatures {
                    switch feature.boundary {
                    case .shape(let parts):
                        for part in parts {
                            targets.append(.parcel(rings: part))
                            rings.append(
                                part.map { ring in
                                    ring.map { GeoJsonPosition(lng: $0.lng, lat: $0.lat) }
                                }
                            )
                        }
                    case .notSupplied:
                        notSupplied += 1
                    case .unreadable:
                        unreadable += 1
                    }
                }
                session.parcelSnapTargets = targets
                session.parcelSnapRings = rings
                session.parcelSnapNote = Self.parcelSnapNote(
                    shapes: rings.count, notSupplied: notSupplied, unreadable: unreadable,
                    unidentified: collection.unidentifiedFeatureCount
                )
                pushUserVectors()
            } catch ParcelLookupFailure.tooManyParcels(count: _) {
                // A failure is as stale as an answer: the dense viewport that
                // threw this may be two pans behind the one on screen.
                guard parcelSnapStillWanted(session, generation: generation) else { return }
                session.parcelSnapTargets = []
                session.parcelSnapRings = []
                session.parcelSnapNote = "Too many parcels here, zoom in."
                pushUserVectors()
            } catch ParcelLookupFailure.cancelled {
                return
            } catch ParcelLookupFailure.refused(.licenceNotAccepted) {
                guard parcelSnapStillWanted(session, generation: generation, requiringLicence: false)
                else { return }
                session.parcelSnapTargets = []
                session.parcelSnapRings = []
                session.parcelSnapNote = "Accept the Province licence to snap to parcels."
                pushUserVectors()
            } catch {
                guard parcelSnapStillWanted(session, generation: generation) else { return }
                session.parcelSnapTargets = []
                session.parcelSnapRings = []
                session.parcelSnapNote = "Parcel boundaries could not be loaded."
                pushUserVectors()
            }
        }
    }

    /// Whether a parcel fetch's answer is still for the session and the
    /// refresh that asked. A fetch cancelled or overtaken by a later refresh
    /// must not write its rings, or its failure, over the current ones — a
    /// licence withdrawn while it was out would otherwise be answered with
    /// "too many parcels".
    private func parcelSnapStillWanted(
        _ session: VectorEditSession, generation: Int, requiringLicence: Bool = true
    ) -> Bool {
        // The licence too: withdrawn while a fetch was out, its failure must
        // not be published as "too many parcels" over the blocked state.
        !Task.isCancelled && generation == parcelSnapGeneration
            && session === editSession && session.snapEnabled && session.snapParcels
            && (!requiringLicence || overlayVM.hasAcceptedProvinceLicence)
    }

    /// A card about a photo the library no longer shows — deleted, or no
    /// longer in a limited selection — is closed, or replaced with what the
    /// index says now.
    private func reconcilePhotoMapCallout() {
        guard let open = vectorCallout, open.layerID == PhotoMapViewModel.layerID else { return }
        vectorCallout = photoMapVM.callout(matching: open)
    }

    private func refreshPhotoMap() {
        photoMapVM.refreshViewport(bounds: visibleGeoBox())
        pushUserVectors()
    }

    private func visibleGeoBox() -> GeoBoundingBox? {
        guard let bounds = controller.currentVisibleBounds() else { return nil }
        return GeoBoundingBox(
            south: bounds.minLatitude, west: bounds.minLongitude,
            north: bounds.maxLatitude, east: bounds.maxLongitude
        )
    }

    /// Why a pick placed nothing, in terms of what was actually found out:
    /// photos that were read and had no location, and photos that could not
    /// be read at all, whose location is unknown rather than absent.
    static func nothingPlacedMessage(untagged: Int, notInspected: Int, refused: Int = 0) -> String {
        if notInspected == 0, refused == 0 {
            return "No selected photos had a location, so none were added."
        }
        if untagged == 0, refused == 0 {
            return notInspected == 1
                ? "The selected photo couldn't be read, so it wasn't added."
                : "None of the \(notInspected) selected photos could be read, so none were added."
        }
        if untagged == 0, notInspected == 0 {
            return refused == 1
                ? "The selected photo was refused for its size or format, so it wasn't added."
                : "All \(refused) selected photos were refused for size or format, so none were added."
        }
        var parts: [String] = []
        if untagged > 0 { parts.append("\(untagged) had no location") }
        if notInspected > 0 { parts.append("\(notInspected) couldn't be read") }
        if refused > 0 { parts.append("\(refused) \(refused == 1 ? "was" : "were") refused for size or format") }
        return "Of the selected photos, " + parts.joined(separator: ", ") + ", so none were added."
    }

    private func beginBulkPlacement(from items: [PhotosPickerItem]) async {
        var candidates: [BulkPhotoPlacement.Candidate] = []
        var names: [String: String] = [:]
        var payloads: [String: UserVectorsViewModel.PhotoPlacement] = [:]
        // Photos that could not be read at all, and photos that were read
        // and refused for size or format, are counted apart from the ones
        // that were read and had no location: "none had a location" is a
        // claim about the photos, and it is only made about photos that
        // were read.
        var notInspected = 0
        var refused = 0
        for (index, item) in items.enumerated() {
            let id = item.itemIdentifier ?? "picked-\(index)"
            let name = "Photo \(index + 1)"
            names[id] = name
            guard let data = try? await item.loadTransferable(type: Data.self) else {
                userVectorsVM.reportExportShortfall(
                    layerName: name,
                    message: "This photo couldn't be read. It wasn't added."
                )
                notInspected += 1
                candidates.append(.init(id: id, gps: nil, capturedAt: nil, unplaceable: .unreadable))
                continue
            }
            // Detached, like the edit session's attach path: the decode and
            // two JPEG re-encodes are CPU work with no business on the main
            // actor, and a hundred-photo pick would freeze the map for the
            // whole batch. Untagged photos are never processed at all —
            // they cannot be placed, so re-encoding them buys nothing.
            let outcome = await Task.detached(priority: .userInitiated) {
                () -> (
                    claims: PhotoPipeline.CaptureClaims,
                    processed: Result<PhotoPipeline.Processed, PhotoPipeline.Refusal>?
                ) in
                let claims = PhotoPipeline.captureClaims(data)
                guard claims.location != nil else { return (claims, nil) }
                do throws(PhotoPipeline.Refusal) {
                    return (claims, .success(try PhotoPipeline.process(data)))
                } catch {
                    return (claims, .failure(error))
                }
            }.value
            switch outcome.processed {
            case .success(let processed)?:
                if let gps = outcome.claims.location {
                    payloads[id] = .init(
                        gps: gps,
                        capturedAt: outcome.claims.capturedAt,
                        sourceName: name,
                        processed: processed
                    )
                }
                candidates.append(
                    .init(
                        id: id, gps: outcome.claims.location,
                        capturedAt: outcome.claims.capturedAt
                    )
                )
            case .failure(let refusal)?:
                userVectorsVM.reportExportShortfall(
                    layerName: name, message: refusal.userMessage
                )
                refused += 1
                candidates.append(
                    .init(id: id, gps: nil, capturedAt: nil, unplaceable: .refused(refusal.userMessage))
                )
            case nil:
                candidates.append(
                    .init(id: id, gps: nil, capturedAt: outcome.claims.capturedAt)
                )
            }
        }
        let rows = BulkPhotoPlacement.classify(candidates, bounds: visibleGeoBox())
        guard rows.contains(where: \.isPlaceable) else {
            // Nothing to place is an answer, not silence: the picker closed
            // and the reader is told why nothing appeared.
            let message = Self.nothingPlacedMessage(
                untagged: candidates.count - notInspected - refused,
                notInspected: notInspected, refused: refused
            )
            userVectorsVM.reportExportShortfall(layerName: "Add photos to map", message: message)
            AccessibilityNotification.Announcement(message).post()
            return
        }
        bulkPlacement = BulkPlacementDraft(rows: rows, names: names, payloads: payloads)
    }

    /// What the rubber-band overlay should draw: the conversion preview when
    /// the convert section is open, else the shape being drawn.
    private func pushDraftPreview() {
        // Measuring owns the overlay while it runs; recording and editing
        // cannot start while a measurement is up.
        guard measure == nil else { return }
        if let preview = conversionPreview() {
            controller.setVectorDraft(preview)
        } else {
            controller.setVectorDraft(draftPreview(editSession?.draft))
        }
    }

    /// The connect-the-dots order as a dashed amber path — the measure
    /// colour, so a preview is never mistaken for a saved line.
    private func conversionPreview() -> VectorDraftPreview? {
        guard let session = editSession, session.isPreviewingConversion,
              let plan = session.convertPlanLine, plan.positions.count >= 2
        else { return nil }
        return VectorDraftPreview(
            shape: .line, vertices: plan.positions, colorHex: "#d97706"
        )
    }

    /// One-tap mark: the recorder's fix when fresh and tight (the contract's
    /// 10 s / 50 m rule), else one requested fix. Marks into the open edit
    /// session, else the "Field notes" layer.
    /// `destination` and `operation` are decided at the tap, not after the
    /// wait: a session begun or ended while the fix was being found must
    /// not redirect the mark somewhere the reader did not aim it, and the
    /// session owns the mark from the tap, so Done and a suspension wait
    /// for it. A session already closing, or suspended, takes no mark.
    private func markMyLocation(destination: VectorEditSession?, operation: UUID?) async {
        // The attempt is counted first: a timer left by the last outcome
        // must not take this attempt's answer down.
        beginMarkAttempt()
        if destination != nil, operation == nil {
            markLocation.report(.destinationChanged)
            scheduleMarkOutcomeDismissal()
            return
        }
        defer { if let operation { destination?.endOperation(operation) } }
        // The recorder's fix first, then the one behind the map's own blue
        // dot: a position already on screen is used before CoreLocation is
        // asked for another.
        guard let fix = await markLocation.acquireFix(
            preferring: [recorder.lastFix, controller.userLocationFix()]
        ) else {
            if markLocation.outcome == nil {
                markLocation.report(.unavailable)
            }
            scheduleMarkOutcomeDismissal()
            return
        }
        let feature = MarkFeature.buildGpsMarkFeature(fix)
        guard destination === editSession else {
            markLocation.report(.destinationChanged)
            scheduleMarkOutcomeDismissal()
            return
        }
        if let session = editSession, session.isEditing {
            // Refused once Done has begun: the session is closing, and the
            // mark would race its final write.
            guard session.appendMark(feature, holding: operation) else {
                markLocation.report(.destinationChanged)
                scheduleMarkOutcomeDismissal()
                return
            }
            // The layer's name is read now, before any wait, so a session
            // closing meanwhile cannot turn it into "this layer".
            let layerName = session.record?.name ?? "this layer"
            // Said only once the mark is on disk: the session's own write is
            // debounced, and "Marked in" before it lands was a promise.
            guard await session.flush() else {
                markLocation.report(
                    .storageFailed(
                        session.storageError ?? MarkLocation.storageFallbackMessage
                    )
                )
                scheduleMarkOutcomeDismissal()
                return
            }
            // A mark asks to be seen; a layer switched off is switched on,
            // and said to be only once the library has it.
            let layerShown = session.layerIsHidden
            if layerShown, await !session.showLayer() {
                markLocation.report(
                    .storageFailed(
                        "The mark was saved, but the layer could not be switched on. "
                            + "Turn it on from Layers."
                    )
                )
                scheduleMarkOutcomeDismissal()
                return
            }
            markLocation.report(
                .marked(
                    layerName: layerName,
                    accuracyM: fix.accuracyM,
                    layerShown: layerShown
                )
            )
        } else {
            guard let row = await userVectorsVM.fieldNotesRow(),
                  await userVectorsVM.appendFeature(feature, to: row.id)
            else {
                // A fix was had; the layer refused it. Said in the store's
                // words — a storage failure reported as a GPS failure sent
                // the reader outdoors to fix a full disk.
                markLocation.report(
                    .storageFailed(
                        userVectorsVM.lastRefusal?.userMessage
                            ?? MarkLocation.storageFallbackMessage
                    )
                )
                scheduleMarkOutcomeDismissal()
                return
            }
            // Read again after the write: the reader may have renamed the
            // layer, switched it off, or deleted it while the append was in
            // flight. A deleted layer took the mark with it, and Field notes
            // switched off would be a success toast over a map with no new
            // pin on it.
            guard let current = userVectorsVM.rows.first(where: { $0.id == row.id }) else {
                markLocation.report(
                    .storageFailed(
                        "\(row.record.name) was deleted while the mark was being saved, "
                            + "so the mark was not kept."
                    )
                )
                scheduleMarkOutcomeDismissal()
                return
            }
            let layerShown = !current.isVisible
            if layerShown, await !userVectorsVM.showLayer(id: row.id) {
                markLocation.report(
                    .storageFailed(
                        "The mark was saved to \(current.record.name), but the layer could not "
                            + "be switched on. Turn it on from Layers."
                    )
                )
                scheduleMarkOutcomeDismissal()
                return
            }
            markLocation.report(
                .marked(
                    layerName: current.record.name, accuracyM: fix.accuracyM, layerShown: layerShown
                )
            )
        }
        scheduleMarkOutcomeDismissal()
    }

    /// The mark outcomes that stay up until the reader takes them down: a
    /// refusal is a decision to make in Settings, and a five-second timer
    /// took the button away before an assistive-technology reader reached
    /// it. Every other outcome describes a finished attempt, and expires.
    static func markOutcomeStaysUntilDismissed(_ outcome: MarkLocation.Outcome) -> Bool {
        switch outcome {
        case .denied, .restricted, .servicesOff: true
        default: false
        }
    }

    /// Called when an attempt begins: a timer set by the last outcome must
    /// not take this attempt's down, however the two interleave.
    private func beginMarkAttempt() {
        markOutcomeGeneration += 1
    }

    private func scheduleMarkOutcomeDismissal() {
        // Counted rather than compared: two equal outcomes five seconds apart
        // would let the first timer take the second one down early.
        markOutcomeGeneration += 1
        let mine = markOutcomeGeneration
        if let outcome = markLocation.outcome, Self.markOutcomeStaysUntilDismissed(outcome) {
            return
        }
        Task {
            try? await Task.sleep(for: .seconds(5))
            if markOutcomeGeneration == mine {
                markLocation.clearOutcome()
            }
        }
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

    /// An Edit tap. Every intent advances the generation, so a layer that
    /// finishes loading after a newer tap, or after Done, does not open.
    private func requestEdit(_ row: UserVectorsViewModel.Row) {
        editLoadGeneration += 1
        let mine = editLoadGeneration
        // A layer whose geometry has not loaded yet is loaded first: a
        // session begun on an empty working copy would persist that
        // emptiness over the stored features on its first commit.
        guard row.parsed == nil else {
            beginEditing(row)
            return
        }
        Task {
            guard let loaded = await userVectorsVM.loadedRow(id: row.id) else { return }
            // A newer intent, or a session begun meanwhile, outranks this
            // load: ending that session from here would drop its partial
            // draft without the alert the panel gives.
            guard mine == editLoadGeneration, editSession == nil else { return }
            beginEditing(loaded)
        }
    }

    private func beginEditing(_ row: UserVectorsViewModel.Row) {
        guard row.parsed != nil || row.record.featureCount == 0 else { return }
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
        refreshParcelSnap()
        // A callout and an editing panel would be two cards over the same map.
        vectorCallout = nil
        // The layer panel would cover the ground being drawn on.
        isLayersMenuExpanded = false
    }

    /// The handles for whichever feature is selected, or none.
    private func selectionHandles() -> VectorSelectionHandles? {
        // None while Done drains: an attachment landing meanwhile changes the
        // geometry, and that observer must not put the handles back over a
        // session that refuses every move. They return if Done fails.
        guard let session = editSession, !session.isEnding, let feature = session.selectedFeature
        else { return nil }
        return VectorSelectionHandles(
            feature: feature, colorHex: session.record?.colorHex ?? "#d55e00"
        )
    }

    private func moveHandle() -> VectorMoveHandle? {
        guard let session = editSession, !session.isEnding, let feature = session.selectedFeature
        else { return nil }
        // A lone point has one handle, its own: a second one on the same
        // spot hid the first and, being the move handle, skipped snapping.
        guard VectorSelectionHandles.corners(of: feature).count != 1 else { return nil }
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
            let hit = snapHit(at: latitude, longitude: longitude)
            if let hit {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                // In words as well: the tick alone left a snap onto an
                // existing point looking like a tap that did nothing.
                session.noteSnap(hit)
            }
            session.handleTap(
                latitude: hit?.point.lat ?? latitude,
                longitude: hit?.point.lng ?? longitude,
                parcelSnap: hit?.source == .parcel
            )
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
            if let id = hit?.id {
                session.erase(featureID: id)
            } else {
                session.noteEraseMiss()
            }
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

/// A finished recording on its way into the save dialog. Identifiable for
/// `.sheet(item:)`.
private struct SaveTrackPayload: Identifiable {
    let id = UUID()
    let result: TrackRecording.StopResult
}

/// Photos the user picked for bulk EXIF placement, waiting on the confirm
/// sheet. Identifiable for `.sheet(item:)`.
private struct BulkPlacementDraft: Identifiable {
    let id = UUID()
    var rows: [BulkPhotoPlacement.Row]
    var names: [String: String]
    var payloads: [String: UserVectorsViewModel.PhotoPlacement]
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
    /// A spinner in place of the glyph, for the span between a tap and its
    /// answer.
    var isBusy = false

    /// Scaled with the reader's type size, capped by the metric's own curve:
    /// the control grows enough to match large text without the rail
    /// swallowing the map.
    @ScaledMetric(relativeTo: .title3) private var glyphSize: CGFloat = 18
    @ScaledMetric(relativeTo: .title3) private var scaledDiameter: CGFloat = 44

    /// Scales up with large text, never down: 44 points is the floor for a
    /// control, whatever the text size.
    private var diameter: CGFloat { max(44, scaledDiameter) }

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: glyphSize, weight: .semibold))
            .foregroundStyle(isActive ? Color.white : tint)
            .opacity(isBusy ? 0 : 1)
            .overlay {
                if isBusy {
                    ProgressView()
                        .tint(isActive ? Color.white : tint)
                }
            }
            .frame(width: diameter, height: diameter)
            .background(isActive ? Color.blue : Color.primary.opacity(0.001))
            .background(.regularMaterial)
            .clipShape(Circle())
            .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
    }
}

/// The location button's glyph: idle, searching, following, heading-up.
///
/// The states Maps taught every iPhone user, so the same button reads the
/// same way here. Its own leaf view so the container's body is not
/// re-evaluated for a state only this glyph draws.
private struct LocationButtonIcon: View {
    let controller: MapController

    var body: some View {
        switch controller.userTrackingState {
        case .idle:
            // "Not following" rather than "Off": after a pan the dot is still
            // on the map and still updating; only the following stopped.
            MapControlIcon(systemName: "location")
                .accessibilityValue("Not following")
        case .searching:
            MapControlIcon(systemName: "location", isBusy: true)
                .accessibilityValue("Finding your location")
        case .following:
            MapControlIcon(systemName: "location.fill", isActive: true)
                .accessibilityValue("Following")
        case .heading:
            MapControlIcon(systemName: "location.north.line.fill", isActive: true)
                .accessibilityValue("Following, heading up")
        }
    }
}

private extension View {
    /// Reports how much of the bottom of the map this card covers, so the
    /// location button centres the dot in the part of the map the reader can
    /// see. Applied outside the padding above the source strip, because the
    /// strip is covered ground too.
    func coversMapBottom(
        _ card: MapController.BottomCard, on controller: MapController
    ) -> some View {
        self
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                controller.setBottomCardHeight($0, for: card)
            }
            .onDisappear { controller.setBottomCardHeight(0, for: card) }
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
                controller.animatesLocate = !reduceMotion
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
