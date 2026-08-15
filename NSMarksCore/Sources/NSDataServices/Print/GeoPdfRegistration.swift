import Foundation
import GeoCore

/// The two dictionaries that make an exported page a GeoPDF.
///
/// Ported from `web/src/print/pdf/geoRegistration.ts`. Both flavours are
/// written, because the readers in the field disagree about which one is the
/// standard: ISO 32000's `/VP` + `/Measure`, and the older OGC Best Practice
/// `/LGIDict` that GDAL and several handheld apps still look for first.
///
/// The declared CRS is EPSG:3857 because the composited raster *is* Web
/// Mercator. Declaring the raster's own projection makes the pixel-to-ground
/// relation exact at every pixel rather than only at the corners, which is what
/// a reader measuring off the printed page depends on.
public enum GeoPdfRegistration {
    static let webMercatorWKT =
        #"PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984","#
        + #"SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],"#
        + #"UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],"#
        + #"PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],"#
        + #"PARAMETER["latitude_of_origin",0],PARAMETER["false_easting",0],"#
        + #"PARAMETER["false_northing",0],UNIT["metre",1],"#
        + #"AUTHORITY["EPSG","3857"]]"#

    /// ISO 32000 `/VP`: one viewport covering the map frame, measured in
    /// WGS 84 latitude and longitude.
    ///
    /// LPTS corners run SW, NW, NE, SE in the viewport's unit square with v=0
    /// at the bottom; GPTS pairs are (latitude, longitude) in that same corner
    /// order. Written as direct objects rather than references, because a
    /// reader that skips unresolved indirect references — this app's own
    /// GeoPDF parser among them — would otherwise find no registration at all.
    public static func viewport(bounds: GeoBoundingBox, mapFrame: PdfRect) -> PdfObject {
        let measure = PdfObject.dictionary([
            ("Type", .name("Measure")),
            ("Subtype", .name("GEO")),
            ("Bounds", .array([0, 0, 0, 1, 1, 1, 1, 0].map { PdfObject.integer($0) })),
            ("LPTS", .array([0, 0, 0, 1, 1, 1, 1, 0].map { PdfObject.integer($0) })),
            (
                "GPTS",
                .array(
                    [
                        bounds.south, bounds.west,
                        bounds.north, bounds.west,
                        bounds.north, bounds.east,
                        bounds.south, bounds.east,
                    ].map { PdfObject.number($0) }
                )
            ),
            (
                "GCS",
                .dictionary([
                    ("Type", .name("PROJCS")),
                    ("EPSG", .integer(3857)),
                    ("WKT", .hexString(webMercatorWKT)),
                ])
            ),
        ])

        return .array([
            .dictionary([
                ("Type", .name("Viewport")),
                (
                    "BBox",
                    .array([
                        .number(mapFrame.x),
                        .number(mapFrame.y),
                        .number(mapFrame.x + mapFrame.width),
                        .number(mapFrame.y + mapFrame.height),
                    ])
                ),
                ("Name", .hexString("Map frame")),
                ("Measure", measure),
            ])
        ])
    }

    /// OGC Best Practice `/LGIDict`.
    ///
    /// The CTM maps PDF points to EPSG:3857 metres. The neatline is the map
    /// frame as an explicitly closed ring: the Phase 0 GeoPDF spike recorded
    /// GDAL warning "Non closed ring" against producers that leave it open, and
    /// a warning on import is a thing a reader has to decide whether to trust.
    public static func lgiDict(bounds: GeoBoundingBox, mapFrame: PdfRect) -> PdfObject {
        let left = mapFrame.x
        let bottom = mapFrame.y
        let right = mapFrame.x + mapFrame.width
        let top = mapFrame.y + mapFrame.height

        let northWest = WebMercator.project(GeoPoint(lat: bounds.north, lng: bounds.west))
        let southEast = WebMercator.project(GeoPoint(lat: bounds.south, lng: bounds.east))
        let scaleX = (southEast.x - northWest.x) / mapFrame.width
        let scaleY = (northWest.y - southEast.y) / mapFrame.height

        return .array([
            .dictionary([
                ("Type", .name("LGIDict")),
                ("Version", .hexString("2.1")),
                ("Description", .hexString("Map frame")),
                (
                    "CTM",
                    .array(
                        [
                            scaleX, 0, 0, scaleY,
                            northWest.x - scaleX * left,
                            southEast.y - scaleY * bottom,
                        ].map { PdfObject.number($0) }
                    )
                ),
                (
                    "Neatline",
                    .array(
                        [
                            left, bottom, left, top, right, top, right, bottom, left, bottom,
                        ].map { PdfObject.number($0) }
                    )
                ),
                (
                    "Projection",
                    .dictionary([
                        ("Type", .name("Projection")),
                        // A PDF *string*, not a name. GDAL rejects the whole
                        // projection object — "Cannot find ProjectionType" —
                        // when this arrives as `/MC`, and then falls back to
                        // reporting page pixels instead of ground coordinates.
                        ("ProjectionType", .string("MC")),
                        // The datum is spelled out rather than given as the
                        // code "WGE", because "WGE" means the WGS 84
                        // *ellipsoid* and the CTM above is in spherical Web
                        // Mercator metres. Read against the ellipsoid, this
                        // frame came back 46.392°N where it should have said
                        // 46.2°N — about 21 km north. An inverse flattening of
                        // zero is what makes the reader's Mercator spherical
                        // and the two agree exactly.
                        (
                            "Datum",
                            .dictionary([
                                ("Description", .string("WGS 84 sphere")),
                                (
                                    "Ellipsoid",
                                    .dictionary([
                                        ("Description", .string("WGS 84 sphere")),
                                        ("SemiMajorAxis", .number(WebMercator.earthRadiusMetres)),
                                        ("InvFlattening", .number(0)),
                                    ])
                                ),
                            ])
                        ),
                        ("Units", .string("m")),
                        ("CentralMeridian", .integer(0)),
                        ("OriginLatitude", .integer(0)),
                        ("FalseEasting", .integer(0)),
                        ("FalseNorthing", .integer(0)),
                        // Web Mercator is true to scale at the equator, so this
                        // is 1. A zero here is not "unset": PROJ refuses it
                        // outright with "Invalid value for k/k_0", and the file
                        // loses its georeferencing entirely.
                        ("ScaleFactor", .integer(1)),
                    ])
                ),
            ])
        ])
    }
}
