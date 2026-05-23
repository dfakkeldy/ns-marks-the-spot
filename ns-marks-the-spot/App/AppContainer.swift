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
        fletcherLayer.opacity = 1.0
        fletcherLayer.isVisible = true
        engine.addLayer(fletcherLayer)

        let nsprdURL = URL(string: "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer")!
        let nsprdLayer = MapKitTileLayer(
            id: "nsprd",
            name: "NS Property Boundaries",
            type: .arcgisDynamic(nsprdURL,
                dynamicLayers: """
                [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"showLabels":false}}]
                """,
                layerRestrictions: nil)
        )
        nsprdLayer.opacity = 0.0
        nsprdLayer.isVisible = false
        engine.addLayer(nsprdLayer)

        let crownURL = URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLANCrownLandsWM84V1/MapServer")!
        let crownLayer = MapKitTileLayer(
            id: "crown-lands",
            name: "Crown Lands",
            type: .arcgisDynamic(crownURL,
                dynamicLayers: """
                [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSFS","style":"esriSFSSolid","color":[46,180,46,128],"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[0,100,0,255],"width":2}}},"labelingInfo":[]}]
                """,
                layerRestrictions: nil)
        )
        crownLayer.opacity = 0.0
        crownLayer.isVisible = false
        engine.addLayer(crownLayer)

        let watershedURL = URL(string: "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer")!
        let watershedLayer = MapKitTileLayer(
            id: "watersheds",
            name: "Watersheds",
            type: .arcgisDynamic(watershedURL, dynamicLayers: nil, layerRestrictions: "show:24,25,26")
        )
        watershedLayer.opacity = 0.0
        watershedLayer.isVisible = false
        engine.addLayer(watershedLayer)

        let waterfallsURL = URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer")!
        let waterfallsLayer = MapKitTileLayer(
            id: "waterfalls",
            name: "Waterfalls",
            type: .arcgisDynamic(waterfallsURL,
                dynamicLayers: """
                [{"id":1,"source":{"type":"mapLayer","mapLayerId":1},"definitionExpression":"FEAT_DESC = 'Falls -  On a single line river point'","drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSMS","style":"esriSMSCircle","color":[0,120,255,255],"size":8,"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[255,255,255,255],"width":1.5}}},"showLabels":true,"labelingInfo":[{"labelExpression":"[ZVALUE]","labelPlacement":"esriServerPointLabelPlacementAboveRight","symbol":{"type":"esriTS","color":[0,120,255,255],"font":{"size":10,"family":"Arial","weight":"bold"}},"minScale":50000}]}}]
                """,
                layerRestrictions: nil)
        )
        waterfallsLayer.opacity = 0.0
        waterfallsLayer.isVisible = false
        engine.addLayer(waterfallsLayer)
    }
}
