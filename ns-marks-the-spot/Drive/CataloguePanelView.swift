import GeoCore
import SwiftUI

struct CataloguePanelView: View {
    @Bindable var viewModel: DriveCataloguesViewModel
    @Bindable var maps: UserMapsViewModel
    @State private var newName = ""
    @State private var naming = false
    @State private var importing = false
    @State private var editing: DriveCatalogue?
    @State private var renaming: DriveCatalogue?
    @State private var renameText = ""
    @State private var deleting: DriveCatalogue?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Catalogues").font(.caption).fontWeight(.semibold)
                Spacer()
                Button("New", systemImage: "plus") { newName = ""; naming = true }
                    .frame(minHeight: 44)
            }
            if let error = viewModel.error { Text(error).font(.caption).foregroundStyle(.orange) }
            ForEach(viewModel.catalogues) { catalogue in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Button {
                            viewModel.select(catalogue.id)
                        } label: {
                            Label(catalogue.name, systemImage: viewModel.ui.loadedCatalogueID == catalogue.id ? "largecircle.fill.circle" : "circle")
                                .frame(minHeight: 44, alignment: .leading)
                        }
                        Spacer()
                        Text("\(catalogue.sheetIDs.count) sheets").font(.caption).foregroundStyle(.secondary)
                        Menu {
                            Button("Add sheets or order") { editing = catalogue }
                            Button("Rename") { renameText = catalogue.name; renaming = catalogue }
                            if viewModel.ui.loadedCatalogueID == catalogue.id {
                                Toggle("Auto activation", isOn: Binding(get: { viewModel.ui.autoActivate }, set: { viewModel.setAuto($0) }))
                            }
                            Button("Delete catalogue", role: .destructive) { deleting = catalogue }
                        } label: { Image(systemName: "ellipsis.circle").frame(width: 44, height: 44) }
                    }
                    if viewModel.ui.loadedCatalogueID == catalogue.id {
                        Text(viewModel.ui.autoActivate ? "Loaded · Auto on" : "Loaded · Auto off").font(.caption).foregroundStyle(.secondary)
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
        .fileImporter(isPresented: $importing, allowedContentTypes: UserFileImport.contentTypes, allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            let name = newName
            Task {
                let sorted = urls.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
                let ids = await UserFileImport.load(sorted, maps: maps, vectors: nil)
                await viewModel.create(name: name, sheetIDs: ids.filter { maps.confirmedMapIDs.contains($0) })
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
        .sheet(item: $editing) { item in CatalogueSheetsView(catalogueID: item.id, catalogues: viewModel, maps: maps) }
    }
}

private struct CatalogueSheetsView: View {
    let catalogueID: String
    @Bindable var catalogues: DriveCataloguesViewModel
    @Bindable var maps: UserMapsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    private var catalogue: DriveCatalogue? { catalogues.catalogues.first { $0.id == catalogueID } }

    var body: some View {
        NavigationStack {
            List {
                if let catalogue {
                    Section("Order") {
                        ForEach(Array(catalogue.sheetIDs.enumerated()), id: \.element) { index, id in
                            HStack {
                                Text(maps.rows.first(where: { $0.id == id })?.record.name ?? "Missing sheet")
                                if maps.rows.first(where: { $0.id == id })?.needsGeoreferencing == true {
                                    Text("Not placed").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button("Up", systemImage: "chevron.up") { move(index, by: -1, ids: catalogue.sheetIDs) }
                                    .disabled(index == 0).buttonStyle(.borderless).labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                                Button("Down", systemImage: "chevron.down") { move(index, by: 1, ids: catalogue.sheetIDs) }
                                    .disabled(index == catalogue.sheetIDs.count - 1).buttonStyle(.borderless).labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                                Button("Remove", systemImage: "minus.circle") { Task { await catalogues.remove(id, from: catalogueID) } }
                                    .buttonStyle(.borderless).labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                            }
                        }
                    }
                    Section("Add existing sheets") {
                        Button("Import files") { importing = true }
                        ForEach(maps.rows.filter { !catalogue.sheetIDs.contains($0.id) }) { row in
                            Button(row.record.name) { Task { await catalogues.add([row.id], to: catalogueID) } }
                        }
                    }
                    Section("Sheet opacity") {
                        Slider(value: Binding(get: { catalogue.opacity }, set: { value in Task { await catalogues.setOpacity(value, in: catalogueID) } }), in: 0...1)
                    }
                }
            }
            .navigationTitle("Catalogue sheets")
            .toolbar { Button("Done") { dismiss() } }
            .fileImporter(isPresented: $importing, allowedContentTypes: UserFileImport.contentTypes, allowsMultipleSelection: true) { result in
                guard case .success(let urls) = result else { return }
                Task {
                    let sorted = urls.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
                    let ids = await UserFileImport.load(sorted, maps: maps, vectors: nil)
                    await catalogues.add(ids.filter { maps.confirmedMapIDs.contains($0) }, to: catalogueID)
                }
            }
        }
    }
    private func move(_ index: Int, by delta: Int, ids: [String]) {
        let target = index + delta
        guard ids.indices.contains(target) else { return }
        var order = ids
        order.swapAt(index, target)
        Task { await catalogues.reorder(order, in: catalogueID) }
    }
}
