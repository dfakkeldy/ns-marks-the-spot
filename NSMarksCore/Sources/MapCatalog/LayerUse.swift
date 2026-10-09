import Foundation
import GeoCore

/// Reversible product locks, independent of display acceptance and attribution.
/// Keep the source metadata so a permission decision can reopen the exact use.
public enum LayerUse {
    public static let propertyRecordsReproductionAllowed = false
    public static let municipalQueryLockReason =
        "Layer locked: permission for app queries, caching and exports has not been confirmed. Use the official source or by-law link."
    public static let provinceReproductionLockReason =
        "Export locked: permission to reproduce Province restricted material or derived boundary coordinates has not been confirmed. Viewing acceptance does not grant redistribution."
    public static let fletcherReproductionLockReason =
        "Export locked: Fletcher viewing and offline use remain available; permission for PDF or other reproduction has not been confirmed."

    public struct Refusal: LocalizedError, Equatable, Sendable {
        public let reason: String
        public var errorDescription: String? { reason }
        public init(reason: String) { self.reason = reason }
    }

    public static func queryLockReason(for layer: LayerDescriptor) -> String? {
        layer.licence == .municipalNoStatedLicence ? municipalQueryLockReason : nil
    }

    public static func reproductionLockReason(for layer: LayerDescriptor) -> String? {
        if layer.id == .fletcher { return fletcherReproductionLockReason }
        if layer.requiresProvinceClearance { return provinceReproductionLockReason }
        return queryLockReason(for: layer)
    }

    public static func requireReproduction(_ ids: [LayerID], includesParcelGeometry: Bool = false) throws {
        if includesParcelGeometry { throw Refusal(reason: provinceReproductionLockReason) }
        for id in ids {
            if let layer = LayerCatalog.descriptor(for: id), let reason = reproductionLockReason(for: layer) {
                throw Refusal(reason: reason)
            }
        }
    }
}
