import GeoCore

/// What the old-growth policy layer draws each mapped status in.
///
/// A separate detail rather than three constants in the renderer because these
/// are the web's declared colours for a status the source itself codes, and the
/// parity fixture checks them: the same polygon has to read the same way on
/// both surfaces, since the colour is how a user tells a confirmed area from a
/// restoration opportunity at a glance.
public struct ForestryStatusColors: Hashable, Sendable {
    public let id: LayerID
    public let confirmedOldGrowth: String
    public let restorationOpportunity: String
    public let unknown: String

    public init(
        id: LayerID,
        confirmedOldGrowth: String,
        restorationOpportunity: String,
        unknown: String
    ) {
        self.id = id
        self.confirmedOldGrowth = confirmedOldGrowth
        self.restorationOpportunity = restorationOpportunity
        self.unknown = unknown
    }
}

extension LayerCatalog {
    public static let forestryStatusColors: [ForestryStatusColors] = [
        ForestryStatusColors(
            id: .oldGrowthPolicy,
            confirmedOldGrowth: "#166534",
            restorationOpportunity: "#d97706",
            unknown: "#64748b"
        )
    ]

    public static func forestryStatusColors(for id: LayerID) -> ForestryStatusColors? {
        forestryStatusColors.first { $0.id == id }
    }
}
