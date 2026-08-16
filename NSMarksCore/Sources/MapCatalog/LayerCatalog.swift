import Foundation
import GeoCore

/// Every layer both surfaces know about.
///
/// This is hand-written Swift rather than a decoded copy of the web catalog on
/// purpose: the caveat prose and licensing notes are the part a reader most
/// needs to see when changing a layer, and a runtime decode would move them
/// out of the file where that reasoning belongs. The drift guarantee comes
/// instead from `LayerCatalogParityTests`, which compares every field here
/// against the fixture the web exports.
public enum LayerCatalog {
    public static let all: [LayerDescriptor] = mapLayers + topography + forestry
        + floodHazard + environmentalHealth + zoning + groundwater + hydroPilot
        + geologyResources + church + historical

    // MARK: - Lookups

    private static let byID: [LayerID: LayerDescriptor] = all.reduce(into: [:]) {
        $0[$1.id] = $1
    }

    public static func descriptor(for id: LayerID) -> LayerDescriptor? {
        byID[id]
    }

    public static func layers(in group: LayerGroupID) -> [LayerDescriptor] {
        all.filter { $0.group == group }.sorted { $0.uiOrder < $1.uiOrder }
    }

    /// Every layer a request needs Province clearance for.
    ///
    /// Derived from the descriptors, never from a hand-kept id list. The web
    /// exports a `provinceLayerIds` array that looks like it would serve here
    /// and does not: it names nine layers where sixteen are restricted, missing
    /// `place-names`, `main-roads`, `published-river-flood-zones`,
    /// `arsenic-risk-wells`, `manganese-risk-wells`, `surficial-aquifers` and
    /// the derived `mineral-proximity-parcels`. A port that gated on it would
    /// ship six unlicensed Province services.
    public static let restrictedLayerIDs: Set<LayerID> = Set(
        all.filter(\.requiresProvinceClearance).map(\.id)
    )

    /// Hosts that serve at least one restricted layer.
    ///
    /// Diagnostic, not a blocklist — and the distinction is the point. The
    /// licence attaches to the layer, not to the machine: `nsgiwa` and `dawson`
    /// each serve both restricted layers and layers published under the Open
    /// Government Licence, which need no acceptance and which the web requests
    /// freely. Treating this set as "hosts we may not contact" would hide
    /// uranium risk and the coastal-flood projections behind a dialog they do
    /// not require.
    ///
    /// What is safe to assert host-wide is the converse: a request built
    /// without clearance must never carry the *service URL* of a restricted
    /// layer. No service URL in the catalog is shared between a restricted and
    /// an open layer, so that check is exact.
    public static let restrictedHosts: Set<String> = Set(
        all.filter(\.requiresProvinceClearance)
            .compactMap { $0.serviceURL?.host() }
    )

    /// Layers on by default in the native app.
    ///
    /// Not the same set as the web's. The web catalog carries an explicit
    /// `nativeDefaultVisibility` per layer, and this honours it: the web opens
    /// with aerial, parcels, water and roads on, while the app opens with the
    /// historical sheet on and everything else off. The app's reason for
    /// existing is the Fletcher overlay, and four restricted Province layers
    /// on first launch would put the licence dialog in front of a user who has
    /// not asked for any of them yet.
    public static let nativeDefaultVisibleIDs: Set<LayerID> = Set(
        all.filter(\.nativeDefaultVisible).map(\.id)
    )

    // MARK: - Shared values

    private static let restrictedMapServiceLicence = URL(
        string: "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf"
    )
    private static let openGovernmentLicence = URL(
        string: "https://novascotia.ca/opendata/licence.asp"
    )
    private static let unrestrictedLicence = URL(
        string: "https://nsgiwa.novascotia.ca/documents/licenses/unrestricted/unrestrictedLicense.pdf"
    )
    private static let coastalHazardSource = URL(string: "https://nsgi.novascotia.ca/chm")
    private static let edpcPlanDocuments = URL(string: "https://edpc.ca/plan-documents-and-maps/")

    private static let nstdbRoadsService = URL(
        string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Roads_UT83/MapServer"
    )
    private static let nstdbWaterService = URL(
        string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer"
    )
    private static let floodRiskAreasService = URL(
        string: "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer"
    )

    // MARK: - Map layers

    static let mapLayers: [LayerDescriptor] = [
        LayerDescriptor(
            id: .nsAerial,
            name: "NS Aerial",
            group: .mapLayers,
            uiOrder: 0,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer"),
            minZoom: 10,
            maxZoom: 23,
            // The imagery service publishes to 19; above it the renderer
            // upsamples rather than asking for tiles that do not exist.
            maxNativeZoom: 19,
            opacity: 1,
            webDefaultVisible: true,
            caveat: "Online imagery · zoom 10+",
            sourceDate: "Imagery dates vary · service checked July 20, 2026",
            scale: "NSODB 1:10,000 imagery",
            coverage: "Nova Scotia",
            exportOptions: ArcGISExportOptions(transparent: false)
        ),
        LayerDescriptor(
            id: .nsprd,
            name: "NS Property Boundaries",
            group: .mapLayers,
            uiOrder: 1,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer"),
            minZoom: 14,
            maxZoom: 24,
            opacity: 0.82,
            webDefaultVisible: true,
            caveat: "Zoom 14+ · not a survey",
            sourceDate: "Live service · checked July 20, 2026",
            scale: "Display floor 1:36,114",
            coverage: "Nova Scotia",
            // Labels off: the service draws PIDs at a size that is unreadable
            // under an 1884 sheet and only adds clutter.
            exportOptions: ArcGISExportOptions(
                transparent: true,
                dynamicLayers: #"[{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"showLabels":false}}]"#
            )
        ),
        LayerDescriptor(
            id: .crownLands,
            name: "Crown Lands",
            group: .mapLayers,
            uiOrder: 2,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLANCrownLandsWM84V1/MapServer"),
            minZoom: 12,
            maxZoom: 24,
            opacity: 0.78,
            webDefaultVisible: false,
            caveat: "Zoom 12+",
            sourceDate: "Live service · checked July 20, 2026",
            scale: "Detailed view from zoom 12",
            coverage: "Nova Scotia",
            exportOptions: ArcGISExportOptions(
                transparent: true,
                dynamicLayers: #"[{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSFS","style":"esriSFSSolid","color":[46,180,46,128],"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[0,100,0,255],"width":2}}},"labelingInfo":[]}}]"#
            )
        ),
        LayerDescriptor(
            id: .floodRisk,
            name: "Watersheds",
            group: .mapLayers,
            uiOrder: 3,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: floodRiskAreasService,
            minZoom: 12,
            maxZoom: 24,
            opacity: 0.72,
            webDefaultVisible: false,
            caveat: "Watershed context · not flood-risk mapping · zoom 12+",
            sourceDate: "Live service · checked July 20, 2026",
            scale: "Watershed detail from zoom 12",
            coverage: "Nova Scotia primary, secondary, and tertiary watersheds",
            exportOptions: ArcGISExportOptions(transparent: true, layers: "show:24,25,26")
        ),
        LayerDescriptor(
            id: .waterfalls,
            name: "Waterfalls",
            group: .mapLayers,
            uiOrder: 4,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: nstdbWaterService,
            minZoom: 7,
            maxZoom: 24,
            opacity: 1,
            webDefaultVisible: false,
            caveat: "90 mapped falls · overview on selection",
            sourceDate: "Live service · checked July 20, 2026",
            scale: "NSTDB 1:10,000 point inventory",
            coverage: "Nova Scotia · 90 mapped falls",
            exportOptions: ArcGISExportOptions(
                transparent: true,
                dynamicLayers: #"[{"id":1,"source":{"type":"mapLayer","mapLayerId":1},"definitionExpression":"FEAT_DESC = 'Falls -  On a single line river point'","drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSMS","style":"esriSMSCircle","color":[0,120,255,255],"size":8,"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[255,255,255,255],"width":1.5}}},"showLabels":true,"labelingInfo":[{"labelExpression":"[ZVALUE]","labelPlacement":"esriServerPointLabelPlacementAboveRight","symbol":{"type":"esriTS","color":[0,120,255,255],"font":{"size":10,"family":"Arial","weight":"bold"}},"minScale":50000}]}}]"#
            )
        ),
        LayerDescriptor(
            id: .waterFeatures,
            name: "Water features",
            group: .mapLayers,
            uiOrder: 5,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: nstdbWaterService,
            minZoom: 10,
            maxZoom: 24,
            opacity: 1,
            webDefaultVisible: true,
            caveat: "Rivers, lakes, wetlands & more · zoom 10+",
            sourceDate: "Live service · checked July 20, 2026",
            scale: "NSTDB 1:10,000",
            coverage: "Nova Scotia",
            exportOptions: ArcGISExportOptions(transparent: true, dpi: 144)
        ),
        LayerDescriptor(
            id: .roads,
            name: "Roads, trails & culverts",
            group: .mapLayers,
            uiOrder: 6,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: nstdbRoadsService,
            minZoom: 10,
            maxZoom: 24,
            opacity: 1,
            webDefaultVisible: true,
            caveat: "Highways to trails · culverts close up · zoom 10+",
            sourceDate: "Live service · checked July 20, 2026",
            scale: "NSTDB 1:10,000",
            coverage: "Nova Scotia",
            exportOptions: ArcGISExportOptions(transparent: true, dpi: 192),
            // A second pass drawing white casings under the road lines, so a
            // dark road stays readable over a dark historical sheet. It renders
            // at base + 1 — see OverlayZIndex.tileZIndex(for:pass:).
            exportOverlayOptions: ArcGISExportOptions(
                transparent: true,
                dynamicLayers: #"[{"id":81,"source":{"type":"mapLayer","mapLayerId":8},"definitionExpression":"FEAT_DESC LIKE '%TRACK%' OR FEAT_DESC LIKE 'TRAIL%'","drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSLS","style":"esriSLSDash","color":[43,39,48,255],"width":0.8}},"labelingInfo":[]}},{"id":79,"source":{"type":"mapLayer","mapLayerId":8},"definitionExpression":"FEAT_DESC <> 'WATER ACCESS'"},{"id":77,"source":{"type":"mapLayer","mapLayerId":8},"definitionExpression":"FEAT_DESC <> 'WATER ACCESS' AND NOT (FEAT_DESC LIKE '%TRACK%' OR FEAT_DESC LIKE 'TRAIL%')","drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSLS","style":"esriSLSSolid","color":[255,255,255,220],"width":2.6}},"labelingInfo":[]}},{"id":76,"source":{"type":"mapLayer","mapLayerId":8},"definitionExpression":"FEAT_DESC LIKE '%TRACK%' OR FEAT_DESC LIKE 'TRAIL%'","drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSLS","style":"esriSLSSolid","color":[255,255,255,200],"width":1.6}},"labelingInfo":[]}}]"#,
                dpi: 192
            )
        ),
        LayerDescriptor(
            id: .buildings,
            name: "Buildings",
            group: .mapLayers,
            uiOrder: 7,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Buildings_UT83/MapServer"),
            minZoom: 13,
            maxZoom: 24,
            opacity: 0.9,
            webDefaultVisible: false,
            caveat: "Mapped points & footprints · zoom 13+",
            sourceDate: "NSTDB updated May 5, 2026 · service checked July 22, 2026",
            scale: "NSTDB 1:10,000",
            coverage: "Nova Scotia",
            exportOptions: ArcGISExportOptions(transparent: true, dpi: 144)
        ),
        LayerDescriptor(
            id: .placeNames,
            name: "Place names",
            group: .mapLayers,
            uiOrder: 8,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NS_GeoNAMES_pnt_UT83/MapServer"),
            minZoom: 8,
            maxZoom: 24,
            opacity: 1,
            webDefaultVisible: false,
            caveat: "Official geographic names · settlements, water and coast",
            sourceDate: "CGNDB via NSGI · service checked August 1, 2026",
            scale: "Point gazetteer with labels",
            coverage: "Nova Scotia",
            // Settlements plus the named water and coastal features an 1884
            // sheet also labels; the rest of the gazetteer (parks, protected
            // areas, game management) is modern administration and only adds
            // noise here.
            exportOptions: ArcGISExportOptions(
                transparent: true,
                layers: "show:3,4,6,7,24,27,31,33,37",
                dpi: 144
            )
        ),
        LayerDescriptor(
            id: .mainRoads,
            name: "Main roads only",
            group: .mapLayers,
            uiOrder: 9,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: nstdbRoadsService,
            minZoom: 9,
            maxZoom: 24,
            opacity: 1,
            webDefaultVisible: false,
            caveat: "Local roads and highways only · tracks and driveways hidden",
            sourceDate: "Live service · checked August 1, 2026",
            scale: "NSTDB 1:10,000, filtered",
            coverage: "Nova Scotia",
            exportOptions: ArcGISExportOptions(
                transparent: true,
                dynamicLayers: #"[{"id":8,"source":{"type":"mapLayer","mapLayerId":8},"definitionExpression":"FEAT_DESC LIKE 'ROAD - Local%'","drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSLS","style":"esriSLSSolid","color":[40,40,40,235],"width":1.6}}}},{"id":7,"source":{"type":"mapLayer","mapLayerId":7},"drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSLS","style":"esriSLSSolid","color":[0,0,0,255],"width":2.6}}}}]"#,
                dpi: 144
            )
        ),
    ]

    // MARK: - Topography

    static let topography: [LayerDescriptor] = [
        LayerDescriptor(
            id: .contours,
            name: "Contours",
            group: .topography,
            uiOrder: 10,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Landforms_UT83/MapServer"),
            minZoom: 13,
            maxZoom: 24,
            opacity: 0.88,
            webDefaultVisible: false,
            caveat: "5 m elevation lines · terrain screening only · zoom 13+",
            sourceDate: "NSTDB updated May 5, 2026 · service checked July 22, 2026",
            scale: "LiDAR-derived 5 m contours · labelled index lines",
            coverage: "Nova Scotia",
            exportOptions: ArcGISExportOptions(
                transparent: true,
                layers: "show:2,4",
                dpi: 144
            )
        ),
    ]

    // MARK: - Forestry

    static let forestry: [LayerDescriptor] = [
        LayerDescriptor(
            id: .oldGrowthPolicy,
            name: "Old-growth policy areas",
            group: .forestry,
            uiOrder: 11,
            licence: .provinceOpen,
            delivery: .geoJSONEndpoint,
            serviceURL: URL(string: "https://data.novascotia.ca/resource/wanf-acts.geojson"),
            sourceURL: URL(string: "https://data.novascotia.ca/Lands-Forests-and-Wildlife/Old-Growth-Forest-Policy-Layer/wanf-acts"),
            licenceURL: openGovernmentLicence,
            minZoom: 9,
            maxZoom: 23,
            opacity: 0.72,
            webDefaultVisible: false,
            caveat: "Mapped policy areas on public land · not a complete old-growth inventory",
            sourceDate: "Policy layer as of October 24, 2025 · updated October 27, 2025",
            scale: "Policy-area polygons with source-reported hectares",
            coverage: "Mapped publicly owned land outside protected areas in Nova Scotia"
        ),
    ]

    // MARK: - Flood hazard context

    static let floodHazard: [LayerDescriptor] = [
        LayerDescriptor(
            id: .publishedRiverFloodZones,
            name: "Published river flood zones",
            group: .floodHazard,
            uiOrder: 12,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: floodRiskAreasService,
            sourceURL: floodRiskAreasService,
            licenceURL: restrictedMapServiceLicence,
            minZoom: 10,
            maxZoom: 24,
            opacity: 0.72,
            webDefaultVisible: false,
            caveat: "Published 5% and 1% AEP mapping in four study areas",
            sourceDate: "NSGC 2006-era mapping · service checked July 22, 2026",
            scale: "Study-area flood mapping",
            coverage: "Antigonish, Bedford–Sackville, Pictou, and Truro",
            exportOptions: ArcGISExportOptions(
                transparent: true,
                layers: "show:2,3,4,5,7,8,9,10,12,13,14,16,17,18"
            )
        ),
        coastalFlood(
            id: .coastalFloodCurrent,
            uiOrder: 13,
            name: "Coastal flooding — current",
            service: "OCN_Projected_Current_Day_Flooding_UT83",
            caveat: "Current sea level with a 1% AEP storm surge"
        ),
        coastalFlood(
            id: .coastalFlood2050,
            uiOrder: 14,
            name: "Coastal flooding — 2050",
            service: "OCN_Projected_Worst_Case_Flooding_2050_UT83",
            caveat: "2050 high sea-level scenario with a 1% AEP storm surge"
        ),
        coastalFlood(
            id: .coastalFlood2100,
            uiOrder: 15,
            name: "Coastal flooding — 2100",
            service: "OCN_Projected_Worst_Case_Flooding_2100_UT83",
            caveat: "2100 high sea-level scenario with a 1% AEP storm surge"
        ),
    ]

    /// The three coastal projections differ only in service name and caveat.
    ///
    /// They are published under the unrestricted licence, not the restricted
    /// map-services one — same publisher as the layers above, different terms.
    private static func coastalFlood(
        id: LayerID,
        uiOrder: Int,
        name: String,
        service: String,
        caveat: String
    ) -> LayerDescriptor {
        LayerDescriptor(
            id: id,
            name: name,
            group: .floodHazard,
            uiOrder: uiOrder,
            licence: .provinceOpen,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/OCN/\(service)/MapServer"),
            sourceURL: coastalHazardSource,
            licenceURL: unrestrictedLicence,
            minZoom: 8,
            maxZoom: 24,
            opacity: 0.68,
            webDefaultVisible: false,
            caveat: caveat,
            sourceDate: "Live Coastal Hazard Map · checked July 22, 2026",
            scale: "Provincial coastal screening",
            coverage: "Mapped Nova Scotia coast",
            exportOptions: ArcGISExportOptions(transparent: true)
        )
    }

    // MARK: - Environmental health screens

    static let environmentalHealth: [LayerDescriptor] = [
        LayerDescriptor(
            id: .arsenicRiskWells,
            name: "Arsenic risk — bedrock wells",
            group: .environmentalHealth,
            uiOrder: 16,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/GEOL/GEOL_hg_ArsenicRiskWaterWells_h499ns_UT83/MapServer"),
            sourceURL: URL(string: "https://novascotia.ca/natr/meb/geoscience-online/arsenicriskwells_about.asp"),
            licenceURL: restrictedMapServiceLicence,
            minZoom: 7,
            maxZoom: 24,
            opacity: 0.55,
            webDefaultVisible: false,
            caveat: "Relative risk zones by bedrock unit · not a test result for this property",
            sourceDate: "Live service · checked July 23, 2026",
            scale: "Bedrock-unit risk bands · high risk is >15% of well samples over the 10 µg/L guideline",
            coverage: "Nova Scotia bedrock aquifers",
            exportOptions: ArcGISExportOptions(transparent: true),
            guidance: "Testing your well is the only way to find out whether arsenic is a concern in your well, so it is important to test your water no matter where you live.",
            riskBands: [
                LayerRiskBand(label: "High Risk", colorHex: "#993d7a"),
                LayerRiskBand(label: "Medium Risk", colorHex: "#c363e0"),
                LayerRiskBand(label: "Low Risk", colorHex: "#d8b5eb"),
            ]
        ),
        LayerDescriptor(
            id: .uraniumRiskWells,
            name: "Uranium risk — bedrock wells",
            group: .environmentalHealth,
            uiOrder: 17,
            // Open Government, unlike its neighbours: this one is published on
            // the open-data portal while arsenic and manganese sit under a
            // departmental agreement. Licensing here is per service, so nothing
            // may infer a layer's terms from the layers around it.
            licence: .provinceOpen,
            delivery: .mapExport,
            serviceURL: URL(string: "https://dawson.novascotia.ca/arcgis/rest/services/hg_uranium_risk_h529ns_UT83/MapServer"),
            sourceURL: URL(string: "https://data.novascotia.ca/d/w8ax-dtd5"),
            licenceURL: openGovernmentLicence,
            minZoom: 7,
            maxZoom: 24,
            opacity: 0.55,
            webDefaultVisible: false,
            caveat: "Relative risk zones by bedrock unit · not a test result for this property",
            sourceDate: "Open File Report ME 2020-001 · service checked July 23, 2026",
            scale: "Bedrock-unit risk bands · high risk is >15% of well samples over the 20 µg/L guideline",
            coverage: "Nova Scotia bedrock aquifers",
            exportOptions: ArcGISExportOptions(transparent: true),
            guidance: "Risk bands describe bedrock units, not individual wells. Test your well water to find out whether uranium is a concern at this property.",
            riskBands: [
                LayerRiskBand(label: "High Risk", colorHex: "#808000"),
                LayerRiskBand(label: "Medium Risk", colorHex: "#ffffbf"),
                LayerRiskBand(label: "Low Risk", colorHex: "#b0b0b0"),
            ]
        ),
        LayerDescriptor(
            id: .manganeseRiskWells,
            name: "Manganese risk — water wells",
            group: .environmentalHealth,
            uiOrder: 18,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://dawson.novascotia.ca/arcgis/rest/services/hg_manganese_risk_h535ns_UT83/MapServer"),
            sourceURL: URL(string: "https://novascotia.ca/natr/meb/data/ofr/ofr_me_2021-002.pdf"),
            licenceURL: restrictedMapServiceLicence,
            minZoom: 7,
            maxZoom: 24,
            opacity: 0.55,
            webDefaultVisible: false,
            caveat: "Bedrock and surficial aquifer risk zones · not a test result for this property",
            sourceDate: "Open File Report ME 2021-002 · service checked July 23, 2026",
            scale: "Aquifer risk bands · high risk is >15% of well samples over the 120 µg/L guideline",
            coverage: "Nova Scotia bedrock and surficial aquifers",
            exportOptions: ArcGISExportOptions(transparent: true),
            guidance: "Risk bands describe bedrock and surficial aquifers, not individual wells. Test your well water to find out whether manganese is a concern at this property.",
            riskBands: [
                LayerRiskBand(label: "High Risk", colorHex: "#828282"),
                LayerRiskBand(label: "Medium Risk", colorHex: "#b2b2b2"),
                LayerRiskBand(label: "Low Risk", colorHex: "#e1e1e1"),
            ]
        ),
        LayerDescriptor(
            id: .surficialAquifers,
            name: "Surficial aquifers",
            group: .environmentalHealth,
            uiOrder: 19,
            licence: .provinceRestricted,
            delivery: .mapExport,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/GEOL/GEOL_hg_SurficialAquifers_h490ns_UT83/MapServer"),
            sourceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/GEOL/GEOL_hg_SurficialAquifers_h490ns_UT83/MapServer"),
            licenceURL: restrictedMapServiceLicence,
            minZoom: 7,
            maxZoom: 24,
            opacity: 0.5,
            webDefaultVisible: false,
            caveat: "Aquifer extent context · carries no risk rating",
            sourceDate: "Live service · checked July 23, 2026",
            scale: "Provincial surficial aquifer mapping (h490ns)",
            coverage: "Mapped Nova Scotia surficial aquifers",
            exportOptions: ArcGISExportOptions(transparent: true),
            guidance: "Mapped aquifer extent only. This layer carries no risk rating and says nothing about water quality at any property."
        ),
    ]

    // MARK: - Municipal zoning

    static let zoning: [LayerDescriptor] = [
        LayerDescriptor(
            id: .zoningInverness,
            name: "Inverness County",
            group: .zoning,
            uiOrder: 20,
            licence: .municipalNoStatedLicence,
            delivery: .featureQuery,
            serviceURL: URL(string: "https://services5.arcgis.com/IRdatShZ61GuNjMZ/arcgis/rest/services/IN_Zoning/FeatureServer/708"),
            sourceURL: edpcPlanDocuments,
            minZoom: 12,
            maxZoom: 23,
            opacity: 0.45,
            webDefaultVisible: false,
            caveat: "Unofficial · not for legal use · zoom 12+",
            sourceDate: "County-wide zoning in effect September 11, 2025 · service checked July 23, 2026",
            scale: "1,125 zone polygons",
            coverage: "Municipality of the County of Inverness · towns are separate zoning jurisdictions"
        ),
        LayerDescriptor(
            id: .zoningVictoria,
            name: "Victoria County",
            group: .zoning,
            uiOrder: 21,
            licence: .municipalNoStatedLicence,
            delivery: .featureQuery,
            serviceURL: URL(string: "https://services5.arcgis.com/IRdatShZ61GuNjMZ/arcgis/rest/services/VIZoning_Clipped/FeatureServer/707"),
            sourceURL: edpcPlanDocuments,
            minZoom: 12,
            maxZoom: 23,
            opacity: 0.45,
            webDefaultVisible: false,
            caveat: "Unofficial · not for legal use · excludes Baddeck · zoom 12+",
            sourceDate: "County-wide zoning in effect October 2, 2025 · service checked July 23, 2026",
            scale: "901 zone polygons",
            coverage: "Municipality of the County of Victoria · the Baddeck plan area is administered separately and is not included"
        ),
        LayerDescriptor(
            id: .zoningRichmond,
            name: "Richmond County",
            group: .zoning,
            uiOrder: 22,
            licence: .municipalNoStatedLicence,
            delivery: .featureQuery,
            serviceURL: URL(string: "https://services5.arcgis.com/IRdatShZ61GuNjMZ/arcgis/rest/services/RI_Plan_Richmond/FeatureServer/376"),
            sourceURL: edpcPlanDocuments,
            minZoom: 12,
            maxZoom: 23,
            opacity: 0.45,
            webDefaultVisible: false,
            caveat: "Unofficial · not for legal use · zoom 12+",
            sourceDate: "Plan Richmond adopted February 26, 2024 · service checked July 23, 2026",
            scale: "1,284 zone polygons",
            coverage: "Municipality of the County of Richmond · towns are separate zoning jurisdictions"
        ),
        LayerDescriptor(
            id: .zoningCumberland,
            name: "Cumberland County",
            group: .zoning,
            uiOrder: 23,
            licence: .municipalNoStatedLicence,
            delivery: .featureQuery,
            serviceURL: URL(string: "https://services6.arcgis.com/9de72LkV8htkdfB9/arcgis/rest/services/Zoning_Cumberland_2018_abbr2/FeatureServer/0"),
            sourceURL: URL(string: "https://data-cumberlandns.opendata.arcgis.com/datasets/CumberlandNS::zoning-cumberland-2022"),
            minZoom: 13,
            maxZoom: 23,
            opacity: 0.45,
            webDefaultVisible: false,
            caveat: "Unofficial · not for legal use · 2025 geometry · zoom 13+",
            sourceDate: "2018 by-law consolidated to April 17, 2026 · CU_Zone_2025 geometry · service checked July 23, 2026",
            scale: "34,281 zone polygons",
            coverage: "Municipality of the County of Cumberland · Amherst, Oxford, and Parrsboro are separate zoning jurisdictions"
        ),
        LayerDescriptor(
            id: .zoningHalifax,
            name: "Halifax Regional Municipality",
            group: .zoning,
            uiOrder: 24,
            // The only municipal zoning source here that states an open
            // licence at all.
            licence: .municipalOpen,
            delivery: .featureQuery,
            serviceURL: URL(string: "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/ZoningBoundaries/FeatureServer/0"),
            sourceURL: URL(string: "https://data-hrm.hub.arcgis.com/"),
            licenceURL: URL(string: "https://data-hrm.hub.arcgis.com/pages/open-data-licence"),
            minZoom: 13,
            maxZoom: 23,
            opacity: 0.45,
            webDefaultVisible: false,
            caveat: "Unofficial · not for legal use · 22 plan-area by-laws · zoom 13+",
            sourceDate: "Live service · checked July 23, 2026",
            scale: "11,076 zone polygons",
            coverage: "Halifax Regional Municipality · zoning is set by 22 separate plan-area by-laws, so confirm which by-law governs a parcel"
        ),
    ]

    // MARK: - Groundwater

    static let groundwater: [LayerDescriptor] = [
        LayerDescriptor(
            id: .nsWellLogs,
            name: "Water well logs",
            group: .groundwater,
            uiOrder: 25,
            licence: .provinceOpen,
            delivery: .featureQuery,
            serviceURL: URL(string: "https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/hg_Water_Well_logs_h430ns_UT83/FeatureServer/0"),
            sourceURL: URL(string: "https://novascotia.ca/natr/meb/download/dp430.asp"),
            minZoom: 12,
            maxZoom: 23,
            opacity: 0.95,
            webDefaultVisible: false,
            caveat: "Surveyed ±50 m wells only by default · coarser records are area reports, not well locations · zoom 12+",
            sourceDate: "DP ME 430 version 5 · database extracted January 5, 2022",
            scale: "Point inventory · location accuracy ranges from ±50 m to ±8 km",
            coverage: "Nova Scotia · 125,517 well logs constructed 1940–2021"
        ),
    ]

    // MARK: - Micro-hydro pilot

    static let hydroPilot: [LayerDescriptor] = [
        LayerDescriptor(
            id: .invernessHydroPotential,
            name: "Inverness micro-hydro screen",
            group: .hydroPilot,
            uiOrder: 26,
            licence: .provinceOpen,
            delivery: .bundledGeoJSON,
            serviceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_NSHN_UT83/MapServer"),
            sourceURL: URL(string: "https://data.novascotia.ca/Internal-Government-Services/1-10-000-Nova-Scotia-Watersheds-Map/kzer-4ht8"),
            minZoom: 8,
            maxZoom: 23,
            opacity: 0.92,
            webDefaultVisible: false,
            caveat: "Modeled upstream area + nominal 1–50 kW scale · not predicted output",
            sourceDate: "Watersheds 2021 · NSHN retrieved July 21, 2026",
            scale: "Tertiary/sub-tertiary catchments + connected NSHN tributaries",
            coverage: "13 Inverness-centred watersheds with connected tributary coverage"
        ),
    ]

    // MARK: - Geology & resources

    static let geologyResources: [LayerDescriptor] = [
        LayerDescriptor(
            id: .mineralOccurrences,
            name: "Mineral occurrences",
            group: .geologyResources,
            uiOrder: 27,
            licence: .provinceOpen,
            delivery: .featureQuery,
            serviceURL: URL(string: "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/mineral_occurrence_database_d002ns_UT83/FeatureServer/0"),
            sourceURL: URL(string: "https://novascotia.ca/natr/meb/download/dp002.asp"),
            minZoom: 8,
            maxZoom: 23,
            opacity: 0.9,
            webDefaultVisible: false,
            caveat: "Recorded occurrences, not proof of a viable deposit",
            sourceDate: "June 2024 · version 12",
            scale: "Point inventory · source displays to 1:500,000",
            coverage: "Nova Scotia"
        ),
        LayerDescriptor(
            id: .mineralTenure,
            name: "Mineral tenure",
            group: .geologyResources,
            uiOrder: 28,
            licence: .provinceOpen,
            delivery: .mapExport,
            serviceURL: URL(string: "https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer"),
            sourceURL: URL(string: "https://novaroc.novascotia.ca/novaroc/"),
            minZoom: 7,
            maxZoom: 23,
            opacity: 0.7,
            webDefaultVisible: false,
            caveat: "Exploration licences and mineral leases; not land ownership",
            sourceDate: "Live NovaROC · checked July 20, 2026",
            scale: "Tenure polygons · source displays to 1:3,000,000",
            coverage: "Nova Scotia",
            exportOptions: ArcGISExportOptions(transparent: true, layers: "show:1,7")
        ),
        LayerDescriptor(
            id: .abandonedMines,
            name: "Abandoned mine openings",
            group: .geologyResources,
            uiOrder: 29,
            licence: .provinceOpen,
            delivery: .featureQuery,
            serviceURL: URL(string: "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/Abandoned_Mine_Openings_Degree_of_Hazard_d010ns_ut83/FeatureServer/0"),
            sourceURL: URL(string: "https://novascotia.ca/natr/meb/download/dp010.asp"),
            minZoom: 11,
            maxZoom: 23,
            opacity: 0.92,
            webDefaultVisible: false,
            caveat: "Provincial hazard inventory; locations and conditions may change",
            sourceDate: "2024 · version 9",
            scale: "Approximate point inventory",
            coverage: "Nova Scotia · incomplete inventory"
        ),
        LayerDescriptor(
            id: .mineralProximityParcels,
            name: "Properties within 1 km of a mineral occurrence",
            group: .geologyResources,
            uiOrder: 30,
            // No licence field at all on the web: this layer fetches nothing of
            // its own. It is computed from NSPRD parcel geometry, which makes
            // producing it a restricted use of restricted data — hence the flag
            // rather than a licence value.
            licence: nil,
            delivery: .derivedParcelQuery,
            serviceURL: nil,
            sourceURL: URL(string: "https://novascotia.ca/natr/meb/download/dp002.asp"),
            minZoom: 12,
            maxZoom: 23,
            webDefaultVisible: false,
            requiresProvinceLicence: true,
            caveat: "Derived from published occurrences and NSPRD parcels; not proof of mineralization",
            sourceDate: "Mineral occurrences June 2024 · NSPRD live",
            scale: "Application-derived 1 km parcel proximity",
            coverage: "Visible Nova Scotia map area"
        ),
    ]

    // MARK: - Church county maps

    static let church: [LayerDescriptor] = [
        churchCounty(
            id: .churchInverness,
            uiOrder: 31,
            county: "Inverness",
            year: 1884,
            scale: "1:63,360 township map sheet",
            detail: "RUMSEY~8~1~353591~90120835"
        ),
        churchCounty(
            id: .churchVictoria,
            uiOrder: 32,
            county: "Victoria",
            year: 1884,
            scale: "1:63,360 township map sheet",
            detail: "RUMSEY~8~1~374820~90141224"
        ),
        churchCounty(
            id: .churchRichmond,
            uiOrder: 33,
            county: "Richmond",
            year: 1885,
            scale: "1:84,269 township map sheet",
            detail: "RUMSEY~8~1~373669~90140407"
        ),
        churchCounty(
            id: .churchCapeBreton,
            uiOrder: 34,
            county: "Cape Breton",
            year: 1884,
            scale: "1:63,360 township map sheet",
            detail: "RUMSEY~8~1~374821~90141223"
        ),
    ]

    /// The four Church county sheets differ only in county, year, scale and the
    /// Rumsey record they point at.
    ///
    /// `serviceURL` is the collection record, not a tile endpoint — nothing is
    /// hosting these yet, which is what `availability: .rightsPending` and
    /// `delivery: .unavailable` say. The rows exist so the app can show what is
    /// coming and where the scan lives, without implying it can draw it.
    private static func churchCounty(
        id: LayerID,
        uiOrder: Int,
        county: String,
        year: Int,
        scale: String,
        detail: String
    ) -> LayerDescriptor {
        LayerDescriptor(
            id: id,
            name: "Church — \(county) County",
            group: .church,
            uiOrder: uiOrder,
            licence: .rumseyReference,
            delivery: .unavailable,
            availability: .rightsPending,
            serviceURL: URL(string: "https://www.davidrumsey.com/luna/servlet/detail/\(detail)"),
            minZoom: 0,
            maxZoom: 24,
            opacity: 1,
            webDefaultVisible: false,
            caveat: "Published \(year) · web view pending tiles",
            sourceDate: "A.F. Church · published \(year)",
            scale: scale,
            coverage: "\(county) County, Cape Breton Island"
        )
    }

    // MARK: - Historical

    static let historical: [LayerDescriptor] = [
        LayerDescriptor(
            id: .fletcher,
            name: "Fletcher",
            group: .historical,
            uiOrder: 35,
            licence: .rumseyReference,
            delivery: .xyzTemplate,
            // Empty on the web, and nil here: the base URL is runtime
            // configuration, not a catalog constant. Fletcher tiles are served
            // from wherever FletcherTileBaseURL points, and with nothing
            // configured the row appears disabled rather than vanishing.
            serviceURL: nil,
            minZoom: 8,
            maxZoom: 16,
            maxNativeZoom: 16,
            opacity: 0.72,
            webDefaultVisible: false,
            // The one layer the native app opens with. It is the reason the app
            // exists, and it is the only layer that needs no licence dialog.
            nativeDefaultVisible: true,
            caveat: "24 direct-Rumsey sheets · zoom 8–16",
            sourceDate: "Hugh Fletcher · 1882–1884 source sheets",
            scale: "Independently georeferenced historical sheets",
            coverage: "Cape Breton Island · 24 individual sheets"
        ),
    ]
}
