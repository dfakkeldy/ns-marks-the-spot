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

        let nsTopoURL = URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer")!
        let nsTopoLayer = MapKitTileLayer(
            id: "ns-topo-base",
            name: "NS Topo Base",
            type: .arcgisDynamic(nsTopoURL)
        )
        nsTopoLayer.opacity = 0.5
        engine.addLayer(nsTopoLayer)
    }
}
