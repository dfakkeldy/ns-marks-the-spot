import Foundation
import Testing

@testable import GeoCore

@Suite("Writing zip archives")
struct ZipWriterTests {
    @Test func aWrittenArchiveReadsBackThroughTheReader() throws {
        let kml = Data(String(repeating: "<Placemark>hello</Placemark>", count: 200).utf8)
        let jpeg = Data([0xff, 0xd8, 0xff, 0xe0] + Array(repeating: 0x42, count: 100))
        let archive = try #require(
            ZipArchive.archive([
                ZipArchive.WriteEntry(name: "doc.kml", data: kml, compress: true),
                ZipArchive.WriteEntry(name: "files/a.jpg", data: jpeg, compress: false),
            ])
        )

        let entries = try ZipArchive.entries(in: archive)
        #expect(entries.map(\.name) == ["doc.kml", "files/a.jpg"])
        // The KML deflated (a repetitive document shrinks), the JPEG stored.
        let doc = try #require(entries.first { $0.name == "doc.kml" })
        #expect(doc.method == 8)
        #expect(doc.compressedSize < kml.count)
        let photo = try #require(entries.first { $0.name == "files/a.jpg" })
        #expect(photo.method == 0)

        #expect(try ZipArchive.contents(of: doc, in: archive) == kml)
        #expect(try ZipArchive.contents(of: photo, in: archive) == jpeg)
    }

    /// Incompressible bytes fall back to STORED rather than growing.
    @Test func deflateThatDoesNotShrinkFallsBackToStored() throws {
        var random = SystemRandomNumberGenerator()
        let noise = Data((0..<256).map { _ in UInt8.random(in: 0...255, using: &random) })
        let archive = try #require(
            ZipArchive.archive([
                ZipArchive.WriteEntry(name: "noise.bin", data: noise, compress: true)
            ])
        )
        let entry = try #require(try ZipArchive.entries(in: archive).first)
        #expect(entry.method == 0)
        #expect(try ZipArchive.contents(of: entry, in: archive) == noise)
    }

    /// The classic check vector, so the table and the reflection are both
    /// right — a wrong CRC produces archives other tools refuse.
    @Test func crc32MatchesTheReferenceVector() {
        #expect(ZipArchive.crc32(Data("123456789".utf8)) == 0xcbf4_3926)
        #expect(ZipArchive.crc32(Data()) == 0)
    }

    @Test func anEmptyEntryListStillFormsAnArchive() throws {
        let archive = try #require(ZipArchive.archive([]))
        // The reader reports an intact-but-empty archive as its own state.
        #expect(throws: UserMapImportRefusal.self) {
            try ZipArchive.entries(in: archive)
        }
    }
}
