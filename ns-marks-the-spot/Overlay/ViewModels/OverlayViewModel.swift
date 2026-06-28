import Combine
import SwiftUI

@MainActor
final class OverlayViewModel: ObservableObject {
    @Published var opacity: CGFloat = 0.5
    @Published var selectedLayerId: String?

    private let nsAerialLayerId = LayerID.nsAerial.rawValue
    private let nsAerialBasemapOpacity: CGFloat = 1.0

    var layers: [any MapLayer] { engine.layers }
    var baseMapType: MapBaseType { engine.baseMapType }

    private let engine: any MapEngine

    init(engine: any MapEngine) {
        self.engine = engine
    }

    func setBaseMapType(_ type: MapBaseType) {
        engine.baseMapType = type
        syncNSAerialLayerVisibility(for: type)
        objectWillChange.send()
    }

    func offlineStatus(for layerId: String) -> String {
        guard let layerID = LayerID(rawValue: layerId),
              let descriptor = LayerCatalog.descriptor(for: layerID) else {
            return "Online"
        }

        switch descriptor.offlinePolicy {
        case .savedAreaDownloadable:
            return "Downloadable"
        case .viewedCacheOnly:
            return "Cached when viewed"
        case .onlineOnly:
            return "Online"
        }
    }

    func updateOpacity(_ newValue: CGFloat) {
        opacity = newValue
        if let layerId = selectedLayerId {
            engine.setOpacity(for: layerId, to: newValue)
        }
        objectWillChange.send()
    }

    func updateLayerOpacity(for id: String, to value: CGFloat) {
        engine.setOpacity(for: id, to: value)
        objectWillChange.send()
    }

    func selectLayer(_ id: String) {
        selectedLayerId = id
        opacity = engine.layers.first { $0.id == id }?.opacity ?? 0.5
        objectWillChange.send()
    }

    func toggleVisibility(_ id: String) {
        guard let layer = engine.layers.first(where: { $0.id == id }) else { return }
        engine.setVisible(for: id, to: !layer.isVisible)
        objectWillChange.send()
    }

    private func syncNSAerialLayerVisibility(for type: MapBaseType) {
        guard let nsAerialLayer = engine.layers.first(where: { $0.id == nsAerialLayerId }) else {
            return
        }

        if type == .nsAerial {
            if nsAerialLayer.opacity <= 0 {
                engine.setOpacity(for: nsAerialLayerId, to: nsAerialBasemapOpacity)
            }
            engine.setVisible(for: nsAerialLayerId, to: true)
        } else if nsAerialLayer.isVisible {
            engine.setVisible(for: nsAerialLayerId, to: false)
        }
    }
}
