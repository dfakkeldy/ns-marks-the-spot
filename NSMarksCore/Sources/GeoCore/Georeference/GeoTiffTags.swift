import Foundation

/// Reads the georeferencing a GeoTIFF carries in its tags.
///
/// Only the tags, not the pixels. ImageIO decodes the picture and does it
/// better than anything written here could; what it does not surface is the
/// GeoTIFF tag set, which is the half that says where on Earth the picture
/// belongs. So this walks the first image file directory and reads exactly
/// those tags.
///
/// Ported from what `geotiff.js` gives the web's `parsers/geoTiffSource.ts`.
/// The two differ in one way worth stating: `geotiff.js` reads BigTIFF, and
/// this refuses it by name rather than misreading its header as a classic
/// TIFF's. A refusal that says which format it saw is recoverable; a sheet
/// placed from a header that was never parsed is not.
public enum GeoTiffTags {
    public enum Refusal: Error, Equatable, Sendable {
        /// No TIFF byte-order mark and magic number at the front.
        case notATiff
        /// A real TIFF, in the 64-bit variant this does not read. Large
        /// provincial rasters are often exported this way, so it is called out
        /// rather than folded into `notATiff`.
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
            switch version {
            case 42: break
            case 43: throw .bigTiff
            default: throw .notATiff
            }
            firstDirectoryOffset = Int(
                Self.integer(data, at: 4, bytes: 4, bigEndian: bigEndian)
            )
        }

        /// Every tag in the first directory, as doubles — which is lossy for a
        /// 64-bit integer and exact for everything a GeoTIFF puts in these
        /// tags, all of which are counts, codes, or coordinates.
        mutating func firstDirectory() throws(Refusal) -> [UInt16: [Double]] {
            var offset = firstDirectoryOffset
            guard offset > 0, offset + 2 <= data.count else { throw .truncated }
            let count = Int(Self.integer(data, at: offset, bytes: 2, bigEndian: bigEndian))
            offset += 2
            guard offset + count * 12 <= data.count else { throw .truncated }

            var entries = [UInt16: [Double]]()
            for index in 0..<count {
                let entry = offset + index * 12
                let tag = UInt16(Self.integer(data, at: entry, bytes: 2, bigEndian: bigEndian))
                let type = Int(Self.integer(data, at: entry + 2, bytes: 2, bigEndian: bigEndian))
                let length = Int(Self.integer(data, at: entry + 4, bytes: 4, bigEndian: bigEndian))
                guard let width = Self.byteWidth(ofType: type) else { continue }
                let total = width * length
                // Four bytes or fewer live in the entry itself; anything longer
                // is an offset to them.
                var valueAt = entry + 8
                if total > 4 {
                    valueAt = Int(
                        Self.integer(data, at: entry + 8, bytes: 4, bigEndian: bigEndian)
                    )
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
