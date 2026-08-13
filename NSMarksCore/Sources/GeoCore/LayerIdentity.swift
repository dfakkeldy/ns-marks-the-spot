import Foundation

/// Every layer the web map offers, keyed by the web's own id string.
///
/// Raw values are the web ids verbatim so share links, parity fixtures and
/// exported JSON need no translation table. Cases are grouped in the order the
/// catalog declares them.
public enum LayerID: String, CaseIterable, Hashable, Sendable, Codable {
    // Map layers
    case fletcher
    case nsAerial = "ns-aerial"
    case nsprd
    case crownLands = "crown-lands"
    case floodRisk = "flood-risk"
    case waterfalls
    case waterFeatures = "water-features"
    case roads
    case buildings
    case placeNames = "place-names"
    case mainRoads = "main-roads"

    // Church county maps (rights pending; catalogued but not rendered)
    case churchInverness = "church-inverness"
    case churchVictoria = "church-victoria"
    case churchRichmond = "church-richmond"
    case churchCapeBreton = "church-cape-breton"

    // Topography
    case contours

    // Flood hazard context
    case publishedRiverFloodZones = "published-river-flood-zones"
    case coastalFloodCurrent = "coastal-flood-current"
    case coastalFlood2050 = "coastal-flood-2050"
    case coastalFlood2100 = "coastal-flood-2100"

    // Environmental health screens
    case arsenicRiskWells = "arsenic-risk-wells"
    case uraniumRiskWells = "uranium-risk-wells"
    case manganeseRiskWells = "manganese-risk-wells"
    case surficialAquifers = "surficial-aquifers"

    // Forestry
    case oldGrowthPolicy = "old-growth-policy"

    // Geology and resources
    case mineralOccurrences = "mineral-occurrences"
    case mineralTenure = "mineral-tenure"
    case abandonedMines = "abandoned-mines"
    case mineralProximityParcels = "mineral-proximity-parcels"

    // Micro-hydro pilot
    case invernessHydroPotential = "inverness-hydro-potential"

    // Municipal zoning
    case zoningInverness = "zoning-inverness"
    case zoningVictoria = "zoning-victoria"
    case zoningRichmond = "zoning-richmond"
    case zoningCumberland = "zoning-cumberland"
    case zoningHalifax = "zoning-halifax"

    // Groundwater
    case nsWellLogs = "ns-well-logs"
}

/// The collapsible groups the layer panel presents.
public enum LayerGroupID: String, CaseIterable, Hashable, Sendable, Codable {
    case mapLayers = "map-layers"
    case topography
    case floodHazard = "flood-hazard"
    case environmentalHealth = "environmental-health"
    case church
    case forestry
    case geologyResources = "geology-resources"
    case groundwater
    case hydroPilot = "hydro-pilot"
    case zoning
}

/// The licence a layer's data is published under.
///
/// This enum — not a hand-maintained id list — is what decides whether a layer
/// sits behind the Province gate. The web also exports a `provinceLayerIds`
/// array, and it is a trap: it omits `place-names` and `main-roads`, both of
/// which are province-restricted. A port that gated on that array would ship
/// two unlicensed Province services.
public enum LayerLicence: String, CaseIterable, Hashable, Sendable {
    case provinceRestricted = "province-restricted"
    case provinceOpen = "province-open"
    case municipalOpen = "municipal-open"
    case municipalNoStatedLicence = "municipal-no-stated-licence"
    case rumseyReference = "rumsey-reference"

    /// Whether using this layer requires an accepted Province licence.
    public var requiresProvinceClearance: Bool {
        self == .provinceRestricted
    }
}

extension LayerLicence: Codable {
    /// Decodes fail-closed: an unrecognised licence string becomes
    /// `.provinceRestricted`.
    ///
    /// The failure this guards against is asymmetric. Treating an open layer as
    /// restricted hides it behind a dialog the user can clear in one tap;
    /// treating a restricted layer as open sends an unlicensed request to a
    /// Province service. So a licence string this build has never seen — a new
    /// value added on the web after this app shipped — resolves to the
    /// conservative side rather than throwing or defaulting to open.
    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = LayerLicence(rawValue: raw) ?? .provinceRestricted
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}
