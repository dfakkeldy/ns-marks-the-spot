import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Observation

/// What one viewport feature layer is doing, as the panel says it.
///
/// The web's vocabulary, with two readings it has no word for. `licenceBlocked`
/// exists because these services are Province-restricted here and the browser
/// asks that question elsewhere; `ready` carries an unreadable count because a
/// layer drawing 400 of 420 features is not the same finding as a layer drawing
/// all 400 there are, and this map must never let the second sentence stand in
/// for the first.
nonisolated enum ViewportLayerStatus: Equatable, Sendable {
    case off
    case licenceBlocked
    case zoomGated(minZoom: Int)
    case loading
    case ready(drawn: Int, unreadable: Int)
    case failed

    var label: String {
        switch self {
        case .off:
            return "Off"
        case .licenceBlocked:
            return "Province licence not accepted"
        case .zoomGated(let minZoom):
            return "Zoom to \(minZoom)+ to load"
        case .loading:
            return "Loading visible area…"
        case .ready(let drawn, let unreadable):
            // The web says "Ready · N loaded". The second clause is this app's,
            // and it is only ever printed when there is something to admit.
            guard unreadable > 0 else { return "Ready · \(drawn) loaded" }
            return "Ready · \(drawn) loaded · \(unreadable) unreadable"
        case .failed:
            return "Source temporarily unavailable"
        }
    }

    var emphasis: LayerRuntimeStatus.Emphasis {
        switch self {
        case .off, .zoomGated: return .quiet
        case .loading: return .working
        case .ready(_, let unreadable): return unreadable > 0 ? .broken : .ready
        case .failed, .licenceBlocked: return .broken
        }
    }
}

/// The viewport-driven vector layers: what is switched on, what the current
/// view holds, and what each layer is doing.
///
/// Separate from `OverlayViewModel` because these layers are not tile overlays
/// and share none of its machinery: they are re-queried per viewport, they can
/// answer partially, and their visibility is state this app keeps rather than
/// something MapKit holds for it.
@MainActor
@Observable
final class ViewportFeatureViewModel {
    /// Only the settled view is queried. A pan fires continuously and every
    /// intermediate frame would be a query for ground the user is already
    /// leaving.
    static let refreshDebounce = Duration.milliseconds(350)

    private(set) var statuses: [LayerID: ViewportLayerStatus] = [:]

    /// The layers this app draws as client-side geometry, in panel order.
    static let layers: [LayerID] = LayerCatalog.all
        .filter { OverlayZIndex.vectorLayers.contains($0.id) }
        .sorted { $0.uiOrder < $1.uiOrder }
        .map(\.id)

    private let controller: MapController
    private let clearanceBox: LicenceClearanceBox
    private let zoning: ZoningFetcher
    private let oldGrowth: OldGrowthPolicyFetcher
    private let wells: WellLogFetcher
    private let resourcePoints: ResourcePointFetcher
    private let mineralProximity: MineralProximityFetcher
    private let hydro: () throws(HydroPotentialPilot.LoadFailure) -> HydroPotentialPilot.Collection

    /// What is switched on. Seeded from the catalog's own default, which is the
    /// web's `defaultVisible` for the same layer.
    private var visibility: [LayerID: Bool] = [:]
    private var opacities: [LayerID: Double] = [:]

    /// Per-layer results, kept apart so one layer failing does not erase
    /// another's features from the map.
    private var shapesByLayer: [LayerID: [FeatureShape]] = [:]
    private var markersByLayer: [LayerID: [FeatureMarker]] = [:]

    @ObservationIgnored private var refreshTasks: [LayerID: Task<Void, Never>] = [:]

    /// Which request each layer is waiting on.
    ///
    /// `Task.isCancelled` is not enough on its own: a cancelled request that
    /// was already past its last suspension point finishes normally, and a
    /// *failing* one finishes through the catch path where there is nothing to
    /// cancel. Either way it would land after the newer request and put a
    /// stale status — `failed` over `ready`, or `failed` over a layer the user
    /// has since switched off — on a layer that is doing something else. The
    /// web guards the same way, comparing `currentRequest` with `requestNumber`
    /// on both the success and the failure path.
    @ObservationIgnored private var requestNumbers: [LayerID: Int] = [:]

    init(
        controller: MapController,
        clearanceBox: LicenceClearanceBox = LicenceClearanceBox(),
        zoning: ZoningFetcher = ZoningFetcher(),
        oldGrowth: OldGrowthPolicyFetcher = OldGrowthPolicyFetcher(),
        wells: WellLogFetcher = WellLogFetcher(),
        resourcePoints: ResourcePointFetcher = ResourcePointFetcher(),
        mineralProximity: MineralProximityFetcher = MineralProximityFetcher(),
        hydro: @escaping () throws(HydroPotentialPilot.LoadFailure) -> HydroPotentialPilot.Collection
            = HydroPotentialPilot.bundledCollection
    ) {
        self.controller = controller
        self.clearanceBox = clearanceBox
        self.zoning = zoning
        self.oldGrowth = oldGrowth
        self.wells = wells
        self.resourcePoints = resourcePoints
        self.mineralProximity = mineralProximity
        self.hydro = hydro

        for id in Self.layers {
            let descriptor = LayerCatalog.descriptor(for: id)
            visibility[id] = descriptor?.nativeDefaultVisible ?? false
            opacities[id] = descriptor?.opacity ?? 1
            statuses[id] = visibility[id] == true ? .loading : .off
        }
    }

    convenience init(container: AppContainer) {
        self.init(
            controller: container.mapController,
            clearanceBox: container.clearanceBox
        )
    }

    // MARK: - Panel state

    func isVisible(_ id: LayerID) -> Bool { visibility[id] ?? false }

    /// The opacity this layer is drawn at: the catalog's, which is the web's.
    func opacity(_ id: LayerID) -> Double { opacities[id] ?? 1 }

    func status(_ id: LayerID) -> ViewportLayerStatus { statuses[id] ?? .off }

    func setVisible(_ id: LayerID, to visible: Bool) {
        guard visibility[id] != visible else { return }
        visibility[id] = visible
        guard visible else {
            // Switched off is switched off: the features go with the switch
            // rather than lingering as a view of ground the user stopped
            // asking about.
            refreshTasks[id]?.cancel()
            refreshTasks[id] = nil
            // Retires the in-flight request as well as its task: a fetch
            // already past its last suspension point still finishes, and
            // without this a failure could arrive and repaint a switched-off
            // layer as broken.
            requestNumbers[id] = (requestNumbers[id] ?? 0) + 1
            shapesByLayer[id] = nil
            markersByLayer[id] = nil
            statuses[id] = .off
            publish()
            return
        }
        refresh(id)
    }

    // No opacity control, deliberately. The web gives one layer a slider —
    // Fletcher — and draws every layer here at the opacity its catalog entry
    // declares, which is part of how the layer reads: the hollow dashed well
    // marker and the 28% policy-area fill are statements about the record, not
    // a preference. A slider would also be half a lie on this surface, because
    // several of these styles never consume the value; and each move would be a
    // fresh query, since the style travels with the drawn feature rather than
    // with a layer object MapKit holds.

    /// Re-queries every visible layer. Call on a settled viewport, and after
    /// the licence answer changes.
    func refreshAll() {
        for id in Self.layers {
            refresh(id)
        }
    }

    // MARK: - Fetching

    private func refresh(_ id: LayerID) {
        refreshTasks[id]?.cancel()
        let request = (requestNumbers[id] ?? 0) + 1
        requestNumbers[id] = request

        guard isVisible(id) else {
            statuses[id] = .off
            return
        }

        let descriptor = LayerCatalog.descriptor(for: id)
        // A bundled layer is not a viewport query. The whole collection ships
        // with the app, so there is no zoom below which it cannot be answered,
        // and the web draws it at every zoom the map allows.
        let minZoom = descriptor?.delivery == .bundledGeoJSON ? 0 : (descriptor?.minZoom ?? 0)
        guard controller.zoomLevel >= minZoom else {
            // Not a failure and not an empty answer: nothing was asked. The
            // features from a closer view are dropped so the map never shows
            // one viewport's findings over another's ground.
            statuses[id] = .zoomGated(minZoom: minZoom)
            clear(id)
            return
        }

        guard let bounds = controller.currentVisibleBounds() else {
            statuses[id] = .loading
            return
        }

        let box = GeoBoundingBox(
            south: bounds.minLatitude,
            west: bounds.minLongitude,
            north: bounds.maxLatitude,
            east: bounds.maxLongitude
        )
        statuses[id] = .loading

        refreshTasks[id] = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: Self.refreshDebounce)
            guard !Task.isCancelled else { return }
            await load(id, in: box, request: request)
        }
    }

    private func clear(_ id: LayerID) {
        guard shapesByLayer[id] != nil || markersByLayer[id] != nil else { return }
        shapesByLayer[id] = nil
        markersByLayer[id] = nil
        publish()
    }

    private func load(_ id: LayerID, in box: GeoBoundingBox, request: Int) async {
        let clearance = clearanceBox.clearance
        let opacity = opacity(id)

        do {
            let found = try await features(for: id, in: box, clearance: clearance, opacity: opacity)
            guard !Task.isCancelled, requestNumbers[id] == request else { return }
            shapesByLayer[id] = found.shapes
            markersByLayer[id] = found.markers
            statuses[id] = .ready(
                drawn: found.reportedCount ?? (found.shapes.count + found.markers.count),
                unreadable: found.unreadable
            )
            publish()
        } catch {
            // The same guard on the failing path: a request the user has
            // already moved past must not report a failure over the answer
            // that replaced it.
            guard requestNumbers[id] == request else { return }
            switch error {
            case .cancelled:
                // The user moved on; the previous view's answer stands until
                // the new one lands.
                return
            case .licenceBlocked:
                statuses[id] = .licenceBlocked
                clear(id)
            case .unavailable:
                // The features already drawn are left alone. A failed refresh
                // is not a finding that the ground went empty, and blanking the
                // layer would state exactly that.
                statuses[id] = .failed
            }
        }
    }

    /// One layer's drawable features, and how much of the answer could not be
    /// read.
    private struct Found {
        var shapes: [FeatureShape] = []
        var markers: [FeatureMarker] = []
        var unreadable = 0
        /// What the chip counts, when the drawn things are not what the layer
        /// is a count of. Only the hydro pilot sets it: it draws 1,213 stream
        /// reaches across the 13 watersheds it screened, and the web reports
        /// the watersheds, because "1,213 loaded" would read as 1,213 sites.
        var reportedCount: Int?
    }

    private enum FetchFailure: Error {
        case cancelled
        case licenceBlocked
        case unavailable
    }

    private func features(
        for id: LayerID,
        in box: GeoBoundingBox,
        clearance: ProvinceLicenceClearance,
        opacity: Double
    ) async throws(FetchFailure) -> Found {
        switch id {
        case .oldGrowthPolicy:
            return try await oldGrowthFeatures(in: box, clearance: clearance, opacity: opacity)
        case .zoningInverness, .zoningVictoria, .zoningRichmond,
            .zoningCumberland, .zoningHalifax:
            return try await zoningFeatures(id, in: box, clearance: clearance, opacity: opacity)
        case .mineralProximityParcels:
            return try await mineralProximityFeatures(in: box, clearance: clearance)
        case .nsWellLogs:
            return try await wellFeatures(in: box, clearance: clearance)
        case .mineralOccurrences, .abandonedMines:
            return try await resourcePointFeatures(
                id, in: box, clearance: clearance, opacity: opacity
            )
        case .invernessHydroPotential:
            return try hydroFeatures()
        default:
            return Found()
        }
    }

    private func zoningFeatures(
        _ id: LayerID,
        in box: GeoBoundingBox,
        clearance: ProvinceLicenceClearance,
        opacity: Double
    ) async throws(FetchFailure) -> Found {
        guard let detail = LayerCatalog.zoningDetail(for: id) else { throw .unavailable }
        let found: (zones: [ZoningOverlay.Zone], unreadable: Int)
        do {
            found = try await zoning.zones(for: id, bounds: box, clearance: clearance)
        } catch {
            throw Self.translate(error)
        }

        let style = VectorFeatureStyles.zoning(detail, opacity: opacity)
        return Found(
            shapes: found.zones.enumerated().map { index, zone in
                FeatureShape(
                    id: "\(id.rawValue)#\(index)",
                    layer: id,
                    geometry: zone.geometry,
                    style: style,
                    title: zone.description.label,
                    subtitle: zone.description.planArea
                )
            },
            unreadable: found.unreadable
        )
    }

    private func oldGrowthFeatures(
        in box: GeoBoundingBox,
        clearance: ProvinceLicenceClearance,
        opacity: Double
    ) async throws(FetchFailure) -> Found {
        let areas: [OldGrowthPolicyOverlay.Area]
        do {
            areas = try await oldGrowth.areas(in: box, clearance: clearance)
        } catch .refused(.licenceNotAccepted) {
            throw .licenceBlocked
        } catch .cancelled {
            throw .cancelled
        } catch {
            throw .unavailable
        }

        let colors = LayerCatalog.forestryStatusColors(for: .oldGrowthPolicy)
        guard let colors else { throw .unavailable }

        return Found(
            shapes: areas.enumerated().map { index, area in
                FeatureShape(
                    id: "\(LayerID.oldGrowthPolicy.rawValue)#\(index)",
                    layer: .oldGrowthPolicy,
                    geometry: area.geometry,
                    style: VectorFeatureStyles.oldGrowth(
                        area.status, colors: colors, opacity: opacity
                    ),
                    title: area.status.label,
                    subtitle: area.selectionMethod
                )
            }
        )
    }

    private func mineralProximityFeatures(
        in box: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) async throws(FetchFailure) -> Found {
        let result: MineralProximityOverlay.Result
        do {
            result = try await mineralProximity.parcels(in: box, clearance: clearance)
        } catch .refused(.licenceNotAccepted) {
            throw .licenceBlocked
        } catch .cancelled {
            throw .cancelled
        } catch {
            throw .unavailable
        }

        return Found(
            shapes: result.parcels.map { parcel in
                FeatureShape(
                    id: "\(LayerID.mineralProximityParcels.rawValue)#\(parcel.pid)",
                    layer: .mineralProximityParcels,
                    geometry: parcel.geometry,
                    style: VectorFeatureStyles.mineralProximityParcel,
                    title: "PID \(parcel.pid)",
                    subtitle: "Within 1 km of a recorded mineral occurrence"
                )
            },
            // Both halves of the derivation, added rather than reported apart:
            // either one means the viewport was not fully answered, which is
            // the single fact the chip has room to say.
            unreadable: result.unreadableOccurrences + result.unreadableParcels
        )
    }

    private func wellFeatures(
        in box: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) async throws(FetchFailure) -> Found {
        let found: (records: [WellLogOverlay.Record], unreadable: Int)
        do {
            // Surveyed only, which is what the web asks for and what this
            // layer's own caveat tells the user it is showing. A ±8 km record
            // is an area report, and drawing it as a dot at a coordinate while
            // the panel says "surveyed ±50 m wells only" would be the map
            // contradicting its own provenance line.
            found = try await wells.wells(in: box, filter: .surveyed, clearance: clearance)
        } catch {
            throw Self.translate(error)
        }

        return Found(
            markers: found.records.enumerated().map { index, record in
                FeatureMarker(
                    id: "\(LayerID.nsWellLogs.rawValue)#\(index)",
                    layer: .nsWellLogs,
                    latitude: record.location.lat,
                    longitude: record.location.lng,
                    style: VectorFeatureStyles.wellLog(record.accuracy),
                    title: record.wellNumber ?? "Well log",
                    subtitle: record.accuracyStatement
                )
            },
            unreadable: found.unreadable
        )
    }

    private func resourcePointFeatures(
        _ id: LayerID,
        in box: GeoBoundingBox,
        clearance: ProvinceLicenceClearance,
        opacity: Double
    ) async throws(FetchFailure) -> Found {
        guard let detail = LayerCatalog.resourcePointDetail(for: id) else { throw .unavailable }
        let found: (records: [ResourcePointOverlay.Record], unreadable: Int)
        do {
            found = try await resourcePoints.points(for: id, in: box, clearance: clearance)
        } catch {
            throw Self.translate(error)
        }

        let style = VectorFeatureStyles.resourcePoint(detail, opacity: opacity)
        return Found(
            markers: found.records.enumerated().map { index, record in
                FeatureMarker(
                    id: "\(id.rawValue)#\(index)",
                    layer: id,
                    latitude: record.location.lat,
                    longitude: record.location.lng,
                    style: style,
                    title: record.label,
                    subtitle: nil
                )
            },
            unreadable: found.unreadable
        )
    }

    /// The bundled pilot, which is read from the app rather than from a
    /// service, so it is never filtered to the viewport: the whole dataset is
    /// one screening study of one county.
    private func hydroFeatures() throws(FetchFailure) -> Found {
        let collection: HydroPotentialPilot.Collection
        do {
            collection = try hydro()
        } catch {
            // A bundled file this build cannot read is a packaging fault, not
            // a live-data condition, but the panel has the same one line to say
            // it in.
            throw .unavailable
        }

        return Found(
            shapes: collection.reaches.enumerated().map { index, reach in
                FeatureShape(
                    id: "\(LayerID.invernessHydroPotential.rawValue)#\(index)",
                    layer: .invernessHydroPotential,
                    geometry: reach.geometry,
                    style: VectorFeatureStyles.hydroReach(
                        reach.potentialClass, upstreamAreaKm2: reach.upstreamAreaKm2
                    ),
                    title: reach.watershedName,
                    subtitle: reach.potentialClass.label
                )
            },
            reportedCount: collection.metadata.watershedCount
        )
    }

    private static func translate(_ failure: FeatureOverlayFailure) -> FetchFailure {
        switch failure {
        case .refused(.licenceNotAccepted): .licenceBlocked
        case .cancelled: .cancelled
        default: .unavailable
        }
    }

    // MARK: - Publishing

    /// Hands the map every layer's features at once, in panel order so equal
    /// z-indexes break the way the catalog reads.
    private func publish() {
        controller.setFeatureShapes(Self.layers.flatMap { shapesByLayer[$0] ?? [] })
        controller.setFeatureMarkers(Self.layers.flatMap { markersByLayer[$0] ?? [] })
    }
}
