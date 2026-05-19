import SwiftUI

struct TransparencySliderView: View {
    @ObservedObject var viewModel: OverlayViewModel

    var body: some View {
        VStack(spacing: 12) {
            ForEach(viewModel.layers, id: \.id) { layer in
                HStack {
                    Toggle(isOn: Binding(
                        get: { layer.isVisible },
                        set: { _ in viewModel.toggleVisibility(layer.id) }
                    )) {
                        Text(layer.name)
                            .font(.subheadline)
                            .foregroundStyle(viewModel.selectedLayerId == layer.id ? .primary : .secondary)
                    }
                    if viewModel.selectedLayerId == layer.id {
                        Image(systemName: "circle.fill")
                            .font(.system(size: 6))
                            .foregroundStyle(.blue)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    viewModel.selectLayer(layer.id)
                }
            }

            HStack {
                Text("Opacity")
                    .font(.caption)
                Slider(value: Binding(
                    get: { viewModel.opacity },
                    set: { viewModel.updateOpacity($0) }
                ), in: 0...1)
                .accessibilityLabel("Overlay opacity")
                .accessibilityValue("\(Int(viewModel.opacity * 100))%")
                Text("\(Int(viewModel.opacity * 100))%")
                    .font(.caption)
                    .monospacedDigit()
                    .accessibilityHidden(true)
            }
        }
        .padding()
        .background(.thinMaterial)
        .cornerRadius(12)
        .padding()
    }
}
