import SwiftUI

struct MapContainerView: View {
    let engine: any MapEngine
    @StateObject private var viewModel: OverlayViewModel

    init(engine: any MapEngine) {
        self.engine = engine
        _viewModel = StateObject(wrappedValue: OverlayViewModel(engine: engine))
    }

    var body: some View {
        ZStack {
            engine.makeMapView()
                .ignoresSafeArea()

            VStack {
                Spacer()
                TransparencySliderView(viewModel: viewModel)
            }
        }
        .onAppear {
            if let firstLayer = engine.layers.first {
                viewModel.selectLayer(firstLayer.id)
            }
        }
    }
}
