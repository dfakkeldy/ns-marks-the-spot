import SwiftUI

struct SaveAreaDraftView: View {
    @Environment(\.dismiss) private var dismiss

    let viewModel: OfflineAreasViewModel
    let bounds: MapBounds

    @State private var areaName = "Saved Area"
    @State private var minZoom = 10
    @State private var maxZoom = 14
    @State private var draftArea: SavedOfflineArea?
    @State private var didSave = false

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

                    if isOverTileBudget(draftArea) {
                        Text("Selected area is too large for an offline download.")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }

                    Button {
                        Task {
                            if await viewModel.saveDraft(draftArea) {
                                didSave = true
                            }
                        }
                    } label: {
                        Label(didSave ? "Saved" : "Save Area", systemImage: didSave ? "checkmark.circle" : "square.and.arrow.down")
                    }
                    .disabled(viewModel.isStorageOperationInProgress || didSave || isOverTileBudget(draftArea))
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
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(didSave ? "Done" : "Cancel") {
                    dismiss()
                }
            }
        }
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
        didSave = false
    }

    private func isOverTileBudget(_ area: SavedOfflineArea) -> Bool {
        area.estimatedTileCount > viewModel.maximumSavedAreaTileCount
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
                failedTileCoordinates: existingDraft.failedTileCoordinates ?? [],
                actualBytes: existingDraft.actualBytes,
                state: estimatedDraft.state
            )
        }

        draftArea = estimatedDraft
    }
}
