import Foundation
import Testing

@testable import GeoCore

@Suite("Reading a zipped map")
struct ZipArchiveTests {
    /// A real KMZ, made by the `zip` tool at maximum compression so the entry
    /// is genuinely deflated rather than stored. A hand-built fixture would
    /// only prove this reader agrees with itself.
    private static let kmz = Data(
        base64Encoded: """
            UEsDBBQAAgAIAPJqD10uVs1pvgAAADkBAAAHABwAZG9jLmttbFVUCQADiJKAaoiSgGp1eAsAAQT1\
            AQAABAAAAACdj8FuwjAMhu99iihniBljCE1uuKCdERrauUqtEtHaVWJWHn9hmgZnjra/3/o/3F6H\
            3nxTylG4ti9uYQ1xkDZyV9vj58d8Y7e+wnOhCsm5tifV8R1gmiYnI3EXs2NSKAQs3dJ63Em4DMRa\
            Yvu+CTQ06eyRm4H8l0jbi5ogiSkh/C6xpRxSHLVU8AcaqVFqjdJVTXpuQnh8iXuJpQ0GkVS8CpX9\
            fP3q3marlVvPFgiPF4Q/HO7lK4R/KbyZ+uoHUEsBAh4DFAACAAgA8moPXS5WzWm+AAAAOQEAAAcA\
            GAAAAAAAAQAAAKSBAAAAAGRvYy5rbWxVVAUAA4iSgGp1eAsAAQT1AQAABAAAAABQSwUGAAAAAAEA\
            AQBNAAAA/wAAAAAA
            """,
        options: .ignoreUnknownCharacters
    )!

    /// The same archive rewritten into zip64 form: the entry's sizes and its
    /// header offset masked out in the central directory and given again as
    /// eight-byte values, behind a zip64 end-of-central-directory record and
    /// its locator.
    ///
    /// A writer reaches for this layout when a file passes 4 GB, and some
    /// reach for it whenever they stream an entry whose size they do not know
    /// yet. Either way the browser reads one, so these exact bytes were run
    /// through `fflate` and through `unzip(1)` first, and both give back the
    /// same `doc.kml` the plain archive holds.
    private static let zip64Kmz = Data(
        base64Encoded: """
            UEsDBBQAAgAIAPJqD10uVs1pvgAAADkBAAAHABwAZG9jLmttbFVUCQADiJKAaoiSgGp1eAsAAQT1\
            AQAABAAAAACdj8FuwjAMhu99iihniBljCE1uuKCdERrauUqtEtHaVWJWHn9hmgZnjra/3/o/3F6H\
            3nxTylG4ti9uYQ1xkDZyV9vj58d8Y7e+wnOhCsm5tifV8R1gmiYnI3EXs2NSKAQs3dJ63Em4DMRa\
            Yvu+CTQ06eyRm4H8l0jbi5ogiSkh/C6xpRxSHLVU8AcaqVFqjdJVTXpuQnh8iXuJpQ0GkVS8CpX9\
            fP3q3marlVvPFgiPF4Q/HO7lK4R/KbyZ+uoHUEsBAh4DFAACAAgA8moPXS5WzWn//////////wcA\
            NAAAAAAAAQAAAKSB/////2RvYy5rbWwBABgAOQEAAAAAAAC+AAAAAAAAAAAAAAAAAAAAVVQFAAOI\
            koBqdXgLAAEE9QEAAAQAAAAAUEsGBiwAAAAAAAAALQAtAAAAAAAAAAAAAQAAAAAAAAABAAAAAAAA\
            AGkAAAAAAAAA/wAAAAAAAABQSwYHAAAAAGgBAAAAAAAAAQAAAFBLBQYAAAAA////////////////\
            AAA=
            """,
        options: .ignoreUnknownCharacters
    )!

    @Test func aZip64ArchiveIsReadRatherThanRefused() throws {
        let entries = try ZipArchive.entries(in: Self.zip64Kmz)
        #expect(entries.map(\.name) == ["doc.kml"])
        let plain = try ZipArchive.entries(in: Self.kmz)
        #expect(entries[0].compressedSize == plain[0].compressedSize)
        #expect(entries[0].uncompressedSize == plain[0].uncompressedSize)
        #expect(entries[0].localHeaderOffset == plain[0].localHeaderOffset)
    }

    @Test func aZip64EntryComesBackAsTheSameBytesTheSmallLayoutHolds() throws {
        let wide = try ZipArchive.contents(
            of: try ZipArchive.entries(in: Self.zip64Kmz)[0], in: Self.zip64Kmz
        )
        let narrow = try ZipArchive.contents(
            of: try ZipArchive.entries(in: Self.kmz)[0], in: Self.kmz
        )
        #expect(wide == narrow)
    }

    /// The marker says the real size is in the extra field. An archive that
    /// writes the marker and leaves the field out is not one whose entries can
    /// be located, and reading the marker as a size would ask for 4 GB.
    @Test func aZip64MarkerWithNothingBehindItIsRefused() {
        var bytes = [UInt8](Self.kmz)
        let directory = 255  // the central directory of this archive
        for index in (directory + 20)..<(directory + 28) { bytes[index] = 0xFF }
        #expect(throws: UserMapImportRefusal.self) {
            try ZipArchive.entries(in: Data(bytes))
        }
    }

    /// The locator says where the zip64 record is. Checking that by adding to
    /// the offset is what an archive would overflow, and an overflowed UInt64
    /// traps rather than returning a wrong answer.
    @Test func aZip64LocatorPointingPastTheEndOfEverythingIsRefused() {
        var bytes = [UInt8](Self.zip64Kmz)
        let locator = bytes.count - 22 - 20  // the locator sits before the EOCD
        for index in (locator + 8)..<(locator + 16) { bytes[index] = 0xFF }
        #expect(throws: UserMapImportRefusal.self) {
            try ZipArchive.entries(in: Data(bytes))
        }
    }

    @Test func theEntriesOfARealArchiveAreListed() throws {
        let entries = try ZipArchive.entries(in: Self.kmz)
        #expect(entries.map(\.name) == ["doc.kml"])
        // Deflated, not stored: a reader that only handled stored entries
        // would pass a test built from a stored fixture and fail every real
        // export.
        #expect(entries[0].method == 8)
    }

    @Test func aDeflatedEntryComesBackWhole() throws {
        let entries = try ZipArchive.entries(in: Self.kmz)
        let contents = try ZipArchive.contents(of: entries[0], in: Self.kmz)
        #expect(contents.count == entries[0].uncompressedSize)
        let text = String(decoding: contents, as: UTF8.self)
        #expect(text.contains("Woodlot corner"))
        #expect(text.hasSuffix("</kml>\n"))
    }

    @Test func aKmzImportsAsIfItWereItsKml() throws {
        let parsed = try KmzParse.parse(Self.kmz)
        #expect(parsed.featureCount == 1)
        #expect(parsed.features[0].properties["name"] == .string("Woodlot corner"))
        let box = try #require(parsed.bbox)
        #expect(abs(box.west - -63.5) < 1e-9)
        #expect(abs(box.north - 44.6) < 1e-9)
    }

    /// Truncation is the failure mode that matters: a partially inflated
    /// entry handed on as if it were whole would give a shapefile's attribute
    /// reader missing rows to read as blanks.
    @Test func aTruncatedArchiveIsRefusedRatherThanPartlyRead() {
        let truncated = Self.kmz.prefix(Self.kmz.count / 2)
        #expect(throws: UserMapImportRefusal.self) {
            try ZipArchive.entries(in: Data(truncated))
        }
    }

    @Test func somethingThatIsNotAZipIsRefused() {
        #expect(throws: UserMapImportRefusal.self) {
            try ZipArchive.entries(in: Data("not a zip at all".utf8))
        }
    }

    /// macOS adds `__MACOSX/._parcels.shp` mirror entries when a folder is
    /// zipped. Classifying by those would call an archive a shapefile on the
    /// strength of a file it does not contain.
    @Test func macOsResourceForksDoNotDecideWhatAnArchiveIs() {
        #expect(
            ZipArchive.classify(entryNames: ["__MACOSX/._parcels.shp", "notes.txt"]) == .unknown
        )
        #expect(
            ZipArchive.classify(entryNames: ["parcels.shp", "parcels.dbf"]) == .shapefile
        )
        #expect(ZipArchive.classify(entryNames: ["doc.kml", "files/icon.png"]) == .kmz)
        #expect(ZipArchive.classify(entryNames: ["readme.txt"]) == .unknown)
    }

    /// A KML and a shapefile in one archive is ambiguous, and the web resolves
    /// it the same way: KML wins. Pinned so the two surfaces do not import
    /// different halves of the same file.
    @Test func aKmlInTheArchiveOutranksAShapefile() {
        #expect(
            ZipArchive.classify(entryNames: ["parcels.shp", "overview.kml"]) == .kmz
        )
    }
}
