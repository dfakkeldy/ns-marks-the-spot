import Foundation

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

nonisolated struct FletcherTileLoader: TileDataLoading {
    let tileFetcher: TileFetcher
    let templateURL: URL

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        try await tileFetcher.fetchTile(
            z: coordinate.z,
            x: coordinate.x,
            y: coordinate.y,
            from: templateURL,
            layerName: layerID
        )
    }
}
