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
/// directory, it handles stored and deflated entries, and it follows the
/// zip64 fields where an archive uses them. Encryption and spanned archives
/// are refused rather than half-supported, because a zip this cannot read
/// must fail loudly instead of yielding a shapefile missing its attributes.
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
        guard let directory = endOfCentralDirectory(in: bytes) else {
            throw refusal(unreadable)
        }
        var offset = directory.start
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
            guard offset + 46 + nameLength + extraLength <= bytes.count else {
                throw refusal(unreadable)
            }
            // 0xffffffff in any of these is the zip64 marker, and the real
            // value is in the extra field that follows the name.
            let extraAt = offset + 46 + nameLength
            let declaredCompressed = read32(bytes, offset + 20)
            let declaredUncompressed = read32(bytes, offset + 24)
            let declaredOffset = read32(bytes, offset + 42)
            let (compressed, uncompressed, localOffset) = try zip64Substituted(
                bytes, extraAt: extraAt, length: extraLength,
                compressed: declaredCompressed,
                uncompressed: declaredUncompressed,
                localOffset: declaredOffset
            )
            // The disk this entry's bytes are on. Anything but the first means
            // the entry is in another file of a split set, which this does not
            // have — and reading the first disk's bytes at that offset would
            // hand back a different entry's contents rather than fail.
            let disk = diskNumber(
                bytes, extraAt: extraAt, length: extraLength,
                declared: read16(bytes, offset + 34),
                after: [declaredUncompressed, declaredCompressed, declaredOffset]
                    .filter { $0 == UInt32.max }.count
            )
            guard let disk else { throw refusal(unreadable) }
            guard disk == 0 else {
                throw refusal(
                    """
                    This archive is one part of a split set, and the rest of it \
                    is in other files. Export it again as a single zip.
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
                    compressedSize: Int(compressed),
                    uncompressedSize: Int(uncompressed),
                    localHeaderOffset: Int(localOffset)
                )
            )
            offset += 46 + nameLength + extraLength + commentLength
        }
        guard !entries.isEmpty else {
            // An archive that says it holds nothing is intact and useless,
            // which is a different thing to say than that it is broken. The
            // browser opens one and finds no map in it; so does this.
            guard directory.declared == 0 else { throw refusal(unreadable) }
            throw UserMapImportRefusal(
                code: .emptyFile,
                userMessage: "This archive is empty. There is no map inside it to import."
            )
        }
        return entries
    }

    /// Which disk of a split archive an entry's bytes are on.
    ///
    /// Its own field in the central entry, and, when that field is the marker,
    /// the fourth value in the zip64 block — four bytes, after however many of
    /// the three eight-byte values were themselves marked.
    ///
    /// Nil where the field says the number is in the zip64 block and the block
    /// does not carry it. Unpacking that archive means reading this file at an
    /// offset meant for a different one.
    private static func diskNumber(
        _ bytes: [UInt8], extraAt start: Int, length: Int, declared: UInt16, after wide: Int
    ) -> UInt32? {
        guard declared == UInt16.max else { return UInt32(declared) }
        var offset = start
        let end = start + length
        while offset + 4 <= end {
            let id = read16(bytes, offset)
            let size = Int(read16(bytes, offset + 2))
            guard offset + 4 + size <= end else { break }
            if id == 1 {
                guard size >= wide * 8 + 4 else { break }
                return read32(bytes, offset + 4 + wide * 8)
            }
            offset += 4 + size
        }
        return nil
    }

    /// The three sizes an entry declares, with any that is the zip64 marker
    /// replaced by the eight-byte value the extra field carries.
    ///
    /// The zip64 extended-information field holds the original size, the
    /// compressed size, and the local-header offset in that order, and holds
    /// each one only when its 32-bit counterpart is the marker. So which eight
    /// bytes belong to which value depends on how many markers came before it,
    /// and reading them in the order the entry lists them is the whole of it.
    private static func zip64Substituted(
        _ bytes: [UInt8], extraAt start: Int, length: Int,
        compressed: UInt32, uncompressed: UInt32, localOffset: UInt32
    ) throws(UserMapImportRefusal) -> (compressed: UInt64, uncompressed: UInt64,
        localOffset: UInt64)
    {
        let marker = UInt32.max
        let wanted = [uncompressed, compressed, localOffset].filter { $0 == marker }.count
        var values = [UInt64]()
        if wanted > 0 {
            guard let found = zip64Fields(bytes, at: start, length: length, count: wanted)
            else {
                throw refusal(
                    """
                    This archive says its entries are zip64 and then does not \
                    say how big they are. Export it again.
                    """
                )
            }
            values = found
        }
        var next = values.makeIterator()
        func value(_ declared: UInt32) -> UInt64 {
            declared == marker ? (next.next() ?? 0) : UInt64(declared)
        }
        // The order here is the order the field is written in, not the order
        // the arguments are named in.
        let realUncompressed = value(uncompressed)
        let realCompressed = value(compressed)
        let realOffset = value(localOffset)
        // A compressed run and a header offset both have to be inside the file
        // that holds them. An uncompressed size does not — that is what
        // compression is — so it is held to the largest map this app will ever
        // open, which is also what stops a declared size from asking for an
        // allocation no device has.
        guard realCompressed <= UInt64(bytes.count), realOffset <= UInt64(bytes.count)
        else { throw refusal(unreadable) }
        guard realUncompressed <= UInt64(UserMapImport.hardLimitBytes) else {
            throw UserMapImportRefusal(
                code: .tooLarge,
                userMessage: """
                    A file inside this archive is over 500 MB once unpacked, \
                    which is more than this app can open. Export a smaller \
                    area and import that.
                    """
            )
        }
        return (realCompressed, realUncompressed, realOffset)
    }

    /// The first `count` eight-byte values in the zip64 extended-information
    /// block of an extra field, or nil when the block is absent or shorter
    /// than the values the entry said were in it.
    private static func zip64Fields(
        _ bytes: [UInt8], at start: Int, length: Int, count: Int
    ) -> [UInt64]? {
        var offset = start
        let end = start + length
        while offset + 4 <= end {
            let id = read16(bytes, offset)
            let size = Int(read16(bytes, offset + 2))
            guard offset + 4 + size <= end else { return nil }
            if id == 1 {
                guard size >= count * 8 else { return nil }
                return (0..<count).map { read64(bytes, offset + 4 + $0 * 8) }
            }
            offset += 4 + size
        }
        return nil
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
    ///
    /// A zip64 archive writes that record with its fields masked out and puts
    /// the real ones in a second record, reachable through a locator that sits
    /// immediately before it. Following that is the only way to find the
    /// central directory of an archive written that way.
    private static func endOfCentralDirectory(
        in bytes: [UInt8]
    ) -> (start: Int, declared: Int)? {
        guard bytes.count >= 22 else { return nil }
        let earliest = max(0, bytes.count - 22 - 65_535)
        var offset = bytes.count - 22
        while offset >= earliest {
            if read32(bytes, offset) == 0x0605_4b50 {
                if let zip64 = zip64Directory(bytes, endingAt: offset) { return zip64 }
                let start = Int(read32(bytes, offset + 16))
                return start < bytes.count ? (start, Int(read16(bytes, offset + 10))) : nil
            }
            offset -= 1
        }
        return nil
    }

    /// The central directory's start as the zip64 end-of-central-directory
    /// record gives it, when both that record and its locator are there.
    private static func zip64Directory(
        _ bytes: [UInt8], endingAt eocd: Int
    ) -> (start: Int, declared: Int)? {
        guard eocd >= 20, read32(bytes, eocd - 20) == 0x0706_4b50 else { return nil }
        // Subtracting from the file's length rather than adding to the
        // offset: the offset is eight bytes out of the file, so adding to it
        // is what an archive would have to do to make the check overflow.
        let record = read64(bytes, eocd - 12)
        guard bytes.count >= 56, record <= UInt64(bytes.count - 56) else { return nil }
        let at = Int(record)
        guard read32(bytes, at) == 0x0606_4b50 else { return nil }
        let start = read64(bytes, at + 48)
        guard start < UInt64(bytes.count) else { return nil }
        let declared = read64(bytes, at + 32)
        return (Int(start), declared <= UInt64(bytes.count) ? Int(declared) : 0)
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

    static func read64(_ bytes: [UInt8], _ offset: Int) -> UInt64 {
        guard offset + 8 <= bytes.count else { return 0 }
        return (0..<8).reduce(into: UInt64(0)) { total, index in
            total |= UInt64(bytes[offset + index]) << (8 * index)
        }
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
