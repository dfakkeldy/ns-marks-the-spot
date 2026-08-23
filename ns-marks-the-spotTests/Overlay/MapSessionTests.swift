import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// Picking the map up where it was left.
///
/// The browser has an address bar doing this: every move rewrites the URL, so
/// a reload opens on the same ground with the same layers. These are the
/// equivalents on a surface with no address bar.
@MainActor
@Suite("Resuming the last session")
struct MapSessionTests {
    private static func defaults() -> UserDefaults {
        UserDefaults(suiteName: UUID().uuidString) ?? .standard
    }

    // MARK: - The store

    @Test func theStoreHandsBackTheViewItWasGiven() throws {
        let store = MapSessionStore(defaults: Self.defaults())
        let saved = MapShareState(
            taxSaleEnabled: true,
            mode: .historical,
            pid: "15234636",
            eventIDs: [],
            layerIDs: [MapShareState.modernBaseLayerID, LayerID.nsprd.rawValue],
            position: MapPosition(latitude: 46.1, longitude: -60.2, zoom: 15)
        )

        store.save(MapSession(view: saved, background: .satellite))
        let loaded = try #require(store.load())

        #expect(loaded.view.taxSaleEnabled)
        #expect(loaded.view.mode == .historical)
        #expect(loaded.view.pid == "15234636")
        #expect(loaded.view.layerIDs.contains(LayerID.nsprd.rawValue))
        #expect(loaded.view.position.zoom == 15)
        #expect(abs(loaded.view.position.latitude - 46.1) < 0.0001)
        // MapKit's satellite map has no name in the vocabulary the two surfaces
        // share, so it travels beside the link rather than inside it.
        #expect(loaded.background == .satellite)
    }

    @Test func aFirstLaunchHasNoSession() {
        #expect(MapSessionStore(defaults: Self.defaults()).load() == nil)
    }

    /// Parsing never fails, so without a check on the way in a truncated or
    /// overwritten value would open the map on the default view and present it
    /// as the one the reader left.
    @Test func aStoredValueThatIsNotALinkIsNotASession() {
        let defaults = Self.defaults()
        defaults.set("not a link", forKey: MapSessionStore.key)

        #expect(MapSessionStore(defaults: defaults).load() == nil)
    }

    // MARK: - What opens

    @Test func aStoredSessionKeepsTheLayersTheReaderSwitchedOff() {
        let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage())
        store.accept()
        let session = MapShareState(layerIDs: [LayerID.nsprd.rawValue])

        let opening = AppContainer.launchVisibleIDs(
            clearance: store.clearance, session: session
        )

        #expect(opening == [.nsprd])
        // The web defaults would have brought three more back with it.
        #expect(opening.contains(.nsAerial) == false)
    }

    /// A session records what was on screen. It is not permission, and the
    /// licence may have been withdrawn since it was written.
    @Test func aStoredSessionCannotPutBackWhatTheLicenceNowRefuses() {
        let session = MapShareState(
            layerIDs: [LayerID.nsprd.rawValue, LayerID.fletcher.rawValue]
        )

        let opening = AppContainer.launchVisibleIDs(clearance: .none, session: session)

        #expect(opening == [.fletcher])
    }

    @Test func aContainerWithNoStoredSessionStillOpensOnTheDefaults() {
        let container = AppContainer(
            licenceStorage: InMemoryProvinceLicenceStorage(initial: .accepted),
            sessionStore: .forTesting()
        )

        #expect(container.restoredSession == nil)
        #expect(container.mapController.layers.contains { $0.id == LayerID.nsprd.rawValue && $0.isVisible })
    }

    // MARK: - Resuming

    @Test func aSessionFromBeforeBackgroundsWereCarriedIsStillReadable() throws {
        let defaults = Self.defaults()
        let store = MapSessionStore(defaults: defaults)
        store.save(MapSession(view: MapShareState(pid: "15234636")))

        let loaded = try #require(store.load())

        // Not "Standard": the link says whether the modern map was drawn, and
        // answering for a background nobody recorded would switch a reader's
        // blank map back to streets.
        #expect(loaded.background == nil)
        #expect(loaded.view.pid == "15234636")
    }

    @Test func resumingRestoresTheRecordSetAndThePosition() {
        let controller = MapController()
        let model = OverlayViewModel.forTesting(
            controller: controller,
            installing: [.nsprd],
            historical: HistoricalTaxSaleViewModel()
        )

        model.resume(
            MapSession(
                view: MapShareState(
                    taxSaleEnabled: true,
                    mode: .historical,
                    layerIDs: [LayerID.nsprd.rawValue],
                    position: MapPosition(latitude: 46.14, longitude: -60.19, zoom: 16)
                )
            )
        )

        #expect(model.mapRecordMode == .historical)
        #expect(model.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == true)
        // Held rather than applied: the map has no width yet at launch, which
        // is exactly when this runs.
        #expect(controller.heldPosition?.zoom == 16)
        #expect(abs((controller.heldPosition?.latitude ?? 0) - 46.14) < 0.0001)
    }

    /// Nobody sent this view. The sentence about opening a shared link would be
    /// telling the reader something that did not happen.
    @Test func resumingSaysNothingAboutASharedLink() {
        let model = OverlayViewModel.forTesting(installing: [.nsAerial])

        model.resume(MapSession(view: MapShareState(layerIDs: [LayerID.nsAerial.rawValue])))

        #expect(model.parcelMessage == nil)
        #expect(model.sharedLinkNotice == nil)
    }

    /// The reader withdrew that permission themselves. Asking again every time
    /// the app opens would be arguing with them.
    @Test func resumingDoesNotAskAboutTheLicenceAgain() {
        let model = OverlayViewModel.forTesting(installing: [.nsprd], licence: .declined)

        model.resume(MapSession(view: MapShareState(layerIDs: [LayerID.nsprd.rawValue])))

        #expect(model.isShowingLicenceSheet == false)
        #expect(model.rows.first { $0.id == LayerID.nsprd.rawValue }?.isVisible == false)
    }

    // MARK: - Writing it down

    @Test func whatIsRememberedIsWhatTheMapIsShowing() throws {
        let store = MapSessionStore(defaults: Self.defaults())
        let model = OverlayViewModel.forTesting(
            installing: [.nsprd, .nsAerial],
            sessionStore: store
        )
        model.toggleVisibility(LayerID.nsprd.rawValue)

        model.rememberSession()
        let loaded = try #require(store.load())

        #expect(loaded.view.layerIDs.contains(LayerID.nsprd.rawValue))
        #expect(loaded.view.layerIDs.contains(LayerID.nsAerial.rawValue) == false)
    }

    /// The window between a launch and the map having a width is where this
    /// used to go wrong: `mapPosition` answered with the opening view, so a
    /// scene going inactive in that moment wrote the province over the ground
    /// the reader had left.
    @Test func aSessionWrittenBeforeTheMapDrawsKeepsWhatItOpenedOn() throws {
        let store = MapSessionStore(defaults: Self.defaults())
        let model = OverlayViewModel.forTesting(installing: [], sessionStore: store)
        model.resume(
            MapSession(
                view: MapShareState(
                    position: MapPosition(latitude: 45.31, longitude: -61.14, zoom: 14)
                )
            )
        )

        model.rememberSession()
        let loaded = try #require(store.load())

        #expect(loaded.view.position.zoom == 14)
        #expect(abs(loaded.view.position.latitude - 45.31) < 0.0001)
    }

    /// Restoring a parcel means asking the Province for its boundary, and that
    /// answer can be seconds away. A session written inside that window used to
    /// drop the PID: the reader came back to the right ground with the card
    /// gone.
    @Test func aSessionWrittenBeforeTheParcelArrivesStillNamesIt() throws {
        let store = MapSessionStore(defaults: Self.defaults())
        let model = OverlayViewModel.forTesting(installing: [], sessionStore: store)

        model.resume(MapSession(view: MapShareState(pid: "15234636")))
        #expect(model.parcels.selectedPID == nil)
        model.rememberSession()

        #expect(try #require(store.load()).view.pid == "15234636")
    }

    /// A reader who works in satellite should not be put back on streets at
    /// every cold launch.
    @Test func theBackgroundIsRememberedAndComesBack() throws {
        let defaults = Self.defaults()
        let licence = InMemoryProvinceLicenceStorage(initial: .accepted)
        let first = AppContainer(
            licenceStorage: licence, sessionStore: MapSessionStore(defaults: defaults)
        )
        let model = OverlayViewModel(container: first)
        model.setBaseMapType(.satellite)
        model.rememberSession()

        let next = AppContainer(
            licenceStorage: licence, sessionStore: MapSessionStore(defaults: defaults)
        )

        #expect(next.mapController.baseMapType == .satellite)
    }

    /// The browser writes its map mode into a link whether or not tax sales are
    /// on, and keeps the mode underneath the switch. Writing `current` here
    /// would tell the other surface the reader had gone back to notices when
    /// they had only switched tax sales off.
    @Test func aSessionKeepsTheModeAMapWithoutTaxSalesIsHolding() throws {
        let store = MapSessionStore(defaults: Self.defaults())
        let model = OverlayViewModel.forTesting(
            installing: [],
            historical: HistoricalTaxSaleViewModel(),
            sessionStore: store
        )
        model.setMapRecordMode(.historical)
        model.setTaxSaleEnabled(false)

        model.rememberSession()

        #expect(model.mapRecordMode == .current)
        #expect(try #require(store.load()).view.mode == .historical)
    }

    /// The point of the whole exercise, stated as one round trip: what the
    /// reader switched off is still off at the next launch.
    @Test func theNextLaunchOpensOnWhatWasRemembered() throws {
        let defaults = Self.defaults()
        let licence = InMemoryProvinceLicenceStorage(initial: .accepted)
        let first = AppContainer(
            licenceStorage: licence,
            sessionStore: MapSessionStore(defaults: defaults)
        )
        let model = OverlayViewModel(container: first)
        model.toggleVisibility(LayerID.nsprd.rawValue)
        model.rememberSession()

        let next = AppContainer(
            licenceStorage: licence,
            sessionStore: MapSessionStore(defaults: defaults)
        )

        #expect(next.restoredSession != nil)
        let visible = Set(next.mapController.layers.filter(\.isVisible).map(\.id))
        #expect(visible.contains(LayerID.nsprd.rawValue) == false)
        #expect(visible.contains(LayerID.nsAerial.rawValue))
    }
}
