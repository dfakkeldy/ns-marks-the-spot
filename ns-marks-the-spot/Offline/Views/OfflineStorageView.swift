import SwiftUI

struct OfflineStorageView: View {
    @ObservedObject var viewModel: OfflineAreasViewModel
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
                        Task {
                            await viewModel.deleteAllCachedTiles()
                        }
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
                                    Task {
                                        await viewModel.deleteLayerCache(layer.id)
                                    }
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
                                            Task {
                                                await viewModel.downloadArea(area)
                                            }
                                        } label: {
                                            Label("Download Fletcher Tiles", systemImage: "arrow.down.circle")
                                        }
                                        .buttonStyle(.borderless)
                                        .disabled(viewModel.isStorageOperationInProgress)
                                    } else if area.failedTileCount > 0 {
                                        Button {
                                            Task {
                                                await viewModel.retryFailedArea(area)
                                            }
                                        } label: {
                                            Label("Retry Failed Tiles", systemImage: "arrow.clockwise")
                                        }
                                        .buttonStyle(.borderless)
                                        .disabled(viewModel.isStorageOperationInProgress)
                                    }

                                    Spacer()

                                    Button(role: .destructive) {
                                        Task {
                                            await viewModel.deleteSavedArea(area)
                                        }
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
            .navigationTitle("Offline Maps")
            .task {
                await viewModel.refreshStorageSummary()
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

    private var failedAreaCount: Int {
        viewModel.savedAreas.filter { $0.failedTileCount > 0 }.count
    }
}
