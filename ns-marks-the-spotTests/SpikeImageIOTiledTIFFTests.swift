import Foundation
import ImageIO
import Testing

/// SPIKE ONLY — delete with this branch.
///
/// macOS ImageIO refuses tiled TIFFs that are also compressed (LZW, DEFLATE,
/// or JPEG); tiled+uncompressed and tiled+PackBits decode fine, and striped
/// files decode under every codec. Since the port targets iOS, that macOS
/// result decides nothing on its own. These two fixtures are the same 256x256
/// NAD83/UTM20 raster written twice by GDAL 3.9 — once tiled+DEFLATE, once
/// striped+DEFLATE — so the only difference between a pass and a fail is the
/// tiling.
struct SpikeImageIOTiledTIFFTests {

    /// 256x256 RGB, TILED=YES BLOCKXSIZE=128 BLOCKYSIZE=128 COMPRESS=DEFLATE.
    static let tiledDeflate = """
        SUkqAAgAAAARAAABAwABAAAAAAEAAAEBAwABAAAAAAEAAAIBAwADAAAA2gAAAAMBAwABAAAACAAAAAYBAwABAAAAAgAAABUB\
        AwABAAAAAwAAABwBAwABAAAAAQAAAD0BAwABAAAAAQAAAEIBAwABAAAAgAAAAEMBAwABAAAAgAAAAEQBBAAEAAAA8AAAAEUB\
        BAAEAAAA4AAAAFMBAwADAAAAAAEAAA6DDAADAAAABgEAAIKEDAAGAAAAHgEAAK+HAwAgAAAATgEAALGHAgAcAAAAjgEAAAAA\
        AAAIAAgACABLAAAASwAAAEsAAABLAAAAqgEAAPUBAABAAgAAiwIAAAEAAQABAAAAAAAAACRAAAAAAAAAJEAAAAAAAAAAAAAA\
        AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACATyJBAAAAAHh0U0EAAAAAAAAAAAEAAQAAAAcAAAQAAAEAAQABBAAAAQABAAIE\
        sYcVAAAAAQixhwYAFQAGCAAAAQCOIwAMAAABAChpBAwAAAEAKSNOQUQ4MyAvIFVUTSB6b25lIDIwTnxOQUQ4M3wAeJztwkER\
        AAAMAqCyy7RMxjKGHzjyF1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVXS/51oaReJzt\
        wkERAAAMAqCyy7RMxjKGHzjyF1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVXS/51oaR\
        eJztwkERAAAMAqCyy7RMxjKGHzjyF1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVXS/5\
        1oaReJztwkERAAAMAqCyy7RMxjKGHzjyF1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV\
        XS/51oaR\
        """

    /// The same raster, TILED=NO COMPRESS=DEFLATE.
    static let stripedDeflate = """
        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\
        """

    private static func source(_ base64: String) throws -> CGImageSource {
        let data = try #require(Data(base64Encoded: base64.filter { !$0.isWhitespace }))
        return try #require(CGImageSourceCreateWithURL(write(data) as CFURL, nil))
    }

    private static func write(_ data: Data) -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".tif")
        try? data.write(to: url)
        return url
    }

    private static func dimensions(_ source: CGImageSource) -> (Int, Int)? {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
            as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }
        return (width, height)
    }

    @Test("Control: iOS ImageIO decodes a striped DEFLATE GeoTIFF")
    func stripedDecodes() throws {
        let source = try Self.source(Self.stripedDeflate)
        let size = Self.dimensions(source)
        #expect(size?.0 == 256)
        #expect(size?.1 == 256)
        #expect(CGImageSourceCreateImageAtIndex(source, 0, nil) != nil)
    }

    @Test("The question: does iOS ImageIO decode a TILED DEFLATE GeoTIFF?")
    func tiledDecodes() throws {
        let source = try Self.source(Self.tiledDeflate)
        let size = Self.dimensions(source)
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        // Recorded, not asserted — the spike is measuring iOS, not asserting a
        // behaviour we already believe. The failure message carries the answer.
        Issue.record("iOS ImageIO tiled+DEFLATE: properties=\(String(describing: size)) image=\(image == nil ? "nil" : "\(image!.width)x\(image!.height)")")
    }
}
