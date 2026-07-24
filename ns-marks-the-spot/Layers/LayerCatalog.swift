import Foundation

enum LayerCatalog {
    private static let provinceDisclaimer = "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions."
    private static let oldMapsOnlineFletcherTemplate = "https://wmts.oldmapsonline.org/maps/9b86f069-b432-5e78-a4c9-306ee238e5fb/2023-06-13T14:40:41.945831Z/{z}/{x}/{y}.png"
    private static let arcGISDynamicMinimumZoom = 12
    private static let rumseyAttribution = LayerAttribution(
        provider: "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries",
        copyright: nil,
        disclaimer: "Historical maps are provided for reference and historical interest only.",
        licenseTitle: nil,
        licenseURL: URL(string: "https://www.davidrumsey.com/about/copyright-and-permissions")
    )

    static let all: [LayerDescriptor] = [
        LayerDescriptor(
            id: .fletcher,
            name: "Fletcher",
            sourceKind: .remoteXYZTemplate,
            sourceURL: fletcherSourceURL,
            defaultOpacity: 1.0,
            defaultVisibility: true,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .savedAreaDownloadable,
            cacheKey: "fletcher",
            attribution: LayerAttribution(
                provider: "David Rumsey Map Collection",
                copyright: nil,
                disclaimer: "Historical maps are provided for reference and historical interest only.",
                licenseTitle: nil,
                licenseURL: nil
            ),
            userCaveat: "Historical map; not for navigation."
        ),
        LayerDescriptor(
            id: .nsAerial,
            name: "NS Aerial",
            sourceKind: .arcGISMapService,
            sourceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 14,
            renderingRole: .basemapAndOverlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "ns-aerial",
            attribution: provinceAttribution(copyright: "Service Nova Scotia"),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .nsPropertyBoundaries,
            name: "NS Property Boundaries",
            sourceKind: .arcGISDynamic,
            sourceURL: URL(string: "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: arcGISDynamicMinimumZoom,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "nsprd",
            attribution: provinceAttribution(copyright: nil),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .crownLands,
            name: "Crown Lands",
            sourceKind: .arcGISDynamic,
            sourceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLANCrownLandsWM84V1/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: arcGISDynamicMinimumZoom,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "crown-lands",
            attribution: provinceAttribution(copyright: nil),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .floodRisk,
            name: "Watersheds",
            sourceKind: .arcGISDynamic,
            sourceURL: URL(string: "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: arcGISDynamicMinimumZoom,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "flood-risk",
            attribution: provinceAttribution(copyright: nil),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .waterfalls,
            name: "Waterfalls",
            sourceKind: .arcGISDynamic,
            sourceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: arcGISDynamicMinimumZoom,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "waterfalls",
            attribution: provinceAttribution(copyright: nil),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .churchInverness,
            name: "Church — Inverness County",
            sourceKind: .remoteXYZTemplate,
            sourceURL: nil,
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-inverness",
            attribution: rumseyAttribution,
            userCaveat: "A.F. Church county map (published 1884); tiles pending, not yet displayed. Historical reference, not for navigation."
        ),
        LayerDescriptor(
            id: .churchVictoria,
            name: "Church — Victoria County",
            sourceKind: .remoteXYZTemplate,
            sourceURL: nil,
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-victoria",
            attribution: rumseyAttribution,
            userCaveat: "A.F. Church county map (published 1884); tiles pending, not yet displayed. Historical reference, not for navigation."
        ),
        LayerDescriptor(
            id: .churchRichmond,
            name: "Church — Richmond County",
            sourceKind: .remoteXYZTemplate,
            sourceURL: nil,
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-richmond",
            attribution: rumseyAttribution,
            userCaveat: "A.F. Church county map (published 1885); tiles pending, not yet displayed. Historical reference, not for navigation."
        ),
        LayerDescriptor(
            id: .churchCapeBreton,
            name: "Church — Cape Breton County",
            sourceKind: .remoteXYZTemplate,
            sourceURL: nil,
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-cape-breton",
            attribution: rumseyAttribution,
            userCaveat: "A.F. Church county map (published 1884); tiles pending, not yet displayed. Historical reference, not for navigation."
        )
    ]

    static func descriptor(for id: LayerID) -> LayerDescriptor? {
        all.first { $0.id == id }
    }

    private static var fletcherSourceURL: URL? {
        guard let key = configuredOldMapsOnlineKey else {
            return URL(string: oldMapsOnlineFletcherTemplate)
        }

        let encodedKey = key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key
        return URL(string: "\(oldMapsOnlineFletcherTemplate)?key=\(encodedKey)")
    }

    private static var configuredOldMapsOnlineKey: String? {
        [
            Bundle.main.object(forInfoDictionaryKey: "OldMapsOnlineAPIKey") as? String,
            ProcessInfo.processInfo.environment["OLDMAPSONLINE_API_KEY"]
        ]
        .compactMap { $0 }
        .compactMap(normalizedOldMapsOnlineKey)
        .first
    }

    nonisolated private static func normalizedOldMapsOnlineKey(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              !trimmed.contains("$("),
              !trimmed.hasPrefix("<") else {
            return nil
        }
        return trimmed
    }

    private static func provinceAttribution(copyright: String?) -> LayerAttribution {
        LayerAttribution(
            provider: "Province of Nova Scotia",
            copyright: copyright,
            disclaimer: provinceDisclaimer,
            licenseTitle: "Province of Nova Scotia Restricted Geographic Services License",
            licenseURL: nil,
            bundledLicenseResourceName: "ProvinceRestrictedGeographicServicesLicense.md"
        )
    }
}
