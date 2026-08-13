import Testing

@testable import GeoCore

@Suite("Overlay z-order")
struct OverlayZIndexTests {
    /// `PROVINCE_LAYER_Z_INDEXES` from `web/src/components/mapPanes.ts`,
    /// transcribed independently of the implementation.
    static let webProvinceZIndexes: [String: Int] = [
        "ns-aerial": 150,
        "contours": 180,
        "nsprd": 200,
        "water-features": 210,
        "crown-lands": 220,
        "buildings": 225,
        "flood-risk": 230,
        "roads": 235,
        "main-roads": 240,
        "waterfalls": 250,
        "place-names": 300,
    ]

    @Test("Province raster z-indexes match the web verbatim")
    func provinceZIndexesMatchWeb() {
        let native = OverlayZIndex.provinceLayers.reduce(into: [String: Int]()) {
            $0[$1.key.rawValue] = $1.value
        }
        #expect(native == Self.webProvinceZIndexes)
    }

    @Test("Standalone tile constants match the web verbatim")
    func standaloneConstantsMatchWeb() {
        #expect(OverlayZIndex.fletcher == 155)
        #expect(OverlayZIndex.userMaps == 160)
        #expect(OverlayZIndex.environmentalHealth == 165)
        #expect(OverlayZIndex.oldGrowthPolicy == 190)
        #expect(OverlayZIndex.resourceExportDefault == 225)
        #expect(OverlayZIndex.coastalFloodExport == 228)
    }

    @Test("Pane constants match the web verbatim")
    func paneConstantsMatchWeb() {
        #expect(OverlayZIndex.zoning == 300)
        #expect(OverlayZIndex.mineralProximity == 390)
        #expect(OverlayZIndex.wellLog == 405)
        #expect(OverlayZIndex.establishedParcel == 420)
        #expect(OverlayZIndex.userVector == 425)
        #expect(OverlayZIndex.measure == 430)
        #expect(OverlayZIndex.georeference == 660)
    }

    @Test("The historical raster sits above the aerial basemap and below every data layer")
    func fletcherIsContextNotEvidence() {
        // The whole point of the app: the scan is context you read modern data
        // on top of. If Fletcher ever outranks NSPRD, parcel lines vanish under
        // a 150-year-old scan.
        #expect(OverlayZIndex.fletcher > OverlayZIndex.provinceLayers[.nsAerial]!)
        for (id, z) in OverlayZIndex.provinceLayers where id != .nsAerial {
            #expect(OverlayZIndex.fletcher < z, "Fletcher must render below \(id.rawValue)")
        }
        #expect(OverlayZIndex.fletcher < OverlayZIndex.userMaps)
        #expect(OverlayZIndex.fletcher < OverlayZIndex.environmentalHealth)
    }

    @Test("A user's own scan renders below the data they are checking it against")
    func userMapsSitBelowData() {
        #expect(OverlayZIndex.userMaps > OverlayZIndex.provinceLayers[.nsAerial]!)
        #expect(OverlayZIndex.userMaps < OverlayZIndex.environmentalHealth)
        #expect(OverlayZIndex.userMaps < OverlayZIndex.provinceLayers[.nsprd]!)
    }

    @Test("Coastal flood projections read over the resource default")
    func coastalFloodOutranksResourceDefault() {
        #expect(OverlayZIndex.coastalFloodExport > OverlayZIndex.resourceExportDefault)
        for id in [LayerID.coastalFloodCurrent, .coastalFlood2050, .coastalFlood2100] {
            #expect(OverlayZIndex.tileZIndex(for: id) == 228)
        }
        #expect(OverlayZIndex.tileZIndex(for: .publishedRiverFloodZones) == 225)
        #expect(OverlayZIndex.tileZIndex(for: .mineralTenure) == 225)
    }

    @Test("Environmental-health screens share one wash beneath contours")
    func environmentalHealthShareOneIndex() {
        for id in [
            LayerID.arsenicRiskWells, .uraniumRiskWells, .manganeseRiskWells, .surficialAquifers,
        ] {
            #expect(OverlayZIndex.tileZIndex(for: id) == 165)
        }
        #expect(OverlayZIndex.environmentalHealth < OverlayZIndex.provinceLayers[.contours]!)
    }

    @Test("A second render pass lands exactly one above its base")
    func multiPassOffsetMatchesWeb() {
        // The web writes PROVINCE_LAYER_Z_INDEXES[layer.id] + index, which is
        // how the road-contrast overlay stays on top of the roads it outlines.
        #expect(OverlayZIndex.tileZIndex(for: .roads, pass: 0) == 235)
        #expect(OverlayZIndex.tileZIndex(for: .roads, pass: 1) == 236)
        // ...and still below main-roads, which is the layer meant to win.
        #expect(OverlayZIndex.tileZIndex(for: .roads, pass: 1)! < OverlayZIndex.provinceLayers[.mainRoads]!)
    }

    @Test("Non-raster layers have no tile z-index")
    func vectorLayersHaveNoTileIndex() {
        for id in [
            LayerID.zoningInverness, .zoningHalifax, .nsWellLogs, .mineralProximityParcels,
            .mineralOccurrences, .abandonedMines, .invernessHydroPotential,
        ] {
            #expect(OverlayZIndex.tileZIndex(for: id) == nil, "\(id.rawValue) is not a raster")
        }
    }

    @Test("Church layers are catalogued but render nowhere")
    func churchLayersDoNotRender() {
        // Rights are pending. A z-index would mean something is drawing them.
        for id in [
            LayerID.churchInverness, .churchVictoria, .churchRichmond, .churchCapeBreton,
        ] {
            #expect(OverlayZIndex.tileZIndex(for: id) == nil)
            #expect(OverlayZIndex.paneZIndex(for: id) == nil)
        }
    }

    @Test("Every layer has a z-index in exactly one space, or none at all")
    func spacesDoNotOverlap() {
        for id in LayerID.allCases {
            let tile = OverlayZIndex.tileZIndex(for: id)
            let pane = OverlayZIndex.paneZIndex(for: id)
            #expect(
                tile == nil || pane == nil,
                "\(id.rawValue) claims a z-index in both spaces"
            )
            if tile != nil { #expect(OverlayZIndex.space(of: id) == .tile) }
            if pane != nil { #expect(OverlayZIndex.space(of: id) == .pane) }
        }
    }

    @Test("The two 300s are not the same 300")
    func placeNamesAndZoningDoNotCollide() {
        // Identical numbers, different stacking contexts: on the web the whole
        // tile pane sits at 200, so zoning renders above place-name labels
        // despite the tie. Flattening these into one number line would invert
        // that the first time both are on.
        #expect(OverlayZIndex.provinceLayers[.placeNames] == OverlayZIndex.zoning)
        #expect(OverlayZIndex.space(of: .placeNames) == .tile)
        #expect(OverlayZIndex.space(of: .zoningInverness) == .pane)
    }

    @Test("Pane layers report the web's pane z-indexes")
    func paneLookup() {
        for id in [
            LayerID.zoningInverness, .zoningVictoria, .zoningRichmond, .zoningCumberland,
            .zoningHalifax,
        ] {
            #expect(OverlayZIndex.paneZIndex(for: id) == 300)
        }
        #expect(OverlayZIndex.paneZIndex(for: .mineralProximityParcels) == 390)
        #expect(OverlayZIndex.paneZIndex(for: .nsWellLogs) == 405)
        // No pane of their own on the web — Leaflet's default overlay pane.
        for id in [LayerID.mineralOccurrences, .abandonedMines, .invernessHydroPotential] {
            #expect(OverlayZIndex.paneZIndex(for: id) == 400)
        }
    }

    @Test("Well points read over area overlays but under selected parcels")
    func wellLogsSitBetweenOverlayAndSelection() {
        #expect(OverlayZIndex.wellLog > OverlayZIndex.leafletOverlayPane)
        #expect(OverlayZIndex.wellLog < OverlayZIndex.establishedParcel)
    }

    @Test("The user's own annotation outranks parcels but never an active measurement")
    func userVectorSitsBetweenParcelsAndMeasure() {
        #expect(OverlayZIndex.userVector > OverlayZIndex.establishedParcel)
        #expect(OverlayZIndex.userVector < OverlayZIndex.measure)
    }

    @Test("Georeference control points clear every app pane and Leaflet's markers")
    func georeferenceIsReachable() {
        #expect(OverlayZIndex.georeference > OverlayZIndex.measure)
        // Above Leaflet's marker (600) and tooltip (650) panes, below popup (700).
        #expect(OverlayZIndex.georeference > 650)
        #expect(OverlayZIndex.georeference < 700)
    }

    @Test("Install order is ascending by z-index")
    func installOrderAscends() {
        let ordered = OverlayZIndex.installOrder(for: [
            .placeNames, .fletcher, .nsAerial, .roads, .contours,
        ])
        #expect(ordered == [.nsAerial, .fletcher, .contours, .roads, .placeNames])
    }

    @Test("Install order drops layers that do not render as rasters")
    func installOrderDropsVectors() {
        let ordered = OverlayZIndex.installOrder(for: [
            .zoningHalifax, .nsAerial, .churchVictoria, .placeNames,
        ])
        #expect(ordered == [.nsAerial, .placeNames])
    }

    @Test("Install order is total and stable when z-indexes tie")
    func installOrderBreaksTiesStably() {
        // buildings, published-river-flood-zones and mineral-tenure all sit at
        // 225. MapKit needs a definite index, so the order must not depend on
        // input order.
        let forward = OverlayZIndex.installOrder(for: [
            .buildings, .publishedRiverFloodZones, .mineralTenure,
        ])
        let reversed = OverlayZIndex.installOrder(for: [
            .mineralTenure, .publishedRiverFloodZones, .buildings,
        ])
        #expect(forward == reversed)
        #expect(forward.count == 3)
    }

    @Test("Install order covers every raster layer without dropping one")
    func installOrderCoversAllRasters() {
        let rasters = LayerID.allCases.filter { OverlayZIndex.tileZIndex(for: $0) != nil }
        #expect(OverlayZIndex.installOrder(for: LayerID.allCases).count == rasters.count)
    }
}
