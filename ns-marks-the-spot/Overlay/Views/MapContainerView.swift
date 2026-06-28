import SwiftUI

struct MapContainerView: View {
    @Environment(\.scenePhase) private var scenePhase

    let engine: any MapEngine
    @StateObject private var overlayVM: OverlayViewModel
    @ObservedObject private var poiVM: POIViewModel
    @ObservedObject private var offlineVM: OfflineAreasViewModel
    @State private var selectedPOI: PointOfInterest?
    @State private var isLayersMenuExpanded = false
    @State private var isOfflineStoragePresented = false
    @State private var mapHeading: Double = 0
    @State private var selectedSaveBounds: MapBounds?
    @State private var isSaveAreaDraftPresented = false
    @State private var isSelectingSaveArea = false
    @State private var isInfoPresented = false

    init(
        engine: any MapEngine,
        poiViewModel: POIViewModel,
        offlineAreasViewModel: OfflineAreasViewModel
    ) {
        self.engine = engine
        self.poiVM = poiViewModel
        self.offlineVM = offlineAreasViewModel
        _overlayVM = StateObject(wrappedValue: OverlayViewModel(engine: engine))
    }

    var body: some View {
        ZStack {
            engine.makeMapView()
                .ignoresSafeArea()

            VStack {
                HStack(alignment: .top, spacing: 12) {
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
                                    engine.resetHeading()
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
                            engine.showsUserLocation = true
                            engine.centerOnUserLocation()
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
                            isOfflineStoragePresented = true
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

                        Button {
                            cancelBoundsSelection()
                            isInfoPresented = true
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
        }
        .onAppear {
            engine.headingChangeHandler = { heading in
                self.mapHeading = heading
            }
            if let firstLayer = engine.layers.first {
                overlayVM.selectLayer(firstLayer.id)
            }
            engine.setAnnotationSelectionHandler { annotationID in
                selectedPOI = poiVM.points.first { $0.id == annotationID }
            }
            poiVM.loadMockData()
            poiVM.syncAnnotations(to: engine)
            Task {
                await poiVM.fetchRemoteWaterfalls(engine: engine)
            }
        }
        .onChange(of: selectedPOI) { _, newValue in
            if newValue != nil {
                cancelBoundsSelection()
            }
        }
        .onChange(of: isOfflineStoragePresented) { _, isPresented in
            if isPresented {
                cancelBoundsSelection()
            }
        }
        .onChange(of: isInfoPresented) { _, isPresented in
            if isPresented {
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
        .sheet(item: $selectedPOI) { poi in
            POIDetailView(poi: poi)
        }
        .sheet(isPresented: $isOfflineStoragePresented) {
            OfflineStorageView(viewModel: offlineVM)
        }
        .sheet(isPresented: $isInfoPresented) {
            InfoSheetView()
        }
        .sheet(
            isPresented: $isSaveAreaDraftPresented,
            onDismiss: {
                selectedSaveBounds = nil
            }
        ) {
            if let selectedSaveBounds {
                NavigationStack {
                    SaveAreaDraftView(
                        viewModel: offlineVM,
                        bounds: selectedSaveBounds
                    )
                }
            }
        }
    }

    private func beginSaveAreaSelection() {
        guard !isSelectingSaveArea else { return }

        isSelectingSaveArea = true
        engine.beginBoundsSelection { bounds in
            finishBoundsSelection(with: bounds)
        }
    }

    private func finishBoundsSelection(with bounds: MapBounds) {
        isSelectingSaveArea = false
        selectedSaveBounds = bounds.normalized
        isSaveAreaDraftPresented = true
    }

    private func cancelBoundsSelection() {
        guard isSelectingSaveArea else { return }

        engine.endBoundsSelection()
        isSelectingSaveArea = false
    }
}
