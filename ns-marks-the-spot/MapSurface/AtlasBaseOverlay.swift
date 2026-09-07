import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import UIKit
import os

/// The rendered Atlas as this app fetches it: one place for the request, the
/// stand-in rule, the zoom arithmetic, and the names the page and the note
/// give the ground.
///
/// The screen overlay and the print compositor both come through here, so the
/// two cannot drift to different hosts, different revisions or different
/// credits — the arrangement `OpenStreetMapBase` already makes for the other
/// modern ground.
nonisolated enum AtlasRasterBase {
    /// The id the two surfaces share for the modern map, whichever style it
    /// is in: a link, a setup and the printed receipt all say "modern".
    static let layerID = MapShareState.modernBaseLayerID

    /// What the page calls the base, word for word as the web's
    /// `exportLayerSpecs.ts` names it: `Atlas ${style} base map`.
    static func pageName(_ style: AtlasRasterStyle) -> String {
        "Atlas \(style.rawValue) base map"
    }

    /// The one line the framing toolbar carries while the strip is hidden.
    static let frameCredit = "NS Marks Atlas · \(AtlasRaster.Provincial.attribution) · "
        + AtlasRaster.Supplemental.credit

    /// The credits the printed strip carries for the ground, in the order the
    /// browser's export prints them: the Province's statement for the snapshot
    /// beneath every style, then OpenStreetMap's for the context the tiles
    /// carry. The Fletcher sentence travels with the Fletcher style only.
    static func printSources(fletcher: Bool) -> [PrintLayerSource] {
        [
            PrintLayerSource(
                name: "NS Marks Atlas",
                attribution: AtlasRaster.Provincial.attribution
                    + ". Provincial snapshot built \(AtlasRaster.Provincial.builtOn); "
                    + "\(AtlasRaster.Provincial.sourceDates). "
                    + "Rendered tiles, revision \(AtlasRaster.tileRevision)."
                    + (fletcher ? " \(AtlasRaster.fletcherStyleNote)" : ""),
                licenceUrl: AtlasRaster.Provincial.licenceURL.absoluteString
            ),
            PrintLayerSource(
                name: "Supplemental geography",
                attribution: AtlasRaster.Supplemental.credit,
                licenceUrl: AtlasRaster.Supplemental.licenceURL.absoluteString
            ),
        ]
    }

    /// The same identification the OpenStreetMap requests carry: this is our
    /// own host, but a request that says who is asking costs nothing and
    /// makes the host's logs readable.
    static func request(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue(OpenStreetMapBase.userAgent, forHTTPHeaderField: "User-Agent")
        return request
    }

    /// What this session has learned about the package: the addresses it has
    /// no tile for, and the ocean stand-in per style and zoom.
    ///
    /// The missing set is what keeps a pan over open water from asking the
    /// host the same 404 on every redraw — `URLCache` holds tiles, not
    /// absences. Bounded, and emptied rather than trimmed when it fills,
    /// because a re-ask costs one round trip and bookkeeping costs more.
    private struct Memory {
        var missing: Set<String> = []
        var ocean: [String: Data] = [:]
    }

    private static let memory = OSAllocatedUnfairLock(initialState: Memory())
    private static let missingLimit = 100_000

    /// One rendered tile, or the style's ocean where the package has no tile
    /// at that address.
    ///
    /// A 404 is an answer, not a failure: the package renders a tile exactly
    /// where the provincial archive has one, and every other address at these
    /// zooms is open water that the stand-in draws in the style's own colour.
    /// Everything else that is not a tile is thrown, because on a
    /// base-replacing overlay a transparent square is a hole MapKit never
    /// retries, while a thrown one is asked for again when the signal returns.
    static func tileData(
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, baseURL: URL
    ) async throws -> Data {
        let key = "\(style.rawValue)/\(z)/\(x)/\(y)"
        if memory.withLock({ $0.missing.contains(key) }) {
            return try await oceanTile(style: style, z: z, baseURL: baseURL)
        }
        let url = AtlasRasterTileURL.tileURL(style: style, z: z, x: x, y: y, baseURL: baseURL)
        let (data, response) = try await URLSession.shared.data(for: request(url))
        if let http = response as? HTTPURLResponse,
           http.statusCode == 404 || http.statusCode == 410
        {
            memory.withLock {
                if $0.missing.count >= missingLimit { $0.missing.removeAll() }
                $0.missing.insert(key)
            }
            return try await oceanTile(style: style, z: z, baseURL: baseURL)
        }
        try validate(data: data, response: response)
        return data
    }

    /// The stand-in for open water, fetched once per style and zoom.
    ///
    /// A stand-in that cannot be fetched is the package not being where the
    /// build says it is — a host that answers 404 for everything would
    /// otherwise draw the whole province as sea and call it served. It is
    /// thrown, so the map retries and the panel reports a ground that failed.
    static func oceanTile(style: AtlasRasterStyle, z: Int, baseURL: URL) async throws -> Data {
        let key = "\(style.rawValue)/\(z)"
        if let cached = memory.withLock({ $0.ocean[key] }) { return cached }
        let url = AtlasRasterTileURL.oceanTileURL(style: style, z: z, baseURL: baseURL)
        let (data, response) = try await URLSession.shared.data(for: request(url))
        try validate(data: data, response: response)
        memory.withLock { $0.ocean[key] = data }
        return data
    }

    /// The same three checks `TileFetcher.validateImageResponse` makes, so an
    /// error page cannot be handed to the map as though it were a tile.
    private static func validate(data: Data, response: URLResponse) throws {
        if let http = response as? HTTPURLResponse {
            guard (200...299).contains(http.statusCode) else {
                throw TileFetcherError.invalidHTTPStatus(http.statusCode)
            }
            if let mimeType = http.mimeType?.lowercased(), !mimeType.hasPrefix("image/") {
                throw TileFetcherError.invalidContentType(mimeType)
            }
        }
        guard UIImage(data: data) != nil else {
            throw TileFetcherError.invalidImageData
        }
    }

    /// A rendered tile at any zoom at or below the package's deepest.
    ///
    /// Within the package's zooms it is one tile. Below them — the reader has
    /// pinched out past the province — it is composed from the shallowest
    /// rendered tiles it covers, up to sixteen of them, which are almost all
    /// the cached ocean stand-in. Further out than that, Nova Scotia is a few
    /// pixels wide and the stand-in alone is the honest picture.
    static func renderedTile(
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, baseURL: URL
    ) async throws -> Data {
        let zooms = AtlasRaster.zoomRange
        if zooms.contains(z) {
            return try await tileData(style: style, z: z, x: x, y: y, baseURL: baseURL)
        }
        guard z < zooms.lowerBound else {
            throw TileFetcherError.invalidHTTPStatus(404)
        }
        let levels = zooms.lowerBound - z
        guard levels <= 2 else {
            return try await oceanTile(style: style, z: zooms.lowerBound, baseURL: baseURL)
        }
        return try await composite(
            style: style, z: z, x: x, y: y, levels: levels, baseURL: baseURL
        )
    }

    /// The `2^levels`-square block of rendered tiles that covers one shallower
    /// square, drawn down into a single tile-sized image.
    private static func composite(
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, levels: Int, baseURL: URL
    ) async throws -> Data {
        let n = 1 << levels
        var pieces: [(dx: Int, dy: Int, data: Data)] = []
        try await withThrowingTaskGroup(of: (Int, Int, Data).self) { group in
            for dy in 0..<n {
                for dx in 0..<n {
                    group.addTask {
                        (dx, dy, try await tileData(
                            style: style, z: z + levels, x: x * n + dx, y: y * n + dy, baseURL: baseURL
                        ))
                    }
                }
            }
            for try await (dx, dy, data) in group {
                pieces.append((dx, dy, data))
            }
        }
        let side = CGFloat(AtlasRaster.imagePixels)
        let cell = side / CGFloat(n)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
            .image { _ in
                for piece in pieces {
                    UIImage(data: piece.data)?.draw(
                        in: CGRect(x: CGFloat(piece.dx) * cell, y: CGFloat(piece.dy) * cell, width: cell, height: cell)
                    )
                }
            }
        guard let png = image.pngData() else { throw TileFetcherError.invalidImageData }
        return png
    }

    /// The square MapKit — or the page — asks for at zoom `z`, in the
    /// 256-point convention both of them use.
    ///
    /// A rendered tile is drawn for the web's zoom one deeper than its own
    /// number (512 CSS pixels per tile, at 2×), so the square at MapKit's
    /// `z` is one quarter of the rendered tile at `z − 1`, cut out at full
    /// resolution: 512 pixels for a 256-point square, which is what a 2×
    /// screen wants. Past the package's deepest level the cut simply gets
    /// smaller — a sixteenth of the deepest tile at `z + 2`, and so on —
    /// which is the stretching any raster does when zoomed past its
    /// resolution, done here rather than left to MapKit because MapKit asks
    /// for nothing at all on a map that opens beyond `maximumZ`.
    ///
    /// The tile size MapKit is told is deliberately left at its default:
    /// MapKit reads `tileSize` as the image resolution it expects, not as a
    /// change to which square `z` names — a 512-point setting still asked for
    /// zoom-14 squares at zoom 14 — so the arithmetic lives here instead.
    static func mapKitTile(
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, baseURL: URL
    ) async throws -> Data {
        let rendered = min(AtlasRaster.zoomRange.upperBound, z - 1)
        let levels = z - rendered
        let parent = try await renderedTile(
            style: style, z: rendered, x: x >> levels, y: y >> levels, baseURL: baseURL
        )
        guard let image = UIImage(data: parent)?.cgImage else {
            throw TileFetcherError.invalidImageData
        }
        let side = max(1, image.width >> levels)
        let mask = (1 << levels) - 1
        let crop = CGRect(x: (x & mask) * side, y: (y & mask) * side, width: side, height: side)
        guard let square = image.cropping(to: crop),
              let png = UIImage(cgImage: square).pngData()
        else { throw TileFetcherError.invalidImageData }
        return png
    }

    /// The square the print export asks for, with the outcome the page's
    /// legend is built from instead of a thrown error.
    ///
    /// Always `.source` when it arrives: the ocean stand-in is the same
    /// renderer's picture of open water in the same style, not ground the
    /// map lacks.
    static func exportTile(
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, baseURL: URL
    ) async -> (Data, TileLoadOutcome, TileSubstance) {
        do {
            return (try await mapKitTile(style: style, z: z, x: x, y: y, baseURL: baseURL), .served, .source)
        } catch {
            return (
                TileComposite.transparent ?? Data(),
                TileLoadOutcome(classifying: error),
                .placeholder
            )
        }
    }

    /// The base as the print compositor draws it: the shared id, the page's
    /// name for the style, and one zoom past the package's deepest level,
    /// because the page's 256-point squares at `z` are read from the rendered
    /// tiles at `z − 1`.
    static func printLayer(style: AtlasRasterStyle, baseURL: URL) -> MapLayerState {
        MapLayerState(
            configuration: TileLayerConfiguration(
                id: layerID,
                name: pageName(style),
                source: .atlasRaster(style: style, baseURL: baseURL),
                minZoom: 0,
                maxZoom: AtlasRaster.zoomRange.upperBound + 1
            )
        )
    }
}

/// The rendered Atlas, drawn instead of Apple's base map.
///
/// This is the ground the browser opens on, so it is what parity means for
/// the base map now: the same cartography from the same archive on both
/// surfaces. `canReplaceMapContent` is what makes it a base rather than a
/// layer, exactly as it does for `OSMBaseOverlay`.
///
/// `nonisolated` for the reason the other tile overlays are: MapKit asks for
/// tiles on its own queues, and nothing here holds mutable state.
nonisolated final class AtlasBaseOverlay: MKTileOverlay, @unchecked Sendable {
    let style: AtlasRasterStyle
    let baseURL: URL

    /// The closest the map lets a reader get (`MapController.closestZoom`).
    /// Every square up to it is answered here — a cut of the deepest
    /// rendered tile past the package's zooms — because a map that opens
    /// beyond `maximumZ` is asked for nothing by MapKit and draws a hole.
    static let deepestZoom = 23

    init(style: AtlasRasterStyle, baseURL: URL) {
        self.style = style
        self.baseURL = baseURL
        super.init(urlTemplate: nil)
        canReplaceMapContent = true
        // From zero: a zoom with no tile would show a hole, and below the
        // package's zooms `loadTile` composes or stands in rather than
        // leaving one.
        minimumZ = 0
        maximumZ = Self.deepestZoom
    }

    /// `nonisolated` for the reason `FletcherHost.logger` is: the class is,
    /// and `Logger` is `Sendable`. Debug level, so the stream of squares a
    /// pan asks for is there for `log stream --level debug` and nowhere else.
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "ns-marks-the-spot",
        category: "AtlasBaseOverlay"
    )

    override func loadTile(at path: MKTileOverlayPath) async throws -> Data {
        do {
            return try await AtlasRasterBase.mapKitTile(
                style: style, z: path.z, x: path.x, y: path.y, baseURL: baseURL
            )
        } catch {
            Self.logger.debug("tile \(path.z)/\(path.x)/\(path.y) failed: \(String(describing: error))")
            throw error
        }
    }
}

extension AtlasBaseOverlay: WebDrawOrdered {
    /// Where the modern basemap sits on the web, because this is it: below
    /// every layer the app installs.
    var webDrawOrder: Int {
        OverlayZIndex.drawOrder(OverlayZIndex.modernBasemap, in: .tile)
    }
}
