import Foundation

enum MapLayerType: Sendable {
    case tile(URL)
    case arcgisDynamic(URL, dynamicLayers: String?, layerRestrictions: String?)
    case vector([String])
}

/// A map overlay layer. Marked `@MainActor` because its mutable display state
/// (`opacity`, `isVisible`) is driven entirely by the UI. The immutable
/// configuration (`id`, `name`, `type`, zoom bounds, `cacheIdentifier`) is
/// `nonisolated` so MapKit's off-main tile-loading path can read it without
/// hopping to the main actor.
@MainActor
protocol MapLayer: AnyObject, Identifiable {
    nonisolated var id: String { get }
    nonisolated var name: String { get }
    nonisolated var type: MapLayerType { get }
    var opacity: CGFloat { get set }
    var isVisible: Bool { get set }
    nonisolated var minZoom: Int { get }
    nonisolated var maxZoom: Int { get }

    nonisolated var cacheIdentifier: String { get }
}
