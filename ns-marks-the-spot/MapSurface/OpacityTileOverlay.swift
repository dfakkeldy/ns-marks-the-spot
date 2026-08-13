import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import UIKit

/// `nonisolated`: MapKit invokes `loadTile` on its own background queues, so
/// nothing here may require the main actor. All stored state is immutable
/// except `renderer`, which only the main-actor `MapController` touches.
nonisolated final class OpacityTileOverlay: MKTileOverlay {
    /// Set to true to draw tile borders and coordinates on every tile (including real ones).
    static let debugShowTileGrid = false

    let configuration: TileLayerConfiguration
    weak var renderer: MKTileOverlayRenderer?
    private let tileCache: TileCache?
    private let tileFetcher: TileFetcher?
    private let clearanceBox: LicenceClearanceBox

    init(
        configuration: TileLayerConfiguration,
        tileCache: TileCache? = nil,
        tileFetcher: TileFetcher? = nil,
        clearanceBox: LicenceClearanceBox = LicenceClearanceBox()
    ) {
        self.configuration = configuration
        self.tileCache = tileCache
        self.tileFetcher = tileFetcher
        self.clearanceBox = clearanceBox
        super.init(urlTemplate: nil)
    }

    /// Overrides the async translation of `loadTile(at:result:)`; MapKit's ObjC
    /// completion entry point dispatches here through the generated thunk. The
    /// async form avoids unstructured `Task` creation, which the Swift 6.0
    /// region-isolation checker cannot analyze inside this ObjC override
    /// ("pattern that the region-based isolation checker does not understand").
    override func loadTile(at path: MKTileOverlayPath) async throws -> Data {
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
        // revoked is a separate obligation, and nothing reaches
        // `ProvinceLicenceStore.revoke()` yet — this app currently has an
        // accept-or-decline sheet and no revoke control. When one lands it needs
        // a cache sweep beside it; until then no session can get from accepted
        // back to refused, so there is no state this check leaves inconsistent.
        if case .catalogExport(let layerID) = configuration.source,
           !clearanceBox.clearance.allows(layerID)
        {
            return try Self.fallbackTileData(z: z, x: x, y: y)
        }

        if let cache = tileCache, let cached = cache.cachedTile(z: z, x: x, y: y, layerName: cacheKey) {
            return cached
        }

        if let fetcher = tileFetcher,
           case .fletcherSheets(let baseURL) = configuration.source
        {
            if let tileData = await Self.fletcherSheetTile(
                z: z, x: x, y: y,
                baseURL: baseURL, layerName: cacheKey,
                fetcher: fetcher, cache: tileCache
            ) {
                return tileData
            }
            return try Self.fallbackTileData(z: z, x: x, y: y)
        }

        if let fetcher = tileFetcher,
           case .tile(let remoteURL) = configuration.source,
           remoteURL.scheme == "https" || remoteURL.scheme == "http"
        {
            do {
                return try await fetcher.fetchTile(
                    z: z, x: x, y: y,
                    from: remoteURL, layerName: cacheKey
                )
            } catch {
                return try Self.fallbackTileData(z: z, x: x, y: y)
            }
        }

        if let fetcher = tileFetcher,
           case .catalogExport(let layerID) = configuration.source
        {
            if let tileData = await Self.catalogExportTile(
                layerID: layerID,
                z: z, x: x, y: y,
                layerName: cacheKey,
                clearanceBox: clearanceBox,
                fetcher: fetcher,
                cache: tileCache
            ) {
                return tileData
            }
            return try Self.fallbackTileData(z: z, x: x, y: y)
        }

        return try Self.fallbackTileData(z: z, x: x, y: y)
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
    /// Returns `nil` when the layer produced nothing to draw, including when
    /// the licence refuses it — the caller answers with a transparent tile,
    /// because MapKit treats a thrown error as a tile to retry.
    private static func catalogExportTile(
        layerID: LayerID,
        z: Int,
        x: Int,
        y: Int,
        layerName: String,
        clearanceBox: LicenceClearanceBox,
        fetcher: TileFetcher,
        cache: TileCache?
    ) async -> Data? {
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
            return nil
        }

        // Re-read rather than reuse the value the requests were built from. A
        // network round trip is long enough for the user to refuse in the
        // middle of it, and the bytes in hand are the ones that would otherwise
        // be written to disk and drawn — a refusal that only stopped the *next*
        // request would leave this tile on the map and in the cache.
        guard clearanceBox.clearance.allows(layerID) else { return nil }

        guard let composited = TileComposite.stack(stacked) else { return nil }
        cache?.cacheTile(composited, z: z, x: x, y: y, layerName: layerName)
        return composited
    }

    private static func fallbackTileData(z: Int, x: Int, y: Int) throws -> Data {
        guard let data = fallbackTile(z: z, x: x, y: y) else {
            throw CocoaError(.fileReadUnknown)
        }
        return data
    }

    /// One Fletcher tile, from every sheet that covers it.
    ///
    /// The sheets overlap along their surveyed margins, so a tile can fall under
    /// two or three of them — and where it does, each sheet usually holds only
    /// part of the picture, because a sheet's declared bounds are its
    /// georeferenced extent rather than the exact footprint of its scan. Taking
    /// the first sheet that answers would leave the rest of that tile blank.
    /// The web does not do that: Leaflet mounts all 24 as separate layers and
    /// stacks them, so a seam tile is drawn from every sheet that has pixels
    /// there.
    ///
    /// So this stacks too, in sheet order, lowest first — the same order Leaflet
    /// mounts them in, which is what decides who wins where two sheets both have
    /// ink. The single-sheet case is the overwhelming majority and returns its
    /// bytes untouched rather than paying a decode and re-encode for nothing.
    ///
    /// Returns `nil` when no sheet covers the tile, which is most of the world.
    private static func fletcherSheetTile(
        z: Int,
        x: Int,
        y: Int,
        baseURL: URL,
        layerName: String,
        fetcher: TileFetcher,
        cache: TileCache?
    ) async -> Data? {
        let covering = FletcherSheets.sheets(coveringTileX: x, y: y, z: z)
        guard !covering.isEmpty else { return nil }

        var stacked: [Data] = []
        var isWhole = true
        for sheet in covering {
            guard let template = FletcherTileURL.tileTemplate(
                sheet: sheet.sheet, baseURL: baseURL
            ), let templateURL = URL(string: template) else {
                isWhole = false
                continue
            }
            // Cached per sheet, not per layer: two sheets can answer for the
            // same (z, x, y), and one key for both would let a margin tile from
            // sheet 5 be served where sheet 6 was asked for.
            let sheetLayerName = Self.sheetCacheIdentifier(layerName, sheet: sheet.sheet)
            if let cached = cache?.cachedTile(z: z, x: x, y: y, layerName: sheetLayerName) {
                stacked.append(cached)
                continue
            }
            do {
                stacked.append(
                    try await fetcher.fetchTile(
                        z: z, x: x, y: y, from: templateURL, layerName: sheetLayerName
                    )
                )
            } catch {
                // A sheet with no ink here answers 404, and that is a complete
                // answer: the composite is whole without it. Only a sheet we
                // could not reach leaves the tile unfinished, and the
                // consequence of getting that wrong is a half-drawn seam frozen
                // into the cache.
                if !TileFetcherError.meansNoTileExists(error) {
                    isWhole = false
                }
            }
        }

        guard let composited = TileComposite.stack(stacked) else { return nil }

        // Cached under the layer key when the stack is whole, so `loadTile`'s
        // opening lookup skips all of this on the next draw. A partial stack is
        // deliberately not cached: the sheet that failed is the network, and
        // caching what we drew without it would freeze a half-drawn seam in
        // place until the cache was swept.
        //
        // Keyed on how many sheets *cover* the tile, not how many answered.
        // Over the interior one sheet covers, its bytes are already cached
        // under its own key, and a second copy under the layer key would double
        // the cache for most of the survey. At a seam two or more cover, and
        // caching the composite is what stops every later draw re-requesting
        // the sheet that legitimately 404s there.
        if isWhole, covering.count > 1 {
            cache?.cacheTile(composited, z: z, x: x, y: y, layerName: layerName)
        }
        return composited
    }

    /// The cache layer name for one sheet of a Fletcher layer.
    ///
    /// Not shared with the offline downloader, which writes saved areas to
    /// `TileStore` under the layer id and never touches this cache — the two
    /// stores answer different questions, and a saved area outliving a cache
    /// sweep is the point of having both.
    private static func sheetCacheIdentifier(_ layerName: String, sheet: Int) -> String {
        "\(layerName)_sheet-\(sheet)"
    }

    private static func fallbackTile(z: Int, x: Int, y: Int) -> Data? {
        if debugShowTileGrid {
            return generatePlaceholderTile(z: z, x: x, y: y)
        }

        return transparentTile()
    }

    private static func transparentTile() -> Data? {
        let size = CGSize(width: 256, height: 256)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.pngData { _ in }
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
