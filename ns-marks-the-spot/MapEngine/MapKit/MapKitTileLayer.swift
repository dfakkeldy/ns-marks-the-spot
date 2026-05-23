import CryptoKit
import Foundation

final class MapKitTileLayer: MapLayer {
    let id: String
    let name: String
    let type: MapLayerType
    var opacity: CGFloat = 1.0
    var isVisible: Bool = true
    let minZoom: Int
    let maxZoom: Int

    var cacheIdentifier: String {
        let configString: String
        switch type {
        case .tile(let url):
            configString = "tile|\(url.absoluteString)"
        case .arcgisDynamic(let url, let dynamicLayers, let layerRestrictions):
            configString = "arcgis|\(url.absoluteString)|\(dynamicLayers ?? "")|\(layerRestrictions ?? "")"
        case .vector(let paths):
            configString = "vector|\(paths.joined(separator: ","))"
        }

        let inputData = Data(configString.utf8)
        let hashed = SHA256.hash(data: inputData)
        let hashString = hashed.compactMap { String(format: "%02x", $0) }.joined()
        return "\(id)_\(hashString)"
    }

    init(id: String, name: String, type: MapLayerType, minZoom: Int = 0, maxZoom: Int = 24) {
        self.id = id
        self.name = name
        self.type = type
        self.minZoom = minZoom
        self.maxZoom = maxZoom
    }
}
