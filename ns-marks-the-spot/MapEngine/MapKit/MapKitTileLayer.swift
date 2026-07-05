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
    private let explicitCacheIdentifier: String?

    var cacheIdentifier: String {
        if let explicitCacheIdentifier {
            return explicitCacheIdentifier
        }

        let configString: String
        switch type {
        case .tile(let url):
            configString = "tile|\(url.absoluteString)"
        case .arcgisMapService(let url, let transparent):
            configString = "arcgisMapService|\(url.absoluteString)|\(transparent)"
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

    init(
        id: String,
        name: String,
        type: MapLayerType,
        minZoom: Int = 0,
        maxZoom: Int = 24,
        cacheIdentifier: String? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.minZoom = minZoom
        self.maxZoom = maxZoom
        self.explicitCacheIdentifier = cacheIdentifier
    }

    convenience init(descriptor: LayerDescriptor, type: MapLayerType) {
        self.init(
            id: descriptor.id.rawValue,
            name: descriptor.name,
            type: type,
            minZoom: descriptor.minZoom,
            maxZoom: descriptor.maxZoom
        )
        self.opacity = descriptor.defaultOpacity
        self.isVisible = descriptor.defaultVisibility
    }
}
