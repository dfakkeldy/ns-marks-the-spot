import Combine
import Foundation

@MainActor
final class OfflineAreasViewModel: ObservableObject {
    @Published private(set) var savedAreas: [SavedOfflineArea] = []
    @Published private(set) var storageSummary = TileStoreSummary(
        totalBytes: 0,
        layerBytes: [:],
        savedAreaBytes: [:]
    )

    private let tileStore: TileStore
    private let tileCache: TileCache
    private let averageTileBytes = 12_000

    init(tileStore: TileStore, tileCache: TileCache) {
        self.tileStore = tileStore
        self.tileCache = tileCache
    }

    func estimateDraft(
        name: String,
        bounds: MapBounds,
        minZoom: Int,
        maxZoom: Int
    ) -> SavedOfflineArea {
        let estimate = FletcherTilePlanner.estimate(
            bounds: bounds,
            zoomRange: minZoom...maxZoom,
            averageTileBytes: averageTileBytes
        )

        return SavedOfflineArea(
            name: name,
            bounds: bounds,
            minZoom: minZoom,
            maxZoom: maxZoom,
            estimatedTileCount: estimate.tileCount,
            estimatedBytes: estimate.estimatedBytes,
            state: .estimating
        )
    }

    func refreshStorageSummary() async {
        storageSummary = await tileStore.summary()
    }

    func deleteAllCachedTiles() async {
        tileCache.clearAllCachedTiles()
        try? await tileStore.deleteAll()
        await refreshStorageSummary()
    }
}
