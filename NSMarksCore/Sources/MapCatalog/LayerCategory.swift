import Foundation
import GeoCore

/// The sections the layer panel presents, in the order it presents them.
///
/// Not the same thing as `LayerGroupID`. That is an artifact of how the web
/// splits its catalog arrays — `provinceLayerCatalog`, `zoningLayerCatalog` and
/// the rest — and no reader ever sees it. These are what the panel actually
/// draws headings for, so these are what the native panel has to reproduce.
///
/// Two of them hold no catalogue layer at all. `taxSale` carries the tax-sale
/// switch and the record modes; `myMaps` carries the reader's own imports. They
/// are cases here rather than special-cased in the view because they are
/// sections of the same list, and leaving them out would put those controls
/// somewhere the browser does not.
public enum LayerCategoryID: String, CaseIterable, Hashable, Sendable, Codable {
    case backgroundMaps = "background-maps"
    case landProperty = "land-property"
    case roadsPlaces = "roads-places"
    case waterTerrain = "water-terrain"
    case environmentHazards = "environment-hazards"
    case forestryEcology = "forestry-ecology"
    case geologyResources = "geology-resources"
    case historicalMaps = "historical-maps"
    case taxSale = "tax-sale"
    case myMaps = "my-maps"
}

/// One section's heading and the line under it, in the web's words.
public struct LayerCategory: Identifiable, Hashable, Sendable {
    public let id: LayerCategoryID
    public let name: String
    public let description: String

    public init(id: LayerCategoryID, name: String, description: String) {
        self.id = id
        self.name = name
        self.description = description
    }
}

extension LayerCategory {
    /// Every section, in panel order.
    public static let all: [LayerCategory] = [
        LayerCategory(
            id: .backgroundMaps,
            name: "Background Maps",
            description: "Choose the map beneath your overlays."
        ),
        LayerCategory(
            id: .landProperty,
            name: "Land & Property",
            description: "Property, Crown land, buildings, and zoning."
        ),
        LayerCategory(
            id: .roadsPlaces,
            name: "Roads & Places",
            description: "Roads, trails, place names, and reference routes."
        ),
        LayerCategory(
            id: .waterTerrain,
            name: "Water & Terrain",
            description:
                "Water, watersheds, waterfalls, contours, and terrain projects."
        ),
        LayerCategory(
            id: .environmentHazards,
            name: "Environment & Hazards",
            description: "Flood, health, aquifer, and well information."
        ),
        LayerCategory(
            id: .forestryEcology,
            name: "Forestry & Ecology",
            description: "Forestry policy and ecological information."
        ),
        LayerCategory(
            id: .geologyResources,
            name: "Geology & Resources",
            description: "Minerals, tenure, mines, and resource context."
        ),
        LayerCategory(
            id: .historicalMaps,
            name: "Historical Maps",
            description: "Fletcher and Church historical map collections."
        ),
        LayerCategory(
            id: .taxSale,
            name: "Tax Sale",
            description: "Optional current and historical tax-sale research."
        ),
        LayerCategory(
            id: .myMaps,
            name: "My Maps",
            description: "Import, register, and control your own maps and data."
        ),
    ]

    public static func named(_ id: LayerCategoryID) -> LayerCategory {
        // A total map over a `CaseIterable` enum: `all` covers every case, and
        // the parity suite asserts it, so a lookup cannot come back empty.
        all.first { $0.id == id }!
    }
}

extension LayerID {
    /// Which section of the panel this layer is shown under.
    ///
    /// Written out case by case rather than derived from `group`, because the
    /// two taxonomies genuinely disagree: the well logs are catalogued with
    /// groundwater and shown under Environment & Hazards, and contours are
    /// catalogued under topography and shown under Water & Terrain. Deriving
    /// one from the other would put layers under headings the browser does not.
    public var category: LayerCategoryID {
        switch self {
        case .nsAerial: .backgroundMaps

        case .nsprd, .crownLands, .buildings,
             .zoningInverness, .zoningVictoria, .zoningRichmond,
             .zoningCumberland, .zoningHalifax: .landProperty

        case .roads, .mainRoads, .placeNames: .roadsPlaces

        case .waterfalls, .waterFeatures, .contours,
             .invernessHydroPotential: .waterTerrain

        case .floodRisk, .publishedRiverFloodZones, .coastalFloodCurrent,
             .coastalFlood2050, .coastalFlood2100, .arsenicRiskWells,
             .uraniumRiskWells, .manganeseRiskWells, .surficialAquifers,
             .nsWellLogs: .environmentHazards

        case .oldGrowthPolicy: .forestryEcology

        case .mineralOccurrences, .mineralTenure, .abandonedMines,
             .mineralProximityParcels: .geologyResources

        case .fletcher, .churchInverness, .churchVictoria, .churchRichmond,
             .churchCapeBreton: .historicalMaps
        }
    }
}
