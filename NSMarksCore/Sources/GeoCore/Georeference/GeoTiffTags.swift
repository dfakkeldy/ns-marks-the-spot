import Foundation

/// Reads the georeferencing a GeoTIFF carries in its tags.
///
/// Only the tags, not the pixels. ImageIO decodes the picture and does it
/// better than anything written here could; what it does not surface is the
/// GeoTIFF tag set, which is the half that says where on Earth the picture
/// belongs. So this walks the first image file directory and reads exactly
/// those tags.
///
/// Ported from what `geotiff.js` gives the web's `parsers/geoTiffSource.ts`,
/// classic and 64-bit layouts alike. BigTIFF is the same tag set written with
/// eight-byte counts and offsets in twenty-byte entries, and provincial
/// rasters are routinely exported that way; ImageIO decodes their pixels
/// without being asked, so refusing the tags would have left the reader
/// placing a readable sheet by hand.
public enum GeoTiffTags {
    public enum Refusal: Error, Equatable, Sendable {
        /// No TIFF byte-order mark and magic number at the front.
        case notATiff
        /// A BigTIFF that declares an offset width other than the eight bytes
        /// the format defines. Named rather than folded into `notATiff`,
        /// because the file is a real TIFF and the reader is the part that
        /// cannot follow it.
        case bigTiff
        /// The header is a TIFF's and the file stops before the tags it points
        /// at.
        case truncated
    }

    /// What the tags say, before any of it is checked against a raster.
    public struct Metadata: Equatable, Sendable {
        public var pixelSize: PixelSize
        /// GDAL order, or nil when the file carries no usable placement — a
        /// plain scan, which is not an error: it goes to the georeferencer to
        /// be placed by hand.
        public var geotransform: [Double]?
        /// The declared coordinate system, as an EPSG string when the file
        /// names one.
        public var crs: String?
        /// A citation the file offered in place of a code. Kept separate from
        /// `crs` because nothing here can turn prose into a projection; it
        /// exists so the refusal can quote what the file actually said.
        public var citation: String?

        public init(
            pixelSize: PixelSize, geotransform: [Double]? = nil,
            crs: String? = nil, citation: String? = nil
        ) {
            self.pixelSize = pixelSize
            self.geotransform = geotransform
            self.crs = crs
            self.citation = citation
        }

        /// The placement, when the file carries both halves of one.
        public var georeference: RasterProjection.EmbeddedGeoreference? {
            guard let geotransform, let crs else { return nil }
            return RasterProjection.EmbeddedGeoreference(
                crs: crs, geotransform: geotransform
            )
        }
    }

    private enum Tag {
        static let imageWidth: UInt16 = 256
        static let imageLength: UInt16 = 257
        static let modelPixelScale: UInt16 = 33_550
        static let modelTiepoint: UInt16 = 33_922
        static let modelTransformation: UInt16 = 34_264
        static let geoKeyDirectory: UInt16 = 34_735
        static let geoDoubleParams: UInt16 = 34_736
        static let geoAsciiParams: UInt16 = 34_737
    }

    private enum GeoKey {
        static let rasterType: UInt16 = 1_025
        static let citation: UInt16 = 1_026
        static let geographicType: UInt16 = 2_048
        static let projectedCsType: UInt16 = 3_072
        static let projectedCsCitation: UInt16 = 3_073
        /// The code a file uses to say "the system is described elsewhere in
        /// this file", which is not a system this can look up.
        static let userDefined: Double = 32_767
    }

    public static func parse(_ data: Data) throws(Refusal) -> Metadata {
        var reader = try Reader(data)
        let entries = try reader.firstDirectory()

        guard let width = entries[Tag.imageWidth]?.first,
              let height = entries[Tag.imageLength]?.first,
              width > 0, height > 0
        else { throw .truncated }

        let keys = geoKeys(entries: entries, reader: reader)
        // GTRasterTypeGeoKey 2 is PixelIsPoint: the tiepoint names the centre
        // of a pixel rather than its corner.
        let pixelIsPoint = keys.numbers[GeoKey.rasterType] == 2

        return Metadata(
            pixelSize: PixelSize(width: width, height: height),
            geotransform: geotransform(entries: entries, pixelIsPoint: pixelIsPoint),
            crs: crs(keys),
            citation: keys.strings[GeoKey.projectedCsCitation]
                ?? keys.strings[GeoKey.citation]
        )
    }

    private static func geotransform(
        entries: [UInt16: [Double]], pixelIsPoint: Bool
    ) -> [Double]? {
        if let matrix = entries[Tag.modelTransformation] {
            // Defined as a full 4x4; anything shorter is a broken tag, not a
            // transform to salvage.
            guard matrix.count >= 16 else { return nil }
            // Row-major: x' = m0·x + m1·y + m3, y' = m4·x + m5·y + m7.
            return [matrix[3], matrix[0], matrix[1], matrix[7], matrix[4], matrix[5]]
        }
        guard let scale = entries[Tag.modelPixelScale], scale.count >= 2,
              let tie = entries[Tag.modelTiepoint], tie.count >= 6
        else { return nil }
        // More than one tiepoint and no transformation matrix is irregular
        // georeferencing — a warp described by points rather than by a
        // transform. Read as ungeoreferenced, so the sheet goes to the
        // georeferencer instead of being placed from the first tiepoint as if
        // the others were not there.
        guard tie.count == 6 else { return nil }

        var originX = tie[3] - tie[0] * scale[0]
        var originY = tie[4] + tie[1] * scale[1]
        if pixelIsPoint {
            // The tiepoint holds the pixel's centre, and a geotransform states
            // its corner: half a pixel back, north-up, where the Y resolution
            // is negative.
            originX -= scale[0] / 2
            originY += scale[1] / 2
        }
        return [originX, scale[0], 0, originY, 0, -scale[1]]
    }

    private static func crs(_ keys: (numbers: [UInt16: Double], strings: [UInt16: String])) -> String? {
        let code = keys.numbers[GeoKey.projectedCsType] ?? keys.numbers[GeoKey.geographicType]
        guard let code, code != GeoKey.userDefined, code > 0, code == code.rounded()
        else { return nil }
        return "EPSG:\(Int(code))"
    }

    /// The GeoKey directory: a tag whose values are themselves a table of
    /// keys, each either holding its own value or pointing into one of two
    /// other tags.
    private static func geoKeys(
        entries: [UInt16: [Double]], reader: Reader
    ) -> (numbers: [UInt16: Double], strings: [UInt16: String]) {
        var numbers = [UInt16: Double]()
        var strings = [UInt16: String]()
        guard let directory = entries[Tag.geoKeyDirectory], directory.count >= 4
        else { return (numbers, strings) }

        let doubles = entries[Tag.geoDoubleParams] ?? []
        let ascii = reader.ascii[Tag.geoAsciiParams] ?? ""
        let declared = Int(directory[3])
        // Trusted only as far as the tag actually goes: the count is four
        // shorts in, and a file whose header outruns its own table would
        // otherwise read whatever followed.
        let count = min(declared, (directory.count - 4) / 4)

        for index in 0..<max(0, count) {
            let base = 4 + index * 4
            let id = UInt16(exactly: directory[base].rounded()) ?? 0
            let location = UInt16(exactly: directory[base + 1].rounded()) ?? 0
            let length = Int(directory[base + 2])
            let offset = Int(directory[base + 3])
            switch location {
            case 0:
                numbers[id] = directory[base + 3]
            case Tag.geoDoubleParams:
                guard offset >= 0, offset < doubles.count else { continue }
                numbers[id] = doubles[offset]
            case Tag.geoAsciiParams:
                guard offset >= 0, length > 0, offset + length <= ascii.count
                else { continue }
                let start = ascii.index(ascii.startIndex, offsetBy: offset)
                let end = ascii.index(start, offsetBy: length)
                // The convention terminates each string with "|" rather than
                // a NUL, and the count includes it.
                strings[id] = String(ascii[start..<end])
                    .trimmingCharacters(in: CharacterSet(charactersIn: "|\0"))
            default:
                continue
            }
        }
        return (numbers, strings)
    }

    // MARK: - The bytes

    /// A cursor over the file, in whichever byte order its header declared.
    private struct Reader {
        let data: Data
        let bigEndian: Bool
        /// The 64-bit layout: eight-byte counts and offsets, in twenty-byte
        /// directory entries rather than twelve-byte ones.
        let isBig: Bool
        let firstDirectoryOffset: Int
        /// Filled while reading the directory, because a string tag has to be
        /// decoded as bytes rather than as the numbers everything else is.
        var ascii: [UInt16: String] = [:]

        init(_ data: Data) throws(Refusal) {
            guard data.count >= 8 else { throw .notATiff }
            let mark = (data[data.startIndex], data[data.startIndex + 1])
            switch mark {
            case (0x49, 0x49): bigEndian = false
            case (0x4D, 0x4D): bigEndian = true
            default: throw .notATiff
            }
            self.data = data
            let version = Self.integer(data, at: 2, bytes: 2, bigEndian: bigEndian)
            let pointer: UInt64
            switch version {
            case 42:
                isBig = false
                pointer = Self.integer(data, at: 4, bytes: 4, bigEndian: bigEndian)
            case 43:
                // Sixteen bytes of header rather than eight. The two after the
                // version say how wide an offset is, and eight is the only
                // width the format has ever defined — a file claiming another
                // is one this cannot walk, whatever else is right about it.
                guard data.count >= 16,
                    Self.integer(data, at: 6, bytes: 2, bigEndian: bigEndian) == 0
                else { throw .notATiff }
                guard Self.integer(data, at: 4, bytes: 2, bigEndian: bigEndian) == 8
                else { throw .bigTiff }
                isBig = true
                pointer = Self.integer(data, at: 8, bytes: 8, bigEndian: bigEndian)
            default: throw .notATiff
            }
            // An eight-byte offset can name ground no file has. Bounded before
            // it becomes an `Int`, where the conversion itself would trap.
            guard pointer <= UInt64(data.count) else { throw .truncated }
            firstDirectoryOffset = Int(pointer)
        }

        /// Every tag in the first directory, as doubles — which is lossy for a
        /// 64-bit integer and exact for everything a GeoTIFF puts in these
        /// tags, all of which are counts, codes, or coordinates.
        mutating func firstDirectory() throws(Refusal) -> [UInt16: [Double]] {
            // The two layouts differ only in how wide these three fields are:
            // the directory's entry count, each entry's value count, and the
            // offset that stands in for a value too long to sit inline. Which
            // also moves the inline threshold, because the slot holding it is
            // the same field.
            let countWidth = isBig ? 8 : 2
            let entryWidth = isBig ? 20 : 12
            let fieldWidth = isBig ? 8 : 4

            var offset = firstDirectoryOffset
            guard offset > 0, offset + countWidth <= data.count else { throw .truncated }
            let declared = Self.integer(
                data, at: offset, bytes: countWidth, bigEndian: bigEndian
            )
            // A directory cannot hold more entries than the file has room for.
            // Checked before the conversion rather than after: an eight-byte
            // count can exceed `Int` outright, and `Int(_:)` traps on that.
            guard declared <= UInt64(data.count / entryWidth) else { throw .truncated }
            let count = Int(declared)
            offset += countWidth
            guard offset + count * entryWidth <= data.count else { throw .truncated }

            var entries = [UInt16: [Double]]()
            for index in 0..<count {
                let entry = offset + index * entryWidth
                let tag = UInt16(Self.integer(data, at: entry, bytes: 2, bigEndian: bigEndian))
                let type = Int(Self.integer(data, at: entry + 2, bytes: 2, bigEndian: bigEndian))
                let declaredLength = Self.integer(
                    data, at: entry + 4, bytes: fieldWidth, bigEndian: bigEndian
                )
                guard declaredLength <= UInt64(data.count) else { throw .truncated }
                let length = Int(declaredLength)
                guard let width = Self.byteWidth(ofType: type) else { continue }
                let total = width * length
                // A value that fits the offset slot lives in it; anything
                // longer is an offset to where it does live.
                var valueAt = entry + 4 + fieldWidth
                if total > fieldWidth {
                    let pointer = Self.integer(
                        data, at: valueAt, bytes: fieldWidth, bigEndian: bigEndian
                    )
                    guard pointer <= UInt64(data.count) else { throw .truncated }
                    valueAt = Int(pointer)
                }
                guard valueAt >= 0, valueAt + total <= data.count, total >= 0
                else { throw .truncated }

                if type == 2 {
                    let bytes = data[
                        (data.startIndex + valueAt)..<(data.startIndex + valueAt + total)
                    ]
                    ascii[tag] = String(decoding: bytes, as: UTF8.self)
                    continue
                }
                entries[tag] = (0..<length).map {
                    Self.value(data, at: valueAt + $0 * width, type: type, bigEndian: bigEndian)
                }
            }
            return entries
        }

        private static func byteWidth(ofType type: Int) -> Int? {
            switch type {
            case 1, 2, 6, 7: 1        // byte, ascii, signed byte, undefined
            case 3, 8: 2              // short, signed short
            case 4, 9, 11: 4          // long, signed long, float
            case 5, 10, 12: 8         // rational, signed rational, double
            case 16, 17: 8            // long8, signed long8
            default: nil
            }
        }

        private static func value(
            _ data: Data, at offset: Int, type: Int, bigEndian: Bool
        ) -> Double {
            switch type {
            case 12:
                Double(
                    bitPattern: integer(data, at: offset, bytes: 8, bigEndian: bigEndian)
                )
            case 11:
                Double(
                    Float(
                        bitPattern: UInt32(
                            integer(data, at: offset, bytes: 4, bigEndian: bigEndian)
                        )
                    )
                )
            case 5, 10:
                // A rational is two longs. Division by zero gives infinity,
                // which every caller here already treats as unusable.
                Double(integer(data, at: offset, bytes: 4, bigEndian: bigEndian))
                    / Double(integer(data, at: offset + 4, bytes: 4, bigEndian: bigEndian))
            case 3, 8:
                Double(integer(data, at: offset, bytes: 2, bigEndian: bigEndian))
            case 1, 6, 7:
                Double(integer(data, at: offset, bytes: 1, bigEndian: bigEndian))
            default:
                Double(integer(data, at: offset, bytes: 4, bigEndian: bigEndian))
            }
        }

        private static func integer(
            _ data: Data, at offset: Int, bytes: Int, bigEndian: Bool
        ) -> UInt64 {
            var result: UInt64 = 0
            let start = data.startIndex + offset
            guard start >= data.startIndex, start + bytes <= data.endIndex else { return 0 }
            for index in 0..<bytes {
                let byte = UInt64(data[bigEndian ? start + index : start + bytes - 1 - index])
                result = result << 8 | byte
            }
            return result
        }
    }
}
