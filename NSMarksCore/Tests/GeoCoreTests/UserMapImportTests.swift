import Foundation
import Testing

@testable import GeoCore

@Suite("Sniffing a raster")
struct UserMapSniffTests {
    private static func file(_ bytes: [UInt8], padding: Int = 64) -> Data {
        Data(bytes + Array(repeating: 0, count: padding))
    }

    @Test(arguments: [
        ([0x49, 0x49, 0x2a, 0x00] as [UInt8], RasterFileType.geoTiff),
        ([0x4d, 0x4d, 0x00, 0x2a], .geoTiff),
        ([0x49, 0x49, 0x2b, 0x00], .geoTiff),
        ([0x4d, 0x4d, 0x00, 0x2b], .geoTiff),
        ([0x25, 0x50, 0x44, 0x46], .pdf),
        ([0x89, 0x50, 0x4e, 0x47], .png),
        ([0xff, 0xd8, 0xff], .jpeg),
    ])
    func aFileIsWhatItsFirstBytesSay(bytes: [UInt8], type: RasterFileType) {
        #expect(UserMapImport.sniff(Self.file(bytes)) == type)
    }

    /// The extension is the user's, and they rename things. A GeoTIFF called
    /// `.jpg` still imports; a text file called `.tif` still does not.
    @Test func theExtensionIsNotConsulted() throws {
        #expect(UserMapImport.sniff(Data("II*\u{0}not really".utf8)) == .geoTiff)
        #expect(UserMapImport.sniff(Data("PK\u{3}\u{4}".utf8)) == .unknown)
        #expect(UserMapImport.sniff(Data("<?xml version=\"1.0\"?>".utf8)) == .unknown)
    }

    /// A file shorter than the signature it starts to match. Reading past the
    /// end to finish the comparison is the classic way this goes wrong.
    @Test func aFileTooShortToMatchIsNotAMatch() {
        #expect(UserMapImport.sniff(Data()) == .unknown)
        #expect(UserMapImport.sniff(Data([0x49, 0x49, 0x2a])) == .unknown)
        // Three bytes is a whole JPEG signature, so this one does match.
        #expect(UserMapImport.sniff(Data([0xff, 0xd8, 0xff])) == .jpeg)
    }

    /// The routes differ in what happens next, so a file that sniffs as one
    /// thing and routes as another would be decoded by the wrong reader.
    @Test func contentDecidesThePipeline() throws {
        #expect(try UserMapImport.route(Self.file([0x4d, 0x4d, 0x00, 0x2b])) == .geoTiff)
        #expect(try UserMapImport.route(Self.file([0x25, 0x50, 0x44, 0x46])) == .pdf)
        #expect(try UserMapImport.route(Self.file([0x89, 0x50, 0x4e, 0x47])) == .image)
        #expect(try UserMapImport.route(Self.file([0xff, 0xd8, 0xff])) == .image)
    }

    @Test func somethingThatIsNotARasterIsRefusedWithSomethingToDoAboutIt() {
        do {
            _ = try UserMapImport.route(Data("hello".utf8))
            Issue.record("expected a refusal")
        } catch {
            #expect(error.code == .unsupportedType)
            #expect(error.userMessage.contains("GeoTIFF"))
        }
    }
}

@Suite("Import gates")
struct UserMapImportGateTests {
    @Test func aFileOverTheLimitIsRefusedBeforeAnythingReadsIt() {
        #expect(throws: Never.self) {
            try UserMapImport.checkFileSize(UserMapImport.hardLimitBytes)
        }
        do {
            try UserMapImport.checkFileSize(UserMapImport.hardLimitBytes + 1)
            Issue.record("expected a refusal")
        } catch {
            #expect(error.code == .tooLarge)
            #expect(error.userMessage.contains("500 MB"))
        }
    }

    /// The smallest image that still covers the preview target, so a huge
    /// raster decodes from an overview rather than from its base image.
    @Test func theSmallestSufficientOverviewIsChosen() throws {
        let sizes = [
            PixelSize(width: 32_000, height: 24_000),  // base
            PixelSize(width: 16_000, height: 12_000),
            PixelSize(width: 8_000, height: 6_000),
            PixelSize(width: 4_000, height: 3_000),  // below the target
            PixelSize(width: 2_000, height: 1_500),
        ]
        let chosen = try #require(UserMapImport.chooseImage(sizes: sizes, target: 4096))
        #expect(sizes[chosen].width == 8_000)
        // The order overviews are listed in is a file's own business, so the
        // choice cannot depend on it. Asserted on the image chosen rather than
        // on its index, which is what changes when the list is reordered.
        let shuffled = [sizes[3], sizes[0], sizes[4], sizes[2], sizes[1]]
        let fromShuffled = try #require(UserMapImport.chooseImage(sizes: shuffled, target: 4096))
        #expect(shuffled[fromShuffled].width == 8_000)
    }

    /// Nothing covers the target, so the base image is used. Scaling a smaller
    /// overview up would produce a sharp-looking sheet that is a guess.
    @Test func nothingLargeEnoughFallsBackToTheBaseImage() {
        let sizes = [
            PixelSize(width: 900, height: 700), PixelSize(width: 400, height: 300),
        ]
        #expect(UserMapImport.chooseImage(sizes: sizes, target: 4096) == 0)
        // No images at all is not "the base image": there is no index to
        // return, and returning one anyway hands a decoder a subscript out of
        // bounds on somebody's file.
        #expect(UserMapImport.chooseImage(sizes: [], target: 4096) == nil)
    }

    /// A decode that failed on a genuinely enormous image is not a corrupt
    /// file, and saying so sends the user to fix the wrong thing. The advice
    /// differs too: one says re-export, the other says this file is broken.
    @Test func aFailedDecodeIsClassifiedByTheSizeOfWhatWasDecoded() {
        let huge = UserMapImport.decodeFailure(
            ofImageSized: PixelSize(width: 30_000, height: 20_000)
        )
        #expect(huge.code == .tooLarge)
        #expect(huge.userMessage.contains("gdaladdo"))

        let ordinary = UserMapImport.decodeFailure(
            ofImageSized: PixelSize(width: 2_000, height: 1_500)
        )
        #expect(ordinary.code == .corruptFile)
    }
}

@Suite("Georeferencing at import")
struct UserMapGeoreferencingGateTests {
    private static let size = PixelSize(width: 4000, height: 3000)

    @Test func aSheetThatPlacesItselfProperlyPasses() {
        #expect(throws: Never.self) {
            try UserMapImport.checkGeoreferencing(
                RasterProjection.EmbeddedGeoreference(
                    crs: "EPSG:26920", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
                ),
                pixelSize: Self.size
            )
        }
    }

    /// A system nobody verified this app against is a fixable export mistake,
    /// and is reported as one — separately from georeferencing that is simply
    /// wrong, because the two ask the user to do different things. Either way
    /// the file is kept: the importer catches this refusal, drops only the
    /// placement, and the message has to say so, or a reader who has just been
    /// told "cannot read" will go looking for a map they still have.
    @Test func anUnknownCoordinateSystemNamesItselfAndSaysWhatToDo() {
        do {
            try UserMapImport.checkGeoreferencing(
                RasterProjection.EmbeddedGeoreference(
                    crs: "EPSG:32620", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
                ),
                pixelSize: Self.size
            )
            Issue.record("expected a refusal")
        } catch {
            #expect(error.code == .unsupportedCrs)
            #expect(error.userMessage.contains("EPSG:32620"))
            #expect(error.userMessage.contains("in your library"))
            #expect(error.userMessage.contains("by hand"))
            // The remedy is named, since re-exporting is the one thing that
            // gets this sheet placing itself.
            #expect(error.userMessage.contains("NAD83 UTM zone 20 or 21"))
        }
    }

    /// The corners are what catches this, not the origin. A tiepoint can sit
    /// inside its zone while the far corner of the sheet does not, and that
    /// file draws as triangles stretched across the globe — which reads as a
    /// rendering bug rather than as a bad file.
    @Test func aSheetWhoseFarCornerLeavesTheZoneIsCaughtAtImport() {
        let origin = RasterProjection.EmbeddedGeoreference(
            crs: "EPSG:26920", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
        )
        #expect(throws: Never.self) {
            _ = try RasterProjection.groundPosition(origin, x: 0, y: 0)
        }
        // Same origin, and pixels a kilometre wide: the sheet runs four
        // thousand kilometres east and off the end of the projection.
        let runaway = RasterProjection.EmbeddedGeoreference(
            crs: "EPSG:26920", geotransform: [400_000, 1_000, 0, 5_040_000, 0, -1_000]
        )
        #expect(throws: Never.self) {
            _ = try RasterProjection.groundPosition(runaway, x: 0, y: 0)
        }
        do {
            try UserMapImport.checkGeoreferencing(runaway, pixelSize: Self.size)
            Issue.record("expected a refusal")
        } catch {
            #expect(error.code == .invalidGeoreferencing)
            // And it says the sheet is kept and can still be placed by hand,
            // because it can: the pixels are fine, only the file's claim about
            // them is not.
            #expect(error.userMessage.contains("in your library"))
            #expect(error.userMessage.contains("by hand"))
        }
    }
}
