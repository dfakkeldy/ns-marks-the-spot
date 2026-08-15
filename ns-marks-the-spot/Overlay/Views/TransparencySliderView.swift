import GeoCore
import MapCatalog
import SwiftUI

struct TransparencySliderView: View {
    let viewModel: OverlayViewModel
    /// The user's own maps. Optional because they are a separate concern from
    /// the catalogued layers, and a panel shown without them (a preview, a
    /// test) should still be the same panel.
    var userMaps: UserMapsViewModel?
    /// The user's own vector layers, optional for the same reason.
    var userVectors: UserVectorsViewModel?
    /// Where to send the map when a row asks to be seen.
    var onZoomToLayer: ((GeoBoundingBox) -> Void)?
    @Binding var isExpanded: Bool

    /// Which sections are open. `nil` until the panel is first laid out, so the
    /// opening set can be chosen from what is actually on the map rather than
    /// guessed at before the layers are installed.
    @State private var expandedGroups: Set<LayerGroupID>?

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

            // Map Record Mode
            //
            // Kept beside the base map rather than inside the tax-sale sheet,
            // because it decides what every tax-sale colour on the map means and
            // a reader has to be able to see which mode they are in without
            // opening anything.
            if viewModel.offersRecordModes {
                Divider()
                    .background(.primary.opacity(0.1))

                VStack(alignment: .leading, spacing: 6) {
                    Text("Map Record Mode")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)

                    Picker("Map Record Mode", selection: Binding(
                        get: { viewModel.mapRecordMode },
                        set: { viewModel.setMapRecordMode($0) }
                    )) {
                        ForEach(HistoricalTaxSaleViewModel.Mode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("map-record-mode")

                    Text(viewModel.recordModeCaption)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Divider()
                .background(.primary.opacity(0.1))

            // Layers List
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 8) {
                    ForEach(viewModel.sections) { section in
                        LayerSectionView(
                            section: section,
                            viewModel: viewModel,
                            isExpanded: Binding(
                                get: { expandedGroups?.contains(section.group) ?? false },
                                set: { open in
                                    var groups = expandedGroups ?? []
                                    if open {
                                        groups.insert(section.group)
                                    } else {
                                        groups.remove(section.group)
                                    }
                                    expandedGroups = groups
                                }
                            )
                        )
                    }

                    if let userMaps {
                        Divider()
                            .background(.primary.opacity(0.1))
                        UserMapRowsView(viewModel: userMaps)
                    }

                    if let userVectors {
                        Divider()
                            .background(.primary.opacity(0.1))
                        UserVectorRowsView(viewModel: userVectors, onZoom: onZoomToLayer)
                    }
                }
            }
            .frame(maxHeight: 350)
        }
        .onAppear {
            guard expandedGroups == nil else { return }
            expandedGroups = Self.initiallyExpandedGroups(in: viewModel.sections)
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

    /// The sections the panel opens on: whichever ones are drawing something,
    /// plus the core layers.
    ///
    /// Opening everything would be a scroll of twenty-five switches, which is
    /// the thing the sections exist to avoid. Opening only `mapLayers` would
    /// hide the fact that Fletcher — the layer the app launches showing — is on,
    /// because it sits in its own section at the bottom.
    static func initiallyExpandedGroups(in sections: [LayerSection]) -> Set<LayerGroupID> {
        var groups = sections
            .filter { $0.visibleCount > 0 }
            .reduce(into: Set<LayerGroupID>()) { $0.insert($1.group) }
        groups.insert(.mapLayers)
        return groups
    }
}

private struct LayerSectionView: View {
    let section: LayerSection
    let viewModel: OverlayViewModel
    @Binding var isExpanded: Bool

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(spacing: 16) {
                ForEach(section.rows) { row in
                    LayerRowView(row: row, viewModel: viewModel)
                }
            }
            .padding(.top, 8)
        } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(section.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.primary)

                Text(section.subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(section.title), \(section.subtitle)")
        }
        .tint(.secondary)
        .padding(.vertical, 4)
    }
}

/// What the layer's tiles are doing, in the web panel's words.
///
/// A chip rather than another grey caption line, because it is the one part of
/// the row that changes while the user is looking at it. The colour carries the
/// same three readings the web's `.layer-runtime` classes do — working,
/// finished, broken — and nothing else, so a chip is never the only thing
/// saying something important.
private struct RuntimeChip: View {
    let status: LayerRuntimeStatus

    var body: some View {
        Text(status.label)
            .font(.caption2)
            .fontWeight(.medium)
            .foregroundStyle(tint)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12), in: Capsule())
            .accessibilityLabel("Status: \(status.label)")
    }

    private var tint: Color {
        switch status.emphasis {
        case .quiet: return .secondary
        case .working: return .blue
        case .ready: return .green
        case .broken: return .orange
        }
    }
}

/// Where the layer's data came from, how good it is, and how much of the
/// province it covers.
///
/// The web puts this under a "Source & scale" disclosure on every row, and the
/// native app has had it nowhere: the info sheet credits the source and repeats
/// the caveat, but never says the date, the scale, or the coverage. Those are
/// the three facts that decide what a reader may conclude from a layer, and
/// they belong beside the switch that turns it on rather than two taps away in
/// a sheet about licensing.
private struct LayerProvenanceDisclosure: View {
    let descriptor: LayerDescriptor
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 2) {
                line("Source date", descriptor.sourceDate)
                line("Scale", descriptor.scale)
                line("Coverage", descriptor.coverage)
                line("Zoom", "\(descriptor.minZoom)–\(descriptor.maxZoom)")

                if let sourceURL = descriptor.sourceURL {
                    Link("Official source", destination: sourceURL)
                        .font(.caption2)
                        .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
        } label: {
            Text("Source & scale")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .tint(.secondary)
        .accessibilityHint("Source date, scale, coverage and zoom range for \(descriptor.name)")
    }

    private func line(_ label: String, _ value: String) -> some View {
        Text("\(label): \(value)")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
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

                VStack(alignment: .leading, spacing: 3) {
                    Text(row.name)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(row.isAvailable ? .primary : .secondary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.9)

                    // Only for a layer that is on. The switch beside it already
                    // says "off", and twenty grey chips repeating it would bury
                    // the one row that is loading or has failed.
                    if row.isVisible, let runtime = row.runtime {
                        RuntimeChip(status: runtime)
                    }

                    Text(status)
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    LayerProvenanceDisclosure(descriptor: row.descriptor)
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

            if row.isVisible, row.hasOpacityControl {
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
