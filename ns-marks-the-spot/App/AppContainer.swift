import Foundation

final class AppContainer {
    let mapEngine: any MapEngine

    init() {
        let engine = MapKitEngine()
        self.mapEngine = engine

        let fletcherLayer = MapKitTileLayer(
            id: "fletcher",
            name: "Fletcher",
            tileURL: URL(fileURLWithPath: "Tiles/Fletcher")
        )
        fletcherLayer.opacity = 0.5
        engine.addLayer(fletcherLayer)
    }
}
