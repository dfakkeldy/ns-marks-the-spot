import MapKit
import UIKit

/// `MKTileOverlay` subclass that loads Fletcher/ArcGIS tiles. MapKit invokes
/// `loadTile(at:result:)` on a background queue, so this type is `nonisolated`
/// (matching `MKTileOverlay`'s own `nonisolated` `init`/`loadTile`). All data
/// `loadTile` needs is captured as immutable, `Sendable` `let`s at init, so it
/// never reaches into main-actor state. `mapLayer`/`renderer` are touched only
/// by the renderer on the main actor and are isolated accordingly.
///
/// The bundle-stitching and placeholder helpers render off-screen with
/// `UIGraphicsImageRenderer`, which Apple documents as thread-safe ("usable on
/// any thread"); running them on MapKit's tile queue is therefore correct — not
/// a main-actor violation. (Were these APIs main-actor-isolated in the SDK, the
/// `nonisolated` callers below would fail to compile.)
nonisolated final class OpacityTileOverlay: MKTileOverlay {
    /// Live layer reference, read on the main actor for renderer alpha and id matching.
    @MainActor weak var mapLayer: (any MapLayer)?
    @MainActor weak var renderer: MKTileOverlayRenderer?

    /// Immutable tile-loading configuration, safe to read off the main actor.
    private let layerName: String
    private let cacheIdentifier: String
    private let layerType: MapLayerType
    private let tileCache: TileCache?
    private let tileFetcher: TileFetcher?

    init(layer: any MapLayer, tileCache: TileCache? = nil, tileFetcher: TileFetcher? = nil) {
        self.layerName = layer.name
        self.cacheIdentifier = layer.cacheIdentifier
        self.layerType = layer.type
        self.tileCache = tileCache
        self.tileFetcher = tileFetcher
        super.init(urlTemplate: nil)
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, (any Error)?) -> Void) {
        let cacheKey = cacheIdentifier

        if let cache = tileCache, let cached = cache.cachedTile(z: path.z, x: path.x, y: path.y, layerName: cacheKey) {
            result(cached, nil)
            return
        }

        if let tileData = loadTileFromBundle(path: path) {
            tileCache?.cacheTile(tileData, z: path.z, x: path.x, y: path.y, layerName: cacheKey)
            result(tileData, nil)
            return
        }

        if let tileFetcher,
           case .tile(let remoteURL) = layerType,
           remoteURL.scheme == "https" || remoteURL.scheme == "http"
        {
            // `result` is a one-shot ObjC completion handler. We hand it to a
            // single Task and never touch it again, so this capture is race-free
            // — an invariant the region checker can't see through the ObjC bridge.
            nonisolated(unsafe) let deliver = result
            Task {
                do {
                    let data = try await tileFetcher.fetchTile(
                        z: path.z, x: path.x, y: path.y,
                        from: remoteURL, layerName: cacheKey
                    )
                    deliver(data, nil)
                } catch {
                    deliver(Self.generatePlaceholderTile(path: path), nil)
                }
            }
            return
        }

        if let tileFetcher,
           case .arcgisDynamic(let serverURL, let dynamicLayers, let layerRestrictions) = layerType
        {
            nonisolated(unsafe) let deliver = result
            Task {
                do {
                    let data = try await tileFetcher.fetchArcGISDynamicTile(
                        z: path.z, x: path.x, y: path.y,
                        from: serverURL, layerName: cacheKey,
                        dynamicLayersJSON: dynamicLayers,
                        layerRestrictions: layerRestrictions
                    )
                    deliver(data, nil)
                } catch {
                    deliver(Self.generatePlaceholderTile(path: path), nil)
                }
            }
            return
        }

        result(Self.generatePlaceholderTile(path: path), nil)
    }

    private func loadTileFromBundle(path: MKTileOverlayPath) -> Data? {
        // Range 10-14 is native.
        if path.z >= 10 && path.z <= 14 {
            return loadRawTileFromBundle(z: path.z, x: path.x, y: path.y)
        }

        // Below 10, stitch tiles.
        if path.z < 10 {
            return loadStitchedTileFromBundle(z: path.z, x: path.x, y: path.y)
        }

        // Above 14, scale up tile from z=14.
        if path.z > 14 {
            let scaleFactor = 1 << (path.z - 14)
            let parentX = path.x / scaleFactor
            let parentY = path.y / scaleFactor

            if let tileData = loadRawTileFromBundle(z: 14, x: parentX, y: parentY),
               let img = UIImage(data: tileData) {
                let size = CGSize(width: 256, height: 256)
                let format = UIGraphicsImageRendererFormat()
                format.scale = 1.0
                let renderer = UIGraphicsImageRenderer(size: size, format: format)

                let subTileSize = 256.0 / CGFloat(scaleFactor)
                let offsetX = CGFloat(path.x % scaleFactor) * subTileSize
                let offsetY = CGFloat(path.y % scaleFactor) * subTileSize

                return renderer.pngData { ctx in
                    img.draw(in: CGRect(x: -offsetX, y: -offsetY, width: 256.0 * CGFloat(scaleFactor), height: 256.0 * CGFloat(scaleFactor)))
                }
            }
        }

        return nil
    }

    private func loadRawTileFromBundle(z: Int, x: Int, y: Int) -> Data? {
        let tilePath = "Tiles/\(layerName)/\(z)/\(x)/\(y)"
        guard let url = Bundle.main.url(forResource: tilePath, withExtension: "png") else {
            return nil
        }
        return try? Data(contentsOf: url)
    }

    private func loadStitchedTileFromBundle(z: Int, x: Int, y: Int) -> Data? {
        let targetZ = 10
        guard z < targetZ else { return nil }

        let diff = targetZ - z
        let numTilesPerSide = 1 << diff
        let tileSize = 256 / CGFloat(numTilesPerSide)

        let size = CGSize(width: 256, height: 256)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        var hasAnyImage = false

        let data = renderer.pngData { ctx in
            let startX = x << diff
            let startY = y << diff

            for row in 0..<numTilesPerSide {
                for col in 0..<numTilesPerSide {
                    let tileX = startX + col
                    let tileY = startY + row

                    if let imgData = loadRawTileFromBundle(z: targetZ, x: tileX, y: tileY),
                       let img = UIImage(data: imgData) {
                        hasAnyImage = true
                        let rect = CGRect(
                            x: CGFloat(col) * tileSize,
                            y: CGFloat(row) * tileSize,
                            width: tileSize,
                            height: tileSize
                        )
                        img.draw(in: rect)
                    }
                }
            }
        }

        return hasAnyImage ? data : nil
    }

    private static func generatePlaceholderTile(path: MKTileOverlayPath) -> Data? {
        let size = CGSize(width: 256, height: 256)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.pngData { ctx in
            UIColor(red: 0.87, green: 0.80, blue: 0.66, alpha: 0.7).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            UIColor.brown.withAlphaComponent(0.3).setStroke()
            ctx.stroke(CGRect(origin: .zero, size: size).insetBy(dx: 0.5, dy: 0.5))

            let text = "z\(path.z) x\(path.x) y\(path.y)"
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
