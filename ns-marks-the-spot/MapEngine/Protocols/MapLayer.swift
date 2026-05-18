import Foundation

enum MapLayerType {
    case tile(URL)
    case vector([String])
}

protocol MapLayer: AnyObject, Identifiable {
    var id: String { get }
    var name: String { get }
    var type: MapLayerType { get }
    var opacity: CGFloat { get set }
    var isVisible: Bool { get set }
}
