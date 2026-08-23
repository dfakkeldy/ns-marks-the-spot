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
    let category: LayerCategoryID
    let rows: [LayerRow]
    /// The line beside the heading, built by the view model because it counts
    /// state the section itself cannot see — the licence, the tax-sale switch,
    /// how many maps the user has added.
    let summary: String
    /// Standing sentences under the rows, where the rows on their own would be
    /// read as more than they are.
    let notes: [String]

    var id: String { category.rawValue }
    var title: String { LayerCategory.named(category).name }

    /// The sentence under the heading once the section is open, from the shared
    /// catalog so both surfaces describe a section the same way.
    var detail: String { LayerCategory.named(category).description }

    var visibleCount: Int { rows.count(where: \.isVisible) }
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

    /// The panel's ten sections, in the web's order.
    ///
    /// Categories rather than the catalog's `LayerGroupID`: that grouping is a
    /// property of the arrays the web's catalog is assembled from, and it is
    /// not the panel either surface shows. A reader who has used the browser
    /// looks for "Environment & Hazards", and finding the same ten headings in
    /// the same order is most of what makes the two surfaces one map.
    ///
    /// Every category is rendered, including the two that hold no catalogued
    /// layer at all: Tax Sale carries the master switch and the record modes,
    /// My Maps the user's own imports. A reader looking for either goes to the
    /// section named for it.
    ///
    /// - Parameter addedMapCount: How many maps and vector layers the user has
    ///   imported. Passed in because those live outside this view model, and a
    ///   panel shown without them is still the same panel.
    func sections(addedMapCount: Int) -> [LayerSection] {
        let grouped = Dictionary(grouping: rows) { $0.descriptor.id.category }
        return LayerCategory.all.map { category in
            let rows = grouped[category.id] ?? []
            return LayerSection(
                category: category.id,
                rows: rows,
                summary: summary(for: category.id, rows: rows, addedMapCount: addedMapCount),
                notes: Self.notes(for: rows)
            )
        }
    }

    /// The web's `categorySummary`, computed from this panel's own rows.
    ///
    /// The strings are the browser's, and the counts are this app's: the same
    /// category holds five zoning layers there and however many this app has
    /// installed here, so copying the number rather than the format would state
    /// a count the rows underneath contradict.
    private func summary(
        for category: LayerCategoryID,
        rows: [LayerRow],
        addedMapCount: Int
    ) -> String {
        switch category {
        case .myMaps:
            return addedMapCount == 0 ? "Add" : "\(addedMapCount) added"
        case .taxSale:
            let state = showsTaxSale ? "On" : "Off"
            return licenceStore.needsDecision ? "\(state) · Province licence required" : state
        default:
            break
        }

        // A layer the licence still stands in front of is not drawing, whatever
        // its switch says, so it is not counted as on.
        var activeCount = rows.count { $0.isVisible && !$0.needsLicence }

        // The base map counts as one of them. Only NS Aerial has a catalog row,
        // so counting rows alone reads "Off" over a Standard map that is
        // plainly drawn; the web counts its own `modern` map here for the same
        // reason. Counted once when NS Aerial is the base map: the row and the
        // picker's fifth choice are the same map, not two.
        if category == .backgroundMaps {
            activeCount = rows.count { row in
                row.isVisible && !row.needsLicence
                    && !NativeLayerTraits.basemapCapable.contains(row.descriptor.id)
            }
            if baseMapType != .blank {
                activeCount += 1
            }
        }

        var parts = [activeCount == 0 ? "Off" : "\(activeCount) on"]

        // Catalogued with nothing behind it. Named rather than counted in the
        // one section where two different things are missing for two different
        // reasons: Fletcher when the build has no tile host for it, and the
        // Church sheets, which have no tiles at all yet. A single number there
        // hides which of the two a reader is looking at.
        if category == .historicalMaps {
            if rows.contains(where: { $0.descriptor.id == .fletcher && !$0.isAvailable }) {
                parts.append("Fletcher unavailable")
            }
            let church = rows.count { $0.descriptor.id != .fletcher && !$0.isAvailable }
            if church > 0 {
                parts.append("\(church) Church maps unavailable")
            }
        } else {
            let unavailable = rows.count { !$0.isAvailable }
            if unavailable > 0 {
                parts.append("\(unavailable) unavailable")
            }
        }

        if rows.contains(where: \.needsLicence) {
            parts.append("Province licence required")
        }

        return parts.joined(separator: " · ")
    }

    /// The standing sentences a section owes its rows, in catalog order.
    ///
    /// Keyed by the catalog group rather than by the category, because what
    /// needs saying is about the zoning layers rather than about everything
    /// filed under Land & Property.
    private static func notes(for rows: [LayerRow]) -> [String] {
        let groups = Set(rows.map(\.descriptor.group))
        return LayerGroupID.allCases
            .filter { groups.contains($0) }
            .compactMap { NativeLayerTraits.sectionNote(for: $0) }
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
    /// The setups on offer and the reader's saved ones. Its own object because
    /// it owns storage; which setup the map is in is a question about the map
    /// and stays here.
    let themes: MapThemeLibrary

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
        floodFetcher: FloodHazardFetcher = FloodHazardFetcher(),
        themes: MapThemeLibrary = MapThemeLibrary(),
        sessionStore: MapSessionStore = MapSessionStore()
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
        self.themes = themes
        self.sessionStore = sessionStore
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
            tileCache: container.tileCache,
            sessionStore: container.sessionStore
        )
        // The layers are already installed the way the reader left them; this
        // is the rest of that view — where it was looking, which record set,
        // and which parcel was open.
        if let session = container.restoredSession {
            resume(session)
        }
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
        // Whatever a restore was still resolving, this search replaces it.
        restoringPID = nil
        let input = ParcelSearchInput.classify(query)
        // Only a PID lookup can be the one a link started, so anything else
        // means the reader is searching and the link's hold on the extent is
        // over.
        if case .pid = input {} else { isHoldingLinkPosition = false }

        switch input {
        case .pid(let pid):
            searchPID(pid)
        case .mapLink(let url):
            // Nothing routes a web link into this app yet — no scheme, no
            // associated domain — so pasting one here is the only way a reader
            // who was sent a view can open it. The restore is the same one
            // `onOpenURL` calls, so a link opened by hand and a link opened by
            // the system cannot come to different views.
            restore(from: url)
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
                if showsTaxSale, taxSale?.listingContext(forPID: pid) != nil {
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
        restoringPID = nil
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

    /// Every PID either bulk load put into `parcels`.
    ///
    /// Kept so that switching tax sales off can take them back out. They are in
    /// hand for one reason, and once that reason is gone they would otherwise
    /// stay on the map as ordinary neighbouring boundaries — which is what the
    /// styling would call them, and would be a map of the province's tax sales
    /// drawn in grey.
    @ObservationIgnored private var bulkLoadedPIDs: Set<String> = []

    /// Asks NSPRD for every parcel the current notices advertise.
    ///
    /// One request set for all of them, once: this is the map opening, not a
    /// lookup, and re-asking as switches and filters move would spend the
    /// Province's service on geometry already in hand. What the switches move
    /// is which of these parcels is drawn as listed.
    func loadListedParcels() {
        guard let taxSale, showsTaxSale, clearanceBox.clearance.allows(.nsprd) else { return }
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
                bulkLoadedPIDs.formUnion(collection.identifiedFeatures.map(\.pid))
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
        guard let historical, mapRecordMode == .historical,
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
                bulkLoadedPIDs.formUnion(collection.identifiedFeatures.map(\.pid))
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
    var mapRecordMode: HistoricalTaxSaleViewModel.Mode {
        showsTaxSale ? (historical?.mode ?? .current) : .current
    }

    /// Whether the map is showing tax-sale information at all.
    ///
    /// This map is a general-purpose map of Nova Scotia; tax-sale research is
    /// one job it can be set up for. Everything about it — the notices, the
    /// records, the parcel colours, the record-mode switch, the opening fit,
    /// the parcel card's notice section, and what a shared link carries — is
    /// behind this one answer, and the answer starts as no.
    ///
    /// Kept here rather than on either record set's view model because it is a
    /// fact about the map. The two sets are separate datasets, either of which
    /// a build may ship without, and neither is in a position to speak for what
    /// the map as a whole is showing.
    private(set) var showsTaxSale = false

    /// Whether there is a second record set to offer at all.
    var offersRecordModes: Bool { showsTaxSale && historical != nil }

    /// Turns tax-sale information on or off across the whole map.
    ///
    /// Switching it off takes back everything that was on the map only because
    /// tax sales were on: the advertised and dated parcels, the notice on the
    /// open card, the counts under the panel, the record mode, and the
    /// selections and filters over both record sets. The parcel the reader
    /// opened stays open. They chose it, and it is an ordinary parcel whether
    /// or not anybody is auctioning it.
    ///
    /// The mode itself is left where it was, as the web leaves it. `mapRecordMode`
    /// already reads `.current` while this is off, so nothing acts on it, and a
    /// reader who switches back finds the map where they left it.
    func setTaxSaleEnabled(_ enabled: Bool) {
        guard showsTaxSale != enabled else { return }
        showsTaxSale = enabled

        if enabled {
            loadListedParcels()
            loadHistoricalParcels()
        } else {
            // Cancelled rather than left to land: a reply that arrives after
            // the switch would merge a province of advertised geometry into a
            // map that has stopped asking, and write a count of it underneath.
            listedParcelLoad?.cancel()
            listedParcelLoad = nil
            historicalParcelLoad?.cancel()
            historicalParcelLoad = nil
            hasLoadedListedParcels = false
            hasLoadedHistoricalParcels = false
            listedParcelMessage = nil
            historicalParcelMessage = nil
            // The open parcel is exempt. It is on screen because the reader
            // asked about it, which is a reason that survives the switch.
            parcels.remove(pids: bulkLoadedPIDs.subtracting([parcels.selectedPID].compactMap(\.self)))
            bulkLoadedPIDs = []
            taxSale?.resetSelection()
            historical?.resetFilters()
            // Nothing of theirs is drawn any more, so the fit that framed them
            // is spent rather than pending: turning tax sales back on later
            // should not throw the reader's view across the province.
            hasFramedListedParcels = true
        }
        refreshInspection()
        publishParcels(focus: false)
    }

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
        // Settable while tax sales are off, which is what the browser allows.
        // The gate is at the read: `mapRecordMode` answers `.current` for a map
        // that is not showing tax sales at all, so nothing acts on a mode set
        // here. What it buys is that a link or a session can carry the mode the
        // reader was in, and switching tax sales back on returns them to it.
        //
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
        if showsTaxSale, taxSale?.listingContext(forPID: pid) != nil, !parcels.holds(pid: pid) {
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
        guard !hasFramedListedParcels, !isHoldingLinkPosition, showsTaxSale,
              mapRecordMode == .current,
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
        let listed = showsTaxSale && mapRecordMode == .current
            ? (taxSale?.highlightedPIDs ?? [])
            : []
        let shapes = parcels.shapes(
            taxSalePIDs: listed,
            historicalPIDs: showsTaxSale ? (historical?.highlightedPIDs ?? []) : []
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
            // Which notices were on is a fact about a map that was showing
            // them. A link out of a map without tax sales carries no selection,
            // because nobody made one.
            eventIDs = showsTaxSale
                ? (taxSale?.selectedEventIDs).map { Array($0).sorted() } ?? []
                : []
        case .historical:
            // Only the events the open parcel actually appears in. The
            // historical panel filters records rather than selecting events, so
            // there is no selected set to carry.
            eventIDs = parcels.selectedPID
                .map { pid in historical?.contexts(forPID: pid).map(\.event.id) ?? [] }
                .map { Array(Set($0)).sorted() } ?? []
        }

        return MapShareState(
            taxSaleEnabled: showsTaxSale,
            // The mode the map is holding, not the one it is acting on.
            // `mapRecordMode` reads `.current` while tax sales are off, and
            // writing that would tell the other surface the reader had switched
            // back to notices when they had only switched tax sales off. The
            // browser writes its own `mapMode` here regardless of the switch.
            mode: (historical?.mode ?? .current) == .historical ? .historical : .current,
            pid: parcels.selectedPID,
            eventIDs: eventIDs,
            layerIDs: (baseMapType == .standard ? [MapShareState.modernBaseLayerID] : [])
                + rows.filter(\.isVisible).map(\.id),
            position: mapPosition
        )
    }

    var shareURL: URL? { shareState.url(base: Self.webMapURL) }

    /// Where a printed page's receipt starts from: the map state a share link
    /// would carry, less what this page was told not to print.
    ///
    /// The imagery is dropped here for the same reason it is dropped from the
    /// page's layers. A receipt naming a source the paper carries no pixels
    /// from tells the reader the imagery was consulted for what they are
    /// looking at.
    func printedShareState(includesAerial: Bool) -> MapShareState {
        var state = shareState
        if !includesAerial {
            state.layerIDs.removeAll { $0 == LayerID.nsAerial.rawValue }
        }
        return state
    }

    @ObservationIgnored private let sessionStore: MapSessionStore

    /// Writes down the current view so the next launch can open on it.
    ///
    /// Called when the map settles and when the app leaves the foreground,
    /// which between them cover everything a reader can change: panning and
    /// zooming settle, and a switch thrown without moving the map is caught on
    /// the way out. The browser writes the same view into its address bar on
    /// every change, which is the behaviour this is here to match.
    func rememberSession() {
        var view = shareState
        // A restored parcel whose boundary has not arrived yet is still the
        // parcel this view is about. Without this, a settle or a trip to the
        // background inside that window wrote the session back without it, and
        // the reader returned to the right ground with the card gone.
        if view.pid == nil { view.pid = restoringPID }
        sessionStore.save(MapSession(view: view, background: baseMapType))
    }

    /// The parcel a restored view named, until the reader names another one.
    ///
    /// A fallback rather than a lock: nothing has to remember to clear it for
    /// sessions to keep being written.
    ///
    /// It outlives a lookup that failed, was refused, or found no geometry,
    /// which is the browser's behaviour — a `pid` stays in its address bar
    /// whatever the parcel service said about it. Clearing it on failure meant
    /// a reader who resumed while NSPRD was down lost the parcel they had been
    /// working on. The two things that do clear it are the reader searching for
    /// something else and the selection being cleared.
    @ObservationIgnored private var restoringPID: String?

    /// Set while a link's own parcel lookup is in flight, so the parcel does not
    /// reframe a map the link already positioned.
    private var isHoldingLinkPosition = false
    /// Whether the opening fit to the advertised parcels has already happened.
    /// Once only: refitting after the user has moved would take the map away
    /// from wherever they went.
    private var hasFramedListedParcels = false

    /// Where the map is, as a latitude, a longitude, and a tile zoom.
    ///
    /// Read by the share link, the evidence note, the readout on the map, and
    /// the session written on the way out.
    ///
    /// Before the map has been laid out there is no view to measure, and the
    /// answer is whatever it has been told to open on: a link's position, or
    /// the one the last session left. Only a launch with neither falls back to
    /// the opening view, and there it is the truth. Reading `.default` in every
    /// case is what let a scene going inactive between launch and the map
    /// attaching write the province over the map the reader left.
    var mapPosition: MapPosition {
        guard controller.hasReportedItsPosition,
              let bounds = controller.currentVisibleBounds()
        else {
            return controller.heldPosition ?? .default
        }
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
                taxSaleEnabled: showsTaxSale,
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
        /// Whether this page was meant to carry an evidence appendix and is
        /// going out without one.
        ///
        /// The appendix is the whole of what a research summary carries beyond
        /// a field sheet. Dropped silently, the reader is holding a page named
        /// for evidence that has none on it, and no way to tell that from a
        /// parcel nothing was found for.
        appendixWithheld: Bool = false,
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
        /// What each feature-query layer was doing when the page was made, as
        /// the layer panel has it. Empty by default: callers that show no such
        /// panel print the same page they always did.
        featureStatuses: [LayerID: ViewportLayerStatus] = [:],
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
        // The ground that will actually print, which is the frame grown to the
        // paper. Read here as well as in the export because the sentences below
        // are about what the reader will be holding, and the frame on its own
        // is smaller than that.
        let printed = PrintExportPlan.bounds(covering: box, mapFrame: template.mapFrame)
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
        // The page is titled for the parcel it frames, and a title is a claim
        // about the whole of it. A frame drawn by hand cuts wherever the user
        // dragged it, so a page can promise PID 15234636 and show its northern
        // third.
        if let pid = inspectedPID(shownWithin: box), !parcelFits(pid, within: printed) {
            disclosures.append(
                "PID \(pid) runs past the edge of this map. The page shows part "
                    + "of the parcel."
            )
        }
        if appendixWithheld {
            disclosures.append(
                "The evidence appendix was left off this page. What each source "
                    + "answered, what it returned nothing for, and what was never "
                    + "asked are not on this document."
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
            featureLayerStatuses: featureStatuses,
            template: template,
            fields: fields,
            includesLegend: includesLegend,
            // Where the page's receipt leads. Read here with the rest of the
            // snapshot, because a state read a moment later would describe a
            // map the reader had already moved. What the page was framed on and
            // which of these layers reached the paper are filled in by the
            // export, which is the only place either is known.
            share: PrintShareLink(
                base: Self.webMapURL, state: printedShareState(includesAerial: includesAerial)
            ),
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

    /// Whether the named parcel's whole outline is inside the ground that will
    /// print.
    ///
    /// Boxes rather than rings, and that is the safe direction: a bounding box
    /// that fits guarantees the outline inside it fits, so this never claims a
    /// parcel is cut when it is not. It can miss a parcel whose box pokes out
    /// where the outline does not, which costs a sentence the page did not
    /// need rather than a promise it cannot keep.
    ///
    /// True when there is no geometry to check. A parcel with no outline is
    /// already the subject of its own notice on the card, and the page has the
    /// "boundary is not on this map" sentence for the case where it is absent.
    private func parcelFits(_ pid: String, within bounds: GeoBoundingBox) -> Bool {
        guard let shape = controller.state.parcelShapes.first(where: { $0.pid == pid }),
              let box = Self.boundingBox(of: shape)
        else { return true }
        return box.south >= bounds.south && box.north <= bounds.north
            && box.west >= bounds.west && box.east <= bounds.east
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

    /// The layers with ink inside this frame, whatever their panel says.
    private func drawnFeatureLayers(within bounds: GeoBoundingBox) -> Set<LayerID> {
        var drawn = Set(printedFeatures(within: bounds).map(\.layer))
        drawn.formUnion(printedMarkers(within: bounds).map(\.layer))
        return drawn
    }

    /// The undrawn layers named the way the page will name them, so the sheet
    /// can admit them before the export runs rather than after.
    func undrawnFeatureLayerNotes(
        within bounds: GeoBoundingBox, statuses: [LayerID: ViewportLayerStatus]
    ) -> [String] {
        PrintExport.undrawnFeatureLayers(
            statuses, drawn: drawnFeatureLayers(within: bounds)
        ).map { layer in
            let name = LayerCatalog.descriptor(for: layer.id)?.name ?? layer.id.rawValue
            return "\(name) (\(layer.status.printReason))"
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
        apply(state, arrivedFrom: .sharedLink)
    }

    /// Puts the map back where the reader left it at the last launch.
    ///
    /// Everything a link restores, said quietly. Nobody sent this view and
    /// nobody is waiting to hear how it went: there is no sentence about a
    /// shared link, and a layer the licence now stands in front of is simply
    /// not drawn rather than being made into a question at launch. The reader
    /// withdrew that permission themselves, and asking again every time the app
    /// opens would be arguing with them.
    func resume(_ session: MapSession) {
        apply(
            session.view,
            background: session.background.flatMap(permittedBackground),
            arrivedFrom: .lastSession
        )
    }

    /// A background as far as the Province licence allows it, or `nil`.
    ///
    /// NS Aerial is a base map and a licensed layer at once. Restoring it
    /// against a licence that has been declined would leave the picker naming
    /// imagery the map is not drawing, and against one nobody has answered it
    /// would open the licence sheet at launch — which is the argument this
    /// resume is written not to have.
    private func permittedBackground(_ type: MapBaseType) -> MapBaseType? {
        guard let layerID = Self.basemapLayerID(for: type),
              LayerCatalog.descriptor(for: layerID)?.requiresProvinceClearance == true
        else { return type }
        return clearanceBox.clearance.allowsRestrictedLayers ? type : nil
    }

    /// Whether a background puts anything under the layers.
    ///
    /// Only None does not, and the browser's other unusable case does not apply
    /// here: NS Aerial draws as a tile overlay above MapKit's standard map, so
    /// below the zoom the imagery starts at, or with its licence unanswered,
    /// the reader is looking at the standard map rather than at nothing. The
    /// browser has no map under its aerial layer, which is why it has to check
    /// the zoom and this does not.
    private func drawsGround(_ type: MapBaseType) -> Bool {
        type != .blank
    }

    /// Where a restored view came from, which is the only thing that differs
    /// between opening a link and picking up where the reader left off.
    private enum RestoreOrigin {
        case sharedLink
        case lastSession
    }

    private func apply(
        _ state: MapShareState,
        background: MapBaseType? = nil,
        arrivedFrom origin: RestoreOrigin
    ) {
        // Before the mode, because the mode is a choice within tax sales and
        // setting it on a map that is not showing them has nothing to move.
        setTaxSaleEnabled(state.taxSaleEnabled)
        setMapRecordMode(state.mode == .historical ? .historical : .current)
        // A session says which background it was on outright. A link only says
        // whether the modern map was drawn, because that is all the browser has
        // a word for, so anything else it leaves where it is.
        let restored =
            background
            ?? (state.layerIDs.contains(MapShareState.modernBaseLayerID)
                ? .standard : baseMapType)
        // Unless leaving it where it is would leave the link's layers over
        // nothing. The browser turns its modern map on for a link that names
        // layers and no ground to draw them on.
        //
        // Only for a link. A reader who left their own map on None meant it,
        // and resuming their session is not the moment to argue.
        if origin == .sharedLink, !state.layerIDs.isEmpty, !drawsGround(restored) {
            setBaseMapType(.standard)
        } else {
            setBaseMapType(restored)
        }
        if let taxSale, state.taxSaleEnabled, state.mode == .current, !state.eventIDs.isEmpty {
            for event in taxSale.upcomingEvents {
                taxSale.setEventVisibility(event.id, to: state.eventIDs.contains(event.id))
            }
            refreshListedParcelStyling()
        }
        // What the view asked for and this map cannot simply switch on: the
        // layers the Province licence still stands in front of, and the ones
        // this build does not carry. Both were skipped in silence before, which
        // left a link opening a view that looked restored while the imagery,
        // the parcels or the water it named were missing.
        var refusedByLicence: [String] = []
        var notCarried: [String] = []
        for row in rows {
            let wanted = state.layerIDs.contains(row.id)
            guard row.isAvailable else {
                if wanted { notCarried.append(row.id) }
                continue
            }
            if wanted, row.needsLicence {
                refusedByLicence.append(row.id)
                continue
            }
            if wanted != row.isVisible {
                toggleVisibility(row.id)
            }
        }
        if origin == .sharedLink {
            noteWhatTheLinkCouldNotRestore(refused: refusedByLicence, notCarried: notCarried)
        }
        controller.center(
            on: GeoPoint(lat: state.position.latitude, lng: state.position.longitude),
            zoom: state.position.zoom
        )
        // This extent was chosen, by the sender or by the reader themselves,
        // so the opening fit to the advertised parcels is spent: turning tax
        // sales on starts that load, and letting it land and reframe would take
        // the reader off the place the view was about.
        hasFramedListedParcels = true
        guard let pid = state.pid else {
            // A link that names no parcel is a link to a view, and leaving a
            // previously open parcel selected would attach this reader's card to
            // a map the sender never sent.
            clearParcelSelection()
            // Said out loud because the field the link was pasted into is now
            // empty and the map has moved: without a sentence, a reader whose
            // link carried nothing they can see has no way to tell a restored
            // view from a search that quietly did nothing. A resumed session
            // moved nothing and was pasted nowhere, so it says nothing.
            if origin == .sharedLink {
                parcelMessage = ParcelLookupMessage.openedSharedView
            }
            return
        }
        // The view said where it was looking. Opening the parcel would otherwise
        // frame the parcel instead, throwing away the extent that was chosen.
        isHoldingLinkPosition = true
        searchParcel(pid)
        // After the search, which clears it: this is the parcel a session
        // written before the Province answers should still name.
        restoringPID = pid
    }

    /// What a shared link asked for and this map is not showing.
    ///
    /// Held next to the map rather than folded into `parcelMessage`, which the
    /// parcel the link names overwrites a moment later. A reader who cannot see
    /// what was left out has no way to tell a restored view from one that
    /// arrived with its imagery missing.
    private(set) var sharedLinkNotice: String?

    /// Layers a shared link asked for that the licence stands in front of, kept
    /// while the sheet is up.
    ///
    /// Accepting switches on all of them, not only the one the sheet named: the
    /// sheet names a layer to say what the permission is for, and restoring
    /// that one alone would still leave the reader on a view the sender never
    /// sent.
    @ObservationIgnored private var pendingSharedLayerIDs: [String] = []

    /// Says what the link could not restore, and asks about the licence where
    /// that is what stood in the way.
    ///
    /// The browser raises its licence dialog for exactly this link, which is
    /// why this app now does too. Asking is not accepting on the reader's
    /// behalf; it is putting the same decision in front of them that tapping
    /// the layer's own switch would.
    private func noteWhatTheLinkCouldNotRestore(refused: [String], notCarried: [String]) {
        var notes: [String] = []
        if !refused.isEmpty {
            notes.append("Off until the Province licence is accepted: \(Self.layerNames(refused)).")
        }
        if !notCarried.isEmpty {
            notes.append("Not in this app yet: \(Self.layerNames(notCarried)).")
        }
        sharedLinkNotice = notes.isEmpty ? nil : notes.joined(separator: " ")
        pendingSharedLayerIDs = []
        guard !refused.isEmpty, licenceStore.needsDecision,
              let first = refused.first.flatMap(LayerID.init(rawValue:))
        else { return }
        pendingSharedLayerIDs = refused
        licencePromptedLayerID = first
    }

    // MARK: - Map setup

    /// Which named setup the reader chose, if they chose one. Kept apart from
    /// what the map matches: a reader who picks Historical Maps and then
    /// switches one layer off is still working from Historical Maps, and the
    /// panel says so by naming it and calling it modified.
    private(set) var selectedThemeID: String?

    /// What the last applied theme could actually deliver here, so the panel
    /// can say which layers it had to leave out.
    private(set) var themeResolution: ResolvedTheme?

    /// How many setups have been applied, counted so the panel can reopen the
    /// sections each one asks for.
    ///
    /// Reset re-applies the setup the map is already named after: the same
    /// resolution, an equal value, and SwiftUI runs `onChange` only for values
    /// that differ. Watching the resolution alone would put the layers back
    /// and leave the panel open on whatever the reader had since gone digging
    /// through.
    private(set) var themeApplications = 0

    /// A theme waiting on the licence answer, set only while the sheet is up.
    @ObservationIgnored private var pendingThemeID: String?

    /// The setup the map is in, in the vocabulary both surfaces share.
    ///
    /// The same layer list a shared link carries, plus any slider the reader
    /// has moved off the catalog's value. Not the position: a theme is what the
    /// map shows, not where it is looking, and picking one should leave the
    /// reader over the same ground.
    var themeState: MapThemeState {
        let layerIDs = (baseMapType == .standard ? [MapShareState.modernBaseLayerID] : [])
            + rows.filter(\.isVisible).map(\.id)
        return MapThemeState(
            layerIDs: layerIDs,
            opacityOverrides: opacityOverrides(among: Set(layerIDs)),
            taxSaleEnabled: showsTaxSale,
            mode: mapRecordMode == .historical ? .historical : .current
        )
    }

    /// Where each drawn layer's slider sits, when it is not where the catalog
    /// put it.
    ///
    /// Only the differences, and only for layers that are drawn. Writing every
    /// layer's opacity into a saved setup would freeze today's catalog into it,
    /// and the catalog is the value both surfaces draw at.
    private func opacityOverrides(among drawn: Set<String>) -> [String: Double] {
        var overrides: [String: Double] = [:]
        for row in rows where row.hasOpacityControl && drawn.contains(row.id) {
            // A layer the catalog declares no opacity for has no value to have
            // been moved off, so there is nothing here to record.
            guard let declared = row.descriptor.opacity else { continue }
            // Two decimals, which is as fine as the slider goes. Compared at
            // full precision, a restored 0.69999999 and a chosen 0.7 are
            // different numbers, and the panel would report an untouched map as
            // modified.
            let opacity = (Double(row.opacity) * 100).rounded() / 100
            if opacity != declared {
                overrides[row.id] = opacity
            }
        }
        return overrides
    }

    /// What this build and this reader can draw, which is how much of a theme
    /// can actually be applied.
    var themeCapabilities: ThemeCapabilities {
        ThemeCapabilities(
            licenceAccepted: !licenceStore.needsDecision,
            availableLayerIDs: Set(rows.filter(\.isAvailable).map(\.id))
                .union([MapShareState.modernBaseLayerID]),
            restrictedLayerIDs: Set(
                rows.filter(\.descriptor.requiresProvinceClearance).map(\.id)
            )
        )
    }

    /// How the picker reads.
    enum MapThemeStatus: Equatable {
        /// The map is exactly the named setup.
        case exact
        /// The named setup with changes on top.
        case modified
        /// A setup that could be applied only in part, and still is that.
        case partial
        /// No named setup describes this map.
        case unnamed
    }

    /// Whether the background the map is drawing is one a setup can record.
    ///
    /// Satellite and Hybrid are MapKit's own, and the vocabulary the two
    /// surfaces share has no name for either — a shared link cannot carry them
    /// either. A setup saved while one of them is up comes back without it, so
    /// no setup describes this map. Saying otherwise would call a map exact and
    /// then change its background the next time the same setup was picked.
    private var backgroundIsNamed: Bool {
        baseMapType != .satellite && baseMapType != .hybrid
    }

    /// The theme this map already is, if any theme describes it.
    private var matchedTheme: MapTheme? {
        guard backgroundIsNamed else { return nil }
        if let selected = selectedThemeID.flatMap(themes.theme(_:)),
           themeState.matches(selected.state) {
            return selected
        }
        return MapTheme.match(themeState, in: themes.all)
    }

    /// The sections the layer panel opens with.
    ///
    /// The browser reads its own URL at launch and opens the sections the setup
    /// that URL matches prefers, so a reader who saved a Forestry setup and
    /// comes back finds Forestry open. There is no URL to read here, and the
    /// map is restored before the panel is ever built, so the same question is
    /// asked of the map itself.
    ///
    /// Background Maps when no setup matches, which is where the panel opens on
    /// a first launch. The browser opens nothing at all in that case; on a
    /// phone, where the panel is something the reader deliberately pulled up,
    /// that would be a card of ten headings.
    var openingSections: Set<LayerCategoryID> {
        guard let matched = matchedTheme, !matched.preferredCategoryIDs.isEmpty else {
            return [.backgroundMaps]
        }
        return Set(matched.preferredCategoryIDs)
    }

    /// The theme the picker shows as chosen: what the reader picked, or failing
    /// that whatever setup the map turns out to already be.
    var activeThemeID: String? {
        selectedThemeID ?? matchedTheme?.id
    }

    var themeStatus: MapThemeStatus {
        // A partial resolution stands only while the map is still the thing
        // that was applied. One more toggle and it is a modified map, not a
        // theme that could not be applied in full.
        if themeResolution?.status == .partial, backgroundIsNamed,
           let resolution = themeResolution, themeState.matches(resolution.target) {
            return .partial
        }
        guard let activeThemeID else { return .unnamed }
        return matchedTheme?.id == activeThemeID ? .exact : .modified
    }

    /// The name of the setup, and what has happened to it.
    ///
    /// "Current setup" rather than the browser's "Shared setup": on the phone
    /// this is also what a fresh launch reads, before anybody has picked
    /// anything or opened a link.
    var themeStatusText: String {
        let name = activeThemeID.flatMap(themes.theme(_:))?.name ?? "Current setup"
        return switch themeStatus {
        case .exact, .unnamed: name
        case .modified: "\(name) · Modified"
        case .partial: "\(name) · Partly applied"
        }
    }

    var themeDescription: String {
        activeThemeID.flatMap(themes.theme(_:))?.description
            ?? "The layers this map currently has on."
    }

    /// Which layers the last theme could not deliver, and why. `nil` when it
    /// delivered everything.
    ///
    /// The two reasons are kept apart: a layer this build has no source for is
    /// missing, and a layer behind the Province licence is refused. Only one of
    /// those the reader can do anything about.
    var themeResolutionNotice: String? {
        guard themeStatus == .partial, let resolution = themeResolution else { return nil }
        var parts: [String] = []
        if !resolution.unavailableLayerIDs.isEmpty {
            parts.append("Unavailable: \(Self.layerNames(resolution.unavailableLayerIDs)).")
        }
        if !resolution.blockedLayerIDs.isEmpty {
            parts.append("Licence required: \(Self.layerNames(resolution.blockedLayerIDs)).")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    /// Why a Satellite or Hybrid map reads as modified whatever the reader
    /// picked, and why saving it will not bring the background back.
    var themeBackgroundNotice: String? {
        guard !backgroundIsNamed else { return nil }
        return "A \(baseMapType.rawValue) background is not part of a saved setup."
    }

    /// Everything the panel has to say about the setup: what could not be
    /// applied, what the background cannot carry, and anything the saved
    /// library reported.
    var themeNotice: String? {
        let parts = [themeResolutionNotice, themeBackgroundNotice, themes.notice]
            .compactMap(\.self)
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    private static func layerNames(_ ids: [String]) -> String {
        ids.map { id in
            guard let layerID = LayerID(rawValue: id) else {
                return id == MapShareState.modernBaseLayerID ? "Standard base map" : id
            }
            return LayerCatalog.descriptor(for: layerID)?.name ?? id
        }
        .joined(separator: ", ")
    }

    /// Puts the map into a named setup.
    ///
    /// A theme naming a restricted layer this build carries raises the licence
    /// sheet first rather than quietly applying without it. That is the same
    /// decision point a tap on the layer's own switch reaches, and reaching it
    /// from here means a reader who picks Tax Sale Research is asked once
    /// rather than left looking at a map missing the imagery it named.
    func selectTheme(_ id: String) {
        guard let theme = themes.theme(id) else { return }
        let capabilities = themeCapabilities

        if !capabilities.licenceAccepted,
           let restricted = theme.state.layerIDs
               .compactMap(LayerID.init(rawValue:))
               .first(where: {
                   capabilities.availableLayerIDs.contains($0.rawValue)
                       && capabilities.restrictedLayerIDs.contains($0.rawValue)
               })
        {
            pendingThemeID = id
            licencePromptedLayerID = restricted
            return
        }

        applyTheme(theme)
    }

    /// Puts the map back into the setup it is supposed to be in, undoing
    /// whatever has been switched since.
    func resetTheme() {
        guard let activeThemeID else { return }
        selectTheme(activeThemeID)
    }

    private func applyTheme(_ theme: MapTheme) {
        selectedThemeID = theme.id
        themeResolution = apply(theme)
    }

    /// Applies a theme and reports what of it could be delivered here.
    @discardableResult
    func apply(_ theme: MapTheme) -> ResolvedTheme {
        let resolved = theme.resolved(with: themeCapabilities)
        apply(resolved)
        return resolved
    }

    func apply(_ resolved: ResolvedTheme) {
        themeApplications += 1
        let wanted = Set(resolved.target.layerIDs)

        // Before the mode, for the reason `restore(from:)` has it first: the
        // mode is a choice within tax sales, and setting it on a map that is
        // not showing them has nothing to move.
        setTaxSaleEnabled(resolved.target.taxSaleEnabled)
        setMapRecordMode(resolved.target.mode == .historical ? .historical : .current)
        if resolved.target.taxSaleEnabled, resolved.target.mode == .current {
            // Every current notice, as the browser applies a theme. A setup is
            // not a search: carrying over the two municipalities somebody had
            // narrowed to would hide notices this theme never excluded.
            //
            // The redemption filter stays where the reader left it. That is
            // where the browser leaves it — it clears the filters only when a
            // setup switches tax sales off — and widening the parcels on show
            // is not something a setup was asked to do.
            taxSale?.selectAllCurrentEvents()
            refreshListedParcelStyling()
        }

        for row in rows where row.isAvailable {
            let shouldDraw = wanted.contains(row.id)
            // Never switched *on* through a licence the reader has not
            // accepted: `toggleVisibility` raises the sheet, which is right for
            // a tap and wrong for a setup being applied. `resolved` has already
            // dropped those layers; this keeps that true if it ever stops
            // being.
            if shouldDraw != row.isVisible, !(shouldDraw && row.needsLicence) {
                toggleVisibility(row.id)
            }
        }

        // After the rows, because switching NS Aerial off returns the base map
        // to Standard on its own.
        //
        // A setup naming neither background gets none, which is what the
        // browser draws with its modern map switched off. Satellite and Hybrid
        // have no name in this vocabulary — a shared link cannot carry them
        // either — so a setup saved over one of those comes back without it.
        if wanted.contains(MapShareState.modernBaseLayerID) {
            setBaseMapType(.standard)
        } else if !wanted.contains(LayerID.nsAerial.rawValue) {
            setBaseMapType(.blank)
        }

        // The sliders last. Turning a layer on can restore an opacity of its
        // own, and the setup's value is the one that should stand.
        for row in rows where row.hasOpacityControl {
            guard let declared = row.descriptor.opacity else { continue }
            let opacity = resolved.target.opacityOverrides[row.id] ?? declared
            if Double(row.opacity) != opacity {
                updateLayerOpacity(for: row.id, to: CGFloat(opacity))
            }
        }
    }

    /// Saves what the map is currently showing under a name of the reader's
    /// choosing, and selects it.
    ///
    /// - Parameter openSections: which panel sections are open, which the saved
    ///   setup reopens. A setup that switches on seven layers across four
    ///   sections and reopens only Background Maps has hidden what it just did.
    /// - Returns: whether the setup was saved. The manager keeps the name the
    ///   reader typed when it was not, so a refused save can be tried again
    ///   without retyping it.
    @discardableResult
    func saveCurrentSetup(named name: String, openSections: [LayerCategoryID]) -> Bool {
        guard let saved = themes.save(
            name: name,
            state: themeState,
            preferredCategoryIDs: openSections
        ) else { return false }
        selectedThemeID = saved.id
        // Nothing was applied: the map is already this. Clearing the resolution
        // stops a stale "partly applied" from an earlier pick standing over a
        // setup that was saved whole.
        themeResolution = nil
        return true
    }

    /// Replaces a saved setup with what the map is showing now.
    func updateSavedTheme(_ id: String, openSections: [LayerCategoryID]) {
        guard themes.update(id, to: themeState, preferredCategoryIDs: openSections) else {
            return
        }
        selectedThemeID = id
        themeResolution = nil
    }

    func deleteSavedTheme(_ id: String) {
        guard themes.delete(id) else { return }
        guard selectedThemeID == id else { return }
        // The map keeps whatever it was drawing; only the name it was drawing
        // it under is gone.
        selectedThemeID = nil
        themeResolution = nil
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
        let notice = showsTaxSale && mapRecordMode == .current
            ? taxSale?.listingContext(forPID: pid)
            : nil
        // PVSC's own key for this property, as the municipality printed it.
        // Matching by account is exact where matching by geometry is not, so
        // when the notice named one it is asked with instead of the rings.
        let noticeAAN = notice?.listing.aan
        let records = showsTaxSale ? (historical?.contexts(forPID: pid) ?? []) : []
        // Only printed in the historical mode. The current notices are the
        // map's ordinary state, and a marker on every card would stop being
        // read long before the one card that needs it.
        let modeMarker = mapRecordMode == .historical
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
            state.showsTaxSale = showsTaxSale
            state.taxSaleNotice = notice
            state.historicalRecords = records
            state.recordModeMarker = modeMarker
            let reason = ParcelLookupMessage.noParcelRecordToAskWith
            state.civicAddresses = .unavailable(reason)
            state.mappedContext = .unavailable(reason)
            state.buildings = .unavailable(reason)
            state.resources = .unavailable(reason)
            state.floodHazard = .unavailable(reason)
            if !askingPVSCByAccount(noticeAAN, of: &state) {
                state.assessments = .unavailable(reason)
                state.dwellings = .unavailable(reason)
            }
            inspection = state
            askPVSCByAccount(noticeAAN, for: pid)
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
        state.showsTaxSale = showsTaxSale
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
            state.buildings = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.resources = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.floodHazard = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            if !askingPVSCByAccount(noticeAAN, of: &state) {
                state.assessments = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
                state.dwellings = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            }
            inspection = state
            askPVSCByAccount(noticeAAN, for: pid)
            return
        }
        inspection = state

        inspectionLookup = Task {
            [
                weak self, civicFetcher, contextFetcher, assessmentFetcher, dwellingFetcher,
                buildingFetcher, resourceFetcher, floodFetcher,
                clearance = clearanceBox.clearance,
                mappedAreaSquareMetres = state.mappedArea?.squareMetres,
                noticeAAN
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
                        return .assessments(
                            .success(
                                try await assessmentFetcher.assessments(
                                    for: parts, noticeAAN: noticeAAN
                                )
                            )
                        )
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

    /// Whether PVSC can still be asked about a parcel with no usable geometry.
    ///
    /// An account number is not a shape, so the absence of one does not stop
    /// this lookup the way it stops the others. Sets the two account-fed
    /// sections back to `looking` when the answer is yes, because the caller
    /// has already written the refusal that applies to everything else.
    private func askingPVSCByAccount(
        _ noticeAAN: String?,
        of state: inout ParcelInspection
    ) -> Bool {
        guard let noticeAAN, PVSCAssessmentQuery.normalizeAAN(noticeAAN) != nil else {
            return false
        }
        state.assessments = .looking
        state.dwellings = .looking
        return true
    }

    /// Asks PVSC for the notice's account, without any parcel geometry.
    ///
    /// The web runs this lookup whenever the notice named an AAN, even with no
    /// parcel feature selected. Without it, a listed property NSPRD holds no
    /// shape for would show nothing at all, when the assessment record it is
    /// keyed to is sitting there under a number the municipality printed.
    private func askPVSCByAccount(_ noticeAAN: String?, for pid: String) {
        guard let noticeAAN, PVSCAssessmentQuery.normalizeAAN(noticeAAN) != nil else { return }

        inspectionLookup = Task { [weak self, assessmentFetcher, dwellingFetcher] in
            let assessed: Evidence
            do throws(PVSCAssessmentFailure) {
                assessed = .assessments(
                    .success(try await assessmentFetcher.assessments(for: [], noticeAAN: noticeAAN))
                )
            } catch {
                assessed = .assessments(.failure(error))
            }
            guard !Task.isCancelled, let self else { return }
            self.apply(assessed, to: pid)

            guard case .assessments(.success(let result)) = assessed, !result.accounts.isEmpty,
                self.inspection?.pid == pid
            else { return }

            let dwelt: Evidence
            do throws(PVSCDwellingFailure) {
                dwelt = .dwellings(
                    .success(try await dwellingFetcher.dwellings(forAANs: result.accounts.map(\.aan)))
                )
            } catch {
                dwelt = .dwellings(.failure(error))
            }
            guard !Task.isCancelled else { return }
            self.apply(dwelt, to: pid)
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

    /// Runs a parcel request and applies its answer on the main actor.
    ///
    /// `@concurrent` on the lookup is load-bearing, not decoration. This module
    /// builds with approachable concurrency, where a bare `() async` closure
    /// means "runs on the caller's executor and comes back on it" — so the
    /// compiler emits no hop after the await. Every lookup passed here actually
    /// leaves the main actor, because the fetchers behind it are ordinary
    /// `async` functions in a package built without that default, and the URL
    /// loading system resumes them on whatever thread finished the request.
    /// Without the attribute the code after `await` ran there too: on CI the
    /// answer came back on a cooperative thread and the main-actor callback
    /// tripped the runtime's isolation check, killing the test host with no
    /// message against the test that was running. Saying the callee is
    /// concurrent is what makes the hop back to the main actor be emitted.
    private func startLookup(
        forPointTap: Bool,
        _ lookup: @escaping @Sendable @concurrent () async
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
        // A whole setup was waiting on the answer, not one switch. Applying it
        // turns on the layer the sheet named along with the rest of it.
        if let pendingThemeID, let theme = themes.theme(pendingThemeID) {
            self.pendingThemeID = nil
            applyTheme(theme)
            return
        }
        // A link asked for more than the one layer the sheet named, and the
        // reader has just said yes to the licence all of them are behind.
        if !pendingSharedLayerIDs.isEmpty {
            let wanted = pendingSharedLayerIDs
            pendingSharedLayerIDs = []
            sharedLinkNotice = nil
            for id in wanted {
                guard let row = rows.first(where: { $0.id == id }),
                      row.isAvailable, !row.isVisible else { continue }
                toggleVisibility(id)
            }
            return
        }
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
        // The link's restricted layers are not coming on, and the notice
        // saying so stays: it is now the only thing on screen that says the
        // view is not the one that was sent.
        pendingSharedLayerIDs = []
        // The setup the reader picked still applies, minus what the licence
        // covers. Refusing the licence is not refusing the theme, and leaving
        // the map on the previous setup would read as the pick having failed.
        if let pendingThemeID, let theme = themes.theme(pendingThemeID) {
            self.pendingThemeID = nil
            applyTheme(theme)
        }
    }

    func dismissLicenceSheet() {
        licencePromptedLayerID = nil
        // Dismissed without an answer, so nothing is applied: the setup was
        // waiting on a decision that was not made, and so were the link's
        // layers. The link's notice stays, because they are still off.
        pendingThemeID = nil
        pendingSharedLayerIDs = []
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
    static func basemapLayerID(for type: MapBaseType) -> LayerID? {
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
        // The link's notice describes the view that arrived. Once the reader
        // starts switching layers themselves it describes a map that is no
        // longer on screen, so it goes with the first switch they touch.
        sharedLinkNotice = nil
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
