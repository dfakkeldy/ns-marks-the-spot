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
    /// A press-and-hold on the map itself, at the coordinate under the
    /// finger: the other way to place a point while a drawing tool is armed.
    /// Never begins on an annotation view, whose press-and-hold is a drag.
    case mapLongPressed(latitude: Double, longitude: Double)
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
    /// A cluster whose members zooming cannot pull apart: several photos
    /// from one standing spot, or a map already as close as it goes. The
    /// members' annotation ids, for a card that shows them together.
    case clusterSelected(ids: [String])
}

/// Owns the MKMapView, its delegate work, and the applied `MapViewState`.
/// All state changes flow through `apply(_:)`, which reconciles via
/// `MapStateDiff`; the imperative helpers below are thin wrappers that
/// mutate the desired state and apply it.
@Observable
final class MapController: NSObject {
    // MARK: - Applied surface state
    //
    // One observable stored property per field, not one property holding the
    // whole `MapViewState`: Observation tracks property access, and a view
    // reading `layers` through a monolithic `state` re-rendered on every
    // vector-draft frame and every feature replace. `state` below composes
    // the same value for the diff; `applyStorage` writes back only the fields
    // that changed, so each mutation notifies exactly its own observers.

    private var appliedBaseMapType: MapBaseType = .openStreetMap
    private var appliedLayers: [MapLayerState] = []
    private var appliedParcelShapes: [ParcelShape] = []
    private var appliedFeatureShapes: [FeatureShape] = []
    private var appliedFeatureMarkers: [FeatureMarker] = []
    private var appliedUserMaps: [UserMapDrape] = []
    private var appliedUserVectors: [UserVectorDrawing] = []
    private var appliedVectorDraft: VectorDraftPreview?
    private var appliedVectorHandles: VectorSelectionHandles?
    private var appliedVectorMoveHandle: VectorMoveHandle?
    private var appliedParcelOverviewMarkers: [ParcelOverviewMarker] = []
    private var appliedShowsUserLocation = false
    private var appliedInteractionMode: MapInteractionMode = .idle

    /// The applied state, composed. Reading this in a tracked context depends
    /// on every field — code that only needs one should read that field's own
    /// accessor.
    var state: MapViewState {
        MapViewState(
            baseMapType: appliedBaseMapType,
            layers: appliedLayers,
            parcelShapes: appliedParcelShapes,
            featureShapes: appliedFeatureShapes,
            featureMarkers: appliedFeatureMarkers,
            userMaps: appliedUserMaps,
            userVectors: appliedUserVectors,
            vectorDraft: appliedVectorDraft,
            vectorHandles: appliedVectorHandles,
            vectorMoveHandle: appliedVectorMoveHandle,
            parcelOverviewMarkers: appliedParcelOverviewMarkers,
            showsUserLocation: appliedShowsUserLocation,
            interactionMode: appliedInteractionMode
        )
    }

    private func applyStorage(_ desired: MapViewState, from current: MapViewState) {
        // Guarded per field — an @Observable set notifies that property's
        // observers even when the value is unchanged.
        if current.baseMapType != desired.baseMapType { appliedBaseMapType = desired.baseMapType }
        if current.layers != desired.layers { appliedLayers = desired.layers }
        if current.parcelShapes != desired.parcelShapes { appliedParcelShapes = desired.parcelShapes }
        if current.featureShapes != desired.featureShapes { appliedFeatureShapes = desired.featureShapes }
        if current.featureMarkers != desired.featureMarkers { appliedFeatureMarkers = desired.featureMarkers }
        if current.userMaps != desired.userMaps { appliedUserMaps = desired.userMaps }
        if current.userVectors != desired.userVectors { appliedUserVectors = desired.userVectors }
        if current.vectorDraft != desired.vectorDraft { appliedVectorDraft = desired.vectorDraft }
        if current.vectorHandles != desired.vectorHandles { appliedVectorHandles = desired.vectorHandles }
        if current.vectorMoveHandle != desired.vectorMoveHandle { appliedVectorMoveHandle = desired.vectorMoveHandle }
        if current.parcelOverviewMarkers != desired.parcelOverviewMarkers {
            appliedParcelOverviewMarkers = desired.parcelOverviewMarkers
        }
        if current.showsUserLocation != desired.showsUserLocation {
            appliedShowsUserLocation = desired.showsUserLocation
        }
        if current.interactionMode != desired.interactionMode {
            appliedInteractionMode = desired.interactionMode
        }
    }
    @ObservationIgnored var events: ((MapEvent) -> Void)?
    /// Whether the closest-zoom limit has been set. Set once, from the first
    /// laid-out frame, and never again: recalibrating would move the limit
    /// every time the reader rotated the phone.
    /// The map's width when the closest-zoom limit was last worked out, or
    /// nil if it has not been. Keyed by width rather than a flag, because the
    /// distance that means "zoom 23" depends on how wide the map is: on an
    /// iPad that is split and then made whole again the old figure would be
    /// off by the ratio of the two widths.
    @ObservationIgnored private var clampedAtWidth: CGFloat?

    @ObservationIgnored private let tileCache: TileCache?
    @ObservationIgnored private let tileFetcher: TileFetcher?
    /// Where a saved offline area keeps its tiles.
    ///
    /// Separate from the cache, and read for a different reason: the cache is
    /// whatever the user happened to pan over and is swept when it grows, while
    /// this is what they asked the app to keep. The overlay asks it before the
    /// network, which is what makes a saved area mean anything once the phone
    /// is off the network.
    @ObservationIgnored private let tileStore: TileStore?
    @ObservationIgnored private let fletcherMigration: Task<Void, Never>?
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

    /// Whether the map has said where it is even once.
    ///
    /// A freshly attached `MKMapView` answers `region` immediately, while
    /// `zoomLevel` is still the 0 it was born with — so between attaching and
    /// the first delegate callback the map reads as a real centre at a zoom it
    /// is not at. Anything writing that pair down has to ask this first.
    private(set) var hasReportedItsPosition = false

    /// Whether the view on screen was put there by the reader's location
    /// rather than by the reader.
    ///
    /// Following moves the camera on every fix, and the field-capture
    /// contract keeps those views out of share links, evidence notes,
    /// printed receipts and the saved session: where somebody is standing is
    /// not what they chose to look at, and a link is something they hand to
    /// someone else. The browser sets a suppress flag for the same reason.
    /// Cleared by anything the reader chose — a hand on the map, a search, a
    /// link, a framing — because those views are theirs to share.
    private(set) var viewportIsLocationDriven = false

    /// What each installed layer's tiles are doing, keyed by layer id.
    ///
    /// Written from `progress`, which counts on MapKit's queues and reports
    /// only the transitions.
    private(set) var layerLoadPhases: [String: TileLoadPhase] = [:]

    @ObservationIgnored let progress = LayerLoadProgressBox()

    @ObservationIgnored private var selectionStartCoordinate: CLLocationCoordinate2D?
    @ObservationIgnored private var selectionOverlay: BoundsSelectionOverlay?
    @ObservationIgnored private var wasScrollEnabled = true
    @ObservationIgnored private var wasZoomEnabled = true

    init(
        tileCache: TileCache? = nil,
        tileFetcher: TileFetcher? = nil,
        tileStore: TileStore? = nil,
        fletcherMigration: Task<Void, Never>? = nil,
        clearanceBox: LicenceClearanceBox = LicenceClearanceBox()
    ) {
        self.tileCache = tileCache
        self.tileFetcher = tileFetcher
        self.tileStore = tileStore
        self.fletcherMigration = fletcherMigration
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
            // A replaced map view must stop talking: a callback it had already
            // queued would otherwise set the glyph for a map that is gone.
            if let oldValue, oldValue !== mapView, oldValue.delegate === self {
                oldValue.delegate = nil
            }
            // A replacement map view starts empty; the incremental
            // user-vector path must not skip installs because the previous
            // view already had them.
            installedUserVectors = []
            syncStateToAttachedMapView()
            applyBottomLayoutMargin()
            // A replacement map starts with no tracking mode, whatever the
            // glyph said of the old one; a follow armed for the old map's
            // flight has nothing to land on.
            followsOnceSettled = false
            followFallback?.cancel()
            followFallback = nil
            if userTrackingState == .following || userTrackingState == .heading {
                userTrackingState = .idle
            }
            dismissFollowMessages()
            // The closest-zoom limit was installed on the map view that was
            // measured for it, and a replacement carries none. Forgetting the
            // measurement is what makes the next region change take it again;
            // keeping it would leave a fresh map able to zoom past the floor
            // for as long as the app runs.
            clampedAtWidth = nil
        }
    }

    /// How much room the overlays along the bottom take up.
    ///
    /// MapKit puts the Apple logo and the Legal link inside the map's layout
    /// margins, and this app draws a scale bar, a position readout and a source
    /// strip over the same corner. Both of those are required to stay visible,
    /// so the margin is raised to whatever the overlays actually measure rather
    /// than to a number picked here and left to rot as the stack changes.
    @ObservationIgnored private var bottomOrnamentInset: CGFloat = 0

    func setBottomOrnamentInset(_ inset: CGFloat) {
        guard inset != bottomOrnamentInset else { return }
        bottomOrnamentInset = inset
        applyBottomLayoutMargin()
    }

    // MARK: - State application

    func apply(_ desired: MapViewState) {
        let current = state
        let mutations = MapStateDiff.mutations(from: current, to: desired)
        applyStorage(desired, from: current)
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
            applyBaseOverlay(for: baseType, on: mapView)

        case .addTileOverlay(let layer):
            let overlay = OpacityTileOverlay(
                configuration: layer.configuration,
                tileCache: tileCache,
                tileFetcher: tileFetcher,
                tileStore: tileStore,
                fletcherMigration: fletcherMigration,
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
            mapView.installInDrawOrder(ordered)

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
            mapView.installInDrawOrder(drapes.compactMap { drape in
                UserMapOverlay(record: drape.record, image: drape.image, alpha: drape.alpha)
            })

        case .setUserMapAlpha(let id, let alpha):
            for overlay in mapView.overlays {
                if let userMap = overlay as? UserMapOverlay, userMap.id == id {
                    userMap.alpha = alpha
                    userMap.renderer?.alpha = alpha
                }
            }

        case .setUserVectors(let drawings):
            applyUserVectors(drawings, on: mapView)

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
            // MapKit asks for permission itself when the dot goes on. Not in
            // a unit-test host: see `isRunningUnitTests`. The state is kept
            // either way, so what the diff reports is unchanged.
            mapView.showsUserLocation = shows && !Self.isRunningUnitTests

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

    /// A freshly attached MKMapView shows the standard map type with no
    /// overlays or annotations, so replaying the diff from that baseline brings
    /// it up to the applied state — including layers and annotations added
    /// before the view existed.
    ///
    /// The baseline names `.standard` explicitly because `MapViewState()`'s own
    /// default is the OpenStreetMap base: diffing from the default would find
    /// nothing to do for a map opening on it, and the fresh view would show
    /// Apple's map under a picker reading "OpenStreetMap".
    private func syncStateToAttachedMapView() {
        guard let mapView else { return }
        var bare = MapViewState()
        bare.baseMapType = .standard
        for mutation in MapStateDiff.mutations(from: bare, to: state) {
            perform(mutation, on: mapView)
        }
        applyPendingCenterIfPossible(animated: false)
    }

    /// A position a link asked for before the map could be put there.
    @ObservationIgnored private var pendingCenter: (point: GeoPoint, zoom: Int, animated: Bool)?

    /// The position waiting for a laid-out map, if anything is waiting.
    ///
    /// Read by the map surface as it is built, so the first frame it draws is
    /// the one a link or a resumed session asked for rather than the opening
    /// view of the province followed by a jump.
    var heldPosition: MapPosition? {
        pendingCenter.map {
            MapPosition(latitude: $0.point.lat, longitude: $0.point.lng, zoom: $0.zoom)
        }
    }

    /// Retried whenever the map view changes, which is how a launch-time link
    /// gets its position once layout has given the view a width.
    ///
    /// `animated` overrides what the caller asked for, for the one case where
    /// the map is only now being attached: there is nothing on screen to move
    /// away from, and animating from the first frame to the same place reads as
    /// a stumble at launch.
    private func applyPendingCenterIfPossible(animated: Bool? = nil) {
        guard let pending = pendingCenter, let mapView, mapView.bounds.width > 0 else { return }
        center(on: pending.point, zoom: pending.zoom, animated: animated ?? pending.animated)
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
        case .openStreetMap, .blank:
            // Whatever is set here is covered by the base-replacing overlay —
            // `OSMBaseOverlay` or `BlankBaseOverlay`; MapKit requires a map
            // type and has no case for "someone else's tiles" or "none".
            return .standard
        }
    }

    /// Puts in the base-replacing overlay the chosen background draws with,
    /// and takes the others out.
    ///
    /// Installed through the draw order like any other overlay, so it lands
    /// under the layers that are already on the map rather than over them —
    /// switching the base map must not blank out the sheet being read.
    private func applyBaseOverlay(for baseType: MapBaseType, on mapView: MKMapView) {
        let wantsBlank = baseType == .blank
        let wantsOSM = baseType == .openStreetMap
        for overlay in mapView.overlays {
            if overlay is BlankBaseOverlay, !wantsBlank {
                mapView.removeOverlay(overlay)
            }
            if overlay is OSMBaseOverlay, !wantsOSM {
                mapView.removeOverlay(overlay)
            }
        }
        if wantsBlank, mapView.overlays.compactMap({ $0 as? BlankBaseOverlay }).isEmpty {
            mapView.installInDrawOrder(BlankBaseOverlay())
        }
        if wantsOSM, mapView.overlays.compactMap({ $0 as? OSMBaseOverlay }).isEmpty {
            mapView.installInDrawOrder(OSMBaseOverlay())
        }
    }

    // MARK: - Convenience state accessors

    var layers: [MapLayerState] { appliedLayers }
    var isSelectingBounds: Bool { appliedInteractionMode == .selectingBounds }

    // Per-field reads for code that needs one surface field without taking a
    // dependency on all of them.
    var parcelShapes: [ParcelShape] { appliedParcelShapes }
    var featureShapes: [FeatureShape] { appliedFeatureShapes }
    var featureMarkers: [FeatureMarker] { appliedFeatureMarkers }
    var userMapDrapes: [UserMapDrape] { appliedUserMaps }
    var userVectorDrawings: [UserVectorDrawing] { appliedUserVectors }

    var baseMapType: MapBaseType {
        get { appliedBaseMapType }
        set { mutate { $0.baseMapType = newValue } }
    }

    /// True while this process is a unit-test host.
    ///
    /// The unit tests drive the real controller, so following a fix reaches
    /// the same code a tap does — and on a simulator whose permission has
    /// never been answered, that puts a system alert on the device. Nothing
    /// in a unit test dismisses it, and it outlives the process: the UI
    /// suite that runs next on the same simulator then meets an alert it did
    /// not raise, and its interruption handler cannot clear it. The UI tests
    /// run against the app itself, where this is false and the prompt
    /// behaves exactly as it does for a reader.
    nonisolated static let isRunningUnitTests =
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil

    var showsUserLocation: Bool {
        get { appliedShowsUserLocation }
        set {
            if newValue, !Self.isRunningUnitTests {
                locationManager.requestWhenInUseAuthorization()
            }
            mutate { $0.showsUserLocation = newValue }
        }
    }

    // MARK: - Layers

    func addLayer(_ layer: MapLayerState) {
        guard !appliedLayers.contains(where: { $0.id == layer.id }) else { return }
        mutate { $0.layers.append(layer) }
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
        guard let index = appliedLayers.firstIndex(where: { $0.id == layerID }),
              appliedLayers[index].isVisible
        else { return }
        let layer = appliedLayers[index]
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

    /// What the incremental user-vector path last installed, so a push that
    /// only touched the transient tail — the live trace once a second while
    /// recording, the photo map on every settle — does not tear down and
    /// rebuild every stored layer's overlays with it.
    @ObservationIgnored private var installedUserVectors: [UserVectorDrawing] = []

    /// Replaces from the first changed drawing on. The prefix that is equal
    /// to what is already installed stays untouched; the tail is removed and
    /// re-installed in array order, which is the order a full rebuild would
    /// have produced, because the prefix was installed first there too.
    private func applyUserVectors(_ drawings: [UserVectorDrawing], on mapView: MKMapView) {
        let old = installedUserVectors
        installedUserVectors = drawings
        var prefix = 0
        while prefix < old.count, prefix < drawings.count, old[prefix] == drawings[prefix] {
            prefix += 1
        }
        // The same layers in the same places past the prefix: each is
        // updated on its own, and a points-only layer whose record did not
        // change — the photo map on every pan — has only the points that
        // changed added and removed. Tearing the whole layer down re-formed
        // every cluster under the finger and closed the open callout.
        if old.count == drawings.count,
           zip(old[prefix...], drawings[prefix...]).allSatisfy({ $0.record.id == $1.record.id })
        {
            for index in prefix..<drawings.count {
                let before = old[index]
                let after = drawings[index]
                if before.record == after.record,
                   Self.isIncrementallyUpdatable(before), Self.isIncrementallyUpdatable(after)
                {
                    updateAnnotations(from: before, to: after, on: mapView)
                } else {
                    removeUserVectorShapes(on: mapView) { $0 == after.record.id }
                    mapView.installInDrawOrder(after.overlays())
                    mapView.addAnnotations(after.annotations())
                }
            }
            return
        }
        let removedIDs = Set(old[prefix...].map(\.record.id))
        // A record id repeated across the boundary would let the id-keyed
        // removal reach into the untouched prefix. Ids are unique in
        // practice; the full rebuild is the safe answer if they ever are not.
        guard removedIDs.isDisjoint(with: old[..<prefix].map(\.record.id)) else {
            removeUserVectorShapes(on: mapView) { _ in true }
            for drawing in drawings {
                mapView.installInDrawOrder(drawing.overlays())
                mapView.addAnnotations(drawing.annotations())
            }
            return
        }
        if !removedIDs.isEmpty {
            removeUserVectorShapes(on: mapView) { removedIDs.contains($0) }
        }
        for drawing in drawings[prefix...] {
            mapView.installInDrawOrder(drawing.overlays())
            mapView.addAnnotations(drawing.annotations())
        }
    }

    /// Whether a layer's annotations can be diffed by id: single points with
    /// unique ids, one annotation each. A `MultiPoint` expands to several
    /// annotations under one id, and two of them under one key made the diff
    /// drop one; such a layer is rebuilt whole instead.
    static func isIncrementallyUpdatable(_ drawing: UserVectorDrawing) -> Bool {
        var seen = Set<String>()
        for feature in drawing.parsed.features {
            switch feature.geometry {
            case .none:
                continue
            case .point:
                guard let id = feature.id, seen.insert(id).inserted else { return false }
            default:
                return false
            }
        }
        return true
    }

    /// Adds and removes only the points that changed between two versions of
    /// one points-only layer. Keyed by annotation id; a point whose look
    /// changed (its halo, its badge, its title) is replaced.
    private func updateAnnotations(
        from before: UserVectorDrawing, to after: UserVectorDrawing, on mapView: MKMapView
    ) {
        let wanted = after.annotations()
        var wantedByID: [String: UserVectorAnnotation] = [:]
        for annotation in wanted { wantedByID[annotation.mapAnnotationID] = annotation }
        var kept = Set<String>()
        var stale: [UserVectorAnnotation] = []
        for case let point as UserVectorAnnotation in mapView.annotations
        where point.layerID == after.id {
            if let want = wantedByID[point.mapAnnotationID],
               want.isHighlighted == point.isHighlighted,
               want.hasPhotos == point.hasPhotos,
               want.pointStyle == point.pointStyle,
               want.coordinate.latitude == point.coordinate.latitude,
               want.coordinate.longitude == point.coordinate.longitude,
               want.title == point.title, want.subtitle == point.subtitle
            {
                kept.insert(point.mapAnnotationID)
            } else {
                stale.append(point)
            }
        }
        guard !stale.isEmpty || kept.count < wanted.count else { return }
        let staleIDs = Set(stale.map(\.mapAnnotationID))
        // Clusters holding a stale member go too; MapKit re-forms the rest.
        let clusters = mapView.annotations.filter { annotation in
            guard let cluster = annotation as? MKClusterAnnotation else { return false }
            return cluster.memberAnnotations.contains {
                ($0 as? UserVectorAnnotation).map { staleIDs.contains($0.mapAnnotationID) } == true
            }
        }
        mapView.removeAnnotations(stale + clusters)
        mapView.addAnnotations(wanted.filter { !kept.contains($0.mapAnnotationID) })
    }

    /// Overlays and annotations together, because a layer's points and its
    /// boundaries are one thing to the user: removing them in two passes
    /// would leave the waypoints of a layer that was switched off sitting on
    /// the map. Clusters holding a removed layer's points go too — MapKit
    /// does not reliably retire them on its own.
    private func removeUserVectorShapes(
        on mapView: MKMapView, matching: (String) -> Bool
    ) {
        mapView.removeOverlays(
            mapView.overlays.filter { overlay in
                if let polygon = overlay as? UserVectorPolygon {
                    return matching(polygon.layerID)
                }
                if let polyline = overlay as? UserVectorPolyline {
                    return matching(polyline.layerID)
                }
                return false
            }
        )
        mapView.removeAnnotations(
            mapView.annotations.filter { annotation in
                if let point = annotation as? UserVectorAnnotation {
                    return matching(point.layerID)
                }
                if let cluster = annotation as? MKClusterAnnotation {
                    return cluster.memberAnnotations.contains {
                        ($0 as? UserVectorAnnotation).map { matching($0.layerID) } == true
                    }
                }
                return false
            }
        )
    }

    func setVectorDraft(_ draft: VectorDraftPreview?) {
        mutate { $0.vectorDraft = draft }
    }

    func setVectorHandles(_ handles: VectorSelectionHandles?) {
        mutate { $0.vectorHandles = handles }
    }

    /// Puts the handles back where the geometry says. For a drag that ended
    /// with the geometry unchanged — a snap back onto the stored coordinate —
    /// the state diff sees an equal value and rebuilds nothing, and MapKit
    /// leaves the dragged annotation where the finger let go.
    func reinstallVectorHandles() {
        guard let mapView else { return }
        mapView.removeAnnotations(
            mapView.annotations.compactMap { $0 as? VectorVertexHandleAnnotation }
        )
        if let handles = appliedVectorHandles {
            mapView.addAnnotations(handles.handles())
        }
        // The move handle too: a refused whole-feature drag left the arrows
        // where the finger let go, and the next drag was measured from
        // where they had been.
        mapView.removeAnnotations(
            mapView.annotations.compactMap { $0 as? VectorMoveHandleAnnotation }
        )
        if let handle = appliedVectorMoveHandle {
            mapView.addAnnotation(handle.annotation())
        }
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
    /// `asReader` is false only for the automatic fit to a sale's parcels,
    /// which is not the reader choosing a view and must not count as one.
    func focus(on bounds: MapBounds, maxZoom: Int? = nil, asReader: Bool = true) {
        // Anything that moves the map deliberately outranks a link's held
        // position: applying it later would drag the reader off what they just
        // asked to see. And a locate or a follow, for the same reason — and
        // the automatic sale fit, which yields to a reader who has chosen.
        pendingCenter = nil
        if asReader { readerHasClaimedTheCamera = true }
        cameraTakenByAnotherFeature()
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
        cameraTakenByAnotherFeature()
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
        // The map has been put at this zoom, so it stops reading as being at
        // whatever it was before — MapKit's own callback arrives a frame or
        // more later, and until it does anything asking where the map is would
        // otherwise be told 0. That is what wrote a zoom of 0 into a session
        // saved by an app backgrounded during its first frame. MapKit may fit
        // this to the view's aspect and land a fraction off; the callback
        // corrects it.
        recordZoomLevel(zoom)
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
        // A layer or an import framed on request: the reader's choice.
        readerHasClaimedTheCamera = true
        cameraTakenByAnotherFeature()
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
        /// Not a refusal the reader made: Screen Time or a management profile
        /// blocks location, and the app's Settings page cannot lift it.
        case restricted = "Location is restricted on this device, for example by Screen Time or a management profile. You can keep using the map."
        /// Location Services are off for the whole device, which CoreLocation
        /// also reports as `.denied`. Not a refusal the reader made for this
        /// app, and the switch is a different one.
        case servicesOff = "Location Services are off for this device. Turn them on in Settings, under Privacy & Security."
        /// The deadline passed with no fix at all. The same words as a failed
        /// mark: both mean the phone has no position.
        case unavailable = "Your location couldn't be found. Try again outdoors."
        /// The deadline passed with only a fix the gate would not take: old,
        /// coarse, or both. The map goes there anyway, since that is where the
        /// dot is drawn, but it is not called found.
        case approximate = "Your location may be out of date or approximate. Move outdoors for a better fix."
        /// CoreLocation failed for a reason that is not the sky: a network
        /// error, most often. Going outdoors would not repair it.
        case failed = "Your location couldn't be determined. Try again in a moment."
        /// Following, and the fixes stopped. The web's words; cleared by the
        /// next fix or by leaving follow mode.
        case signalLost = "GPS signal lost — still trying."
        /// Precise Location is off for this app: every fix is kilometres
        /// wide by design, and no amount of sky refines it. Said as the
        /// setting it is, with the way to it, rather than as weather.
        case reducedAccuracy = "Precise Location is off for this app, so your location is approximate. You can turn it on in Settings."
        /// The deadline passed with only a fix too old to trust: the phone
        /// has not had a position for a long while, and the map does not go
        /// to where it last was.
        case stale = "Your last location fix is too old, or its time could not be trusted, so it is not shown. Try again outdoors."
    }

    /// The messages that stay up until the reader takes them down: each
    /// carries a decision to make in Settings, and a timer took the button
    /// away before a VoiceOver or Switch Control reader could reach it.
    static func staysUntilDismissed(_ message: LocationMessage) -> Bool {
        switch message {
        case .denied, .restricted, .servicesOff, .reducedAccuracy: true
        default: false
        }
    }

    /// The messages whose way out is Settings: this app's page can change
    /// its permission and its Precise Location switch, and nothing else.
    static func offersSettings(_ message: LocationMessage) -> Bool {
        message == .denied || message == .reducedAccuracy
    }

    /// What the location button is doing, for its glyph.
    ///
    /// The four states every iPhone user knows from Maps: nothing, looking,
    /// following the dot, and following it heading-up. `searching` is the
    /// span between the tap and the first fix the map can use.
    enum UserTrackingState: Equatable, Sendable {
        case idle, searching, following, heading
    }

    /// What to tell the reader about the last location request, if anything.
    private(set) var locationMessage: LocationMessage?
    private(set) var userTrackingState: UserTrackingState = .idle

    /// How long a message stays up, or nil for one ended by an event rather
    /// than by time.
    ///
    /// `searching` describes a request in flight and is replaced by the fix or
    /// by the deadline; the others describe something finished. The refusal
    /// stays longest because it carries a button. Overridable so a test can
    /// watch a message expire without waiting for it.
    @ObservationIgnored var messageLifetime: @MainActor (LocationMessage) -> Duration? =
        MapController.lifetime(of:)

    static func lifetime(of message: LocationMessage) -> Duration? {
        switch message {
        // Ended by an event: the fix, the pan, the reader's own dismissal.
        // `approximate` stays while the dot is followed, because the caveat
        // is about the dot and holds until a better fix replaces it.
        case .searching, .signalLost, .approximate,
             .denied, .restricted, .servicesOff, .reducedAccuracy: nil
        case .found: .seconds(4)
        case .unavailable, .stale, .failed: .seconds(6)
        }
    }

    /// Whether Location Services are on for the device. Injected so a test can
    /// name an answer; CoreLocation's own reading is the default.
    @ObservationIgnored var servicesEnabled: () -> Bool = { CLLocationManager.locationServicesEnabled() }

    /// True once the reader has moved the map themselves or asked for their
    /// location. The automatic fit to a sale's parcels, which lands whenever
    /// its request returns, yields to them: a fit arriving late must not take
    /// the map from a reader who has said where they want it.
    private(set) var readerHasClaimedTheCamera = false
    /// Counts every deliberate claim on the camera: a locate tap, a pan, a
    /// search or link or framing that moved the map. An asynchronous lookup
    /// notes the count when it starts and focuses on its result only if the
    /// count has not moved since — a parcel that answers after the reader
    /// asked for their location must not take the map back from them.
    private(set) var cameraClaimGeneration = 0

    /// How long the button waits for a fix the gate would take before it
    /// settles for whatever the map has, or says that it has nothing.
    static let locateDeadline: Duration = .seconds(10)

    /// The loosest fix the button centres on before the deadline.
    ///
    /// Looser than Mark's 10 s / 50 m rule, which decides what is saved as
    /// evidence; this only decides where the map goes, and follow mode moves
    /// it again as the fix refines. Tight enough to skip CoreLocation's cached
    /// last-known position, which a cold first tap was otherwise centred on.
    static let locateMaxAccuracyM: Double = 100
    static let locateMaxFixAge: TimeInterval = 30
    /// The oldest fix the deadline settles for. A few minutes old is still
    /// about where the reader is; hours old is where the phone last had a
    /// position, and sending the map there was the stale-location jump
    /// this button was reported for, arriving ten seconds late.
    static let locateStaleFixAge: TimeInterval = 600
    /// Under Precise Location off, CoreLocation hands out a coarse fix about
    /// every fifteen to twenty minutes and says so (`CLLocationManager.h`: a
    /// reduced-accuracy location may be up to twenty minutes old). A fix
    /// that age is the best the setting allows, not a phone that has lost
    /// its position; the deadline takes it, named as the setting.
    static let reducedAccuracyMaxFixAge: TimeInterval = 1200
    /// Whether this app has only approximate location. Injected for tests;
    /// CoreLocation's own reading is the default.
    @ObservationIgnored var isReducedAccuracy: (() -> Bool)?
    private var hasReducedAccuracy: Bool {
        isReducedAccuracy?() ?? (locationManager.accuracyAuthorization == .reducedAccuracy)
    }
    /// A fix stamped a moment ahead of the clock is jitter (and, in the
    /// simulator, every simulated fix); one stamped an hour ahead is not a
    /// fix to trust.
    static let locateClockTolerance: TimeInterval = 2

    /// Whether the locate flight and follow mode animate. The container sets
    /// it from Reduce Motion before each tap.
    @ObservationIgnored var animatesLocate = true

    /// The widest the button leaves the map, as ground across the view: a
    /// locate from a province-wide view comes in to this, one from closer
    /// stays where it is.
    static let locateSpanMetres: Double = 5000

    @ObservationIgnored private var locationMessageDismissal: Task<Void, Never>?
    @ObservationIgnored private var locateDeadlineTask: Task<Void, Never>?
    @ObservationIgnored private var followFallback: Task<Void, Never>?
    /// Follow mode is switched on once the locate flight has settled, not
    /// during it: MapKit's own centring would cut the animation short.
    @ObservationIgnored private var followsOnceSettled = false

    /// What an authorization answer is worth telling the reader.
    ///
    /// `readerAsked` is the whole rule: this app is told about authorization at
    /// launch as well as after a tap, and a refusal announced to someone who
    /// never pressed the button is a complaint about a feature they did not
    /// use. Separate from the callback because a test can name a status, while
    /// a `CLLocationManager` in a test process cannot be given one.
    static func locationMessage(
        for status: CLAuthorizationStatus,
        readerAsked: Bool,
        servicesEnabled: Bool = true
    ) -> LocationMessage? {
        switch status {
        case .denied:
            // `.denied` is also what CoreLocation says when Location Services
            // are off for the whole device; that is a different switch.
            return readerAsked ? (servicesEnabled ? .denied : .servicesOff) : nil
        case .restricted:
            // Kept apart from a refusal: a Settings button cannot lift it,
            // and calling it "not granted" blames the reader for a policy.
            return readerAsked ? .restricted : nil
        default:
            return nil
        }
    }

    /// The fix MapKit is drawing the user dot from, in the recorder's type.
    ///
    /// Nil until the map has one. Offered to the mark button so it can use the
    /// position already on screen instead of asking CoreLocation for a fresh
    /// one, which can take ten seconds and, with no location at all, fails
    /// while the dot is still showing.
    func userLocationFix() -> TrackFix? {
        guard let location = mapView?.userLocation.location else { return nil }
        return TrackFix(location: location)
    }

    /// The location button.
    ///
    /// The first tap finds the reader and follows them; the next switches to
    /// heading-up, and the one after that back to plain follow, as Maps does.
    /// A pan releases follow mode through MapKit, and the delegate mirrors
    /// whatever it settled on.
    func centerOnUserLocation(now: Date = Date()) {
        // Asked for, whatever the answer: an automatic fit that lands later
        // must not take the map from a reader who has said where they want it.
        readerHasClaimedTheCamera = true
        cameraClaimGeneration += 1
        dismissedReducedAccuracy = false
        let status = locationManager.authorizationStatus
        if let refusal = Self.locationMessage(
            for: status, readerAsked: true,
            servicesEnabled: status == .denied ? servicesEnabled() : true
        ) {
            // Answered before the map asked. The delegate is not called for a
            // status that did not change, so a refusal already on file has to
            // be reported here or the button stays silent for exactly the
            // readers who need to know why nothing happened.
            stopLocating()
            report(refusal)
            return
        }
        if let mode = Self.nextTrackingMode(after: userTrackingState) {
            setTracking(mode)
            return
        }
        // One search at a time; a second tap does not restart its deadline.
        guard userTrackingState == .idle else { return }
        userTrackingState = .searching
        report(.searching)
        isWaitingToCenterOnUserLocation = true
        // Not while the system prompt is up: the reader may take longer than
        // the deadline to read it, and a deadline that ran meanwhile ended
        // the search before CoreLocation had been allowed to start. The
        // authorization callback starts it once the answer is in.
        if Self.deadlineStarts(for: status) {
            startLocateDeadline()
        }
        centerIfTheFixIsGoodEnough(now: now)
    }

    /// Whether a search may start its deadline under this authorization: not
    /// before the reader has answered the prompt.
    static func deadlineStarts(for status: CLAuthorizationStatus) -> Bool {
        status != .notDetermined
    }

    /// Whether a fix is a position at all. A non-positive accuracy is
    /// CoreLocation's "invalid", not "approximate".
    static func isPosition(_ location: CLLocation) -> Bool {
        location.horizontalAccuracy > 0 && CLLocationCoordinate2DIsValid(location.coordinate)
    }

    /// What a tap on the button does once the reader is already followed.
    static func nextTrackingMode(after state: UserTrackingState) -> MKUserTrackingMode? {
        switch state {
        case .following: .followWithHeading
        case .heading: .follow
        case .idle, .searching: nil
        }
    }

    static func trackingState(for mode: MKUserTrackingMode) -> UserTrackingState {
        switch mode {
        case .follow: .following
        case .followWithHeading: .heading
        case .none: .idle
        @unknown default: .idle
        }
    }

    /// Whether a fix is good enough to centre on before the deadline.
    static func isFixGoodEnoughToCentreOn(_ location: CLLocation, now: Date) -> Bool {
        let age = now.timeIntervalSince(location.timestamp)
        return isPosition(location)
            && location.horizontalAccuracy <= locateMaxAccuracyM
            && age >= -locateClockTolerance && age <= locateMaxFixAge
    }

    private func centerIfTheFixIsGoodEnough(now: Date) {
        guard isWaitingToCenterOnUserLocation,
              let location = mapView?.userLocation.location,
              Self.isFixGoodEnoughToCentreOn(location, now: now) else { return }
        // A cached fix from before Precise Location was switched off can be
        // tight; the setting still governs what the next ones will be.
        center(on: location, message: hasReducedAccuracy ? .reducedAccuracy : .found)
    }

    private func startLocateDeadline() {
        locateDeadlineTask?.cancel()
        locateDeadlineTask = Task { [weak self] in
            try? await Task.sleep(for: Self.locateDeadline)
            guard !Task.isCancelled else { return }
            self?.locateDeadlineElapsed()
        }
    }

    /// The deadline passed without a fix the gate would take.
    func locateDeadlineElapsed() {
        settleLocate(with: mapView?.userLocation.location, now: Date())
    }

    /// The deadline's decision, apart from the clock so a test can hand it a
    /// fix.
    ///
    /// A fix the gate would take is found. One it would not — old, coarse, or
    /// both — is still where the dot is drawn, so the map goes there and
    /// follows, and follow mode corrects it as fixes refine; but the reader is
    /// told it is approximate rather than found, because indoors a refining
    /// fix may never come and a map kilometres off must not claim success.
    /// Saying the location could not be found while the dot is on screen was
    /// one of the reported failures; no fix at all is the one case that is.
    func settleLocate(with location: CLLocation?, now: Date) {
        guard isWaitingToCenterOnUserLocation else { return }
        guard let location, Self.isPosition(location) else {
            // Nothing, or an invalid position: not somewhere to send the map.
            stopLocating()
            report(.unavailable)
            return
        }
        let age = now.timeIntervalSince(location.timestamp)
        let staleAfter = hasReducedAccuracy ? Self.reducedAccuracyMaxFixAge : Self.locateStaleFixAge
        guard age <= staleAfter, age >= -Self.locateClockTolerance else {
            // Where the phone was hours ago, or a clock that cannot be
            // trusted: the map stays where the reader has it.
            stopLocating()
            report(.stale)
            return
        }
        // The setting first: a tight fix cached from before Precise
        // Location was switched off says nothing about the next ones.
        let message: LocationMessage =
            if hasReducedAccuracy {
                // Coarse by setting, not by sky. Said as the setting.
                .reducedAccuracy
            } else if Self.isFixGoodEnoughToCentreOn(location, now: now) {
                .found
            } else {
                .approximate
            }
        center(on: location, message: message)
    }

    /// Another feature moved the camera on purpose: a parcel search, a
    /// shared link, a layer being framed. It outranks a locate in flight and
    /// a follow in progress, both of which would otherwise drag the map back
    /// to the dot a moment later; and a message about the dot being shown
    /// no longer describes the map.
    /// A search or an address the reader chose: theirs before its answer
    /// arrives, so the automatic sale fit landing meanwhile yields to it —
    /// and cannot move the claim generation out from under the search.
    func readerClaimsTheCamera() {
        readerHasClaimedTheCamera = true
    }

    private func cameraTakenByAnotherFeature() {
        cameraClaimGeneration += 1
        viewportIsLocationDriven = false
        stopLocating()
        endFollowing()
        if let locationMessage, !Self.staysUntilDismissed(locationMessage) {
            dismissLocationMessage()
        }
    }

    /// Ends a search without a result: the flag, the deadline and the glyph.
    private func stopLocating() {
        isWaitingToCenterOnUserLocation = false
        locateDeadlineTask?.cancel()
        locateDeadlineTask = nil
        if userTrackingState == .searching {
            userTrackingState = .idle
        }
    }

    /// Shows a message, and takes it down again after its lifetime, if it has
    /// one.
    private func report(_ message: LocationMessage) {
        locationMessageDismissal?.cancel()
        locationMessageDismissal = nil
        locationMessage = message
        guard let lifetime = messageLifetime(message) else { return }
        locationMessageDismissal = Task { [weak self] in
            try? await Task.sleep(for: lifetime)
            guard !Task.isCancelled else { return }
            guard self?.locationMessage == message else { return }
            self?.locationMessage = nil
        }
    }

    /// The reader acted on the message, or waved it away. A waved-away
    /// Precise Location caveat stays away until the setting changes or the
    /// reader asks for their location again; a foreground return does not
    /// bring it back.
    func dismissLocationMessage() {
        if locationMessage == .reducedAccuracy { dismissedReducedAccuracy = true }
        locationMessageDismissal?.cancel()
        locationMessageDismissal = nil
        locationMessage = nil
    }

    @ObservationIgnored private var dismissedReducedAccuracy = false

    /// Puts the fix in the middle of the map the reader can see, and follows
    /// it from there.
    ///
    /// Closer than the locate scale, the map only pans: the reader zoomed to a
    /// parcel and asked where they are on it, and a fixed region would throw
    /// the parcel away. Farther out, it comes in to the locate scale.
    ///
    /// "The map the reader can see" is not the screen: a parcel card or an
    /// edit panel covers the bottom of it. The cards report their heights into
    /// the map's layout margins, and MapKit centres inside those margins on
    /// its own, for `setCenter`, `setRegion` and a followed user alike. Nothing
    /// is offset here; a test pins the dot at the middle of the uncovered map.
    ///
    /// `animated` is a seam for tests, which read the region back at once;
    /// otherwise Reduce Motion decides. `message` is what the fix is called.
    func center(on location: CLLocation, animated: Bool? = nil, message: LocationMessage = .found) {
        let animated = animated ?? animatesLocate
        isWaitingToCenterOnUserLocation = false
        locateDeadlineTask?.cancel()
        locateDeadlineTask = nil
        // Where the reader is, not where they chose to look: this view stays
        // out of links, notes, receipts and the saved session until they take
        // the map back.
        viewportIsLocationDriven = true
        report(message)
        // Following from the moment the map moves, as far as the glyph is
        // concerned; the mode itself is set once the flight settles.
        userTrackingState = .following
        // Same rule as `focus(on:)`: going to where the reader is outranks a
        // link's held position.
        pendingCenter = nil
        guard let mapView else { return }
        let coordinate = location.coordinate
        if Self.keepsZoom(mapView, locating: coordinate) {
            mapView.setCenter(coordinate, animated: animated)
        } else {
            mapView.setRegion(
                MKCoordinateRegion(
                    center: coordinate,
                    latitudinalMeters: Self.locateSpanMetres,
                    longitudinalMeters: Self.locateSpanMetres
                ),
                animated: animated
            )
        }
        armFollow()
    }

    /// Whether the map is already closer than the locate scale, so a locate
    /// keeps its zoom. An unsized view has no zoom to keep.
    static func keepsZoom(_ mapView: MKMapView, locating coordinate: CLLocationCoordinate2D) -> Bool {
        // Measured across the screen rather than read off the region: the
        // region is the axis-aligned box around a rotated or pitched view,
        // which is wider than the ground the reader sees, and a turned map
        // at parcel scale was being zoomed out on locate.
        if let width = visibleGroundWidth(of: mapView) {
            return width <= locateSpanMetres
        }
        guard let zoom = mercatorZoom(of: mapView) else { return false }
        return zoom >= locateZoom(forWidth: mapView.bounds.width, at: coordinate.latitude)
    }

    /// How much ground the view spans from its left edge to its right,
    /// through its vertical middle, in metres. Nil for an unsized view.
    static func visibleGroundWidth(of mapView: MKMapView) -> Double? {
        let bounds = mapView.bounds
        guard bounds.width > 0, bounds.height > 0 else { return nil }
        let left = mapView.convert(CGPoint(x: bounds.minX, y: bounds.midY), toCoordinateFrom: mapView)
        let right = mapView.convert(CGPoint(x: bounds.maxX, y: bounds.midY), toCoordinateFrom: mapView)
        guard CLLocationCoordinate2DIsValid(left), CLLocationCoordinate2DIsValid(right) else {
            return nil
        }
        let metres = MKMapPoint(left).distance(to: MKMapPoint(right))
        guard metres.isFinite, metres > 0 else { return nil }
        return metres
    }

    /// The Mercator zoom at which `locateSpanMetres` spans a view this wide,
    /// by the same 256-point-tile arithmetic `center(on:zoom:)` uses.
    static func locateZoom(forWidth width: CGFloat, at latitude: Double) -> Double {
        log2(156_543.03392 * cos(latitude * .pi / 180) * Double(width) / locateSpanMetres)
    }

    /// Arms follow mode for when the locate flight settles.
    ///
    /// `regionDidChangeAnimated` is the honest signal; the timer covers a
    /// locate that did not move the map at all, which changes no region.
    private func armFollow() {
        followsOnceSettled = true
        followFallback?.cancel()
        followFallback = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1500))
            guard !Task.isCancelled else { return }
            self?.startFollowingIfArmed()
        }
    }

    private func startFollowingIfArmed() {
        guard followsOnceSettled else { return }
        followsOnceSettled = false
        followFallback?.cancel()
        followFallback = nil
        setTracking(.follow)
    }

    /// The reader moved the map before follow mode had started.
    ///
    /// The flight's armed follow is dropped and the glyph goes idle: MapKit
    /// cannot report the release, because there was no follow mode yet to
    /// release, and a follow that started when their gesture settled would
    /// snatch the map back from them.
    func userTookTheMap() {
        guard followsOnceSettled else { return }
        followsOnceSettled = false
        followFallback?.cancel()
        followFallback = nil
        if userTrackingState == .following {
            userTrackingState = .idle
        }
        dismissFollowMessages()
    }

    /// The messages that are about the dot being followed: gone when it no
    /// longer is. The approximate caveat is about the dot's position; after
    /// a pan the dot may not even be on screen.
    private func dismissFollowMessages() {
        // "Shown on the map" included: after a pan the dot may not be.
        if locationMessage == .signalLost || locationMessage == .approximate
            || locationMessage == .found
        {
            dismissLocationMessage()
        }
    }

    /// Every way out of following: the mode, the armed follow, the glyph and
    /// the follow messages, together.
    private func endFollowing() {
        followsOnceSettled = false
        followFallback?.cancel()
        followFallback = nil
        if let mapView, mapView.userTrackingMode != .none {
            mapView.setUserTrackingMode(.none, animated: false)
        }
        if userTrackingState != .searching {
            userTrackingState = .idle
        }
        dismissFollowMessages()
    }

    /// Whether one of MapKit's own recognizers is mid-gesture: the only way
    /// this app learns of a pan or pinch, since MapKit consumes them.
    static func hasActiveGesture(_ mapView: MKMapView) -> Bool {
        for subview in mapView.subviews {
            for recognizer in subview.gestureRecognizers ?? []
            where recognizer.state == .began || recognizer.state == .changed {
                return true
            }
        }
        return false
    }

    private func setTracking(_ mode: MKUserTrackingMode) {
        guard let mapView else { return }
        // An explicit mode outranks the one armed for the end of a flight: a
        // second tap during the flight asks for heading-up, and the armed
        // plain follow must not land on top of it a second later.
        followsOnceSettled = false
        followFallback?.cancel()
        followFallback = nil
        // Following needs the dot, and MapKit switches it on itself; the
        // applied state has to agree or the next apply() would switch it off.
        if mode != .none, !appliedShowsUserLocation {
            showsUserLocation = true
        }
        mapView.setUserTrackingMode(mode, animated: animatesLocate)
        // Mirrored here as well as in the delegate: the callback comes a turn
        // later, and the glyph must not lag the tap.
        userTrackingState = Self.trackingState(for: mode)
    }

    // MARK: - Bottom cards

    /// The cards that can cover the bottom of the map, keyed so one leaving
    /// does not zero the height of another arriving in the same update.
    enum BottomCard: Hashable, Sendable {
        case parcel, editPanel, vectorCallout, featureCallout, measure
    }

    @ObservationIgnored private var bottomCardHeights: [BottomCard: CGFloat] = [:]

    /// How much of the bottom of the map the tallest open card covers.
    private var bottomCardInset: CGFloat { bottomCardHeights.values.max() ?? 0 }

    /// Reported by the container as cards open, resize and close. Routed
    /// into the map's layout margins, which is where MapKit centres a
    /// followed user and keeps its own logo and Legal link.
    func setBottomCardHeight(_ height: CGFloat, for card: BottomCard) {
        let clamped = max(0, height)
        guard (bottomCardHeights[card] ?? 0) != clamped else { return }
        bottomCardHeights[card] = clamped == 0 ? nil : clamped
        applyBottomLayoutMargin()
    }

    private func applyBottomLayoutMargin() {
        mapView?.layoutMargins.bottom = max(bottomOrnamentInset, bottomCardInset)
        updateReticle()
    }

    // MARK: - Reticle

    /// Where the aiming reticle sits, in the map view's coordinates, and the
    /// ground under it; nil while no drawing tool is armed. Written on every
    /// frame of a pan while armed, guarded by equality like the heading.
    private(set) var reticlePoint: CGPoint?
    private(set) var reticleCoordinate: GeoPoint?
    /// The uncovered map, in the map view's coordinates: what the reticle
    /// is centred in, and what its controls must stay inside.
    private(set) var reticleRoom: CGRect?
    @ObservationIgnored private var reticleArmed = false

    /// Arms or disarms the reticle. Armed, it follows the middle of the
    /// uncovered map as the reader pans.
    func setReticleArmed(_ armed: Bool) {
        reticleArmed = armed
        updateReticle()
    }

    private func updateReticle() {
        guard reticleArmed, let mapView, mapView.bounds.width > 0 else {
            if reticlePoint != nil { reticlePoint = nil }
            if reticleCoordinate != nil { reticleCoordinate = nil }
            if reticleRoom != nil { reticleRoom = nil }
            return
        }
        let room = Self.uncoveredRect(in: mapView.bounds, insets: mapView.layoutMargins)
        let point = CGPoint(x: room.midX, y: room.midY)
        let coordinate = mapView.convert(point, toCoordinateFrom: mapView)
        // A pitched map can put the middle above the horizon, where MapKit
        // has no coordinate to give: no reticle then, rather than an invalid
        // number offered as somewhere to place.
        guard CLLocationCoordinate2DIsValid(coordinate) else {
            if reticlePoint != nil { reticlePoint = nil }
            if reticleCoordinate != nil { reticleCoordinate = nil }
            if reticleRoom != nil { reticleRoom = nil }
            return
        }
        let ground = GeoPoint(lat: coordinate.latitude, lng: coordinate.longitude)
        if reticleRoom != room { reticleRoom = room }
        if reticlePoint != point { reticlePoint = point }
        if reticleCoordinate != ground { reticleCoordinate = ground }
    }

    /// Where a coordinate falls on the screen, in the map view's coordinates,
    /// or nil before layout.
    func screenPoint(for point: GeoPoint) -> CGPoint? {
        guard let mapView, mapView.bounds.width > 0 else { return nil }
        return mapView.convert(
            CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng), toPointTo: mapView
        )
    }

    /// The map the reader can see: the bounds inside the layout margins,
    /// which is the rectangle MapKit centres a followed user in. The safe
    /// area feeds the top and sides; the cards report the bottom. Each inset
    /// is clamped so a card taller than the map leaves an empty rectangle
    /// rather than an inverted one.
    static func uncoveredRect(in bounds: CGRect, insets: UIEdgeInsets) -> CGRect {
        let top = min(max(insets.top, 0), bounds.height)
        let bottom = min(max(insets.bottom, 0), bounds.height - top)
        let left = min(max(insets.left, 0), bounds.width)
        let right = min(max(insets.right, 0), bounds.width - left)
        return CGRect(
            x: bounds.minX + left, y: bounds.minY + top,
            width: bounds.width - left - right, height: bounds.height - top - bottom
        )
    }

    /// The middle of the map the reader can see, given the margins.
    static func reticlePoint(in bounds: CGRect, insets: UIEdgeInsets) -> CGPoint {
        let room = uncoveredRect(in: bounds, insets: insets)
        return CGPoint(x: room.midX, y: room.midY)
    }

    /// The same, with only a bottom card in the way.
    static func reticlePoint(in bounds: CGRect, bottomMargin: CGFloat) -> CGPoint {
        reticlePoint(in: bounds, insets: UIEdgeInsets(top: 0, left: 0, bottom: bottomMargin, right: 0))
    }

    // MARK: - Centre

    /// The coordinate under the middle of the map, or nil before layout.
    ///
    /// For the non-drag way of moving a corner: pan the map until its middle
    /// is where the corner belongs, then move the corner there.
    func visibleCentre() -> GeoPoint? {
        guard let mapView, mapView.bounds.width > 0 else { return nil }
        // The reticle's arithmetic, so "map centre" means the same spot to
        // the corner mover, to the crosshair, and to `pan(to:)`: the middle
        // of the map inside its layout margins, which is also where MapKit's
        // `setCenter` puts a coordinate. Step to a corner, then move a
        // corner here, and nothing moves.
        let point = Self.reticlePoint(in: mapView.bounds, insets: mapView.layoutMargins)
        let centre = mapView.convert(point, toCoordinateFrom: mapView)
        guard CLLocationCoordinate2DIsValid(centre) else { return nil }
        return GeoPoint(lat: centre.latitude, lng: centre.longitude)
    }

    /// Pans to a point, keeping the zoom.
    func pan(to point: GeoPoint, animated: Bool = true) {
        mapView?.setCenter(
            CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng),
            animated: animated
        )
    }

    // MARK: - Heading

    func resetHeading() {
        guard let mapView else { return }
        if userTrackingState == .heading {
            // Heading-up would turn the map straight back; north-up while
            // still following means plain follow.
            setTracking(.follow)
        }
        let camera = mapView.camera.copy() as! MKMapCamera
        camera.heading = 0
        mapView.setCamera(camera, animated: animatesLocate)
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
        // Same rule as print framing: the selection owns the camera.
        readerHasClaimedTheCamera = true
        cameraTakenByAnotherFeature()
        mutate { $0.interactionMode = .selectingBounds }
    }

    func endBoundsSelection() {
        mutate { $0.interactionMode = .idle }
    }

    /// Delivers a completed selection through the event stream. Gated on the
    /// interaction mode so a stale gesture can never emit after selection ends.
    func completeBoundsSelection(with bounds: MapBounds) {
        guard appliedInteractionMode == .selectingBounds else { return }
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
        // The frame owns the camera: a locate that landed under it, or a
        // follow that went on re-centring, would move the page out from under
        // the reader — and so would a search answering late, or the sale fit.
        readerHasClaimedTheCamera = true
        cameraTakenByAnotherFeature()
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
        guard width > 0, height > 0,
              let zoom = Self.mercatorZoom(of: mapView) else { return nil }
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

        // One persistent overlay for the whole drag; each move updates its
        // corners and asks for a redraw. See `BoundsSelectionOverlay` for the
        // churn this replaces.
        let overlay: BoundsSelectionOverlay
        if let selectionOverlay {
            overlay = selectionOverlay
        } else {
            overlay = BoundsSelectionOverlay()
            selectionOverlay = overlay
            mapView.addOverlay(overlay)
        }
        overlay.set(start: start, end: end)
        (mapView.renderer(for: overlay) as? BoundsSelectionRenderer)?.setNeedsDisplay()
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

    @objc func handlePlaceLongPress(_ recognizer: UILongPressGestureRecognizer) {
        guard recognizer.state == .began,
              let mapView = recognizer.view as? MKMapView else { return }
        let coordinate = mapView.convert(
            recognizer.location(in: mapView), toCoordinateFrom: mapView
        )
        guard CLLocationCoordinate2DIsValid(coordinate) else { return }
        events?(.mapLongPressed(latitude: coordinate.latitude, longitude: coordinate.longitude))
    }

    /// Whether a press-and-hold at this view may place a point: not on a
    /// draggable handle or anything inside one, whose press-and-hold is
    /// MapKit's drag of a vertex or move handle. Over any other annotation —
    /// a draft corner, a photo pin, a parcel marker — it may: holding the
    /// first draft corner is one way to close an area.
    static func longPressMayBegin(over view: UIView?) -> Bool {
        var current = view
        while let candidate = current {
            if let annotationView = candidate as? MKAnnotationView,
               annotationView is VectorHandleAnnotationView || annotationView.isDraggable
            {
                return false
            }
            current = candidate.superview
        }
        return true
    }

    /// Whether the placing press-and-hold may begin at all: only while the
    /// reticle is armed. Recognized at any other time it would win the
    /// gesture from MapKit's pan and then do nothing with it.
    static func placementMayBegin(armed: Bool, selectingBounds: Bool, over view: UIView?) -> Bool {
        armed && !selectingBounds && longPressMayBegin(over: view)
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
    func mapView(_ mapView: MKMapView, regionWillChangeAnimated animated: Bool) {
        guard mapView === self.mapView else { return }
        guard Self.hasActiveGesture(mapView) else { return }
        readerTookTheMapByHand()
    }

    /// The reader's own hand on the map: the automatic fit yields to it, and
    /// a pan or pinch while the locate flight is still in the air takes the
    /// map back — including a locate still waiting for its first fix, which
    /// would otherwise pull the map back to the dot when one came. Apart
    /// from the delegate so a test can hand over the gesture.
    func readerTookTheMapByHand() {
        readerHasClaimedTheCamera = true
        cameraClaimGeneration += 1
        // Panned away from the dot: this view is the reader's again, and may
        // be shared, printed and remembered.
        viewportIsLocationDriven = false
        if isWaitingToCenterOnUserLocation {
            stopLocating()
            if locationMessage == .searching {
                dismissLocationMessage()
            }
        }
        if followsOnceSettled {
            userTookTheMap()
        }
    }

    func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
        guard mapView === self.mapView else { return }
        applyPendingCenterIfPossible()
        startFollowingIfArmed()
        events?(.visibleRegionSettled)
    }

    func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
        // A replaced map's last frames must not write the heading and zoom
        // of the map that replaced it.
        guard mapView === self.mapView else { return }
        applyPendingCenterIfPossible()
        // This runs on every frame of a pan or rotation, and @Observable has
        // no equality gate of its own: an unguarded set notifies observers of
        // the property even when the value is unchanged. Guarded like every
        // other per-frame write in this file.
        let heading = mapView.camera.heading
        if mapHeading != heading {
            mapHeading = heading
            events?(.headingChanged(heading))
        }

        clampClosestZoom(mapView)
        updateReticle()

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
        // Set only on the transition: this runs per frame of a pinch, and an
        // unguarded @Observable write notifies observers even when the value
        // is already true.
        if !hasReportedItsPosition {
            hasReportedItsPosition = true
        }
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
            appliedParcelOverviewMarkers.map(ParcelOverviewAnnotation.init(marker:))
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
        guard let zoom = mercatorZoom(of: mapView) else { return nil }
        return Int(zoom.rounded())
    }

    /// The same reading, unrounded. Used where the fraction matters, which is
    /// the arithmetic that turns a zoom into a camera distance.
    static func mercatorZoom(of mapView: MKMapView) -> Double? {
        let width = Double(mapView.bounds.width)
        let longitudeSpan = mapView.region.span.longitudeDelta
        guard width > 0, longitudeSpan > 0 else { return nil }
        let zoom = log2(360 * (width / 256) / longitudeSpan)
        guard zoom.isFinite else { return nil }
        return zoom
    }

    /// The closest the browser lets a reader get, and the closest this map
    /// does. Past it the tiles are being stretched rather than read.
    private static let closestZoom = 23.0

    /// Stops the map being pinched in past the point where anything drawn on
    /// it means anything, once — from the map's own size, because MapKit is
    /// asked for a camera distance and the browser states a zoom level.
    ///
    /// The far end is deliberately not ported. The browser floors zoom at 7,
    /// which fills a desktop window with the province and a little ocean; the
    /// same number on a phone's narrower screen shows about four degrees of
    /// longitude, so porting it would stop the reader zooming out before Nova
    /// Scotia fits on the screen at all.
    private func clampClosestZoom(_ mapView: MKMapView) {
        let width = mapView.bounds.width
        guard width > 0, clampedAtWidth != width,
              let zoom = mercatorZoomForClamp(mapView) else { return }
        let distance = mapView.camera.centerCoordinateDistance
        guard distance > 0, distance.isFinite else { return }
        // A camera's distance halves with every zoom level, so one reading of
        // the pair fixes the scale for this screen. Read rather than derived
        // from a field of view, which is MapKit's to change.
        let atZoomZero = distance * pow(2, zoom)
        clampedAtWidth = width
        guard atZoomZero.isFinite,
              let range = MKMapView.CameraZoomRange(
                  minCenterCoordinateDistance: atZoomZero / pow(2, Self.closestZoom)
              )
        else { return }
        mapView.cameraZoomRange = range
    }

    private func mercatorZoomForClamp(_ mapView: MKMapView) -> Double? {
        // Only while the camera is looking straight down at north. A pitched
        // or turned view reports the region that bounds what is on screen,
        // which is wider than the same distance looks square-on, and
        // calibrating off one would put the limit a level out.
        let camera = mapView.camera
        guard camera.pitch == 0, camera.heading == 0 else { return nil }
        return Self.mercatorZoom(of: mapView)
    }

    func mapView(_ mapView: MKMapView, didUpdate userLocation: MKUserLocation) {
        guard mapView === self.mapView, let location = userLocation.location else { return }
        receiveFix(location, now: Date())
    }

    /// A fix from the map's own location, apart from the delegate so a test
    /// can hand one over.
    func receiveFix(_ location: CLLocation, now: Date) {
        // An invalid position is not a fix: it neither restores the signal
        // nor promotes anything.
        guard Self.isPosition(location) else { return }
        let stillFollowing = followsOnceSettled
            || userTrackingState == .following || userTrackingState == .heading
        // Fresh on both sides of the clock, as the gate reads it: a fix an
        // hour ahead is no more the signal returning than one an hour behind.
        let age = now.timeIntervalSince(location.timestamp)
        let fresh = age >= -Self.locateClockTolerance && age <= Self.locateMaxFixAge
        let good = Self.isFixGoodEnoughToCentreOn(location, now: now)
        if locationMessage == .signalLost, fresh {
            // The signal is back — a cached position is not it returning —
            // and what it brought back decides the caveat: under Precise
            // Location off the setting's caveat returns whatever the fix; a
            // good fix needs none; a coarse one is approximate.
            if hasReducedAccuracy {
                // Unless the reader waved the caveat away: the signal coming
                // back is not a new reason to raise it.
                if dismissedReducedAccuracy {
                    dismissLocationMessage()
                } else {
                    report(.reducedAccuracy)
                }
            } else if good || !stillFollowing {
                dismissLocationMessage()
            } else {
                report(.approximate)
            }
        }
        // A fix the gate takes makes an approximate position a found one,
        // while the map is still following it (after a pan the dot may be
        // off screen, and "shown on the map" would not be true); and the
        // Precise Location caveat, once precision is back, becomes whatever
        // the next fresh fix is — found if good, approximate if not: the
        // setting is no longer the reason.
        if stillFollowing, good, locationMessage == .approximate {
            report(hasReducedAccuracy ? .reducedAccuracy : .found)
        }
        if stillFollowing, fresh, locationMessage == .reducedAccuracy, !hasReducedAccuracy {
            report(good ? .found : .approximate)
        }
        // Gated rather than taken as it comes: the first fix after the dot is
        // switched on is usually CoreLocation's cached last-known position,
        // and a map centred on it was a map centred kilometres from the dot.
        centerIfTheFixIsGoodEnough(now: now)
    }

    func mapView(_ mapView: MKMapView, didFailToLocateUserWithError error: any Error) {
        guard mapView === self.mapView else { return }
        let code = (error as? CLError)?.code
        if isWaitingToCenterOnUserLocation {
            switch code {
            case .locationUnknown:
                // CoreLocation keeps trying after this one; the deadline decides.
                return
            case .denied:
                stopLocating()
                report(
                    Self.locationMessage(
                        for: locationManager.authorizationStatus, readerAsked: true,
                        servicesEnabled: servicesEnabled()
                    ) ?? .denied
                )
            default:
                // Not the sky: a network error, most often. Said as a failure
                // to try again, not as a position that could not be found.
                stopLocating()
                report(.failed)
            }
            return
        }
        // Following, and something went wrong: said, rather than a glyph
        // that goes on claiming to follow.
        guard followsOnceSettled || userTrackingState == .following || userTrackingState == .heading
        else { return }
        switch code {
        case .locationUnknown:
            // The fixes stopped coming; CoreLocation keeps trying. The web's
            // words, cleared by the next fix.
            report(.signalLost)
        case .headingFailure:
            // The compass failed, not the position: heading-up falls back to
            // plain follow rather than showing a heading it does not have.
            if userTrackingState == .heading {
                setTracking(.follow)
            }
        case .denied:
            endFollowing()
            report(
                Self.locationMessage(
                    for: locationManager.authorizationStatus, readerAsked: true,
                    servicesEnabled: servicesEnabled()
                ) ?? .denied
            )
        default:
            // A network error, most often: following cannot go on without
            // fixes, and saying so beats a glyph that claims otherwise.
            endFollowing()
            report(.failed)
        }
    }

    func mapView(_ mapView: MKMapView, didChange mode: MKUserTrackingMode, animated: Bool) {
        guard mapView === self.mapView else { return }
        // MapKit releases follow mode itself when the reader pans, and this
        // app never learns of the pan; whatever MapKit settled on is what the
        // glyph shows. A search that has not found anything yet is not
        // released by a report of `.none`, which is the mode it was in anyway.
        let state = Self.trackingState(for: mode)
        if state == .idle, userTrackingState == .searching { return }
        if state == .idle {
            // No longer following, so no longer waiting for the signal, and
            // no longer vouching for where the dot is.
            dismissFollowMessages()
        }
        if userTrackingState != state {
            userTrackingState = state
        }
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        // Before the plain `MKPolygon` branch, which it is a kind of: the
        // bounds-selection rectangle and a parcel boundary are both polygons
        // and must not be drawn as the same thing.
        if let parcel = overlay as? ParcelPolygon {
            return Self.renderer(for: parcel)
        }

        if let userMap = overlay as? UserMapOverlay {
            let renderer = UserMapOverlayRenderer(userMap: userMap)
            // Held weakly on the overlay so the alpha-only mutation can poke
            // the live renderer instead of rebuilding the drape.
            userMap.renderer = renderer
            return renderer
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

        if let selection = overlay as? BoundsSelectionOverlay {
            return BoundsSelectionRenderer(selection: selection)
        }

        if let polygon = overlay as? MKPolygon {
            let renderer = MKPolygonRenderer(polygon: polygon)
            renderer.fillColor = UIColor.systemBlue.withAlphaComponent(0.15)
            renderer.strokeColor = .systemBlue
            renderer.lineWidth = 2
            return renderer
        }

        // Before the `OpacityTileOverlay` branch: these are tile overlays too,
        // and without a renderer of their own they would draw nothing, which
        // on a base-replacing overlay is a black map.
        if let blank = overlay as? BlankBaseOverlay {
            return MKTileOverlayRenderer(tileOverlay: blank)
        }

        if let osm = overlay as? OSMBaseOverlay {
            return MKTileOverlayRenderer(tileOverlay: osm)
        }

        guard let tileOverlay = overlay as? OpacityTileOverlay else {
            return MKOverlayRenderer(overlay: overlay)
        }
        let renderer = MKTileOverlayRenderer(tileOverlay: tileOverlay)
        renderer.alpha = appliedLayers.first { $0.id == tileOverlay.configuration.id }?.effectiveAlpha ?? 1.0
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
        // One table with the print compositor and the legend — see
        // `ParcelRoleStyle` for why this styling must not be copied.
        let style = ParcelRoleStyle.style(for: parcel.role)
        renderer.strokeColor = style.stroke
        renderer.fillColor = style.fill
        renderer.lineWidth = style.width
        if let dash = style.dash {
            renderer.lineDashPattern = dash.map { NSNumber(value: $0) }
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
            view.isAccessibilityElement = true
            // The PID and nothing else: the marker stands for a parcel named in
            // a record, and the map has no address, owner or destination to
            // offer for it.
            view.accessibilityLabel = "Parcel \(marker.pid)"
            // On screen the red and the purple are the only thing separating a
            // current notice from a published past record, which is the whole
            // point of drawing them differently; said here rather than left to
            // a hue nobody can hear.
            //
            // What this cannot say: a parcel that is BOTH selected and in a
            // current notice reads as "Selected" alone, because the role it
            // carries is one value and selection takes it. The panel that
            // opens names the notice, so the fact is not lost — but the marker
            // does not carry it, and saying it did would be inventing a
            // distinction from a value that cannot hold two.
            let roleText: String? =
                switch marker.role {
                case .selected: "Selected"
                case .selectedHistorical: "Selected; in a published past tax-sale record"
                case .taxSale: "In a current tax-sale notice"
                case .historicalTaxSale: "In a published past tax-sale record"
                case .context: nil
                }
            view.accessibilityValue = roleText
            view.accessibilityHint = "Opens this parcel's details."
            return view
        }

        if let handle = annotation as? VectorVertexHandleAnnotation {
            let identifier = "VectorVertexHandle"
            // The subclass, not a plain view: it is what completes MapKit's
            // drag-state contract, without which a handle could be dragged
            // once and never again.
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? VectorHandleAnnotationView(annotation: handle, reuseIdentifier: identifier)
            view.annotation = handle
            view.canShowCallout = false
            // Dragged rather than tapped-then-tapped: MapKit's own drag is the
            // gesture the user already knows, and it moves the handle under the
            // finger instead of asking them to aim twice.
            view.isDraggable = true
            view.image = VectorVertexHandleImage.image(colorHex: handle.colorHex)
            view.isAccessibilityElement = true
            if handle.total == 1 {
                view.accessibilityLabel = "Point handle"
                view.accessibilityValue = nil
                view.accessibilityHint = "Press and hold, then drag. The editing panel can also move the point to the map centre."
            } else {
                view.accessibilityLabel = "Corner handle"
                view.accessibilityValue = "\(handle.ordinal) of \(handle.total)"
                view.accessibilityHint = "Press and hold, then drag. The editing panel can also move each corner to the map centre."
            }
            return view
        }

        if let handle = annotation as? VectorMoveHandleAnnotation {
            let identifier = "VectorMoveHandle"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? VectorHandleAnnotationView(annotation: handle, reuseIdentifier: identifier)
            view.annotation = handle
            view.canShowCallout = false
            view.isDraggable = true
            // Deliberately unlike a vertex handle: dragging this one moves the
            // whole shape, and two handles that looked the same would make that
            // a surprise rather than a choice.
            view.image = VectorMoveHandleImage.image(colorHex: handle.colorHex)
            view.isAccessibilityElement = true
            view.accessibilityLabel = "Move entire feature"
            view.accessibilityHint = "Press and hold, then drag. The editing panel can also move the whole feature to the map centre."
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
            view.isAccessibilityElement = true
            // Numbered, because the dots are identical: it says where the shape
            // has been taken so far, and claims nothing about what is there.
            view.accessibilityLabel = "Placed corner \(handle.ordinal)"
            return view
        }

        if let cluster = annotation as? MKClusterAnnotation {
            let identifier = "UserVectorCluster"
            let view =
                mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                as? MKMarkerAnnotationView
                ?? MKMarkerAnnotationView(annotation: cluster, reuseIdentifier: identifier)
            view.annotation = cluster
            view.markerTintColor = UIColor(featureHex: "#7c3aed")
            let count = cluster.memberAnnotations.count
            view.glyphText = "\(count)"
            view.canShowCallout = false
            view.displayPriority = .defaultHigh
            // The glyph is visual; VoiceOver hears what the cluster is and
            // what a tap does. Only photo layers cluster.
            view.accessibilityLabel = "\(count) photo points"
            view.accessibilityHint = "Zooms in to separate them, or shows them together when they share one spot."
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
            view.image = UserVectorMarkerImage.image(
                for: point.pointStyle, hasPhotos: point.hasPhotos, isHighlighted: point.isHighlighted
            )
            // The badge is visual; VoiceOver hears the same fact.
            view.accessibilityLabel = point.title
            view.accessibilityValue = point.hasPhotos ? "Has photos" : nil
            view.clusteringIdentifier = point.clusteringIdentifier
            // Clustered points yield to the user's own drawn markers but not
            // to every other marker on the map: at `.defaultLow` a photo pin
            // was hidden under any catalogued point near it.
            view.displayPriority = point.clusteringIdentifier == nil ? .required : .defaultHigh
            view.collisionMode = .circle
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
            view.isAccessibilityElement = true
            // The record's own words, which are all the map has: the title and
            // subtitle the layer published. A record whose title is empty is
            // named as a record and nothing more, rather than having one made
            // up for it from its position or its layer. The marker's title is
            // not optional, so an empty string is the only unnamed case there
            // is — and it is the one that reaches a reader as a marker with no
            // name at all.
            view.accessibilityLabel = (feature.title?.isEmpty == false)
                ? feature.title
                : "Map record"
            view.accessibilityValue = feature.subtitle
            view.accessibilityHint = "Opens this record's details."
            return view
        }

        return nil
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
        // A drag finishing on a replaced map is not an edit on this one.
        guard mapView === self.mapView else { return }
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

    /// Whether a cluster's members are too close to be separated by zooming,
    /// or the map is already as close as it goes.
    static func clusterIsInseparable(_ members: [MKAnnotation], in mapView: MKMapView) -> Bool {
        guard !members.isEmpty else { return true }
        // The diagonal of the members' bounding box, which does not depend
        // on which member MapKit happened to list first.
        var rect = MKMapRect.null
        for member in members {
            let point = MKMapPoint(member.coordinate)
            rect = rect.union(MKMapRect(origin: point, size: MKMapSize(width: 0, height: 0)))
        }
        let spreadMetres = MKMapPoint(x: rect.minX, y: rect.minY)
            .distance(to: MKMapPoint(x: rect.maxX, y: rect.maxY))
        if spreadMetres <= inseparableSpreadMetres { return true }
        let closest = mapView.cameraZoomRange.minCenterCoordinateDistance
        return mapView.camera.centerCoordinateDistance <= closest * 1.05
    }

    /// Members within this of each other are one standing spot: at the
    /// closest zoom a few metres is still under the width of a marker.
    static let inseparableSpreadMetres: Double = 5

    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        // A selection queued on a replaced map is not a tap on this one: it
        // must neither take the camera nor open a card.
        guard mapView === self.mapView else { return }
        if let cluster = view.annotation as? MKClusterAnnotation {
            let members = cluster.memberAnnotations
            if Self.clusterIsInseparable(members, in: mapView) {
                // Zooming would only re-form the same cluster under the
                // finger; the members are shown together instead.
                let ids = members.compactMap { ($0 as? MapKitAnnotationIdentifying)?.mapAnnotationID }
                events?(.clusterSelected(ids: ids))
            } else {
                // Zooming to the cluster is a deliberate move: it takes the
                // camera from a locate or a follow, which would otherwise pull
                // the map back to the dot with the next fix, and from the
                // sale fit.
                readerHasClaimedTheCamera = true
                cameraTakenByAnotherFeature()
                mapView.showAnnotations(members, animated: animatesLocate)
            }
            mapView.deselectAnnotation(cluster, animated: false)
            return
        }
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

    /// The name the placing press-and-hold is registered under.
    static let placeLongPressName = "PlaceLongPress"

    /// Judged where the touch began, not where the finger is when the press
    /// matures: a drag that started on a handle and crept off it before the
    /// press timer fired is the handle's, and must not become a placement.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard gestureRecognizer.name == Self.placeLongPressName else { return true }
        return Self.longPressMayBegin(over: touch.view)
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        if gestureRecognizer.name == Self.identifyTapName {
            return !isSelectingBounds
        }
        if gestureRecognizer.name == Self.placeLongPressName {
            guard let mapView = gestureRecognizer.view else { return false }
            let location = gestureRecognizer.location(in: mapView)
            if let map = mapView as? MKMapView {
                // A press over the sky of a pitched map has no ground under
                // it: not begun, rather than begun with no coordinate.
                let coordinate = map.convert(location, toCoordinateFrom: map)
                guard CLLocationCoordinate2DIsValid(coordinate) else { return false }
            }
            return Self.placementMayBegin(
                armed: reticleArmed, selectingBounds: isSelectingBounds,
                over: mapView.hitTest(location, with: nil)
            )
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
        authorizationChanged(to: manager.authorizationStatus)
    }

    /// A refusal that has been lifted comes down: the reader went to Settings
    /// as the notice told them and came back, and a notice still saying the
    /// switch is off would be wrong. Precise Location is reconciled both ways
    /// while the dot is followed: turned off, the caveat goes up; turned on,
    /// it comes down.
    private func reconcileNoticesAfterGrant() {
        switch locationMessage {
        case .denied, .restricted, .servicesOff:
            dismissLocationMessage()
        default:
            // The Precise Location caveat stays through a grant: the map is
            // still showing the coarse fix, and `receiveFix` replaces the
            // caveat with "found" when a precise fix actually arrives.
            break
        }
        let following = userTrackingState == .following || userTrackingState == .heading
        if !hasReducedAccuracy { dismissedReducedAccuracy = false }
        // Not over "signal lost": no fix has come back to be coarse yet, and
        // the recovery reports the caveat when one does. Not after the reader
        // waved it away, either.
        if following, hasReducedAccuracy, !dismissedReducedAccuracy,
           locationMessage != .reducedAccuracy, locationMessage != .signalLost
        {
            report(.reducedAccuracy)
        }
    }

    /// Re-reads the authorization on return to the foreground: a notice
    /// still up may describe a cause the reader has since changed in
    /// Settings.
    func reconcileLocationNotice() {
        authorizationChanged(to: locationManager.authorizationStatus)
    }

    /// The authorization answer, apart from the delegate so a test can give
    /// one. A refusal is announced only to a reader who asked: the one whose
    /// search is waiting on the prompt, or the one being followed until now.
    func authorizationChanged(to status: CLAuthorizationStatus) {
        let wasAsked = isWaitingToCenterOnUserLocation
            || userTrackingState == .following || userTrackingState == .heading
        // A refusal already on screen is re-said as what it now is when its
        // cause changes — Location Services back on while the app stays
        // denied — without waiting for a new request.
        let showingRefusal = locationMessage.map { Self.staysUntilDismissed($0) } ?? false
        if let message = Self.locationMessage(
            for: status, readerAsked: wasAsked || showingRefusal,
            servicesEnabled: status == .denied ? servicesEnabled() : true
        ), message != locationMessage {
            report(message)
        }
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            mapView?.showsUserLocation = appliedShowsUserLocation
            reconcileNoticesAfterGrant()
            // The search that waited on the prompt gets its deadline now,
            // with CoreLocation allowed to start. A fix this early is rare;
            // `didUpdate` takes the ones that follow.
            if isWaitingToCenterOnUserLocation, locateDeadlineTask == nil {
                startLocateDeadline()
            }
            centerIfTheFixIsGoodEnough(now: Date())
        case .denied, .restricted:
            // Whether searching or already following: the refusal ends it,
            // and the glyph must not go on claiming to follow.
            stopLocating()
            endFollowing()
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

nonisolated private extension MKAnnotation {
    var mapAnnotationID: String? {
        (self as? MapKitAnnotationIdentifying)?.mapAnnotationID
    }
}
