import Compression
import Foundation

/// Decoding a TIFF's pixels from its own tags, for the files ImageIO will not.
///
/// ImageIO decodes a TIFF that is tiled, and a TIFF that is compressed, and
/// refuses one that is both: no dimensions, no image, no error beyond nil. That
/// is measured on iOS as well as macOS (see
/// `docs/spikes/ios-port-spike-1-geotiff-tags.md`), and it is the shape of
/// essentially every Cloud-Optimized GeoTIFF, orthophoto and government raster
/// download. The browser reads those files through geotiff.js, so a phone that
/// cannot is a phone missing the files the app is for.
///
/// Deliberately narrow. It decodes eight-bit samples stored one pixel at a
/// time, which is what a GIS raster is, and refuses the rest by name instead of
/// rendering a guess. Everything ImageIO already handles keeps going through
/// ImageIO — this runs only where that returns nothing.
public enum TiffRaster {
    /// Eight-bit RGBA, at or below the size that was asked for.
    public struct Bitmap: Equatable, Sendable {
        public var width: Int
        public var height: Int
        /// `width * height * 4` bytes, red first, alpha last.
        public var rgba: [UInt8]
    }

    static func refusal(_ message: String) -> UserMapImportRefusal {
        UserMapImportRefusal(code: .unsupportedType, userMessage: message)
    }

    private static let corrupt = UserMapImportRefusal(
        code: .corruptFile,
        userMessage: """
            The image in this file is not stored the way the file says it is. \
            Export it again.
            """
    )

    /// Decodes the whole raster, sampled down so the longest edge is at most
    /// `maxDimension`.
    ///
    /// Sampled while reading rather than after: a provincial orthophoto is
    /// hundreds of megapixels, and materialising one to shrink it is the
    /// jetsam kill this exists to avoid. Blocks holding no sampled pixel are
    /// never decompressed at all.
    public static func decode(
        _ data: Data, layout: GeoTiffTags.RasterLayout, maxDimension: Int
    ) throws(UserMapImportRefusal) -> Bitmap {
        try check(layout)
        // Read out of the `Data` the caller already holds, rather than
        // `[UInt8](data)`.
        //
        // That line made a second full copy of the file while the original was
        // still alive in `UserFileImport.read`, and the cap here is 500 MB —
        // so a 300-400 MB COG added its own size again in transient bytes.
        // `phys_footprint` is the counter jetsam kills on, and jetsam is not
        // one of the distinct states this app is supposed to preserve: the
        // process dies mid-import and the reader is told nothing. Measured at
        // 201 MB of footprint on a 192 MB tiled file. What is left after this
        // is a decode that either succeeds or reaches `decodeFailure`, which
        // says so in the words the reader needs.
        //
        // Deliberately NOT `.mappedIfSafe`, which would drop the file out of
        // footprint entirely: `UserFileImport` releases the security scope on
        // return, and an evicted iCloud-Drive file faults as SIGBUS rather
        // than as a refusal.
        let bytes = data
        let width = Int(layout.pixelSize.width)
        let height = Int(layout.pixelSize.height)
        let samples = layout.samplesPerPixel
        // `write`'s default branch reads three samples and the caller bounds
        // the read at `at + samples`, so a layout claiming none would index
        // past the pixel it was handed.
        //
        // Load-bearing, not belt-and-braces: `check` guards bitsPerSample,
        // planarConfiguration, photometric, compression and predictor, and
        // **not this** — and `bitsPerSample.allSatisfy` is vacuously true for
        // the empty array such a layout carries, so nothing else stops it.
        guard samples >= 1 else { throw corrupt }

        let step = max(1, Int((Double(max(width, height)) / Double(max(1, maxDimension))).rounded(.up)))
        let outWidth = (width + step - 1) / step
        let outHeight = (height + step - 1) / step
        guard outWidth > 0, outHeight > 0 else { throw corrupt }
        var rgba = [UInt8](repeating: 0, count: outWidth * outHeight * 4)

        let blockWidth = layout.tileWidth ?? width
        let blockHeight = layout.tileHeight ?? layout.rowsPerStrip
        guard blockWidth > 0, blockHeight > 0 else { throw corrupt }
        let across = layout.isTiled ? (width + blockWidth - 1) / blockWidth : 1
        let down = (height + blockHeight - 1) / blockHeight
        // A tile is padded out to its full width; a strip is exactly as wide as
        // the image and its last one is short. Getting this backwards shears
        // the picture one row at a time, which reads as a rendering bug rather
        // than a wrong stride.
        let rowStride = (layout.isTiled ? blockWidth : width) * samples

        for blockY in 0..<down {
            let firstRow = blockY * blockHeight
            let rowsHere = layout.isTiled
                ? blockHeight : min(blockHeight, height - firstRow)
            guard rowsHere > 0 else { continue }
            // The sampled rows are every `step`th; a block between two of them
            // is never touched.
            guard sampled(from: firstRow, count: min(rowsHere, height - firstRow), step: step)
                    != nil
            else { continue }

            for blockX in 0..<across {
                let firstColumn = blockX * blockWidth
                let columnsHere = min(blockWidth, width - firstColumn)
                guard columnsHere > 0,
                      sampled(from: firstColumn, count: columnsHere, step: step) != nil
                else { continue }

                let index = blockY * across + blockX
                guard index < layout.offsets.count else { throw corrupt }
                let block = try self.block(
                    bytes, layout: layout, index: index,
                    expecting: rowsHere * rowStride
                )

                var row = firstRow % step == 0 ? firstRow : firstRow + (step - firstRow % step)
                while row < firstRow + rowsHere, row < height {
                    let source = (row - firstRow) * rowStride
                    var column = firstColumn % step == 0
                        ? firstColumn : firstColumn + (step - firstColumn % step)
                    while column < firstColumn + columnsHere, column < width {
                        let at = source + (column - firstColumn) * samples
                        guard at + samples <= block.count else { throw corrupt }
                        let destination = ((row / step) * outWidth + column / step) * 4
                        write(
                            block, from: at, layout: layout,
                            into: &rgba, at: destination
                        )
                        column += step
                    }
                    row += step
                }
            }
        }
        return Bitmap(width: outWidth, height: outHeight, rgba: rgba)
    }

    /// The first multiple of `step` inside a run, or nil when the run falls
    /// between two of them.
    private static func sampled(from start: Int, count: Int, step: Int) -> Int? {
        let first = start % step == 0 ? start : start + (step - start % step)
        return first < start + count ? first : nil
    }

    /// One pixel's samples, turned into RGBA.
    /// Takes the block and an offset into it rather than a slice.
    ///
    /// It used to take an `ArraySlice` and open with `let values = Array(pixel)`
    /// — one heap allocation **per sampled pixel**, and a full-size preview
    /// samples up to 4096 x 4096 of them. Measured at about a second of
    /// allocator time on one import, for four bytes read three lines later.
    /// The block is already in hand at the call site; an offset into it costs
    /// nothing and allocates nothing.
    private static func write(
        _ block: [UInt8], from at: Int, layout: GeoTiffTags.RasterLayout,
        into rgba: inout [UInt8], at destination: Int
    ) {
        guard destination + 4 <= rgba.count else { return }
        let red: UInt8
        let green: UInt8
        let blue: UInt8
        var alpha: UInt8 = 255
        switch layout.samplesPerPixel {
        case 1:
            // Photometric 0 is WhiteIsZero: the sample is ink, not light.
            let grey = layout.photometric == 0 ? 255 - block[at] : block[at]
            red = grey
            green = grey
            blue = grey
        case 2:
            let grey = layout.photometric == 0 ? 255 - block[at] : block[at]
            red = grey
            green = grey
            blue = grey
            alpha = block[at + 1]
        default:
            red = block[at]
            green = block[at + 1]
            blue = block[at + 2]
            if layout.samplesPerPixel >= 4 { alpha = block[at + 3] }
        }
        rgba[destination] = red
        rgba[destination + 1] = green
        rgba[destination + 2] = blue
        rgba[destination + 3] = alpha
    }

    /// What this decoder will and will not take, decided before any pixel is
    /// read so the refusal names the reason rather than a symptom.
    private static func check(_ layout: GeoTiffTags.RasterLayout) throws(UserMapImportRefusal) {
        guard layout.bitsPerSample.allSatisfy({ $0 == 8 }) else {
            throw refusal(
                """
                This raster stores \(layout.bitsPerSample.first ?? 0) bits per \
                sample, and this app reads eight-bit images. Export it again \
                as an eight-bit RGB or greyscale file.
                """
            )
        }
        guard layout.planarConfiguration == 1 else {
            throw refusal(
                """
                This raster keeps each colour in a separate plane, which this \
                app does not read. Export it again with interleaved pixels.
                """
            )
        }
        guard layout.photometric != 3 else {
            throw refusal(
                """
                This raster stores its colours as a palette, which this app \
                does not read. Export it again as an eight-bit RGB file.
                """
            )
        }
        guard layout.compression != .other else {
            throw refusal(
                """
                This raster is compressed with a scheme this app does not \
                read (TIFF compression \(layout.compressionCode)). Export it \
                again with DEFLATE or LZW compression, or none.
                """
            )
        }
        guard layout.predictor == 1 || layout.predictor == 2 else {
            throw refusal(
                """
                This raster uses a prediction scheme this app does not read \
                (predictor \(layout.predictor)). Export it again without one.
                """
            )
        }
    }

    // MARK: - One block's bytes

    /// Takes the file as `Data`, so a block is one copy rather than two.
    ///
    /// `bytes.startIndex` is honoured rather than assumed: a `Data` sliced
    /// from another indexes in its own space, and reading a block from the
    /// wrong offset would hand back a plausible-looking picture of the wrong
    /// part of the raster — the failure this decoder exists to avoid, and one
    /// nothing downstream could detect.
    private static func block(
        _ bytes: Data, layout: GeoTiffTags.RasterLayout, index: Int, expecting size: Int
    ) throws(UserMapImportRefusal) -> [UInt8] {
        let start = layout.offsets[index]
        let count = layout.byteCounts[index]
        guard start >= 0, count >= 0, start <= bytes.count, bytes.count - start >= count
        else { throw corrupt }
        let base = bytes.startIndex
        let raw = [UInt8](bytes[(base + start)..<(base + start + count)])

        var block: [UInt8]
        switch layout.compression {
        case .none:
            block = raw
        case .packBits:
            block = packBits(raw, expecting: size)
        case .lzw:
            guard let out = lzw(raw, expecting: size) else { throw corrupt }
            block = out
        case .deflate, .deflateAdobe:
            guard let out = inflate(raw, expecting: size) else { throw corrupt }
            block = out
        case .other:
            throw corrupt
        }
        guard block.count >= size else { throw corrupt }
        if layout.predictor == 2 {
            undoHorizontalDifferencing(
                &block, rowStride: size / max(1, rowsIn(size: size, layout: layout)),
                rows: rowsIn(size: size, layout: layout),
                samples: layout.samplesPerPixel
            )
        }
        return block
    }

    private static func rowsIn(size: Int, layout: GeoTiffTags.RasterLayout) -> Int {
        let width = layout.isTiled
            ? (layout.tileWidth ?? 1) : Int(layout.pixelSize.width)
        let stride = max(1, width * layout.samplesPerPixel)
        return max(1, size / stride)
    }

    /// Predictor 2 stores each sample as its difference from the one a pixel to
    /// its left, and the row starts fresh. Undone in place, left to right,
    /// because each value needs the one before it already restored.
    static func undoHorizontalDifferencing(
        _ block: inout [UInt8], rowStride: Int, rows: Int, samples: Int
    ) {
        guard rowStride > samples, samples > 0 else { return }
        for row in 0..<rows {
            let start = row * rowStride
            guard start + rowStride <= block.count else { return }
            for index in (start + samples)..<(start + rowStride) {
                block[index] = block[index] &+ block[index - samples]
            }
        }
    }

    /// TIFF's DEFLATE is zlib-wrapped, and the framework's decoder is not.
    static func inflate(_ data: [UInt8], expecting size: Int) -> [UInt8]? {
        guard size > 0 else { return [] }
        var payload = data
        // A zlib stream starts with a byte whose low nibble is 8 and a
        // two-byte check that divides by 31. Bare DEFLATE has neither, and a
        // writer that omits the wrapper is still worth reading.
        if payload.count > 6, payload[0] & 0x0F == 8,
           (Int(payload[0]) << 8 | Int(payload[1])) % 31 == 0
        {
            payload = Array(payload[2..<(payload.count - 4)])
        }
        var output = [UInt8](repeating: 0, count: size)
        let written = output.withUnsafeMutableBufferPointer { destination -> Int in
            guard let base = destination.baseAddress else { return 0 }
            return payload.withUnsafeBufferPointer { source -> Int in
                guard let from = source.baseAddress else { return 0 }
                return compression_decode_buffer(
                    base, size, from, payload.count, nil, COMPRESSION_ZLIB
                )
            }
        }
        return written == size ? output : nil
    }

    /// PackBits: a run-length scheme where a signed length byte says whether
    /// the next bytes are literal or one byte repeated.
    static func packBits(_ data: [UInt8], expecting size: Int) -> [UInt8] {
        var output = [UInt8]()
        output.reserveCapacity(size)
        var index = 0
        while index < data.count, output.count < size {
            let control = Int8(bitPattern: data[index])
            index += 1
            if control >= 0 {
                let run = Int(control) + 1
                guard index + run <= data.count else { break }
                output.append(contentsOf: data[index..<(index + run)])
                index += run
            } else if control != -128 {
                let run = 1 - Int(control)
                guard index < data.count else { break }
                output.append(contentsOf: repeatElement(data[index], count: run))
                index += 1
            }
            // -128 is a no-op by definition, and skipping it is the whole of
            // handling it.
        }
        return output
    }

    /// TIFF's LZW: codes packed most-significant bit first, widening from nine
    /// bits to twelve, with the "early change" that widens one code sooner than
    /// the plain algorithm would.
    static func lzw(_ data: [UInt8], expecting size: Int) -> [UInt8]? {
        let clear = 256
        let end = 257
        var table = [[UInt8]]()
        var output = [UInt8]()
        output.reserveCapacity(size)

        func reset() {
            table = (0..<256).map { [UInt8($0)] } + [[], []]
        }
        reset()

        var width = 9
        var bitPosition = 0
        var previous: [UInt8]?
        let totalBits = data.count * 8

        while bitPosition + width <= totalBits {
            var code = 0
            for _ in 0..<width {
                let byte = Int(data[bitPosition >> 3])
                let bit = (byte >> (7 - (bitPosition & 7))) & 1
                code = code << 1 | bit
                bitPosition += 1
            }
            if code == clear {
                reset()
                width = 9
                previous = nil
                continue
            }
            if code == end { break }

            let entry: [UInt8]
            if code < table.count, !(code == clear || code == end) {
                entry = table[code]
            } else if let previous, code == table.count {
                entry = previous + [previous[0]]
            } else {
                return nil
            }
            output.append(contentsOf: entry)
            if let previous {
                table.append(previous + [entry[0]])
            }
            previous = entry
            // Early change: the width goes up one code before the table
            // actually needs it, which is what every TIFF writer does.
            if table.count + 1 >= 1 << width, width < 12 { width += 1 }
            if output.count >= size { break }
        }
        return output.count >= size ? Array(output[0..<size]) : nil
    }
}
