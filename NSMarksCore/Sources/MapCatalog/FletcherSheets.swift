import Foundation
import GeoCore

/// One georeferenced sheet of the Fletcher survey.
///
/// The panel shows a single "Fletcher" switch, but the layer behind it is 24
/// separately scanned and separately georeferenced sheets. Each one is its own
/// tile pyramid at its own extent, so the map draws the sheets a viewport
/// overlaps and nothing else.
public struct FletcherSheet: Hashable, Sendable {
    /// 1…24, matching the sheet numbers printed on the originals and the
    /// `sheet-NN` path segment in the tile build.
    public let sheet: Int
    public let bounds: GeoBoundingBox

    init(_ sheet: Int, south: Double, west: Double, north: Double, east: Double) {
        self.sheet = sheet
        self.bounds = GeoBoundingBox(south: south, west: west, north: north, east: east)
    }
}

/// The Fletcher sheet index, transcribed from `web/src/layers/fletcherLayer.ts`.
///
/// These 96 numbers are the georeferencing: a sheet drawn to the wrong extent
/// is a historical map pointing at the wrong ground, which is the one failure
/// this app cannot ship. Nothing here is derived — every value is checked
/// against the web's exported fixture by `FletcherSheetParityTests`, because a
/// hand transcription of 96 doubles is precisely the operation that needs a
/// witness rather than a careful reader.
public enum FletcherSheets {
    /// The tile build both surfaces expect, as a path segment.
    ///
    /// Part of the address rather than a header or a query parameter, so a
    /// re-rendered sheet lands somewhere new and no cache anywhere — on device,
    /// in a CDN, in a proxy — can serve last month's pixels for this month's
    /// build. Bumping this string is how a re-render ships.
    public static let tileRevision = "fletcher-direct-rumsey-20260726.1"

    /// Every sheet, in sheet-number order.
    public static let all: [FletcherSheet] = [
        FletcherSheet(1, south: 46.96525940034928, west: -60.8203125,
                      north: 47.14116119721896, east: -60.435791015625),
        FletcherSheet(2, south: 46.7925382703598, west: -60.46875,
                      north: 46.96525940034928, east: -60.084228515625),
        FletcherSheet(3, south: 46.7925382703598, west: -60.8477783203125,
                      north: 46.969008033119586, east: -60.46875),
        FletcherSheet(4, south: 46.581518465658, west: -60.523681640625,
                      north: 46.82637528602131, east: -60.029296875),
        FletcherSheet(5, south: 46.619261036171515, west: -60.8477783203125,
                      north: 46.7925382703598, east: -60.46875),
        FletcherSheet(6, south: 46.619261036171515, west: -61.2213134765625,
                      north: 46.796298989977444, east: -60.8367919921875),
        FletcherSheet(7, south: 46.403776166694634, west: -60.53466796875,
                      north: 46.653206871226644, east: -60.029296875),
        FletcherSheet(8, south: 46.441642327624976, west: -60.8477783203125,
                      north: 46.61548796222357, east: -60.46875),
        FletcherSheet(9, south: 46.44921240385256, west: -61.226806640625,
                      north: 46.619261036171515, east: -60.8477783203125),
        FletcherSheet(10, south: 46.27103747280261, west: -60.8477783203125,
                      north: 46.44542749723385, east: -60.46875),
        FletcherSheet(11, south: 46.27103747280261, west: -61.2322998046875,
                      north: 46.44542749723385, east: -60.8477783203125),
        FletcherSheet(12, south: 46.046548446306204, west: -60.919189453125,
                      north: 46.297610989881086, east: -60.413818359375),
        FletcherSheet(13, south: 46.09989991062731, west: -61.2213134765625,
                      north: 46.27483447871402, east: -60.8477783203125),
        FletcherSheet(14, south: 46.05798524479302, west: -61.666259765625,
                      north: 46.305201055811956, east: -61.160888671875),
        FletcherSheet(15, south: 45.924408558629, west: -61.2213134765625,
                      north: 46.09609080214316, east: -60.8477783203125),
        FletcherSheet(16, south: 45.920587344733654, west: -61.5948486328125,
                      north: 46.09989991062731, east: -61.2213134765625),
        FletcherSheet(17, south: 45.71001523943371, west: -60.919189453125,
                      north: 45.958787640356405, east: -60.413818359375),
        FletcherSheet(18, south: 45.7138509302922, west: -61.2872314453125,
                      north: 45.95496879511337, east: -60.787353515625),
        FletcherSheet(19, south: 45.71768635790719, west: -61.6607666015625,
                      north: 45.958787640356405, east: -61.160888671875),
        FletcherSheet(20, south: 45.70617928533084, west: -60.9136962890625,
                      north: 45.95496879511337, east: -60.413818359375),
        FletcherSheet(21, south: 45.53713668039858, west: -61.292724609375,
                      north: 45.790509467524714, east: -60.7928466796875),
        FletcherSheet(22, south: 45.47554027158592, west: -61.6607666015625,
                      north: 45.725356423410155, east: -61.160888671875),
        FletcherSheet(23, south: 45.36758436884979, west: -61.2872314453125,
                      north: 45.61403741135092, east: -60.787353515625),
        FletcherSheet(24, south: 45.398449976304086, west: -61.58935546875,
                      north: 45.57560020947801, east: -61.2158203125),
    ]

    /// The zooms the sheets were actually rendered at.
    ///
    /// It belongs beside the sheet bounds and the revision because all three
    /// describe one tile build: re-rendering deeper changes this, the revision,
    /// and nothing else. Leaflet takes it as `maxNativeZoom` and upscales past
    /// it; `MKTileOverlay.maximumZ` behaves the same way, so both surfaces stop
    /// requesting at the same place and keep drawing beyond it.
    public static let zoomRange = 8...16

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
