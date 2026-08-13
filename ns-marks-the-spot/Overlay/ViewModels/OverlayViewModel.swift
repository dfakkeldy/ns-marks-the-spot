import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Observation

/// One row of the layer panel.
///
/// `installed` is `nil` when the catalog lists a layer this build cannot draw —
/// Fletcher with no tile host configured, the Church sheets with no tiles at
/// all, and anything whose delivery the app has no renderer for yet. The row
/// still appears, disabled, because a layer silently ceasing to exist depending
/// on a build setting the user cannot see reads as a bug in the app rather than
/// as a feature that has not shipped.
/// What a layer's tiles are doing, as the panel says it.
nonisolated struct LayerRuntimeStatus: Equatable, Sendable {
    /// How loudly the chip says it. Three readings, because that is all the
    /// web's `.layer-runtime` styling distinguishes and all a colour can carry
    /// on its own; the label is what actually says which state this is.
    enum Emphasis: Equatable, Sendable {
        case quiet
        case working
        case ready
        case broken
    }

    let label: String
    let emphasis: Emphasis
}

nonisolated struct LayerRow: Identifiable, Equatable, Sendable {
    let descriptor: LayerDescriptor
    let installed: MapLayerState?
    /// Whether the Province licence still stands between the user and this
    /// layer's imagery.
    let needsLicence: Bool
    /// What this layer's tiles are doing, in the web panel's words — `nil` for
    /// a row with nothing installed behind it, which has no tiles to be doing
    /// anything and says why on its own line.
    let runtime: LayerRuntimeStatus?

    var id: String { descriptor.id.rawValue }
    var name: String { descriptor.name }
    var isAvailable: Bool { installed != nil }
    var isVisible: Bool { installed?.isVisible ?? false }
    var opacity: CGFloat { installed?.opacity ?? 0 }

    /// The web's `layerRuntimeLabel`, with the same vocabulary and the same
    /// order of questions.
    ///
    /// Off first, because a layer that is not on is not loading whatever the
    /// tile queues were last doing. Zoom next, because MapKit will not ask for
    /// a tile below `minimumZ` and the phase would sit at `idle` — "Ready to
    /// load" is exactly wrong for a layer that is on and will not draw until
    /// the user zooms in.
    ///
    /// The web's `Ready · N loaded` has no counterpart here: its N counts
    /// features returned by a query, and every layer this app installs is a
    /// raster. Reporting a tile count in its place would put a different
    /// measurement behind the same words.
    static func runtimeStatus(
        isVisible: Bool,
        minZoom: Int,
        zoomLevel: Int,
        phase: TileLoadPhase
    ) -> LayerRuntimeStatus {
        guard isVisible else {
            return LayerRuntimeStatus(label: "Off", emphasis: .quiet)
        }
        guard zoomLevel >= minZoom else {
            return LayerRuntimeStatus(label: "Zoom to \(minZoom)+ to load", emphasis: .quiet)
        }

        switch phase {
        case .loading:
            return LayerRuntimeStatus(label: "Loading visible area…", emphasis: .working)
        case .failing:
            return LayerRuntimeStatus(label: "Source temporarily unavailable", emphasis: .broken)
        case .ready:
            return LayerRuntimeStatus(label: "Ready", emphasis: .ready)
        case .idle:
            return LayerRuntimeStatus(label: "Ready to load", emphasis: .quiet)
        }
    }
}

/// One collapsible section of the layer panel.
nonisolated struct LayerSection: Identifiable, Equatable, Sendable {
    let group: LayerGroupID
    let rows: [LayerRow]

    var id: String { group.rawValue }
    var title: String { NativeLayerTraits.title(for: group) }
    var visibleCount: Int { rows.count(where: \.isVisible) }

    /// The line under the heading.
    ///
    /// Counted from the rows this panel is actually showing rather than copied
    /// from the web's equivalent line, which counts what *that* surface shows —
    /// the same section holds five zoning layers there and none here.
    var subtitle: String {
        let layers = rows.count == 1 ? "1 layer" : "\(rows.count) layers"
        return visibleCount == 0 ? layers : "\(layers) · \(visibleCount) on"
    }
}

/// Layer-menu logic over `MapController`. Carries no observable state of its
/// own beyond the pending licence prompt: views reading `rows`/`baseMapType`
/// track the controller's applied state and the licence store directly through
/// Observation.
@MainActor
@Observable
final class OverlayViewModel {
    private let nsAerialLayerId = LayerID.nsAerial.rawValue
    private let nsAerialBasemapOpacity: CGFloat = 1.0
    private let restoredOverlayOpacity: CGFloat = 0.7

    /// The layer the user reached for while the licence was still unanswered.
    /// Non-nil exactly while the licence sheet is up.
    private(set) var licencePromptedLayerID: LayerID?

    var layers: [MapLayerState] { controller.layers }
    var baseMapType: MapBaseType { controller.baseMapType }

    /// Every catalogued layer the panel presents, in the panel's own order.
    ///
    /// Read from the catalog rather than from `controller.layers`, which is the
    /// set MapKit draws. The two differ on purpose: a layer can be catalogued
    /// and not installable, and both states need a row.
    var rows: [LayerRow] {
        let installed = Dictionary(
            controller.layers.map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        let needsDecision = licenceStore.needsDecision
        let zoomLevel = controller.zoomLevel
        return Self.presentedDescriptors.map { descriptor in
            let layer = installed[descriptor.id.rawValue]
            return LayerRow(
                descriptor: descriptor,
                installed: layer,
                needsLicence: needsDecision && descriptor.requiresProvinceClearance,
                runtime: layer.map { layer in
                    LayerRow.runtimeStatus(
                        isVisible: layer.isVisible,
                        minZoom: descriptor.minZoom,
                        zoomLevel: zoomLevel,
                        phase: controller.layerLoadPhases[layer.id] ?? .idle
                    )
                }
            )
        }
    }

    /// The panel's sections, in catalog order, carrying only the groups that
    /// have a row to show.
    ///
    /// Groups rather than one flat list because the catalog went from ten
    /// layers to twenty-five: a single scroll of switches is where a user stops
    /// being able to find the one they came for. Empty groups are dropped
    /// instead of rendered empty — `forestry`, `zoning`, `groundwater` and
    /// `hydro-pilot` are catalogued but arrive with the vector layers, and a
    /// section that opens onto nothing reads as a bug rather than as a phase
    /// that has not shipped.
    var sections: [LayerSection] {
        let grouped = Dictionary(grouping: rows) { $0.descriptor.group }
        return LayerGroupID.allCases.compactMap { group in
            guard let rows = grouped[group], !rows.isEmpty else { return nil }
            return LayerSection(group: group, rows: rows)
        }
    }

    /// The catalog entries that get a row: everything the app installs as a
    /// tile overlay, plus the Church sheets, which are catalogued with no tiles
    /// and appear so the user can see what is coming and where the scan lives.
    private static let presentedDescriptors: [LayerDescriptor] = {
        let installable = Set(NativeLayerTraits.installOrder)
        return LayerCatalog.all
            .filter { installable.contains($0.id) || $0.group == .church }
            .sorted { $0.uiOrder < $1.uiOrder }
    }()

    private let controller: MapController
    private let licenceStore: ProvinceLicenceStore
    private let clearanceBox: LicenceClearanceBox
    private let parcelFetcher: ParcelFetcher
    private let civicFetcher: CivicAddressFetcher

    /// `licenceStore` has no default on purpose. A default would have to pick a
    /// state, and both choices are wrong: an accepting default is a way to get
    /// permission without a user, and a refusing one silently disables the map
    /// for any caller that forgot the argument.
    init(
        controller: MapController,
        licenceStore: ProvinceLicenceStore,
        clearanceBox: LicenceClearanceBox = LicenceClearanceBox(),
        parcelFetcher: ParcelFetcher = ParcelFetcher(),
        civicFetcher: CivicAddressFetcher = CivicAddressFetcher()
    ) {
        self.controller = controller
        self.licenceStore = licenceStore
        self.clearanceBox = clearanceBox
        self.parcelFetcher = parcelFetcher
        self.civicFetcher = civicFetcher
        mirrorClearanceIntoBox()
    }

    convenience init(container: AppContainer) {
        self.init(
            controller: container.mapController,
            licenceStore: container.licenceStore,
            clearanceBox: container.clearanceBox
        )
    }

    // MARK: - Parcels

    private(set) var parcels = ParcelSelection()

    /// What the last parcel lookup is doing or found, in the words the web uses.
    private(set) var parcelMessage: String?

    /// The one lookup allowed to be in flight.
    ///
    /// Cancelled rather than left to finish, so a second tap cannot be
    /// overtaken by the first one's answer and select a parcel the user has
    /// already moved away from.
    @ObservationIgnored private var parcelLookup: Task<Void, Never>?

    /// Whether a tap on the map should ask NSPRD what is under it.
    ///
    /// The layer switch is the user's statement that parcels are what they are
    /// working with, and the zoom floor is the one the catalog sets for the
    /// boundary layer itself: identifying a point on a province-wide view would
    /// return whatever parcel happened to be under a finger covering a
    /// kilometre of ground.
    var isIdentifyingParcels: Bool {
        installedLayer(.nsprd)?.isVisible == true
            && controller.zoomLevel >= Self.parcelIdentifyMinimumZoom
    }

    private static let parcelIdentifyMinimumZoom =
        LayerCatalog.descriptor(for: .nsprd)?.minZoom ?? 14

    /// Asks what parcel is under a tapped point.
    func identifyParcel(latitude: Double, longitude: Double) {
        guard isIdentifyingParcels else { return }
        identifyParcel(latitude: latitude, longitude: longitude, at: nil, focus: false)
    }

    /// The same lookup, for a point the user did not tap.
    ///
    /// `address` skips the zoom and layer-visibility guards, and it is right to
    /// skip them: those exist because a fingertip on a province-wide map covers
    /// a kilometre of ground, and a chosen civic address is a coordinate the
    /// Province published. The map is focused on the result for the same reason
    /// — nothing about the current view says where that address is.
    private func identifyParcel(
        latitude: Double, longitude: Double, at address: String?, focus: Bool
    ) {
        addressResults = []
        cancelAddressLookup()
        parcelMessage = address.map(ParcelLookupMessage.searching(for:))
            ?? ParcelLookupMessage.searchingAtPoint
        startLookup(forPointTap: true) { [parcelFetcher, clearance = clearanceBox.clearance] in
            // `do throws(…)` rather than a bare `do`: inside a closure the
            // thrown type is not inferred, and an untyped catch would widen the
            // failure to `any Error` — losing exactly the distinctions the
            // messages depend on.
            do throws(ParcelLookupFailure) {
                return .success(
                    try await parcelFetcher.parcel(
                        latitude: latitude, longitude: longitude, clearance: clearance
                    )
                )
            } catch {
                return .failure(error)
            }
        } onSuccess: { [weak self] collection in
            guard let self else { return }
            guard let pid = collection.identifiedFeatures.first?.pid else {
                // Two different nothings. An empty reply is the service looking
                // and finding no parcel — the only place in this file that may
                // say so. Shapes without a readable PID are the service finding
                // something this build could not identify, which is not the
                // same fact and must not borrow the same sentence.
                parcelMessage = collection.isEmpty
                    ? ParcelLookupMessage.noParcelAtPoint
                    : ParcelLookupMessage.unidentifiedAtPoint(collection.unidentifiedFeatureCount)
                return
            }
            adopt(collection, selecting: pid, focus: focus, labelling: address)
        }
    }

    // MARK: - The search field

    /// What the search field contains.
    ///
    /// Held here rather than in the view because both sides write it — the user
    /// types, and a selection fills it in — and only this side can tell those
    /// apart. A view that could not would cancel the lookup it had just started
    /// the moment it wrote the result into the field.
    private(set) var searchText = ""

    /// The user typed. Write it, then use `submitSearch`.
    func editSearchText(_ text: String) {
        guard text != searchText else { return }
        searchText = text
        // Everything on screen described the previous text. The results list
        // most of all: leaving it up would let the user pick an address that no
        // longer matches what the field says.
        parcelLookup?.cancel()
        cancelAddressLookup()
        addressResults = []
        parcelMessage = nil
    }

    func submitSearch() {
        searchParcel(searchText)
    }

    /// Fills the field in from a result, without that counting as typing.
    private func setSearchText(_ text: String) {
        searchText = text
    }

    /// Looks up whatever the user typed: a PID, or a civic address.
    ///
    /// Reading the input is the package's job, so the same rules decide it here
    /// and in the tests that run without a simulator.
    func searchParcel(_ query: String) {
        switch ParcelSearchInput.classify(query) {
        case .pid(let pid):
            searchPID(pid)
        case .empty:
            abandonAddressSearch(saying: nil)
        case .notAPID:
            abandonAddressSearch(saying: ParcelLookupMessage.enterAPID)
        case .tooShort:
            abandonAddressSearch(saying: ParcelLookupMessage.enterMoreOfAnAddress)
        case .address(let text):
            searchCivicAddress(text)
        }
    }

    private func searchPID(_ pid: String) {
        addressResults = []
        cancelAddressLookup()

        if parcels.holds(pid: pid) {
            // Already loaded. Selecting without a request is what makes going
            // back to a parcel instant, and it is safe precisely because the
            // shapes came from the service rather than from anything derived.
            parcelLookup?.cancel()
            parcels.select(pid)
            publishParcels(focus: true)
            setSearchText(pid)
            parcelMessage = ParcelLookupMessage.selected(pid: pid)
            return
        }

        parcelMessage = ParcelLookupMessage.loading(pid: pid)
        startLookup(forPointTap: false) { [parcelFetcher, clearance = clearanceBox.clearance] in
            do throws(ParcelLookupFailure) {
                return .success(try await parcelFetcher.parcels(pids: [pid], clearance: clearance))
            } catch {
                return .failure(error)
            }
        } onSuccess: { [weak self] collection in
            guard let self else { return }
            guard collection.identifiedFeatures.contains(where: { $0.pid == pid }) else {
                parcelMessage = collection.isEmpty
                    ? ParcelLookupMessage.noParcelForPID
                    : ParcelLookupMessage.unidentifiedForPID(collection.unidentifiedFeatureCount)
                return
            }
            adopt(collection, selecting: pid, focus: true)
        }
    }

    // MARK: - Civic addresses

    /// Addresses matching the last search, for the user to choose from.
    ///
    /// A list rather than a jump to the first result: several properties share
    /// a road name, and picking one for the user would be presenting a guess as
    /// an answer. Empty whenever a parcel is selected or a new search starts.
    private(set) var addressResults: [CivicAddressResponse.CivicAddress] = []

    private(set) var isSearchingAddresses = false

    @ObservationIgnored private var addressLookup: Task<Void, Never>?

    /// Drops the search in flight, if any.
    ///
    /// The flag is cleared here rather than in the task, because a cancelled
    /// task returns at its cancellation guard without reaching the line that
    /// would clear it — which would leave a spinner running over a search
    /// nobody is waiting for.
    private func cancelAddressLookup() {
        addressLookup?.cancel()
        addressLookup = nil
        isSearchingAddresses = false
    }

    /// Stops looking without disturbing the parcel drawn on the map.
    ///
    /// Both lookups are dropped, not just the address one: a submission that
    /// cannot be searched still replaces whatever the user asked before it, and
    /// a parcel lookup left running would land afterwards and overwrite the
    /// explanation with a selection the user did not ask for.
    private func abandonAddressSearch(saying message: String?) {
        parcelLookup?.cancel()
        cancelAddressLookup()
        addressResults = []
        parcelMessage = message
    }

    /// Searches the Civic Address File for text that is not a PID.
    ///
    /// Needs no Province licence — the file is open data — so this works even
    /// for a user who declined. Choosing a result then asks NSPRD, which is
    /// where the licence applies, and refuses in the usual words.
    private func searchCivicAddress(_ typed: String) {
        addressResults = []
        parcelLookup?.cancel()
        cancelAddressLookup()
        isSearchingAddresses = true
        parcelMessage = ParcelLookupMessage.searchingAddresses
        addressLookup = Task { [weak self, civicFetcher] in
            let outcome: Result<[CivicAddressResponse.CivicAddress], CivicAddressFailure>
            do throws(CivicAddressFailure) {
                outcome = .success(try await civicFetcher.search(typed))
            } catch {
                outcome = .failure(error)
            }
            guard !Task.isCancelled, let self else { return }
            isSearchingAddresses = false

            switch outcome {
            case .success(let addresses):
                addressResults = addresses
                // The file was searched and matched nothing. The only message
                // here allowed to say so.
                parcelMessage = addresses.isEmpty ? ParcelLookupMessage.noAddressMatched : nil
            case .failure(let failure):
                guard let message = ParcelLookupMessage.failure(failure) else { return }
                parcelMessage = message
            }
        }
    }

    /// Finds the parcel under a civic address the user chose.
    func selectAddress(_ address: CivicAddressResponse.CivicAddress) {
        // The field takes the chosen address straight away rather than when the
        // parcel comes back: the user has made a choice, and a field still
        // showing what they typed while the map moves says the choice did not
        // register.
        setSearchText(address.label)
        identifyParcel(
            latitude: address.coordinate.lat,
            longitude: address.coordinate.lng,
            at: address.label,
            focus: true
        )
    }

    /// Waits for an address search in flight, if any. The parcel equivalent,
    /// and a seam for the same reason.
    func awaitAddressSearch() async {
        await addressLookup?.value
    }

    /// Waits for the lookup in flight, if any.
    ///
    /// A seam for tests, which otherwise have to guess how long a stubbed
    /// request takes. Awaiting the task is also what makes a cancellation test
    /// meaningful: it returns when the work is genuinely over rather than when
    /// a sleep expired.
    func awaitParcelLookup() async {
        await parcelLookup?.value
    }

    func clearParcelSelection() {
        parcelLookup?.cancel()
        cancelAddressLookup()
        addressResults = []
        setSearchText("")
        parcels.select(nil)
        publishParcels(focus: false)
        parcelMessage = nil
    }

    private func adopt(
        _ collection: ParcelFeatureCollection,
        selecting pid: String,
        focus: Bool,
        labelling address: String? = nil
    ) {
        parcels.merge(collection)
        parcels.select(pid)
        publishParcels(focus: focus)
        // The field keeps the address the user chose rather than the PID it
        // resolved to: they asked about an address, and replacing their words
        // with an identifier hides which of the listed addresses is on screen.
        setSearchText(address ?? pid)

        // More than one PID under one point: the parcels meet there, and which
        // one the service listed first is not evidence of which one the point
        // belongs to.
        let others = Set(collection.identifiedFeatures.map(\.pid)).subtracting([pid]).count
        // The boundary notice wins over "selected": a parcel drawing nothing is
        // the thing the user needs told, and "PID … selected." over a map with
        // no outline on it reads as the parcel not being there.
        parcelMessage = parcels.boundaryNotice
            ?? (others > 0
                ? ParcelLookupMessage.selectedWhereParcelsMeet(pid: pid, others: others)
                : ParcelLookupMessage.selected(pid: pid))
    }

    private func publishParcels(focus: Bool) {
        controller.setParcelShapes(parcels.shapes)
        if focus, let bounds = parcels.selectedBounds {
            controller.focus(on: bounds)
        }
    }

    private func startLookup(
        forPointTap: Bool,
        _ lookup: @escaping @Sendable () async
            -> Result<ParcelFeatureCollection, ParcelLookupFailure>,
        onSuccess: @escaping @MainActor (ParcelFeatureCollection) -> Void
    ) {
        parcelLookup?.cancel()
        parcelLookup = Task { [weak self] in
            let outcome = await lookup()
            // Cancellation is checked after the await as well as inside the
            // fetcher: a lookup that has already been replaced must not write
            // its answer, or a fast second tap would be overwritten by a slow
            // first one and the map would select the parcel the user left.
            guard !Task.isCancelled else { return }
            switch outcome {
            case .success(let collection):
                onSuccess(collection)
            case .failure(let failure):
                guard let message = ParcelLookupMessage.failure(
                    failure, forPointTap: forPointTap
                ) else { return }
                self?.parcelMessage = message
            }
        }
    }

    // MARK: - Licence

    /// Keeps the tile queues' copy of the clearance in step with the store's,
    /// whoever changed it.
    ///
    /// There are two copies because there have to be: the store is `@MainActor`
    /// and `@Observable` so the sheet and the switches track it, and MapKit asks
    /// for tiles on background queues that will not wait for the main actor. Two
    /// copies of an answer about permission is exactly the arrangement that ends
    /// with a map still drawing restricted imagery behind a switch that says it
    /// is off.
    ///
    /// So this mirrors on observation rather than only at the call sites that
    /// happen to be here today. `accept` and `decline` still write the box
    /// synchronously — a user who accepts should not wait a hop for the first
    /// tile — but a `revoke()` sent straight to the store, from a control this
    /// app has not built yet or from a test, is caught too. `onChange` fires
    /// before the store's new value is in place, so the re-read is scheduled
    /// rather than immediate, and re-registering is what keeps it watching.
    ///
    /// Switching the refused layers off is part of mirroring, not a separate
    /// courtesy. Stopping the requests is only half of a revocation: the rows
    /// would stay on, and a layer whose tiles are all being refused reports the
    /// last thing its tiles did — so a revoked layer could sit there switched
    /// on saying "Ready" over nothing. Only the tracked read belongs inside
    /// `withObservationTracking`; hiding reads `controller.layers`, which is
    /// observable, and tracking that here would re-arm this on every layer
    /// change.
    private func mirrorClearanceIntoBox() {
        let clearance = withObservationTracking {
            licenceStore.clearance
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.mirrorClearanceIntoBox()
            }
        }
        clearanceBox.update(clearance)
        hideRefusedLayers()
    }

    var isShowingLicenceSheet: Bool { licencePromptedLayerID != nil }

    var licencePromptedLayerName: String? {
        licencePromptedLayerID
            .flatMap(LayerCatalog.descriptor(for:))
            .map(\.name)
    }

    func acceptProvinceLicence() {
        licenceStore.accept()
        clearanceBox.update(licenceStore.clearance)
        // The layer the user was reaching for when the sheet appeared. Turning
        // it on here is what makes accepting read as an answer to the tap
        // rather than a dialog that dismissed and did nothing.
        let pending = licencePromptedLayerID
        licencePromptedLayerID = nil
        if let pending, let layer = installedLayer(pending) {
            show(layer, visible: true)
        }
    }

    func declineProvinceLicence() {
        licenceStore.decline()
        clearanceBox.update(licenceStore.clearance)
        licencePromptedLayerID = nil
        // Refusing is about what is on the screen, not only about what gets
        // requested next. Nothing restricted should be on at this point — they
        // install hidden and cannot be switched on without accepting — so this
        // is a belt on the case where some future path turns one on first.
        hideRefusedLayers()
    }

    func dismissLicenceSheet() {
        licencePromptedLayerID = nil
    }

    /// Switches off any visible layer the current clearance no longer permits.
    ///
    /// Asks the clearance per layer rather than switching off everything
    /// restricted, because this also runs on every mirror — including the one
    /// right after the user accepts, where switching restricted layers off
    /// would undo the acceptance.
    private func hideRefusedLayers() {
        let clearance = clearanceBox.clearance
        for layer in controller.layers {
            guard layer.isVisible,
                  let id = LayerID(rawValue: layer.id),
                  LayerCatalog.descriptor(for: id)?.requiresProvinceClearance == true,
                  !clearance.allows(id) else {
                continue
            }
            show(layer, visible: false)
        }
    }

    // MARK: - Layers

    /// Switching the base map is a way of turning a layer on, so it goes through
    /// the same gate the switch does.
    ///
    /// NS Aerial is the one base map that is also a restricted Province layer.
    /// Without this, picking it on a fresh install would mark the layer visible,
    /// every tile would then be refused, and the user would be left looking at a
    /// blank map with the picker insisting it had loaded — and no way to reach
    /// the licence sheet except noticing the separate locked row further down.
    func setBaseMapType(_ type: MapBaseType) {
        if let layerID = Self.basemapLayerID(for: type),
           requiresUnansweredLicence(layerID.rawValue) {
            licencePromptedLayerID = layerID
            return
        }

        controller.baseMapType = type
        syncNSAerialLayerVisibility(for: type)
    }

    /// The catalogued layer a base-map case draws, if it is one.
    ///
    /// Matched on the descriptor's name, which is what `MapBaseType`'s raw
    /// values are; `basemapCapableLayersHaveABaseMapCase` holds the two ends of
    /// that together, so an id declared basemap-capable with no matching case
    /// fails a test rather than silently losing its gate here.
    private static func basemapLayerID(for type: MapBaseType) -> LayerID? {
        NativeLayerTraits.basemapCapable.first {
            LayerCatalog.descriptor(for: $0)?.name == type.rawValue
        }
    }

    func offlineStatus(for layerId: String) -> String {
        guard let layerID = LayerID(rawValue: layerId),
              let descriptor = LayerCatalog.descriptor(for: layerID) else {
            return "Online"
        }

        switch NativeLayerTraits.offlinePolicy(for: descriptor) {
        case .savedAreaDownloadable:
            return "Downloadable"
        case .viewedCacheOnly:
            return "Cached when viewed"
        case .onlineOnly:
            return "Online"
        }
    }

    func updateLayerOpacity(for id: String, to value: CGFloat) {
        controller.setOpacity(for: id, to: value)
    }

    func toggleVisibility(_ id: String) {
        guard let layer = installedLayer(id) else { return }

        // Turning a restricted layer on is the moment the licence has to be
        // answered — not launch, which would put a legal dialog in front of a
        // user who may never open one of these layers, and not the first tile,
        // which lands after the switch already says "on".
        if !layer.isVisible, requiresUnansweredLicence(id) {
            licencePromptedLayerID = LayerID(rawValue: id)
            return
        }

        show(layer, visible: !layer.isVisible)
    }

    private func requiresUnansweredLicence(_ id: String) -> Bool {
        guard licenceStore.needsDecision,
              let layerID = LayerID(rawValue: id),
              let descriptor = LayerCatalog.descriptor(for: layerID) else {
            return false
        }
        return descriptor.requiresProvinceClearance
    }

    private func installedLayer(_ id: String) -> MapLayerState? {
        controller.layers.first { $0.id == id }
    }

    private func installedLayer(_ id: LayerID) -> MapLayerState? {
        installedLayer(id.rawValue)
    }

    private func show(_ layer: MapLayerState, visible: Bool) {
        // NS Aerial is a base map as well as an overlay, so its switch moves
        // the base-map picker with it.
        guard layer.id == nsAerialLayerId else {
            if visible {
                restoreVisibleOpacityIfNeeded(for: layer)
            }
            controller.setVisible(for: layer.id, to: visible)
            return
        }

        if visible {
            restoreVisibleOpacityIfNeeded(for: layer)
            controller.setVisible(for: nsAerialLayerId, to: true)
            controller.baseMapType = .nsAerial
        } else {
            controller.setVisible(for: nsAerialLayerId, to: false)
            if controller.baseMapType == .nsAerial {
                controller.baseMapType = .standard
            }
        }
    }

    private func syncNSAerialLayerVisibility(for type: MapBaseType) {
        guard let nsAerialLayer = installedLayer(nsAerialLayerId) else { return }

        if type == .nsAerial {
            if nsAerialLayer.opacity <= 0 {
                controller.setOpacity(for: nsAerialLayerId, to: nsAerialBasemapOpacity)
            }
            controller.setVisible(for: nsAerialLayerId, to: true)
        } else if nsAerialLayer.isVisible {
            controller.setVisible(for: nsAerialLayerId, to: false)
        }
    }

    private func restoreVisibleOpacityIfNeeded(for layer: MapLayerState) {
        guard layer.opacity <= 0 else { return }
        controller.setOpacity(for: layer.id, to: visibleFallbackOpacity(for: layer.id))
    }

    private func visibleFallbackOpacity(for layerId: String) -> CGFloat {
        if layerId == nsAerialLayerId {
            return nsAerialBasemapOpacity
        }

        guard let catalogID = LayerID(rawValue: layerId),
              let opacity = LayerCatalog.descriptor(for: catalogID)?.opacity,
              opacity > 0 else {
            return restoredOverlayOpacity
        }

        return CGFloat(opacity)
    }
}
