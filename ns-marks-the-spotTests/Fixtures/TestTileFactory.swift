import Foundation
import UIKit

enum TestTileFactory {
    static func pngData(
        color: UIColor = .systemBlue,
        label: String = "test"
    ) -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256))
        return renderer.pngData { context in
            color.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 18),
                .foregroundColor: UIColor.white
            ]
            label.draw(at: CGPoint(x: 16, y: 16), withAttributes: attributes)
        }
    }
}
