import Compression
import Foundation

/// Writing a zip archive, for KMZ export.
///
/// Deliberately the minimum the KMZ profile needs, the way `ZipArchive`'s
/// reader is: STORED and DEFLATE entries, one local header each, a central
/// directory, and the end record. No zip64 — the contract caps photos at
/// 50 MB in and re-encodes them far smaller, so no entry approaches the
/// 32-bit limits, and an archive that somehow would is refused rather than
/// written wrong.
extension ZipArchive {
    public struct WriteEntry: Sendable {
        public var name: String
        public var data: Data
        /// DEFLATE when true (doc.kml), STORED when false (JPEGs, which are
        /// already compressed — deflating them again spends CPU to grow the
        /// file).
        public var compress: Bool

        public init(name: String, data: Data, compress: Bool) {
            self.name = name
            self.data = data
            self.compress = compress
        }
    }

    /// The archive, or nil when an entry is too large for the format —
    /// unreachable through the photo pipeline's caps, checked anyway
    /// because a wrong zip is worse than no zip.
    public static func archive(_ entries: [WriteEntry]) -> Data? {
        var output = Data()
        var directory = Data()
        var count: UInt16 = 0

        for entry in entries {
            let nameBytes = Data(entry.name.utf8)
            let crc = crc32(entry.data)
            let deflated = entry.compress ? deflate(entry.data) : nil
            // DEFLATE that did not shrink the entry is stored instead; the
            // reader only sees the method field either way.
            let useDeflate = deflated.map { $0.count < entry.data.count } ?? false
            let payload = useDeflate ? deflated! : entry.data
            let method: UInt16 = useDeflate ? 8 : 0
            guard payload.count <= UInt32.max, entry.data.count <= UInt32.max,
                  output.count <= UInt32.max, nameBytes.count <= UInt16.max,
                  count < UInt16.max
            else { return nil }
            let headerOffset = UInt32(output.count)

            var local = Data()
            append32(&local, 0x0403_4b50)
            append16(&local, 20)  // version needed
            append16(&local, 0)  // flags
            append16(&local, method)
            append16(&local, 0)  // mod time
            append16(&local, 0)  // mod date
            append32(&local, crc)
            append32(&local, UInt32(payload.count))
            append32(&local, UInt32(entry.data.count))
            append16(&local, UInt16(nameBytes.count))
            append16(&local, 0)  // extra length
            local.append(nameBytes)
            output.append(local)
            output.append(payload)

            var central = Data()
            append32(&central, 0x0201_4b50)
            append16(&central, 20)  // version made by
            append16(&central, 20)  // version needed
            append16(&central, 0)  // flags
            append16(&central, method)
            append16(&central, 0)  // mod time
            append16(&central, 0)  // mod date
            append32(&central, crc)
            append32(&central, UInt32(payload.count))
            append32(&central, UInt32(entry.data.count))
            append16(&central, UInt16(nameBytes.count))
            append16(&central, 0)  // extra length
            append16(&central, 0)  // comment length
            append16(&central, 0)  // disk number
            append16(&central, 0)  // internal attributes
            append32(&central, 0)  // external attributes
            append32(&central, headerOffset)
            central.append(nameBytes)
            directory.append(central)
            count += 1
        }

        guard output.count <= UInt32.max, directory.count <= UInt32.max else { return nil }
        let directoryOffset = UInt32(output.count)
        output.append(directory)

        var end = Data()
        append32(&end, 0x0605_4b50)
        append16(&end, 0)  // disk number
        append16(&end, 0)  // directory disk
        append16(&end, count)
        append16(&end, count)
        append32(&end, UInt32(directory.count))
        append32(&end, directoryOffset)
        append16(&end, 0)  // comment length
        output.append(end)
        return output
    }

    /// Raw DEFLATE, no zlib wrapper — the mirror of the reader's `inflate`.
    /// Nil when compression fails or produces nothing (an empty input).
    private static func deflate(_ data: Data) -> Data? {
        guard !data.isEmpty else { return nil }
        // Worst-case DEFLATE output is slightly larger than the input; the
        // caller falls back to STORED when that happens.
        var output = Data(count: data.count + 1_024)
        let destCount = output.count
        let written = output.withUnsafeMutableBytes { destination -> Int in
            guard let destinationBase = destination.bindMemory(to: UInt8.self).baseAddress
            else { return 0 }
            return data.withUnsafeBytes { source -> Int in
                guard let sourceBase = source.bindMemory(to: UInt8.self).baseAddress
                else { return 0 }
                return compression_encode_buffer(
                    destinationBase, destCount, sourceBase, data.count, nil,
                    COMPRESSION_ZLIB
                )
            }
        }
        guard written > 0 else { return nil }
        return output.prefix(written)
    }

    /// CRC-32 (IEEE 802.3), the checksum every zip entry carries. Written
    /// out because Foundation exposes none and a dependency for one table
    /// is not worth it. Table-driven: a full-cap layer archives hundreds of
    /// megabytes of JPEG, and the bitwise form is eight times the work.
    private static let crcTable: [UInt32] = (0..<256).map { index in
        var crc = UInt32(index)
        for _ in 0..<8 {
            crc = (crc >> 1) ^ (0xedb8_8320 & (0 &- (crc & 1)))
        }
        return crc
    }

    static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xffff_ffff
        data.withUnsafeBytes { bytes in
            for byte in bytes {
                crc = (crc >> 8) ^ crcTable[Int((crc ^ UInt32(byte)) & 0xff)]
            }
        }
        return crc ^ 0xffff_ffff
    }

    private static func append16(_ data: inout Data, _ value: UInt16) {
        data.append(UInt8(value & 0xff))
        data.append(UInt8(value >> 8))
    }

    private static func append32(_ data: inout Data, _ value: UInt32) {
        data.append(UInt8(value & 0xff))
        data.append(UInt8((value >> 8) & 0xff))
        data.append(UInt8((value >> 16) & 0xff))
        data.append(UInt8((value >> 24) & 0xff))
    }
}
