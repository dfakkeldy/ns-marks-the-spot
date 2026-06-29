import Foundation

nonisolated enum LayerID: String, CaseIterable, Sendable {
    case fletcher
    case nsAerial = "ns-aerial"
    case nsPropertyBoundaries = "nsprd"
    case crownLands = "crown-lands"
    case floodRisk = "flood-risk"
    case waterfalls
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
    case arcGISMapService
    case arcGISDynamic
}

nonisolated struct LayerDescriptor: Identifiable, Equatable, Sendable {
    let id: LayerID
    let name: String
    let sourceKind: LayerSourceKind
    let sourceURL: URL?
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
