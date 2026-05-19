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
            type: .arcgisDynamic(nsprdURL,
                dynamicLayers: """
                [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSFS","style":"esriSFSNull","color":[0,0,0,0],"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[128,128,128,255],"width":1}}},"labelingInfo":null}]
                """,
                layerRestrictions: nil)
        )
        nsprdLayer.opacity = 0.5
        engine.addLayer(nsprdLayer)

        let crownURL = URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLANCrownLandsWM84V1/MapServer")!
        let crownLayer = MapKitTileLayer(
            id: "crown-lands",
            name: "Crown Lands",
            type: .arcgisDynamic(crownURL,
                dynamicLayers: """
                [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSFS","style":"esriSFSSolid","color":[46,180,46,128],"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[0,100,0,255],"width":2}}},"labelingInfo":null}]
                """,
                layerRestrictions: nil)
        )
        crownLayer.opacity = 0.7
        engine.addLayer(crownLayer)

        let watershedURL = URL(string: "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer")!
        let watershedLayer = MapKitTileLayer(
            id: "watersheds",
            name: "Watersheds",
            type: .arcgisDynamic(watershedURL, dynamicLayers: nil, layerRestrictions: "show:24,25,26")
        )
        watershedLayer.opacity = 0.6
        engine.addLayer(watershedLayer)
    }
}
