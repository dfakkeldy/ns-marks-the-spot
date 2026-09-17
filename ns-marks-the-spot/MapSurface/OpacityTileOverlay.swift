import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import UIKit

/// `nonisolated`: MapKit invokes `loadTile` on its own background queues, so
/// nothing here may require the main actor. All stored state is immutable
/// except `renderer`, which only the main-actor `MapController` touches.
///
/// `@unchecked Sendable` states that in the compiler's terms, and the isolation
/// above is what makes it true rather than hopeful: every stored property is a
/// `let` of a thread-safe type except `renderer`, which is `@MainActor` and so
/// cannot be reached from the background queues `loadTile` runs on. The
/// conformance is needed because the print export hands a set of these overlays
/// to a `@Sendable` tile provider — the export fetches through the map's own
/// overlays precisely so it inherits their cache and their licence gate, and
/// the alternative was a second, ungated route to the same sources.
nonisolated final class OpacityTileOverlay: MKTileOverlay, @unchecked Sendable {
    /// Set to true to draw tile borders and coordinates on every tile (including real ones).
    static let debugShowTileGrid = false

    let configuration: TileLayerConfiguration
    /// Where this overlay sits in the draw order, worked out once.
    ///
    /// It is a function of `configuration.id` and nothing else, and the id does
    /// not change — but it was recomputed on every comparison of every insert,
    /// each time parsing a `LayerID` out of a string and looking it up in the
    /// catalogue. Installing a few hundred parcels against a screen of tile
    /// overlays paid that on the main thread, per pair.
    let cachedDrawOrder: Int
    @MainActor weak var renderer: MKTileOverlayRenderer?
    private let tileCache: TileCache?
    private let tileFetcher: TileFetcher?
    private let tileStore: TileStore?
    private let fletcherMigration: Task<Void, Never>?
    private let clearanceBox: LicenceClearanceBox
    private let progress: LayerLoadProgressBox?

    init(
        configuration: TileLayerConfiguration,
        tileCache: TileCache? = nil,
        tileFetcher: TileFetcher? = nil,
        tileStore: TileStore? = nil,
        fletcherMigration: Task<Void, Never>? = nil,
        clearanceBox: LicenceClearanceBox = LicenceClearanceBox(),
        progress: LayerLoadProgressBox? = nil
    ) {
        self.configuration = configuration
        self.cachedDrawOrder = Self.drawOrder(for: configuration.id)
        self.tileCache = tileCache
        self.tileFetcher = tileFetcher
        self.tileStore = tileStore
        self.fletcherMigration = fletcherMigration
        self.clearanceBox = clearanceBox
        self.progress = progress
        super.init(urlTemplate: nil)
    }

    /// An id that is not a catalogued layer has no stated position. The tile
    /// pane's own number puts it with the rasters rather than above the vector
    /// layers, which is where an unrecognised *tile* belongs.
    private static func drawOrder(for id: String) -> Int {
        guard let layer = LayerID(rawValue: id),
              let z = OverlayZIndex.tileZIndex(for: layer)
        else {
            return OverlayZIndex.drawOrder(OverlayZIndex.leafletTilePane, in: .tile)
        }
        return OverlayZIndex.drawOrder(z, in: .tile)
    }

    /// Overrides the async translation of `loadTile(at:result:)`; MapKit's ObjC
    /// completion entry point dispatches here through the generated thunk. The
    /// async form avoids unstructured `Task` creation, which the Swift 6.0
    /// region-isolation checker cannot analyze inside this ObjC override
    /// ("pattern that the region-based isolation checker does not understand").
    override func loadTile(at path: MKTileOverlayPath) async throws -> Data {
        // Leaflet asks `_isValidTile` before it creates a request, so in the
        // browser a square no sheet reaches never enters a load cycle and the
        // row keeps saying "Ready to load". MapKit has no such gate: it asks
        // for every square in view and expects an answer, and answering
        // "served" for ground the survey never mapped is what put "Ready"
        // under a layer that had drawn nothing. Over Halifax, with Fletcher
        // switched on, the panel was reporting a finished load of nothing.
        //
        // The square still has to come back, because MapKit retries a thrown
        // error. What changes is that no request is counted, which is the
        // browser's own accounting.
        if case .fletcherSheets = configuration.source,
           FletcherSheets.sheets(coveringTileX: path.x, y: path.y, z: path.z).isEmpty
        {
            return try Self.fallbackTileData(z: path.z, x: path.x, y: path.y)
        }

        let token = progress?.began(configuration.id)
        do {
            let (data, outcome, _) = try await tile(at: path)
            if let token { progress?.finished(token, outcome) }
            return data
        } catch {
            if let token { progress?.finished(token, TileLoadOutcome(classifying: error)) }
            throw error
        }
    }

    /// The same square `loadTile` would hand MapKit, plus the separate question
    /// of whether it is a tile or a stand-in for one.
    ///
    /// The print export needs both, and `loadTile` can only give it one.
    /// MapKit treats a thrown error as a tile to retry, so every failure there
    /// has to come back as transparent bytes — and once those are drawn they
    /// are indistinguishable from a source that legitimately has nothing at
    /// this square. A page whose legend was built from `loadTile` alone would
    /// tell its reader the layer had been asked and answered when it had not.
    ///
    /// Deliberately outside the layer-load progress the map reports: an export
    /// is not the screen loading, and counting its fetches would move the
    /// panel's per-layer state for a map nobody is looking at.
    func exportTile(
        at path: MKTileOverlayPath
    ) async throws -> (Data, TileLoadOutcome, TileSubstance) {
        try await tile(at: path)
    }

    /// The tile, whether producing it went the way it was supposed to, and what
    /// is actually in it.
    ///
    /// Three separate answers. A layer that legitimately has nothing at this
    /// square — outside the Fletcher sheets, or refused by the licence —
    /// returns a transparent tile and `.served`, because the panel has better
    /// words for both of those than "source temporarily unavailable"; only a
    /// source we could not reach, or an answer that was not a tile, is
    /// `.failed`.
    ///
    /// The substance is the third answer and exists for the printed page. Two
    /// of those `.served` squares carry no ink from any source, and a legend
    /// built from the outcome alone would credit a licence for pixels that were
    /// never drawn and tell the reader that surveyed ground came back empty.
    private func tile(
        at path: MKTileOverlayPath
    ) async throws -> (Data, TileLoadOutcome, TileSubstance) {
        let cacheKey = configuration.cacheIdentifier
        let z = path.z
        let x = path.x
        let y = path.y

        // Before the cache, not after. Bytes already on disk are still Province
        // imagery, and answering from the cache after a refusal would make the
        // gate mean "stop fetching" where the user was told it means "stop
        // using". Checking here is what makes the map agree with the switch.
        //
        // Sweeping those bytes off disk when an accepted licence is later
        // revoked is a separate obligation, and it is met beside the revoke
        // control in `OverlayViewModel.revokeProvinceLicence`. This check is
        // still what makes the two agree in the window between them: the
        // clearance changes first and the disk is emptied a moment later, and
        // for that moment the cache still holds imagery the user has withdrawn
        // permission for.
        if case .catalogExport(let layerID) = configuration.source,
           !clearanceBox.clearance.allows(layerID)
        {
            return (try Self.fallbackTileData(z: z, x: x, y: y), .served, .licenceRefused)
        }

        if let cache = tileCache, let cached = cache.cachedTile(z: z, x: x, y: y, layerName: cacheKey) {
            if case .fletcherSheets = configuration.source {
                return (cached, .served, Self.substance(of: cached))
            }
            return (cached, .served, .source)
        }

        if let fetcher = tileFetcher,
           case .fletcherSheets(let baseURL) = configuration.source
        {
            // What the user downloaded, asked before the network. Without this
            // a saved area is bytes on the disk that nothing ever reads: the
            // downloader writes to `TileStore` and every other path here reads
            // the cache, so an area could report "complete" while the map went
            // on fetching — and drew nothing at all with the phone offline.
            //
            // After the cache above rather than before it, because the two hold
            // the same picture and the cache answers from memory.
            if let saved = await savedTile(z: z, x: x, y: y) {
                return (saved, .served, Self.substance(of: saved))
            }

            let sheet = await Self.fletcherMosaicTile(
                z: z, x: x, y: y,
                baseURL: baseURL, layerName: cacheKey,
                fetcher: fetcher, cache: tileCache
            )
            if let tileData = sheet.data {
                return (tileData, sheet.outcome, Self.substance(of: tileData))
            }
            // No sheet covers this square, or the ones that do could not be
            // reached. The outcome already separates those two; the substance
            // is what stops an uncovered square being counted as ink.
            return (
                try Self.fallbackTileData(z: z, x: x, y: y),
                sheet.outcome,
                sheet.outcome == .served ? .outsideCoverage : .placeholder
            )
        }

        if let fetcher = tileFetcher,
           case .tile(let remoteURL) = configuration.source,
           remoteURL.scheme == "https" || remoteURL.scheme == "http"
        {
            do {
                let tileData = try await fetcher.fetchTile(
                    z: z, x: x, y: y,
                    from: remoteURL, layerName: cacheKey
                )
                return (tileData, .served, .source)
            } catch {
                return (
                    try Self.fallbackTileData(z: z, x: x, y: y),
                    TileLoadOutcome(classifying: error),
                    .placeholder
                )
            }
        }

        if let fetcher = tileFetcher,
           case .catalogExport(let layerID) = configuration.source
        {
            let export = await Self.catalogExportTile(
                layerID: layerID,
                z: z, x: x, y: y,
                layerName: cacheKey,
                clearanceBox: clearanceBox,
                fetcher: fetcher,
                cache: tileCache
            )
            if let tileData = export.data {
                return (tileData, export.outcome, .source)
            }
            // A `.served` nothing from this path is the licence being answered
            // mid-flight — the only way the request is made and the bytes then
            // discarded. Everything else here is a stand-in for an answer.
            return (
                try Self.fallbackTileData(z: z, x: x, y: y),
                export.outcome,
                export.outcome == .served ? .licenceRefused : .placeholder
            )
        }

        // A layer with no fetcher and no source to read: nothing was asked, and
        // the square is a stand-in rather than an answer.
        return (try Self.fallbackTileData(z: z, x: x, y: y), .served, .placeholder)
    }

    /// One `/export` tile for a catalogued layer, including the second pass for
    /// the one layer the web draws twice.
    ///
    /// Both passes are stacked into a single tile rather than mounted as two
    /// MapKit overlays. On the web the casing renders exactly one z-index above
    /// its base — `PROVINCE_LAYER_Z_INDEXES["roads"]` is 235 and the casing is
    /// 236 — and nothing else occupies 236 through 239, so no layer can come
    /// between them. Stacking here gives the same result with one row, one
    /// opacity slider and one cache entry, instead of a second installed layer
    /// whose id, visibility and opacity would have to be kept in step with the
    /// row the user actually sees.
    ///
    /// Returns `nil` data when the layer produced nothing to draw, including
    /// when the licence refuses it — the caller answers with a transparent
    /// tile, because MapKit treats a thrown error as a tile to retry.
    ///
    /// The outcome is the separate question of whether that nothing was an
    /// answer or a failure to get one, which is what the panel reports.
    private static func catalogExportTile(
        layerID: LayerID,
        z: Int,
        x: Int,
        y: Int,
        layerName: String,
        clearanceBox: LicenceClearanceBox,
        fetcher: TileFetcher,
        cache: TileCache?
    ) async -> (data: Data?, outcome: TileLoadOutcome) {
        var stacked: [Data] = []
        do {
            let clearance = clearanceBox.clearance
            let base = try TileRequestFactory.tileRequest(
                for: layerID, x: x, y: y, z: z, clearance: clearance
            )
            stacked.append(try await fetcher.imageData(from: base.url))

            if let casing = try TileRequestFactory.overlayTileRequest(
                for: layerID, x: x, y: y, z: z, clearance: clearance
            ) {
                stacked.append(try await fetcher.imageData(from: casing.url))
            }
        } catch {
            // A refusal and a failed fetch are both "no tile right now". The
            // distinction that matters — whether the layer may be requested at
            // all — was already made before the cache read, and drawing a
            // partial composite would freeze a road with no casing under it.
            //
            // Classified rather than assumed to be a failure: the base pass and
            // the casing pass are two round trips, and a pan away between them
            // cancels whichever is in flight.
            return (nil, TileLoadOutcome(classifying: error))
        }

        // Re-read rather than reuse the value the requests were built from. A
        // network round trip is long enough for the user to refuse in the
        // middle of it, and the bytes in hand are the ones that would otherwise
        // be written to disk and drawn — a refusal that only stopped the *next*
        // request would leave this tile on the map and in the cache.
        //
        // Discarding them is the licence working, not the source failing, so
        // this reports `.served`: the row already says the licence is what
        // stands in the way.
        guard clearanceBox.clearance.allows(layerID) else { return (nil, .served) }

        guard let composited = TileComposite.stack(stacked) else { return (nil, .failed) }
        cache?.cacheTile(composited, z: z, x: x, y: y, layerName: layerName)
        return (composited, .served)
    }

    private static func fallbackTileData(z: Int, x: Int, y: Int) throws -> Data {
        guard let data = fallbackTile(z: z, x: x, y: y) else {
            throw CocoaError(.fileReadUnknown)
        }
        return data
    }

    /// Fetch the published mosaic once, preserving its precomposited alpha.
    private static func fletcherMosaicTile(
        z: Int, x: Int, y: Int, baseURL: URL, layerName: String,
        fetcher: TileFetcher, cache: TileCache?
    ) async -> (data: Data?, outcome: TileLoadOutcome) {
        guard FletcherSheets.zoomRange.contains(z),
              !FletcherSheets.sheets(coveringTileX: x, y: y, z: z).isEmpty
        else { return (nil, .served) }
        guard let template = FletcherTileURL.tileTemplate(baseURL: baseURL),
              let url = URL(string: template)
        else { return (nil, .failed) }
        do {
            let data = try await fetcher.fetchTile(
                z: z, x: x, y: y, from: url, layerName: layerName, cacheResult: false
            )
            cache?.cacheTile(data, z: z, x: x, y: y, layerName: layerName)
            return (data, .served)
        } catch {
            return (nil, TileLoadOutcome(classifying: error))
        }
    }

    /// A tile the user downloaded into a saved area, once the source sweep has
    /// had its turn.
    ///
    /// The wait is the point of taking the migration handle. `TileStore` keys
    /// Fletcher tiles by layer id alone, so bytes from a superseded tile build
    /// sit under the same key as the current one until `FletcherSourceMigration`
    /// removes them — and that runs detached at launch. Reading without waiting
    /// would let the first tiles of a session come from a source the Rumsey
    /// permission does not cover. `nil` migration means there is nothing
    /// pending, which is every launch after the first one on a revision.
    private func savedTile(z: Int, x: Int, y: Int) async -> Data? {
        guard let tileStore else { return nil }
        await fletcherMigration?.value
        return await tileStore.tile(z: z, x: x, y: y, layerID: configuration.id)
    }

    /// Blank source PNGs are answered coverage, not imagery to credit in print.
    private static func substance(of data: Data) -> TileSubstance {
        // Server PNGs need not share our encoder's byte representation. Classify
        // actual alpha so blank mosaic tiles do not acquire a print credit just
        // because they came from R2 or survived an offline round trip.
        if data == TileComposite.transparent { return .outsideCoverage }
        guard let image = UIImage(data: data)?.cgImage else { return .source }
        var pixels = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let isBlank = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress, width: image.width, height: image.height,
                bitsPerComponent: 8, bytesPerRow: image.width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return stride(from: 3, to: buffer.count, by: 4).allSatisfy { buffer[$0] == 0 }
        }
        return isBlank ? .outsideCoverage : .source
    }

    private static func fallbackTile(z: Int, x: Int, y: Int) -> Data? {
        if debugShowTileGrid {
            return generatePlaceholderTile(z: z, x: x, y: y)
        }

        // Reuse the fallback instead of encoding the same blank on every request.
        return TileComposite.transparent
    }

    private static func generatePlaceholderTile(z: Int, x: Int, y: Int) -> Data? {
        let size = CGSize(width: 256, height: 256)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.pngData { ctx in
            UIColor(red: 0.87, green: 0.80, blue: 0.66, alpha: 0.7).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            UIColor.brown.withAlphaComponent(0.3).setStroke()
            ctx.stroke(CGRect(origin: .zero, size: size).insetBy(dx: 0.5, dy: 0.5))

            let text = "z\(z) x\(x) y\(y)"
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 11),
                .foregroundColor: UIColor.brown.withAlphaComponent(0.5)
            ]
            let textSize = text.size(withAttributes: attrs)
            let textOrigin = CGPoint(
                x: (size.width - textSize.width) / 2,
                y: (size.height - textSize.height) / 2
            )
            text.draw(at: textOrigin, withAttributes: attrs)
        }
    }
}
