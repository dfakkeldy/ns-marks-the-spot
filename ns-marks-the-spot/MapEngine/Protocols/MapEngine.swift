import SwiftUI

protocol MapEngine: AnyObject {
    var layers: [any MapLayer] { get }

    func addLayer(_ layer: any MapLayer)
    func removeLayer(by id: String)
    func setOpacity(for layerId: String, to value: CGFloat)

    /// Returns a SwiftUI view wrapping the native map implementation.
    func makeMapView() -> AnyView
}
