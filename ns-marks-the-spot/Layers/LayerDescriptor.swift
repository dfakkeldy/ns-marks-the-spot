import Foundation

nonisolated enum LayerID: String, CaseIterable, Sendable {
    case fletcher
    case nsAerial = "ns-aerial"
    case nsPropertyBoundaries = "nsprd"
    case crownLands = "crown-lands"
    case floodRisk = "flood-risk"
    case waterfalls
    case churchInverness = "church-inverness"
    case churchVictoria = "church-victoria"
    case churchRichmond = "church-richmond"
    case churchCapeBreton = "church-cape-breton"
}

nonisolated enum LayerRenderingRole: Equatable, Sendable {
    case basemap
    case overlay
    case basemapAndOverlay
}

nonisolated enum LayerOfflinePolicy: Equatable, Sendable {
    case savedAreaDownloadable
    case viewedCacheOnly
    case onlineOnly
}

nonisolated enum LayerSourceKind: Equatable, Sendable {
    case remoteXYZTemplate
    /// One base URL over 24 per-sheet `{z}/{x}/{y}` pyramids. See
    /// `TileLayerSource.fletcherSheets`.
    case fletcherSheetPyramid
    case arcGISMapService
    case arcGISDynamic
}

nonisolated struct LayerDescriptor: Identifiable, Equatable, Sendable {
    let id: LayerID
    let name: String
    let sourceKind: LayerSourceKind
    /// `var` only so a test can install a descriptor at a base URL of its own.
    /// The catalog's own entries are still immutable: this is a value type and
    /// `LayerCatalog.all` hands out copies, so nothing shared can be reached
    /// through it.
    var sourceURL: URL?
    let defaultOpacity: CGFloat
    let defaultVisibility: Bool
    let minZoom: Int
    let maxZoom: Int
    let renderingRole: LayerRenderingRole
    let offlinePolicy: LayerOfflinePolicy
    let cacheKey: String
    let attribution: LayerAttribution
    let userCaveat: String?
}
