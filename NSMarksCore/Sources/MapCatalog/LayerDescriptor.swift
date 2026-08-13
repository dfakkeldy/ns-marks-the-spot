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
    public let minZoom: Int
    public let maxZoom: Int
    /// Highest zoom the source actually publishes. Above it the renderer
    /// upsamples rather than requesting a tile that does not exist.
    public let maxNativeZoom: Int?
    public let opacity: Double
    public let webDefaultVisible: Bool
    public let nativeDefaultVisible: Bool
    public let caveat: String
    public let sourceDate: String
    public let scale: String
    public let coverage: String
    public let exportOptions: ArcGISExportOptions?
    public let exportOverlayOptions: ArcGISExportOptions?
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
        minZoom: Int,
        maxZoom: Int,
        maxNativeZoom: Int? = nil,
        opacity: Double,
        webDefaultVisible: Bool,
        nativeDefaultVisible: Bool = false,
        requiresProvinceLicence: Bool = false,
        caveat: String,
        sourceDate: String,
        scale: String,
        coverage: String,
        exportOptions: ArcGISExportOptions? = nil,
        exportOverlayOptions: ArcGISExportOptions? = nil
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
