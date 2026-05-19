import SwiftUI

struct MapContainerView: View {
    let engine: any MapEngine
    @StateObject private var overlayVM: OverlayViewModel
    @ObservedObject private var poiVM: POIViewModel
    @State private var selectedPOI: PointOfInterest?

    init(engine: any MapEngine, poiViewModel: POIViewModel) {
        self.engine = engine
        self.poiVM = poiViewModel
        _overlayVM = StateObject(wrappedValue: OverlayViewModel(engine: engine))
    }

    var body: some View {
        ZStack {
            engine.makeMapView()
                .ignoresSafeArea()

            VStack {
                HStack {
                    Spacer()
                    Button {
                        engine.showsUserLocation = true
                        engine.centerOnUserLocation()
                    } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.blue)
                            .frame(width: 44, height: 44)
                            .background(.regularMaterial, in: Circle())
                    }
                    .padding(.trailing, 12)
                    .padding(.top, 60)
                    .accessibilityLabel("Current Location")
                }
                Spacer()
                TransparencySliderView(viewModel: overlayVM)
            }
        }
        .onAppear {
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
    }
}
