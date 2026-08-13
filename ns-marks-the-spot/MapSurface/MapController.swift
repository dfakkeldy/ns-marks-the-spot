import CoreLocation
import MapKit
import Observation

/// Interaction events flowing back from the map surface, routed through a
/// single handler so future interaction modes can gate them centrally.
enum MapEvent {
    case headingChanged(Double)
    case annotationSelected(id: String)
    case boundsSelected(MapBounds)
}

/// Owns the MKMapView, its delegate work, and the applied `MapViewState`.
/// All state changes flow through `apply(_:)`, which reconciles via
/// `MapStateDiff`; the imperative helpers below are thin wrappers that
/// mutate the desired state and apply it.
@Observable
final class MapController: NSObject {
    private(set) var state = MapViewState()
    @ObservationIgnored var events: ((MapEvent) -> Void)?

    @ObservationIgnored private let tileCache: TileCache?
    @ObservationIgnored private let tileFetcher: TileFetcher?
    @ObservationIgnored private let clearanceBox: LicenceClearanceBox
    @ObservationIgnored private let locationManager = CLLocationManager()
    private(set) var isWaitingToCenterOnUserLocation = false
    private(set) var mapHeading: Double = 0

    @ObservationIgnored private var selectionStartCoordinate: CLLocationCoordinate2D?
    @ObservationIgnored private var selectionOverlay: MKPolygon?
    @ObservationIgnored private var wasScrollEnabled = true
    @ObservationIgnored private var wasZoomEnabled = true

    init(
        tileCache: TileCache? = nil,
        tileFetcher: TileFetcher? = nil,
        clearanceBox: LicenceClearanceBox = LicenceClearanceBox()
    ) {
        self.tileCache = tileCache
        self.tileFetcher = tileFetcher
        self.clearanceBox = clearanceBox
        super.init()
        locationManager.delegate = self
    }

    @ObservationIgnored weak var mapView: MKMapView? {
        didSet {
            syncStateToAttachedMapView()
        }
    }

    // MARK: - State application

    func apply(_ desired: MapViewState) {
        let mutations = MapStateDiff.mutations(from: state, to: desired)
        state = desired
        guard let mapView else { return }
        for mutation in mutations {
            perform(mutation, on: mapView)
        }
    }

    private func mutate(_ transform: (inout MapViewState) -> Void) {
        var desired = state
        transform(&desired)
        apply(desired)
    }

    private func perform(_ mutation: MapMutation, on mapView: MKMapView) {
        switch mutation {
        case .setMapType(let baseType):
            mapView.mapType = Self.mkMapType(for: baseType)

        case .addTileOverlay(let layer):
            let overlay = OpacityTileOverlay(
                configuration: layer.configuration,
                tileCache: tileCache,
                tileFetcher: tileFetcher,
                clearanceBox: clearanceBox
            )
            overlay.canReplaceMapContent = false
            overlay.minimumZ = layer.configuration.minZoom
            overlay.maximumZ = layer.configuration.maxZoom
            mapView.addOverlay(overlay)

        case .removeTileOverlay(let id):
            for overlay in mapView.overlays {
                if let tileOverlay = overlay as? OpacityTileOverlay,
                   tileOverlay.configuration.id == id {
                    mapView.removeOverlay(tileOverlay)
                }
            }

        case .setTileOverlayAlpha(let id, let alpha):
            for overlay in mapView.overlays {
                if let tileOverlay = overlay as? OpacityTileOverlay,
                   tileOverlay.configuration.id == id {
                    tileOverlay.renderer?.alpha = alpha
                }
            }

        case .addAnnotation(let annotation):
            mapView.addAnnotation(MapKitPointAnnotation(annotation: annotation))

        case .removeAnnotation(let id):
            for annotation in mapView.annotations where annotation.mapAnnotationID == id {
                mapView.removeAnnotation(annotation)
            }

        case .setShowsUserLocation(let shows):
            mapView.showsUserLocation = shows

        case .beginBoundsSelection:
            wasScrollEnabled = mapView.isScrollEnabled
            wasZoomEnabled = mapView.isZoomEnabled
            mapView.isScrollEnabled = false
            mapView.isZoomEnabled = false

        case .endBoundsSelection:
            selectionStartCoordinate = nil
            if let selectionOverlay {
                mapView.removeOverlay(selectionOverlay)
            }
            selectionOverlay = nil
            mapView.isScrollEnabled = wasScrollEnabled
            mapView.isZoomEnabled = wasZoomEnabled
        }
    }

    /// A freshly attached MKMapView matches an empty `MapViewState`
    /// (standard map type, no overlays or annotations), so replaying the diff
    /// from empty brings it up to the applied state — including layers and
    /// annotations added before the view existed.
    private func syncStateToAttachedMapView() {
        guard let mapView else { return }
        for mutation in MapStateDiff.mutations(from: MapViewState(), to: state) {
            perform(mutation, on: mapView)
        }
    }

    private static func mkMapType(for baseType: MapBaseType) -> MKMapType {
        switch baseType {
        case .standard:
            return .standard
        case .satellite:
            return .satellite
        case .hybrid:
            return .hybrid
        case .nsAerial:
            // NS Aerial renders as a tile overlay above the standard basemap.
            return .standard
        }
    }

    // MARK: - Convenience state accessors

    var layers: [MapLayerState] { state.layers }
    var annotations: [MapAnnotation] { state.annotations }
    var isSelectingBounds: Bool { state.interactionMode == .selectingBounds }

    var baseMapType: MapBaseType {
        get { state.baseMapType }
        set { mutate { $0.baseMapType = newValue } }
    }

    var showsUserLocation: Bool {
        get { state.showsUserLocation }
        set {
            if newValue {
                locationManager.requestWhenInUseAuthorization()
            }
            mutate { $0.showsUserLocation = newValue }
        }
    }

    // MARK: - Layers

    func addLayer(_ layer: MapLayerState) {
        guard !state.layers.contains(where: { $0.id == layer.id }) else { return }
        mutate { $0.layers.append(layer) }
    }

    func removeLayer(by id: String) {
        mutate { $0.layers.removeAll { $0.id == id } }
    }

    func setOpacity(for layerID: String, to value: CGFloat) {
        mutate { state in
            guard let index = state.layers.firstIndex(where: { $0.id == layerID }) else { return }
            state.layers[index].opacity = min(max(value, 0), 1)
        }
    }

    func setVisible(for layerID: String, to visible: Bool) {
        mutate { state in
            guard let index = state.layers.firstIndex(where: { $0.id == layerID }) else { return }
            state.layers[index].isVisible = visible
        }
    }

    // MARK: - Annotations

    func addAnnotation(_ annotation: MapAnnotation) {
        guard !state.annotations.contains(where: { $0.id == annotation.id }) else { return }
        mutate { $0.annotations.append(annotation) }
    }

    func removeAnnotation(by id: String) {
        mutate { $0.annotations.removeAll { $0.id == id } }
    }

    // MARK: - Location

    func centerOnUserLocation() {
        guard let location = mapView?.userLocation.location else {
            isWaitingToCenterOnUserLocation = true
            return
        }
        center(on: location)
    }

    private func center(on location: CLLocation) {
        isWaitingToCenterOnUserLocation = false
        let region = MKCoordinateRegion(
            center: location.coordinate,
            latitudinalMeters: 5000,
            longitudinalMeters: 5000
        )
        mapView?.setRegion(region, animated: true)
    }

    // MARK: - Heading

    func resetHeading() {
        guard let mapView else { return }
        let camera = mapView.camera.copy() as! MKMapCamera
        camera.heading = 0
        mapView.setCamera(camera, animated: true)
        mapHeading = 0
        events?(.headingChanged(0))
    }

    // MARK: - Bounds selection

    func beginBoundsSelection() {
        mutate { $0.interactionMode = .selectingBounds }
    }

    func endBoundsSelection() {
        mutate { $0.interactionMode = .idle }
    }

    /// Delivers a completed selection through the event stream. Gated on the
    /// interaction mode so a stale gesture can never emit after selection ends.
    func completeBoundsSelection(with bounds: MapBounds) {
        guard state.interactionMode == .selectingBounds else { return }
        events?(.boundsSelected(bounds.normalized))
    }

    func currentVisibleBounds() -> MapBounds? {
        guard let region = mapView?.region else { return nil }
        return MapBounds(
            minLatitude: region.center.latitude - region.span.latitudeDelta / 2,
            minLongitude: region.center.longitude - region.span.longitudeDelta / 2,
            maxLatitude: region.center.latitude + region.span.latitudeDelta / 2,
            maxLongitude: region.center.longitude + region.span.longitudeDelta / 2
        ).normalized
    }

    private func updateSelectionOverlay(from start: CLLocationCoordinate2D, to end: CLLocationCoordinate2D) {
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

    @objc func handleSelectionPan(_ recognizer: UIPanGestureRecognizer) {
        guard let mapView = recognizer.view as? MKMapView else { return }

        let point = recognizer.location(in: mapView)
        let coordinate = mapView.convert(point, toCoordinateFrom: mapView)

        switch recognizer.state {
        case .began:
            selectionStartCoordinate = coordinate
            updateSelectionOverlay(from: coordinate, to: coordinate)
        case .changed:
            guard let start = selectionStartCoordinate else { return }
            updateSelectionOverlay(from: start, to: coordinate)
        case .ended:
            guard let start = selectionStartCoordinate else { return }
            let bounds = MapBounds(
                minLatitude: min(start.latitude, coordinate.latitude),
                minLongitude: min(start.longitude, coordinate.longitude),
                maxLatitude: max(start.latitude, coordinate.latitude),
                maxLongitude: max(start.longitude, coordinate.longitude)
            )
            completeBoundsSelection(with: bounds)
            endBoundsSelection()
        case .cancelled, .failed:
            endBoundsSelection()
        default:
            break
        }
    }
}

// MARK: - MKMapViewDelegate

extension MapController: MKMapViewDelegate {
    func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
        let heading = mapView.camera.heading
        mapHeading = heading
        events?(.headingChanged(heading))
    }

    func mapView(_ mapView: MKMapView, didUpdate userLocation: MKUserLocation) {
        guard isWaitingToCenterOnUserLocation,
              userLocation.location != nil else { return }
        centerOnUserLocation()
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        if let polygon = overlay as? MKPolygon {
            let renderer = MKPolygonRenderer(polygon: polygon)
            renderer.fillColor = UIColor.systemBlue.withAlphaComponent(0.15)
            renderer.strokeColor = .systemBlue
            renderer.lineWidth = 2
            return renderer
        }

        guard let tileOverlay = overlay as? OpacityTileOverlay else {
            return MKOverlayRenderer(overlay: overlay)
        }
        let renderer = MKTileOverlayRenderer(tileOverlay: tileOverlay)
        renderer.alpha = state.layers.first { $0.id == tileOverlay.configuration.id }?.effectiveAlpha ?? 1.0
        tileOverlay.renderer = renderer
        return renderer
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard !(annotation is MKUserLocation) else { return nil }
        guard annotation is MKPointAnnotation else { return nil }

        let identifier = "POIAnnotation"
        let view: MKMarkerAnnotationView
        if let dequeued = mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? MKMarkerAnnotationView {
            dequeued.annotation = annotation
            view = dequeued
        } else {
            view = MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: identifier)
        }
        view.canShowCallout = true
        view.markerTintColor = .systemRed
        view.glyphImage = UIImage(systemName: "mappin")
        return view
    }

    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        guard let annotation = view.annotation as? MapKitAnnotationIdentifying else { return }
        events?(.annotationSelected(id: annotation.mapAnnotationID))
    }
}

// MARK: - UIGestureRecognizerDelegate

extension MapController: UIGestureRecognizerDelegate {
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        isSelectingBounds
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        false
    }
}

// MARK: - CLLocationManagerDelegate

// `@preconcurrency`: CLLocationManagerDelegate requirements are nonisolated,
// but the manager is created on the main run loop, so callbacks arrive on the
// main thread and may satisfy the requirements from this main-actor class.
extension MapController: @preconcurrency CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            mapView?.showsUserLocation = state.showsUserLocation
            if isWaitingToCenterOnUserLocation {
                centerOnUserLocation()
            }
        case .denied, .restricted:
            isWaitingToCenterOnUserLocation = false
        case .notDetermined:
            break
        @unknown default:
            break
        }
    }
}

// MARK: - Annotation bridging

nonisolated protocol MapKitAnnotationIdentifying: MKAnnotation {
    var mapAnnotationID: String { get }
}

/// `nonisolated`: MKPointAnnotation's designated `init()` is nonisolated, and an
/// implicitly main-actor subclass may not change the isolation of an inherited
/// initializer. The stored identifier is immutable, so any isolation may read it.
nonisolated final class MapKitPointAnnotation: MKPointAnnotation, MapKitAnnotationIdentifying {
    let mapAnnotationID: String

    init(annotation: MapAnnotation) {
        self.mapAnnotationID = annotation.id
        super.init()
        title = annotation.title
        subtitle = annotation.subtitle
        coordinate = CLLocationCoordinate2D(
            latitude: annotation.latitude,
            longitude: annotation.longitude
        )
    }
}

nonisolated private extension MKAnnotation {
    var mapAnnotationID: String? {
        (self as? MapKitAnnotationIdentifying)?.mapAnnotationID
    }
}
