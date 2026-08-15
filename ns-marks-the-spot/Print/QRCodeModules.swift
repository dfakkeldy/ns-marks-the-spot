import CoreGraphics
import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation

/// The QR code for a link, as the grid of modules the page draws.
///
/// Core Image encodes; this reads the result back as booleans so the PDF can
/// draw the code as rectangles rather than embed a bitmap. Nothing here can
/// stop an export: every failure returns nil, and a page without a QR is a page
/// that simply does not offer the shortcut back to the map.
nonisolated enum QRCodeModules {
    /// Medium error correction, matching the web's `errorCorrectionLevel: "M"`
    /// — the same link has to produce the same code on both surfaces.
    static let correctionLevel = "M"

    static func modules(for text: String) -> [[Bool]]? {
        guard let message = text.data(using: .utf8), !message.isEmpty else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = message
        filter.correctionLevel = correctionLevel
        guard let output = filter.outputImage else { return nil }

        // One pixel per module: the generator's own scale, unscaled, so the
        // grid read back here is the grid the encoder produced rather than an
        // interpolation of it.
        let extent = output.extent.integral
        let width = Int(extent.width)
        let height = Int(extent.height)
        guard width > 0, height > 0,
              let image = CIContext().createCGImage(output, from: extent)
        else { return nil }

        var pixels = [UInt8](repeating: 0, count: width * height)
        guard let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return nil }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        // Core Graphics hands back the bottom row first; the composer wants the
        // top row first, which is how a QR reader sees the code.
        let grid = (0..<height).map { row in
            (0..<width).map { column in
                pixels[(height - row - 1) * width + column] < 128
            }
        }
        return trimmed(grid)
    }

    /// Drops the generator's own quiet zone.
    ///
    /// The page draws its own margin inside the slot it was given, so a second
    /// one carried in the grid would shrink the code inside its square for no
    /// reason — and the two margins together are not the quiet zone a scanner
    /// is looking for, they are just white paper.
    static func trimmed(_ grid: [[Bool]]) -> [[Bool]]? {
        let rows = grid.enumerated().filter { $0.element.contains(true) }.map(\.offset)
        guard let firstRow = rows.first, let lastRow = rows.last else { return nil }
        let columns = grid[0].indices.filter { column in
            grid.contains { $0[column] }
        }
        guard let firstColumn = columns.first, let lastColumn = columns.last else { return nil }
        return grid[firstRow...lastRow].map { Array($0[firstColumn...lastColumn]) }
    }
}
