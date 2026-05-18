import MapKit
import SwiftUI

final class MapKitEngine: MapEngine {
    private(set) var layers: [any MapLayer] = []
    private let tileCache: TileCache?

    init(tileCache: TileCache? = nil) {
        self.tileCache = tileCache
    }

    weak var mapView: MKMapView? {
        didSet { syncPendingOverlays() }
    }

    func addLayer(_ layer: any MapLayer) {
        layers.append(layer)
        addOverlayToMapView(layer)
    }

    func removeLayer(by id: String) {
        layers.removeAll { $0.id == id }
        guard let mapView else { return }
        for overlay in mapView.overlays {
            if let tileOverlay = overlay as? OpacityTileOverlay,
               tileOverlay.mapLayer?.id == id {
                mapView.removeOverlay(tileOverlay)
            }
        }
    }

    func setOpacity(for layerId: String, to value: CGFloat) {
        guard let layer = layers.first(where: { $0.id == layerId }) else { return }
        layer.opacity = min(max(value, 0), 1)
        guard let mapView else { return }
        for overlay in mapView.overlays {
            if let tileOverlay = overlay as? OpacityTileOverlay,
               tileOverlay.mapLayer?.id == layerId {
                tileOverlay.renderer?.alpha = layer.opacity
            }
        }
    }

    func makeMapView() -> AnyView {
        AnyView(MapKitMapView(engine: self))
    }

    private func addOverlayToMapView(_ layer: any MapLayer) {
        guard let mapView, case .tile = layer.type else { return }
        let overlay = OpacityTileOverlay(tileCache: tileCache)
        overlay.mapLayer = layer
        overlay.canReplaceMapContent = false
        mapView.addOverlay(overlay)
    }

    private func syncPendingOverlays() {
        guard let mapView else { return }
        let existingIDs = Set(
            mapView.overlays.compactMap { ($0 as? OpacityTileOverlay)?.mapLayer?.id }
        )
        for layer in layers where !existingIDs.contains(layer.id) {
            addOverlayToMapView(layer)
        }
    }
}
