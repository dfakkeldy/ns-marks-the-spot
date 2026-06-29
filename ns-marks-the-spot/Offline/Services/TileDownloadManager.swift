import Foundation

nonisolated struct TileDownloadProgress: Equatable, Sendable {
    let total: Int
    var succeeded: Int
    var failed: Int
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
        loader: TileDataLoading
    ) async -> TileDownloadProgress {
        let coordinates = FletcherTilePlanner.coordinates(
            for: area.bounds,
            zoomRange: area.minZoom...area.maxZoom
        )
        var progress = TileDownloadProgress(total: coordinates.count, succeeded: 0, failed: 0)

        for coordinate in coordinates {
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
                }
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
            }
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
            layerName: layerID,
            cacheResult: false
        )
    }
}
