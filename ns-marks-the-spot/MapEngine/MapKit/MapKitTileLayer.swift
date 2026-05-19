import Foundation

final class MapKitTileLayer: MapLayer {
    let id: String
    let name: String
    let type: MapLayerType
    var opacity: CGFloat = 1.0
    var isVisible: Bool = true

    init(id: String, name: String, type: MapLayerType) {
        self.id = id
        self.name = name
        self.type = type
    }
}
