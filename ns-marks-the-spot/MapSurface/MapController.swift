import CoreLocation
import MapKit
import NSDataServices
import Observation

/// Interaction events flowing back from the map surface, routed through a
/// single handler so future interaction modes can gate them centrally.
enum MapEvent {
    case headingChanged(Double)
    case annotationSelected(id: String)
    case boundsSelected(MapBounds)
    /// A single tap on the map itself, at the coordinate under the finger.
    ///
    /// Whether it means anything is the handler's decision — this reports where
    /// the user touched, not that a parcel should be identified.
    case mapTapped(latitude: Double, longitude: Double)
    /// The view stopped moving. Leaflet's `moveend`/`zoomend`, which is what
    /// the viewport feature layers re-query on — every frame of a pan would be
    /// a query for ground the user is already leaving.
    case visibleRegionSettled
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

    /// The map's current zoom, as the whole number the tile pyramid is indexed
    /// by, so the panel can say which layers are too far out to load.
    ///
    /// Whole numbers because that is the only resolution the answer needs and
    /// because this is written from `mapViewDidChangeVisibleRegion`, which fires
    /// on every frame of a pinch; a `Double` here would invalidate every view
    /// reading it sixty times a second to say nothing new.
    private(set) var zoomLevel: Int = 0

    /// What each installed layer's tiles are doing, keyed by layer id.
    ///
    /// Written from `progress`, which counts on MapKit's queues and reports
    /// only the transitions.
    private(set) var layerLoadPhases: [String: TileLoadPhase] = [:]

    @ObservationIgnored let progress = LayerLoadProgressBox()

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
        progress.observe { [weak self] layerID in
            Task { @MainActor in
                guard let self else { return }
                // Read back rather than take a value from the notification: two
                // tile queues can transition the same layer moments apart and
                // these hops are not ordered, so the only value that is safe to
                // publish is the one the box holds right now.
                let phase = self.progress.phase(for: layerID)
                guard self.layerLoadPhases[layerID] != phase else { return }
                self.layerLoadPhases[layerID] = phase
            }
        }
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
                clearanceBox: clearanceBox,
                progress: progress
            )
            overlay.canReplaceMapContent = false
            overlay.minimumZ = layer.configuration.minZoom
            overlay.maximumZ = layer.configuration.maxZoom
            // At the position the web draws it in, not on top. Install order is
            // z-order, so a layer switched on after a parcel was selected would
            // otherwise paint over the outline the user is looking at — imagery
            // hiding the boundary it is being compared to — and over the vector
            // layers, which sit above every raster.
            mapView.installInDrawOrder(overlay)

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

        case .setFeatureShapes(let shapes):
            mapView.removeOverlays(
                mapView.overlays.filter { $0 is FeaturePolygon || $0 is FeaturePolyline }
            )
            // Ascending by the web's drawing order, so a zoning wash goes down
            // before the reaches and parcels that must stay readable over it,
            // and old growth — whose pane the web parents to the tile pane —
            // goes under the rasters rather than over them.
            let ordered = shapes.sorted { $0.zIndex < $1.zIndex }
                .flatMap { $0.overlays() }
            for overlay in ordered {
                mapView.installInDrawOrder(overlay)
            }

        case .setFeatureMarkers(let markers):
            mapView.removeAnnotations(
                mapView.annotations.compactMap { $0 as? FeatureMarkerAnnotation }
            )
            mapView.addAnnotations(markers.map(FeatureMarkerAnnotation.init(marker:)))

        case .setParcelShapes(let shapes):
            mapView.removeOverlays(mapView.overlays.compactMap { $0 as? ParcelPolygon })
            for polygon in shapes.flatMap({ ParcelPolygon.polygons(for: $0) }) {
                mapView.installInDrawOrder(polygon)
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
        // Same reason as hiding: the overlay goes away with tiles still in the
        // air, and a layer re-added later gets a new overlay whose cycle those
        // stragglers must not settle.
        progress.reset(id)
        layerLoadPhases[id] = nil
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
        guard !visible else { return }
        // A layer switched off forgets where its tiles got to, so switching it
        // back on reads "Ready to load" rather than reopening on a failure from
        // whatever the network was doing when the user last had it on.
        progress.reset(layerID)
        layerLoadPhases[layerID] = .idle
    }

    // MARK: - Annotations

    func addAnnotation(_ annotation: MapAnnotation) {
        guard !state.annotations.contains(where: { $0.id == annotation.id }) else { return }
        mutate { $0.annotations.append(annotation) }
    }

    func setParcelShapes(_ shapes: [ParcelShape]) {
        mutate { $0.parcelShapes = shapes }
    }

    func setFeatureShapes(_ shapes: [FeatureShape]) {
        mutate { $0.featureShapes = shapes }
    }

    func setFeatureMarkers(_ markers: [FeatureMarker]) {
        mutate { $0.featureMarkers = markers }
    }

    /// Brings `bounds` into view, with room around it.
    ///
    /// The padding is what makes a selected parcel readable rather than
    /// touching the edges of the screen; MapKit will also clamp the rect to a
    /// minimum span, so a very small lot stops at a sensible zoom instead of
    /// filling the screen with one corner of it.
    func focus(on bounds: MapBounds) {
        guard let mapView else { return }
        let corner = MKMapPoint(
            CLLocationCoordinate2D(
                latitude: bounds.maxLatitude, longitude: bounds.minLongitude
            )
        )
        let opposite = MKMapPoint(
            CLLocationCoordinate2D(
                latitude: bounds.minLatitude, longitude: bounds.maxLongitude
            )
        )
        let rect = MKMapRect(
            x: min(corner.x, opposite.x),
            y: min(corner.y, opposite.y),
            width: abs(opposite.x - corner.x),
            height: abs(opposite.y - corner.y)
        )
        guard !rect.isNull, rect.size.width > 0, rect.size.height > 0 else { return }
        mapView.setVisibleMapRect(
            rect,
            edgePadding: UIEdgeInsets(top: 64, left: 48, bottom: 64, right: 48),
            animated: true
        )
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

    @objc func handleIdentifyTap(_ recognizer: UITapGestureRecognizer) {
        guard recognizer.state == .ended,
              let mapView = recognizer.view as? MKMapView else { return }
        let coordinate = mapView.convert(
            recognizer.location(in: mapView), toCoordinateFrom: mapView
        )
        guard CLLocationCoordinate2DIsValid(coordinate) else { return }
        events?(.mapTapped(latitude: coordinate.latitude, longitude: coordinate.longitude))
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
    func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
        events?(.visibleRegionSettled)
    }

    func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
        let heading = mapView.camera.heading
        mapHeading = heading
        events?(.headingChanged(heading))

        if let zoom = Self.tileZoomLevel(of: mapView) {
            recordZoomLevel(zoom)
        }
    }

    /// Records the zoom the map is now at.
    ///
    /// Separate from the delegate callback because the two are separately
    /// wrong-able: this one is what the panel's "Zoom to N+ to load" reading
    /// depends on, and driving it through a live `MKMapView` would mean
    /// asserting through MapKit's region clamping as well as through the
    /// reading.
    func recordZoomLevel(_ zoom: Int) {
        guard zoom != zoomLevel else { return }
        zoomLevel = zoom
    }

    /// The web-Mercator zoom the visible region corresponds to.
    ///
    /// MapKit has no zoom property; this is the standard reading of one, from
    /// how much longitude fits across the view at 256-point tiles. It is what
    /// decides whether the panel says a layer is too far out to load, so it has
    /// to mean the same thing `MKTileOverlay.minimumZ` does — which is the same
    /// `z` the tile path carries.
    ///
    /// `nil` while the view has no size, which is every call before layout: a
    /// zero width would otherwise compute a zoom of negative infinity and the
    /// panel would tell the user to zoom in on a map that has not been drawn.
    static func tileZoomLevel(of mapView: MKMapView) -> Int? {
        let width = Double(mapView.bounds.width)
        let longitudeSpan = mapView.region.span.longitudeDelta
        guard width > 0, longitudeSpan > 0 else { return nil }
        let zoom = log2(360 * (width / 256) / longitudeSpan)
        guard zoom.isFinite else { return nil }
        return Int(zoom.rounded())
    }

    func mapView(_ mapView: MKMapView, didUpdate userLocation: MKUserLocation) {
        guard isWaitingToCenterOnUserLocation,
              userLocation.location != nil else { return }
        centerOnUserLocation()
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        // Before the plain `MKPolygon` branch, which it is a kind of: the
        // bounds-selection rectangle and a parcel boundary are both polygons
        // and must not be drawn as the same thing.
        if let parcel = overlay as? ParcelPolygon {
            return Self.renderer(for: parcel)
        }

        if let feature = overlay as? FeaturePolygon {
            let renderer = MKPolygonRenderer(polygon: feature)
            Self.apply(feature.style, to: renderer)
            return renderer
        }

        if let feature = overlay as? FeaturePolyline {
            let renderer = MKPolylineRenderer(polyline: feature)
            Self.apply(feature.style, to: renderer)
            return renderer
        }

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

    /// The web's interactive parcel styling, so a boundary reads the same on
    /// both surfaces.
    ///
    /// The selection is an outline with no fill: the point of selecting a
    /// parcel is to compare its boundary against the imagery under it, and a
    /// tint over the whole lot is what you would have to see through.
    static func renderer(for parcel: ParcelPolygon) -> MKPolygonRenderer {
        let renderer = MKPolygonRenderer(polygon: parcel)
        switch parcel.role {
        case .selected:
            renderer.strokeColor = UIColor(red: 0.624, green: 0.184, blue: 0.141, alpha: 1)
            renderer.fillColor = .clear
            renderer.lineWidth = 4
        case .selectedHistorical:
            renderer.strokeColor = UIColor(red: 0.286, green: 0.200, blue: 0.435, alpha: 1)
            renderer.fillColor = .clear
            renderer.lineWidth = 4
        case .taxSale:
            renderer.strokeColor = UIColor(red: 0.745, green: 0.302, blue: 0.235, alpha: 1)
            renderer.fillColor = UIColor(red: 0.906, green: 0.659, blue: 0.420, alpha: 0.3)
            renderer.lineWidth = 2
        case .historicalTaxSale:
            renderer.strokeColor = UIColor(red: 0.353, green: 0.263, blue: 0.522, alpha: 1)
            renderer.fillColor = UIColor(red: 0.643, green: 0.580, blue: 0.800, alpha: 0.34)
            renderer.lineWidth = 2.25
            // Dashed on the web, and dashed here: on this map a dashed outline
            // says the parcel is being drawn for a record rather than for a
            // current offering, and drawing it solid would upgrade the claim.
            renderer.lineDashPattern = [5, 3]
        case .context:
            renderer.strokeColor = UIColor(red: 0.039, green: 0.443, blue: 0.502, alpha: 1)
            renderer.fillColor = UIColor(red: 0.933, green: 0.969, blue: 0.961, alpha: 0.08)
            renderer.lineWidth = 1.25
        }
        return renderer
    }

    /// The web's path options, applied to a MapKit renderer.
    ///
    /// The dash pattern is carried across rather than dropped: on this map a
    /// dashed outline is a statement — the location is approximate, or the
    /// polygon is something this app derived — and a renderer that quietly drew
    /// it solid would upgrade the claim.
    static func apply(_ style: VectorFeatureStyle, to renderer: MKOverlayPathRenderer) {
        renderer.strokeColor = UIColor(
            featureHex: style.strokeHex, alpha: style.strokeOpacity
        )
        renderer.fillColor = style.fillHex.map {
            UIColor(featureHex: $0, alpha: style.fillOpacity)
        }
        renderer.lineWidth = style.lineWidth
        renderer.lineDashPattern = style.dashPattern?.map { NSNumber(value: $0) }
        renderer.lineCap = style.hasRoundedEnds ? .round : .butt
        renderer.lineJoin = style.hasRoundedEnds ? .round : .miter
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard !(annotation is MKUserLocation) else { return nil }

        // Before the pin branch: a well log and a saved point of interest are
        // both point annotations, and a well drawn as a dropped pin would read
        // as a place someone marked rather than as a record with an accuracy.
        if let feature = annotation as? FeatureMarkerAnnotation {
            let identifier = "FeatureMarker"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: feature, reuseIdentifier: identifier)
            view.annotation = feature
            view.canShowCallout = true
            view.image = FeatureMarkerImage.image(for: feature.style)
            return view
        }

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
    /// The name the identify tap is registered under.
    ///
    /// Two recognizers share this delegate and want opposite answers: the
    /// bounds-selection pan may only begin while selecting bounds, and the
    /// identify tap may only begin while not. Answering by name rather than by
    /// type is what keeps adding one from disabling the other.
    static let identifyTapName = "ParcelIdentifyTap"

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        if gestureRecognizer.name == Self.identifyTapName {
            return !isSelectingBounds
        }
        return isSelectingBounds
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
