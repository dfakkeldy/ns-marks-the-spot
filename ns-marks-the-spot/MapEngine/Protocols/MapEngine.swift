import SwiftUI

enum MapBaseType: String, CaseIterable, Identifiable {
    case standard = "Standard"
    case satellite = "Satellite"
    case hybrid = "Hybrid"
    case nsAerial = "NS Aerial"

    var id: String { self.rawValue }
}

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
    func beginBoundsSelection(_ handler: @escaping (MapBounds) -> Void)
    func endBoundsSelection()

    var mapHeading: Double { get }
    var headingChangeHandler: ((Double) -> Void)? { get set }
    func resetHeading()

    var baseMapType: MapBaseType { get set }

    /// Returns a SwiftUI view wrapping the native map implementation.
    func makeMapView() -> AnyView
}
