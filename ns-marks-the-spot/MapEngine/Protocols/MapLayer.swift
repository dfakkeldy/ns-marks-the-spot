import Foundation

enum MapLayerType: Sendable {
    case tile(URL)
    case arcgisDynamic(URL, dynamicLayers: String?, layerRestrictions: String?)
    case vector([String])
}

protocol MapLayer: AnyObject, Identifiable {
    var id: String { get }
    var name: String { get }
    var type: MapLayerType { get }
    var opacity: CGFloat { get set }
    var isVisible: Bool { get set }
    var minZoom: Int { get }
    var maxZoom: Int { get }

    var cacheIdentifier: String { get }
}
