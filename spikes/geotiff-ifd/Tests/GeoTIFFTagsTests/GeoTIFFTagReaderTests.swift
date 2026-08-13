import Foundation
import Testing
@testable import GeoTIFFTags

private func fixture(_ name: String) throws -> Data {
    let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // GeoTIFFTagsTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // geotiff-ifd
        .appendingPathComponent("Fixtures")
    return try Data(contentsOf: root.appendingPathComponent(name))
}

/// Values confirmed against `gdalinfo` for every fixture.
private func expectClose(_ actual: [Double]?, _ expected: [Double], tolerance: Double = 1e-7,
                         sourceLocation: SourceLocation = #_sourceLocation) {
    guard let actual else {
        Issue.record("expected a geotransform, got nil", sourceLocation: sourceLocation)
        return
    }
    #expect(actual.count == expected.count, sourceLocation: sourceLocation)
    for (a, e) in zip(actual, expected) {
        #expect(abs(a - e) <= tolerance, "\(a) vs \(e)", sourceLocation: sourceLocation)
    }
}

@Suite("GeoTIFF tag reader")
struct GeoTIFFTagReaderTests {

    @Test("Repo fixture: big-endian, ModelPixelScale + ModelTiepoint, projected CRS")
    func repoFixture() throws {
        let file = try GeoTIFFTagReader.read(try fixture("utm20-8x6.tif"))
        #expect(file.isBigEndian)
        #expect(file.directories.count == 1)

        let base = try #require(file.base)
        #expect(base.width == 8)
        #expect(base.height == 6)
        #expect(base.isReducedResolution == false)
        #expect(base.modelPixelScale == [10, 10, 0])
        #expect(base.modelTiepoint == [0, 0, 0, 500_000, 5_000_000, 0])
        #expect(base.modelTransformation == nil)
        #expect(base.geoKeys.isPixelIsPoint == false)
        #expect(base.crsIdentifier == "EPSG:26920")
        expectClose(base.geotransform, [500_000, 10, 0, 5_000_000, 0, -10])
    }

    @Test("PixelIsPoint shifts the origin back half a pixel, recovering the area geotransform")
    func pixelIsPoint() throws {
        let file = try GeoTIFFTagReader.read(try fixture("pixelispoint-8x6.tif"))
        let base = try #require(file.base)
        #expect(base.geoKeys.isPixelIsPoint)
        // GDAL wrote the tiepoint at the pixel CENTRE.
        #expect(base.modelTiepoint == [0, 0, 0, 500_005, 4_999_995, 0])
        // Corrected, it is the same ground footprint as the PixelIsArea fixture.
        expectClose(base.geotransform, [500_000, 10, 0, 5_000_000, 0, -10])
    }

    @Test("Geographic CRS resolves through GeographicTypeGeoKey")
    func geographicCRS() throws {
        let file = try GeoTIFFTagReader.read(try fixture("wgs84-64x48.tif"))
        let base = try #require(file.base)
        #expect(base.width == 64)
        #expect(base.height == 48)
        #expect(base.crsIdentifier == "EPSG:4326")
        // GDAL puts "WGS 84" in GeogCitationGeoKey (2049), which neither this
        // reader nor the web parser consumes — both read only GTCitation (1026)
        // and PCSCitation (3073). Harmless while the CRS code resolves; noted
        // because a user-defined *geographic* CRS would lose its only label.
        #expect(base.geoKeys.citation == nil)
        expectClose(base.geotransform, [-63.5, 0.0078125, 0, 45.5, 0, -0.008333333333])
    }

    @Test("ModelTransformation carries rotation that scale+tiepoint cannot express")
    func modelTransformation() throws {
        let file = try GeoTIFFTagReader.read(try fixture("rotated-64x48.tif"))
        let base = try #require(file.base)
        #expect(base.modelTransformation?.count == 16)
        #expect(base.modelPixelScale == nil)
        expectClose(
            base.geotransform,
            [-63.5, 0.00676776695, -0.00390625, 45.5, -0.00390625, -0.00676776695],
            tolerance: 1e-9)
    }

    @Test("Internal overviews appear as reduced-resolution directories in the IFD chain")
    func pyramidDirectories() throws {
        let file = try GeoTIFFTagReader.read(try fixture("pyramid-4000-deflate.tif"))
        #expect(file.sizes.map(\.width) == [4000, 2000, 1000, 500, 250])
        #expect(file.sizes.map(\.height) == [3000, 1500, 750, 375, 188])
        #expect(file.directories.map(\.isReducedResolution) == [false, true, true, true, true])
        // GDAL puts the geo tags on the base directory only; overviews inherit
        // the footprint, so georeferencing must always read directory 0.
        #expect(file.base?.crsIdentifier == "EPSG:26920")
        #expect(file.directories[1].modelPixelScale == nil)
        #expect(file.directories[1].crsIdentifier == nil)
    }

    @Test("chooseImageIndex matches the web parser's overview selection")
    func overviewSelection() throws {
        let file = try GeoTIFFTagReader.read(try fixture("pyramid-4000-deflate.tif"))
        let sizes = file.sizes
        // Nothing covers 4096, so the base is the only honest choice.
        #expect(chooseImageIndex(sizes: sizes, target: 4096) == 0)
        // Smallest covering overview, never an upscale.
        #expect(chooseImageIndex(sizes: sizes, target: 2000) == 1)
        #expect(chooseImageIndex(sizes: sizes, target: 1024) == 1)
        #expect(chooseImageIndex(sizes: sizes, target: 750) == 2)
        #expect(chooseImageIndex(sizes: sizes, target: 100) == 4)
    }

    @Test("BigTIFF is reported as itself, not misread as classic TIFF")
    func bigTIFF() throws {
        let data = try fixture("bigtiff-8x6.tif")
        #expect(throws: GeoTIFFReadError.bigTIFF) {
            try GeoTIFFTagReader.read(data)
        }
    }

    @Test("Tiled + LZW is a pixel-layout concern the tag reader ignores")
    func tiledCompressed() throws {
        let file = try GeoTIFFTagReader.read(try fixture("tiled-lzw-1024.tif"))
        let base = try #require(file.base)
        #expect(base.width == 1024)
        #expect(base.crsIdentifier == "EPSG:3857")
    }

    // MARK: - Hostile input

    @Test("Non-TIFF bytes are rejected at the byte-order mark")
    func notATIFF() {
        #expect(throws: GeoTIFFReadError.notATIFF) {
            try GeoTIFFTagReader.read(Data(repeating: 0x2A, count: 64))
        }
    }

    @Test("A file too short to hold a header is truncated, not a crash")
    func shortFile() {
        #expect(throws: GeoTIFFReadError.truncated) {
            try GeoTIFFTagReader.read(Data([0x4D, 0x4D, 0x00]))
        }
    }

    @Test("An IFD offset past the end of the file is truncated, not a crash")
    func offsetPastEnd() throws {
        var data = try fixture("utm20-8x6.tif")
        // Point the first-IFD offset (bytes 4..8, big-endian) far past the end.
        data[4] = 0x7F; data[5] = 0xFF; data[6] = 0xFF; data[7] = 0xFF
        #expect(throws: GeoTIFFReadError.truncated) {
            try GeoTIFFTagReader.read(data)
        }
    }

    @Test("An IFD chain that points at itself is rejected instead of looping forever")
    func selfReferentialChain() throws {
        var data = try fixture("utm20-8x6.tif")
        // The single IFD starts at 8; its next-IFD pointer sits after the
        // 2-byte count and 16 twelve-byte entries.
        let nextPointer = 8 + 2 + 16 * 12
        data[nextPointer] = 0x00; data[nextPointer + 1] = 0x00
        data[nextPointer + 2] = 0x00; data[nextPointer + 3] = 0x08
        #expect(throws: GeoTIFFReadError.self) {
            try GeoTIFFTagReader.read(data)
        }
    }

    @Test("Multiple tiepoints without a transformation matrix are not georeferencing we support")
    func irregularTiepoints() {
        let directory = GeoTIFFDirectory(
            index: 0, width: 10, height: 10, isReducedResolution: false,
            modelPixelScale: [10, 10, 0],
            modelTiepoint: Array(repeating: 0, count: 12),
            modelTransformation: nil,
            geoKeys: GeoKeys())
        #expect(directory.geotransform == nil)
    }

    @Test("A ModelTransformation shorter than a full 4x4 is broken, not partial")
    func shortTransformation() {
        let directory = GeoTIFFDirectory(
            index: 0, width: 10, height: 10, isReducedResolution: false,
            modelPixelScale: nil, modelTiepoint: nil,
            modelTransformation: Array(repeating: 1, count: 8),
            geoKeys: GeoKeys())
        #expect(directory.geotransform == nil)
    }

    @Test("A user-defined CRS code falls through to the citation string")
    func userDefinedCRS() {
        var keys = GeoKeys()
        keys.projectedCSType = 32767
        keys.pcsCitation = "some local grid"
        let directory = GeoTIFFDirectory(
            index: 0, width: 1, height: 1, isReducedResolution: false,
            modelPixelScale: nil, modelTiepoint: nil, modelTransformation: nil,
            geoKeys: keys)
        // Phase 8's allowlist rejects this; the reader's job is only to hand
        // over what the file actually claims.
        #expect(directory.crsIdentifier == "some local grid")
    }
}
