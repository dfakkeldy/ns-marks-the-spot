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
            type: .tile(URL(fileURLWithPath: "Tiles/Fletcher"))
        )
        fletcherLayer.opacity = 0.5
        engine.addLayer(fletcherLayer)

        let nsprdURL = URL(string: "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer")!
        let nsprdLayer = MapKitTileLayer(
            id: "nsprd",
            name: "NS Property Boundaries",
            type: .arcgisDynamic(nsprdURL)
        )
        nsprdLayer.opacity = 0.5
        engine.addLayer(nsprdLayer)
    }
}
