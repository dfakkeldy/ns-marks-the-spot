import Foundation
import GeoCore

/// One georeferenced sheet of the Fletcher survey.
///
/// The panel shows a single "Fletcher" switch, but the layer behind it is 24
/// separately scanned and separately georeferenced sheets. Their footprints describe coverage; the hosted revision is one precomposited
/// tile pyramid, fetched once for each coordinate.
public struct FletcherSheet: Hashable, Sendable {
    /// 1…24, matching the sheet numbers printed on the originals and the
    /// source identifiers in the published manifest.
    public let sheet: Int
    public let bounds: GeoBoundingBox

    init(_ sheet: Int, south: Double, west: Double, north: Double, east: Double) {
        self.sheet = sheet
        self.bounds = GeoBoundingBox(south: south, west: west, north: north, east: east)
    }
}

/// The Fletcher sheet index, transcribed from `web/src/layers/fletcherLayer.ts`.
///
/// These extents come from the selected raster receipts. They bound requests and
/// saved-area coverage; the pixel georeferencing is already in the mosaic.
/// Every value is checked against the web fixture by FletcherSheetParityTests.
public enum FletcherSheets {
    /// The tile build both surfaces expect, as a path segment.
    ///
    /// Part of the address rather than a header or a query parameter, so a
    /// re-rendered sheet lands somewhere new and no cache anywhere — on device,
    /// in a CDN, in a proxy — can serve last month's pixels for this month's
    /// build. Bumping this string is how a re-render ships.
    public static let tileRevision = "fletcher-full-sheets-20260913.1"

    /// Every sheet, in sheet-number order.
    public static let all: [FletcherSheet] = [
        FletcherSheet(1, south: 46.9616094, west: -60.7331201, north: 47.1303101, east: -60.3513361),
        FletcherSheet(2, south: 46.7829336, west: -60.4780884, north: 46.9711727, east: -60.0696244),
        FletcherSheet(3, south: 46.7811189, west: -60.9072136, north: 46.9749118, east: -60.4558101),
        FletcherSheet(4, south: 46.6168071, west: -60.4785375, north: 46.7928056, east: -60.0881746),
        FletcherSheet(5, south: 46.6083531, west: -60.8548867, north: 46.7835487, east: -60.4704527),
        FletcherSheet(6, south: 46.6127345, west: -61.2252621, north: 46.7932668, east: -60.8479248),
        FletcherSheet(7, south: 46.4451559, west: -60.4711264, north: 46.635469, east: -60.1262183),
        FletcherSheet(8, south: 46.4398942, west: -60.8795904, north: 46.62054, east: -60.4536542),
        FletcherSheet(9, south: 46.4478174, west: -61.2232858, north: 46.6151411, east: -60.8547969),
        FletcherSheet(10, south: 46.2663797, west: -60.8588842, north: 46.4512525, east: -60.4422007),
        FletcherSheet(11, south: 46.2708819, west: -61.2714804, north: 46.4527379, east: -60.8493621),
        FletcherSheet(12, south: 46.0706614, west: -60.8535392, north: 46.274297, east: -60.4704976),
        FletcherSheet(13, south: 46.0956159, west: -61.2311011, north: 46.2751353, east: -60.8413221),
        FletcherSheet(14, south: 46.091847, west: -61.6152657, north: 46.2699194, east: -61.2231061),
        FletcherSheet(15, south: 45.9194474, west: -61.2242739, north: 46.0997272, east: -60.8476553),
        FletcherSheet(16, south: 45.9208535, west: -61.6018359, north: 46.0946815, east: -61.2201866),
        FletcherSheet(17, south: 45.7415267, west: -60.8508443, north: 45.9263837, east: -60.464434),
        FletcherSheet(18, south: 45.7468554, west: -61.2286757, north: 45.9223533, east: -60.8425798),
        FletcherSheet(19, south: 45.7450374, west: -61.5959519, north: 45.9251653, east: -61.219468),
        FletcherSheet(20, south: 45.5572192, west: -60.8484637, north: 45.7489867, east: -60.4723391),
        FletcherSheet(21, south: 45.5725647, west: -61.2224773, north: 45.747733, east: -60.840873),
        FletcherSheet(22, south: 45.570741, west: -61.596446, north: 45.7497389, east: -61.2200519),
        FletcherSheet(23, south: 45.3971006, west: -61.2197375, north: 45.5777837, east: -60.846712),
        FletcherSheet(24, south: 45.3768803, west: -61.5924485, north: 45.5771235, east: -61.219423),
    ]

    /// The zooms the sheets were actually rendered at.
    ///
    /// It belongs beside the sheet bounds and the revision because all three
    /// describe one tile build: re-rendering deeper changes this, the revision,
    /// and nothing else. Leaflet takes it as `maxNativeZoom` and upscales past
    /// it; `MKTileOverlay.maximumZ` behaves the same way, so both surfaces stop
    /// requesting at the same place and keep drawing beyond it.
    public static let zoomRange = 8...15

    public static func sheet(_ number: Int) -> FletcherSheet? {
        all.first { $0.sheet == number }
    }

    /// The sheets a viewport overlaps, in sheet-number order.
    ///
    /// The sheets overlap each other along their margins, so more than one can
    /// cover the same ground; ordering by number keeps the resulting draw order
    /// stable rather than dependent on how the viewport happened to move.
    public static func sheets(intersecting box: GeoBoundingBox) -> [FletcherSheet] {
        all.filter { $0.bounds.intersects(box) }
    }

    /// The sheets that share ground with this box, not merely an edge.
    ///
    /// The question to ask about a user's selection. `sheets(intersecting:)`
    /// is the viewport question and answers yes for a box lying against a
    /// sheet's edge, which is right for prefetching and wrong for telling
    /// someone the survey reaches their ground.
    public static func sheets(overlapping box: GeoBoundingBox) -> [FletcherSheet] {
        all.filter { $0.bounds.overlaps(box) }
    }

    /// Whether a sheet's pyramid can serve a given tile.
    ///
    /// The web gives each sheet's Leaflet layer a `bounds`, so the browser
    /// never requests a tile outside it. MapKit has no equivalent — it asks an
    /// `MKTileOverlay` for every tile in view and expects an answer — so the
    /// same restraint has to be applied before the request goes out. Without
    /// it, panning across Cape Breton with the layer on would fire 24 requests
    /// per tile, 23 of them guaranteed 404s.
    ///
    /// `overlaps` rather than `intersects`, because the sheet extents are cut
    /// on tile boundaries and Leaflet's own bounds test is the strict one. An
    /// inclusive test here puts a ring of tiles around every sheet that the
    /// browser never asks for and the tile build never wrote: 118 of them
    /// along sheet 1's edges at zoom 16 alone, each answered by a 404 the
    /// loader then has to turn into a blank square.
    public static func covers(_ sheet: FletcherSheet, x: Int, y: Int, z: Int) -> Bool {
        sheet.bounds.overlaps(TileMath.geographicBounds(x: x, y: y, z: z))
    }

    /// The sheets that can serve a tile, in sheet-number order.
    public static func sheets(coveringTileX x: Int, y: Int, z: Int) -> [FletcherSheet] {
        sheets(overlapping: TileMath.geographicBounds(x: x, y: y, z: z))
    }

    /// One box holding all 24 sheets.
    ///
    /// Coarse on purpose: the survey's real footprint is ragged, and this is the
    /// rectangle around it. Its job is to bound work before the per-sheet test
    /// runs — clipping a saved-area selection to this first means planning a
    /// download iterates over Nova Scotia rather than over whatever the user
    /// had on screen, which at zoom 16 is the difference between a few hundred
    /// thousand tiles and a few billion.
    public static let coverage: GeoBoundingBox = {
        guard let box = GeoBoundingBox.union(all.map(\.bounds)) else {
            // `all` is a non-empty literal, so this is unreachable short of
            // someone emptying it — in which case a zero box correctly says
            // there is nothing to draw.
            return GeoBoundingBox(south: 0, west: 0, north: 0, east: 0)
        }
        return box
    }()
}
