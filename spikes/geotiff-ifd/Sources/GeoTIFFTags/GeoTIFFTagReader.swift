import Foundation

/// Spike: hand-rolled TIFF/GeoTIFF tag reader.
///
/// Reads only the structure needed to georeference a user-imported raster —
/// the IFD chain (base image plus any reduced-resolution overviews) and the
/// six GeoTIFF tags. Pixels are ImageIO's job; this file never decodes one.
///
/// Everything here treats the file as hostile input: a user picks it from
/// Files, so every offset and count is bounds-checked against the actual byte
/// length and every failure is a thrown, nameable state rather than a trap.

// MARK: - Errors

public enum GeoTIFFReadError: Error, Equatable {
    /// Byte-order mark or magic number is not a classic TIFF.
    case notATIFF
    /// Magic 43: BigTIFF. Structurally different (8-byte offsets, 20-byte
    /// entries); we report it honestly instead of misreading it.
    case bigTIFF
    /// An offset or count runs past the end of the file.
    case truncated
    /// Structurally present but self-inconsistent.
    case malformed(String)
}

// MARK: - Model

public struct GeoKeys: Equatable, Sendable {
    public var rasterType: Int?          // 1025 GTRasterTypeGeoKey
    public var citation: String?         // 1026 GTCitationGeoKey
    public var geographicType: Int?      // 2048 GeographicTypeGeoKey
    public var projectedCSType: Int?     // 3072 ProjectedCSTypeGeoKey
    public var pcsCitation: String?      // 3073 PCSCitationGeoKey

    /// GTRasterTypeGeoKey == 2 (RasterPixelIsPoint): the tiepoint names the
    /// pixel CENTRE, so the area-semantics origin sits half a pixel out.
    public var isPixelIsPoint: Bool { rasterType == 2 }
}

public struct GeoTIFFDirectory: Equatable, Sendable {
    public let index: Int
    public let width: Int
    public let height: Int
    /// NewSubfileType bit 0 — GDAL marks internal overviews this way.
    public let isReducedResolution: Bool
    public let modelPixelScale: [Double]?
    public let modelTiepoint: [Double]?
    public let modelTransformation: [Double]?
    public let geoKeys: GeoKeys
}

public struct GeoTIFFFile: Equatable, Sendable {
    public let isBigEndian: Bool
    public let directories: [GeoTIFFDirectory]

    public var base: GeoTIFFDirectory? { directories.first }
    /// Pixel dimensions of every directory, base first — the input to
    /// `chooseImageIndex`.
    public var sizes: [(width: Int, height: Int)] {
        directories.map { ($0.width, $0.height) }
    }

    public static func == (lhs: GeoTIFFFile, rhs: GeoTIFFFile) -> Bool {
        lhs.isBigEndian == rhs.isBigEndian && lhs.directories == rhs.directories
    }
}

// MARK: - Georeferencing derivation

extension GeoTIFFDirectory {
    /// GDAL-order affine: [originX, xScale, xRotation, originY, yRotation, yScale].
    ///
    /// Ported from `web/src/userMaps/parsers/geoTiffSource.ts:geotransformFrom`
    /// including its two rejection rules: a ModelTransformation shorter than a
    /// full 4x4 is broken, and more than one tiepoint without a transformation
    /// matrix is irregular georeferencing we do not support.
    public var geotransform: [Double]? {
        if let m = modelTransformation {
            guard m.count >= 16 else { return nil }
            return [m[3], m[0], m[1], m[7], m[4], m[5]]
        }
        guard let scale = modelPixelScale, scale.count >= 2,
              let tie = modelTiepoint, tie.count >= 6
        else { return nil }
        guard tie.count == 6 else { return nil }

        var originX = tie[3] - tie[0] * scale[0]
        var originY = tie[4] + tie[1] * scale[1]
        if geoKeys.isPixelIsPoint {
            originX -= scale[0] / 2
            originY += scale[1] / 2
        }
        return [originX, scale[0], 0, originY, 0, -scale[1]]
    }

    /// `EPSG:<code>` when a real code is present; otherwise the citation string
    /// (which the caller's CRS allowlist is expected to reject).
    /// Ported from `geoTiffSource.ts:crsFrom`.
    public var crsIdentifier: String? {
        let epsg = geoKeys.projectedCSType ?? geoKeys.geographicType
        if let epsg, epsg != 32767 {
            return "EPSG:\(epsg)"
        }
        return geoKeys.pcsCitation ?? geoKeys.citation
    }
}

/// Smallest directory whose longest edge still covers `target`, else the base.
/// Ported from `geoTiffSource.ts:chooseImageIndex`.
public func chooseImageIndex(sizes: [(width: Int, height: Int)], target: Int) -> Int {
    var best = 0
    var bestMax = Int.max
    for (i, size) in sizes.enumerated() {
        let longest = max(size.width, size.height)
        if longest >= target && longest < bestMax {
            best = i
            bestMax = longest
        }
    }
    return best
}

// MARK: - Reader

public enum GeoTIFFTagReader {
    /// Directory-chain cap. Real pyramids run to a handful of levels; a longer
    /// chain is either hostile or a format we should not be guessing at.
    static let maxDirectories = 64

    public static func read(_ data: Data) throws -> GeoTIFFFile {
        let cursor = try Cursor(data)
        var directories: [GeoTIFFDirectory] = []
        var visited = Set<Int>()
        var next = try cursor.u32(at: 4)

        while next != 0 {
            guard !visited.contains(next) else {
                throw GeoTIFFReadError.malformed("IFD chain loops at offset \(next)")
            }
            guard directories.count < maxDirectories else {
                throw GeoTIFFReadError.malformed("more than \(maxDirectories) directories")
            }
            visited.insert(next)
            let (directory, following) = try readDirectory(
                cursor, at: next, index: directories.count)
            directories.append(directory)
            next = following
        }

        guard !directories.isEmpty else {
            throw GeoTIFFReadError.malformed("no image file directory")
        }
        return GeoTIFFFile(isBigEndian: cursor.isBigEndian, directories: directories)
    }

    private static func readDirectory(
        _ cursor: Cursor, at offset: Int, index: Int
    ) throws -> (GeoTIFFDirectory, Int) {
        let count = try cursor.u16(at: offset)
        var entries: [UInt16: Entry] = [:]
        for i in 0..<count {
            let entryOffset = offset + 2 + i * 12
            let tag = try cursor.u16(at: entryOffset)
            let entry = Entry(
                type: try cursor.u16(at: entryOffset + 2),
                count: try cursor.u32(at: entryOffset + 4),
                payloadOffset: entryOffset + 8)
            entries[UInt16(tag)] = entry
        }
        let nextOffset = try cursor.u32(at: offset + 2 + count * 12)

        guard let width = try entries[256].flatMap({ try cursor.integers($0).first }),
              let height = try entries[257].flatMap({ try cursor.integers($0).first })
        else {
            throw GeoTIFFReadError.malformed("directory \(index) has no image dimensions")
        }

        let subfileType = try entries[254].flatMap { try cursor.integers($0).first } ?? 0
        let geoKeys = try readGeoKeys(cursor, entries: entries)

        let directory = GeoTIFFDirectory(
            index: index,
            width: width,
            height: height,
            isReducedResolution: subfileType & 1 == 1,
            modelPixelScale: try entries[33550].map { try cursor.doubles($0) },
            modelTiepoint: try entries[33922].map { try cursor.doubles($0) },
            modelTransformation: try entries[34264].map { try cursor.doubles($0) },
            geoKeys: geoKeys)
        return (directory, nextOffset)
    }

    /// GeoKeyDirectory (34735) is a flat SHORT array: a 4-short header
    /// (version, revision, minor, keyCount) followed by 4-short key entries
    /// (id, tagLocation, count, valueOffset). tagLocation 0 stores the value
    /// inline; 34736 indexes the double params; 34737 slices the ASCII params.
    private static func readGeoKeys(
        _ cursor: Cursor, entries: [UInt16: Entry]
    ) throws -> GeoKeys {
        guard let directoryEntry = entries[34735] else { return GeoKeys() }
        let shorts = try cursor.integers(directoryEntry)
        guard shorts.count >= 4 else {
            throw GeoTIFFReadError.malformed("GeoKeyDirectory shorter than its header")
        }
        let keyCount = shorts[3]
        guard keyCount >= 0, shorts.count >= 4 + keyCount * 4 else {
            throw GeoTIFFReadError.malformed("GeoKeyDirectory declares \(keyCount) keys it does not contain")
        }

        let doubleParams = try entries[34736].map { try cursor.doubles($0) } ?? []
        let asciiParams = try entries[34737].map { try cursor.ascii($0) } ?? ""

        var keys = GeoKeys()
        for i in 0..<keyCount {
            let base = 4 + i * 4
            let id = shorts[base]
            let location = shorts[base + 1]
            let count = shorts[base + 2]
            let valueOffset = shorts[base + 3]

            switch location {
            case 0:
                switch id {
                case 1025: keys.rasterType = valueOffset
                case 2048: keys.geographicType = valueOffset
                case 3072: keys.projectedCSType = valueOffset
                default: break
                }
            case 34736:
                // No numeric GeoKey we consume lives in the double params; a
                // reader that later needs one (e.g. user-defined projection
                // parameters) reads doubleParams[valueOffset ..< +count].
                guard valueOffset >= 0, valueOffset + count <= doubleParams.count else {
                    throw GeoTIFFReadError.malformed("GeoKey \(id) points outside GeoDoubleParams")
                }
            case 34737:
                guard valueOffset >= 0, count >= 0,
                      valueOffset + count <= asciiParams.utf8.count
                else {
                    throw GeoTIFFReadError.malformed("GeoKey \(id) points outside GeoAsciiParams")
                }
                let utf8 = Array(asciiParams.utf8)[valueOffset..<(valueOffset + count)]
                var text = String(decoding: utf8, as: UTF8.self)
                // GeoAsciiParams separates entries with '|' standing in for NUL.
                while text.hasSuffix("|") || text.hasSuffix("\0") { text.removeLast() }
                if id == 1026 { keys.citation = text }
                if id == 3073 { keys.pcsCitation = text }
            default:
                throw GeoTIFFReadError.malformed("GeoKey \(id) has unknown location \(location)")
            }
        }
        return keys
    }
}

// MARK: - Byte plumbing

struct Entry {
    let type: Int
    let count: Int
    /// Offset of the entry's 4-byte value field, which holds either the value
    /// itself (when it fits) or a file offset to it.
    let payloadOffset: Int
}

/// Bounds-checked random access over the file's bytes.
struct Cursor {
    private let data: Data
    let isBigEndian: Bool

    init(_ data: Data) throws {
        guard data.count >= 8 else { throw GeoTIFFReadError.truncated }
        let mark = (data[data.startIndex], data[data.startIndex + 1])
        switch mark {
        case (0x4D, 0x4D): isBigEndian = true
        case (0x49, 0x49): isBigEndian = false
        default: throw GeoTIFFReadError.notATIFF
        }
        self.data = data

        let magic = try Self.u16(data, at: 2, bigEndian: isBigEndian)
        switch magic {
        case 42: break
        case 43: throw GeoTIFFReadError.bigTIFF
        default: throw GeoTIFFReadError.notATIFF
        }
    }

    private static func byte(_ data: Data, at offset: Int) throws -> UInt8 {
        guard offset >= 0, offset < data.count else { throw GeoTIFFReadError.truncated }
        return data[data.startIndex + offset]
    }

    private static func u16(_ data: Data, at offset: Int, bigEndian: Bool) throws -> Int {
        let a = Int(try byte(data, at: offset))
        let b = Int(try byte(data, at: offset + 1))
        return bigEndian ? (a << 8 | b) : (b << 8 | a)
    }

    func u16(at offset: Int) throws -> Int {
        try Self.u16(data, at: offset, bigEndian: isBigEndian)
    }

    func u32(at offset: Int) throws -> Int {
        let hi = try Self.u16(data, at: offset, bigEndian: isBigEndian)
        let lo = try Self.u16(data, at: offset + 2, bigEndian: isBigEndian)
        return isBigEndian ? (hi << 16 | lo) : (lo << 16 | hi)
    }

    func u64Bits(at offset: Int) throws -> UInt64 {
        var bits: UInt64 = 0
        for i in 0..<8 {
            let b = UInt64(try Self.byte(data, at: offset + i))
            bits = isBigEndian ? (bits << 8 | b) : (bits | b << UInt64(i * 8))
        }
        return bits
    }

    /// Byte width of each element of a TIFF field type, or nil if we do not
    /// read that type.
    private func elementSize(_ type: Int) -> Int? {
        switch type {
        case 1, 2, 6, 7: return 1
        case 3, 8: return 2
        case 4, 9, 11: return 4
        case 5, 10, 12: return 8
        default: return nil
        }
    }

    /// Where an entry's values actually start: inline in the 4-byte value
    /// field when they fit, otherwise at the offset stored there.
    private func valueStart(_ entry: Entry) throws -> Int {
        guard let size = elementSize(entry.type) else {
            throw GeoTIFFReadError.malformed("unsupported field type \(entry.type)")
        }
        guard entry.count >= 0,
              let total = (entry.count as Int?).flatMap({ $0.multipliedReportingOverflow(by: size).overflow ? nil : $0 * size })
        else {
            throw GeoTIFFReadError.malformed("field count \(entry.count) overflows")
        }
        let start = total <= 4 ? entry.payloadOffset : try u32(at: entry.payloadOffset)
        guard start >= 0, start + total <= data.count else { throw GeoTIFFReadError.truncated }
        return start
    }

    func doubles(_ entry: Entry) throws -> [Double] {
        guard entry.type == 12 else {
            throw GeoTIFFReadError.malformed("expected DOUBLE, got type \(entry.type)")
        }
        let start = try valueStart(entry)
        return try (0..<entry.count).map {
            Double(bitPattern: try u64Bits(at: start + $0 * 8))
        }
    }

    func integers(_ entry: Entry) throws -> [Int] {
        let start = try valueStart(entry)
        switch entry.type {
        case 3: return try (0..<entry.count).map { try u16(at: start + $0 * 2) }
        case 4: return try (0..<entry.count).map { try u32(at: start + $0 * 4) }
        case 1: return try (0..<entry.count).map { Int(try Self.byte(data, at: start + $0)) }
        default:
            throw GeoTIFFReadError.malformed("expected SHORT/LONG, got type \(entry.type)")
        }
    }

    func ascii(_ entry: Entry) throws -> String {
        guard entry.type == 2 else {
            throw GeoTIFFReadError.malformed("expected ASCII, got type \(entry.type)")
        }
        let start = try valueStart(entry)
        let bytes = try (0..<entry.count).map { try Self.byte(data, at: start + $0) }
        return String(decoding: bytes, as: UTF8.self)
    }
}
