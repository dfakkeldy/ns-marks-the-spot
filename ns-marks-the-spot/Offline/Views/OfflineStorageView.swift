import SwiftUI

struct OfflineStorageView: View {
    @Environment(\.dismiss) private var dismiss

    let viewModel: OfflineAreasViewModel
    @State private var isConfirmingDeleteAllCachedTiles = false
    @State private var layerPendingDeletion: OfflineLayerStorageSummary?
    @State private var areaPendingDeletion: SavedOfflineArea?

    private let defaultSaveAreaBounds = MapBounds(
        minLatitude: 44.60,
        minLongitude: -63.65,
        maxLatitude: 44.70,
        maxLongitude: -63.50
    )

    var body: some View {
        NavigationStack {
            List {
                Section("Storage") {
                    LabeledContent("Total", value: formattedBytes(viewModel.storageSummary.totalBytes))
                    LabeledContent("Saved Areas", value: formattedBytes(viewModel.savedAreaBytes))
                    LabeledContent("Failed Areas", value: "\(failedAreaCount)")

                    if let storageErrorMessage = viewModel.storageErrorMessage {
                        Text(storageErrorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

                    Button(role: .destructive) {
                        isConfirmingDeleteAllCachedTiles = true
                    } label: {
                        Label("Delete Cached Tiles", systemImage: "trash")
                    }
                    .disabled(viewModel.isStorageOperationInProgress)
                }

                Section("Layer Cache") {
                    if viewModel.layerStorageSummaries.isEmpty {
                        Text("No cached layers")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.layerStorageSummaries) { layer in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .firstTextBaseline) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(layer.displayName)
                                            .font(.headline)

                                        if let rawKey = layer.rawKey {
                                            Text(rawKey)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }

                                    Spacer()

                                    Text(formattedBytes(layer.bytes))
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }

                                Button(role: .destructive) {
                                    layerPendingDeletion = layer
                                } label: {
                                    Label("Delete Layer Cache", systemImage: "trash")
                                }
                                .buttonStyle(.borderless)
                                .disabled(viewModel.isStorageOperationInProgress)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }

                Section("Field Prep") {
                    NavigationLink {
                        SaveAreaDraftView(
                            viewModel: viewModel,
                            bounds: defaultSaveAreaBounds
                        )
                    } label: {
                        Label("Save Sample Halifax Area", systemImage: "square.dashed")
                    }
                }

                Section("Saved Areas") {
                    if viewModel.savedAreas.isEmpty {
                        Text("No saved areas")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.savedAreas) { area in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(area.name)
                                        .font(.headline)

                                    Spacer()

                                    Text(stateLabel(for: area.state))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Text("\(area.downloadedTileCount) / \(area.estimatedTileCount) tiles downloaded")
                                    .font(.subheadline)

                                Text("Failures: \(area.failedTileCount)")
                                    .font(.caption)
                                    .foregroundStyle(area.failedTileCount > 0 ? .orange : .secondary)

                                Text("Stored \(formattedBytes(area.actualBytes)); estimated \(formattedBytes(area.estimatedBytes))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                HStack {
                                    if shouldShowDownloadButton(for: area) {
                                        Button {
                                            viewModel.startDownloadArea(area)
                                        } label: {
                                            Label("Download Fletcher Tiles", systemImage: "arrow.down.circle")
                                        }
                                        .buttonStyle(.borderless)
                                        .disabled(viewModel.isStorageOperationInProgress)
                                    } else if isDownloading(area) {
                                        Button(role: .destructive) {
                                            viewModel.cancelActiveDownload()
                                        } label: {
                                            Label("Cancel Download", systemImage: "xmark.circle")
                                        }
                                        .buttonStyle(.borderless)
                                    } else if area.failedTileCount > 0 {
                                        Button {
                                            viewModel.startRetryFailedArea(area)
                                        } label: {
                                            Label("Retry Failed Tiles", systemImage: "arrow.clockwise")
                                        }
                                        .buttonStyle(.borderless)
                                        .disabled(viewModel.isStorageOperationInProgress)
                                    }

                                    Spacer()

                                    Button(role: .destructive) {
                                        areaPendingDeletion = area
                                    } label: {
                                        Label("Delete Area", systemImage: "trash")
                                    }
                                    .buttonStyle(.borderless)
                                    .disabled(viewModel.isStorageOperationInProgress)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .accessibilityIdentifier("offline-storage-list")
            .navigationTitle("Offline Maps")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await viewModel.refreshStorageSummary()
            }
            .confirmationDialog(
                "Delete cached tiles?",
                isPresented: $isConfirmingDeleteAllCachedTiles,
                titleVisibility: .visible
            ) {
                Button("Delete Cached Tiles", role: .destructive) {
                    Task {
                        await viewModel.deleteAllCachedTiles()
                    }
                }
            } message: {
                Text("This removes saved offline tiles and viewed layer cache data.")
            }
            .confirmationDialog(
                "Delete layer cache?",
                isPresented: isConfirmingLayerDeletion,
                titleVisibility: .visible
            ) {
                if let layer = layerPendingDeletion {
                    Button("Delete \(layer.displayName)", role: .destructive) {
                        let layerID = layer.id
                        layerPendingDeletion = nil
                        Task {
                            await viewModel.deleteLayerCache(layerID)
                        }
                    }
                }
            } message: {
                Text("This removes cached tiles for the selected layer.")
            }
            .confirmationDialog(
                "Delete saved area?",
                isPresented: isConfirmingAreaDeletion,
                titleVisibility: .visible
            ) {
                if let area = areaPendingDeletion {
                    Button("Delete \(area.name)", role: .destructive) {
                        let areaToDelete = area
                        areaPendingDeletion = nil
                        Task {
                            await viewModel.deleteSavedArea(areaToDelete)
                        }
                    }
                }
            } message: {
                Text("This removes the saved area and its offline tile membership.")
            }
        }
    }

    private func formattedBytes(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    private func stateLabel(for state: SavedOfflineAreaState) -> String {
        state.rawValue
            .split(separator: "-")
            .map { $0.localizedCapitalized }
            .joined(separator: " ")
    }

    private func shouldShowDownloadButton(for area: SavedOfflineArea) -> Bool {
        guard area.state != .complete, area.state != .downloading else { return false }
        return area.failedTileCount == 0
    }

    private func isDownloading(_ area: SavedOfflineArea) -> Bool {
        viewModel.activeDownloadAreaID == area.id || area.state == .downloading
    }

    private var failedAreaCount: Int {
        viewModel.savedAreas.filter { $0.failedTileCount > 0 }.count
    }

    private var isConfirmingLayerDeletion: Binding<Bool> {
        Binding {
            layerPendingDeletion != nil
        } set: { isPresented in
            if !isPresented {
                layerPendingDeletion = nil
            }
        }
    }

    private var isConfirmingAreaDeletion: Binding<Bool> {
        Binding {
            areaPendingDeletion != nil
        } set: { isPresented in
            if !isPresented {
                areaPendingDeletion = nil
            }
        }
    }
}
