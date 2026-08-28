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
    /// BigTIFF's eight-byte integers (type 16), which is what GDAL writes a
    /// large sheet's tile offsets as.
    var long8s = [UInt16: [UInt64]]()
    var strings = [UInt16: String]()
    var version: UInt16 = 42
    var byteOrderMark: [UInt8]?
    /// Write the 64-bit layout: eight-byte counts and offsets in twenty-byte
    /// entries, behind a sixteen-byte header. Sets the version on its own,
    /// because a file cannot be one layout and claim the other.
    var big = false
    /// What the 64-bit header gives as the width of its own offsets. Only
    /// eight is defined; anything else is here to be refused.
    var offsetWidth: UInt16 = 8

    func build() -> Data {
        var header = Data()
        let mark = byteOrderMark ?? (bigEndian ? [0x4D, 0x4D] : [0x49, 0x49])
        header.append(contentsOf: mark)
        header.append(integer(UInt64(big ? 43 : version), bytes: 2))
        if big {
            header.append(integer(UInt64(offsetWidth), bytes: 2))
            header.append(integer(0, bytes: 2))
            header.append(integer(16, bytes: 8))  // first directory sits right after
        } else {
            header.append(integer(8, bytes: 4))  // first directory sits right after
        }

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
        for (tag, values) in long8s {
            entries.append((tag, 16, UInt32(values.count),
                            values.reduce(into: Data()) { $0.append(integer($1, bytes: 8)) }))
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

        let field = big ? 8 : 4
        var directory = integer(UInt64(entries.count), bytes: big ? 8 : 2)
        // Everything the entries cannot hold inline goes after the directory
        // and its "next directory" pointer.
        var heapAt = header.count + (big ? 8 : 2) + entries.count * (big ? 20 : 12) + field
        var heap = Data()
        for entry in entries {
            directory.append(integer(UInt64(entry.tag), bytes: 2))
            directory.append(integer(UInt64(entry.type), bytes: 2))
            directory.append(integer(UInt64(entry.count), bytes: field))
            if entry.payload.count <= field {
                var inline = entry.payload
                inline.append(Data(repeating: 0, count: field - inline.count))
                directory.append(inline)
            } else {
                directory.append(integer(UInt64(heapAt), bytes: field))
                heap.append(entry.payload)
                heapAt += entry.payload.count
            }
        }
        directory.append(integer(0, bytes: field))  // no second directory
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
    /// exported in, and ImageIO decodes its pixels without being asked. A
    /// reader that refused the tags would have left a perfectly readable sheet
    /// to be placed by hand.
    ///
    /// Asserted against the classic layout of the same sheet rather than
    /// against written-out numbers: the two layouts are the same tags in
    /// different-width fields, and the whole claim is that they read alike.
    @Test func theSameSheetReadsTheSameInEitherLayout() throws {
        let classic = try GeoTiffTags.parse(TiffBuilder.northUpSheet().build())
        var builder = TiffBuilder.northUpSheet()
        builder.big = true
        #expect(try GeoTiffTags.parse(builder.build()) == classic)
    }

    /// The 64-bit header is byte-ordered like any other, and a sheet written
    /// on a big-endian machine is not a different sheet.
    @Test func aBigEndianBigTiffReadsTheSameToo() throws {
        let classic = try GeoTiffTags.parse(TiffBuilder.northUpSheet().build())
        var builder = TiffBuilder.northUpSheet(bigEndian: true)
        builder.big = true
        #expect(try GeoTiffTags.parse(builder.build()) == classic)
    }

    /// Eight is the only offset width the format defines. A file naming
    /// another is a real TIFF this reader cannot walk, and saying which is
    /// what makes the refusal recoverable.
    @Test func aBigTiffWithAnUndefinedOffsetWidthIsRefusedByName() {
        var builder = TiffBuilder.northUpSheet()
        builder.big = true
        builder.offsetWidth = 16
        #expect(throws: GeoTiffTags.Refusal.bigTiff) {
            try GeoTiffTags.parse(builder.build())
        }
    }

    /// A count field eight bytes wide can name more entries than any file
    /// holds. Converted to an `Int` first, that traps rather than refuses.
    @Test func aBigTiffClaimingImpossiblyManyEntriesIsRefusedRatherThanTrapping() {
        var builder = TiffBuilder.northUpSheet()
        builder.big = true
        var bytes = builder.build()
        // The directory count sits directly after the sixteen-byte header.
        for index in 16..<24 { bytes[index] = 0xFF }
        #expect(throws: GeoTiffTags.Refusal.truncated) {
            try GeoTiffTags.parse(bytes)
        }
    }

    /// The same trap one field further in: an entry's own value count.
    @Test func aBigTiffEntryClaimingImpossiblyManyValuesIsRefusedRatherThanTrapping() {
        var builder = TiffBuilder.northUpSheet()
        builder.big = true
        var bytes = builder.build()
        // First entry: header, eight-byte count, then tag and type.
        for index in 28..<36 { bytes[index] = 0xFF }
        #expect(throws: GeoTiffTags.Refusal.truncated) {
            try GeoTiffTags.parse(bytes)
        }
    }

    /// The other BigTIFF tests build their bytes with the same understanding
    /// of the layout that the reader has, so the two could be wrong together.
    /// This one is a file a separate writer produced, kept as bytes: eight
    /// byte counts written as LONG8, values padded out to their own alignment,
    /// a tag order this builder does not emit.
    /// A BigTIFF a separate writer produced, kept as bytes. The other 64-bit
    /// tests build their files with the same understanding of the layout the
    /// reader has, so the two could be wrong together; this one cannot be.
    /// It writes its byte counts as LONG8, pads values out to their own
    /// alignment, and orders its tags in a way `TiffBuilder` never does.
    static let foreignBigTiff: [String] = [
        "SUkrAAgAAAAQAAAAAAAAAAwAAAAAAAAAAAEDAAEAAAAAAAAAAgAAAAAAAAAB",
        "AQMAAQAAAAAAAAACAAAAAAAAAAIBAwADAAAAAAAAAAgACAAIAAAAAwEDAAEA",
        "AAAAAAAAAQAAAAAAAAAGAQMAAQAAAAAAAAACAAAAAAAAABEBEAABAAAAAAAA",
        "ABABAAAAAAAAFQEDAAEAAAAAAAAAAwAAAAAAAAAWAQMAAQAAAAAAAAACAAAA",
        "AAAAABcBEAABAAAAAAAAAAwAAAAAAAAADoMMAAMAAAAAAAAAIAEAAAAAAACC",
        "hAwABgAAAAAAAAA4AQAAAAAAAK+HAwAQAAAAAAAAAGgBAAAAAAAAAAAAAAAA",
        "AAD/AAAA/wAAAP///wAAAAAAAAAAAAAAAEAAAAAAAAAIQAAAAAAAAAAAAAAA",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICEHkEAAAAA0BJTQQAAAAAAAAAA",
        "AQABAAAAAwAABAAAAQABAAEEAAABAAEAAAwAAAEAKGk=",
    ]

    @Test func aBigTiffFromAnotherWriterReadsAsItsOwnTagsSay() throws {
        let text = Self.foreignBigTiff.joined()
        let bytes = try #require(Data(base64Encoded: text))
        let metadata = try GeoTiffTags.parse(bytes)
        #expect(metadata.pixelSize == PixelSize(width: 2, height: 2))
        #expect(metadata.crs == "EPSG:26920")
        #expect(metadata.geotransform == [500_000, 2, 0, 5_000_000, 0, -3])
    }

    /// GDAL writes a BigTIFF's dimensions and offsets as LONG8. Read at four
    /// bytes they come back as half the number: the low half little-endian, and
    /// zero big-endian, which is a sheet that reports no width at all.
    @Test(arguments: [false, true])
    func eightByteIntegersAreReadAtEightBytes(bigEndian: Bool) throws {
        var builder = TiffBuilder.northUpSheet()
        builder.big = true
        builder.bigEndian = bigEndian
        builder.shorts[256] = nil
        builder.shorts[257] = nil
        builder.long8s[256] = [5_000]
        builder.long8s[257] = [4_000]
        let metadata = try GeoTiffTags.parse(builder.build())
        #expect(metadata.pixelSize == PixelSize(width: 5_000, height: 4_000))
    }

    /// Every value arrives as a Double whatever type the file declared, so a
    /// GeoKey table written as doubles instead of shorts can hold infinity —
    /// and `Int(infinity)` traps rather than returning anything. A malformed
    /// tag has to be ignored.
    @Test func aGeoKeyTableHoldingInfinityIsIgnoredRatherThanFatal() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.shorts[34_735] = nil
        builder.doubles[34_735] = [1, 1, 0, .infinity]
        #expect(try GeoTiffTags.parse(builder.build()).crs == nil)
    }

    @Test func aGeoKeyWhoseCodeIsInfiniteIsNotACoordinateSystem() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.shorts[34_735] = nil
        builder.doubles[34_735] = [1, 1, 0, 1, 3_072, 0, 1, .infinity]
        #expect(try GeoTiffTags.parse(builder.build()).crs == nil)
    }

    /// A rational with a zero denominator is infinity, and the code that reads
    /// a key's length and offset used to convert one straight to an Int.
    @Test func aKeyCountWrittenAsANotANumberIsIgnored() throws {
        var builder = TiffBuilder.northUpSheet()
        builder.shorts[34_735] = nil
        builder.doubles[34_735] = [1, 1, 0, 2, 3_072, 0, .nan, 26_920, 1_024, 0, 1, 1]
        _ = try GeoTiffTags.parse(builder.build())
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
