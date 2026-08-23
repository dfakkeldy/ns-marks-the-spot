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
        guard ProcessInfo.processInfo.arguments.contains("UITestMode") else {
            return AppContainer()
        }
        return AppContainer(
            licenceStorage: InMemoryProvinceLicenceStorage(),
            sessionStore: MapSessionStore(
                defaults: UserDefaults(suiteName: "ui-test-\(UUID().uuidString)") ?? .standard
            )
        )
    }

    init(
        licenceStorage: (any ProvinceLicenceStorage)? = nil,
        sessionStore: MapSessionStore = MapSessionStore()
    ) {
        self.sessionStore = sessionStore

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
    /// `nativeDefaultVisible` answers for a fresh install: the licence is
    /// unanswered, and Fletcher is the one sheet set that needs no permission.
    /// It is the wrong answer for a returning user who accepted months ago. The
    /// browser opens that user on aerial imagery, parcels, water and roads, and
    /// this app remembers no per-layer choice between launches — so without
    /// this they switch the same four back on at every cold start.
    ///
    /// Clearance is read, never assumed. Before acceptance this is exactly the
    /// catalogue's native default, which is what keeps a first launch off the
    /// Province services and out of the licence dialog.
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
        guard clearance.allowsRestrictedLayers else {
            return LayerCatalog.nativeDefaultVisibleIDs
        }
        return LayerCatalog.nativeDefaultVisibleIDs
            .union(LayerCatalog.all.filter(\.webDefaultVisible).map(\.id))
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
    /// the caller supplies. The branch that matters most — Fletcher with a host
    /// configured — is unreachable in a checkout without
    /// `FLETCHER_TILE_BASE_URL`, which is every checkout in CI. A test that
    /// could only observe the ambient configuration would pass with that branch
    /// deleted.
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
