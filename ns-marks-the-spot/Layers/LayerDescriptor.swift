import Foundation

enum LayerID: String, CaseIterable {
    case fletcher
    case nsAerial = "ns-aerial"
    case nsPropertyBoundaries = "nsprd"
    case crownLands = "crown-lands"
    case floodRisk = "flood-risk"
    case waterfalls
}

enum LayerRenderingRole: Equatable {
    case basemap
    case overlay
    case basemapAndOverlay
}

enum LayerOfflinePolicy: Equatable {
    case savedAreaDownloadable
    case viewedCacheOnly
    case onlineOnly
}

enum LayerSourceKind: Equatable {
    case remoteXYZTemplate
    case arcGISMapService
    case arcGISDynamic
}

struct LayerDescriptor: Identifiable, Equatable {
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
