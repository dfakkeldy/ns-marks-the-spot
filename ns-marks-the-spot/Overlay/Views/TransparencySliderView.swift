import SwiftUI

struct TransparencySliderView: View {
    @ObservedObject var viewModel: OverlayViewModel

    var body: some View {
        HStack {
            Text("Opacity")
                .font(.caption)
            Slider(value: Binding(
                get: { viewModel.opacity },
                set: { viewModel.updateOpacity($0) }
            ), in: 0...1)
            Text("\(Int(viewModel.opacity * 100))%")
                .font(.caption)
                .monospacedDigit()
        }
        .padding()
        .background(.thinMaterial)
        .cornerRadius(12)
        .padding()
    }
}
