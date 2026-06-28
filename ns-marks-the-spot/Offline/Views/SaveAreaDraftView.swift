import SwiftUI

struct SaveAreaDraftView: View {
    @ObservedObject var viewModel: OfflineAreasViewModel
    let bounds: MapBounds

    @State private var areaName = "Saved Area"
    @State private var minZoom = 10
    @State private var maxZoom = 14
    @State private var draftArea: SavedOfflineArea?

    var body: some View {
        Form {
            Section("Area") {
                TextField("Name", text: $areaName)
                Stepper("Minimum Zoom: \(minZoom)", value: $minZoom, in: 0...maxZoom)
                Stepper("Maximum Zoom: \(maxZoom)", value: $maxZoom, in: minZoom...18)

                Button("Estimate Fletcher Tiles") {
                    estimateDraft()
                }
                .disabled(trimmedAreaName.isEmpty)
            }

            Section("Estimate") {
                if let draftArea {
                    LabeledContent("Tiles", value: "\(draftArea.estimatedTileCount)")
                    LabeledContent(
                        "Size",
                        value: ByteCountFormatter.string(
                            fromByteCount: Int64(draftArea.estimatedBytes),
                            countStyle: .file
                        )
                    )

                    Button("Save Area") {
                        Task {
                            await viewModel.saveDraft(draftArea)
                        }
                    }
                    .disabled(viewModel.isStorageOperationInProgress)
                } else {
                    Text("Estimate a draft area to preview the Fletcher download size.")
                        .foregroundStyle(.secondary)
                }

                Text("v1.0 downloads Fletcher tiles for saved areas. NS Aerial and provincial reference layers are cached when viewed.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Save Area")
        .onChange(of: areaName) { _, _ in
            invalidateDraft()
        }
        .onChange(of: minZoom) { _, _ in
            invalidateDraft()
        }
        .onChange(of: maxZoom) { _, _ in
            invalidateDraft()
        }
    }

    private var trimmedAreaName: String {
        areaName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func invalidateDraft() {
        draftArea = nil
    }

    private func estimateDraft() {
        var estimatedDraft = viewModel.estimateDraft(
            name: trimmedAreaName,
            bounds: bounds,
            minZoom: minZoom,
            maxZoom: maxZoom
        )

        if let existingDraft = draftArea {
            estimatedDraft = SavedOfflineArea(
                id: existingDraft.id,
                name: estimatedDraft.name,
                bounds: estimatedDraft.bounds,
                minZoom: estimatedDraft.minZoom,
                maxZoom: estimatedDraft.maxZoom,
                createdAt: existingDraft.createdAt,
                updatedAt: .now,
                estimatedTileCount: estimatedDraft.estimatedTileCount,
                estimatedBytes: estimatedDraft.estimatedBytes,
                downloadedTileCount: existingDraft.downloadedTileCount,
                failedTileCount: existingDraft.failedTileCount,
                actualBytes: existingDraft.actualBytes,
                state: estimatedDraft.state
            )
        }

        draftArea = estimatedDraft
    }
}
