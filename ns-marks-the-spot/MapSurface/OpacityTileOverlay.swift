import MapKit
import UIKit

final class OpacityTileOverlay: MKTileOverlay {
    /// Set to true to draw tile borders and coordinates on every tile (including real ones).
    static let debugShowTileGrid = false
    static let bundledNativeZoomRange = 11...15

    let configuration: TileLayerConfiguration
    weak var renderer: MKTileOverlayRenderer?
    private let tileCache: TileCache?
    private let tileFetcher: TileFetcher?

    init(configuration: TileLayerConfiguration, tileCache: TileCache? = nil, tileFetcher: TileFetcher? = nil) {
        self.configuration = configuration
        self.tileCache = tileCache
        self.tileFetcher = tileFetcher
        super.init(urlTemplate: nil)
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, (any Error)?) -> Void) {
        let cacheKey = configuration.cacheIdentifier

        if let cache = tileCache, let cached = cache.cachedTile(z: path.z, x: path.x, y: path.y, layerName: cacheKey) {
            result(cached, nil)
            return
        }

        if let tileData = loadTileFromBundle(path: path) {
            tileCache?.cacheTile(tileData, z: path.z, x: path.x, y: path.y, layerName: cacheKey)
            result(tileData, nil)
            return
        }

        if let tile_fetcher = tileFetcher,
           case .tile(let remoteURL) = configuration.source,
           remoteURL.scheme == "https" || remoteURL.scheme == "http"
        {
            Task {
                do {
                    let data = try await tile_fetcher.fetchTile(
                        z: path.z, x: path.x, y: path.y,
                        from: remoteURL, layerName: cacheKey
                    )
                    result(data, nil)
                } catch {
                    result(fallbackTile(path: path), nil)
                }
            }
            return
        }

        if let tile_fetcher = tileFetcher,
           case .arcgisMapService(let serverURL, let transparent) = configuration.source
        {
            Task {
                do {
                    let data = try await tile_fetcher.fetchArcGISMapServiceTile(
                        z: path.z,
                        x: path.x,
                        y: path.y,
                        from: serverURL,
                        layerName: cacheKey,
                        transparent: transparent
                    )
                    result(data, nil)
                } catch {
                    result(fallbackTile(path: path), nil)
                }
            }
            return
        }

        if let tile_fetcher = tileFetcher,
           case .arcgisDynamic(let serverURL, let dynamicLayers, let layerRestrictions) = configuration.source
        {
            Task {
                do {
                    let data = try await tile_fetcher.fetchArcGISDynamicTile(
                        z: path.z, x: path.x, y: path.y,
                        from: serverURL, layerName: cacheKey,
                        dynamicLayersJSON: dynamicLayers,
                        layerRestrictions: layerRestrictions
                    )
                    result(data, nil)
                } catch {
                    result(fallbackTile(path: path), nil)
                }
            }
            return
        }

        result(fallbackTile(path: path), nil)
    }

    private func loadTileFromBundle(path: MKTileOverlayPath) -> Data? {
        if Self.bundledNativeZoomRange.contains(path.z) {
            return loadRawTileFromBundle(z: path.z, x: path.x, y: path.y)
        }

        if path.z < Self.bundledNativeZoomRange.lowerBound {
            return loadStitchedTileFromBundle(z: path.z, x: path.x, y: path.y)
        }

        if path.z > Self.bundledNativeZoomRange.upperBound {
            let sourceZoom = Self.bundledNativeZoomRange.upperBound
            let scaleFactor = 1 << (path.z - sourceZoom)
            let parentX = path.x / scaleFactor
            let parentY = path.y / scaleFactor

            if let tileData = loadRawTileFromBundle(z: sourceZoom, x: parentX, y: parentY),
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
        let tilePath = "Tiles/\(configuration.name)/\(z)/\(x)/\(y)"
        guard let url = Bundle.main.url(forResource: tilePath, withExtension: "png") else {
            return nil
        }
        return try? Data(contentsOf: url)
    }

    private func loadStitchedTileFromBundle(z: Int, x: Int, y: Int) -> Data? {
        let targetZ = Self.bundledNativeZoomRange.lowerBound
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

    private func fallbackTile(path: MKTileOverlayPath) -> Data? {
        if Self.debugShowTileGrid {
            return generatePlaceholderTile(path: path)
        }

        return transparentTile()
    }

    private func transparentTile() -> Data? {
        let size = CGSize(width: 256, height: 256)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.pngData { _ in }
    }

    private func generatePlaceholderTile(path: MKTileOverlayPath) -> Data? {
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
