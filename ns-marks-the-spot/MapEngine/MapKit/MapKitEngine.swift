import CoreLocation
import MapKit
import SwiftUI

final class MapKitEngine: MapEngine {
    private(set) var layers: [any MapLayer] = []
    private(set) var annotations: [MapAnnotation] = []
    private let tileCache: TileCache?
    private let tileFetcher: TileFetcher?
    private var annotationSelectionHandler: ((String) -> Void)?
    var boundsSelectionHandler: ((MapBounds) -> Void)?
    var isSelectingBounds = false
    var selectionStartCoordinate: CLLocationCoordinate2D?
    var selectionOverlay: MKPolygon?
    private var pendingAnnotations: [MapAnnotation] = []
    private var wasScrollEnabled = true
    private var wasZoomEnabled = true

    init(tileCache: TileCache? = nil, tileFetcher: TileFetcher? = nil) {
        self.tileCache = tileCache
        self.tileFetcher = tileFetcher
    }

    weak var mapView: MKMapView? {
        didSet {
            syncPendingToMapView()
            updateMapType()
            mapView?.showsUserLocation = showsUserLocation
        }
    }

    var mapHeading: Double = 0
    var headingChangeHandler: ((Double) -> Void)?

    func resetHeading() {
        guard let mapView = mapView else { return }
        let camera = mapView.camera.copy() as! MKMapCamera
        camera.heading = 0
        mapView.setCamera(camera, animated: true)
        mapHeading = 0
        headingChangeHandler?(0)
    }

    var baseMapType: MapBaseType = .standard {
        didSet {
            updateMapType()
        }
    }

    private func updateMapType() {
        guard let mapView = mapView else { return }
        switch baseMapType {
        case .standard:
            mapView.mapType = .standard
        case .satellite:
            mapView.mapType = .satellite
        case .hybrid:
            mapView.mapType = .hybrid
        case .nsAerial:
            mapView.mapType = .standard
        }
    }

    private let locationManager = CLLocationManager()

    var showsUserLocation = false {
        didSet {
            if showsUserLocation {
                locationManager.requestWhenInUseAuthorization()
            }
            mapView?.showsUserLocation = showsUserLocation
        }
    }

    func centerOnUserLocation() {
        guard let location = mapView?.userLocation.location else { return }
        let region = MKCoordinateRegion(
            center: location.coordinate,
            latitudinalMeters: 5000,
            longitudinalMeters: 5000
        )
        mapView?.setRegion(region, animated: true)
    }

    // MARK: - Layers

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

    func setVisible(for layerId: String, to visible: Bool) {
        guard let layer = layers.first(where: { $0.id == layerId }) else { return }
        layer.isVisible = visible
        guard let mapView else { return }
        for overlay in mapView.overlays {
            if let tileOverlay = overlay as? OpacityTileOverlay,
               tileOverlay.mapLayer?.id == layerId {
                tileOverlay.renderer?.alpha = visible ? layer.opacity : 0
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

    // MARK: - Annotations

    func addAnnotation(_ annotation: MapAnnotation) {
        guard !annotations.contains(where: { $0.id == annotation.id }) else { return }
        annotations.append(annotation)
        guard let mapView else {
            pendingAnnotations.append(annotation)
            return
        }
        let point = MKPointAnnotation()
        point.title = annotation.title
        point.subtitle = annotation.id
        point.coordinate = CLLocationCoordinate2D(
            latitude: annotation.coordinate.latitude,
            longitude: annotation.coordinate.longitude
        )
        mapView.addAnnotation(point)
    }

    func removeAnnotation(by id: String) {
        annotations.removeAll { $0.id == id }
        pendingAnnotations.removeAll { $0.id == id }
        guard let mapView else { return }
        for annotation in mapView.annotations {
            if let point = annotation as? MKPointAnnotation, point.subtitle == id {
                mapView.removeAnnotation(point)
            }
        }
    }

    func setAnnotationSelectionHandler(_ handler: @escaping (String) -> Void) {
        annotationSelectionHandler = handler
    }

    func beginBoundsSelection(_ handler: @escaping (MapBounds) -> Void) {
        endBoundsSelection()
        boundsSelectionHandler = handler
        isSelectingBounds = true

        guard let mapView else { return }
        wasScrollEnabled = mapView.isScrollEnabled
        wasZoomEnabled = mapView.isZoomEnabled
        mapView.isScrollEnabled = false
        mapView.isZoomEnabled = false
    }

    func endBoundsSelection() {
        boundsSelectionHandler = nil
        isSelectingBounds = false
        selectionStartCoordinate = nil

        if let selectionOverlay, let mapView {
            mapView.removeOverlay(selectionOverlay)
        }
        selectionOverlay = nil

        guard let mapView else { return }
        mapView.isScrollEnabled = wasScrollEnabled
        mapView.isZoomEnabled = wasZoomEnabled
    }

    func handleAnnotationSelected(id: String) {
        annotationSelectionHandler?(id)
    }

    // MARK: - View

    func makeMapView() -> AnyView {
        AnyView(MapKitMapView(engine: self))
    }

    // MARK: - Private

    private func addOverlayToMapView(_ layer: any MapLayer) {
        guard let mapView else { return }
        if case .vector = layer.type { return }
        let overlay = OpacityTileOverlay(tileCache: tileCache, tileFetcher: tileFetcher)
        overlay.mapLayer = layer
        overlay.canReplaceMapContent = false
        overlay.minimumZ = layer.minZoom
        overlay.maximumZ = layer.maxZoom
        mapView.addOverlay(overlay)

        // Force renderer update if it's already created
        if let renderer = overlay.renderer {
            renderer.alpha = layer.isVisible ? layer.opacity : 0.0
        }
    }

    private func syncPendingToMapView() {
        guard let mapView else { return }

        let existingIDs = Set(
            mapView.overlays.compactMap { ($0 as? OpacityTileOverlay)?.mapLayer?.id }
        )
        for layer in layers where !existingIDs.contains(layer.id) {
            addOverlayToMapView(layer)
        }

        for annotation in pendingAnnotations {
            let point = MKPointAnnotation()
            point.title = annotation.title
            point.subtitle = annotation.id
            point.coordinate = CLLocationCoordinate2D(
                latitude: annotation.coordinate.latitude,
                longitude: annotation.coordinate.longitude
            )
            mapView.addAnnotation(point)
        }
        pendingAnnotations.removeAll()
    }

    func updateSelectionOverlay(from start: CLLocationCoordinate2D, to end: CLLocationCoordinate2D) {
        guard let mapView else { return }

        if let selectionOverlay {
            mapView.removeOverlay(selectionOverlay)
        }

        let coordinates = [
            CLLocationCoordinate2D(latitude: start.latitude, longitude: start.longitude),
            CLLocationCoordinate2D(latitude: start.latitude, longitude: end.longitude),
            CLLocationCoordinate2D(latitude: end.latitude, longitude: end.longitude),
            CLLocationCoordinate2D(latitude: end.latitude, longitude: start.longitude)
        ]
        let polygon = MKPolygon(coordinates: coordinates, count: coordinates.count)
        selectionOverlay = polygon
        mapView.addOverlay(polygon)
    }
}
