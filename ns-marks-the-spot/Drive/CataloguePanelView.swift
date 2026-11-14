import GeoCore
import SwiftUI
import UniformTypeIdentifiers

private struct CatalogueEditRoute: Identifiable {
    enum Mode: Equatable { case add, order }
    let catalogueID: String
    let mode: Mode
    var id: String { "\(catalogueID)-\(mode)" }
}

struct CataloguePanelView: View {
    @Bindable var viewModel: DriveCataloguesViewModel
    @Bindable var maps: UserMapsViewModel
    var vectors: UserVectorsViewModel?
    @State private var newName = ""
    @State private var naming = false
    @State private var importing = false
    @State private var editing: CatalogueEditRoute?
    @State private var renaming: DriveCatalogue?
    @State private var renameText = ""
    @State private var deleting: DriveCatalogue?
    @State private var deletingTrip: CoverageTrip?
    @State private var sharing: SharePayload?
    @State private var shareError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Catalogues").font(.caption).fontWeight(.semibold)
                Spacer()
                Button("New", systemImage: "plus") { newName = ""; naming = true }
                    .frame(minHeight: 44)
                    .disabled(!viewModel.canEdit || maps.isLibrarySealed)
            }
            if let error = viewModel.error { Text(error).font(.caption).foregroundStyle(.orange) }
            if let shareError { Text(shareError).font(.caption).foregroundStyle(.orange) }
            ForEach(viewModel.catalogues) { catalogue in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Button {
                            viewModel.select(catalogue.id)
                        } label: {
                            Label(catalogue.name, systemImage: viewModel.ui.loadedCatalogueID == catalogue.id ? "largecircle.fill.circle" : "circle")
                                .frame(minHeight: 44, alignment: .leading)
                        }
                        .accessibilityAddTraits(viewModel.ui.loadedCatalogueID == catalogue.id ? .isSelected : [])
                        Spacer()
                        Text("\(catalogue.sheetIDs.count) \(catalogue.sheetIDs.count == 1 ? "sheet" : "sheets")").font(.caption).foregroundStyle(.secondary)
                        Menu {
                            Button("Rename") { renameText = catalogue.name; renaming = catalogue }.disabled(!viewModel.canEdit)
                            if viewModel.ui.loadedCatalogueID == catalogue.id {
                                Toggle("Auto activation", isOn: Binding(get: { viewModel.ui.autoActivate }, set: { viewModel.setAuto($0) }))
                            }
                            Button("Delete catalogue", role: .destructive) { deleting = catalogue }.disabled(!viewModel.canEdit)
                        } label: { Image(systemName: "ellipsis.circle").frame(width: 44, height: 44) }
                            .accessibilityLabel("Options for \(catalogue.name)")
                    }
                    HStack {
                        Button("Add sheets") { editing = .init(catalogueID: catalogue.id, mode: .add) }
                            .accessibilityLabel("Add sheets to \(catalogue.name)")
                        Button("Order") { editing = .init(catalogueID: catalogue.id, mode: .order) }
                            .accessibilityLabel("Order sheets in \(catalogue.name)")
                            .disabled(catalogue.sheetIDs.isEmpty)
                    }.disabled(!viewModel.canEdit || maps.isLibrarySealed)
                    if viewModel.ui.loadedCatalogueID == catalogue.id {
                        Text(viewModel.ui.autoActivate ? "Loaded · Auto on" : "Loaded · Auto off").font(.caption).foregroundStyle(.secondary)
                        HStack {
                            Text("Auto sheet opacity").font(.caption).accessibilityHidden(true)
                            Slider(value: Binding(get: { viewModel.opacity(for: catalogue) }, set: { viewModel.previewOpacity($0, in: catalogue.id) }), in: 0...1) { editing in
                                if !editing { Task { await viewModel.finishOpacity(in: catalogue.id) } }
                            }
                            .accessibilityLabel("Sheet opacity for \(catalogue.name)")
                        }.disabled(!viewModel.canEdit)
                        if let vectors {
                            coverageSection(catalogue: catalogue, vectors: vectors)
                        }
                    }
                }
            }
        }
        .alert("New catalogue", isPresented: $naming) {
            TextField("Name", text: $newName)
            Button("Choose files") { importing = true }
                .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Cancel", role: .cancel) { }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.tiff, .png, .jpeg, .pdf], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            guard viewModel.canEdit, !maps.isLibrarySealed else { return }
            let name = newName
            Task {
                let confirmed = await UserFileImport.loadCatalogueSheets(urls, maps: maps)
                guard !confirmed.isEmpty else { viewModel.reportNoSheets(); return }
                await viewModel.create(name: name, sheetIDs: confirmed)
            }
        }
        .alert("Rename catalogue", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $renameText)
            Button("Save") { if let id = renaming?.id { Task { await viewModel.rename(id, to: renameText) } }; renaming = nil }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
        .confirmationDialog("Delete catalogue?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible, presenting: deleting) { item in
            Button("Delete catalogue", role: .destructive) { Task { await viewModel.delete(item.id) }; deleting = nil }
            Button("Cancel", role: .cancel) { deleting = nil }
        } message: { _ in Text("Your maps and recorded tracks stay on this device.") }
        .sheet(item: $editing) { item in CatalogueSheetsView(catalogueID: item.catalogueID, mode: item.mode, catalogues: viewModel, maps: maps) }
        .sheet(item: $sharing) { payload in ShareSheet(items: payload.items) }
        .confirmationDialog("Delete this trip?", isPresented: Binding(get: { deletingTrip != nil }, set: { if !$0 { deletingTrip = nil } }), titleVisibility: .visible, presenting: deletingTrip) { trip in
            Button("Delete trip", role: .destructive) {
                if let vectors { Task { for row in trip.rows { await vectors.delete(id: row.id) } } }
                deletingTrip = nil
            }
            Button("Cancel", role: .cancel) { deletingTrip = nil }
        } message: { _ in Text("The recorded track and its original fixes will be removed from this device.") }
    }

    private struct CoverageTrip: Identifiable {
        let id: String
        let rows: [UserVectorsViewModel.Row]
        var name: String { rows.first?.record.name ?? "Trip" }
        var distance: Double? {
            let values = rows.compactMap { row -> Double? in
                guard let value = row.record.coverage?.distanceM, value.isFinite, value >= 0 else { return nil }
                return value
            }
            return values.count == rows.count ? values.reduce(0, +) : nil
        }
    }

    @ViewBuilder private func coverageSection(catalogue: DriveCatalogue, vectors: UserVectorsViewModel) -> some View {
        let groups = Dictionary(grouping: vectors.trips(for: catalogue.id)) { $0.record.coverage?.tripID ?? "" }
        let trips = groups.map { CoverageTrip(id: $0.key, rows: $0.value) }.sorted {
            ($0.rows.first?.record.createdAt ?? .distantPast) > ($1.rows.first?.record.createdAt ?? .distantPast)
        }
        VStack(alignment: .leading, spacing: 8) {
            Toggle("Show coverage", isOn: Binding(get: { viewModel.ui.showCoverage }, set: { viewModel.setShowCoverage($0) }))
            if let refusal = vectors.lastRefusal { Text(refusal.userMessage).font(.caption).foregroundStyle(.orange) }
            ForEach(trips) { trip in
                VStack(alignment: .leading) {
                    Text(trip.name).font(.caption.weight(.semibold))
                    if trip.rows.contains(where: { $0.record.coverage?.wasInterrupted == true }) {
                        Text("Recovered after interruption").font(.caption).foregroundStyle(.secondary)
                    }
                    Text("\(trip.rows.count) \(trip.rows.count == 1 ? "leg" : "legs") · \(trip.distance.map { Geodesy.formatDistance($0) } ?? "Distance unavailable")").font(.caption)
                    HStack {
                        Button("GPX") { Task { await shareCoverage(catalogueID: catalogue.id, tripID: trip.id, vectors: vectors) } }
                            .accessibilityLabel("Export \(trip.name) as GPX")
                        Button("Delete", role: .destructive) { deletingTrip = trip }
                            .accessibilityLabel("Delete \(trip.name)")
                    }
                }
            }
            if !trips.isEmpty {
                Text("GPX exports include all received fixes, including fixes rejected from the displayed track.").font(.caption).foregroundStyle(.secondary)
                if trips.allSatisfy({ $0.distance != nil }) {
                    Text("Total driven: \(Geodesy.formatDistance(trips.compactMap(\.distance).reduce(0, +))) (not unique roads)").font(.caption)
                }
                Button("Export coverage") { Task { await shareCoverage(catalogueID: catalogue.id, tripID: nil, vectors: vectors) } }
            }
        }
    }

    private func shareCoverage(catalogueID: String, tripID: String?, vectors: UserVectorsViewModel) async {
        guard let gpx = await vectors.coverageGPX(catalogueID: catalogueID, tripID: tripID) else { return }
        let starts = vectors.trips(for: catalogueID).filter { $0.record.coverage?.tripID == tripID }.map { row in
            if case .recorded(let startedAt, _, _) = row.record.origin { return startedAt }
            return row.record.createdAt
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        let filename = starts.min().flatMap { date in tripID.map { "trip-\(formatter.string(from: date))-\($0.prefix(8)).gpx" } } ?? "coverage.gpx"
        sharing = SharePayload(text: gpx, filename: filename)
        shareError = sharing == nil ? "The GPX file could not be prepared. Your tracks remain on this device." : nil
    }
}

private struct CatalogueSheetsView: View {
    let catalogueID: String
    let mode: CatalogueEditRoute.Mode
    @Bindable var catalogues: DriveCataloguesViewModel
    @Bindable var maps: UserMapsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    private var catalogue: DriveCatalogue? { catalogues.catalogues.first { $0.id == catalogueID } }

    var body: some View {
        NavigationStack {
            List {
                if let catalogue {
                    if mode == .order { Section("Order") {
                        if catalogue.sheetIDs.isEmpty { Text("No sheets in this catalogue.").foregroundStyle(.secondary) }
                        ForEach(Array(catalogue.sheetIDs.enumerated()), id: \.element) { index, id in
                            let name = maps.rows.first(where: { $0.id == id })?.record.name ?? "Missing sheet"
                            HStack {
                                Text(name)
                                if maps.rows.first(where: { $0.id == id })?.needsGeoreferencing == true {
                                    Text("Not placed").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button("Up", systemImage: "chevron.up") { move(index, by: -1, ids: catalogue.sheetIDs) }
                                    .disabled(index == 0).buttonStyle(.borderless).labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                                    .accessibilityLabel("Move \(name) up")
                                Button("Down", systemImage: "chevron.down") { move(index, by: 1, ids: catalogue.sheetIDs) }
                                    .disabled(index == catalogue.sheetIDs.count - 1).buttonStyle(.borderless).labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                                    .accessibilityLabel("Move \(name) down")
                                Button("Remove", systemImage: "minus.circle") { Task { await catalogues.remove(id, from: catalogueID) } }
                                    .buttonStyle(.borderless).labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                                    .accessibilityLabel("Remove \(name) from catalogue")
                            }
                        }
                    } }
                    if mode == .add { Section("Add existing sheets") {
                        Button("Import files") { importing = true }
                        if maps.rows.filter({ maps.confirmedMapIDs.contains($0.id) && !catalogue.sheetIDs.contains($0.id) }).isEmpty {
                            Text("No saved sheets available to add.").foregroundStyle(.secondary)
                        }
                        ForEach(maps.rows.filter { maps.confirmedMapIDs.contains($0.id) && !catalogue.sheetIDs.contains($0.id) }) { row in
                            Button(row.record.name) { Task { await catalogues.add([row.id], to: catalogueID) } }
                        }
                    } }
                }
            }
            .disabled(!catalogues.canEdit || maps.isLibrarySealed)
            .navigationTitle(mode == .add ? "Add sheets" : "Order sheets")
            .toolbar { Button("Done") { dismiss() } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.tiff, .png, .jpeg, .pdf], allowsMultipleSelection: true) { result in
                guard case .success(let urls) = result else { return }
                guard catalogues.canEdit, !maps.isLibrarySealed else { return }
                Task {
                    let ids = await UserFileImport.loadCatalogueSheets(urls, maps: maps)
                    await catalogues.add(ids, to: catalogueID)
                }
            }
        }
    }
    private func move(_ index: Int, by delta: Int, ids: [String]) {
        guard ids.indices.contains(index) else { return }
        let sheetID = ids[index]
        Task { await catalogues.move(sheetID, in: catalogueID, by: delta) }
    }
}
