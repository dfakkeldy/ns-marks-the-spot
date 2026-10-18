import Foundation
import GeoCore
import MapCatalog
import NSDataServices

nonisolated struct TileDownloadProgress: Equatable, Sendable {
    let total: Int
    var succeeded: Int
    var failed: Int
    var failedCoordinates: [TileCoordinate] = []
    var wasCancelled = false
}

nonisolated protocol TileDataLoading: Sendable {
    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data
}

nonisolated final class TileDownloadManager: Sendable {
    /// The catalog's own id, not a string minted here: this key also guards
    /// the rights-driven Rumsey sweep, and a hand-typed copy is one more place
    /// a rename could silently miss.
    private static let fletcherLayerID = LayerID.fletcher.rawValue

    private let tileStore: TileStore

    init(tileStore: TileStore) {
        self.tileStore = tileStore
    }

    /// `@concurrent`, not merely nonisolated: under approachable concurrency a
    /// nonisolated async function runs on its caller's actor, and the caller is
    /// the main-actor view model. A download of tens of thousands of tiles —
    /// the whole survey at zoom 8-16 is 94,608 — must not interleave its
    /// per-tile work into main-thread frames; only the progress closure hops
    /// back.
    @concurrent
    func download(
        area: SavedOfflineArea,
        loader: TileDataLoading,
        targetCoordinates: [TileCoordinate]? = nil,
        progressHandler: (@Sendable (TileDownloadProgress) async -> Void)? = nil
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
/// Reads the same precomposited mosaic PNG that the online map displays.
/// Source-sheet extents bound the plan, but never cause duplicate requests.
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
        guard FletcherSheets.zoomRange.contains(coordinate.z),
              !FletcherSheets.sheets(coveringTileX: coordinate.x, y: coordinate.y, z: coordinate.z).isEmpty
        else { throw NoCoveringSheet(coordinate: coordinate) }
        guard let template = FletcherTileURL.tileTemplate(baseURL: baseURL),
              let url = URL(string: template)
        else { throw SheetsUnavailable(coordinate: coordinate, underlying: URLError(.badURL)) }
        do {
            // Each PNG already contains every source sheet at this coordinate.
            // Even an overlap is one request, with its original alpha intact.
            return try await tileFetcher.fetchTile(
                z: coordinate.z, x: coordinate.x, y: coordinate.y,
                from: url, layerName: layerID, cacheResult: false
            )
        } catch {
            // The complete pyramid includes transparent PNGs. A missing key is
            // a source failure, not permission to save a fabricated blank.
            throw SheetsUnavailable(coordinate: coordinate, underlying: error)
        }
    }
}
