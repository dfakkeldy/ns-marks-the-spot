import Foundation
import Testing

@testable import GeoCore

/// Builds real TIFF bytes to read back, rather than asserting against a
/// hand-made dictionary. The whole risk in this file is the byte layout — an
/// offset read four bytes early, a short read as a long, a little-endian file
/// read big-endian — and none of that is reachable through a fixture that
/// skips the bytes.
struct TiffBuilder {
    var bigEndian = false
    /// tag → (type, values). Doubles are written as type 12, shorts as 3,
    /// longs as 4, and a string as 2.
    var doubles = [UInt16: [Double]]()
    var shorts = [UInt16: [UInt16]]()
    var longs = [UInt16: [UInt32]]()
    var strings = [UInt16: String]()
    var version: UInt16 = 42
    var byteOrderMark: [UInt8]?

    func build() -> Data {
        var header = Data()
        let mark = byteOrderMark ?? (bigEndian ? [0x4D, 0x4D] : [0x49, 0x49])
        header.append(contentsOf: mark)
        header.append(integer(UInt64(version), bytes: 2))
        header.append(integer(8, bytes: 4))  // first directory sits right after

        // Entries in tag order, as the specification requires.
        var entries = [(tag: UInt16, type: UInt16, count: UInt32, payload: Data)]()
        for (tag, values) in shorts {
            entries.append((tag, 3, UInt32(values.count),
                            values.reduce(into: Data()) { $0.append(integer(UInt64($1), bytes: 2)) }))
        }
        for (tag, values) in longs {
            entries.append((tag, 4, UInt32(values.count),
                            values.reduce(into: Data()) { $0.append(integer(UInt64($1), bytes: 4)) }))
        }
        for (tag, values) in doubles {
            entries.append((tag, 12, UInt32(values.count),
                            values.reduce(into: Data()) { $0.append(integer($1.bitPattern, bytes: 8)) }))
        }
        for (tag, value) in strings {
            var bytes = Data(value.utf8)
            bytes.append(0)
            entries.append((tag, 2, UInt32(bytes.count), bytes))
        }
        entries.sort { $0.tag < $1.tag }

        var directory = integer(UInt64(entries.count), bytes: 2)
        // Everything the entries cannot hold inline goes after the directory
        // and its four-byte "next directory" pointer.
        var heapAt = 8 + 2 + entries.count * 12 + 4
        var heap = Data()
        for entry in entries {
            directory.append(integer(UInt64(entry.tag), bytes: 2))
            directory.append(integer(UInt64(entry.type), bytes: 2))
            directory.append(integer(UInt64(entry.count), bytes: 4))
            if entry.payload.count <= 4 {
                var inline = entry.payload
                inline.append(Data(repeating: 0, count: 4 - inline.count))
                directory.append(inline)
            } else {
                directory.append(integer(UInt64(heapAt), bytes: 4))
                heap.append(entry.payload)
                heapAt += entry.payload.count
            }
        }
        directory.append(integer(0, bytes: 4))  // no second directory
        return header + directory + heap
    }

    private func integer(_ value: UInt64, bytes: Int) -> Data {
        var out = Data()
        for index in 0..<bytes {
            let shift = bigEndian ? (bytes - 1 - index) * 8 : index * 8
            out.append(UInt8((value >> UInt64(shift)) & 0xFF))
        }
        return out
    }
}

extension TiffBuilder {
    /// A north-up sheet in UTM zone 20, 10 m pixels, placed by scale and one
    /// tiepoint — which is how nearly every provincial raster is written.
    static func northUpSheet(bigEndian: Bool = false) -> TiffBuilder {
        var builder = TiffBuilder(bigEndian: bigEndian)
        builder.shorts[256] = [4000]  // ImageWidth
        builder.shorts[257] = [3000]  // ImageLength
        builder.doubles[33_550] = [10, 10, 0]                        // scale
        builder.doubles[33_922] = [0, 0, 0, 400_000, 5_040_000, 0]   // tiepoint
        builder.shorts[34_735] = [
            1, 1, 0, 2,                 // version, revision, minor, key count
            1_024, 0, 1, 1,             // GTModelType = projected
            3_072, 0, 1, 26_920,        // ProjectedCSTypeGeoKey
        ]
        return builder
    }
}

@Suite("GeoTIFF tags")
struct GeoTiffTagsTests {
    @Test(arguments: [false, true])
    func aNorthUpSheetIsReadInEitherByteOrder(bigEndian: Bool) throws {
        let metadata = try GeoTiffTags.parse(
            TiffBuilder.northUpSheet(bigEndian: bigEndian).build()
        )
        #expect(metadata.pixelSize == PixelSize(width: 4000, height: 3000))
        #expect(metadata.crs == "EPSG:26920")
        #expect(metadata.geotransform == [400_000, 10, 0, 5_040_000, 0, -10])

        // And the two halves together are a placement the projection accepts.
        let georeference = try #require(metadata.georeference)
        let corner = try RasterProjection.groundPosition(georeference, x: 0, y: 0)
        #expect(abs(corner.lat - 45.500) < 0.01)
        #expect(abs(corner.lng + 64.276) < 0.01)
    }

    /// PixelIsPoint ties the centre of a pixel rather than its corner, so the
    /// origin moves half a pixel. At 10 m that is 5 m — small enough to look
    /// like nothing and large enough to be a lot line.
    @Test func pixelIsPointShiftsTheOriginHalfAPixel() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.shorts[34_735] = [
            1, 1, 0, 2,
            1_025, 0, 1, 2,          // GTRasterTypeGeoKey = PixelIsPoint
            3_072, 0, 1, 26_920,
        ]
        let metadata = try GeoTiffTags.parse(builder.build())
        #expect(metadata.geotransform == [399_995, 10, 0, 5_040_005, 0, -10])

        // The default is the corner, and the two differ by exactly half a
        // pixel in each direction.
        let corner = try #require(GeoTiffTags.parse(
            TiffBuilder.northUpSheet().build()
        ).geotransform)
        #expect(corner[0] - 399_995 == 5)
        #expect(corner[3] - 5_040_005 == -5)
    }

    /// A full transformation matrix wins over scale and tiepoint, and carries
    /// the rotation terms neither of those can express.
    @Test func aTransformationMatrixIsReadInGdalOrder() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.doubles[34_264] = [
            8, 1, 0, 400_000,
            2, -9, 0, 5_040_000,
            0, 0, 0, 0,
            0, 0, 0, 1,
        ]
        let metadata = try GeoTiffTags.parse(builder.build())
        #expect(metadata.geotransform == [400_000, 8, 1, 5_040_000, 2, -9])
    }

    @Test func aTransformationMatrixShorterThanFourByFourIsNotSalvaged() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.doubles[34_264] = [8, 1, 0, 400_000, 2, -9]
        // And the scale and tiepoint are still there, so a fallback would hide
        // the broken tag rather than surface it.
        #expect(try GeoTiffTags.parse(builder.build()).geotransform == nil)
    }

    /// Several tiepoints and no matrix is a warp described by points. Placing
    /// the sheet from the first one as if the others were not there would be a
    /// confident answer to a question the file did not answer.
    @Test func severalTiepointsAndNoMatrixReadAsUnplaced() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.doubles[33_922] = [
            0, 0, 0, 400_000, 5_040_000, 0,
            4_000, 3_000, 0, 440_000, 5_010_000, 0,
        ]
        let metadata = try GeoTiffTags.parse(builder.build())
        #expect(metadata.geotransform == nil)
        #expect(metadata.georeference == nil)
        // The size still reads, because that is what the georeferencer needs
        // to show the scan and take control points on it.
        #expect(metadata.pixelSize == PixelSize(width: 4000, height: 3000))
    }

    /// A plain scan is not an error. It has no geo tags, and it goes to the
    /// georeferencer to be placed by hand.
    @Test func aScanWithNoGeoTagsIsReadAsAScan() throws {
        var builder = TiffBuilder(bigEndian: false)
        builder.shorts[256] = [1200]
        builder.shorts[257] = [900]
        let metadata = try GeoTiffTags.parse(builder.build())
        #expect(metadata.pixelSize == PixelSize(width: 1200, height: 900))
        #expect(metadata.geotransform == nil)
        #expect(metadata.crs == nil)
        #expect(metadata.georeference == nil)
    }

    /// A user-defined system is the file saying "described elsewhere", and
    /// nothing here can read prose as a projection. The citation is kept so a
    /// refusal can quote what the file actually said, and it is kept apart from
    /// `crs` so it cannot be mistaken for one.
    @Test func aUserDefinedSystemIsNotACrsButItsCitationIsKept() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.shorts[34_735] = [
            1, 1, 0, 2,
            3_072, 0, 1, 32_767,             // ProjectedCSTypeGeoKey = user-defined
            3_073, 34_737, 24, 0,            // PCSCitationGeoKey, into the ASCII tag
                                             // (24 = the string with its "|")
        ]
        builder.strings[34_737] = "NAD83 / Some Local Grid|"
        let metadata = try GeoTiffTags.parse(builder.build())
        #expect(metadata.crs == nil)
        #expect(metadata.citation == "NAD83 / Some Local Grid")
        #expect(metadata.georeference == nil)
    }

    /// A geographic file names its system in a different key, and it has to be
    /// read too — otherwise a degrees-based sheet reads as unplaced.
    @Test func aGeographicSystemIsReadFromItsOwnKey() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.shorts[34_735] = [1, 1, 0, 1, 2_048, 0, 1, 4_326]
        #expect(try GeoTiffTags.parse(builder.build()).crs == "EPSG:4326")
    }

    /// BigTIFF is a real format that large provincial rasters are often
    /// exported in, and its header is not this one. Refused by name, because a
    /// refusal naming the format is recoverable and a sheet placed from a
    /// header that was never parsed is not.
    @Test func aBigTiffIsRefusedByNameRatherThanMisread() {
        var builder = TiffBuilder.northUpSheet()
        builder.version = 43
        #expect(throws: GeoTiffTags.Refusal.bigTiff) {
            try GeoTiffTags.parse(builder.build())
        }
    }

    @Test func somethingThatIsNotATiffIsRefused() {
        var builder = TiffBuilder.northUpSheet()
        builder.byteOrderMark = [0x89, 0x50]  // a PNG's first two bytes
        #expect(throws: GeoTiffTags.Refusal.notATiff) {
            try GeoTiffTags.parse(builder.build())
        }
        #expect(throws: GeoTiffTags.Refusal.notATiff) {
            try GeoTiffTags.parse(Data([0x49, 0x49]))
        }
    }

    /// A file that stops in the middle of what its own header points at is
    /// refused rather than read as far as it goes. Half a tiepoint is not a
    /// place.
    @Test func aTruncatedFileIsRefused() {
        let whole = TiffBuilder.northUpSheet().build()
        #expect(throws: GeoTiffTags.Refusal.truncated) {
            try GeoTiffTags.parse(whole.prefix(whole.count - 8))
        }
    }

    /// A key table claiming more keys than the tag has room for must not read
    /// past its own end.
    @Test func aKeyCountLargerThanTheTableIsNotTrusted() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.shorts[34_735] = [1, 1, 0, 40, 3_072, 0, 1, 26_920]
        let metadata = try GeoTiffTags.parse(builder.build())
        #expect(metadata.crs == "EPSG:26920")
    }
}
