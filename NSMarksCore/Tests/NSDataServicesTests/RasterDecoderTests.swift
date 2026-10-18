import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers

@testable import NSDataServices

/// A PNG whose rows are known, written top row first.
///
/// Built through ImageIO rather than checked in as bytes so the fixture and the
/// thing under test disagree about nothing except orientation.
private func png(rows: [[UInt8]]) -> Data {
    let height = rows.count
    let width = rows[0].count / 4
    let provider = CGDataProvider(data: Data(rows.flatMap(\.self)) as CFData)!
    let image = CGImage(
        width: width,
        height: height,
        bitsPerComponent: 8,
        bitsPerPixel: 32,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
        provider: provider,
        decode: nil,
        shouldInterpolate: false,
        intent: .defaultIntent
    )!
    let encoded = NSMutableData()
    let destination = CGImageDestinationCreateWithData(
        encoded, UTType.png.identifier as CFString, 1, nil
    )!
    CGImageDestinationAddImage(destination, image, nil)
    #expect(CGImageDestinationFinalize(destination))
    return encoded as Data
}

@Suite("Raster decoding")
struct RasterDecoderTests {
    /// The one thing every caller depends on and no other test covers: the
    /// coastal sampler maps row 0 to the northern edge of the export's bounds,
    /// so a decoder that handed back the bottom row first would report the
    /// flooding on the wrong half of a parcel. Quartz draws from a lower-left
    /// origin, which is exactly the mistake this is here to catch.
    @Test("The first row of samples is the top of the picture")
    func rowZeroIsTheNorthEdge() throws {
        let opaqueRed: [UInt8] = [255, 0, 0, 255]
        let transparent: [UInt8] = [0, 0, 0, 0]
        let raster = try RasterDecoder.coreGraphics()(
            png(rows: [opaqueRed, transparent])
        )

        #expect(raster.width == 1)
        #expect(raster.height == 2)
        #expect(raster.rgba[3] == 255)
        #expect(raster.rgba[7] == 0)
    }

    /// Alpha is the whole measurement: the province's exports draw the hazard
    /// and leave everything else clear, and the sampler counts a pixel as
    /// flooded when its alpha is above zero.
    @Test("Alpha survives the round trip in the last byte of each pixel")
    func alphaStaysWhereTheSamplerLooks() throws {
        let raster = try RasterDecoder.coreGraphics()(
            png(rows: [[0, 0, 255, 255] + [0, 0, 0, 0]])
        )

        #expect(raster.width == 2)
        #expect(raster.height == 1)
        #expect(raster.rgba[3] == 255)
        #expect(raster.rgba[7] == 0)
    }

    @Test("Bytes that are not a picture are refused rather than guessed at")
    func rubbishIsRefused() {
        #expect(throws: RasterDecoder.UndecodableRaster.self) {
            try RasterDecoder.coreGraphics()(Data("not a picture".utf8))
        }
    }
}
