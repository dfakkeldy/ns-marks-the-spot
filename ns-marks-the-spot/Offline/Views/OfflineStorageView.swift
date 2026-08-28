import SwiftUI

struct OfflineStorageView: View {
    @Environment(\.dismiss) private var dismiss

    let viewModel: OfflineAreasViewModel
    @State private var isConfirmingDeleteAllCachedTiles = false
    @State private var layerPendingDeletion: OfflineLayerStorageSummary?
    @State private var areaPendingDeletion: SavedOfflineArea?

    /// Baddeck, which Fletcher sheet 12 covers.
    ///
    /// It used to be Halifax, which reads naturally to anyone in this province
    /// and is the one place the sample could not work: the survey is a Cape
    /// Breton one, so the estimate came back at zero tiles and the button under
    /// it offered to save a download of nothing. `FletcherTilePlannerTests`
    /// keeps this box inside the survey.
    static let sampleAreaBounds = MapBounds(
        minLatitude: 46.05,
        minLongitude: -60.83,
        maxLatitude: 46.15,
        maxLongitude: -60.68
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
                                // The borderless style tinted the glyph blue
                                // beside the destructive red title; one colour
                                // for one action.
                                .tint(.red)
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
                            bounds: Self.sampleAreaBounds
                        )
                    } label: {
                        Label("Save Sample Baddeck Area", systemImage: "square.dashed")
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

    private static let byteFormatter: ByteCountFormatter = {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        // "0 KB", not "Zero KB": the row beside it counts failed areas with a
        // plain numeral, and two formats for the same idea read as two ideas.
        formatter.allowsNonnumericFormatting = false
        return formatter
    }()

    private func formattedBytes(_ bytes: Int) -> String {
        Self.byteFormatter.string(fromByteCount: Int64(bytes))
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
