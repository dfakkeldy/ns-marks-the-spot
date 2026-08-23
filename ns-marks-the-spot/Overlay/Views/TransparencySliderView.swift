import GeoCore
import MapCatalog
import NSDataServices
import SwiftUI
import UniformTypeIdentifiers

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
    /// Opens the editor on one of the user's layers.
    var onEditLayer: ((UserVectorsViewModel.Row) -> Void)?
    /// Starts an empty layer to draw into.
    var onNewDrawingLayer: (() -> Void)?
    @Binding var isExpanded: Bool

    /// Which sections are open.
    ///
    /// Background Maps alone, as the browser opens: opening every section that
    /// is drawing something would be a scroll of thirty switches, which is the
    /// thing the sections exist to avoid. What is on inside a closed section is
    /// on the heading beside it.
    @State private var expandedCategories: Set<LayerCategoryID> = [.backgroundMaps]
    @State private var isImportingUserFile = false

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

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 8) {
                    ForEach(viewModel.sections(addedMapCount: addedMapCount)) { section in
                        LayerSectionView(
                            section: section,
                            viewModel: viewModel,
                            isExpanded: Binding(
                                get: { expandedCategories.contains(section.category) },
                                set: { open in
                                    if open {
                                        expandedCategories.insert(section.category)
                                    } else {
                                        expandedCategories.remove(section.category)
                                    }
                                }
                            ),
                            controls: { controls(for: section.category) }
                        )
                    }
                }
            }
            // No cap of its own: the caller sizes the card off the screen, and
            // a second fixed limit here would leave ten sections scrolling
            // inside half a panel on a phone that has room for all of them.
            .frame(maxHeight: .infinity)
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

    /// How many of the user's own maps and layers the panel is carrying, which
    /// is the whole of what the My Maps heading has to count.
    private var addedMapCount: Int {
        (userMaps?.rows.count ?? 0) + (userVectors?.rows.count ?? 0)
    }

    /// What a section holds besides its layer rows.
    ///
    /// Three of the ten carry a control the catalog knows nothing about: the
    /// base map beneath the overlays, the tax-sale switch and the record modes
    /// it governs, and the user's own imports. Each sits in the section named
    /// for it, which is where the browser puts it and where a reader looks.
    @ViewBuilder
    private func controls(for category: LayerCategoryID) -> some View {
        switch category {
        case .backgroundMaps:
            baseMapPicker
        case .taxSale:
            taxSaleControls
        case .myMaps:
            myMapsControls
        default:
            EmptyView()
        }
    }

    // A menu rather than five segments: in a 300-point panel each segment gets
    // about 50 points, and "Satellite" and "NS Aerial" both truncate to an
    // ellipsis. Which map is underneath is the one thing this control is for.
    private var baseMapPicker: some View {
        HStack {
            Text("Base Map Style")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)

            Spacer()

            Picker("Base Map Style", selection: Binding(
                get: { viewModel.baseMapType },
                set: { viewModel.setBaseMapType($0) }
            )) {
                ForEach(MapBaseType.allCases) { type in
                    Text(type.rawValue).tag(type)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .accessibilityIdentifier("base-map-style")
        }
    }

    @ViewBuilder
    private var taxSaleControls: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(
                get: { viewModel.showsTaxSale },
                set: { viewModel.setTaxSaleEnabled($0) }
            )) {
                Text("Show tax-sale information")
                    .font(.caption)
                    .fontWeight(.semibold)
            }
            .toggleStyle(.switch)
            .accessibilityIdentifier("tax-sale-enabled")

            Text(
                "Off by default. This is a map of Nova Scotia; tax-sale "
                    + "notices and records are one thing it can show."
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }

        // The record modes decide what every tax-sale colour on the map means,
        // so they belong beside the switch that decides whether those colours
        // are drawn at all rather than inside a sheet the reader may never open.
        if viewModel.offersRecordModes {
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
    }

    @ViewBuilder
    private var myMapsControls: some View {
        // One Import for the section, the way the browser has it. Each list
        // used to carry its own, and both opened the same picker with the same
        // file types and handed the result to the same router: side by side in
        // one section they read as two operations when there is only one.
        if userMaps != nil || userVectors != nil {
            HStack {
                if let onNewDrawingLayer {
                    Button(action: onNewDrawingLayer) {
                        Label("Draw", systemImage: "pencil.and.outline")
                            .font(.caption)
                    }
                }

                Spacer()

                Button {
                    isImportingUserFile = true
                } label: {
                    Label("Import", systemImage: "plus")
                        .font(.caption)
                }
                .accessibilityIdentifier("import-user-file")
            }
            .fileImporter(
                isPresented: $isImportingUserFile,
                allowedContentTypes: UserFileImport.contentTypes,
                allowsMultipleSelection: true
            ) { result in
                guard case .success(let urls) = result else { return }
                Task { await UserFileImport.load(urls, maps: userMaps, vectors: userVectors) }
            }
        }

        if let userMaps {
            UserMapRowsView(viewModel: userMaps)
        }

        if let userVectors {
            UserVectorRowsView(
                viewModel: userVectors,
                onZoom: onZoomToLayer,
                onEdit: onEditLayer
            )
        }
    }
}

private struct LayerSectionView<Controls: View>: View {
    let section: LayerSection
    let viewModel: OverlayViewModel
    @Binding var isExpanded: Bool
    private let controls: () -> Controls

    init(
        section: LayerSection,
        viewModel: OverlayViewModel,
        isExpanded: Binding<Bool>,
        @ViewBuilder controls: @escaping () -> Controls
    ) {
        self.section = section
        self.viewModel = viewModel
        _isExpanded = isExpanded
        self.controls = controls
    }

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 16) {
                // The browser shows this line once the section is open, and it
                // is the only place a reader is told what the heading covers.
                Text(section.detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)

                controls()

                ForEach(section.rows) { row in
                    LayerRowView(row: row, viewModel: viewModel)
                }

                // Under the toggles, where the web puts it: the reader who
                // needs this sentence is the one who has just switched a layer
                // on and got a blank map back.
                ForEach(section.notes, id: \.self) { note in
                    Text(note)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.top, 8)
        } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(section.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.primary)

                // Two lines when the section has two things to say about
                // itself, and both of them start at the heading's left edge.
                Text(section.summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(section.title), \(section.summary)")
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
                // Beside the source link, as the web puts it. The download
                // page hands over the database; this is where the source says
                // what its own accuracy bands mean, which is what a reader
                // needs before deciding whether a hollow well marker is a
                // location or a report about an area.
                if let manualURL = descriptor.manualURL {
                    Link("Accuracy definitions", destination: manualURL)
                        .font(.caption2)
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
                        HStack(spacing: 8) {
                            RuntimeChip(status: runtime)
                            // A source that failed on one bar of signal is
                            // usually fine a minute later. Without this the way
                            // back is switching the layer off and on, which
                            // nobody guesses, and the layer reads as broken
                            // when it was the moment that was.
                            if runtime.emphasis == .broken, row.hasOpacityControl {
                                Button("Retry tiles") { viewModel.retryTiles(for: row.id) }
                                    .font(.caption2.weight(.medium))
                                    .buttonStyle(.plain)
                                    .foregroundStyle(.blue)
                                    .accessibilityLabel("Retry \(row.name) tiles")
                                    .accessibilityIdentifier("retry-tiles-\(row.id)")
                            }
                        }
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

            if row.isVisible, row.descriptor.id == .nsWellLogs {
                WellAccuracyFilterControl(
                    value: viewModel.wellAccuracyFilter,
                    onChange: { viewModel.setWellAccuracyFilter($0) }
                )
                .padding(.leading, 40)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if row.isVisible {
                LayerLegends.view(for: row.descriptor)
                    .padding(.leading, 40)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity.combined(with: .move(edge: .top)))
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


/// The dot as the map draws it, so the legend cannot describe a marker the user
/// is not looking at.
///
/// Rendered from the same style the layer uses rather than redrawn by hand:
/// the whole claim of a legend is that these two are the same picture.
private struct WellAccuracySwatch: View {
    let accuracy: WellLogOverlay.Accuracy

    var body: some View {
        Image(uiImage: FeatureMarkerImage.image(for: VectorFeatureStyles.wellLog(accuracy)))
            .accessibilityHidden(true)
    }
}

/// Which well records the layer asks for.
///
/// Two choices rather than a switch per accuracy band, as on the web: the
/// distinction that matters is between a record located tightly enough to read
/// as a point and one that is a report from an area. Surveyed is the default
/// because it is the only band that can be read as a location, so seeing the
/// rest is something the user asks for.
private struct WellAccuracyFilterControl: View {
    let value: WellLogOverlay.AccuracyFilter
    var onChange: (WellLogOverlay.AccuracyFilter) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Picker("Well location accuracy", selection: Binding(
                get: { value },
                set: { onChange($0) }
            )) {
                Text("Surveyed only").tag(WellLogOverlay.AccuracyFilter.surveyed)
                Text("Include approximate").tag(WellLogOverlay.AccuracyFilter.all)
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("Well location accuracy")

            // The web's legend, bands and all. The marker is the only thing on
            // the map carrying how well a location is known, so a user who
            // cannot read the marker is reading every one of these records as
            // though it were a surveyed position — and four of the five bands
            // are not. The note is the sentence that says so outright.
            Text("Marker = how well the location is known")
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
            ForEach(WellLogOverlay.accuracyBands, id: \.accuracy) { band in
                HStack(spacing: 6) {
                    WellAccuracySwatch(accuracy: band.accuracy)
                    Text(band.label)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Text(
                "Only surveyed wells are drawn as solid points. Hollow markers "
                + "report that a well exists somewhere nearby, not where it is."
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}
