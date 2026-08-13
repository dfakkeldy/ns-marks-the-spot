import Combine
import SwiftUI

@MainActor
final class OverlayViewModel: ObservableObject {
    private let nsAerialLayerId = LayerID.nsAerial.rawValue
    private let nsAerialBasemapOpacity: CGFloat = 1.0
    private let restoredOverlayOpacity: CGFloat = 0.7

    var layers: [MapLayerState] { controller.layers }
    var baseMapType: MapBaseType { controller.baseMapType }

    private let controller: MapController

    init(controller: MapController) {
        self.controller = controller
    }

    func setBaseMapType(_ type: MapBaseType) {
        controller.baseMapType = type
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

    func updateLayerOpacity(for id: String, to value: CGFloat) {
        controller.setOpacity(for: id, to: value)
        objectWillChange.send()
    }

    func toggleVisibility(_ id: String) {
        guard let layer = controller.layers.first(where: { $0.id == id }) else { return }

        if id == nsAerialLayerId {
            toggleNSAerialVisibility(layer)
            objectWillChange.send()
            return
        }

        let newVisibility = !layer.isVisible
        if newVisibility {
            restoreVisibleOpacityIfNeeded(for: layer)
        }
        controller.setVisible(for: id, to: newVisibility)
        objectWillChange.send()
    }

    private func syncNSAerialLayerVisibility(for type: MapBaseType) {
        guard let nsAerialLayer = controller.layers.first(where: { $0.id == nsAerialLayerId }) else {
            return
        }

        if type == .nsAerial {
            if nsAerialLayer.opacity <= 0 {
                controller.setOpacity(for: nsAerialLayerId, to: nsAerialBasemapOpacity)
            }
            controller.setVisible(for: nsAerialLayerId, to: true)
        } else if nsAerialLayer.isVisible {
            controller.setVisible(for: nsAerialLayerId, to: false)
        }
    }

    private func toggleNSAerialVisibility(_ layer: MapLayerState) {
        if layer.isVisible {
            controller.setVisible(for: nsAerialLayerId, to: false)
            if controller.baseMapType == .nsAerial {
                controller.baseMapType = .standard
            }
        } else {
            restoreVisibleOpacityIfNeeded(for: layer)
            controller.setVisible(for: nsAerialLayerId, to: true)
            controller.baseMapType = .nsAerial
        }
    }

    private func restoreVisibleOpacityIfNeeded(for layer: MapLayerState) {
        guard layer.opacity <= 0 else { return }
        let fallbackOpacity = visibleFallbackOpacity(for: layer.id)
        controller.setOpacity(for: layer.id, to: fallbackOpacity)
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
