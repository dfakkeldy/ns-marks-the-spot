import Foundation
import MapCatalog
import NSDataServices

nonisolated struct TileDownloadProgress: Equatable, Sendable {
    let total: Int
    var succeeded: Int
    var failed: Int
    var failedCoordinates: [TileCoordinate] = []
    var wasCancelled = false
}

nonisolated protocol TileDataLoading {
    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data
}

nonisolated final class TileDownloadManager {
    private static let fletcherLayerID = "fletcher"

    private let tileStore: TileStore

    init(tileStore: TileStore) {
        self.tileStore = tileStore
    }

    func download(
        area: SavedOfflineArea,
        loader: TileDataLoading,
        targetCoordinates: [TileCoordinate]? = nil,
        progressHandler: ((TileDownloadProgress) async -> Void)? = nil
    ) async -> TileDownloadProgress {
        let coordinates = targetCoordinates ?? FletcherTilePlanner.coordinates(
            for: area.bounds,
            zoomRange: area.minZoom...area.maxZoom
        )
        var progress = TileDownloadProgress(total: coordinates.count, succeeded: 0, failed: 0)

        for (index, coordinate) in coordinates.enumerated() {
            if Task.isCancelled {
                progress.wasCancelled = true
                let remaining = Array(coordinates[index...])
                progress.failed += remaining.count
                progress.failedCoordinates.append(contentsOf: remaining)
                await progressHandler?(progress)
                break
            }

            if let existingData = await tileStore.tile(
                z: coordinate.z,
                x: coordinate.x,
                y: coordinate.y,
                layerID: Self.fletcherLayerID
            ) {
                do {
                    try await tileStore.store(
                        existingData,
                        z: coordinate.z,
                        x: coordinate.x,
                        y: coordinate.y,
                        layerID: Self.fletcherLayerID,
                        savedAreaID: area.id
                    )
                    progress.succeeded += 1
                } catch {
                    progress.failed += 1
                    progress.failedCoordinates.append(coordinate)
                }
                await progressHandler?(progress)
                continue
            }

            do {
                let data = try await loader.data(for: coordinate, layerID: Self.fletcherLayerID)
                try await tileStore.store(
                    data,
                    z: coordinate.z,
                    x: coordinate.x,
                    y: coordinate.y,
                    layerID: Self.fletcherLayerID,
                    savedAreaID: area.id
                )
                progress.succeeded += 1
            } catch {
                progress.failed += 1
                progress.failedCoordinates.append(coordinate)
            }
            await progressHandler?(progress)
        }

        return progress
    }
}

/// Downloads Fletcher tiles for a saved offline area.
///
/// Resolves and stacks the covering sheets exactly as `OpacityTileOverlay`
/// does, and for the same reason: the survey is 24 pyramids whose margins
/// overlap, so a seam coordinate is only whole once every sheet that has ink
/// there has been drawn into it. Saving one sheet's half of a seam tile would
/// put a picture on the disk that the online map never showed.
nonisolated struct FletcherTileLoader: TileDataLoading {
    let tileFetcher: TileFetcher
    let baseURL: URL

    /// The coordinate falls outside all 24 sheets.
    ///
    /// `FletcherTilePlanner` filters these out before a download starts, so
    /// reaching this means the plan and the sheet index disagree — a bug, not a
    /// network condition, and worth surfacing as its own type rather than being
    /// counted alongside timeouts.
    struct NoCoveringSheet: Error {
        let coordinate: TileCoordinate
    }

    /// A covering sheet could not be reached, so the tile would be incomplete.
    ///
    /// Worth retrying, unlike `NoCoveringSheet`. The caller can only tell them
    /// apart if the types differ.
    struct SheetsUnavailable: Error {
        let coordinate: TileCoordinate
        let underlying: any Error
    }

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        let covering = FletcherSheets.sheets(
            coveringTileX: coordinate.x, y: coordinate.y, z: coordinate.z
        )
        guard !covering.isEmpty else {
            throw NoCoveringSheet(coordinate: coordinate)
        }

        var stacked: [Data] = []
        var blockingError: (any Error)?
        for sheet in covering {
            guard let template = FletcherTileURL.tileTemplate(
                sheet: sheet.sheet, baseURL: baseURL
            ), let templateURL = URL(string: template) else { continue }
            do {
                stacked.append(
                    try await tileFetcher.fetchTile(
                        z: coordinate.z,
                        x: coordinate.x,
                        y: coordinate.y,
                        from: templateURL,
                        layerName: layerID,
                        cacheResult: false
                    )
                )
            } catch {
                // A 404 means this sheet has no ink here, which is a complete
                // answer and leaves the stack whole. Anything else is a sheet
                // we could have had, and saving the tile without it would put a
                // picture on the disk that the online map never showed —
                // permanently, since a stored tile is preferred over a fetch.
                if !TileFetcherError.meansNoTileExists(error) {
                    blockingError = error
                }
            }
        }

        if let blockingError {
            throw SheetsUnavailable(coordinate: coordinate, underlying: blockingError)
        }

        // Every covering sheet answered, and none of them had anything: the
        // rotated scans leave empty corners inside their own bounding boxes.
        // A blank tile is what the map draws there, so saving one finishes the
        // coordinate honestly instead of failing it forever.
        if stacked.isEmpty {
            guard let blank = TileComposite.transparent else {
                throw SheetsUnavailable(
                    coordinate: coordinate,
                    underlying: NoCoveringSheet(coordinate: coordinate)
                )
            }
            return blank
        }

        // Non-empty in, nil out means the bytes would not decode, which is a
        // real failure rather than absent ground.
        guard let data = TileComposite.stack(stacked) else {
            throw SheetsUnavailable(
                coordinate: coordinate,
                underlying: TileFetcherError.invalidImageData
            )
        }
        return data
    }
}
