import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import ImageIO
import UIKit
import os

/// A rendered tile — or the ocean stand-in, or a composite of tiles —
/// decoded and ready to cut, under the address it was loaded for.
nonisolated final class DecodedTile: @unchecked Sendable {
    let key: String
    let image: CGImage

    init(key: String, image: CGImage) {
        self.key = key
        self.image = image
    }

    /// What the decoded pixels weigh, for the cache's limit.
    var cost: Int { image.bytesPerRow * image.height }
}

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
    /// no tile for, and the decoded tiles still on their way.
    ///
    /// The missing set is what keeps a pan over open water from asking the
    /// host the same 404 on every redraw — `URLCache` holds tiles, not
    /// absences. Bounded, and emptied rather than trimmed when it fills,
    /// because a re-ask costs one round trip and bookkeeping costs more.
    ///
    /// `loading` is what makes the four MapKit squares cut from one rendered
    /// tile — and every square standing in for open water — share a single
    /// fetch and a single decode instead of starting one each. On an iPad the
    /// first view asks for a few hundred squares at once, and doing that work
    /// four times over is what kept App Review's map blank (plan R-0).
    private struct Memory {
        var missing: Set<String> = []
        var loading: [String: Loading] = [:]
    }

    /// A load in flight, how many squares are waiting on it, and a token so
    /// a load that finishes late cannot remove the one that replaced it.
    private struct Loading {
        let task: Task<DecodedTile, any Error>
        let token: UUID
        var waiters: Int
    }

    private static let memory = OSAllocatedUnfairLock(initialState: Memory())
    private static let missingLimit = 100_000

    /// Decoded tiles, so a square cut from a tile drawn a moment ago is a
    /// crop rather than a fetch and a decode. A decoded 1024-pixel tile is
    /// 4 MiB; the limit holds about two dozen, which is more than an iPad's
    /// whole screen needs. `NSCache` is thread-safe; it is just not marked
    /// `Sendable`.
    nonisolated(unsafe) private static let decoded: NSCache<NSString, DecodedTile> = {
        let cache = NSCache<NSString, DecodedTile>()
        cache.totalCostLimit = 96 << 20
        return cache
    }()

    /// Where decoding, composing, cropping and encoding happen: off Swift's
    /// cooperative pool, so a screenful of image work cannot hold up the
    /// requests still waiting to be sent. Two cores are left to MapKit and
    /// the interface.
    private static let imageWork: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "AtlasRasterBase.imageWork"
        queue.qualityOfService = .userInitiated
        queue.maxConcurrentOperationCount = max(2, ProcessInfo.processInfo.activeProcessorCount - 2)
        return queue
    }()

    /// How many images have been decoded for the package on `baseURL`, for
    /// the tests that hold the overlay to one decode per tile. Per host, so
    /// tests running side by side count only their own.
    static func decodeCount(baseURL: URL) -> Int {
        decodes.withLock { $0[baseURL.absoluteString, default: 0] }
    }
    private static let decodes = OSAllocatedUnfairLock(initialState: [String: Int]())

    /// The cache key for one address on one host: the host is part of it so
    /// two builds — or two tests — pointed at different packages never
    /// answer for each other.
    private static func address(_ baseURL: URL, _ parts: Any...) -> String {
        ([baseURL.absoluteString] + parts.map { "\($0)" }).joined(separator: "/")
    }

    /// One rendered tile, decoded, or the style's ocean where the package has
    /// no tile at that address.
    ///
    /// A 404 is an answer, not a failure: the package renders a tile exactly
    /// where the provincial archive has one, and every other address at these
    /// zooms is open water that the stand-in draws in the style's own colour.
    /// Everything else that is not a tile is thrown, because MapKit asks
    /// again for a square that threw when the signal returns, and never for
    /// one it was handed.
    private static func tileImage(
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, baseURL: URL, session: URLSession
    ) async throws -> DecodedTile {
        let key = address(baseURL, style.rawValue, z, x, y)
        if memory.withLock({ $0.missing.contains(key) }) {
            return try await oceanImage(style: style, z: z, baseURL: baseURL, session: session)
        }
        return try await shared(key) {
            let url = AtlasRasterTileURL.tileURL(style: style, z: z, x: x, y: y, baseURL: baseURL)
            let (data, response) = try await session.data(for: request(url))
            if let http = response as? HTTPURLResponse,
               http.statusCode == 404 || http.statusCode == 410
            {
                memory.withLock {
                    if $0.missing.count >= missingLimit { $0.missing.removeAll() }
                    $0.missing.insert(key)
                }
                return try await oceanImage(style: style, z: z, baseURL: baseURL, session: session)
            }
            try validate(response: response)
            try Task.checkCancellation()
            return DecodedTile(key: key, image: try await offPool { try decode(data, baseURL: baseURL) })
        }
    }

    /// The stand-in for open water, fetched and decoded once per style and
    /// zoom however many squares are open water.
    ///
    /// A stand-in that cannot be fetched is the package not being where the
    /// build says it is — a host that answers 404 for everything would
    /// otherwise draw the whole province as sea and call it served. It is
    /// thrown, so the map retries and the load progress reports a failure.
    private static func oceanImage(
        style: AtlasRasterStyle, z: Int, baseURL: URL, session: URLSession
    ) async throws -> DecodedTile {
        let key = address(baseURL, "ocean", style.rawValue, z)
        return try await shared(key) {
            let url = AtlasRasterTileURL.oceanTileURL(style: style, z: z, baseURL: baseURL)
            let (data, response) = try await session.data(for: request(url))
            try validate(response: response)
            try Task.checkCancellation()
            return DecodedTile(key: key, image: try await offPool { try decode(data, baseURL: baseURL) })
        }
    }

    /// The decoded tile under `key`: from the cache, from a load already
    /// running, or from `load`, started here and shared with everyone who
    /// asks while it runs.
    ///
    /// The load is its own task rather than the caller's, so MapKit
    /// abandoning one square does not cancel the tile its neighbours are
    /// waiting on — but once every square waiting on it has been abandoned,
    /// it is cancelled too, so a pan does not leave downloads and decodes for
    /// a view the reader has left queued ahead of the one they are looking
    /// at. A failure is never cached: the next ask starts again. A load that
    /// resolves to another key's tile — an address that turned out to be
    /// open water — is returned but not cached under this key, because the
    /// missing set already sends the next ask to the ocean.
    private static func shared(
        _ key: String, load: @escaping @Sendable () async throws -> DecodedTile
    ) async throws -> DecodedTile {
        if let hit = decoded.object(forKey: key as NSString) { return hit }
        let (task, token) = memory.withLock { state -> (Task<DecodedTile, any Error>, UUID?) in
            if var running = state.loading[key] {
                running.waiters += 1
                state.loading[key] = running
                return (running.task, running.token)
            }
            // Checked again under the lock: a load may have finished between
            // the miss above and here.
            if let hit = decoded.object(forKey: key as NSString) { return (Task { hit }, nil) }
            let token = UUID()
            let task = Task<DecodedTile, any Error> {
                // Runs only once the lock is released, so its entry is in
                // `loading` before it can take it out.
                defer {
                    memory.withLock {
                        if $0.loading[key]?.token == token { $0.loading[key] = nil }
                    }
                }
                let tile = try await load()
                if tile.key == key {
                    decoded.setObject(tile, forKey: key as NSString, cost: tile.cost)
                }
                return tile
            }
            state.loading[key] = Loading(task: task, token: token, waiters: 1)
            return (task, token)
        }
        guard let token else { return try await task.value }
        return try await withTaskCancellationHandler {
            try await task.value
        } onCancel: {
            let abandoned = memory.withLock { state -> Bool in
                guard var running = state.loading[key], running.token == token else { return false }
                running.waiters -= 1
                guard running.waiters <= 0 else {
                    state.loading[key] = running
                    return false
                }
                // Out of the table now, so a square asked for again starts a
                // fresh load rather than joining one that is being cancelled.
                state.loading[key] = nil
                return true
            }
            if abandoned { task.cancel() }
        }
    }

    /// Runs image work on `imageWork` and waits for it without holding a
    /// thread of the cooperative pool.
    private static func offPool<T: Sendable>(
        _ work: @escaping @Sendable () throws -> T
    ) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            imageWork.addOperation {
                continuation.resume(with: Result { try work() })
            }
        }
    }

    /// Decodes now rather than when first drawn. `UIImage(data:)` leaves the
    /// pixels to be decoded on first use, so each of the four squares cut
    /// from a tile would decode the whole WebP again.
    private static func decode(_ data: Data, baseURL: URL) throws -> CGImage {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(
                source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary
              )
        else { throw TileFetcherError.invalidImageData }
        decodes.withLock { $0[baseURL.absoluteString, default: 0] += 1 }
        return image
    }

    /// Two of the three checks `TileFetcher.validateImageResponse` makes, so
    /// an error page cannot be handed to the map as though it were a tile.
    /// The third, that the bytes are an image, is the decode itself.
    private static func validate(response: URLResponse) throws {
        if let http = response as? HTTPURLResponse {
            guard (200...299).contains(http.statusCode) else {
                throw TileFetcherError.invalidHTTPStatus(http.statusCode)
            }
            if let mimeType = http.mimeType?.lowercased(), !mimeType.hasPrefix("image/") {
                throw TileFetcherError.invalidContentType(mimeType)
            }
        }
    }

    /// A rendered tile at any zoom at or below the package's deepest.
    ///
    /// Within the package's zooms it is one tile. Below them — the reader has
    /// pinched out past the province — it is composed from the shallowest
    /// rendered tiles it covers, up to sixteen of them, which are almost all
    /// the ocean stand-in. Further out than that, Nova Scotia is a few
    /// pixels wide and the stand-in alone is the honest picture.
    private static func renderedImage(
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, baseURL: URL, session: URLSession
    ) async throws -> DecodedTile {
        let zooms = AtlasRaster.zoomRange
        if zooms.contains(z) {
            return try await tileImage(style: style, z: z, x: x, y: y, baseURL: baseURL, session: session)
        }
        guard z < zooms.lowerBound else {
            throw TileFetcherError.invalidHTTPStatus(404)
        }
        let levels = zooms.lowerBound - z
        guard levels <= 2 else {
            return try await oceanImage(style: style, z: zooms.lowerBound, baseURL: baseURL, session: session)
        }
        let key = address(baseURL, "composite", style.rawValue, z, x, y)
        return try await shared(key) {
            try await composite(
                key: key, style: style, z: z, x: x, y: y, levels: levels, baseURL: baseURL, session: session
            )
        }
    }

    /// The `2^levels`-square block of rendered tiles that covers one shallower
    /// square, drawn down into a single tile-sized image.
    private static func composite(
        key: String, style: AtlasRasterStyle, z: Int, x: Int, y: Int, levels: Int,
        baseURL: URL, session: URLSession
    ) async throws -> DecodedTile {
        let n = 1 << levels
        let pieces = try await withThrowingTaskGroup(of: (Int, Int, DecodedTile).self) { group in
            for dy in 0..<n {
                for dx in 0..<n {
                    group.addTask {
                        (dx, dy, try await tileImage(
                            style: style, z: z + levels, x: x * n + dx, y: y * n + dy,
                            baseURL: baseURL, session: session
                        ))
                    }
                }
            }
            var pieces: [(Int, Int, DecodedTile)] = []
            for try await piece in group { pieces.append(piece) }
            return pieces
        }
        try Task.checkCancellation()
        let image = try await offPool { () throws -> CGImage in
            let side = AtlasRaster.imagePixels
            let cell = CGFloat(side) / CGFloat(n)
            guard let context = CGContext(
                data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ) else { throw TileFetcherError.invalidImageData }
            context.interpolationQuality = .high
            for (dx, dy, piece) in pieces {
                // Core Graphics counts rows from the bottom; the tile grid
                // counts them from the top.
                context.draw(piece.image, in: CGRect(
                    x: CGFloat(dx) * cell, y: CGFloat(n - 1 - dy) * cell, width: cell, height: cell
                ))
            }
            guard let image = context.makeImage() else { throw TileFetcherError.invalidImageData }
            return image
        }
        return DecodedTile(key: key, image: image)
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
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, baseURL: URL,
        session: URLSession = .shared
    ) async throws -> Data {
        let rendered = min(AtlasRaster.zoomRange.upperBound, z - 1)
        let levels = z - rendered
        let parent = try await renderedImage(
            style: style, z: rendered, x: x >> levels, y: y >> levels, baseURL: baseURL, session: session
        )
        // A square MapKit has given up on is not worth cutting.
        try Task.checkCancellation()
        return try await offPool {
            let image = parent.image
            let side = max(1, image.width >> levels)
            let mask = (1 << levels) - 1
            let crop = CGRect(x: (x & mask) * side, y: (y & mask) * side, width: side, height: side)
            guard let square = image.cropping(to: crop),
                  let png = UIImage(cgImage: square).pngData()
            else { throw TileFetcherError.invalidImageData }
            return png
        }
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

/// The rendered Atlas, drawn over Apple's standard map.
///
/// This is the ground the browser opens on, so it is what parity means for
/// the base map now: the same cartography from the same archive on both
/// surfaces. It covers Apple's map square by square — every square it draws
/// is opaque, ocean included, and it sits above Apple's lettering — so once
/// a view has loaded, only the Atlas is on screen.
///
/// It does not set `canReplaceMapContent`, unlike `OSMBaseOverlay`. With
/// that set, a square still on its way, or one that failed, is an empty
/// grid, and a map that never drew — App Review's iPad, 2026-10-30 — was
/// nothing but grid. Without it, the same square shows Apple's map until the
/// Atlas arrives: a map either way.
///
/// `nonisolated` for the reason the other tile overlays are: MapKit asks for
/// tiles on its own queues, and nothing here holds mutable state.
nonisolated final class AtlasBaseOverlay: MKTileOverlay, @unchecked Sendable {
    let style: AtlasRasterStyle
    let baseURL: URL
    private let session: URLSession
    private let progress: LayerLoadProgressBox?

    /// The closest the map lets a reader get (`MapController.closestZoom`).
    /// Every square up to it is answered here — a cut of the deepest
    /// rendered tile past the package's zooms — because a map that opens
    /// beyond `maximumZ` is asked for nothing by MapKit and draws a hole.
    static let deepestZoom = 23

    init(
        style: AtlasRasterStyle,
        baseURL: URL,
        session: URLSession = .shared,
        progress: LayerLoadProgressBox? = nil
    ) {
        self.style = style
        self.baseURL = baseURL
        self.session = session
        self.progress = progress
        super.init(urlTemplate: nil)
        canReplaceMapContent = false
        // From zero: below the package's zooms `loadTile` composes or stands
        // in, so the Atlas covers Apple's map at every zoom.
        minimumZ = 0
        maximumZ = Self.deepestZoom
    }

    /// `nonisolated` for the reason `FletcherHost.logger` is: the class is,
    /// and `Logger` is `Sendable`.
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "ns-marks-the-spot",
        category: "AtlasBaseOverlay"
    )

    /// When a failure was last logged as an error. A ground that cannot be
    /// reached fails every square on screen at once, so one error every few
    /// seconds says it, and the rest go to the debug stream.
    private static let lastErrorLog = OSAllocatedUnfairLock<ContinuousClock.Instant?>(initialState: nil)

    private static func shouldLogError() -> Bool {
        let now = ContinuousClock.now
        return lastErrorLog.withLock { last in
            if let last, now - last < .seconds(5) { return false }
            last = now
            return true
        }
    }

    override func loadTile(at path: MKTileOverlayPath) async throws -> Data {
        // Reported under the modern map's id, as the other layers report
        // under theirs. A failing ground shows Apple's map through it, so the
        // credit strip reads this phase and says so (`MapAttributionStrip`).
        let token = progress?.began(AtlasRasterBase.layerID)
        do {
            let data = try await AtlasRasterBase.mapKitTile(
                style: style, z: path.z, x: path.x, y: path.y, baseURL: baseURL, session: session
            )
            if let token { progress?.finished(token, .served) }
            return data
        } catch {
            let outcome = TileLoadOutcome(classifying: error)
            if let token { progress?.finished(token, outcome) }
            if outcome == .failed, Self.shouldLogError() {
                Self.logger.error("tile \(path.z)/\(path.x)/\(path.y) failed: \(String(describing: error))")
            } else {
                Self.logger.debug("tile \(path.z)/\(path.x)/\(path.y) failed: \(String(describing: error))")
            }
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
