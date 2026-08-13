import CoreGraphics
import CryptoKit
import Foundation

nonisolated enum MapBaseType: String, CaseIterable, Identifiable, Sendable {
    case standard = "Standard"
    case satellite = "Satellite"
    case hybrid = "Hybrid"
    case nsAerial = "NS Aerial"

    var id: String { self.rawValue }
}

nonisolated enum TileLayerSource: Equatable, Sendable {
    case tile(URL)
    case arcgisMapService(URL, transparent: Bool)
    case arcgisDynamic(URL, dynamicLayers: String?, layerRestrictions: String?)
}

/// The immutable identity of a tile layer: where its tiles come from and how
/// they are cached. Mutable presentation state (opacity, visibility) lives in
/// `MapLayerState`.
nonisolated struct TileLayerConfiguration: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let source: TileLayerSource
    let minZoom: Int
    let maxZoom: Int
    let cacheIdentifier: String

    init(
        id: String,
        name: String,
        source: TileLayerSource,
        minZoom: Int = 0,
        maxZoom: Int = 24,
        cacheIdentifier: String? = nil
    ) {
        self.id = id
        self.name = name
        self.source = source
        self.minZoom = minZoom
        self.maxZoom = maxZoom
        self.cacheIdentifier = cacheIdentifier ?? Self.derivedCacheIdentifier(id: id, source: source)
    }

    init(descriptor: LayerDescriptor, source: TileLayerSource) {
        self.init(
            id: descriptor.id.rawValue,
            name: descriptor.name,
            source: source,
            minZoom: descriptor.minZoom,
            maxZoom: descriptor.maxZoom
        )
    }

    /// Source-aware cache key so tiles fetched from one source configuration
    /// are never served for another. The config-string format is stable across
    /// releases; changing it would orphan existing on-disk caches.
    private static func derivedCacheIdentifier(id: String, source: TileLayerSource) -> String {
        let configString: String
        switch source {
        case .tile(let url):
            configString = "tile|\(url.absoluteString)"
        case .arcgisMapService(let url, let transparent):
            configString = "arcgisMapService|\(url.absoluteString)|\(transparent)"
        case .arcgisDynamic(let url, let dynamicLayers, let layerRestrictions):
            configString = "arcgis|\(url.absoluteString)|\(dynamicLayers ?? "")|\(layerRestrictions ?? "")"
        }

        let hashed = SHA256.hash(data: Data(configString.utf8))
        let hashString = hashed.compactMap { String(format: "%02x", $0) }.joined()
        return "\(id)_\(hashString)"
    }
}

nonisolated struct MapLayerState: Identifiable, Equatable, Sendable {
    let configuration: TileLayerConfiguration
    var opacity: CGFloat
    var isVisible: Bool

    var id: String { configuration.id }
    var name: String { configuration.name }

    /// The alpha actually rendered: a hidden layer stays installed but draws
    /// fully transparent, preserving its tile overlay and cache.
    var effectiveAlpha: CGFloat { isVisible ? opacity : 0 }

    init(configuration: TileLayerConfiguration, opacity: CGFloat = 1.0, isVisible: Bool = true) {
        self.configuration = configuration
        self.opacity = opacity
        self.isVisible = isVisible
    }

    init(descriptor: LayerDescriptor, source: TileLayerSource) {
        self.init(
            configuration: TileLayerConfiguration(descriptor: descriptor, source: source),
            opacity: descriptor.defaultOpacity,
            isVisible: descriptor.defaultVisibility
        )
    }
}

nonisolated enum MapInteractionMode: Equatable, Sendable {
    case idle
    case selectingBounds
}

/// The desired state of the map surface. `MapController` owns the applied
/// copy; transitions are computed by `MapStateDiff` as `[MapMutation]`.
nonisolated struct MapViewState: Equatable, Sendable {
    var baseMapType: MapBaseType = .standard
    var layers: [MapLayerState] = []
    var annotations: [MapAnnotation] = []
    var showsUserLocation = false
    var interactionMode: MapInteractionMode = .idle
}
