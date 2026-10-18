import CoreGraphics
import CryptoKit
import Foundation
import GeoCore
import MapCatalog
import NSDataServices

nonisolated enum MapBaseType: String, CaseIterable, Identifiable, Sendable {
    /// The browser's default ground: the NS Marks Atlas in whichever of Day
    /// or Night the system appearance calls for. First in the picker and the
    /// default, because it is the map the other surface opens on.
    case atlas = "Atlas"
    case atlasDay = "Atlas Day"
    case atlasNight = "Atlas Night"
    /// Modern geography in the colours and lettering of Fletcher's sheets.
    /// An explicit choice on both surfaces, never a default.
    case atlasFletcher = "Atlas Fletcher"
    /// The browser's OpenStreetMap raster, drawn from the same tiles.
    case openStreetMap = "OpenStreetMap"
    case standard = "Standard"
    case satellite = "Satellite"
    case hybrid = "Hybrid"
    case nsAerial = "NS Aerial"
    /// No base map at all, the way the browser reads with its modern map
    /// switched off. Drawn as `BlankBaseOverlay`, since MapKit has no blank
    /// map type of its own.
    case blank = "None"

    var id: String { self.rawValue }

    /// The ground the map opens on, which is the browser's.
    static let defaultGround: MapBaseType = .atlas

    /// The web's `modern` layer: its one base map, in any of its styles. A
    /// shared link and a saved setup name this and nothing else about the
    /// ground, because Apple's maps have no name in the shared vocabulary.
    var isModernMap: Bool {
        switch self {
        case .atlas, .atlasDay, .atlasNight, .atlasFletcher, .openStreetMap: true
        case .standard, .satellite, .hybrid, .nsAerial, .blank: false
        }
    }

    /// Whether this ground is drawn from the rendered Atlas tiles.
    var isAtlas: Bool { atlasStyle(systemPrefersDark: false) != nil }

    /// Whether Apple's own lettering — place names, route shields and
    /// points of interest — belongs over this ground.
    ///
    /// MapKit draws that lettering as a pass of its own, above every overlay
    /// installed at `MKOverlayLevel.aboveRoads`, and `canReplaceMapContent`
    /// does nothing to it: a base-replacing overlay left at that level is
    /// read under Apple's names for the places its own tiles already name.
    /// Apple's grounds keep the lettering, since it is theirs. NS Aerial is
    /// one of them: the Province's imagery drawn over Apple's standard map,
    /// which keeps Apple's names over it the way Hybrid keeps them over
    /// Apple's own imagery — the browser draws nothing over its aerial
    /// imagery, and keeping the names here is the native map's own choice,
    /// the one it made before this rule existed. The Atlas and
    /// OpenStreetMap carry their own lettering in the tiles, and None is
    /// chosen exactly to read a sheet with no modern names over it, so
    /// those go above the lettering and cover it.
    /// `MapController.overlayLevel(for:)` turns this into the level.
    var showsAppleLabels: Bool {
        switch self {
        case .standard, .satellite, .hybrid, .nsAerial: true
        case .atlas, .atlasDay, .atlasNight, .atlasFletcher, .openStreetMap, .blank: false
        }
    }

    /// The Atlas style this ground draws, with the system's appearance
    /// deciding for `.atlas` — the web's `resolveBasemapStyle`.
    func atlasStyle(systemPrefersDark: Bool) -> AtlasRasterStyle? {
        switch self {
        case .atlas: systemPrefersDark ? .night : .day
        case .atlasDay: .day
        case .atlasNight: .night
        case .atlasFletcher: .fletcher
        case .openStreetMap, .standard, .satellite, .hybrid, .nsAerial, .blank: nil
        }
    }

    /// The style a shared link carries for this ground, resolved the way the
    /// browser resolves its own before writing a link: a system-appearance
    /// choice travels as the Day or Night it currently is.
    func shareStyle(systemPrefersDark: Bool) -> MapShareState.BasemapStyle? {
        if self == .openStreetMap { return .osm }
        switch atlasStyle(systemPrefersDark: systemPrefersDark) {
        case .day?: return .day
        case .night?: return .night
        case .fletcher?: return .fletcher
        case nil: return nil
        }
    }

    /// The ground a link's style names. Explicit, as it is on the web: a link
    /// that says Day opens on Day whatever the phone's appearance is.
    init(shareStyle: MapShareState.BasemapStyle) {
        switch shareStyle {
        case .day: self = .atlasDay
        case .night: self = .atlasNight
        case .fletcher: self = .atlasFletcher
        case .osm: self = .openStreetMap
        }
    }

    /// The grounds the picker offers: every case, less the Atlas when the
    /// build has no host to draw it from. A choice that draws nothing is not
    /// offered, and the default falls back to the OpenStreetMap raster the
    /// browser itself falls back to.
    static func available(atlasHosted: Bool) -> [MapBaseType] {
        allCases.filter { atlasHosted || !$0.isAtlas }
    }

    /// The ground to open on, given what this build can draw.
    static func defaultGround(atlasHosted: Bool) -> MapBaseType {
        atlasHosted ? defaultGround : .openStreetMap
    }
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
    /// The rendered Atlas in one style, for the print export. On screen the
    /// Atlas is a base rather than a layer (`AtlasBaseOverlay`); the page
    /// fetches it through the same request as a layer of its own so a lost
    /// square is reported rather than printed as blank ground.
    case atlasRaster(style: AtlasRasterStyle, baseURL: URL)
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
        case .atlasRaster(let style, let baseURL):
            // The revision, for the reason the Fletcher key carries its own.
            configString = "atlasRaster|\(AtlasRaster.tileRevision)|\(style.rawValue)|\(baseURL.absoluteString)"
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

    /// The alpha the layer asks to be rendered at, zero when hidden.
    ///
    /// Zero is also the diff's removal signal: `MapStateDiff.layerMutations`
    /// keys installation on `effectiveAlpha > 0` and emits
    /// `.removeTileOverlay` for a layer that reaches it, so a hidden layer's
    /// overlay is torn down rather than kept transparent. Anyone changing the
    /// layer lifecycle should not rely on an overlay surviving a hide.
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
    var baseMapType: MapBaseType = .defaultGround
    var layers: [MapLayerState] = []
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
    /// The shape currently being drawn, if one is. Not part of any layer until
    /// the user finishes it.
    var vectorDraft: VectorDraftPreview?
    /// The vertices of the selected feature, as draggable handles.
    var vectorHandles: VectorSelectionHandles?
    /// Where the selected feature can be picked up and carried whole.
    var vectorMoveHandle: VectorMoveHandle?
    /// Where the listed parcels are, for the zooms at which their boundaries
    /// are too small to see. Held whatever the zoom; the controller decides
    /// when they are on the map.
    var parcelOverviewMarkers: [ParcelOverviewMarker] = []
    var showsUserLocation = false
    var interactionMode: MapInteractionMode = .idle
}
