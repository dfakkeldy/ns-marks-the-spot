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
    @State private var isLayersMenuExpanded = false
    @State private var mapHeading: Double = 0
    @State private var isSelectingSaveArea = false

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
                        TransparencySliderView(viewModel: overlayVM, isExpanded: $isLayersMenuExpanded)
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

                        ParcelInspectorView(inspection: inspection) {
                            overlayVM.clearParcelSelection()
                        }
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
        .animation(.spring(response: 0.35, dampingFraction: 0.9), value: overlayVM.inspection)
        .onAppear {
            controller.events = { event in
                switch event {
                case .headingChanged(let heading):
                    mapHeading = heading
                case .annotationSelected(let annotationID):
                    if let poi = poiVM.points.first(where: { $0.id == annotationID }) {
                        navigationModel.activeSheet = .poiDetail(poi)
                    }
                case .boundsSelected(let bounds):
                    finishBoundsSelection(with: bounds)
                case .visibleRegionSettled:
                    // Leaflet's `moveend`: the viewport layers ask their
                    // services what is in the view the user actually stopped
                    // on, not the ones they panned through.
                    featureVM.refreshAll()
                case .mapTapped(let latitude, let longitude):
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
        .onChange(of: navigationModel.activeSheet) { _, newValue in
            if newValue != nil {
                cancelBoundsSelection()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase != .active {
                cancelBoundsSelection()
            }
        }
        .onDisappear {
            cancelBoundsSelection()
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
            }
        }
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
