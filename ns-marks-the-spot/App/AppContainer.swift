import Foundation
import GeoCore
import MapCatalog
import NSDataServices

@MainActor
final class AppContainer {
    let mapController: MapController
    let navigationModel = NavigationModel()
    let tileStore: TileStore
    let tileCache: TileCache
    let tileFetcher: TileFetcher
    let offlineAreasViewModel: OfflineAreasViewModel
    let licenceStore: ProvinceLicenceStore
    let sessionStore: MapSessionStore

    /// Where a walk in progress is written down.
    ///
    /// Owned here rather than by the map view because a checkpoint outlives
    /// every view: it is written by a recorder taking fixes in a pocket and
    /// read once, at launch, before anything can record over it. `lazy`, so a
    /// unit test that builds a container to ask which layers install does not
    /// make a directory in the test host to find out.
    private(set) lazy var trackCheckpoint = checkpointStore ?? .inApplicationSupport()
    private let checkpointStore: TrackCheckpointStore?

    /// The walk that was waiting on disk at launch: one iOS ended under the
    /// reader, one they stopped and never saved, a checkpoint this build could
    /// not read, or nothing. Set by `forLaunch`, which is the only caller that
    /// reads the disk.
    private(set) var restoredWalk: TrackCheckpointStore.Found = .none

    /// What the map was showing when the app last went away, or `nil` on a
    /// first launch. Read once, here, so the opening layer set, the opening
    /// background and the opening position come from one answer rather than
    /// three.
    let restoredSession: MapSession?

    /// The clearance the tile-loading queues read.
    ///
    /// Kept in step with `licenceStore` by `OverlayViewModel`, which is the one
    /// place acceptance and revocation happen.
    let clearanceBox: LicenceClearanceBox

    /// The one-off sweep of tiles from a superseded Fletcher build, or `nil`
    /// when this install has already done it.
    ///
    /// Held rather than dropped because the map and the offline screen both
    /// have to wait for it before they trust a stored tile. See
    /// `FletcherSourceMigration.runIfNeeded`.
    let fletcherMigration: Task<Void, Never>?

    // MARK: - Screen view models
    //
    // Owned here, once per process, rather than built inside the WindowGroup
    // content closure. SwiftUI is free to re-evaluate that closure — a scene
    // disconnected in the background reconnects through it — and every
    // evaluation used to construct a fresh set of view models over the shared
    // live map: `OverlayViewModel`'s resume re-applied the launch-time session,
    // snapping the map, the tax-sale switch and the open parcel back to where
    // the app started. `lazy` keeps construction off the container's own init;
    // the first body evaluation pays it exactly once.

    private(set) lazy var viewportFeatureViewModel = ViewportFeatureViewModel(container: self)
    private(set) lazy var taxSaleViewModel = TaxSaleViewModel()
    private(set) lazy var historicalTaxSaleViewModel = HistoricalTaxSaleViewModel()
    private(set) lazy var overlayViewModel = OverlayViewModel(
        container: self,
        features: viewportFeatureViewModel,
        taxSale: taxSaleViewModel,
        historical: historicalTaxSaleViewModel
    )
    private(set) lazy var georeferenceReferences = GeoreferenceReferenceServices(container: self)

    /// The track recorder, for the life of the process.
    ///
    /// It used to be `@State` in `MapContainerView`, and that is precisely the
    /// bug: Apple launches this app to perform a `LiveActivityIntent`
    /// **without opening it**, so no view's `onAppear` need ever run. A Pause
    /// tapped on the Lock Screen of a terminated app reached a registry with
    /// nothing installed in it, and the only honest thing left to do was fail.
    /// Process-lifetime state belongs in the process-lifetime object.
    ///
    /// `lazy` for the same reason as the view models above, and one more: it
    /// builds a `CLLocationManager`, and a unit test that constructs a
    /// container to ask which layers install must not reach CoreLocation to
    /// find out.
    private(set) lazy var trackRecorder = TrackRecorder(checkpoint: trackCheckpoint)

    /// The container the app launches with.
    ///
    /// `UITestMode` on the command line builds one that remembers nothing: an
    /// in-memory licence and a session store over defaults thrown away with the
    /// run. A UI test asserting on what the layer panel shows is otherwise
    /// asserting on whatever the simulator was left holding, and the two states
    /// do not look alike — a restricted layer with the licence accepted has a
    /// switch, and the same layer on a fresh install has a lock. That is how a
    /// test passing on a developer's simulator failed on a clean runner.
    static func forLaunch() -> AppContainer {
        // Before anything else can draw or be tapped.
        //
        // A Live Activity outlives the process that made it. If iOS terminated
        // this app with a walk running, the Lock Screen is still showing
        // "Recording a track" with a clock counting, and its buttons will
        // relaunch this process to perform an intent against a recorder that
        // knows nothing about that walk. Ending those activities here is what
        // stops the reader being shown a recording that does not exist.
        //
        // Not under a test host, which has no Lock Screen to reconcile and
        // where reaching ActivityKit blocks the main actor long enough to
        // starve the rest of the bundle — a deadlock-detector test elsewhere
        // began timing out at sixty seconds, which is how this was found.
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil {
            // Named synchronously, ended afterwards. Enumerating inside the
            // task would have swept up an activity the reader started in
            // between — the new walk's Lock Screen torn away while it went on
            // collecting fixes.
            let orphans = LiveActivityPresenter.orphanIDs()
            if !orphans.isEmpty {
                Task { await LiveActivityPresenter.endOrphans(orphans) }
            }
        }
        guard ProcessInfo.processInfo.arguments.contains("UITestMode") else {
            let container = AppContainer()
            // The walk, before a view exists to ask for it. Read here and not
            // from the map's `.task` because a recorder reached from a
            // cold-launched Lock Screen intent can be started before any view
            // runs, and the first thing a new recording does is put the old
            // journal aside.
            container.restoredWalk = container.trackCheckpoint.read()
            container.installTrackActivityActions()
            return container
        }
        // A UI test gets a checkpoint directory thrown away with the run, for
        // the same reason it gets a licence and a session store that remember
        // nothing: a test asserting on what is on screen must not be asserting
        // on a walk the simulator was left holding — and an unsaved recording
        // opens a sheet over everything else the test came to look at.
        let container = AppContainer(
            licenceStorage: InMemoryProvinceLicenceStorage(),
            sessionStore: MapSessionStore(
                defaults: UserDefaults(suiteName: "ui-test-\(UUID().uuidString)") ?? .standard
            ),
            checkpointStore: TrackCheckpointStore(
                directory: FileManager.default.temporaryDirectory
                    .appendingPathComponent("ui-test-\(UUID().uuidString)", isDirectory: true)
            )
        )
        container.installTrackActivityActions()
        return container
    }

    /// Points the Lock Screen's buttons at this process's recorder.
    ///
    /// At launch rather than from a view's `onAppear`, which is the finding
    /// this move exists to close: a `LiveActivityIntent` launches the app
    /// **without opening it**, and an intent performed before any view appeared
    /// found nothing installed. Whatever else is true of a launched process,
    /// this ran.
    private func installTrackActivityActions() {
        TrackActivityActions.shared.install(
            pause: { [trackRecorder] in
                trackRecorder.pause()
                guard trackRecorder.status == .paused else { return false }
                MapHaptics.modeChanged()
                return true
            },
            resume: { [trackRecorder] in
                trackRecorder.resume()
                guard trackRecorder.status == .recording else { return false }
                MapHaptics.modeChanged()
                return true
            }
        )
    }

    init(
        licenceStorage: (any ProvinceLicenceStorage)? = nil,
        sessionStore: MapSessionStore = MapSessionStore(),
        checkpointStore: TrackCheckpointStore? = nil
    ) {
        self.sessionStore = sessionStore
        self.checkpointStore = checkpointStore

        // Warm the bundled catalogs off the main thread. Their statics
        // memoize on first touch, and the first touch used to be the scene
        // body's view-model construction — ~320 KB of JSON decode and
        // validation on the first-frame path. Losing the race is harmless:
        // whoever touches the static first pays once, thread-safely.
        Task.detached(priority: .utility) {
            _ = TaxSaleCatalog.bundled
            _ = HistoricalTaxSaleCatalog.bundled
        }

        let store = TileStore()
        self.tileStore = store

        let cache = TileCache()
        self.tileCache = cache

        let fetcher = TileFetcher(tileCache: cache)
        self.tileFetcher = fetcher
        let tileDownloadManager = TileDownloadManager(tileStore: store)
        let migration = FletcherSourceMigration.runIfNeeded(tileCache: cache, tileStore: store)
        self.fletcherMigration = migration

        let licenceStore: ProvinceLicenceStore
        if let licenceStorage {
            licenceStore = ProvinceLicenceStore(storage: licenceStorage)
        } else {
            licenceStore = ProvinceLicenceStore()
        }
        self.licenceStore = licenceStore
        let clearanceBox = LicenceClearanceBox(licenceStore.clearance)
        self.clearanceBox = clearanceBox

        let fletcherBaseURL = FletcherHost.configuredBaseURL
        let fletcherTileLoader = fletcherBaseURL.map {
            FletcherTileLoader(tileFetcher: fetcher, baseURL: $0)
        }
        self.offlineAreasViewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            tileDownloadManager: tileDownloadManager,
            tileLoader: fletcherTileLoader,
            fletcherMigration: migration
        )

        let controller = MapController(
            tileCache: cache,
            tileFetcher: fetcher,
            tileStore: store,
            fletcherMigration: migration,
            clearanceBox: clearanceBox
        )
        self.mapController = controller

        let session = sessionStore.load()
        self.restoredSession = session
        let opening = Self.launchVisibleIDs(
            clearance: licenceStore.clearance, session: session?.view
        )
        var openedAerial = false
        for var layer in Self.installableLayers(fletcherBaseURL: fletcherBaseURL) {
            if let id = LayerID(rawValue: layer.id) {
                layer.isVisible = opening.contains(id)
                openedAerial = openedAerial || (id == .nsAerial && layer.isVisible)
            }
            controller.addLayer(layer)
        }
        // Set here rather than left to the restore, so the first frame the map
        // draws is already the background the reader works in. A satellite user
        // otherwise sees streets for the moment before the view model runs.
        //
        // A background whose layer is licensed is only restored if that layer
        // survived the filtering above. NS Aerial is a base map and a licensed
        // layer at once, and setting it here regardless would name imagery the
        // map has just been told it may not draw.
        if let background = session?.background,
           OverlayViewModel.basemapLayerID(for: background).map(opening.contains) ?? true {
            controller.baseMapType = background
        } else if openedAerial {
            // NS Aerial is a base map as well as an overlay, and the two move
            // together everywhere else. Setting the layer alone would open with
            // imagery drawn and the base-map picker reading "Standard".
            controller.baseMapType = .nsAerial
        }
    }

    /// The layers the map opens on, given what the user has already agreed to.
    ///
    /// `nativeDefaultVisible` answers whether or not the licence has been
    /// accepted: Fletcher is the one sheet set that needs no permission, and it
    /// is the layer this app opens on by design.
    ///
    /// It used to add the four layers the catalogue marks `webDefaultVisible`
    /// once a licence had been accepted, because the browser was said to open a
    /// returning reader on aerial imagery, parcels, water and roads. It does
    /// not. `initialProvinceLayerVisibility` is read by the parity export and
    /// by nothing that runs: the browser opens on the Explore Nova Scotia
    /// setup, which is the modern base map alone with tax sales off. Accepting
    /// a licence is permission to ask the Province for something, not a request
    /// to switch four layers on.
    ///
    /// Clearance is still read, never assumed, because a session may name
    /// layers the licence no longer covers.
    ///
    /// A stored session replaces the whole calculation. Defaults answer for a
    /// reader who has not said anything yet, and one who left the map with four
    /// layers on and two off has said something.
    static func launchVisibleIDs(
        clearance: ProvinceLicenceClearance,
        session: MapShareState? = nil
    ) -> Set<LayerID> {
        if let session {
            // The reader's own last answer, which outranks every default: the
            // layers they switched off stay off, and a default does not walk
            // back on over them.
            let asked = Set(session.layerIDs.compactMap(LayerID.init(rawValue:)))
            guard clearance.allowsRestrictedLayers else {
                // A session records what was on screen. It is not permission,
                // and the licence may have been withdrawn since it was written.
                return asked.filter {
                    LayerCatalog.descriptor(for: $0)?.requiresProvinceClearance != true
                }
            }
            return asked
        }
        return LayerCatalog.nativeDefaultVisibleIDs
    }

    /// Every catalogued raster the app can draw, bottom of the stack first.
    ///
    /// Not filtered by licence. A restricted layer is installed but starts
    /// hidden, and `OpacityTileOverlay` asks `TileRequestFactory` for a cleared
    /// request before every tile — so an unaccepted layer draws nothing and
    /// contacts nothing, while still having a row the user can turn on to reach
    /// the licence sheet. Filtering here instead would remove the row, leaving
    /// no way to accept and nothing to accept it for.
    static func installableLayers(fletcherBaseURL: URL?) -> [MapLayerState] {
        NativeLayerTraits.installOrder
            .compactMap(LayerCatalog.descriptor(for:))
            .compactMap { makeLayer(from: $0, fletcherBaseURL: fletcherBaseURL) }
    }

    /// Turns a catalogue entry into an installed layer, or `nil` where there is
    /// nothing renderable to install.
    ///
    /// Keyed on `delivery`, which is the field the shared catalog exists to
    /// answer this question with, rather than on the id. A layer added to the
    /// catalog is drawn without an entry here; a layer whose delivery this app
    /// has no renderer for is skipped rather than guessed at.
    ///
    /// `static` and not `private` so it can be exercised against a descriptor
    /// the caller supplies. Tests exercise both hosted and unhosted Fletcher
    /// configurations independently of the build's default tile host.
    static func makeLayer(
        from descriptor: LayerDescriptor,
        fletcherBaseURL: URL?
    ) -> MapLayerState? {
        switch descriptor.delivery {
        case .xyzTemplate:
            // Fletcher is the only one, and its address is a build setting
            // rather than catalog data. With no host configured there is no
            // pyramid to point at, so nothing is installed — the panel still
            // shows the row, disabled, because it reads the catalog.
            guard descriptor.id == .fletcher, let baseURL = fletcherBaseURL else {
                return nil
            }
            return MapLayerState(
                descriptor: descriptor,
                source: .fletcherSheets(baseURL: baseURL)
            )

        case .mapExport:
            // The URL is built per tile by `TileRequestFactory`; what matters
            // here is only that it *can* be built, so a catalog entry missing
            // its endpoint or its export options is skipped rather than
            // installed as a layer that answers every tile with a blank.
            guard descriptor.serviceURL != nil, descriptor.exportOptions != nil else {
                return nil
            }
            return MapLayerState(
                descriptor: descriptor,
                source: .catalogExport(descriptor.id)
            )

        case .featureQuery, .derivedParcelQuery, .geoJSONEndpoint,
             .bundledGeoJSON, .unavailable:
            // Vector deliveries arrive with the feature layers in a later
            // phase; `.unavailable` is the four Church sheets, catalogued for
            // attribution with no tiles to draw.
            return nil
        }
    }
}
