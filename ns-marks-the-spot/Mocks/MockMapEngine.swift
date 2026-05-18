import SwiftUI

final class MockMapEngine: MapEngine {
    private(set) var layers: [any MapLayer] = []

    func addLayer(_ layer: any MapLayer) {
        layers.append(layer)
    }

    func removeLayer(by id: String) {
        layers.removeAll { $0.id == id }
    }

    func setOpacity(for layerId: String, to value: CGFloat) {
        guard let layer = layers.first(where: { $0.id == layerId }) else { return }
        layer.opacity = min(max(value, 0), 1)
    }

    func makeMapView() -> AnyView {
        AnyView(
            Text("Mock Map")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.gray.opacity(0.2))
        )
    }
}
