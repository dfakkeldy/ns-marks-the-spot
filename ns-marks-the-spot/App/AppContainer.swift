import Foundation

final class AppContainer {
    let mapController: MapController
    let navigationModel = NavigationModel()
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

        let cache = TileCache()
        self.tileCache = cache

        let fetcher = TileFetcher(tileCache: cache)
        self.tileFetcher = fetcher
        let tileDownloadManager = TileDownloadManager(tileStore: store)
        FletcherSourceMigration.runIfNeeded(tileCache: cache, tileStore: store)

        let fletcherTileLoader = LayerCatalog.descriptor(for: .fletcher)
            .flatMap { descriptor in
                descriptor.sourceURL.map { FletcherTileLoader(tileFetcher: fetcher, baseURL: $0) }
            }
        self.offlineAreasViewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            tileDownloadManager: tileDownloadManager,
            tileLoader: fletcherTileLoader
        )

        let controller = MapController(tileCache: cache, tileFetcher: fetcher)
        self.mapController = controller

        self.poiViewModel = POIViewModel()

        for descriptor in LayerCatalog.all {
            guard let layer = Self.makeLayer(from: descriptor) else { continue }
            controller.addLayer(layer)
        }
    }

    /// Turns a catalogue entry into an installed layer, or `nil` where there is
    /// nothing renderable to install.
    ///
    /// `static` and not `private` so it can be exercised against a descriptor
    /// the caller supplies. It reads nothing but its argument, and the branch
    /// that matters most — Fletcher with a host configured — is unreachable in
    /// a checkout without `FLETCHER_TILE_BASE_URL`, which is every checkout in
    /// CI. A test that could only observe the ambient configuration would pass
    /// with that branch deleted.
    static func makeLayer(from descriptor: LayerDescriptor) -> MapLayerState? {
        switch descriptor.id {
        case .fletcher:
            // No configured host means no tile build to point at, so the layer
            // is not installed at all. A row whose switch does nothing reads as
            // a broken feature; an absent row reads as a feature that has not
            // shipped, which is what this is until the sheets are hosted.
            guard let baseURL = descriptor.sourceURL else { return nil }
            return MapLayerState(
                descriptor: descriptor,
                source: .fletcherSheets(baseURL: baseURL)
            )
        case .nsAerial:
            guard let url = descriptor.sourceURL else { return nil }
            return MapLayerState(
                descriptor: descriptor,
                source: .arcgisMapService(url, transparent: false)
            )
        case .nsPropertyBoundaries:
            guard let url = descriptor.sourceURL else { return nil }
            return MapLayerState(
                descriptor: descriptor,
                source: .arcgisDynamic(
                    url,
                    dynamicLayers: """
                    [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"showLabels":false}}]
                    """,
                    layerRestrictions: nil
                )
            )
        case .crownLands:
            guard let url = descriptor.sourceURL else { return nil }
            return MapLayerState(
                descriptor: descriptor,
                source: .arcgisDynamic(
                    url,
                    dynamicLayers: """
                    [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSFS","style":"esriSFSSolid","color":[46,180,46,128],"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[0,100,0,255],"width":2}}},"labelingInfo":[]}]
                    """,
                    layerRestrictions: nil
                )
            )
        case .floodRisk:
            guard let url = descriptor.sourceURL else { return nil }
            return MapLayerState(
                descriptor: descriptor,
                source: .arcgisDynamic(url, dynamicLayers: nil, layerRestrictions: "show:24,25,26")
            )
        case .waterfalls:
            guard let url = descriptor.sourceURL else { return nil }
            return MapLayerState(
                descriptor: descriptor,
                source: .arcgisDynamic(
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
