import SwiftUI

struct TransparencySliderView: View {
    let viewModel: OverlayViewModel
    @Binding var isExpanded: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Label("Map Layers", systemImage: "square.3.stack.3d")
                    .font(.headline)
                    .foregroundStyle(.primary)
                
                Spacer()
                
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        isExpanded = false
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(.secondary)
                        .symbolRenderingMode(.hierarchical)
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close layers menu")
            }
            
            Divider()
                .background(.primary.opacity(0.1))

            // Base Map Selector
            VStack(alignment: .leading, spacing: 6) {
                Text("Base Map Style")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                
                Picker("Base Map Style", selection: Binding(
                    get: { viewModel.baseMapType },
                    set: { viewModel.setBaseMapType($0) }
                )) {
                    ForEach(MapBaseType.allCases) { type in
                        Text(type.rawValue).tag(type)
                    }
                }
                .pickerStyle(.segmented)
            }

            Divider()
                .background(.primary.opacity(0.1))

            // Layers List
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    ForEach(viewModel.layers, id: \.id) { layer in
                        VStack(spacing: 8) {
                            HStack(spacing: 12) {
                                // Layer Icon
                                Image(systemName: iconForLayer(id: layer.id))
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundStyle(layer.isVisible ? .blue : .secondary)
                                    .frame(width: 28, height: 28)
                                    .background(layer.isVisible ? Color.blue.opacity(0.15) : Color.primary.opacity(0.05))
                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                                
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(layer.name)
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundStyle(.primary)
                                        .lineLimit(2)
                                        .minimumScaleFactor(0.9)

                                    Text(viewModel.offlineStatus(for: layer.id))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                
                                Spacer()
                                
                                // Visibility Toggle
                                Toggle("", isOn: Binding(
                                    get: { layer.isVisible },
                                    set: { _ in
                                        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                            viewModel.toggleVisibility(layer.id)
                                        }
                                    }
                                ))
                                .labelsHidden()
                                .toggleStyle(SwitchToggleStyle(tint: .blue))
                                .fixedSize()
                                .accessibilityLabel("\(layer.name) visibility")
                                .accessibilityValue(layer.isVisible ? "On" : "Off")
                            }
                            
                            // Expanded Opacity Control
                            if layer.isVisible {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text("Opacity")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                        Spacer()
                                        Text("\(Int(layer.opacity * 100))%")
                                            .font(.caption2)
                                            .monospacedDigit()
                                            .foregroundStyle(.secondary)
                                    }
                                    
                                    Slider(value: Binding(
                                        get: { layer.opacity },
                                        set: { viewModel.updateLayerOpacity(for: layer.id, to: $0) }
                                    ), in: 0...1)
                                    .tint(.blue)
                                    .accessibilityLabel("\(layer.name) opacity")
                                    .accessibilityValue("\(Int(layer.opacity * 100))%")
                                }
                                .padding(.leading, 40)
                                .transition(.opacity.combined(with: .move(edge: .top)))
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .frame(maxHeight: 350)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(.white.opacity(0.15), lineWidth: 1)
        )
    }

    private func iconForLayer(id: String) -> String {
        switch id {
        case "fletcher": return "map.fill"
        case "nsprd": return "square.dashed"
        case "crown-lands": return "leaf.fill"
        case "flood-risk": return "drop.triangle.fill"
        case "waterfalls": return "drop.circle.fill"
        default: return "square.3.stack.3d"
        }
    }
}
