import SwiftUI

protocol MapEngine: AnyObject {
    var layers: [any MapLayer] { get }

    func addLayer(_ layer: any MapLayer)
    func removeLayer(by id: String)
    func setOpacity(for layerId: String, to value: CGFloat)
    func setVisible(for layerId: String, to visible: Bool)

    var showsUserLocation: Bool { get set }
    func centerOnUserLocation()

    var annotations: [MapAnnotation] { get }
    func addAnnotation(_ annotation: MapAnnotation)
    func removeAnnotation(by id: String)
    func setAnnotationSelectionHandler(_ handler: @escaping (String) -> Void)

    /// Returns a SwiftUI view wrapping the native map implementation.
    func makeMapView() -> AnyView
}
