import Foundation
import GeoCore

/// How a layer's pixels or features are obtained.
///
/// This is the field that decides which code path renders a layer, so it is
/// modelled explicitly rather than inferred from whether `serviceURL` looks
/// like a MapServer.
public enum LayerDelivery: String, Hashable, Sendable, Codable {
    /// Server-rendered image from an ArcGIS `/export` endpoint.
    case mapExport = "map-export"
    /// GeoJSON features queried per viewport from an ArcGIS FeatureServer.
    case featureQuery = "feature-query"
    /// Parcels the app derives itself by intersecting other layers.
    case derivedParcelQuery = "derived-parcel-query"
    /// A whole GeoJSON document fetched once from an open-data endpoint.
    case geoJSONEndpoint = "geojson-endpoint"
    /// A GeoJSON document shipped inside the app.
    ///
    /// Distinct from `geoJSONEndpoint` because it makes no request at all. The
    /// layer still records the `serviceURL` it was derived from — that is
    /// provenance for the caveat text, not something to fetch — and treating
    /// that URL as live would send a request the web never makes, to a
    /// Province host, for data already on disk.
    case bundledGeoJSON = "bundled-geojson"
    /// Pre-rendered XYZ tiles.
    case xyzTemplate = "xyz-template"
    /// Catalogued, but nothing fetches it.
    case unavailable
}

/// Whether a layer can actually be displayed today.
public enum LayerAvailability: String, Hashable, Sendable, Codable {
    case available
    /// Catalogued, but the rights to display the scan are not settled.
    case rightsPending = "rights-pending"
    /// Rights are fine; nobody is hosting the tiles yet.
    case hostingPending = "hosting-pending"
}

/// Query parameters for an ArcGIS `/export` request.
///
/// `dynamicLayers` is carried as the already-minified JSON string rather than a
/// modelled tree. The web builds it with `JSON.stringify` over an object
/// literal, and the byte sequence is what reaches the service — re-encoding it
/// from Swift types would reorder keys and produce a different, though
/// equivalent, request. The parity test compares these strings exactly.
public struct ArcGISExportOptions: Hashable, Sendable {
    public let transparent: Bool
    public let layers: String?
    public let dynamicLayers: String?
    public let dpi: Int?

    public init(
        transparent: Bool,
        layers: String? = nil,
        dynamicLayers: String? = nil,
        dpi: Int? = nil
    ) {
        self.transparent = transparent
        self.layers = layers
        self.dynamicLayers = dynamicLayers
        self.dpi = dpi
    }
}

/// One layer, as both surfaces describe it.
///
/// The fields here are the ones every layer has. Type-specific extras — zoning
/// field mappings, environmental-health risk bands, marker colours — belong to
/// the phases that render those layers and are deliberately absent; the parity
/// test names them so their absence is a recorded decision rather than an
/// oversight.
/// One band of a health screen's legend, as the province draws it.
public struct LayerRiskBand: Hashable, Sendable {
    public let label: String
    /// The province's own hex, so the swatch beside the label is the colour on
    /// the map rather than an approximation of it.
    public let colorHex: String

    public init(label: String, colorHex: String) {
        self.label = label
        self.colorHex = colorHex
    }
}

public struct LayerDescriptor: Identifiable, Hashable, Sendable {
    public let id: LayerID
    public let name: String
    public let group: LayerGroupID
    /// Position in the single top-to-bottom order the layer panel presents.
    public let uiOrder: Int
    /// `nil` only for `mineral-proximity-parcels`, which the app derives rather
    /// than fetches and which carries `requiresProvinceClearance` directly.
    public let licence: LayerLicence?
    public let delivery: LayerDelivery
    public let availability: LayerAvailability
    public let serviceURL: URL?
    public let sourceURL: URL?
    public let licenceURL: URL?
    /// Where the source explains what its own numbers mean.
    ///
    /// Only the well logs carry one, and it is the reason the field exists
    /// separately from `sourceURL`: the download page hands over the database,
    /// while the manual is what defines the location-accuracy bands the marker
    /// shapes stand for. A reader deciding whether a hollow marker is a well
    /// or a report about an area needs the second document, not the first.
    public let manualURL: URL?
    public let minZoom: Int
    public let maxZoom: Int
    /// Highest zoom the source actually publishes. Above it the renderer
    /// upsamples rather than requesting a tile that does not exist.
    public let maxNativeZoom: Int?
    /// `nil` only for `mineral-proximity-parcels`, which the web declares
    /// without one: it draws with the parcel overlay's own styling rather
    /// than as a layer with an opacity of its own. Defaulting it to 1 would
    /// have been a number this app invented.
    public let opacity: Double?
    public let webDefaultVisible: Bool
    public let nativeDefaultVisible: Bool
    public let caveat: String
    public let sourceDate: String
    public let scale: String
    public let coverage: String
    public let exportOptions: ArcGISExportOptions?
    public let exportOverlayOptions: ArcGISExportOptions?
    /// The province's own advice about this layer, in the province's own words.
    ///
    /// Empty for every layer that is not a health screen. These four rasters
    /// carry no popup and no feature to tap, so the panel row is the only place
    /// a reader can meet the advice before acting on a colour — and the advice
    /// is what separates "this bedrock unit has a high rate of exceedances" from
    /// "the water at this address is unsafe", which the map never says.
    public let guidance: String
    /// The legend the province draws the layer with, in its order.
    ///
    /// Empty where the layer rates nothing: the surficial-aquifer extent is a
    /// context layer, and giving it bands would invent a risk claim the source
    /// does not make.
    public let riskBands: [LayerRiskBand]
    /// Set directly for the derived parcel layer, which has no `licence`.
    private let requiresProvinceLicence: Bool

    /// Whether a request for this layer needs an accepted Province licence.
    ///
    /// Reads both sources, because they disagree in shape: fifteen layers
    /// declare `province-restricted`, and `mineral-proximity-parcels` declares
    /// no licence at all but sets `requiresProvinceLicence` — it is derived
    /// from NSPRD geometry, so serving it is a restricted use even though the
    /// layer fetches nothing directly. A gate reading only `licence` would let
    /// that one through.
    public var requiresProvinceClearance: Bool {
        requiresProvinceLicence || licence?.requiresProvinceClearance == true
    }

    public init(
        id: LayerID,
        name: String,
        group: LayerGroupID,
        uiOrder: Int,
        licence: LayerLicence?,
        delivery: LayerDelivery,
        availability: LayerAvailability = .available,
        serviceURL: URL?,
        sourceURL: URL? = nil,
        licenceURL: URL? = nil,
        manualURL: URL? = nil,
        minZoom: Int,
        maxZoom: Int,
        maxNativeZoom: Int? = nil,
        opacity: Double? = nil,
        webDefaultVisible: Bool,
        nativeDefaultVisible: Bool = false,
        requiresProvinceLicence: Bool = false,
        caveat: String,
        sourceDate: String,
        scale: String,
        coverage: String,
        exportOptions: ArcGISExportOptions? = nil,
        exportOverlayOptions: ArcGISExportOptions? = nil,
        guidance: String = "",
        riskBands: [LayerRiskBand] = []
    ) {
        self.id = id
        self.name = name
        self.group = group
        self.uiOrder = uiOrder
        self.licence = licence
        self.delivery = delivery
        self.availability = availability
        self.serviceURL = serviceURL
        self.sourceURL = sourceURL
        self.licenceURL = licenceURL
        self.manualURL = manualURL
        self.minZoom = minZoom
        self.maxZoom = maxZoom
        self.maxNativeZoom = maxNativeZoom
        self.opacity = opacity
        self.webDefaultVisible = webDefaultVisible
        self.nativeDefaultVisible = nativeDefaultVisible
        self.requiresProvinceLicence = requiresProvinceLicence
        self.caveat = caveat
        self.sourceDate = sourceDate
        self.scale = scale
        self.coverage = coverage
        self.exportOptions = exportOptions
        self.exportOverlayOptions = exportOverlayOptions
        self.guidance = guidance
        self.riskBands = riskBands
    }
}

extension LayerDescriptor {
    /// Whether this layer renders as server-rendered raster tiles.
    public var isRaster: Bool {
        delivery == .mapExport || delivery == .xyzTemplate
    }

    public var zoomRange: ClosedRange<Int> {
        minZoom...maxZoom
    }

    public func supports(zoom: Int) -> Bool {
        zoomRange.contains(zoom)
    }
}
