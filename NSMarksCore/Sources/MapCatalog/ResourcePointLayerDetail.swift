import Foundation
import GeoCore

/// What a mineral point layer needs beyond the fields every layer has.
///
/// Two layers, one shape: both are provincial point inventories on the same
/// ArcGIS Online organisation, keyed by `geo_id`, and both are read out as a
/// name plus one qualifier — the commodities for an occurrence, the hazard
/// degree for a mine opening.
public struct ResourcePointLayerDetail: Hashable, Sendable {
    public let id: LayerID
    public let outFields: [String]
    /// Hex, as the web writes it, so the two surfaces draw the same marker.
    public let markerColor: String

    public init(id: LayerID, outFields: [String], markerColor: String) {
        self.id = id
        self.outFields = outFields
        self.markerColor = markerColor
    }
}

extension LayerCatalog {
    public static let resourcePointDetail: [ResourcePointLayerDetail] = [
        ResourcePointLayerDetail(
            id: .mineralOccurrences,
            outFields: ["geo_id", "Name", "Occ_type", "Status", "Comm_prim", "Comm_list"],
            markerColor: "#9b5de5"
        ),
        ResourcePointLayerDetail(
            id: .abandonedMines,
            outFields: ["geo_id", "ShaftID", "Name", "Opening_ty", "Degree_Haz", "Protection"],
            markerColor: "#d1495b"
        ),
    ]

    public static func resourcePointDetail(for id: LayerID) -> ResourcePointLayerDetail? {
        resourcePointDetail.first { $0.id == id }
    }
}
