import Foundation

final class AppContainer {
    let mapEngine: any MapEngine
    let tileCache: TileCache
    let tileFetcher: TileFetcher
    let poiViewModel: POIViewModel

    init() {
        let cache = TileCache()
        self.tileCache = cache

        let fetcher = TileFetcher(tileCache: cache)
        self.tileFetcher = fetcher

        let engine = MapKitEngine(tileCache: cache, tileFetcher: fetcher)
        self.mapEngine = engine

        self.poiViewModel = POIViewModel()

        let fletcherLayer = MapKitTileLayer(
            id: "fletcher",
            name: "Fletcher",
            tileURL: URL(fileURLWithPath: "Tiles/Fletcher")
        )
        fletcherLayer.opacity = 0.5
        engine.addLayer(fletcherLayer)
    }
}
