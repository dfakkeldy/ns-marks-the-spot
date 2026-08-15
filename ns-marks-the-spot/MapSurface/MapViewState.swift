import CoreGraphics
import CryptoKit
import Foundation
import GeoCore
import MapCatalog

nonisolated enum MapBaseType: String, CaseIterable, Identifiable, Sendable {
    case standard = "Standard"
    case satellite = "Satellite"
    case hybrid = "Hybrid"
    case nsAerial = "NS Aerial"

    var id: String { self.rawValue }
}

nonisolated enum TileLayerSource: Equatable, Sendable {
    case tile(URL)
    /// The Fletcher survey: 24 separately georeferenced sheets served from one
    /// base URL, each its own `{z}/{x}/{y}` pyramid under `sheet-NN/`.
    ///
    /// A case of its own rather than 24 `.tile` layers because the app presents
    /// Fletcher as one switch with one opacity slider, and because MapKit asks
    /// an overlay for every tile in view: without knowing the sheet extents,
    /// panning Cape Breton would fire 24 requests per tile and discard 23.
    case fletcherSheets(baseURL: URL)
    /// A catalogued `map-export` layer, drawn from the shared descriptor.
    ///
    /// The id alone, not the address: `TileRequestFactory` turns it into a URL,
    /// and it checks the Province licence before it constructs one. Carrying
    /// the endpoint and the `dynamicLayers` payload here instead — which is
    /// what this enum used to do — put a ready-made address in a value that
    /// nothing had cleared, and meant the app kept its own hand-copied
    /// duplicate of four styling blobs the catalog already held.
    case catalogExport(LayerID)
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
            // `maxNativeZoom` where the source has one, because that is what
            // `maximumZ` means to MapKit: the last zoom it will request a tile
            // for, above which it scales the last real tile up. Leaflet's
            // `maxNativeZoom` is the same idea, and `maxZoom` on both sides is
            // how far the user may keep zooming — 23 for NS Aerial against 19
            // published levels. Passing 23 here would ask the service for four
            // levels of tiles that do not exist.
            maxZoom: descriptor.maxNativeZoom ?? descriptor.maxZoom
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
        case .fletcherSheets(let baseURL):
            // The revision belongs here even though it already appears in every
            // per-sheet path. The path is what gets fetched; this is what gets
            // read back. Without it a re-render at the same host requests new
            // URLs but hits the previous build's entries under the same key, so
            // the map keeps drawing the retired pyramid. `FletcherSourceMigration`
            // does empty the cache, but it is fire-and-forget from launch, and
            // MapKit starts asking for tiles before it finishes — this makes
            // the identity correct rather than the timing lucky.
            configString = "fletcherSheets|\(FletcherSheets.tileRevision)|\(baseURL.absoluteString)"
        case .catalogExport(let layerID):
            // The whole export, not just the id. A catalog edit that restyles
            // `dynamicLayers`, changes `dpi`, or moves the service to another
            // host produces different pixels at the same (z, x, y), and the
            // cache must not answer the new request with the old build's
            // imagery. Reading it from the descriptor rather than storing a
            // copy keeps the two from drifting.
            let descriptor = LayerCatalog.descriptor(for: layerID)
            configString = [
                "catalogExport",
                layerID.rawValue,
                descriptor?.serviceURL?.absoluteString ?? "",
                exportFingerprint(descriptor?.exportOptions),
                exportFingerprint(descriptor?.exportOverlayOptions),
            ].joined(separator: "|")
        }

        let hashed = SHA256.hash(data: Data(configString.utf8))
        let hashString = hashed.compactMap { String(format: "%02x", $0) }.joined()
        return "\(id)_\(hashString)"
    }

    private static func exportFingerprint(_ options: ArcGISExportOptions?) -> String {
        guard let options else { return "" }
        return [
            String(options.transparent),
            options.layers ?? "",
            options.dynamicLayers ?? "",
            options.dpi.map(String.init) ?? "",
        ].joined(separator: "~")
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
            // The shared catalog's `opacity` is the value the web opens a layer
            // at, and `nil` means the layer draws with someone else's styling
            // rather than an opacity of its own — only the derived parcel layer,
            // which is not a tile overlay. 1.0 is the neutral reading for a
            // raster that reached here anyway.
            opacity: descriptor.opacity.map { CGFloat($0) } ?? 1.0,
            isVisible: descriptor.nativeDefaultVisible
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
    var parcelShapes: [ParcelShape] = []
    /// Areal and linear geometry from the viewport feature layers.
    var featureShapes: [FeatureShape] = []
    /// Point geometry from the same layers, drawn as fixed-size dots.
    var featureMarkers: [FeatureMarker] = []
    /// The user's own scans, in panel order. Only the ones actually drawing:
    /// a hidden row is absent rather than present at zero alpha.
    var userMaps: [UserMapDrape] = []
    /// The user's own vector layers, in panel order. Only the ones actually
    /// drawing: a hidden row is absent rather than present at zero alpha.
    var userVectors: [UserVectorDrawing] = []
    var showsUserLocation = false
    var interactionMode: MapInteractionMode = .idle
}
