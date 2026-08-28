import Foundation

/// A GeoTIFF with real pixels in it, built byte by byte.
///
/// Image I/O writes TIFFs and will not write GeoTIFF tags, so a fixture made
/// with `CGImageDestination` can carry a picture or a placement but never
/// both. That gap is why the importer's "the file said where it belongs and
/// this app could not use it" path had no end-to-end test: every check stopped
/// at the tag parser, and deleting the importer's recovery entirely left them
/// all passing.
///
/// The layout is the simplest one a TIFF allows — little-endian, one strip,
/// uncompressed, eight-bit grayscale — because the point is the tags. Image
/// I/O decodes it, so the file goes through `UserMapImporter.import` the same
/// way a scan from the user's own camera roll does.
enum GeoTiffFixture {
    /// A sheet of the given size carrying whatever geo tags the caller asks
    /// for, keyed by TIFF tag number: 33550 ModelPixelScale and 33922
    /// ModelTiepoint as doubles, 34735 GeoKeyDirectory as shorts, 34737
    /// GeoAsciiParams as a string.
    static func sheet(
        width: Int = 8,
        height: Int = 8,
        doubles: [UInt16: [Double]] = [:],
        shorts: [UInt16: [UInt16]] = [:],
        strings: [UInt16: String] = [:]
    ) -> Data {
        var entries: [(tag: UInt16, type: UInt16, count: UInt32, payload: Data)] = []
        func short(_ tag: UInt16, _ value: UInt16) {
            entries.append((tag, 3, 1, integer(UInt64(value), bytes: 2)))
        }
        func long(_ tag: UInt16, _ value: UInt32) {
            entries.append((tag, 4, 1, integer(UInt64(value), bytes: 4)))
        }
        short(256, UInt16(width))  // ImageWidth
        short(257, UInt16(height))  // ImageLength
        short(258, 8)  // BitsPerSample
        short(259, 1)  // Compression: none
        short(262, 1)  // PhotometricInterpretation: black is zero
        long(273, 0)  // StripOffsets, filled in once the heap's size is known
        short(277, 1)  // SamplesPerPixel
        short(278, UInt16(height))  // RowsPerStrip: the whole picture in one
        long(279, UInt32(width * height))  // StripByteCounts

        for (tag, values) in shorts {
            entries.append(
                (
                    tag, 3, UInt32(values.count),
                    values.reduce(into: Data()) {
                        $0.append(integer(UInt64($1), bytes: 2))
                    }
                )
            )
        }
        for (tag, values) in doubles {
            entries.append(
                (
                    tag, 12, UInt32(values.count),
                    values.reduce(into: Data()) {
                        $0.append(integer($1.bitPattern, bytes: 8))
                    }
                )
            )
        }
        for (tag, value) in strings {
            // The GeoTIFF convention terminates each string with "|", and the
            // NUL after it is the TIFF ASCII type's own. Both are the caller's
            // to count: a GeoKey entry's length includes the "|".
            var bytes = Data(value.utf8)
            bytes.append(0)
            entries.append((tag, 2, UInt32(bytes.count), bytes))
        }
        // A directory's entries are read in tag order, and a reader is entitled
        // to stop at the first one out of sequence.
        entries.sort { $0.tag < $1.tag }

        // No guesswork about what sits inline and what goes on the heap: a
        // payload of four bytes or fewer lives in the directory entry itself,
        // so the heap's size is known before the pixels are placed and the
        // strip offset can be written straight in rather than patched later.
        let heapAt = 8 + 2 + entries.count * 12 + 4
        let heapSize = entries.reduce(0) {
            $0 + ($1.payload.count <= 4 ? 0 : $1.payload.count)
        }
        let pixelsAt = heapAt + heapSize
        if let index = entries.firstIndex(where: { $0.tag == 273 }) {
            entries[index].payload = integer(UInt64(pixelsAt), bytes: 4)
        }

        var header = Data([0x49, 0x49])
        header.append(integer(42, bytes: 2))
        header.append(integer(8, bytes: 4))

        var directory = integer(UInt64(entries.count), bytes: 2)
        var heap = Data()
        var next = heapAt
        for entry in entries {
            directory.append(integer(UInt64(entry.tag), bytes: 2))
            directory.append(integer(UInt64(entry.type), bytes: 2))
            directory.append(integer(UInt64(entry.count), bytes: 4))
            if entry.payload.count <= 4 {
                var inline = entry.payload
                inline.append(Data(repeating: 0, count: 4 - inline.count))
                directory.append(inline)
            } else {
                directory.append(integer(UInt64(next), bytes: 4))
                heap.append(entry.payload)
                next += entry.payload.count
            }
        }
        directory.append(integer(0, bytes: 4))  // no second directory

        // A gradient rather than a flat fill, so pixels read out of the wrong
        // rows show up as a difference rather than as an identical grey.
        var pixels = Data()
        for row in 0..<height {
            for column in 0..<width {
                pixels.append(UInt8((row * width + column) % 256))
            }
        }
        return header + directory + heap + pixels
    }

    /// The two tags that put a raster on the ground: a pixel scale and one
    /// tiepoint, which together are a north-up geotransform.
    static func placement(
        eastingMetres: Double = 400_000, northingMetres: Double = 5_040_000,
        metresPerPixel: Double = 10
    ) -> [UInt16: [Double]] {
        [
            33_550: [metresPerPixel, metresPerPixel, 0],
            33_922: [0, 0, 0, eastingMetres, northingMetres, 0],
        ]
    }

    /// A GeoKey directory naming the file's projected system by EPSG code.
    static func projectedSystem(epsg: UInt16) -> [UInt16: [UInt16]] {
        // Version 1.1.0, one key: GTModelTypeGeoKey is left out because the
        // parser reads the code, not the model type.
        [34_735: [1, 1, 0, 2, 1_024, 0, 1, 1, 3_072, 0, 1, epsg]]
    }

    /// A GeoKey directory that describes its system in prose instead of by
    /// code — 32767 is "user-defined", and the words are in GeoAsciiParams.
    ///
    /// The count on the citation key includes the "|" the convention ends the
    /// string with, which is why it is one more than the prose is long.
    static func citedSystem(_ citation: String) -> ([UInt16: [UInt16]], [UInt16: String]) {
        let terminated = citation + "|"
        let directory: [UInt16: [UInt16]] = [
            34_735: [
                1, 1, 0, 3,
                1_024, 0, 1, 1,
                3_072, 0, 1, 32_767,
                3_073, 34_737, UInt16(terminated.utf8.count), 0,
            ]
        ]
        return (directory, [34_737: terminated])
    }

    private static func integer(_ value: UInt64, bytes: Int) -> Data {
        var out = Data()
        for index in 0..<bytes { out.append(UInt8((value >> UInt64(index * 8)) & 0xFF)) }
        return out
    }
}
