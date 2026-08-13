import Foundation
import MapCatalog
import NSDataServices
import OSLog

enum LayerCatalog {
    private static let provinceDisclaimer = "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions."
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
            sourceKind: .fletcherSheetPyramid,
            sourceURL: fletcherTileBaseURL,
            defaultOpacity: 1.0,
            defaultVisibility: true,
            // The pyramid the render pipeline produced, and nothing outside it.
            // MapKit asks an overlay for every tile in view, so a wider range
            // here is not harmless: it is a 404 for every tile at every zoom
            // the sheets were never rendered at. Past 16 MapKit scales the
            // zoom-16 tiles up, which is what Leaflet's `maxNativeZoom` does on
            // the web.
            minZoom: FletcherSheets.zoomRange.lowerBound,
            maxZoom: FletcherSheets.zoomRange.upperBound,
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

    /// Where the Fletcher tile build is hosted, or `nil` if it is not hosted
    /// yet.
    ///
    /// `nil` is a real state, not a failure: the sheets are rendered from the
    /// David Rumsey scans by our own pipeline, and until that build is behind
    /// an HTTPS host there is nothing to point at. The layer is then not
    /// installed at all — better an absent row than a switch that does nothing.
    ///
    /// A malformed or unsafe value is different, and `normalizeBaseURL` throws
    /// on it. Swallowing that would turn a misconfigured build into a silently
    /// missing feature; it is logged and treated as unhosted, which is the only
    /// safe reading, but the log is what makes it findable.
    ///
    /// The log is `os.Logger` rather than `assertionFailure` because the case
    /// that needs finding is the release build shipped with a bad host, and an
    /// assertion is compiled out of exactly that build. Refusing the value is
    /// still right — an unusable base URL must not become a request — so this
    /// records and continues rather than trapping.
    /// `nonisolated` because `normalizedBuildSetting` is, and the target
    /// compiles with `-default-isolation=MainActor`, which would otherwise put
    /// this on the main actor and make it unreachable from there. `Logger` is
    /// `Sendable`, so there is nothing to protect.
    nonisolated private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "ns-marks-the-spot",
        category: "LayerCatalog"
    )

    static var fletcherTileBaseURL: URL? {
        let configured = [
            Bundle.main.object(forInfoDictionaryKey: "FletcherTileBaseURL") as? String,
            ProcessInfo.processInfo.environment["FLETCHER_TILE_BASE_URL"]
        ]
        .compactMap { $0 }
        .compactMap(normalizedBuildSetting)
        .first

        do {
            return try FletcherTileURL.normalizeBaseURL(configured)
        } catch {
            logger.error("FletcherTileBaseURL is set but unusable: \(String(describing: error))")
            return nil
        }
    }

    /// Drops a build setting that was never substituted.
    ///
    /// An unset `$(FLETCHER_TILE_BASE_URL)` reaches the Info.plist as the
    /// literal `$(FLETCHER_TILE_BASE_URL)`, and a placeholder left in a config
    /// file reaches it as `<your-host-here>`. Both are "not configured", not
    /// values to parse.
    nonisolated static func normalizedBuildSetting(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              !trimmed.contains("$("),
              !trimmed.hasPrefix("<") else {
            return nil
        }
        // The one host this app may never read Fletcher tiles from. The David
        // Rumsey permission recorded in `docs/FLETCHER_GEOREFERENCING.md` covers
        // the scans we render ourselves and explicitly does not extend to
        // OldMapsOnline-derived tiles, warps, bounds or endpoints. Enforced here
        // rather than documented because the failure mode is a build setting
        // pointed back at the retired source by someone reaching for the
        // quickest way to make the layer appear — which is exactly the moment a
        // comment is not read.
        guard !trimmed.lowercased().contains("oldmapsonline") else {
            logger.error("Refusing FletcherTileBaseURL: the Rumsey permission does not cover OldMapsOnline-derived tiles")
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
