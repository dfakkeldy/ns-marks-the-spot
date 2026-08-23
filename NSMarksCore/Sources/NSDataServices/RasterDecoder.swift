import CoreGraphics
import Foundation
import ImageIO

/// Turns image bytes into raw RGBA samples.
///
/// A seam, for the same reason `HTTPTransport` is one: the coastal flood
/// evidence is a pixel count, and a test that could not hand the counter a known
/// picture would be testing the province's renderer rather than this app's
/// reading of it.
public nonisolated struct RasterDecoder: Sendable {
    /// Row-major samples from the top-left corner, four bytes per pixel, alpha
    /// last.
    public struct Raster: Sendable, Equatable {
        public let rgba: [UInt8]
        public let width: Int
        public let height: Int

        public init(rgba: [UInt8], width: Int, height: Int) {
            self.rgba = rgba
            self.width = width
            self.height = height
        }
    }

    public struct UndecodableRaster: Error, Equatable, Sendable {
        public init() {}
    }

    private let decode: @Sendable (Data) throws(UndecodableRaster) -> Raster

    public init(_ decode: @escaping @Sendable (Data) throws(UndecodableRaster) -> Raster) {
        self.decode = decode
    }

    public func callAsFunction(_ data: Data) throws(UndecodableRaster) -> Raster {
        try decode(data)
    }

    /// Decodes through ImageIO into a straight RGBA buffer.
    ///
    /// Drawn into a device-RGB bitmap rather than read out of the source
    /// directly, because the province's exports arrive as png32 with a palette
    /// or a colour profile depending on the service, and only the drawn result
    /// has one predictable layout. Alpha is what gets counted, and
    /// `premultipliedLast` keeps it in the last byte of each pixel.
    public static func coreGraphics() -> RasterDecoder {
        RasterDecoder { data throws(UndecodableRaster) in
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
                  image.width > 0, image.height > 0,
                  // An image claiming a size whose buffer cannot be described
                  // is refused rather than trapped on the multiply below.
                  image.width <= Int.max / 4 / image.height
            else { throw UndecodableRaster() }

            let width = image.width
            let height = image.height
            var bytes = [UInt8](repeating: 0, count: width * height * 4)
            let drew = bytes.withUnsafeMutableBytes { buffer -> Bool in
                guard let context = CGContext(
                    data: buffer.baseAddress,
                    width: width,
                    height: height,
                    bitsPerComponent: 8,
                    bytesPerRow: width * 4,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
                ) else { return false }
                context.draw(
                    image,
                    in: CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height))
                )
                return true
            }
            guard drew else { throw UndecodableRaster() }
            return Raster(rgba: bytes, width: width, height: height)
        }
    }
}
