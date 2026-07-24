import Foundation

final class AppContainer {
    let mapEngine: any MapEngine
    let tileStore: TileStore
    let tileCache: TileCache
    let tileFetcher: TileFetcher
    let poiViewModel: POIViewModel
    let offlineAreasViewModel: OfflineAreasViewModel
    let isUITestMode: Bool

    init() {
        self.isUITestMode = ProcessInfo.processInfo.arguments.contains("UITestMode")

        let store = TileStore()
        self.tileStore = store

        let cache = TileCache(tileStore: store)
        self.tileCache = cache

        let fetcher = TileFetcher(tileCache: cache)
        self.tileFetcher = fetcher
        let tileDownloadManager = TileDownloadManager(tileStore: store)
        let fletcherTileLoader = LayerCatalog.descriptor(for: .fletcher)
            .flatMap { descriptor in
                descriptor.sourceURL.map { FletcherTileLoader(tileFetcher: fetcher, templateURL: $0) }
            }
        self.offlineAreasViewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            tileDownloadManager: tileDownloadManager,
            tileLoader: fletcherTileLoader
        )

        let engine = MapKitEngine(tileCache: cache, tileFetcher: fetcher)
        self.mapEngine = engine

        self.poiViewModel = POIViewModel()

        for descriptor in LayerCatalog.all {
            guard let layer = makeLayer(from: descriptor) else { continue }
            engine.addLayer(layer)
        }
    }

    private func makeLayer(from descriptor: LayerDescriptor) -> MapKitTileLayer? {
        switch descriptor.id {
        case .fletcher:
            guard let url = descriptor.sourceURL else { return nil }
            return MapKitTileLayer(
                descriptor: descriptor,
                type: .tile(url)
            )
        case .nsAerial:
            guard let url = descriptor.sourceURL else { return nil }
            return MapKitTileLayer(
                descriptor: descriptor,
                type: .arcgisMapService(url, transparent: false)
            )
        case .nsPropertyBoundaries:
            guard let url = descriptor.sourceURL else { return nil }
            return MapKitTileLayer(
                descriptor: descriptor,
                type: .arcgisDynamic(
                    url,
                    dynamicLayers: """
                    [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"showLabels":false}}]
                    """,
                    layerRestrictions: nil
                )
            )
        case .crownLands:
            guard let url = descriptor.sourceURL else { return nil }
            return MapKitTileLayer(
                descriptor: descriptor,
                type: .arcgisDynamic(
                    url,
                    dynamicLayers: """
                    [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSFS","style":"esriSFSSolid","color":[46,180,46,128],"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[0,100,0,255],"width":2}}},"labelingInfo":[]}]
                    """,
                    layerRestrictions: nil
                )
            )
        case .floodRisk:
            guard let url = descriptor.sourceURL else { return nil }
            return MapKitTileLayer(
                descriptor: descriptor,
                type: .arcgisDynamic(url, dynamicLayers: nil, layerRestrictions: "show:24,25,26")
            )
        case .waterfalls:
            guard let url = descriptor.sourceURL else { return nil }
            return MapKitTileLayer(
                descriptor: descriptor,
                type: .arcgisDynamic(
                    url,
                    dynamicLayers: """
                    [{"id":1,"source":{"type":"mapLayer","mapLayerId":1},"definitionExpression":"FEAT_DESC = 'Falls -  On a single line river point'","drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSMS","style":"esriSMSCircle","color":[0,120,255,255],"size":8,"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[255,255,255,255],"width":1.5}}},"showLabels":true,"labelingInfo":[{"labelExpression":"[ZVALUE]","labelPlacement":"esriServerPointLabelPlacementAboveRight","symbol":{"type":"esriTS","color":[0,120,255,255],"font":{"size":10,"family":"Arial","weight":"bold"}},"minScale":50000}]}}]
                    """,
                    layerRestrictions: nil
                )
            )
        case .churchInverness, .churchVictoria, .churchRichmond, .churchCapeBreton:
            // Catalogued for attribution and metadata only. No tiles have been
            // produced for the Church series yet, so there is no renderable
            // source to install. Give these a source URL and a tile type when
            // the pyramids exist.
            return nil
        }
    }
}
