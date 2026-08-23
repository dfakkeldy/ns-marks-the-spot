import Foundation
import GeoCore
import MapCatalog

/// How a layer behaves when the device is offline.
///
/// Native-only: the web has no saved areas, so the shared catalog carries no
/// equivalent and this is derived rather than listed.
nonisolated enum LayerOfflinePolicy: Equatable, Sendable {
    case savedAreaDownloadable
    case viewedCacheOnly
    case onlineOnly
}

/// The things `MapCatalog.LayerDescriptor` deliberately does not carry.
///
/// The shared descriptor is parity-locked to the web's export and is the single
/// source of truth for identity, group, panel order, licence, zoom range and
/// export parameters. Three things are absent from it, and none of them is an
/// oversight:
///
/// - `attribution` is named in `LayerCatalogParityTests.deferredFields`, because
///   the web renders credit from its own strings and there is nothing in the
///   export to compare against. Provider, copyright and the bundled licence
///   document are native data.
/// - MapKit's notion of a *basemap* has no web counterpart at all.
/// - What happens to a layer offline is a question only this app asks.
///
/// They live here, keyed by the same `GeoCore.LayerID`, so the app still has
/// exactly one layer id and exactly one catalog.
nonisolated enum NativeLayerTraits {
    private static let provinceDisclaimer = "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions."

    /// The layers installed as MapKit tile overlays, bottom of the stack first.
    ///
    /// `OverlayZIndex.installOrder` rather than catalog order: the panel lists
    /// layers in reading order and the map draws them in z-order, and the two
    /// are not the same sequence. MapKit has no z-index — an overlay added
    /// later draws over one added earlier — so install order *is* the z-order,
    /// and taking the panel's would put place-name labels under the parcels
    /// they are meant to label.
    ///
    /// It also drops the layers that are catalogued but not tile overlays: the
    /// four Church sheets, which have no tiles, and the vector layers, which
    /// arrive in a later phase.
    static let installOrder: [LayerID] = OverlayZIndex.installOrder(
        for: LayerCatalog.all.map(\.id)
    )

    /// The heading a panel section carries.
    ///
    /// Nine of these are the web's `<summary>` text verbatim, so a reader who
    /// has used both surfaces looks for the same words. `mapLayers` and
    /// `historical` have no heading there — they are the flat runs of rows above
    /// and below the collapsible sections — so those two names are this app's,
    /// which is why the whole table is native presentation rather than shared
    /// catalog data.
    ///
    /// The `<small>` line under each web heading is deliberately not copied
    /// either: it counts the layers *that* surface shows ("5 optional unofficial
    /// layers"), and this panel shows a different subset, so repeating it would
    /// state a count the rows underneath contradict.
    static func title(for group: LayerGroupID) -> String {
        switch group {
        case .mapLayers: return "Map layers"
        case .topography: return "Topography"
        case .forestry: return "Forestry"
        case .floodHazard: return "Flood hazard context"
        case .environmentalHealth: return "Environmental health screens"
        case .zoning: return "Municipal zoning"
        case .groundwater: return "Groundwater"
        case .hydroPilot: return "Micro-hydro pilot"
        case .geologyResources: return "Geology & Resources"
        case .church: return "Church (1860s–80s)"
        case .historical: return "Historical maps"
        }
    }

    /// A standing sentence under a section's rows, where the rows on their own
    /// would be read as more than they are.
    ///
    /// Only zoning has one, and only because zoning is the section where an
    /// empty map is genuinely ambiguous. A viewport with no polygon reports
    /// "Ready · 0 loaded", which is the same string a viewport whose
    /// municipality publishes no zoning GIS at all reports — and most of them
    /// publish none. Read as "no zoning applies", that is the difference
    /// between a lot somebody can build on and one they cannot.
    ///
    /// The other half of the web's note, that towns inside a county are
    /// separate zoning jurisdictions, is carried per layer in `coverage`. It is
    /// repeated here because it is the same mistake: the county layer drawing
    /// nothing over a town is not the town having no zoning.
    ///
    /// The web's "unofficial rendering, not for legal purposes" paragraph is
    /// not repeated. That one is already on every zoning feature the user taps,
    /// as `FeatureCallouts.zoningCaveat`.
    static func sectionNote(for group: LayerGroupID) -> String? {
        switch group {
        case .zoning:
            return "Nova Scotia publishes no provincial zoning layer, and most municipalities "
                + "publish no zoning GIS at all. An area with no polygon is an area this map "
                + "has no data for. It is not evidence that no zoning applies. Towns inside a "
                + "county are separate zoning jurisdictions, so a county layer does not cover "
                + "town parcels."
        default:
            return nil
        }
    }

    /// The layers the base-map picker can switch to.
    ///
    /// A set rather than a computed property on the descriptor, because being a
    /// basemap is not a property of the data — it is a claim that
    /// `MapBaseType` has a matching case and that `OverlayViewModel` knows how
    /// to swap it in. `basemapCapableLayersHaveABaseMapCase` asserts exactly
    /// that, so adding an id here without the rest fails a test rather than
    /// producing a picker entry that does nothing.
    static let basemapCapable: Set<LayerID> = [.nsAerial]

    /// Whether a saved area can hold this layer's tiles.
    ///
    /// Derived from `delivery`, but narrower than it looks: `TileDownloadManager`
    /// only knows how to plan Fletcher sheets, so `savedAreaDownloadable` is a
    /// promise this app can currently keep for exactly one layer.
    /// `onlyFletcherIsDownloadable` pins that, so a second `.xyzTemplate` layer
    /// cannot quietly acquire a Download button that does nothing.
    static func offlinePolicy(for descriptor: LayerDescriptor) -> LayerOfflinePolicy {
        switch descriptor.delivery {
        case .xyzTemplate:
            return .savedAreaDownloadable
        case .mapExport:
            return .viewedCacheOnly
        case .featureQuery, .derivedParcelQuery, .geoJSONEndpoint, .bundledGeoJSON, .unavailable:
            return .onlineOnly
        }
    }

    /// Who to credit, and under what licence.
    ///
    /// Keyed on `licence` rather than on the id, so a layer added to the shared
    /// catalog is credited correctly without an entry here. The one per-layer
    /// detail the licence cannot supply is NS Aerial's copyright line, which
    /// names the branch that publishes the imagery rather than the province.
    static func attribution(for descriptor: LayerDescriptor) -> LayerAttribution {
        switch descriptor.licence {
        case .provinceRestricted:
            return LayerAttribution(
                provider: "Province of Nova Scotia",
                copyright: descriptor.id == .nsAerial ? "Service Nova Scotia" : nil,
                disclaimer: provinceDisclaimer,
                licenseTitle: "Province of Nova Scotia Restricted Geographic Services License",
                licenseURL: descriptor.licenceURL,
                // Falls back to the copy shipped in the bundle when the service
                // publishes no licence URL of its own. The restricted licence is
                // the one a user is most likely to want to read before turning a
                // layer on, and it is not reliably reachable online.
                bundledLicenseResourceName: "ProvinceRestrictedGeographicServicesLicense.md"
            )
        case .provinceOpen:
            return LayerAttribution(
                provider: "Province of Nova Scotia",
                copyright: nil,
                disclaimer: provinceDisclaimer,
                licenseTitle: "Open Government Licence — Nova Scotia",
                licenseURL: descriptor.licenceURL
            )
        case .municipalOpen:
            return LayerAttribution(
                provider: "Municipal open data",
                copyright: nil,
                disclaimer: "Municipal data is published without warranty; confirm any conclusion with the municipality.",
                licenseTitle: "Municipal open data licence",
                licenseURL: descriptor.licenceURL
            )
        case .municipalNoStatedLicence:
            return LayerAttribution(
                provider: "Municipal source",
                copyright: nil,
                // Not a licence, and saying so is the point: this source states
                // no terms, which is different from stating permissive ones.
                disclaimer: "This municipality publishes no licence terms for this data. Treat it as reference only.",
                licenseTitle: nil,
                licenseURL: descriptor.licenceURL
            )
        case .rumseyReference:
            // "Stanford University Libraries" in full: this is the credit line
            // the collection asks for on any reproduction, word for word, and
            // the web carries it as `RUMSEY_ATTRIBUTION`.
            //
            // The licence is named and linked because Fletcher is the layer
            // this app opens showing and it composites into the printed sheet.
            // Without it a researcher can put Rumsey imagery into a client
            // report or a paid due-diligence package having been told only that
            // it is "for reference", with the app's own MIT licence reading as
            // though it covered the scans. It does not.
            return LayerAttribution(
                provider: "David Rumsey Map Collection, David Rumsey Map Center, "
                    + "Stanford University Libraries",
                copyright: nil,
                disclaimer: "Noncommercial use only. This project's georeferencing, clipping "
                    + "and tiling are derivatives and stay inside the licence's ShareAlike "
                    + "terms; the app's MIT software licence does not cover the imagery. "
                    + "Historical context only: not a survey, and it establishes no current "
                    + "parcels, title, legal access, roads, shoreline, flood conditions, "
                    + "value, permissions or services.",
                licenseTitle: "CC BY-NC-SA 3.0",
                licenseURL: descriptor.licenceURL
                    ?? URL(string: "https://creativecommons.org/licenses/by-nc-sa/3.0/")
            )
        case nil:
            // Only `mineral-proximity-parcels` reaches this, and it is derived
            // from NSPRD geometry rather than fetched, so the restricted terms
            // are the ones that apply to showing it.
            return LayerAttribution(
                provider: "Derived from Province of Nova Scotia data",
                copyright: nil,
                disclaimer: provinceDisclaimer,
                licenseTitle: "Province of Nova Scotia Restricted Geographic Services License",
                licenseURL: nil,
                bundledLicenseResourceName: "ProvinceRestrictedGeographicServicesLicense.md"
            )
        }
    }

    /// The caveat shown under a layer's name.
    ///
    /// The shared `caveat` verbatim, plus the offline note where it is not
    /// already implied. The two are separate sentences rather than a single
    /// string in the catalog because only one of them is web parity.
    static func caveat(for descriptor: LayerDescriptor) -> String {
        switch offlinePolicy(for: descriptor) {
        case .viewedCacheOnly:
            return "\(descriptor.caveat) · cached when viewed"
        case .savedAreaDownloadable, .onlineOnly:
            return descriptor.caveat
        }
    }
}
