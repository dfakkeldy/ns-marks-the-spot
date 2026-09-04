import Foundation
import ImageIO
import Testing

@testable import GeoCore

/// The fixtures are written by GDAL 3.9, not by this repository, from one
/// source image whose pixels are a formula. So the expected pixels are the
/// formula, and nothing in the chain from the formula to the assertion is
/// written by the code under test.
@Suite("Decoding a TIFF ImageIO will not")
struct TiffRasterTests {
    /// The 130x100 source: `(x*6 & 255)` would repeat every 43 columns, so the
    /// channels are given different periods and the blue one mixes both. A
    /// stride read one byte or one row out lands on a different colour
    /// everywhere rather than in one corner.
    static func expected(x: Int, y: Int) -> (UInt8, UInt8, UInt8) {
        (UInt8((x * 2) & 255), UInt8((y * 2) & 255), UInt8((x + y) & 255))
    }

    static func expectedSmall(x: Int, y: Int) -> (UInt8, UInt8, UInt8) {
        (UInt8((x * 6) & 255), UInt8((y * 8) & 255), UInt8((x + y) & 255))
    }

    static func fixture(_ name: String) throws -> Data {
        let url = try #require(
            Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "tif")
                ?? Bundle.module.url(forResource: name, withExtension: "tif")
        )
        return try Data(contentsOf: url)
    }

    static func decode(_ name: String, maxDimension: Int = 4096) throws -> TiffRaster.Bitmap {
        let data = try fixture(name)
        let layout = try #require(try GeoTiffTags.layout(data))
        return try TiffRaster.decode(data, layout: layout, maxDimension: maxDimension)
    }

    /// Why this decoder exists, kept as a test rather than a comment: these are
    /// the same pixels as their striped twins, and ImageIO reports no size and
    /// returns no image for them. If a future OS starts reading them this test
    /// fails, which is the right way to find that out.
    @Test(arguments: ["tiled-deflate-pred", "tiled-lzw-pred"])
    func imageIoStillCannotReadATiledPredictedTiff(name: String) throws {
        let data = try Self.fixture(name)
        let source = try #require(CGImageSourceCreateWithData(data as CFData, nil))
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        #expect(properties?[kCGImagePropertyPixelWidth] == nil)
        #expect(CGImageSourceCreateImageAtIndex(source, 0, nil) == nil)
    }

    /// And the same file with the tiling taken away reads fine, which is what
    /// makes tiling the variable rather than the compression or the predictor
    /// on its own.
    @Test func imageIoReadsTheSamePredictedPixelsWhenTheyAreStriped() throws {
        let data = try Self.fixture("striped-deflate-pred")
        let source = try #require(CGImageSourceCreateWithData(data as CFData, nil))
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        #expect(properties?[kCGImagePropertyPixelWidth] as? Int == 130)
        #expect(CGImageSourceCreateImageAtIndex(source, 0, nil) != nil)
    }

    @Test(arguments: ["tiled-deflate-pred", "tiled-lzw-pred", "striped-deflate-pred"])
    func everyPixelComesBackAsTheSourceWroteIt(name: String) throws {
        let bitmap = try Self.decode(name)
        #expect(bitmap.width == 130)
        #expect(bitmap.height == 100)
        var wrong = 0
        for y in 0..<100 {
            for x in 0..<130 {
                let at = (y * 130 + x) * 4
                let (r, g, b) = Self.expected(x: x, y: y)
                if bitmap.rgba[at] != r || bitmap.rgba[at + 1] != g
                    || bitmap.rgba[at + 2] != b || bitmap.rgba[at + 3] != 255
                {
                    wrong += 1
                }
            }
        }
        #expect(wrong == 0, "\(name): \(wrong) of 13000 pixels differ from the source")
    }

    /// 130 across in 64-wide tiles leaves a last column of tiles holding two
    /// real pixels and 62 of padding, and 100 down in 64-high tiles leaves 36
    /// real rows in the bottom band. Reading the padding as picture is the
    /// mistake this catches.
    @Test func theEdgeTilesAreReadWithoutTheirPadding() throws {
        let bitmap = try Self.decode("tiled-deflate-pred")
        for (x, y) in [(129, 99), (128, 64), (129, 0), (64, 99)] {
            let at = (y * 130 + x) * 4
            let (r, g, b) = Self.expected(x: x, y: y)
            #expect(bitmap.rgba[at] == r)
            #expect(bitmap.rgba[at + 1] == g)
            #expect(bitmap.rgba[at + 2] == b)
        }
    }

    @Test(arguments: ["small-tiled-none", "small-tiled-packbits"])
    func theUncompressedAndRunLengthLayoutsReadTheSame(name: String) throws {
        let bitmap = try Self.decode(name)
        #expect(bitmap.width == 40)
        #expect(bitmap.height == 30)
        var wrong = 0
        for y in 0..<30 {
            for x in 0..<40 {
                let at = (y * 40 + x) * 4
                let (r, g, b) = Self.expectedSmall(x: x, y: y)
                if bitmap.rgba[at] != r || bitmap.rgba[at + 1] != g
                    || bitmap.rgba[at + 2] != b
                {
                    wrong += 1
                }
            }
        }
        #expect(wrong == 0, "\(name): \(wrong) of 1200 pixels differ")
    }

    /// One sample per pixel is a scan, and it has to come back as three equal
    /// channels rather than as red.
    @Test func aGreyscaleSheetComesBackGreyRatherThanRed() throws {
        let bitmap = try Self.decode("small-grey-tiled-deflate")
        #expect(bitmap.width == 40)
        #expect(bitmap.height == 30)
        var wrong = 0
        for y in 0..<30 {
            for x in 0..<40 {
                let at = (y * 40 + x) * 4
                let grey = UInt8((x * 6 + y * 8) & 255)
                if bitmap.rgba[at] != grey || bitmap.rgba[at + 1] != grey
                    || bitmap.rgba[at + 2] != grey || bitmap.rgba[at + 3] != 255
                {
                    wrong += 1
                }
            }
        }
        #expect(wrong == 0, "\(wrong) of 1200 grey pixels differ")
    }

    /// A provincial orthophoto is hundreds of megapixels and cannot be
    /// materialised to be shrunk, so the sampling happens while reading. What
    /// comes back has to be the source's pixels at that spacing, not an
    /// average and not an offset copy.
    @Test func askingForASmallerPictureSamplesTheSourceRatherThanResizingIt() throws {
        let bitmap = try Self.decode("tiled-deflate-pred", maxDimension: 40)
        let step = 4  // 130 over 40, rounded up
        #expect(bitmap.width == (130 + step - 1) / step)
        #expect(bitmap.height == (100 + step - 1) / step)
        for y in 0..<bitmap.height {
            for x in 0..<bitmap.width {
                let at = (y * bitmap.width + x) * 4
                let (r, g, b) = Self.expected(x: x * step, y: y * step)
                #expect(bitmap.rgba[at] == r)
                #expect(bitmap.rgba[at + 1] == g)
                #expect(bitmap.rgba[at + 2] == b)
            }
        }
    }

    @Test func aLayoutIsReadFromTheTagsRatherThanGuessed() throws {
        let tiled = try #require(try GeoTiffTags.layout(Self.fixture("tiled-deflate-pred")))
        #expect(tiled.isTiled)
        #expect(tiled.tileWidth == 64)
        #expect(tiled.tileHeight == 64)
        #expect(tiled.compression == .deflateAdobe || tiled.compression == .deflate)
        #expect(tiled.predictor == 2)
        #expect(tiled.samplesPerPixel == 3)
        #expect(tiled.offsets.count == 6)  // three tiles across, two down
        #expect(tiled.offsets.count == tiled.byteCounts.count)

        let striped = try #require(try GeoTiffTags.layout(Self.fixture("striped-deflate-pred")))
        #expect(!striped.isTiled)
        #expect(striped.rowsPerStrip == 21)
        #expect(striped.offsets.count == 5)
    }

    /// The decoder reads blocks by absolute offset, so an archive handed in as
    /// a slice of something larger must not be read from the wrong place.
    ///
    /// The failure this guards is the one nothing downstream could catch: a
    /// plausible-looking picture of the wrong part of the raster, draped over
    /// the map as though it were the sheet the reader placed.
    @Test func aFileHandedInAsASliceDecodesToTheSamePixels() throws {
        let name = "tiled-deflate-pred"
        let whole = try Self.fixture(name)
        let layout = try #require(try GeoTiffTags.layout(whole))
        let direct = try TiffRaster.decode(whole, layout: layout, maxDimension: 4_096)

        var padded = Data(repeating: 0xAB, count: 137)
        padded.append(whole)
        let slice = padded[137...]
        #expect(slice.startIndex == 137)

        let fromSlice = try TiffRaster.decode(slice, layout: layout, maxDimension: 4_096)
        #expect(fromSlice.width == direct.width)
        #expect(fromSlice.height == direct.height)
        #expect(fromSlice.rgba == direct.rgba)
    }

    /// A layout claiming no samples per pixel.
    ///
    /// `write` reads its samples by index now rather than through a bounded
    /// slice, so this is the guard that keeps the read inside the pixel — and
    /// `check` does not cover it: it guards bitsPerSample,
    /// planarConfiguration, photometric, compression and predictor, and
    /// `bitsPerSample.allSatisfy` is vacuously true for the empty array a
    /// zero-sample layout carries.
    @Test func aLayoutClaimingNoSamplesPerPixelIsRefused() throws {
        let whole = try Self.fixture("tiled-deflate-pred")
        var layout = try #require(try GeoTiffTags.layout(whole))
        layout.samplesPerPixel = 0
        layout.bitsPerSample = []

        #expect(throws: UserMapImportRefusal.self) {
            try TiffRaster.decode(whole, layout: layout, maxDimension: 4_096)
        }
    }
}
