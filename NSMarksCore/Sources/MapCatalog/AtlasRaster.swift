import Foundation

/// The three looks of the NS Marks Atlas, named as the web names them.
///
/// Day and Night are the modern map; Fletcher is the same modern geography in
/// the colours and lettering of Hugh Fletcher's 1884 Cape Breton sheets, and
/// is never a default on either surface.
public enum AtlasRasterStyle: String, CaseIterable, Sendable, Equatable {
    case day
    case night
    case fletcher

    /// The label the web's basemap picker uses (`atlasStyleLabels`).
    public var displayName: String {
        switch self {
        case .day: "Day"
        case .night: "Night"
        case .fletcher: "Fletcher"
        }
    }
}

/// The rendered-tile copy of the browser map's NS Marks Atlas, pinned.
///
/// The web draws the Atlas from a provincial vector-tile archive in the
/// browser (`web/src/atlas/style.ts`). MapKit has no vector renderer, so this
/// app draws the same cartography from raster tiles that
/// `web/scripts/atlasRaster/buildAtlasRaster.mjs` renders with the web's own
/// MapLibre build from the same style, glyphs, sprite and archive, and that
/// are published as an immutable revision beside the Fletcher sheets.
///
/// What is pinned here is the identity of that revision — its name, its zoom
/// range, its tile scheme — and the provincial snapshot beneath it. It lives
/// in the catalog for the reason `FletcherSheets` does: `AtlasRasterTests`
/// checks these values against the receipt the web ships, so one surface
/// cannot credit a snapshot the other is not drawing.
///
/// Three things are deliberately not claimed. The raster is a picture of the
/// web's map, not a second source: nothing here is surveyed detail beyond
/// what the archive holds, and closer zooms magnify the deepest rendered
/// level rather than adding precision. The supplemental OpenStreetMap context
/// in the tiles is as it was when they were rendered, not live. And a revision
/// named here is a build setting's address to point at, not proof that the
/// objects exist on the host — the overlay finds that out one tile at a time.
public enum AtlasRaster {
    /// The immutable package, under `<host>/atlas-raster/<revision>/`.
    ///
    /// Changing this is a release of new tiles, and the build's `source.json`
    /// receipt under the same prefix names the archive, style commit and
    /// renderer they were made from.
    public static let tileRevision = "atlas-raster-20260907.1"

    /// The directory every revision sits under, beside the Fletcher sheets.
    public static let packageDirectory = "atlas-raster"

    /// Zooms with rendered tiles, which are the zooms the provincial archive
    /// itself holds. A tile is rendered exactly where the archive has one at
    /// that address; every other address at these zooms is open water and is
    /// answered by the style's ocean stand-in.
    public static let zoomRange: ClosedRange<Int> = 5...13

    /// A tile covers the standard XYZ extent for its zoom and is drawn 512
    /// CSS pixels wide, MapLibre's convention, so a rendered tile at zoom z
    /// shows the web's map at Leaflet zoom z + 1. MapKit and the printed page
    /// count in 256-point squares, so their square at zoom z is one quarter
    /// of the rendered tile at z − 1 (`AtlasRasterBase.mapKitTile`).
    public static let cssPixels = 512

    /// Each tile is drawn at 2×, so a 2× screen sees it pixel for pixel.
    public static let imagePixels = 1024

    public static let imageFormat = "webp"

    /// The name the two surfaces give the ground: `basemapSource` on the web.
    public static func name(_ style: AtlasRasterStyle) -> String {
        "NS Marks Atlas · \(style.displayName)"
    }

    /// The web's sentence for the Fletcher style, word for word
    /// (`FLETCHER_STYLE_NOTE`), carried wherever that style is credited.
    public static let fletcherStyleNote = "Fletcher style: modern geography drawn "
        + "in the colours and lettering of Hugh Fletcher's 1884 Cape Breton sheets; "
        + "not a historical map."

    /// The provincial snapshot every style is drawn from, as the web's
    /// `public/atlas/provincial/source.json` records it.
    public enum Provincial {
        public static let archive = "ns-728ab9c9b5d20199.pmtiles"

        /// The day the archive was built, which is not the day anything in it
        /// was surveyed; the source releases below say that.
        public static let builtOn = "2026-09-05"

        /// The statement the Open Government Licence – Nova Scotia asks for,
        /// with the licence's own en dash, as the receipt carries it.
        public static let attribution =
            "Contains information licensed under the Open Government Licence – Nova Scotia"

        public static let licenceURL =
            URL(string: "https://support.novascotia.ca/services/open-data-portal-licence")!

        /// The web's `provincialSourceDates`: each source and the date of the
        /// release the archive was built from.
        public static let sourceDates = "NSRN: 2026-09-05; GeoNAMES: 2026-08-05; "
            + "Water polygons: 2026-05-05; Water lines: 2026-05-05; "
            + "Woodland: 2026-05-05; Municipal boundaries: 2025-12-05"

        /// The web's `PROVINCIAL_SCALE_NOTE`, word for word.
        public static let scaleNote = "NSTDB 1:10,000; woodland generalized at 2 m. "
            + "Closer zoom magnifies source detail. Roads and paths do not establish "
            + "access permission. Null source geometries are omitted and listed in the receipt."
    }

    /// The OpenStreetMap context the tiles carry beneath the provincial
    /// layers — ocean, grass, farmland, settlement areas and building
    /// footprints — fetched from OpenFreeMap when the tiles were rendered.
    public enum Supplemental {
        /// The credit line the web prints for the same context.
        public static let credit = "OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors"

        public static let licenceURL = URL(string: "https://www.openstreetmap.org/copyright")!

        public static let scope =
            "ocean context, grass, farmland, settlement areas and building footprints"
    }

    /// What the tiles are, in one sentence a page or a note can carry.
    public static func sourceDate(_ style: AtlasRasterStyle) -> String {
        var text = "Rendered tiles, revision \(tileRevision). "
            + "Provincial snapshot built \(Provincial.builtOn). \(Provincial.sourceDates). "
            + "Supplemental OpenStreetMap context as fetched when the tiles were rendered."
        if style == .fletcher {
            text += " \(fletcherStyleNote)"
        }
        return text
    }
}
