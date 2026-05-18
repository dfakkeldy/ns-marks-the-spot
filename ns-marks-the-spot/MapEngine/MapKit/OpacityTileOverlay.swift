import MapKit
import UIKit

final class OpacityTileOverlay: MKTileOverlay {
    weak var mapLayer: (any MapLayer)?
    weak var renderer: MKTileOverlayRenderer?

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, (any Error)?) -> Void) {
        if let tileData = loadTileFromBundle(path: path) {
            result(tileData, nil)
            return
        }

        let placeholder = generatePlaceholderTile(path: path)
        result(placeholder, nil)
    }

    private func loadTileFromBundle(path: MKTileOverlayPath) -> Data? {
        guard let layerName = mapLayer?.name else { return nil }
        let tilePath = "Tiles/\(layerName)/\(path.z)/\(path.x)/\(path.y)"
        guard let url = Bundle.main.url(forResource: tilePath, withExtension: "png") else {
            return nil
        }
        return try? Data(contentsOf: url)
    }

    private func generatePlaceholderTile(path: MKTileOverlayPath) -> Data? {
        let size = CGSize(width: 256, height: 256)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.pngData { ctx in
            // Sepia-tinted background — mimics old map paper
            UIColor(red: 0.87, green: 0.80, blue: 0.66, alpha: 0.7).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            // Tile border for grid visibility
            UIColor.brown.withAlphaComponent(0.3).setStroke()
            ctx.stroke(CGRect(origin: .zero, size: size).insetBy(dx: 0.5, dy: 0.5))

            // Coordinate label for debugging
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
