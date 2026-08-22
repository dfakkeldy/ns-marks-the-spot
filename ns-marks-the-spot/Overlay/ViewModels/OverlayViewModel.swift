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

/// What a viewport-queried vector layer's switch and slider currently say.
///
/// A separate type from `MapLayerState` because there is nothing installed
/// behind one of these rows: the layer is a query re-run on every settled
/// viewport, and its "on" is a state this app holds rather than an overlay
/// MapKit has been handed.
nonisolated struct FeatureRowState: Equatable, Sendable {
    let isVisible: Bool
    let opacity: CGFloat
}

nonisolated struct LayerRow: Identifiable, Equatable, Sendable {
    let descriptor: LayerDescriptor
    let installed: MapLayerState?
    /// Set for the vector layers, which have no `installed` state at all.
    let feature: FeatureRowState?
    /// Whether the Province licence still stands between the user and this
    /// layer's imagery.
    let needsLicence: Bool
    /// What this layer's tiles are doing, in the web panel's words — `nil` for
    /// a row with nothing installed behind it, which has no tiles to be doing
    /// anything and says why on its own line.
    let runtime: LayerRuntimeStatus?

    var id: String { descriptor.id.rawValue }
    var name: String { descriptor.name }
    var isAvailable: Bool { installed != nil || feature != nil }

    /// Whether this row's layer can be drawn at an opacity the user chooses.
    ///
    /// False for the queried vector layers: their opacity is baked into each
    /// feature's style at the value the catalog declares, which is the value
    /// the web draws them at and part of what the style says — a hollow dashed
    /// well marker is a statement about the record's accuracy, not a look.
    var hasOpacityControl: Bool { feature == nil }
    var isVisible: Bool { feature?.isVisible ?? installed?.isVisible ?? false }
    var opacity: CGFloat { feature?.opacity ?? installed?.opacity ?? 0 }

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
        return presentedDescriptors.map { descriptor in
            let needsLicence = needsDecision && descriptor.requiresProvinceClearance

            // A vector layer's row is answered entirely by the viewport view
            // model: it counts what it drew and what it could not read, which
            // is the web's `Ready · N loaded` and has no tile equivalent.
            if let features, OverlayZIndex.vectorLayers.contains(descriptor.id) {
                let status = features.status(descriptor.id)
                return LayerRow(
                    descriptor: descriptor,
                    installed: nil,
                    feature: FeatureRowState(
                        isVisible: features.isVisible(descriptor.id),
                        opacity: CGFloat(features.opacity(descriptor.id))
                    ),
                    needsLicence: needsLicence,
                    runtime: LayerRuntimeStatus(
                        label: status.label, emphasis: status.emphasis
                    )
                )
            }

            let layer = installed[descriptor.id.rawValue]
            return LayerRow(
                descriptor: descriptor,
                installed: layer,
                feature: nil,
                needsLicence: needsLicence,
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

    /// Which well records the layer is asking for, and the switch for it.
    ///
    /// Proxied through here because the panel talks to this view model, and the
    /// well layer's own state lives with the layers that are queries rather
    /// than tiles.
    var wellAccuracyFilter: WellLogOverlay.AccuracyFilter {
        features?.wellAccuracyFilter ?? .surveyed
    }

    func setWellAccuracyFilter(_ filter: WellLogOverlay.AccuracyFilter) {
        features?.setWellAccuracyFilter(filter)
    }

    /// The panel's sections, in catalog order, carrying only the groups that
    /// have a row to show.
    ///
    /// Groups rather than one flat list because the catalog went from ten
    /// layers to twenty-five: a single scroll of switches is where a user stops
    /// being able to find the one they came for. Empty groups are dropped
    /// instead of rendered empty — a section that opens onto nothing reads as a
    /// bug rather than as a phase that has not shipped.
    var sections: [LayerSection] {
        let grouped = Dictionary(grouping: rows) { $0.descriptor.group }
        return LayerGroupID.allCases.compactMap { group in
            guard let rows = grouped[group], !rows.isEmpty else { return nil }
            return LayerSection(group: group, rows: rows)
        }
    }

    /// The catalog entries that get a row: everything the app installs as a
    /// tile overlay, the viewport-queried vector layers when this app has a
    /// view model to answer for them, plus the Church sheets, which are
    /// catalogued with no tiles and appear so the user can see what is coming
    /// and where the scan lives.
    private var presentedDescriptors: [LayerDescriptor] {
        features == nil ? Self.tileDescriptors : Self.allDescriptors
    }

    private static let tileDescriptors: [LayerDescriptor] = descriptors(includingVectors: false)
    private static let allDescriptors: [LayerDescriptor] = descriptors(includingVectors: true)

    private static func descriptors(includingVectors: Bool) -> [LayerDescriptor] {
        let installable = Set(NativeLayerTraits.installOrder)
        return LayerCatalog.all
            .filter { descriptor in
                installable.contains(descriptor.id)
                    || descriptor.group == .church
                    || (includingVectors && OverlayZIndex.vectorLayers.contains(descriptor.id))
            }
            .sorted { $0.uiOrder < $1.uiOrder }
    }

    private let controller: MapController
    /// The viewport-queried layers, when this build has them. `nil` in the
    /// tests that only exercise the tile panel, which is why the vector rows
    /// are dropped rather than shown disabled: a row whose switch cannot be
    /// wired to anything is worse than no row.
    private let features: ViewportFeatureViewModel?
    /// The bundled tax-sale notices, when this build has them. `nil` in the
    /// tests that exercise the parcel path on its own, where no parcel is
    /// listed and nothing would be highlighted.
    private let taxSale: TaxSaleViewModel?
    private let historical: HistoricalTaxSaleViewModel?
    private let licenceStore: ProvinceLicenceStore
    private let clearanceBox: LicenceClearanceBox
    /// The cache a revocation has to empty. Optional because most tests drive
    /// this model with no cache at all; a revocation without one still stops
    /// every request, and says in the sheet that it swept nothing.
    private let tileCache: TileCache?
    private let parcelFetcher: ParcelFetcher
    private let civicFetcher: CivicAddressFetcher
    private let contextFetcher: ParcelContextFetcher
    private let assessmentFetcher: PVSCAssessmentFetcher
    private let dwellingFetcher: PVSCDwellingFetcher
    private let buildingFetcher: BuildingCountFetcher
    private let resourceFetcher: ResourceIntersectionFetcher
    private let floodFetcher: FloodHazardFetcher

    /// `licenceStore` has no default on purpose. A default would have to pick a
    /// state, and both choices are wrong: an accepting default is a way to get
    /// permission without a user, and a refusing one silently disables the map
    /// for any caller that forgot the argument.
    init(
        controller: MapController,
        licenceStore: ProvinceLicenceStore,
        features: ViewportFeatureViewModel? = nil,
        taxSale: TaxSaleViewModel? = nil,
        historical: HistoricalTaxSaleViewModel? = nil,
        clearanceBox: LicenceClearanceBox = LicenceClearanceBox(),
        tileCache: TileCache? = nil,
        parcelFetcher: ParcelFetcher = ParcelFetcher(),
        civicFetcher: CivicAddressFetcher = CivicAddressFetcher(),
        contextFetcher: ParcelContextFetcher = ParcelContextFetcher(),
        assessmentFetcher: PVSCAssessmentFetcher = PVSCAssessmentFetcher(),
        dwellingFetcher: PVSCDwellingFetcher = PVSCDwellingFetcher(),
        buildingFetcher: BuildingCountFetcher = BuildingCountFetcher(),
        resourceFetcher: ResourceIntersectionFetcher = ResourceIntersectionFetcher(),
        floodFetcher: FloodHazardFetcher = FloodHazardFetcher()
    ) {
        self.controller = controller
        self.features = features
        self.taxSale = taxSale
        self.historical = historical
        self.licenceStore = licenceStore
        self.clearanceBox = clearanceBox
        self.tileCache = tileCache
        self.parcelFetcher = parcelFetcher
        self.civicFetcher = civicFetcher
        self.contextFetcher = contextFetcher
        self.assessmentFetcher = assessmentFetcher
        self.dwellingFetcher = dwellingFetcher
        self.buildingFetcher = buildingFetcher
        self.resourceFetcher = resourceFetcher
        self.floodFetcher = floodFetcher
        mirrorClearanceIntoBox()
    }

    convenience init(
        container: AppContainer,
        features: ViewportFeatureViewModel? = nil,
        taxSale: TaxSaleViewModel? = nil,
        historical: HistoricalTaxSaleViewModel? = nil
    ) {
        self.init(
            controller: container.mapController,
            licenceStore: container.licenceStore,
            features: features,
            taxSale: taxSale,
            historical: historical,
            clearanceBox: container.clearanceBox,
            tileCache: container.tileCache
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
        let input = ParcelSearchInput.classify(query)
        // Only a PID lookup can be the one a link started, so anything else
        // means the reader is searching and the link's hold on the extent is
        // over.
        if case .pid = input {} else { isHoldingLinkPosition = false }

        switch input {
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
                // A listed PID with no parcel behind it still has a notice to
                // show, and the notice is what the user came for. Selecting it
                // opens that card; the message says the geometry, not the
                // listing, is what is missing.
                if taxSale?.listingContext(forPID: pid) != nil {
                    parcels.select(pid)
                    publishParcels(focus: false)
                    setSearchText(pid)
                    parcelMessage = ParcelLookupMessage.listedParcelWithoutGeometry(pid: pid)
                    return
                }
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

    // MARK: - The parcels a notice advertises

    /// What the one bulk request for listed parcels is doing or found.
    ///
    /// Separate from `parcelMessage`, which belongs to the lookup the user is
    /// waiting on. This one answers a different question — whether the map is
    /// showing every advertised property — and it must not be overwritten by a
    /// search, or a user who ran one would be told the notices loaded when they
    /// did not.
    private(set) var listedParcelMessage: String?

    @ObservationIgnored private var listedParcelLoad: Task<Void, Never>?

    @ObservationIgnored private var hasLoadedListedParcels = false

    /// Asks NSPRD for every parcel the current notices advertise.
    ///
    /// One request set for all of them, once: this is the map opening, not a
    /// lookup, and re-asking as switches and filters move would spend the
    /// Province's service on geometry already in hand. What the switches move
    /// is which of these parcels is drawn as listed.
    func loadListedParcels() {
        guard let taxSale, clearanceBox.clearance.allows(.nsprd) else { return }
        let pids = taxSale.advertisedPIDs
        // Retried after a failure, and only then: the boundaries do not change
        // while the app is open, so a second success would redraw what is
        // already on screen at the cost of another round of requests.
        guard !pids.isEmpty, !hasLoadedListedParcels else { return }

        listedParcelLoad?.cancel()
        listedParcelLoad = Task { [weak self, parcelFetcher, clearance = clearanceBox.clearance] in
            let outcome: Result<ParcelFeatureCollection, ParcelLookupFailure>
            do throws(ParcelLookupFailure) {
                outcome = .success(try await parcelFetcher.parcels(pids: pids, clearance: clearance))
            } catch {
                outcome = .failure(error)
            }
            guard !Task.isCancelled, let self else { return }
            switch outcome {
            case .success(let collection):
                hasLoadedListedParcels = true
                parcels.merge(collection)
                publishParcels(focus: false)
                frameListedParcelsOnce()
                // Counted from what came back rather than from what was asked
                // for: a PID NSPRD has no record of is absent from the reply,
                // and reporting the request's size would hide that.
                let matched = Set(collection.identifiedFeatures.map(\.pid)).count
                listedParcelMessage = ParcelLookupMessage.listedPIDsMatched(matched)
            case .failure(let failure):
                guard failure != .cancelled else { return }
                listedParcelMessage = ParcelLookupMessage.listedParcelsUnavailable
            }
        }
    }

    /// The seam `awaitParcelLookup` is, for the bulk load.
    func awaitListedParcels() async {
        await listedParcelLoad?.value
    }

    // MARK: - Historical records

    /// What the historical bulk request is doing or found.
    ///
    /// Its own message for the same reason the current one has its own: it
    /// answers whether the map is showing every matched historical parcel, and
    /// a search must not overwrite that with an answer to a different question.
    private(set) var historicalParcelMessage: String?

    @ObservationIgnored private var historicalParcelLoad: Task<Void, Never>?

    @ObservationIgnored private var hasLoadedHistoricalParcels = false

    /// Asks NSPRD for the matched historical parcels the map does not hold.
    ///
    /// Only what is missing: the current notices have already brought back
    /// their parcels, and CBRM's sale is in both sets. Asking again for a
    /// parcel already in hand would spend the Province's service to redraw what
    /// is on screen.
    func loadHistoricalParcels() {
        guard let historical, historical.isShowingHistorical,
              clearanceBox.clearance.allows(.nsprd) else { return }
        let wanted = historical.matchedPIDs
        guard !wanted.isEmpty, !hasLoadedHistoricalParcels else { return }
        hasLoadedHistoricalParcels = true

        let held = Set(parcels.features.map(\.pid))
        let missing = wanted.filter { !held.contains($0) }
        guard !missing.isEmpty else {
            historicalParcelMessage = ParcelLookupMessage.historicalPIDsMatched(wanted.count)
            return
        }

        historicalParcelMessage = ParcelLookupMessage.historicalRecordsLoadedParcelsComing
        historicalParcelLoad = Task {
            [weak self, parcelFetcher, clearance = clearanceBox.clearance] in
            let outcome: Result<ParcelFeatureCollection, ParcelLookupFailure>
            do throws(ParcelLookupFailure) {
                outcome = .success(
                    try await parcelFetcher.parcels(pids: missing, clearance: clearance)
                )
            } catch {
                outcome = .failure(error)
            }
            guard !Task.isCancelled, let self else { return }
            switch outcome {
            case .success(let collection):
                parcels.merge(collection)
                publishParcels(focus: false)
                // Counted over what the map now holds, so a PID NSPRD has no
                // record of is visible as a shortfall instead of being folded
                // into the number asked for.
                let now = Set(parcels.features.map(\.pid))
                let matched = wanted.count { now.contains($0) }
                historicalParcelMessage = matched == wanted.count
                    ? ParcelLookupMessage.historicalPIDsMatched(matched)
                    : ParcelLookupMessage.historicalPIDsReturned(matched, of: wanted.count)
            case .failure(let failure):
                guard failure != .cancelled else { return }
                // Reopened, because "unavailable right now" is a statement
                // about this attempt. Leaving the latch closed would make one
                // transient failure the map's answer for the rest of the
                // session, with no way to ask again but to leave the mode.
                hasLoadedHistoricalParcels = false
                let now = Set(parcels.features.map(\.pid))
                let matched = wanted.count { now.contains($0) }
                historicalParcelMessage = matched > 0
                    ? ParcelLookupMessage.someHistoricalParcelsUnavailable(
                        matched, of: wanted.count
                    )
                    : ParcelLookupMessage.historicalParcelsUnavailable
            }
        }
    }

    func awaitHistoricalParcels() async {
        await historicalParcelLoad?.value
    }

    /// Switches the map between the current notices and the published records.
    ///
    /// The two are never drawn together. Leaving the historical mode drops its
    /// message as well as its styling: a count of matched historical parcels
    /// standing over a map showing current notices is a sentence about a set
    /// nobody is looking at.
    /// Which record set the map is reading. `current` where this build was
    /// assembled without the historical catalog, which is the honest answer:
    /// there is no other set to be in.
    var mapRecordMode: HistoricalTaxSaleViewModel.Mode { historical?.mode ?? .current }

    /// Whether there is a second record set to offer at all.
    var offersRecordModes: Bool { historical != nil }

    /// The line under the switch, saying what the mode the map is in is worth.
    var recordModeCaption: String {
        switch mapRecordMode {
        case .current:
            "CURRENT · advertised notices that still require municipal verification"
        case .historical:
            "HISTORICAL · dated notices and verified outcomes, never current offerings"
        }
    }

    func setMapRecordMode(_ mode: HistoricalTaxSaleViewModel.Mode) {
        guard let historical, historical.mode != mode else { return }
        // The open card is dropped, as the web drops it. A parcel card carries
        // the notice or the records of the mode it was opened in, and leaving it
        // up across a switch would leave a dated outcome on screen under a map
        // that has started answering the other question.
        clearParcelSelection()
        historical.mode = mode
        if mode == .historical {
            loadHistoricalParcels()
        } else {
            historicalParcelLoad?.cancel()
            historicalParcelLoad = nil
            hasLoadedHistoricalParcels = false
            historicalParcelMessage = nil
        }
        publishParcels(focus: false)
    }

    /// Redraws with whatever the historical filters now say, without asking the
    /// service anything.
    func refreshHistoricalStyling() {
        publishParcels(focus: false)
    }

    /// Opens a property picked out of the historical panel.
    func selectHistoricalParcel(pid: String) {
        // Switched first, and only when it is not already on: the mode change
        // drops the open card, so doing it after the selection would throw away
        // the card the user just asked for.
        setMapRecordMode(.historical)
        if !parcels.holds(pid: pid) {
            // Selected up front for the same reason a notice row is: the record
            // is already in hand, and a parcel service that does not answer
            // must not decide whether the user sees what they tapped.
            parcels.select(pid)
            publishParcels(focus: false)
        }
        searchPID(pid)
    }

    /// Opens the property a user picked out of a notice.
    ///
    /// The event is switched on first, as the web switches it on: picking a
    /// property out of a notice whose parcels are hidden would zoom the map to
    /// a parcel that is not drawn.
    func selectListedParcel(eventID: String, pid: String) {
        setMapRecordMode(.current)
        taxSale?.setEventVisibility(eventID, to: true)
        // Selected before the parcel is asked for, as the web selects it. The
        // notice is what the user tapped and it is already in hand; hanging its
        // card on a successful NSPRD reply would mean a service outage answers
        // the tap by leaving the previous parcel on screen and opening nothing.
        if taxSale?.listingContext(forPID: pid) != nil, !parcels.holds(pid: pid) {
            parcels.select(pid)
            publishParcels(focus: false)
        }
        searchPID(pid)
    }

    /// Opens the map on the parcels a current tax sale names, once.
    ///
    /// As the web does on first load. A user who launched the app to look at a
    /// sale should not have to find it first, and the province-wide opening
    /// view shows a sale as nothing at all.
    ///
    /// Not when a shared link is holding the position: that link named a place,
    /// and moving off it would answer a question the sender did not ask. Not in
    /// historical mode either — the fit is to what is advertised now.
    private func frameListedParcelsOnce() {
        guard !hasFramedListedParcels, !isHoldingLinkPosition, mapRecordMode == .current,
              let listed = taxSale?.highlightedPIDs, !listed.isEmpty,
              let bounds = parcels.bounds(forPIDs: listed)
        else { return }
        hasFramedListedParcels = true
        // The web's own cap on this fit.
        controller.focus(on: bounds, maxZoom: 13)
    }

    /// A tap on the dot standing in for a parcel too small to see.
    ///
    /// The same thing as tapping the parcel itself: the marker is where the
    /// parcel is, and what the user wants is the panel about it.
    func selectOverviewMarker(pid: String) {
        searchPID(pid)
    }

    /// Redraws with whatever the tax-sale switches now say, without asking the
    /// service anything.
    func refreshListedParcelStyling() {
        publishParcels(focus: false)
    }

    private func publishParcels(focus: Bool) {
        // One record set at a time. An advertised parcel left orange under the
        // historical caption would put a live offering on a map whose whole
        // claim is that everything on it is dated.
        let listed = mapRecordMode == .current ? (taxSale?.highlightedPIDs ?? []) : []
        let shapes = parcels.shapes(
            taxSalePIDs: listed,
            historicalPIDs: historical?.highlightedPIDs ?? []
        )
        controller.setParcelShapes(shapes)
        // A listed parcel is a sub-pixel polygon at an overview zoom: a user
        // looking at the province would see nothing at all where a tax sale is,
        // which is the one thing that view is for. The controller decides which
        // zooms these are drawn at.
        controller.setParcelOverviewMarkers(shapes.compactMap(ParcelOverviewMarker.init(shape:)))
        if isHoldingLinkPosition, focus {
            // Consumed once. The link's extent wins over the parcel it names,
            // but only for the lookup that link started.
            isHoldingLinkPosition = false
        } else if focus, let bounds = parcels.selectedBounds {
            controller.focus(on: bounds)
        }
        refreshInspection()
    }

    // MARK: - Carrying the map out of the app

    /// Where the browser map lives. A shared link is a link into that map:
    /// somebody who does not have this app installed still gets the parcel.
    static let webMapURL = URL(string: "https://kinnokilabs.com/apps/nsmarksthespot/map/")!

    /// What the map is currently looking at, in the form the two surfaces share.
    ///
    /// `MapShareState.modernBaseLayerID` stands in for the standard base map,
    /// which the web models as a layer and this app models as a map type. The
    /// satellite base has no web equivalent and is simply not carried — a link
    /// naming a layer that does not exist there would be dropped on arrival
    /// anyway.
    var shareState: MapShareState {
        let eventIDs: [String]
        switch mapRecordMode {
        case .current:
            eventIDs = (taxSale?.selectedEventIDs).map { Array($0).sorted() } ?? []
        case .historical:
            // Only the events the open parcel actually appears in. The
            // historical panel filters records rather than selecting events, so
            // there is no selected set to carry.
            eventIDs = parcels.selectedPID
                .map { pid in historical?.contexts(forPID: pid).map(\.event.id) ?? [] }
                .map { Array(Set($0)).sorted() } ?? []
        }

        return MapShareState(
            mode: mapRecordMode == .historical ? .historical : .current,
            pid: parcels.selectedPID,
            eventIDs: eventIDs,
            layerIDs: (baseMapType == .standard ? [MapShareState.modernBaseLayerID] : [])
                + rows.filter(\.isVisible).map(\.id),
            position: mapPosition
        )
    }

    var shareURL: URL? { shareState.url(base: Self.webMapURL) }

    /// Set while a link's own parcel lookup is in flight, so the parcel does not
    /// reframe a map the link already positioned.
    private var isHoldingLinkPosition = false
    /// Whether the opening fit to the advertised parcels has already happened.
    /// Once only: refitting after the user has moved would take the map away
    /// from wherever they went.
    private var hasFramedListedParcels = false

    /// Where the map is, as a latitude, a longitude, and a tile zoom.
    ///
    /// Falls back to the opening view before the map has been laid out, which
    /// is the only honest answer available: nothing has been looked at yet.
    /// Read by the share link, the evidence note, and the readout on the map.
    var mapPosition: MapPosition {
        guard let bounds = controller.currentVisibleBounds() else { return .default }
        return MapPosition(
            latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
            longitude: (bounds.minLongitude + bounds.maxLongitude) / 2,
            zoom: controller.zoomLevel
        )
    }

    /// Whether the open parcel has heard back from every source the note
    /// reports on.
    var canExportEvidenceNote: Bool {
        inspection.map(ParcelEvidenceExport.isReady) ?? false
    }

    /// The note for the open parcel, or `nil` when no parcel is open or a
    /// source has not answered yet.
    ///
    /// `generatedAt` is a parameter rather than `Date()` read in here: the note
    /// is stamped with it, and a stamp the caller cannot control is a stamp
    /// nothing can check.
    func evidenceNote(generatedAt: Date = Date()) -> EvidenceNote? {
        guard let inspection, ParcelEvidenceExport.isReady(inspection),
              let shareURL else { return nil }
        return EvidenceNote.build(
            ParcelEvidenceExport.input(
                generatedAt: generatedAt,
                inspection: inspection,
                mode: mapRecordMode == .historical ? .historical : .current,
                shareURL: shareURL,
                position: mapPosition,
                activeLayers: rows.filter(\.isVisible).map(\.descriptor),
                baseMap: baseMapType,
                fletcherBaseURL: FletcherHost.configuredBaseURL
            )
        )
    }

    /// Everything the printed page needs about the map, read at the tap.
    ///
    /// A snapshot rather than a live reference: compositing takes seconds, and
    /// a page assembled from a map that moved underneath it would carry a
    /// registration for ground it does not show.
    func printExportRequest(
        template: PdfTemplate,
        fields: PdfComposer.Fields,
        includesLegend: Bool = true,
        includesAppendix: Bool = false,
        /// Whether the aerial photography is drawn onto the page.
        ///
        /// Separate from whether it is on the screen. At 300 dpi the imagery is
        /// the heaviest thing on the sheet and, on paper, a dark wash that
        /// buries the parcel lines and labels the page exists to show — which
        /// is why the browser leaves it off until it is asked for.
        includesAerial: Bool = true,
        /// What the document being made says it must not be read as.
        caveat: String = PrintExport.screeningCaveat,
        /// The ground the user framed. Nil falls back to the whole visible map,
        /// which the export then grows to the paper's proportions — the older
        /// behaviour, kept for callers that never showed a frame.
        frame: GeoBoundingBox? = nil,
        generatedAt: Date = Date()
    ) -> PrintExportRequest? {
        var framed = frame
        if framed == nil, let bounds = controller.currentVisibleBounds() {
            framed = GeoBoundingBox(
                south: bounds.minLatitude,
                west: bounds.minLongitude,
                north: bounds.maxLatitude,
                east: bounds.maxLongitude
            )
        }
        guard let box = framed else { return nil }
        var disclosures = [caveat] + printCaptureContext
        // The appendix is about a parcel and the map is about ground, and the
        // two can be in different places. Said on the page rather than left for
        // a reader to notice, because the pages are stapled together and read
        // as one document.
        if includesAppendix, let pid = inspection?.pid,
           inspectedPID(shownWithin: box) == nil {
            disclosures.append(
                "The evidence appendix is for PID \(pid), whose boundary is not on "
                    + "this map. The map shows other ground."
            )
        }
        return PrintExportRequest(
            visibleBounds: box,
            baseMap: controller.baseMapType,
            // Dropped from the list rather than drawn transparent: the legend
            // and the credits are built from these, and a page that names a
            // source it carries no ink from tells the reader the imagery was
            // consulted for what they are looking at.
            layers: includesAerial
                ? controller.layers
                : controller.layers.filter { $0.id != LayerID.nsAerial.rawValue },
            parcels: controller.state.parcelShapes,
            // The client-side layers as the screen has them, so a page shows
            // the zones and reaches the reader was looking at rather than blank
            // ground where they were.
            features: printedFeatures(within: box),
            markers: printedMarkers(within: box),
            template: template,
            fields: fields,
            includesLegend: includesLegend,
            // The link this page came from, so paper leads back to the map. Read
            // here with the rest of the snapshot: the share link encodes the
            // view, and one read a moment later would point somewhere else.
            shareURL: shareURL,
            // The appendix is the evidence note, laid out as pages rather than
            // written as a file. Built from the note itself so the document the
            // user prints and the one they email cannot come to say different
            // things about the same parcel. Stamped with the page's own time,
            // for the same reason the page is.
            appendix: includesAppendix
                ? PdfAppendix.blocks(
                    fromMarkdown: evidenceNote(generatedAt: generatedAt)?.markdown ?? ""
                )
                : [],
            disclosures: disclosures,
            generatedAt: generatedAt
        )
    }

    /// The open parcel's PID, when its boundary is inside the ground about to
    /// be printed.
    ///
    /// The frame is drawn by hand and the selection is not cleared by panning,
    /// so a user can select a parcel, travel kilometres, and frame somewhere
    /// else entirely. A page named after a PID whose parcel is nowhere on it
    /// tells the reader they are looking at that parcel — the single wrong
    /// conclusion this export could hand somebody. Nil in that case, and the
    /// page carries the generic name instead.
    func inspectedPID(shownWithin bounds: GeoBoundingBox) -> String? {
        guard let pid = inspection?.pid,
              let shape = controller.state.parcelShapes.first(where: { $0.pid == pid }),
              let box = Self.boundingBox(of: shape)
        else { return nil }
        // Boxes rather than rings: the frame grows to the paper's proportions
        // after this, so an outline that only overlaps the corner still prints.
        guard box.south <= bounds.north, box.north >= bounds.south,
              box.west <= bounds.east, box.east >= bounds.west
        else { return nil }
        return pid
    }

    private static func boundingBox(of shape: ParcelShape) -> GeoBoundingBox? {
        var box: GeoBoundingBox?
        for ring in shape.parts.joined() {
            for point in ring {
                guard var current = box else {
                    box = GeoBoundingBox(
                        south: point.lat, west: point.lng,
                        north: point.lat, east: point.lng
                    )
                    continue
                }
                current.south = min(current.south, point.lat)
                current.west = min(current.west, point.lng)
                current.north = max(current.north, point.lat)
                current.east = max(current.east, point.lng)
                box = current
            }
        }
        return box
    }

    /// What state the map was in when the page was captured, in the words the
    /// map itself uses under its record switch.
    ///
    /// Printed on every page that has two record sets to choose between, as the
    /// web prints it. A dated outcome on paper with nothing saying it is
    /// historical is a dated outcome that reads as a current offering.
    var printCaptureContext: [String] {
        guard offersRecordModes else { return [] }
        return [recordModeCaption]
    }

    /// The map's own tile path, so the export honours the cache and the licence
    /// clearance the screen is already holding rather than asking again.
    /// The features the page carries, in the order the map draws them.
    ///
    /// Read from what is on the map rather than from which rows are switched
    /// on: a layer that is on but has nothing in this viewport contributes
    /// nothing to the page, and listing it would claim ink that was never laid.
    private func printedFeatures(within bounds: GeoBoundingBox) -> [FeatureShape] {
        // Restricted to the frame being printed, not merely to what the view
        // model is holding. The viewport layers keep the previous view's
        // features while their replacement loads, and keep them indefinitely
        // when the reload fails — so a page made after a long pan would
        // otherwise be composited from wells a hundred kilometres away.
        //
        // Bounding boxes rather than exact geometry: a shape that overlaps the
        // frame at all has ink on this page, and a box is never smaller than
        // its shape, so this errs towards including.
        controller.state.featureShapes.filter {
            $0.geometry.boundingBox?.intersects(bounds) == true
        }
    }

    private func printedMarkers(within bounds: GeoBoundingBox) -> [FeatureMarker] {
        controller.state.featureMarkers.filter {
            bounds.south <= $0.latitude && $0.latitude <= bounds.north
                && bounds.west <= $0.longitude && $0.longitude <= bounds.east
        }
    }

    var printTileProvider: PrintMapCompositor.TileProvider {
        PrintMapCompositor.provider(overlays: controller.installedTileOverlays())
    }

    var printRenderProvider: PrintMapCompositor.RenderProvider {
        PrintMapCompositor.renderer(clearance: clearanceBox)
    }

    /// Opens a shared link.
    ///
    /// Restores what this build can vouch for and nothing else: the record set,
    /// the layers it carries, and the parcel. Unknown IDs were already dropped
    /// in parsing, and a layer the Province licence still stands in front of
    /// stays off — a link cannot accept a licence on the reader's behalf.
    func restore(from url: URL) {
        let state = MapShareState.parse(
            url.absoluteString,
            validEventIDs: Set(
                (taxSale?.upcomingEvents.map(\.id) ?? [])
                    + (historical?.catalogEventIDs ?? [])
            ),
            validLayerIDs: Set(rows.map(\.id)).union([MapShareState.modernBaseLayerID])
        )

        setMapRecordMode(state.mode == .historical ? .historical : .current)
        setBaseMapType(
            state.layerIDs.contains(MapShareState.modernBaseLayerID) ? .standard : baseMapType
        )
        if let taxSale, state.mode == .current, !state.eventIDs.isEmpty {
            for event in taxSale.upcomingEvents {
                taxSale.setEventVisibility(event.id, to: state.eventIDs.contains(event.id))
            }
            refreshListedParcelStyling()
        }
        for row in rows where row.isAvailable {
            let wanted = state.layerIDs.contains(row.id)
            // Only switched when it differs, and never switched *on* through a
            // licence the reader has not accepted: `toggleVisibility` raises
            // the sheet, which is the right outcome for a tap and the wrong one
            // for a link that opened by itself.
            if wanted != row.isVisible, !(wanted && row.needsLicence) {
                toggleVisibility(row.id)
            }
        }
        controller.center(
            on: GeoPoint(lat: state.position.latitude, lng: state.position.longitude),
            zoom: state.position.zoom
        )
        guard let pid = state.pid else {
            // A link that names no parcel is a link to a view, and leaving a
            // previously open parcel selected would attach this reader's card to
            // a map the sender never sent.
            clearParcelSelection()
            return
        }
        // The link said where it was looking. Opening the parcel would otherwise
        // frame the parcel instead, throwing away the extent the sender chose.
        isHoldingLinkPosition = true
        searchParcel(pid)
    }

    // MARK: - The parcel panel

    /// What the panel shows about the selected parcel, `nil` when none is
    /// selected.
    private(set) var inspection: ParcelInspection?

    @ObservationIgnored private var inspectionLookup: Task<Void, Never>?

    /// The same seam as `awaitParcelLookup`, for the panel's two lookups.
    func awaitInspection() async {
        await inspectionLookup?.value
    }

    /// One answer from one source, on its way back to the panel.
    private enum Evidence: Sendable {
        case addresses(Result<CivicAddressResponse.Reading, CivicAddressFailure>)
        case context(Result<ParcelContext, ParcelContextFailure>)
        case assessments(Result<PVSCAssessmentResponse.Result, PVSCAssessmentFailure>)
        case dwellings(Result<PVSCDwellingResponse.Result, PVSCDwellingFailure>)
        case buildings(Result<ParcelBuildingCount, BuildingCountFailure>)
        /// One value carrying three sources, because they are refused together
        /// — a parcel with no rings — and answer separately.
        case resources(Result<ParcelResourceIntersections, ResourceIntersectionQuery.Refusal>)
        /// Likewise: the river study areas and the three coastal scenarios are
        /// refused together and answer separately.
        case flood(Result<ParcelFloodHazard, FloodHazardQuery.Refusal>)
    }

    /// Rebuilds the panel for whatever is selected now.
    ///
    /// Everything the parcel record itself carries is filled in at once; the
    /// two lookups that go out to services start `looking` and land separately,
    /// so a slow one does not hold up a fast one.
    private func refreshInspection() {
        inspectionLookup?.cancel()
        inspectionLookup = nil

        guard let pid = parcels.selectedPID else {
            inspection = nil
            return
        }
        // Gated on the mode for the same reason the styling is: a PID in both
        // sets would otherwise open a card headed "Listed in official notice"
        // in the mode that promises everything on it is a dated outcome.
        let notice = mapRecordMode == .current ? taxSale?.listingContext(forPID: pid) : nil
        let records = historical?.contexts(forPID: pid) ?? []
        // Only printed in the historical mode. The current notices are the
        // map's ordinary state, and a marker on every card would stop being
        // read long before the one card that needs it.
        let modeMarker = historical?.isShowingHistorical == true
            ? historical?.mode.markerLabel
            : nil

        guard !parcels.selectedFeatures.isEmpty else {
            // No parcel record, so every source that takes the parcel's rings
            // is unaskable. A notice is still worth showing on its own: the
            // municipality named this PID, and that fact does not depend on
            // NSPRD holding geometry for it.
            guard notice != nil || !records.isEmpty else {
                inspection = nil
                return
            }
            var state = ParcelInspection(pid: pid, mappedArea: nil, boundaryNotice: nil)
            state.taxSaleNotice = notice
            state.historicalRecords = records
            state.recordModeMarker = modeMarker
            let reason = ParcelLookupMessage.noParcelRecordToAskWith
            state.civicAddresses = .unavailable(reason)
            state.mappedContext = .unavailable(reason)
            state.assessments = .unavailable(reason)
            state.dwellings = .unavailable(reason)
            state.buildings = .unavailable(reason)
            state.resources = .unavailable(reason)
            state.floodHazard = .unavailable(reason)
            inspection = state
            return
        }

        let features = parcels.selectedFeatures
        var state = ParcelInspection(
            pid: pid,
            mappedArea: ParcelResponse.mappedArea(
                forPID: pid,
                in: ParcelFeatureCollection(identifiedFeatures: features)
            ),
            boundaryNotice: parcels.boundaryNotice
        )
        state.taxSaleNotice = notice
        state.historicalRecords = records
        state.recordModeMarker = modeMarker

        let parts = features.flatMap(\.boundary.parts)
        guard !parts.isEmpty else {
            // The record came back without a shape, so neither lookup can be
            // made: both take the parcel's rings. Saying so is the point —
            // "no civic address on this parcel" would be a finding, and nothing
            // was asked.
            state.civicAddresses = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.mappedContext = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.assessments = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.dwellings = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.buildings = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.resources = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.floodHazard = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            inspection = state
            return
        }
        inspection = state

        inspectionLookup = Task {
            [
                weak self, civicFetcher, contextFetcher, assessmentFetcher, dwellingFetcher,
                buildingFetcher, resourceFetcher, floodFetcher,
                clearance = clearanceBox.clearance,
                mappedAreaSquareMetres = state.mappedArea?.squareMetres
            ] in
            await withTaskGroup(of: Evidence.self) { group in
                group.addTask {
                    do throws(CivicAddressFailure) {
                        return .addresses(.success(try await civicFetcher.addresses(inside: parts)))
                    } catch {
                        return .addresses(.failure(error))
                    }
                }
                group.addTask {
                    do throws(ParcelContextFailure) {
                        return .context(
                            .success(try await contextFetcher.context(for: parts, clearance: clearance))
                        )
                    } catch {
                        return .context(.failure(error))
                    }
                }
                group.addTask {
                    do throws(PVSCAssessmentFailure) {
                        return .assessments(.success(try await assessmentFetcher.assessments(for: parts)))
                    } catch {
                        return .assessments(.failure(error))
                    }
                }
                group.addTask {
                    do throws(BuildingCountFailure) {
                        return .buildings(
                            .success(try await buildingFetcher.count(for: parts, clearance: clearance))
                        )
                    } catch {
                        return .buildings(.failure(error))
                    }
                }
                group.addTask {
                    do throws(ResourceIntersectionQuery.Refusal) {
                        return .resources(
                            .success(
                                try await resourceFetcher.intersections(
                                    for: parts, clearance: clearance
                                )
                            )
                        )
                    } catch {
                        return .resources(.failure(error))
                    }
                }
                group.addTask {
                    do throws(FloodHazardQuery.Refusal) {
                        return .flood(
                            .success(
                                try await floodFetcher.hazard(
                                    for: parts,
                                    mappedAreaSquareMetres: mappedAreaSquareMetres,
                                    clearance: clearance
                                )
                            )
                        )
                    } catch {
                        return .flood(.failure(error))
                    }
                }
                for await evidence in group {
                    guard !Task.isCancelled, let self else { return }
                    self.apply(evidence, to: pid)
                    // The dwelling dataset is keyed by account number, so it
                    // joins the group only once the assessment lookup has named
                    // some — and it joins this group rather than a task of its
                    // own so that abandoning the parcel cancels it too.
                    if case .assessments(.success(let result)) = evidence, !result.accounts.isEmpty,
                        self.inspection?.pid == pid {
                        let aans = result.accounts.map(\.aan)
                        group.addTask {
                            do throws(PVSCDwellingFailure) {
                                return .dwellings(
                                    .success(try await dwellingFetcher.dwellings(forAANs: aans))
                                )
                            } catch {
                                return .dwellings(.failure(error))
                            }
                        }
                    }
                }
            }
        }
    }

    /// Writes one source's answer into the panel, if the panel is still showing
    /// the parcel it was asked about.
    private func apply(_ evidence: Evidence, to pid: String) {
        guard inspection?.pid == pid else { return }
        switch evidence {
        case .addresses(.success(let reading)):
            inspection?.civicAddresses = .ready(reading)
        case .addresses(.failure(.cancelled)), .context(.failure(.cancelled)),
            .assessments(.failure(.cancelled)), .dwellings(.failure(.cancelled)),
            .buildings(.failure(.cancelled)):
            // Superseded, not failed. Leaving it `looking` is honest: this
            // parcel's panel is about to be replaced.
            break
        case .addresses(.failure(let failure)):
            inspection?.civicAddresses = .unavailable(
                ParcelLookupMessage.addressEvidenceFailure(failure)
            )
        case .context(.success(let context)):
            inspection?.mappedContext = .ready(context)
        case .context(.failure(let failure)):
            inspection?.mappedContext = .unavailable(
                ParcelLookupMessage.contextEvidenceFailure(failure)
            )
        case .assessments(.success(let result)):
            inspection?.assessments = .ready(result)
            if result.accounts.isEmpty {
                // No account to ask about, so the dwelling dataset is never
                // consulted. "No dwelling record" would be a finding drawn from
                // a question nobody asked.
                inspection?.dwellings = .unavailable(ParcelLookupMessage.noAccountToAskDwellingsWith)
            }
        case .assessments(.failure(let failure)):
            inspection?.assessments = .unavailable(
                ParcelLookupMessage.assessmentEvidenceFailure(failure)
            )
            inspection?.dwellings = .unavailable(ParcelLookupMessage.dwellingsNotLookedUp)
        case .dwellings(.success(let result)):
            inspection?.dwellings = .ready(result)
        case .dwellings(.failure(let failure)):
            inspection?.dwellings = .unavailable(
                ParcelLookupMessage.dwellingEvidenceFailure(failure)
            )
        case .buildings(.success(let count)):
            inspection?.buildings = .ready(count)
        case .buildings(.failure(let failure)):
            inspection?.buildings = .unavailable(
                ParcelLookupMessage.buildingEvidenceFailure(failure)
            )
        case .resources(.success(let intersections)):
            inspection?.resources = .ready(intersections)
        case .resources(.failure(.noBoundary)):
            inspection?.resources = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
        case .flood(.success(let hazard)):
            inspection?.floodHazard = .ready(hazard)
        case .flood(.failure(.noBoundary)):
            inspection?.floodHazard = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
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
            // Whatever the lookup did, the link that may have started it is
            // finished with. Left standing, the hold would swallow the next
            // parcel the user opens themselves.
            self?.isHoldingLinkPosition = false
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
        dropRefusedParcelEvidence(clearance)
    }

    /// Province data already on screen when permission is withdrawn.
    ///
    /// Hiding the layers stops the tiles and nothing else. The parcel drawn
    /// over them, the panel describing it, and the NSTDB roads and water in
    /// that panel are all Province data too, and they are the part a user is
    /// actually reading — a revocation that leaves them there has revoked
    /// nothing they can see.
    ///
    /// Cancelling matters as much as clearing: a lookup that went out under an
    /// accepted licence is still in flight, and `apply` would land its answer
    /// in a panel the user has since withdrawn permission for.
    private func dropRefusedParcelEvidence(_ clearance: ProvinceLicenceClearance) {
        guard !clearance.allows(.nsprd) else { return }

        // Ahead of the guard below, because a bulk load in flight has drawn
        // nothing yet: it would pass the "nothing on screen" test, land after
        // the revocation, and put every advertised parcel on a map the user has
        // just withdrawn permission for. Its message goes with it, and the
        // one-shot latch resets so accepting again re-asks.
        listedParcelLoad?.cancel()
        listedParcelLoad = nil
        hasLoadedListedParcels = false
        listedParcelMessage = nil

        guard !parcels.features.isEmpty || parcels.selectedPID != nil
            || !addressResults.isEmpty || parcelMessage != nil else { return }

        parcelLookup?.cancel()
        cancelAddressLookup()
        addressResults = []
        setSearchText("")
        parcels = ParcelSelection()
        // Ends the inspection lookup as well, by way of an empty selection.
        publishParcels(focus: false)
        parcelMessage = nil
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
        // The advertised parcels were refused when the map opened, and nothing
        // else asks again. Without this, a user who accepts on their first run
        // sees every notice switched on and not one parcel drawn.
        loadListedParcels()
        // And the same for a user who reached the historical mode before
        // accepting: its load was refused at the licence guard, and leaving and
        // re-entering the mode would be the only way back to a drawn map.
        loadHistoricalParcels()
        let pending = licencePromptedLayerID
        licencePromptedLayerID = nil
        guard let pending else { return }
        if let features, OverlayZIndex.vectorLayers.contains(pending) {
            features.setVisible(pending, to: true)
        } else if let layer = installedLayer(pending) {
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
        // Synchronously rather than by way of the observation mirror: the
        // mirror runs a hop later, and a parcel is Province data that should be
        // gone by the time the sheet has finished dismissing.
        dropRefusedParcelEvidence(licenceStore.clearance)
    }

    func dismissLicenceSheet() {
        licencePromptedLayerID = nil
    }

    /// Whether the user has restricted Province layers to withdraw.
    ///
    /// The control that calls `revokeProvinceLicence` is shown only when this
    /// is true: offering to withdraw permission that was never given describes
    /// a state the user is not in.
    var hasAcceptedProvinceLicence: Bool {
        clearanceBox.clearance.allowsRestrictedLayers
    }

    /// Tiles a revocation was supposed to delete and could not.
    ///
    /// Surfaced rather than swallowed. A revocation that stops the requests but
    /// leaves the imagery on disk has done half of what the user asked for, and
    /// the half it did not do is the half about data already held.
    private(set) var licenceSweepFailure: String?

    /// Withdraws acceptance, and takes the Province imagery off this device.
    ///
    /// Three things, in this order, because each is visible on its own: the
    /// clearance stops every new request, the layers and parcel evidence
    /// already on screen go, and the cached tiles are deleted. Stopping at the
    /// first would leave the map drawing from cache; stopping at the second
    /// would leave the bytes on disk to be drawn again the moment a future bug
    /// read the cache before the gate.
    ///
    /// Saved offline areas are not swept, and that is not an oversight: the
    /// downloader saves Fletcher tiles only, and Fletcher is not a restricted
    /// Province layer. If a restricted layer ever becomes downloadable, this
    /// has to grow a second sweep — `TileStore`, not `TileCache`.
    func revokeProvinceLicence() async {
        licenceSweepFailure = nil
        licenceStore.revoke()
        // Synchronously, as `decline` does: the mirror runs a hop later and the
        // map should not draw one more restricted frame.
        clearanceBox.update(licenceStore.clearance)
        hideRefusedLayers()
        dropRefusedParcelEvidence(licenceStore.clearance)

        guard let tileCache else { return }
        var unswept: [String] = []
        for layer in Self.restrictedInstalledLayers(controller.layers) {
            do {
                try await tileCache.clearLayer(named: layer.configuration.cacheIdentifier)
            } catch {
                unswept.append(layer.name)
            }
        }
        guard !unswept.isEmpty else { return }
        licenceSweepFailure = """
            Tiles already downloaded for \(unswept.joined(separator: ", ")) \
            could not be deleted from this device. The map will not draw or \
            request them again, but the files are still there.
            """
    }

    func dismissLicenceSweepFailure() {
        licenceSweepFailure = nil
    }

    /// The installed layers a revocation has to sweep.
    ///
    /// Read off the catalog's own restricted set rather than a list written out
    /// here: a restricted layer added to the catalog later would otherwise keep
    /// its cached tiles after the user withdrew permission, and nothing in this
    /// file would say so.
    static func restrictedInstalledLayers(_ layers: [MapLayerState]) -> [MapLayerState] {
        layers.filter { layer in
            guard let id = LayerID(rawValue: layer.configuration.id) else {
                // An installed layer with no catalog id cannot be shown to be
                // unrestricted, and the safe reading of "unknown" here is to
                // sweep it.
                return true
            }
            return LayerCatalog.restrictedLayerIDs.contains(id)
        }
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

        guard let features else { return }
        for id in ViewportFeatureViewModel.layers where features.isVisible(id) {
            guard LayerCatalog.descriptor(for: id)?.requiresProvinceClearance == true,
                  !clearance.allows(id) else { continue }
            features.setVisible(id, to: false)
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
        // The queried layers have no opacity control; see `hasOpacityControl`.
        guard vectorLayerID(id) == nil else { return }
        controller.setOpacity(for: id, to: value)
    }

    /// Ask a layer whose tiles failed for them again.
    ///
    /// Rasters only: a queried vector layer refreshes itself when the viewport
    /// settles, so it already has a way back that this would only duplicate.
    func retryTiles(for id: String) {
        guard vectorLayerID(id) == nil else { return }
        controller.retryTiles(for: id)
    }

    func toggleVisibility(_ id: String) {
        // A vector layer's switch is the same decision point as a raster's:
        // the licence has to be answered before the first query goes out, not
        // after features are already on the map.
        if let features, let layerID = vectorLayerID(id) {
            if !features.isVisible(layerID), requiresUnansweredLicence(id) {
                licencePromptedLayerID = layerID
                return
            }
            features.setVisible(layerID, to: !features.isVisible(layerID))
            return
        }

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

    private func vectorLayerID(_ id: String) -> LayerID? {
        guard let layerID = LayerID(rawValue: id),
              OverlayZIndex.vectorLayers.contains(layerID) else { return nil }
        return layerID
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
