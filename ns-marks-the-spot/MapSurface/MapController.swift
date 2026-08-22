import CoreLocation
import GeoCore
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
    /// A vertex handle the user dragged to a new place.
    case vertexMoved(featureID: String, ring: Int, vertex: Int, latitude: Double, longitude: Double)
    /// A whole feature carried, reported as the offset it travelled rather than
    /// where the handle landed: the shape moves by that offset, and its own
    /// positions are what the geometry is made of.
    case featureMoved(featureID: String, latitudeDelta: Double, longitudeDelta: Double)
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

        case .setUserMaps(let drapes):
            // Replaced wholesale, like the feature shapes: a record's mesh is
            // rebuilt by any edit to its placement, so "the same overlay with
            // one thing changed" is not a state this has.
            mapView.removeOverlays(mapView.overlays.compactMap { $0 as? UserMapOverlay })
            for drape in drapes {
                guard let overlay = UserMapOverlay(
                    record: drape.record, image: drape.image, alpha: drape.alpha
                ) else { continue }
                mapView.installInDrawOrder(overlay)
            }

        case .setUserVectors(let drawings):
            // Overlays and annotations together, because a layer's points and
            // its boundaries are one thing to the user: removing them in two
            // passes would leave the waypoints of a layer that was switched off
            // sitting on the map.
            mapView.removeOverlays(
                mapView.overlays.filter { $0 is UserVectorPolygon || $0 is UserVectorPolyline }
            )
            mapView.removeAnnotations(
                mapView.annotations.compactMap { $0 as? UserVectorAnnotation }
            )
            for drawing in drawings {
                for overlay in drawing.overlays() {
                    mapView.installInDrawOrder(overlay)
                }
                mapView.addAnnotations(drawing.annotations())
            }

        case .setParcelOverviewMarkers:
            installParcelOverviewMarkers(on: mapView)

        case .setVectorHandles(let handles):
            mapView.removeAnnotations(
                mapView.annotations.compactMap { $0 as? VectorVertexHandleAnnotation }
            )
            if let handles {
                mapView.addAnnotations(handles.handles())
            }

        case .setVectorMoveHandle(let handle):
            mapView.removeAnnotations(
                mapView.annotations.compactMap { $0 as? VectorMoveHandleAnnotation }
            )
            if let handle {
                mapView.addAnnotation(handle.annotation())
            }

        case .setVectorDraft(let draft):
            mapView.removeOverlays(mapView.overlays.compactMap { $0 as? VectorDraftPolyline })
            mapView.removeAnnotations(
                mapView.annotations.compactMap { $0 as? VectorDraftVertexAnnotation }
            )
            guard let draft else { break }
            if let overlay = draft.overlay() {
                mapView.installInDrawOrder(overlay)
            }
            mapView.addAnnotations(draft.handles())

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
        applyPendingCenterIfPossible()
    }

    /// A position a link asked for before the map could be put there.
    @ObservationIgnored private var pendingCenter: (point: GeoPoint, zoom: Int, animated: Bool)?

    /// Retried whenever the map view changes, which is how a launch-time link
    /// gets its position once layout has given the view a width.
    private func applyPendingCenterIfPossible() {
        guard let pending = pendingCenter, let mapView, mapView.bounds.width > 0 else { return }
        center(on: pending.point, zoom: pending.zoom, animated: pending.animated)
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

    /// Ask a failing layer for its tiles again.
    ///
    /// The web offers this beside the status line, and it matters more in the
    /// field than at a desk: a source that timed out on one bar of signal is
    /// usually fine a minute later, and without a retry the only way back is to
    /// switch the layer off and on — which a user has no reason to guess, and
    /// which reads as the layer being broken rather than the moment being.
    ///
    /// The overlay is torn down and rebuilt rather than nudged. MapKit holds
    /// its own images per overlay instance, so the failed squares of the old
    /// one would otherwise stay on screen however the fetch went.
    func retryTiles(for layerID: String) {
        guard let index = state.layers.firstIndex(where: { $0.id == layerID }),
              state.layers[index].isVisible
        else { return }
        let layer = state.layers[index]
        progress.reset(layerID)
        layerLoadPhases[layerID] = .idle
        // The replacement renderer reads its alpha back out of `state.layers`,
        // which this does not touch, so the layer comes back at the opacity the
        // user had it at rather than fully opaque.
        mapView.map { perform(.removeTileOverlay(id: layer.id), on: $0) }
        mapView.map { perform(.addTileOverlay(layer), on: $0) }
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

    /// What an overview marker's annotation id begins with, so a tap can be
    /// routed back to the parcel it stands for.
    nonisolated static let parcelOverviewPrefix = "parcel-overview-"

    func setParcelOverviewMarkers(_ markers: [ParcelOverviewMarker]) {
        mutate { $0.parcelOverviewMarkers = markers }
    }

    func setParcelShapes(_ shapes: [ParcelShape]) {
        mutate { $0.parcelShapes = shapes }
    }

    func setFeatureShapes(_ shapes: [FeatureShape]) {
        mutate { $0.featureShapes = shapes }
    }

    func setUserMaps(_ drapes: [UserMapDrape]) {
        mutate { $0.userMaps = drapes }
    }

    func setUserVectors(_ drawings: [UserVectorDrawing]) {
        mutate { $0.userVectors = drawings }
    }

    func setVectorDraft(_ draft: VectorDraftPreview?) {
        mutate { $0.vectorDraft = draft }
    }

    func setVectorHandles(_ handles: VectorSelectionHandles?) {
        mutate { $0.vectorHandles = handles }
    }

    func setVectorMoveHandle(_ handle: VectorMoveHandle?) {
        mutate { $0.vectorMoveHandle = handle }
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
    /// `maxZoom` caps how far in the fit may go, as the web's `fitBounds` does.
    /// Without it, a sale that advertised one small lot would open the map at
    /// the lot's fence line, which says nothing about where the sale is.
    func focus(on bounds: MapBounds, maxZoom: Int? = nil) {
        // Anything that moves the map deliberately outranks a link's held
        // position: applying it later would drag the reader off what they just
        // asked to see.
        pendingCenter = nil
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
        var rect = MKMapRect(
            x: min(corner.x, opposite.x),
            y: min(corner.y, opposite.y),
            width: abs(opposite.x - corner.x),
            height: abs(opposite.y - corner.y)
        )
        guard !rect.isNull, rect.size.width > 0, rect.size.height > 0 else { return }
        if let maxZoom, mapView.bounds.width > 0 {
            // The longitude a view this wide covers at that zoom, read the same
            // way `tileZoomLevel` reads a zoom off a span: 256-point tiles.
            let widest = 360 * (Double(mapView.bounds.width) / 256) / pow(2, Double(maxZoom))
            let span = abs(bounds.maxLongitude - bounds.minLongitude)
            if span < widest, span >= 0 {
                let centre = MKMapPoint(x: rect.midX, y: rect.midY)
                let scale = widest / max(span, .leastNormalMagnitude)
                let width = min(rect.size.width * scale, MKMapRect.world.size.width)
                let height = min(rect.size.height * scale, MKMapRect.world.size.height)
                rect = MKMapRect(
                    x: centre.x - width / 2, y: centre.y - height / 2,
                    width: width, height: height
                )
            }
        }
        mapView.setVisibleMapRect(
            rect,
            edgePadding: UIEdgeInsets(top: 64, left: 48, bottom: 64, right: 48),
            animated: true
        )
    }

    /// Puts the map where a shared link says it was, at the zoom it names.
    ///
    /// The zoom is a web-Mercator tile zoom, which MapKit has no setter for, so
    /// it is turned back into a width on the ground the same way
    /// `tileZoomLevel` reads one off: 256-point tiles across the view. Nothing
    /// happens before layout — a view with no width has no span to be at, and
    /// guessing one would land the reader somewhere the sender never was.
    ///
    /// `animated` is false for the opening view, which has no previous position
    /// to travel from: the map would otherwise fly to its own first frame.
    func center(on point: GeoPoint, zoom: Int, animated: Bool = true) {
        guard let mapView, mapView.bounds.width > 0 else {
            // A link opened at launch arrives before the map has a width. Held
            // rather than dropped, because the alternative is a reader who
            // followed a link and landed on the opening view of the province.
            pendingCenter = (point, zoom, animated)
            return
        }
        pendingCenter = nil
        let metresPerPoint = 156_543.03392 * cos(point.lat * .pi / 180)
            / pow(2, Double(zoom))
        let width = metresPerPoint * Double(mapView.bounds.width)
        guard width.isFinite, width > 0 else { return }
        mapView.setRegion(
            MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng),
                latitudinalMeters: width,
                longitudinalMeters: width
            ),
            animated: animated
        )
    }

    /// Frames a bounding box, with room around it.
    ///
    /// Padded rather than fitted exactly, so a layer's outermost feature is not
    /// left touching the edge of the screen where the panel and the controls
    /// sit over it. A degenerate box — one point, or one straight line — is
    /// given a minimum span rather than a zero-sized region, which MapKit
    /// clamps to an arbitrary zoom.
    func frame(_ box: GeoBoundingBox) {
        guard let mapView else { return }
        let latitudeSpan = max((box.north - box.south) * 1.25, 0.002)
        let longitudeSpan = max((box.east - box.west) * 1.25, 0.002)
        guard latitudeSpan.isFinite, longitudeSpan.isFinite else { return }
        pendingCenter = nil
        mapView.setRegion(
            MKCoordinateRegion(
                center: CLLocationCoordinate2D(
                    latitude: (box.north + box.south) / 2,
                    longitude: (box.east + box.west) / 2
                ),
                span: MKCoordinateSpan(
                    latitudeDelta: latitudeSpan, longitudeDelta: longitudeSpan
                )
            ),
            animated: true
        )
    }

    func removeAnnotation(by id: String) {
        mutate { $0.annotations.removeAll { $0.id == id } }
    }

    // MARK: - Location

    /// The three things the web says about a location request, word for word.
    ///
    /// The refusal is the one that matters. A button that quietly does nothing
    /// reads as a broken button rather than as a permission the reader can
    /// change, and this app had no way to say which it was.
    enum LocationMessage: String, Sendable {
        case searching = "Finding your location\u{2026}"
        case found = "Your location is shown on the map."
        case denied = "Location permission was not granted. You can keep using the map."
    }

    /// What to tell the reader about the last location request, if anything.
    private(set) var locationMessage: LocationMessage?

    /// How long the success message stays up, as the web keeps it.
    static let locationFoundMessageDuration: Duration = .seconds(4)

    @ObservationIgnored private var locationMessageDismissal: Task<Void, Never>?

    /// What an authorization answer is worth telling the reader.
    ///
    /// `readerAsked` is the whole rule: this app is told about authorization at
    /// launch as well as after a tap, and a refusal announced to someone who
    /// never pressed the button is a complaint about a feature they did not
    /// use. Separate from the callback because a test can name a status, while
    /// a `CLLocationManager` in a test process cannot be given one.
    static func locationMessage(
        for status: CLAuthorizationStatus,
        readerAsked: Bool
    ) -> LocationMessage? {
        switch status {
        case .denied, .restricted:
            return readerAsked ? .denied : nil
        default:
            return nil
        }
    }

    func centerOnUserLocation() {
        if let refusal = Self.locationMessage(
            for: locationManager.authorizationStatus, readerAsked: true
        ) {
            // Answered before the map asked. The delegate is not called for a
            // status that did not change, so a refusal already on file has to
            // be reported here or the button stays silent for exactly the
            // readers who need to know why nothing happened.
            isWaitingToCenterOnUserLocation = false
            report(refusal)
            return
        }
        report(.searching)
        guard let location = mapView?.userLocation.location else {
            isWaitingToCenterOnUserLocation = true
            return
        }
        center(on: location)
    }

    /// Shows a message, and takes the success one down again after a while.
    ///
    /// Only the success message expires. The other two describe a request that
    /// has not finished and a setting that has not changed, and neither stops
    /// being true because time passed.
    private func report(_ message: LocationMessage) {
        locationMessageDismissal?.cancel()
        locationMessageDismissal = nil
        locationMessage = message
        guard message == .found else { return }
        locationMessageDismissal = Task { [weak self] in
            try? await Task.sleep(for: Self.locationFoundMessageDuration)
            guard !Task.isCancelled else { return }
            guard self?.locationMessage == .found else { return }
            self?.locationMessage = nil
        }
    }

    private func center(on location: CLLocation) {
        isWaitingToCenterOnUserLocation = false
        report(.found)
        // Same rule as `focus(on:)`: going to where the reader is outranks a
        // link's held position.
        pendingCenter = nil
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

    // MARK: - Screen scale

    /// How much ground one point of screen covers at the centre of the view.
    ///
    /// Measured across a 100-point sample through the centre, as the web
    /// measures it, rather than derived from the zoom: at Nova Scotia's
    /// latitude a Mercator tile covers about two thirds of the ground its zoom
    /// nominally says, and a readout that ignored that would be wrong by half.
    func groundMetresPerPoint() -> Double? {
        guard let mapView, mapView.bounds.width > 0 else { return nil }
        let sample = 100.0
        let centre = CGPoint(x: mapView.bounds.midX, y: mapView.bounds.midY)
        let left = mapView.convert(centre, toCoordinateFrom: mapView)
        let right = mapView.convert(
            CGPoint(x: centre.x + sample, y: centre.y), toCoordinateFrom: mapView
        )
        guard CLLocationCoordinate2DIsValid(left), CLLocationCoordinate2DIsValid(right) else {
            return nil
        }
        let metres = MKMapPoint(left).distance(to: MKMapPoint(right))
        guard metres.isFinite, metres > 0 else { return nil }
        return metres / sample
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

    /// The tile overlays currently installed, keyed by layer id.
    ///
    /// The export composites through these rather than building its own: they
    /// are what is holding the tile cache and the licence clearance, and an
    /// export that fetched around them would be a second, ungated route to the
    /// same sources.
    func installedTileOverlays() -> [String: OpacityTileOverlay] {
        var installed = [String: OpacityTileOverlay]()
        for overlay in mapView?.overlays ?? [] {
            if let tileOverlay = overlay as? OpacityTileOverlay {
                installed[tileOverlay.configuration.id] = tileOverlay
            }
        }
        return installed
    }

    /// Where the map is, for drawing an export frame over it.
    ///
    /// The zoom is the same reading `tileZoomLevel` takes and deliberately not
    /// rounded to it: the frame's ground is computed from this number, and a
    /// zoom rounded to the nearest tile level would export ground up to half a
    /// zoom away from the picture the user framed.
    ///
    /// The size is the map view's own, which is the whole screen — the frame
    /// layer is drawn ignoring the safe area for the same reason, so the
    /// rectangle the arithmetic places and the rectangle the user sees are the
    /// same rectangle.
    /// Put the map flat and north-up, and hold it there while the page is being
    /// framed.
    ///
    /// The frame's arithmetic reads screen x as east and screen y as south, the
    /// way a printed north-up page does. Under a rotated or pitched camera that
    /// is false: the rectangle on screen and the ground the export claims come
    /// apart, and the page would be an axis-aligned area the reader never drew,
    /// labelled with a scale computed from it. Straightening the camera is
    /// visible and undoable; exporting the wrong ground is neither.
    func beginPrintFraming() {
        guard let mapView else { return }
        mapView.isRotateEnabled = false
        mapView.isPitchEnabled = false
        guard mapView.camera.heading != 0 || mapView.camera.pitch != 0 else { return }
        let camera = mapView.camera.copy() as! MKMapCamera
        camera.heading = 0
        camera.pitch = 0
        mapView.setCamera(camera, animated: false)
        mapHeading = 0
        events?(.headingChanged(0))
    }

    func endPrintFraming() {
        mapView?.isRotateEnabled = true
        mapView?.isPitchEnabled = true
    }

    func printFraming() -> (
        centre: GeoPoint, zoom: Double, container: (width: Double, height: Double)
    )? {
        guard let mapView else { return nil }
        // Belt and braces with `beginPrintFraming`: no framing at all rather
        // than framing that lies about which ground it covers.
        let heading = mapView.camera.heading
        guard heading < 0.5 || heading > 359.5, mapView.camera.pitch < 0.5 else { return nil }
        let width = Double(mapView.bounds.width)
        let height = Double(mapView.bounds.height)
        let longitudeSpan = mapView.region.span.longitudeDelta
        guard width > 0, height > 0, longitudeSpan > 0 else { return nil }
        let zoom = log2(360 * (width / 256) / longitudeSpan)
        guard zoom.isFinite else { return nil }
        let centre = mapView.region.center
        return (
            GeoPoint(lat: centre.latitude, lng: centre.longitude),
            zoom,
            (width: width, height: height)
        )
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
        applyPendingCenterIfPossible()
        events?(.visibleRegionSettled)
    }

    func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
        applyPendingCenterIfPossible()
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
        let wasOverview = zoomLevel <= ParcelMarkers.overviewMaxZoom
        let isOverview = zoom <= ParcelMarkers.overviewMaxZoom
        zoomLevel = zoom
        // Only on the crossing. This runs on every frame of a pinch, and
        // rebuilding the annotations sixty times a second to say the same thing
        // would be the pinch the user notices.
        if wasOverview != isOverview, let mapView {
            installParcelOverviewMarkers(on: mapView)
        }
    }

    /// The markers the current zoom calls for: all of them below the threshold,
    /// none above it, where the boundaries themselves are legible.
    private func installParcelOverviewMarkers(on mapView: MKMapView) {
        mapView.removeAnnotations(
            mapView.annotations.compactMap { $0 as? ParcelOverviewAnnotation }
        )
        guard zoomLevel <= ParcelMarkers.overviewMaxZoom else { return }
        mapView.addAnnotations(
            state.parcelOverviewMarkers.map(ParcelOverviewAnnotation.init(marker:))
        )
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

        if let userMap = overlay as? UserMapOverlay {
            return UserMapOverlayRenderer(userMap: userMap)
        }

        if let draft = overlay as? VectorDraftPolyline {
            let renderer = MKPolylineRenderer(polyline: draft)
            renderer.strokeColor = UIColor(featureHex: draft.colorHex)
            renderer.lineWidth = 2
            // Dashed, because this is a gesture in progress rather than data:
            // drawn solid it would look like a feature the layer already holds.
            renderer.lineDashPattern = [6, 4]
            renderer.lineCap = .round
            renderer.lineJoin = .round
            return renderer
        }

        // Before the catalogued feature branches, though they are unrelated
        // classes: a user's polygon is styled from their own file's simplestyle
        // properties, not from the catalog's vocabulary.
        if let polygon = overlay as? UserVectorPolygon {
            let renderer = MKPolygonRenderer(polygon: polygon)
            Self.apply(polygon.style, to: renderer)
            return renderer
        }

        if let polyline = overlay as? UserVectorPolyline {
            let renderer = MKPolylineRenderer(polyline: polyline)
            Self.apply(polyline.style, to: renderer)
            // Rounded, because a user's own line is usually a route or a
            // sketched boundary rather than a surveyed edge, and mitred joins
            // spike at every sharp corner of a hand-drawn track.
            renderer.lineCap = .round
            renderer.lineJoin = .round
            return renderer
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

    /// The same, for a user's own layer.
    ///
    /// A separate overload rather than a shared type: the catalog's styling
    /// vocabulary and the simplestyle properties a user's file may carry are
    /// different vocabularies, and collapsing them would mean inventing a dash
    /// pattern or a marker radius for a file that never specified one.
    static func apply(_ style: UserVectorStyle, to renderer: MKOverlayPathRenderer) {
        renderer.strokeColor = UIColor(featureHex: style.strokeHex, alpha: style.strokeOpacity)
        renderer.fillColor = UIColor(featureHex: style.fillHex, alpha: style.fillOpacity)
        renderer.lineWidth = CGFloat(style.weight)
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard !(annotation is MKUserLocation) else { return nil }

        // Before the pin branch: a well log and a saved point of interest are
        // both point annotations, and a well drawn as a dropped pin would read
        // as a place someone marked rather than as a record with an accuracy.
        if let marker = annotation as? ParcelOverviewAnnotation {
            let identifier = "ParcelOverviewMarker"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: marker, reuseIdentifier: identifier)
            view.annotation = marker
            // No callout: the tap opens the parcel's own panel, which is where
            // a listing is read, and a bubble over it would say less.
            view.canShowCallout = false
            view.image = ParcelOverviewMarkerImage.image(
                role: marker.role, isSelected: marker.isSelected
            )
            return view
        }

        if let handle = annotation as? VectorVertexHandleAnnotation {
            let identifier = "VectorVertexHandle"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: handle, reuseIdentifier: identifier)
            view.annotation = handle
            view.canShowCallout = false
            // Dragged rather than tapped-then-tapped: MapKit's own drag is the
            // gesture the user already knows, and it moves the handle under the
            // finger instead of asking them to aim twice.
            view.isDraggable = true
            view.image = VectorDraftHandleImage.image(colorHex: handle.colorHex)
            return view
        }

        if let handle = annotation as? VectorMoveHandleAnnotation {
            let identifier = "VectorMoveHandle"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: handle, reuseIdentifier: identifier)
            view.annotation = handle
            view.canShowCallout = false
            view.isDraggable = true
            // Deliberately unlike a vertex handle: dragging this one moves the
            // whole shape, and two handles that looked the same would make that
            // a surprise rather than a choice.
            view.image = VectorMoveHandleImage.image(colorHex: handle.colorHex)
            return view
        }

        if let handle = annotation as? VectorDraftVertexAnnotation {
            let identifier = "VectorDraftHandle"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: handle, reuseIdentifier: identifier)
            view.annotation = handle
            // No callout: a vertex is not a record, and a popup over the shape
            // being drawn would cover the ground the next tap has to land on.
            view.canShowCallout = false
            view.image = VectorDraftHandleImage.image(colorHex: handle.colorHex)
            return view
        }

        // A user's own point, before both: it is drawn in their layer's colour
        // and its callout carries the provenance line that says the app did not
        // publish it.
        if let point = annotation as? UserVectorAnnotation {
            let identifier = "UserVectorPoint"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: point, reuseIdentifier: identifier)
            view.annotation = point
            // The app's own card rather than MapKit's callout bubble: the
            // bubble has a title and a subtitle and no third line, and the
            // provenance is not optional decoration — a marker the user
            // imported has to say so wherever it is shown.
            view.canShowCallout = false
            view.image = UserVectorMarkerImage.image(for: point.style)
            return view
        }

        if let feature = annotation as? FeatureMarkerAnnotation {
            let identifier = "FeatureMarker"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: feature, reuseIdentifier: identifier)
            view.annotation = feature
            // The app's own card, for the same reason the user's markers use
            // one: the bubble holds a title and a subtitle, and these records
            // do not travel without the source that published them and the
            // sentence saying what they are not evidence of. Two callouts on
            // one dot would have meant the shorter one could be read alone.
            view.canShowCallout = false
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

    /// Reports a dragged vertex once, when the finger lifts.
    ///
    /// On `.ending` rather than on every move: a drag reports continuously, and
    /// committing each step would write a revision of the layer for every pixel
    /// the finger travelled.
    func mapView(
        _ mapView: MKMapView,
        annotationView view: MKAnnotationView,
        didChange newState: MKAnnotationView.DragState,
        fromOldState oldState: MKAnnotationView.DragState
    ) {
        if let handle = view.annotation as? VectorMoveHandleAnnotation {
            guard newState == .ending else { return }
            let landed = handle.coordinate
            events?(
                .featureMoved(
                    featureID: handle.featureID,
                    latitudeDelta: landed.latitude - handle.origin.lat,
                    longitudeDelta: landed.longitude - handle.origin.lng
                )
            )
            return
        }

        guard newState == .ending || newState == .canceling,
              let handle = view.annotation as? VectorVertexHandleAnnotation
        else { return }
        // Told where it ended up rather than where MapKit thinks it is: the
        // view's own coordinate is the one the drag left behind.
        let coordinate = handle.coordinate
        guard newState == .ending else { return }
        events?(
            .vertexMoved(
                featureID: handle.featureID,
                ring: handle.ring,
                vertex: handle.vertex,
                latitude: coordinate.latitude,
                longitude: coordinate.longitude
            )
        )
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
        let status = manager.authorizationStatus
        if let message = Self.locationMessage(
            for: status, readerAsked: isWaitingToCenterOnUserLocation
        ) {
            report(message)
        }
        switch status {
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
