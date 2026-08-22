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

    /// Which well records the layer asks for.
    ///
    /// Surveyed is the honest default made explicit, as it is on the web: those
    /// are the only band located tightly enough to read as a point, so the
    /// coarser records are opt-in. The filter goes into the service query, so
    /// records the user has not asked for are never transferred.
    private(set) var wellAccuracyFilter: WellLogOverlay.AccuracyFilter = .surveyed

    /// The tapped feature's card, or nil for nothing selected.
    ///
    /// Held here rather than in the view because it has to die with its
    /// evidence. A card is a claim about a feature on the map, and the map
    /// takes features away without being asked — a layer switched off, a
    /// viewport reloaded, an accuracy filter narrowed. Kept in the view, it
    /// would go on describing a well the user can no longer see, off a layer
    /// they have turned off.
    private(set) var selection: FeatureSelection?

    struct FeatureSelection: Identifiable, Equatable, Sendable {
        /// Where on the ground the card is about.
        ///
        /// Carried so a redraw can tell one feature from another that happens
        /// to say the same thing. A service-backed layer numbers its features
        /// by their position in the answer, and a zoning description is not
        /// unique — two polygons of the same zone in the same plan area
        /// produce identical cards — so id and text together can still name a
        /// different piece of ground after a pan.
        enum Anchor: Equatable, Sendable {
            case shape(GeoJSONGeometry)
            case marker(latitude: Double, longitude: Double)
        }

        let id: String
        let layer: LayerID
        let callout: FeatureCallout
        let anchor: Anchor
    }

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

    func select(_ selection: FeatureSelection?) { self.selection = selection }

    func clearSelection() { selection = nil }

    /// Drops a selection whose feature is no longer drawn.
    ///
    /// Called wherever the published features change. The card survives only
    /// while a feature is drawn with the same id, the same content *and* the
    /// same geometry.
    ///
    /// All three, because a service-backed layer numbers its features by their
    /// position in the answer: after a pan, `#3` is a different zone. Id and
    /// text alone are not enough either — two polygons of one zone in one plan
    /// area produce identical cards, so the ground itself is what settles
    /// whether this is still the feature the user tapped. Losing the card is
    /// the safe outcome; keeping one pinned to different ground is not.
    private func invalidateSelectionIfGone() {
        guard let selection else { return }
        let stillDrawn =
            shapesByLayer[selection.layer]?.contains {
                $0.id == selection.id && $0.callout == selection.callout
                    && selection.anchor == .shape($0.geometry)
            } == true
            || markersByLayer[selection.layer]?.contains {
                $0.id == selection.id && $0.callout == selection.callout
                    && selection.anchor
                        == .marker(latitude: $0.latitude, longitude: $0.longitude)
            } == true
        if !stillDrawn { self.selection = nil }
    }

    func setWellAccuracyFilter(_ filter: WellLogOverlay.AccuracyFilter) {
        guard wellAccuracyFilter != filter else { return }
        wellAccuracyFilter = filter
        // The features on the map are the answer to the old question. Cleared
        // rather than left up: a map still showing approximate wells after the
        // user narrowed to surveyed ones would be answering a question they
        // withdrew.
        clear(.nsWellLogs)
        refresh(.nsWellLogs)
    }

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
                    printStyle: PrintVectorFeatureStyles.zoning,
                    title: zone.description.label,
                    subtitle: zone.description.planArea,
                    callout: FeatureCallouts.zoning(
                        zone.description, detail: detail, layerName: Self.name(of: id)
                    )
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
                    printStyle: PrintVectorFeatureStyles.oldGrowth(area.status),
                    title: area.status.label,
                    subtitle: area.selectionMethod,
                    callout: FeatureCallouts.oldGrowth(
                        area,
                        layerName: Self.name(of: .oldGrowthPolicy),
                        sourceURL: Self.sourceURL(of: .oldGrowthPolicy)
                    )
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
                    printStyle: PrintVectorFeatureStyles.mineralProximityParcel,
                    title: "PID \(parcel.pid)",
                    subtitle: "Within 1 km of a recorded mineral occurrence",
                    callout: FeatureCallouts.mineralProximity(
                        pid: parcel.pid,
                        distanceKm: 1,
                        layerName: Self.name(of: .mineralProximityParcels),
                        sourceURL: Self.sourceURL(of: .mineralProximityParcels)
                    )
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
            // Pushed into the query rather than filtered here, as the web
            // does: a record the user has not asked to see is never fetched.
            // A ±8 km record is an area report rather than a location, which
            // is why asking for one is a deliberate act and why it is drawn
            // hollow when it arrives.
            found = try await wells.wells(
                in: box, filter: wellAccuracyFilter, clearance: clearance
            )
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
                    printStyle: PrintVectorFeatureStyles.wellLog(record.accuracy),
                    title: record.wellNumber ?? "Well log",
                    subtitle: record.accuracyStatement,
                    callout: FeatureCallouts.wellLog(
                        record,
                        // The web's eyebrow rather than the panel's row name:
                        // the published dataset number is what makes a depth
                        // checkable against the source, and "Water well logs"
                        // alone does not say which table it came from.
                        layerName: "NS well logs · DP ME 430",
                        sourceURL: Self.sourceURL(of: .nsWellLogs)
                    )
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

        // The layer's own sentence, not one written for the card: the panel
        // already qualifies this inventory, and a tapped point has to be
        // qualified the same way or the map says two things about one source.
        let caveat = LayerCatalog.descriptor(for: id)?.caveat ?? ""
        let style = VectorFeatureStyles.resourcePoint(detail, opacity: opacity)
        return Found(
            markers: found.records.enumerated().map { index, record in
                FeatureMarker(
                    id: "\(id.rawValue)#\(index)",
                    layer: id,
                    latitude: record.location.lat,
                    longitude: record.location.lng,
                    style: style,
                    printStyle: PrintVectorFeatureStyles.resourcePoint(detail),
                    title: record.label,
                    subtitle: nil,
                    callout: FeatureCallouts.resourcePoint(
                        record,
                        layer: id,
                        layerName: Self.name(of: id),
                        caveat: caveat,
                        sourceURL: Self.sourceURL(of: id)
                    )
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
                    printStyle: PrintVectorFeatureStyles.hydroReach(reach.potentialClass),
                    title: reach.watershedName,
                    subtitle: reach.potentialClass.label,
                    callout: FeatureCallouts.hydroReach(
                        reach,
                        metadata: collection.metadata,
                        // "Point-screen pilot" rather than the row's name: the
                        // qualifier is what stops a kW figure being read as a
                        // survey of the stream.
                        layerName: "Inverness point-screen pilot"
                    )
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

    // MARK: - Identify

    /// What the feature under a tap says about itself, or nil for a tap that
    /// reached none.
    ///
    /// Topmost first, so the answer is the feature the user can see they are
    /// pointing at: highest draw order wins, and among equals the one the
    /// catalog lists later, which is the one drawn over the other.
    ///
    /// Markers are tested before shapes because a dot is drawn over the areas
    /// beneath it and is the smaller target of the two — a well inside a zoning
    /// polygon has to be reachable.
    func callout(
        at point: GeoPoint, toleranceDegrees tolerance: Double
    ) -> FeatureSelection? {
        let markers = Self.layers.flatMap { markersByLayer[$0] ?? [] }
        var nearest: (marker: FeatureMarker, distance: Double)?
        for marker in markers where marker.callout != nil {
            let distance = GeometryHitTest.distance(
                point, GeoPoint(lat: marker.latitude, lng: marker.longitude)
            )
            guard distance <= tolerance else { continue }
            // Nearest rather than last: dots overlap at low zoom, and the one
            // whose centre the finger is closest to is the one being aimed at.
            if nearest == nil || distance < nearest!.distance {
                nearest = (marker, distance)
            }
        }
        if let nearest, let callout = nearest.marker.callout {
            return FeatureSelection(
                id: nearest.marker.id, layer: nearest.marker.layer, callout: callout,
                anchor: .marker(
                    latitude: nearest.marker.latitude, longitude: nearest.marker.longitude
                )
            )
        }

        let shapes = Self.layers
            .flatMap { shapesByLayer[$0] ?? [] }
            .enumerated()
            .sorted { ($0.element.zIndex, $0.offset) > ($1.element.zIndex, $1.offset) }
        for shape in shapes.map(\.element) {
            guard let callout = shape.callout else { continue }
            if GeometryHitTest.hits(shape.geometry, at: point, toleranceDegrees: tolerance) {
                return FeatureSelection(
                    id: shape.id, layer: shape.layer, callout: callout,
                    anchor: .shape(shape.geometry)
                )
            }
        }
        return nil
    }

    /// The card for a marker the map selected, which is how a dot answers: a
    /// tap on an annotation reaches MapKit's selection rather than the map's
    /// own tap.
    func callout(annotationID: String) -> FeatureSelection? {
        for marker in Self.layers.flatMap({ markersByLayer[$0] ?? [] })
        where marker.id == annotationID {
            guard let callout = marker.callout else { return nil }
            return FeatureSelection(
                id: marker.id, layer: marker.layer, callout: callout,
                anchor: .marker(latitude: marker.latitude, longitude: marker.longitude)
            )
        }
        return nil
    }

    /// The layer's catalog name, which is what the panel calls it — so a card
    /// and the switch that turned it on say the same thing.
    private static func name(of id: LayerID) -> String {
        LayerCatalog.descriptor(for: id)?.name ?? id.rawValue
    }

    private static func sourceURL(of id: LayerID) -> URL? {
        LayerCatalog.descriptor(for: id)?.sourceURL
    }

    // MARK: - Publishing

    /// Hands the map every layer's features at once, in panel order so equal
    /// z-indexes break the way the catalog reads.
    private func publish() {
        invalidateSelectionIfGone()
        controller.setFeatureShapes(Self.layers.flatMap { shapesByLayer[$0] ?? [] })
        controller.setFeatureMarkers(Self.layers.flatMap { markersByLayer[$0] ?? [] })
    }
}
