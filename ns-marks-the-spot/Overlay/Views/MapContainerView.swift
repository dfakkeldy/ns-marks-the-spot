import SwiftUI

struct MapContainerView: View {
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

                        Button {
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
                            engine.beginBoundsSelection { bounds in
                                selectedSaveBounds = bounds.normalized
                                isSaveAreaDraftPresented = true
                            }
                        } label: {
                            Image(systemName: "square.dashed")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.blue)
                                .frame(width: 44, height: 44)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .accessibilityLabel("Save Area")
                        
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
        .sheet(item: $selectedPOI) { poi in
            POIDetailView(poi: poi)
        }
        .sheet(isPresented: $isOfflineStoragePresented) {
            OfflineStorageView(viewModel: offlineVM)
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
}
