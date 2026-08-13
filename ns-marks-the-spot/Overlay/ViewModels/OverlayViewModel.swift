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
nonisolated struct LayerRow: Identifiable, Equatable, Sendable {
    let descriptor: LayerDescriptor
    let installed: MapLayerState?
    /// Whether the Province licence still stands between the user and this
    /// layer's imagery.
    let needsLicence: Bool

    var id: String { descriptor.id.rawValue }
    var name: String { descriptor.name }
    var isAvailable: Bool { installed != nil }
    var isVisible: Bool { installed?.isVisible ?? false }
    var opacity: CGFloat { installed?.opacity ?? 0 }
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
        return Self.presentedDescriptors.map { descriptor in
            LayerRow(
                descriptor: descriptor,
                installed: installed[descriptor.id.rawValue],
                needsLicence: needsDecision && descriptor.requiresProvinceClearance
            )
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

    /// `licenceStore` has no default on purpose. A default would have to pick a
    /// state, and both choices are wrong: an accepting default is a way to get
    /// permission without a user, and a refusing one silently disables the map
    /// for any caller that forgot the argument.
    init(
        controller: MapController,
        licenceStore: ProvinceLicenceStore,
        clearanceBox: LicenceClearanceBox = LicenceClearanceBox()
    ) {
        self.controller = controller
        self.licenceStore = licenceStore
        self.clearanceBox = clearanceBox
        mirrorClearanceIntoBox()
    }

    convenience init(container: AppContainer) {
        self.init(
            controller: container.mapController,
            licenceStore: container.licenceStore,
            clearanceBox: container.clearanceBox
        )
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
    private func mirrorClearanceIntoBox() {
        withObservationTracking {
            clearanceBox.update(licenceStore.clearance)
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.mirrorClearanceIntoBox()
            }
        }
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
        hideRestrictedLayers()
    }

    func dismissLicenceSheet() {
        licencePromptedLayerID = nil
    }

    private func hideRestrictedLayers() {
        for layer in controller.layers {
            guard layer.isVisible,
                  let id = LayerID(rawValue: layer.id),
                  LayerCatalog.descriptor(for: id)?.requiresProvinceClearance == true else {
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
