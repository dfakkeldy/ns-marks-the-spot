import Foundation

/// A bounding box in EPSG:3857 metres.
public struct WebMercatorBox: Hashable, Sendable {
    public var minX: Double
    public var minY: Double
    public var maxX: Double
    public var maxY: Double

    public init(minX: Double, minY: Double, maxX: Double, maxY: Double) {
        self.minX = minX
        self.minY = minY
        self.maxX = maxX
        self.maxY = maxY
    }
}

/// Slippy-map and Web Mercator conversions shared by tile fetching, offline
/// planning and ArcGIS `/export` requests.
///
/// The two halves come from two places and are kept together because they must
/// agree: `webMercatorBounds` is ported from `web/src/layers/arcGISExport.ts`,
/// and `tileXY` from the private helper in the native `FletcherTilePlanner`.
/// Both surfaces previously owned a private copy; a disagreement between them
/// shows up as a half-tile offset in a downloaded area, which is hard to see and
/// harder to attribute.
public enum TileMath {
    /// Half the Web Mercator world extent in metres — the projection's usable
    /// edge at ±85.051129°.
    public static let webMercatorWorldExtent = 20_037_508.342_789_244

    /// The latitude where Web Mercator's ordinate goes to infinity. Inputs are
    /// clamped here rather than allowed to produce infinite tile indices.
    public static let maxWebMercatorLatitude = 85.051_128_779_806_59

    /// EPSG:3857 bounds of a slippy-map tile.
    public static func webMercatorBounds(x: Int, y: Int, z: Int) -> WebMercatorBox {
        let tileSpan = (2 * webMercatorWorldExtent) / pow(2, Double(z))
        let minX = -webMercatorWorldExtent + Double(x) * tileSpan
        let maxY = webMercatorWorldExtent - Double(y) * tileSpan
        return WebMercatorBox(
            minX: minX,
            minY: maxY - tileSpan,
            maxX: minX + tileSpan,
            maxY: maxY
        )
    }

    /// Slippy-map tile containing a coordinate, clamped into the valid range.
    ///
    /// Clamping is what keeps a bounds rectangle dragged past the antimeridian
    /// or over a pole from planning tiles that cannot exist.
    public static func tileXY(
        latitude: Double,
        longitude: Double,
        zoom: Int
    ) -> (x: Int, y: Int) {
        let clampedLatitude = min(max(latitude, -maxWebMercatorLatitude), maxWebMercatorLatitude)
        let latitudeRadians = clampedLatitude * .pi / 180
        let tilesAtZoom = pow(2.0, Double(zoom))
        let x = Int(floor((longitude + 180.0) / 360.0 * tilesAtZoom))
        let y = Int(
            floor(
                (1.0 - log(tan(latitudeRadians) + 1.0 / cos(latitudeRadians)) / .pi)
                    / 2.0 * tilesAtZoom
            )
        )
        let clampedMax = Int(tilesAtZoom) - 1
        return (min(max(x, 0), clampedMax), min(max(y, 0), clampedMax))
    }

    /// North-west corner of a tile in WGS84 — the inverse of `tileXY` at the
    /// tile's origin, used to turn planned tiles back into geography.
    public static func northWestCorner(x: Int, y: Int, z: Int) -> GeoPoint {
        let tilesAtZoom = pow(2.0, Double(z))
        let longitude = Double(x) / tilesAtZoom * 360.0 - 180.0
        let latitudeRadians = atan(sinh(.pi * (1 - 2 * Double(y) / tilesAtZoom)))
        return GeoPoint(lat: latitudeRadians * 180.0 / .pi, lng: longitude)
    }

    /// The WGS84 rectangle a tile covers.
    ///
    /// The companion to `webMercatorBounds`, in the units a layer's declared
    /// extent is written in. Needed because MapKit hands an overlay a
    /// `(z, x, y)` and asks for pixels, while a bounded layer — a Fletcher
    /// sheet, a user-loaded scan — knows only its lat/lng corners; something
    /// has to put the two in the same space before a request is made.
    ///
    /// Y is inverted relative to latitude: tile row `y` runs from the north-west
    /// corner of `y` down to the north-west corner of `y + 1`.
    public static func geographicBounds(x: Int, y: Int, z: Int) -> GeoBoundingBox {
        let northWest = northWestCorner(x: x, y: y, z: z)
        let southEast = northWestCorner(x: x + 1, y: y + 1, z: z)
        return GeoBoundingBox(
            south: southEast.lat,
            west: northWest.lng,
            north: northWest.lat,
            east: southEast.lng
        )
    }
}
