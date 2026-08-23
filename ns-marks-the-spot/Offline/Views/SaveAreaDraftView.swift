import MapCatalog
import SwiftUI

struct SaveAreaDraftView: View {
    @Environment(\.dismiss) private var dismiss

    let viewModel: OfflineAreasViewModel
    let bounds: MapBounds

    @State private var areaName = "Saved Area"
    /// Clamped to the zooms the sheets were rendered at. Offering more looks
    /// generous and is not: every tile outside the pyramid is a download that
    /// cannot succeed, and the area it belongs to stays "partial" forever.
    private static let zooms = FletcherSheets.zoomRange

    @State private var minZoom = max(10, FletcherSheets.zoomRange.lowerBound)
    @State private var maxZoom = min(14, FletcherSheets.zoomRange.upperBound)
    @State private var draftArea: SavedOfflineArea?
    @State private var didSave = false

    var body: some View {
        Form {
            Section("Area") {
                TextField("Name", text: $areaName)
                Stepper(
                    "Minimum Zoom: \(minZoom)",
                    value: $minZoom,
                    in: Self.zooms.lowerBound...maxZoom
                )
                Stepper(
                    "Maximum Zoom: \(maxZoom)",
                    value: $maxZoom,
                    in: minZoom...Self.zooms.upperBound
                )

                Button("Estimate Fletcher Tiles") {
                    estimateDraft()
                }
                .disabled(trimmedAreaName.isEmpty)
            }

            Section("Estimate") {
                if let draftArea {
                    LabeledContent("Tiles", value: "\(draftArea.estimatedTileCount)")
                        .accessibilityIdentifier("draft-estimated-tiles")
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

                    // A count of zero is the one number this screen must
                    // explain rather than print. The reader is owed the
                    // difference between a survey that has no ground here and
                    // a pyramid that returned nothing for ground it does have,
                    // and without the sentence the Save button below reads as
                    // an offer to download an area that would arrive empty and
                    // still call itself complete.
                    //
                    // Neither sentence suggests a remedy any more. Widening
                    // the zoom range does move the count, by reaching further
                    // onto whatever sheet is nearest, and that is not the same
                    // as finding coverage for the area a reader drew.
                    if isOutsideSurvey {
                        // A count above zero is possible here and does not
                        // contradict the sentence. Tiles are squares, the
                        // survey is not, and one zoom 10 tile is wide enough
                        // to cover both a selection in the gap north of Bras
                        // d'Or Lake and the sheet next to it. Those tiles
                        // belong to that sheet. Saving them under this area's
                        // name would let it report itself complete over ground
                        // no sheet was ever drawn for, which is the download
                        // this screen refuses.
                        Text("No Fletcher sheet covers this area. The survey is of Cape Breton. Any tiles counted here belong to sheets nearby, not to this ground.")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("draft-outside-survey")
                    } else if draftArea.estimatedTileCount == 0 {
                        Text("No Fletcher tiles were planned for this area.")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("draft-no-tiles")
                    }

                    // The one remaining way this button greys out without
                    // saying why. The others each have their sentence above.
                    if viewModel.isStorageOperationInProgress {
                        Text("Another download or deletion is running. Saving will be available when it finishes.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("draft-storage-busy")
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
                    // Refused for an area outside the survey even when the
                    // count is positive. The tiles behind such a count are
                    // neighbouring sheets caught by a wide low-zoom square,
                    // and a saved area that downloads them reports "Complete"
                    // and "2 / 2 tiles" for ground the survey never drew. An
                    // offline area is evidence of what a reader will have out
                    // of coverage, so it may not claim ground it does not
                    // hold.
                    .disabled(
                        viewModel.isStorageOperationInProgress
                            || didSave
                            || isOverTileBudget(draftArea)
                            || isOutsideSurvey
                            || draftArea.estimatedTileCount == 0
                    )
                } else {
                    Text("Estimate a draft area to preview the Fletcher download size.")
                        .foregroundStyle(.secondary)
                }

                // Said where the download is chosen, because this is the
                // moment a reader decides what they will have out of coverage.
                // Nothing but Fletcher is downloaded; the rest is whatever the
                // cache still happens to be holding.
                Text("A saved area downloads Fletcher tiles. NS Aerial and the Province reference layers are not downloaded. What you have already looked at is kept until the cache makes room for newer tiles.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("save-area-draft-form")
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

    private var isOutsideSurvey: Bool {
        !FletcherTilePlanner.coversAnyGround(in: bounds)
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
