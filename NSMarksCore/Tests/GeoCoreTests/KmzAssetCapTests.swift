import Foundation
import Testing

@testable import GeoCore

/// What a KMZ's non-KML entries may inflate to. A declared size is a claim
/// the archive makes; it is checked before a byte is allocated, and only
/// entries the document refers to are inflated at all.
@Suite("KMZ asset caps")
struct KmzAssetCapTests {
    @Test func aSingleAssetOverThePhotoCapIsSkipped() {
        #expect(!KmzParse.acceptsAsset(declaredSize: PhotoDescriptor.maxFileBytes + 1))
        #expect(KmzParse.acceptsAsset(declaredSize: PhotoDescriptor.maxFileBytes))
    }

    @Test func theSizeCapsAreBounded() {
        // A nonsense negative declaration is not a size.
        #expect(!KmzParse.acceptsAsset(declaredSize: -1))
        // The document itself is capped too.
        #expect(KmzParse.acceptsDocument(declaredSize: KmzParse.maxKmlBytes))
        #expect(!KmzParse.acceptsDocument(declaredSize: KmzParse.maxKmlBytes + 1))
    }

    /// An archive listing more files than any map needs is refused before
    /// one record is read.
    @Test func anArchiveListingTooManyEntriesIsRefused() throws {
        let entries = (0..<(ZipArchive.maxEntries + 1)).map {
            ZipArchive.WriteEntry(name: "files/\($0).txt", data: Data([0x41]), compress: false)
        }
        let archive = try #require(ZipArchive.archive(entries))
        #expect(throws: UserMapImportRefusal.self) { try ZipArchive.entries(in: archive) }
    }

    /// A stored entry whose two sizes disagree is a malformed archive, not a
    /// small payload: the declared size is what the caps are checked on.
    @Test func aStoredEntryWithMismatchedSizesIsRefused() throws {
        let payload = Data(repeating: 0x42, count: 4_096)
        var archive = try #require(ZipArchive.archive([
            ZipArchive.WriteEntry(name: "doc.kml", data: Data("<kml/>".utf8), compress: false),
            ZipArchive.WriteEntry(name: "files/big.jpg", data: payload, compress: false),
        ]))
        // Find the central-directory record for the photo and declare one
        // byte uncompressed over the 4 096-byte stored payload.
        let name = Array("files/big.jpg".utf8)
        let bytes = [UInt8](archive)
        var patched = false
        var i = 0
        while i + 46 + name.count <= bytes.count {
            if bytes[i] == 0x50, bytes[i + 1] == 0x4b, bytes[i + 2] == 0x01, bytes[i + 3] == 0x02,
               Array(bytes[(i + 46)..<(i + 46 + name.count)]) == name
            {
                archive.replaceSubrange((i + 24)..<(i + 28), with: [1, 0, 0, 0])
                patched = true
                break
            }
            i += 1
        }
        #expect(patched)
        let entries = try ZipArchive.entries(in: archive)
        let photo = try #require(entries.first { $0.name == "files/big.jpg" })
        #expect(photo.uncompressedSize == 1)
        #expect(throws: UserMapImportRefusal.self) { try ZipArchive.contents(of: photo, in: archive) }
        // And read through the source, it is unreadable, not missing.
        let source = try KmzParse.AssetSource(data: archive)
        if case .unreadable = source.read(named: "files/big.jpg") {} else {
            Issue.record("expected the mismatched entry to read as unreadable")
        }
    }

    private let jpegBytes = Data([0xff, 0xd8, 0xff, 0xe0] + Array(repeating: 0x11, count: 64))

    private func exported() throws -> Data {
        let descriptor = PhotoDescriptor(id: "p1", capturedAt: nil, sourceName: "IMG_1.jpg", width: 10, height: 5)
        let layer = VectorEdit.recomputed([
            GeoJsonFeature(
                id: "f1",
                geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)),
                properties: [
                    "name": .string("Culvert"),
                    CaptureSpec.photosKey: PhotoDescriptor.propertyValue(internalForm: [descriptor]),
                ]
            )
        ])
        return try #require(VectorExport.kmz(layerName: "Field visit", parsed: layer, photos: ["p1": jpegBytes])).data
    }

    private func rearchived(_ data: Data, adding extras: [ZipArchive.WriteEntry]) throws -> Data {
        let entries = try ZipArchive.entries(in: data)
        var written: [ZipArchive.WriteEntry] = []
        for entry in entries {
            written.append(
                ZipArchive.WriteEntry(name: entry.name, data: try ZipArchive.contents(of: entry, in: data), compress: false)
            )
        }
        return try #require(ZipArchive.archive(written + extras))
    }

    /// An entry nothing in the document refers to is never inflated.
    @Test func onlyReferencedEntriesAreInflated() throws {
        let archive = try rearchived(
            exported(),
            adding: [ZipArchive.WriteEntry(name: "files/extra.jpg", data: Data(repeating: 0xab, count: 2_048), compress: true)]
        )

        let opened = try KmzParse.parseWithAssets(archive)

        #expect(Set(opened.assets.keys) == ["files/p1.jpg"])
        #expect(opened.skippedEntries == 1)
    }

    /// A name the archive lists more than once is two candidates, not one
    /// asset: nothing is read under it, whatever the directory claims about
    /// their checksums, because a descriptor naming it may have meant either.
    @Test func aNameListedTwiceIsRefusedRatherThanGuessed() throws {
        let duplicates = (0..<1_000).map { _ in
            ZipArchive.WriteEntry(name: "files/p1.jpg", data: jpegBytes, compress: false)
        }
        let archive = try rearchived(exported(), adding: duplicates)

        let opened = try KmzParse.parseWithAssets(archive)
        let source = try KmzParse.AssetSource(data: archive)

        // One distinct name, and it attaches nothing.
        #expect(source.entryCount == 1)
        #expect(opened.assets.isEmpty)
        if case .ambiguous = source.read(named: "files/p1.jpg") {} else {
            Issue.record("a name listed twice matches more than one file")
        }
        if case .missing = source.read(named: "files/nothing.jpg") {} else {
            Issue.record("an absent name reads as missing")
        }
    }

    /// A referenced entry declared over the photo cap is reported as that,
    /// not as missing from the archive.
    @Test func anOversizedEntryIsCappedNotMissing() throws {
        let archive = try exported()
        let bytes = [UInt8](archive)
        var patched = archive
        let name = Array("files/p1.jpg".utf8)
        var i = 0
        while i + 46 + name.count <= bytes.count {
            if bytes[i] == 0x50, bytes[i + 1] == 0x4b, bytes[i + 2] == 0x01, bytes[i + 3] == 0x02,
               Array(bytes[(i + 46)..<(i + 46 + name.count)]) == name
            {
                // 64 MiB declared, over the 50 MB cap.
                patched.replaceSubrange((i + 24)..<(i + 28), with: [0, 0, 0, 4])
                break
            }
            i += 1
        }
        let source = try KmzParse.AssetSource(data: patched)
        if case .capped = source.read(named: "files/p1.jpg") {} else {
            Issue.record("expected the oversized declaration to read as capped")
        }
        let result = KmzRelink.relink(
            parsed: try KmzParse.parse(patched), assets: { source.read(named: $0) }
        ) { data in KmzRelink.ProcessedPhoto(fullJpeg: data, thumbJpeg: data, width: 1, height: 1) }
        #expect(result.oversizedInArchive == 1)
        #expect(result.missingFromArchive == 0)
        #expect(result.noteText?.contains("size cap") == true)
    }

    /// Two entries that differ only in case: each exact spelling reads, and
    /// a name that matches both and neither exactly is not guessed at.
    @Test func aNameMatchingTwoSpellingsIsAmbiguous() throws {
        let archive = try rearchived(
            exported(),
            adding: [ZipArchive.WriteEntry(name: "files/P1.jpg", data: jpegBytes, compress: false)]
        )
        let source = try KmzParse.AssetSource(data: archive)
        if case .bytes = source.read(named: "files/p1.jpg") {} else {
            Issue.record("the exact spelling reads")
        }
        if case .bytes = source.read(named: "files/P1.jpg") {} else {
            Issue.record("the other exact spelling reads")
        }
        if case .ambiguous = source.read(named: "FILES/P1.JPG") {} else {
            Issue.record("a name matching both spellings is ambiguous")
        }
        if case .missing = source.read(named: "files/p2.jpg") {} else {
            Issue.record("an absent name is still missing")
        }
    }

    /// Two different files under one exact name give no way to tell which
    /// the document meant: neither is attached. The same file listed twice
    /// is still one asset.
    @Test func twoDifferentFilesUnderOneNameAreAmbiguous() throws {
        let other = Data(jpegBytes.reversed())
        let archive = try rearchived(
            exported(),
            adding: [ZipArchive.WriteEntry(name: "files/p1.jpg", data: other, compress: false)]
        )
        let source = try KmzParse.AssetSource(data: archive)
        if case .ambiguous = source.read(named: "files/p1.jpg") {} else {
            Issue.record("two files under one name are ambiguous")
        }
        if case .ambiguous = source.read(named: "FILES/P1.JPG") {} else {
            Issue.record("and so is a case-insensitive match onto them")
        }
    }

    /// A declaration of zero is held to its stream like any other.
    @Test func aNonEmptyStreamDeclaredEmptyIsRefused() throws {
        let payload = Data((0..<4_096).map { UInt8($0 % 13) })
        var archive = try #require(ZipArchive.archive([
            ZipArchive.WriteEntry(name: "doc.kml", data: Data("<kml/>".utf8), compress: false),
            ZipArchive.WriteEntry(name: "files/big.jpg", data: payload, compress: true),
        ]))
        let name = Array("files/big.jpg".utf8)
        let bytes = [UInt8](archive)
        var patched = false
        var i = 0
        while i + 46 + name.count <= bytes.count {
            if bytes[i] == 0x50, bytes[i + 1] == 0x4b, bytes[i + 2] == 0x01, bytes[i + 3] == 0x02,
               Array(bytes[(i + 46)..<(i + 46 + name.count)]) == name
            {
                archive.replaceSubrange((i + 24)..<(i + 28), with: [0, 0, 0, 0])
                patched = true
                break
            }
            i += 1
        }
        #expect(patched)
        let entries = try ZipArchive.entries(in: archive)
        let photo = try #require(entries.first { $0.name == "files/big.jpg" })
        #expect(photo.uncompressedSize == 0)
        #expect(throws: UserMapImportRefusal.self) { try ZipArchive.contents(of: photo, in: archive) }
    }

    /// A deflated entry whose stream runs past its declared size is refused,
    /// not cut to the declaration.
    @Test func aDeflatedEntryLongerThanDeclaredIsRefused() throws {
        let payload = Data((0..<8_192).map { UInt8($0 % 251) })
        var archive = try #require(ZipArchive.archive([
            ZipArchive.WriteEntry(name: "doc.kml", data: Data("<kml/>".utf8), compress: false),
            ZipArchive.WriteEntry(name: "files/big.jpg", data: payload, compress: true),
        ]))
        let name = Array("files/big.jpg".utf8)
        let bytes = [UInt8](archive)
        let declared = withUnsafeBytes(of: UInt32(payload.count - 1).littleEndian, Array.init)
        var patched = false
        var i = 0
        while i + 46 + name.count <= bytes.count {
            if bytes[i] == 0x50, bytes[i + 1] == 0x4b, bytes[i + 2] == 0x01, bytes[i + 3] == 0x02,
               Array(bytes[(i + 46)..<(i + 46 + name.count)]) == name
            {
                archive.replaceSubrange((i + 24)..<(i + 28), with: declared)
                patched = true
                break
            }
            i += 1
        }
        #expect(patched)
        let entries = try ZipArchive.entries(in: archive)
        let photo = try #require(entries.first { $0.name == "files/big.jpg" })
        #expect(photo.uncompressedSize == payload.count - 1)
        #expect(throws: UserMapImportRefusal.self) { try ZipArchive.contents(of: photo, in: archive) }
    }
}
