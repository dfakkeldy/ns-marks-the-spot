import Foundation
import GeoCore
import MapCatalog

/// What a map setup consists of, as far as saving and restoring one goes.
///
/// The four things a theme actually moves: which layers are drawn, at what
/// opacity, whether tax-sale information is shown at all, and which record set
/// it reads. Not the position — a theme is what the map shows, not where it is
/// looking, and applying one should leave the reader over the same ground.
///
/// `layerIDs` carries `MapShareState.modernBaseLayerID` for the OpenStreetMap
/// base, as the shared link does, so a theme and a link name the same layers.
public struct MapThemeState: Sendable, Equatable {
    public var layerIDs: [String]
    /// Layers the reader has moved off the opacity the catalog declares.
    ///
    /// Only the differences. Recording every layer's opacity would make a theme
    /// saved today disagree with the catalog tomorrow, and the catalog is the
    /// value both surfaces draw at.
    public var opacityOverrides: [String: Double]
    public var taxSaleEnabled: Bool
    public var mode: MapShareState.Mode

    public init(
        layerIDs: [String] = [],
        opacityOverrides: [String: Double] = [:],
        taxSaleEnabled: Bool = false,
        mode: MapShareState.Mode = .current
    ) {
        self.layerIDs = layerIDs
        self.opacityOverrides = opacityOverrides
        self.taxSaleEnabled = taxSaleEnabled
        self.mode = mode
    }
}

/// A named map setup: the five the app ships, and the ones the reader saves.
///
/// A port of the web's `mapThemes.ts`. The five built-ins carry the same IDs,
/// names, layers and sections there and here, and `MapThemeTests` checks them
/// against the fixture the web exports rather than against a second Swift copy
/// of the same list.
///
/// A theme is a starting point, not a claim about the ground. "Tax Sale
/// Research" turns on the notices and the property context somebody researching
/// a sale usually wants open; it does not assert that those layers answer the
/// question, and every licence gate, coverage note and provenance line the
/// layers carry is unchanged by having been switched on this way.
public struct MapTheme: Identifiable, Sendable, Equatable {
    public enum Kind: String, Sendable, Equatable, Codable {
        case builtIn = "built-in"
        case custom
    }

    public let id: String
    public let kind: Kind
    public var name: String
    /// The line under the picker, in the web's words.
    public var description: String
    public var state: MapThemeState
    /// Which panel sections this theme opens.
    ///
    /// Part of the setup rather than decoration: a theme that switches on seven
    /// layers across four sections and leaves the panel showing Background Maps
    /// has hidden everything it just did.
    public var preferredCategoryIDs: [LayerCategoryID]

    public init(
        id: String,
        kind: Kind,
        name: String,
        description: String,
        state: MapThemeState,
        preferredCategoryIDs: [LayerCategoryID]
    ) {
        self.id = id
        self.kind = kind
        self.name = name
        self.description = description
        self.state = state
        self.preferredCategoryIDs = preferredCategoryIDs
    }
}

extension MapTheme {
    /// Every layer ID a theme may name: the catalog, plus the web's name for
    /// the OpenStreetMap base.
    public static let themeableLayerIDs: Set<String> = Set(
        LayerID.allCases.map(\.rawValue)
    ).union([MapShareState.modernBaseLayerID])

    /// The five setups the app ships, in the picker's order.
    public static let builtIn: [MapTheme] = [
        MapTheme(
            id: "explore-nova-scotia",
            kind: .builtIn,
            name: "Explore Nova Scotia",
            description: "A clean modern map for general exploration.",
            state: MapThemeState(layerIDs: [MapShareState.modernBaseLayerID]),
            preferredCategoryIDs: [.backgroundMaps]
        ),
        MapTheme(
            id: "tax-sale-research",
            kind: .builtIn,
            name: "Tax Sale Research",
            description: "Current notices with property, road, water, and building context.",
            state: MapThemeState(
                layerIDs: ["ns-aerial", "nsprd", "roads", "water-features", "buildings"],
                taxSaleEnabled: true
            ),
            preferredCategoryIDs: [.taxSale, .landProperty]
        ),
        MapTheme(
            id: "forestry-field-access",
            kind: .builtIn,
            name: "Forestry & Field Access",
            description: "Aerial, land, access, terrain, and old-growth policy context.",
            state: MapThemeState(
                layerIDs: [
                    "ns-aerial", "nsprd", "crown-lands", "roads",
                    "water-features", "contours", "old-growth-policy",
                ]
            ),
            preferredCategoryIDs: [.forestryEcology, .landProperty, .roadsPlaces, .waterTerrain]
        ),
        MapTheme(
            id: "historical-maps",
            kind: .builtIn,
            name: "Historical Maps",
            description: "Fletcher mapping with modern roads and place references.",
            state: MapThemeState(
                layerIDs: [
                    MapShareState.modernBaseLayerID, "fletcher", "place-names", "main-roads",
                ]
            ),
            preferredCategoryIDs: [.historicalMaps, .roadsPlaces]
        ),
        MapTheme(
            id: "georeferencing",
            kind: .builtIn,
            name: "Georeferencing",
            description: "A clean reference setup for positioning your own maps.",
            state: MapThemeState(
                layerIDs: [MapShareState.modernBaseLayerID, "place-names", "main-roads"]
            ),
            preferredCategoryIDs: [.myMaps, .backgroundMaps, .roadsPlaces]
        ),
    ]

    /// What is wrong with this theme, in the web's words, or nothing.
    ///
    /// Unknown category IDs have no Swift equivalent — `LayerCategoryID` is an
    /// enum, so an unreadable one never gets this far — but layer IDs are
    /// strings on both surfaces, because `"modern"` is not a catalog layer.
    public static func validate(_ theme: MapTheme) -> [String] {
        var errors: [String] = []
        var seenLayerIDs: Set<String> = []
        var seenCategoryIDs: Set<LayerCategoryID> = []

        for layerID in theme.state.layerIDs {
            if !themeableLayerIDs.contains(layerID) {
                errors.append("unknown layer ID: \(layerID)")
            } else if seenLayerIDs.contains(layerID) {
                errors.append("duplicate layer ID: \(layerID)")
            } else {
                seenLayerIDs.insert(layerID)
            }
        }

        for layerID in theme.state.opacityOverrides.keys.sorted() {
            let opacity = theme.state.opacityOverrides[layerID]!
            if !themeableLayerIDs.contains(layerID) {
                errors.append("unknown opacity layer ID: \(layerID)")
            }
            if !opacity.isFinite || opacity < 0 || opacity > 1 {
                errors.append("invalid opacity: \(layerID)")
            }
        }

        for categoryID in theme.preferredCategoryIDs {
            if seenCategoryIDs.contains(categoryID) {
                errors.append("duplicate category ID: \(categoryID.rawValue)")
            } else {
                seenCategoryIDs.insert(categoryID)
            }
        }

        // Two opaque backgrounds, one of which cannot be seen. Not a rendering
        // problem so much as a false one: a reader looking at aerial imagery
        // with the modern map switched on underneath is told two maps are
        // shown and can only be reading one.
        if seenLayerIDs.contains(MapShareState.modernBaseLayerID),
           seenLayerIDs.contains(LayerID.nsAerial.rawValue) {
            errors.append("opaque background")
        }

        return errors
    }
}

/// What this build and this reader can actually draw.
///
/// Availability and permission are separate questions and stay separate here: a
/// layer this build has no source for is missing, and a layer behind the
/// Province licence is refused. A theme naming either is applied without it,
/// and the picker says which, because a setup that quietly dropped a layer
/// would leave the reader looking at less than they asked for and no note of it.
public struct ThemeCapabilities: Sendable, Equatable {
    public var licenceAccepted: Bool
    public var availableLayerIDs: Set<String>
    public var restrictedLayerIDs: Set<String>

    public init(
        licenceAccepted: Bool,
        availableLayerIDs: Set<String>,
        restrictedLayerIDs: Set<String>
    ) {
        self.licenceAccepted = licenceAccepted
        self.availableLayerIDs = availableLayerIDs
        self.restrictedLayerIDs = restrictedLayerIDs
    }
}

/// A theme narrowed to what can be applied here, and what had to be left out.
public struct ResolvedTheme: Sendable, Equatable {
    public enum Status: String, Sendable, Equatable {
        case exact
        case partial
    }

    public var target: MapThemeState
    public var preferredCategoryIDs: [LayerCategoryID]
    /// Named by the theme, behind a licence the reader has not accepted.
    public var blockedLayerIDs: [String]
    /// Named by the theme, not carried by this build at all.
    public var unavailableLayerIDs: [String]
    public var status: Status

    public init(
        target: MapThemeState,
        preferredCategoryIDs: [LayerCategoryID],
        blockedLayerIDs: [String],
        unavailableLayerIDs: [String],
        status: Status
    ) {
        self.target = target
        self.preferredCategoryIDs = preferredCategoryIDs
        self.blockedLayerIDs = blockedLayerIDs
        self.unavailableLayerIDs = unavailableLayerIDs
        self.status = status
    }
}

extension MapTheme {
    /// The overrides that still describe something: a layer that is on.
    ///
    /// An opacity carried for a layer the theme does not draw is a value with
    /// nothing to apply it to, and two setups that differ only in such a value
    /// are the same setup.
    public static func normalizeOpacityOverrides(
        layerIDs: [String],
        overrides: [String: Double]
    ) -> [String: Double] {
        let drawn = Set(layerIDs)
        return overrides.filter { drawn.contains($0.key) }
    }

    /// This theme as it can be applied here.
    public func resolved(with capabilities: ThemeCapabilities) -> ResolvedTheme {
        let unavailable = state.layerIDs.filter {
            !capabilities.availableLayerIDs.contains($0)
        }
        let blocked = state.layerIDs.filter {
            capabilities.availableLayerIDs.contains($0)
                && capabilities.restrictedLayerIDs.contains($0)
                && !capabilities.licenceAccepted
        }
        let excluded = Set(unavailable).union(blocked)
        let layerIDs = state.layerIDs.filter { !excluded.contains($0) }

        return ResolvedTheme(
            target: MapThemeState(
                layerIDs: layerIDs,
                opacityOverrides: Self.normalizeOpacityOverrides(
                    layerIDs: layerIDs,
                    overrides: state.opacityOverrides
                ),
                taxSaleEnabled: state.taxSaleEnabled,
                mode: state.mode
            ),
            preferredCategoryIDs: preferredCategoryIDs,
            blockedLayerIDs: blocked,
            unavailableLayerIDs: unavailable,
            status: excluded.isEmpty ? .exact : .partial
        )
    }
}

extension MapThemeState {
    /// Whether these two setups are the same setup.
    ///
    /// The layer order does not count — the panel draws in catalog order
    /// whatever order a theme lists — and the record mode counts only when tax
    /// sales are on, because with them off it governs nothing the reader can
    /// see. Both are the web's rules, so a setup that reads as "Explore Nova
    /// Scotia" in the browser reads as "Explore Nova Scotia" here.
    public func matches(_ other: MapThemeState) -> Bool {
        layerIDs.sorted() == other.layerIDs.sorted()
            && opacityOverrides == other.opacityOverrides
            && taxSaleEnabled == other.taxSaleEnabled
            && (!taxSaleEnabled || mode == other.mode)
    }
}

extension MapTheme {
    /// The first theme this setup already is, if it is one.
    public static func match(_ state: MapThemeState, in themes: [MapTheme]) -> MapTheme? {
        themes.first { state.matches($0.state) }
    }
}
