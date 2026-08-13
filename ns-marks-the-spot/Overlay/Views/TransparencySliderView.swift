import GeoCore
import MapCatalog
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
                    ForEach(viewModel.rows) { row in
                        LayerRowView(row: row, viewModel: viewModel)
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
        .sheet(isPresented: Binding(
            get: { viewModel.isShowingLicenceSheet },
            set: { if !$0 { viewModel.dismissLicenceSheet() } }
        )) {
            ProvinceLicenceSheetView(
                layerName: viewModel.licencePromptedLayerName ?? "This layer",
                onAccept: { viewModel.acceptProvinceLicence() },
                onDecline: { viewModel.declineProvinceLicence() }
            )
        }
    }
}

private struct LayerRowView: View {
    let row: LayerRow
    let viewModel: OverlayViewModel

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: LayerRowView.icon(for: row.descriptor.id))
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(row.isVisible ? .blue : .secondary)
                    .frame(width: 28, height: 28)
                    .background(row.isVisible ? Color.blue.opacity(0.15) : Color.primary.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(row.isAvailable ? .primary : .secondary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.9)

                    Text(status)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if row.needsLicence, row.isAvailable {
                    // A lock rather than a disabled switch: the layer is not
                    // unavailable, it is one decision away, and tapping has to
                    // lead somewhere.
                    Button {
                        viewModel.toggleVisibility(row.id)
                    } label: {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(row.name) licence required")
                } else {
                    Toggle("", isOn: Binding(
                        get: { row.isVisible },
                        set: { _ in
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                viewModel.toggleVisibility(row.id)
                            }
                        }
                    ))
                    .labelsHidden()
                    .toggleStyle(SwitchToggleStyle(tint: .blue))
                    .fixedSize()
                    .disabled(!row.isAvailable)
                    .accessibilityLabel("\(row.name) visibility")
                    .accessibilityValue(row.isVisible ? "On" : "Off")
                }
            }

            if row.isVisible {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Opacity")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("\(Int(row.opacity * 100))%")
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }

                    Slider(value: Binding(
                        get: { row.opacity },
                        set: { viewModel.updateLayerOpacity(for: row.id, to: $0) }
                    ), in: 0...1)
                    .tint(.blue)
                    .accessibilityLabel("\(row.name) opacity")
                    .accessibilityValue("\(Int(row.opacity * 100))%")
                }
                .padding(.leading, 40)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.vertical, 4)
    }

    /// What the row says under the layer's name.
    ///
    /// Availability first, because it decides whether anything else on the row
    /// can happen. The caveat is the catalog's own sentence, so the two surfaces
    /// describe a layer the same way.
    private var status: String {
        if !row.isAvailable {
            switch row.descriptor.availability {
            case .rightsPending:
                return "Rights pending · not yet displayed"
            case .hostingPending:
                return "Not hosted in this build"
            case .available:
                // Available in the catalog, absent from the map: an address
                // this build does not have. Fletcher is the one that reaches
                // here today.
                return "Not configured in this build"
            }
        }
        if row.needsLicence {
            return "Province licence required"
        }
        return NativeLayerTraits.caveat(for: row.descriptor)
    }

    private static func icon(for id: LayerID) -> String {
        switch id {
        case .fletcher, .churchInverness, .churchVictoria, .churchRichmond, .churchCapeBreton:
            return "map.fill"
        case .nsprd:
            return "square.dashed"
        case .crownLands:
            return "leaf.fill"
        case .floodRisk, .publishedRiverFloodZones, .coastalFloodCurrent,
             .coastalFlood2050, .coastalFlood2100:
            return "drop.triangle.fill"
        case .waterfalls, .waterFeatures:
            return "drop.circle.fill"
        case .nsAerial:
            return "photo.fill"
        case .roads, .mainRoads:
            return "road.lanes"
        case .buildings:
            return "building.2.fill"
        case .contours:
            return "mountain.2.fill"
        case .placeNames:
            return "textformat"
        case .arsenicRiskWells, .uraniumRiskWells, .manganeseRiskWells,
             .surficialAquifers:
            return "testtube.2"
        case .mineralTenure:
            return "diamond.fill"
        default:
            return "square.3.stack.3d"
        }
    }
}
