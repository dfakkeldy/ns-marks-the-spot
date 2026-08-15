import Compression
import Foundation

/// Reading the entries out of a zip archive.
///
/// The web gets this from the browser and from shpjs. There is no equivalent
/// here, and both formats this app accepts as zips — KMZ and a zipped
/// shapefile — need the same small thing: list the entries, decompress one.
/// So it is written out rather than pulling in an archive library for two call
/// sites.
///
/// Deliberately not a general zip implementation. It reads the central
/// directory, and it handles stored and deflated entries; encryption, spanned
/// archives and zip64 are refused rather than half-supported, because a zip
/// this cannot read must fail loudly instead of yielding a shapefile missing
/// its attributes.
public enum ZipArchive {
    public struct Entry: Hashable, Sendable {
        public var name: String
        /// Where the compressed bytes start, and how they are compressed.
        var method: UInt16
        var compressedSize: Int
        var uncompressedSize: Int
        var localHeaderOffset: Int
    }

    static func refusal(_ message: String) -> UserMapImportRefusal {
        UserMapImportRefusal(code: .corruptFile, userMessage: message)
    }

    private static let unreadable =
        "Couldn't read this archive — the zip inside it is malformed or unsupported."

    /// The archive's entries, in central-directory order.
    public static func entries(in data: Data) throws(UserMapImportRefusal) -> [Entry] {
        let bytes = [UInt8](data)
        guard let directoryStart = endOfCentralDirectory(in: bytes) else {
            throw refusal(unreadable)
        }
        var offset = directoryStart
        var entries: [Entry] = []
        while offset + 46 <= bytes.count, read32(bytes, offset) == 0x0201_4b50 {
            let flags = read16(bytes, offset + 8)
            // Bit 0 is the encryption flag. An encrypted entry decompresses to
            // noise, and noise parsed as a shapefile is worse than a refusal.
            guard flags & 1 == 0 else {
                throw UserMapImportRefusal(
                    code: .passwordProtected,
                    userMessage: """
                        This archive is password-protected. Export it again without \
                        a password and import that.
                        """
                )
            }
            let nameLength = Int(read16(bytes, offset + 28))
            let extraLength = Int(read16(bytes, offset + 30))
            let commentLength = Int(read16(bytes, offset + 32))
            let compressed = Int(read32(bytes, offset + 20))
            let uncompressed = Int(read32(bytes, offset + 24))
            let localOffset = Int(read32(bytes, offset + 42))
            guard offset + 46 + nameLength <= bytes.count else { throw refusal(unreadable) }
            // 0xffffffff in any of these is the zip64 marker: the real value
            // lives in an extra field this reader does not parse.
            guard compressed != 0xffff_ffff, uncompressed != 0xffff_ffff,
                  localOffset != 0xffff_ffff
            else {
                throw refusal(
                    """
                    This archive uses a zip format this app can't read (zip64). \
                    Export it again as a standard zip.
                    """
                )
            }
            let name =
                String(bytes: bytes[(offset + 46)..<(offset + 46 + nameLength)], encoding: .utf8)
                ?? String(
                    decoding: bytes[(offset + 46)..<(offset + 46 + nameLength)], as: UTF8.self
                )
            entries.append(
                Entry(
                    name: name,
                    method: read16(bytes, offset + 10),
                    compressedSize: compressed,
                    uncompressedSize: uncompressed,
                    localHeaderOffset: localOffset
                )
            )
            offset += 46 + nameLength + extraLength + commentLength
        }
        guard !entries.isEmpty else { throw refusal(unreadable) }
        return entries
    }

    /// One entry's bytes.
    public static func contents(
        of entry: Entry, in data: Data
    ) throws(UserMapImportRefusal) -> Data {
        let bytes = [UInt8](data)
        let header = entry.localHeaderOffset
        guard header + 30 <= bytes.count, read32(bytes, header) == 0x0403_4b50 else {
            throw refusal(unreadable)
        }
        // The local header repeats the name and extra-field lengths, and its
        // extra field is routinely a different length from the central one, so
        // the data offset has to come from here.
        let start = header + 30 + Int(read16(bytes, header + 26)) + Int(read16(bytes, header + 28))
        let end = start + entry.compressedSize
        guard start <= end, end <= bytes.count else { throw refusal(unreadable) }
        let payload = data.subdata(in: start..<end)

        switch entry.method {
        case 0:
            return payload
        case 8:
            guard let inflated = inflate(payload, expecting: entry.uncompressedSize) else {
                throw refusal(unreadable)
            }
            return inflated
        default:
            throw refusal(
                """
                This archive uses a compression method this app can't read. \
                Export it again as a standard zip.
                """
            )
        }
    }

    /// Raw DEFLATE, which is what a zip entry holds — no zlib wrapper.
    private static func inflate(_ data: Data, expecting size: Int) -> Data? {
        guard size > 0 else { return Data() }
        var output = Data(count: size)
        let written = output.withUnsafeMutableBytes { destination -> Int in
            guard let destinationBase = destination.bindMemory(to: UInt8.self).baseAddress
            else { return 0 }
            return data.withUnsafeBytes { source -> Int in
                guard let sourceBase = source.bindMemory(to: UInt8.self).baseAddress
                else { return 0 }
                return compression_decode_buffer(
                    destinationBase, size, sourceBase, data.count, nil, COMPRESSION_ZLIB
                )
            }
        }
        // A short read means the entry's declared size and its bytes disagree.
        // Returning the partial buffer would hand a truncated .dbf to the
        // attribute reader, which would read the missing rows as blanks.
        guard written == size else { return nil }
        return output
    }

    /// The start of the central directory, from the end-of-central-directory
    /// record.
    ///
    /// Searched backwards because the record is last and its size varies with
    /// a trailing comment. 64 KB back is the whole range a comment can occupy.
    private static func endOfCentralDirectory(in bytes: [UInt8]) -> Int? {
        guard bytes.count >= 22 else { return nil }
        let earliest = max(0, bytes.count - 22 - 65_535)
        var offset = bytes.count - 22
        while offset >= earliest {
            if read32(bytes, offset) == 0x0605_4b50 {
                let start = Int(read32(bytes, offset + 16))
                return start < bytes.count ? start : nil
            }
            offset -= 1
        }
        return nil
    }

    static func read16(_ bytes: [UInt8], _ offset: Int) -> UInt16 {
        guard offset + 2 <= bytes.count else { return 0 }
        return UInt16(bytes[offset]) | UInt16(bytes[offset + 1]) << 8
    }

    static func read32(_ bytes: [UInt8], _ offset: Int) -> UInt32 {
        guard offset + 4 <= bytes.count else { return 0 }
        return UInt32(bytes[offset]) | UInt32(bytes[offset + 1]) << 8
            | UInt32(bytes[offset + 2]) << 16 | UInt32(bytes[offset + 3]) << 24
    }
}

/// Which of the two zip formats this app reads an archive turned out to be.
///
/// A KMZ and a zipped shapefile have identical magic bytes, so only the entry
/// names can tell them apart — and the two need different messages when
/// neither applies.
public enum ZipKind: String, Hashable, Sendable {
    case kmz
    case shapefile
    case unknown
}

extension ZipArchive {
    /// `__MACOSX` resource forks are skipped: zipping a folder on macOS adds
    /// mirror entries like `__MACOSX/._parcels.shp` that would otherwise
    /// classify an archive by a file it does not actually contain.
    public static func classify(entryNames names: [String]) -> ZipKind {
        let content = names.filter { name in
            !name.contains("__MACOSX")
                && !(name.split(separator: "/").last?.hasPrefix("._") ?? false)
        }
        func has(_ suffix: String) -> Bool {
            content.contains { $0.lowercased().hasSuffix(suffix) }
        }
        if has(".kml") { return .kmz }
        if has(".shp") { return .shapefile }
        return .unknown
    }
}
