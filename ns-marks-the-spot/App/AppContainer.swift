import Foundation

final class AppContainer {
    let mapEngine: any MapEngine
    let tileCache: TileCache
    let tileFetcher: TileFetcher

    init() {
        let cache = TileCache()
        self.tileCache = cache

        let engine = MapKitEngine(tileCache: cache)
        self.mapEngine = engine

        self.tileFetcher = TileFetcher(tileCache: cache)

        let fletcherLayer = MapKitTileLayer(
            id: "fletcher",
            name: "Fletcher",
            tileURL: URL(fileURLWithPath: "Tiles/Fletcher")
        )
        fletcherLayer.opacity = 0.5
        engine.addLayer(fletcherLayer)
    }
}
