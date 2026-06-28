import SwiftUI

struct OfflineStorageView: View {
    @ObservedObject var viewModel: OfflineAreasViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Cache") {
                    LabeledContent("Total", value: formattedBytes(viewModel.storageSummary.totalBytes))

                    Button(role: .destructive) {
                        Task {
                            await viewModel.deleteAllCachedTiles()
                        }
                    } label: {
                        Label("Delete Cached Tiles", systemImage: "trash")
                    }
                }

                Section("Saved Areas") {
                    if viewModel.savedAreas.isEmpty {
                        Text("No saved areas")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.savedAreas) { area in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(area.name)
                                    .font(.headline)

                                Text("\(area.estimatedTileCount) tiles")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
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
}
