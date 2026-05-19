import SwiftUI

final class MockMapEngine: MapEngine {
    private(set) var layers: [any MapLayer] = []
    private(set) var annotations: [MapAnnotation] = []

    var showsUserLocation = false
    func centerOnUserLocation() {}

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

    func setVisible(for layerId: String, to visible: Bool) {
        guard let layer = layers.first(where: { $0.id == layerId }) else { return }
        layer.isVisible = visible
    }

    func addAnnotation(_ annotation: MapAnnotation) {
        annotations.append(annotation)
    }

    func removeAnnotation(by id: String) {
        annotations.removeAll { $0.id == id }
    }

    func setAnnotationSelectionHandler(_ handler: @escaping (String) -> Void) {}

    func makeMapView() -> AnyView {
        AnyView(
            VStack {
                Text("Mock Map")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.gray.opacity(0.2))

                if !annotations.isEmpty {
                    Text("\(annotations.count) annotation(s)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        )
    }
}
