import Combine
import SwiftUI

@MainActor
final class OverlayViewModel: ObservableObject {
    @Published var opacity: CGFloat = 0.5
    @Published var selectedLayerId: String?

    private let nsAerialLayerId = LayerID.nsAerial.rawValue
    private let nsAerialBasemapOpacity: CGFloat = 1.0
    private let restoredOverlayOpacity: CGFloat = 0.7

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

        if id == nsAerialLayerId {
            toggleNSAerialVisibility(layer)
            objectWillChange.send()
            return
        }

        let newVisibility = !layer.isVisible
        if newVisibility {
            restoreVisibleOpacityIfNeeded(for: layer)
        }
        engine.setVisible(for: id, to: newVisibility)
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

    private func toggleNSAerialVisibility(_ layer: any MapLayer) {
        if layer.isVisible {
            engine.setVisible(for: nsAerialLayerId, to: false)
            if engine.baseMapType == .nsAerial {
                engine.baseMapType = .standard
            }
        } else {
            restoreVisibleOpacityIfNeeded(for: layer)
            engine.setVisible(for: nsAerialLayerId, to: true)
            engine.baseMapType = .nsAerial
        }
    }

    private func restoreVisibleOpacityIfNeeded(for layer: any MapLayer) {
        guard layer.opacity <= 0 else { return }
        let fallbackOpacity = visibleFallbackOpacity(for: layer.id)
        engine.setOpacity(for: layer.id, to: fallbackOpacity)
    }

    private func visibleFallbackOpacity(for layerId: String) -> CGFloat {
        if layerId == nsAerialLayerId {
            return nsAerialBasemapOpacity
        }

        guard let catalogID = LayerID(rawValue: layerId),
              let descriptor = LayerCatalog.descriptor(for: catalogID),
              descriptor.defaultOpacity > 0 else {
            return restoredOverlayOpacity
        }

        return descriptor.defaultOpacity
    }
}
