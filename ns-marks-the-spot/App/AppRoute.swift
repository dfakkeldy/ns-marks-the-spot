import Foundation
import Observation

/// Every modal the map screen can present, routed through one value so only a
/// single sheet exists at a time and future deep links can drive presentation
/// directly instead of toggling per-sheet booleans.
enum SheetRoute: Identifiable, Equatable {
    case poiDetail(PointOfInterest)
    case offlineStorage
    case info
    case taxSaleNotices
    case saveAreaDraft(MapBounds)

    var id: String {
        switch self {
        case .poiDetail(let poi):
            return "poi-\(poi.id)"
        case .offlineStorage:
            return "offline-storage"
        case .info:
            return "info"
        case .taxSaleNotices:
            return "tax-sale-notices"
        case .saveAreaDraft:
            return "save-area-draft"
        }
    }
}

@MainActor
@Observable
final class NavigationModel {
    var activeSheet: SheetRoute?
}
