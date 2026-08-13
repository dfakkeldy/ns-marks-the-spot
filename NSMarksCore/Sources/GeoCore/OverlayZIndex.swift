import Foundation

/// Which stacking space a z-index belongs to.
///
/// Leaflet has two, and numbers in one never compare against numbers in the
/// other. Everything inside the tile pane — the raster layers, plus the two
/// panes the web mounts with `tilePane` as their parent (`user-maps-pane` at
/// 160 and `old-growth-policy-pane` at 190) — is ordered within a stacking
/// context that is itself only at 200 in the map pane. The vector panes are
/// siblings of that context, ordered against each other in map-pane space.
///
/// This distinction is preserved rather than flattened because of one specific
/// collision: `place-names` is 300 in tile space and `zoningPane` is 300 in
/// pane space. `mapPanes.ts` carries a comment saying labels "sit on top of
/// everything", which is true only within tile space — on the web, labels
/// actually render beneath zoning, wells and parcels, because the whole tile
/// pane sits at 200. Flattening both into one number line would make that
/// comment look authoritative and silently promote place-name labels above
/// zoning fills when the vector layers land in Phase 6.
public enum OverlayZSpace: Hashable, Sendable {
    /// Raster tile layers, ordered by `zIndex` within the tile pane.
    case tile
    /// Vector panes, ordered as children of the map pane.
    case pane
}

/// The z-order contract, transcribed from `web/src/components/mapPanes.ts` and
/// the `resourceExportZIndex` helper in `MapCanvas.tsx`.
///
/// Rendering order is a product decision recorded in numbers: which layer wins
/// when two cover the same ground. It is transcribed rather than re-derived so
/// the two surfaces cannot drift into disagreeing about what is readable.
public enum OverlayZIndex {
    // MARK: - Tile space

    /// Province raster layers. Verbatim from `PROVINCE_LAYER_Z_INDEXES`.
    public static let provinceLayers: [LayerID: Int] = [
        .nsAerial: 150,
        .contours: 180,
        .nsprd: 200,
        .waterFeatures: 210,
        .crownLands: 220,
        .buildings: 225,
        .floodRisk: 230,
        .roads: 235,
        // Above the full roads layer, which it is meant to be read instead of,
        // and above water so a filtered road stays visible where it crosses a
        // river.
        .mainRoads: 240,
        .waterfalls: 250,
        // Labels sit on top of everything: a name hidden under a parcel edge is
        // a name that cannot do the job this layer exists for. (True within
        // tile space only — see `OverlayZSpace`.)
        .placeNames: 300,
    ]

    /// The historical raster is context: it sits above the modern/aerial
    /// basemap and below user maps and every evidence/data overlay.
    public static let fletcher = 155

    /// User-loaded rasters sit directly above the aerial imagery (150) and
    /// below every data overlay (environmental health 165, contours 180,
    /// parcels 200, roads 235, waterfalls 250) so parcel lines and roads stay
    /// readable on top of a draped scan. The scan is context, not the subject
    /// of inspection.
    ///
    /// Tile space, not pane space: the web mounts this pane with `tilePane` as
    /// its parent.
    public static let userMaps = 160

    /// Environmental-health risk layers classify every bedrock unit, so they
    /// render as a wall-to-wall wash rather than a sparse overlay. They sit
    /// just above the aerial imagery and below contours so parcels, roads, and
    /// water stay readable on top of them.
    public static let environmentalHealth = 165

    /// Old-growth policy polygons are forestry context, not parcel evidence.
    /// They sit above contours but below NSPRD, water, roads, and selected
    /// parcels so those more precise reference layers remain legible.
    ///
    /// Tile space, not pane space: the web mounts this pane with `tilePane` as
    /// its parent. Read as a map-pane number, 190 would put forestry beneath
    /// the basemap.
    public static let oldGrowthPolicy = 190

    /// Resource and published-flood exports default here.
    public static let resourceExportDefault = 225

    /// Coastal flood projections sit one above the resource default so they
    /// read over it.
    public static let coastalFloodExport = 228

    // MARK: - Pane space

    /// Zoning is a broad thematic fill, so it sits above the Province raster
    /// layers but below the parcel-specific overlays a user is actively
    /// inspecting.
    public static let zoning = 300

    public static let mineralProximity = 390

    /// Well points sit above the default overlay pane (400) so they stay
    /// readable over area overlays, and below the established-parcel pane so
    /// tax-sale selection remains the visual authority.
    public static let wellLog = 405

    public static let establishedParcel = 420

    /// User vector data ("Your data") is annotation the user placed
    /// deliberately, so it renders above every data overlay including selected
    /// parcels (420) — but below an active measurement (430), which is always
    /// the immediate focus.
    public static let userVector = 425

    /// Active measurements are the user's current focus, so they render above
    /// every parcel overlay. Kept below 500 where the map's HTML controls sit.
    public static let measure = 430

    /// Georeferencing control points sit above every data overlay — the app's
    /// own panes top out at `measure` (430) — and above Leaflet's built-in
    /// marker (600) and tooltip (650) panes, because a control point buried
    /// under a parcel marker cannot be clicked or dragged. Deliberately BELOW
    /// Leaflet's popup pane (700): a parcel-identify popup should still read on
    /// top, and matching 700 exactly would leave the order to DOM insertion.
    public static let georeference = 660

    /// Leaflet's own tile pane, recorded for reference only.
    public static let leafletTilePane = 200
    /// Leaflet's own overlay pane, recorded for reference only.
    public static let leafletOverlayPane = 400

    // MARK: - Lookup

    /// The space a layer's z-index lives in.
    ///
    /// Everything Phase 1 renders is a server-rendered raster and therefore
    /// `.tile`. The layers that draw client-side geometry — zoning, mineral
    /// proximity, well logs, and the three point layers — are `.pane`, and
    /// arrive in Phase 6.
    public static func space(of id: LayerID) -> OverlayZSpace {
        switch id {
        case .zoningInverness, .zoningVictoria, .zoningRichmond,
            .zoningCumberland, .zoningHalifax,
            .mineralProximityParcels, .nsWellLogs,
            .mineralOccurrences, .abandonedMines, .invernessHydroPotential:
            return .pane
        default:
            return .tile
        }
    }

    /// Z-index for a vector layer in map-pane space, or `nil` if the layer is
    /// not a vector layer.
    public static func paneZIndex(for id: LayerID) -> Int? {
        switch id {
        case .zoningInverness, .zoningVictoria, .zoningRichmond,
            .zoningCumberland, .zoningHalifax:
            return zoning
        case .mineralProximityParcels:
            return mineralProximity
        case .nsWellLogs:
            return wellLog
        // The point layers mount no pane of their own, so they land in
        // Leaflet's default overlay pane. Recorded explicitly because the
        // native port has no such default to inherit.
        case .mineralOccurrences, .abandonedMines, .invernessHydroPotential:
            return leafletOverlayPane
        default:
            return nil
        }
    }

    /// Z-index for a raster layer, or `nil` if the layer is not a raster in
    /// tile space.
    ///
    /// `pass` exists for layers rendered as more than one request. The web
    /// writes `PROVINCE_LAYER_Z_INDEXES[layer.id] + index`, so a second pass
    /// lands exactly one above its base — that is how the road-contrast
    /// overlay stays on top of the roads it outlines.
    public static func tileZIndex(for id: LayerID, pass: Int = 0) -> Int? {
        if let base = provinceLayers[id] {
            return base + pass
        }
        switch id {
        case .fletcher:
            return fletcher + pass
        case .arsenicRiskWells, .uraniumRiskWells, .manganeseRiskWells,
            .surficialAquifers:
            return environmentalHealth + pass
        case .coastalFloodCurrent, .coastalFlood2050, .coastalFlood2100:
            return coastalFloodExport + pass
        case .publishedRiverFloodZones, .mineralTenure:
            return resourceExportDefault + pass
        case .oldGrowthPolicy:
            return oldGrowthPolicy + pass
        default:
            return nil
        }
    }

    /// The ids that render as rasters, ascending by z-index — the order MapKit
    /// overlays must be installed in.
    ///
    /// Ties are broken by the layer's declared order so the result is total and
    /// stable; MapKit needs a definite index, not a partial order.
    public static func installOrder(for ids: [LayerID]) -> [LayerID] {
        let declared = LayerID.allCases.enumerated()
            .reduce(into: [LayerID: Int]()) { $0[$1.element] = $1.offset }
        return ids
            .filter { tileZIndex(for: $0) != nil }
            .sorted {
                let left = tileZIndex(for: $0) ?? 0
                let right = tileZIndex(for: $1) ?? 0
                if left != right { return left < right }
                return (declared[$0] ?? 0) < (declared[$1] ?? 0)
            }
    }
}
