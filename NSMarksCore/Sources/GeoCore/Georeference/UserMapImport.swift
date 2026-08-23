import Foundation

/// What a file turned out to be, read from its bytes.
public enum RasterFileType: String, CaseIterable, Sendable {
    case geoTiff
    case pdf
    case png
    case jpeg
    case unknown
}

/// Why a file could not become a user map.
///
/// Ported from `web/src/userMaps/errors.ts`, codes and all, so the two surfaces
/// classify the same file the same way. The messages are rewritten for a phone:
/// the web's talk about what "this browser" could not do, and on iOS that is
/// both untrue and unactionable.
public struct UserMapImportRefusal: Error, Equatable, Sendable {
    public enum Code: String, Sendable {
        /// Not a raster this app reads.
        case unsupportedType = "unsupported-type"
        /// Recognised, and the bytes do not hold together.
        case corruptFile = "corrupt-file"
        case passwordProtected = "password-protected"
        /// A coordinate system outside the accepted list. Distinct from
        /// invalid georeferencing: the numbers may be perfect and the system
        /// is one nobody verified this app against.
        case unsupportedCrs = "unsupported-crs"
        /// A system this app accepts, paired with numbers that do not place
        /// the sheet anywhere real.
        case invalidGeoreferencing = "invalid-georeferencing"
        /// Valid, and beyond what this device will decode.
        case tooLarge = "too-large"
        case quota
        case storageFailed = "storage-failed"
        /// A vector file with more features than one layer will draw.
        case tooManyFeatures = "too-many-features"
        /// Read, understood, and holding nothing to put on a map. Distinct
        /// from a corrupt file: this one is intact and the user's expectation
        /// of seeing something is still wrong.
        case emptyFile = "empty-file"
    }

    public var code: Code
    /// Written for the person who chose the file, not for a log.
    public var userMessage: String

    public init(code: Code, userMessage: String) {
        self.code = code
        self.userMessage = userMessage
    }
}

/// The gates a user's raster passes before it becomes a layer.
///
/// Ported from `web/src/userMaps/parsers/sniff.ts`, `errors.ts`, and the
/// import-time checks in `geoTiffSource.ts`. Decoding itself is the app
/// target's — Image I/O rather than a worker — but which file is accepted,
/// which image inside it is decoded, and what the user is told when the answer
/// is no all live here, where they can be tested without a device.
public enum UserMapImport {
    /// Extensions are user-editable, so the type comes from the bytes.
    ///
    /// TIFF covers classic (42) and BigTIFF (43) in both byte orders. A GeoTIFF
    /// is a TIFF plus geo tags, which `GeoTiffTags` verifies later — a file
    /// sniffed as `geoTiff` has only proved it is a TIFF.
    private static let signatures: [(RasterFileType, [UInt8])] = [
        (.geoTiff, [0x49, 0x49, 0x2a, 0x00]),
        (.geoTiff, [0x4d, 0x4d, 0x00, 0x2a]),
        (.geoTiff, [0x49, 0x49, 0x2b, 0x00]),
        (.geoTiff, [0x4d, 0x4d, 0x00, 0x2b]),
        (.pdf, [0x25, 0x50, 0x44, 0x46]),
        (.png, [0x89, 0x50, 0x4e, 0x47]),
        (.jpeg, [0xff, 0xd8, 0xff]),
    ]

    public static func sniff(_ data: Data) -> RasterFileType {
        for (type, magic) in signatures where data.count >= magic.count {
            if Array(data.prefix(magic.count)) == magic { return type }
        }
        return .unknown
    }

    /// The size past which a file is refused before anything tries to read it.
    ///
    /// The same 500 MB the web uses. Not a statement about what this device
    /// can decode — a 200 MB raster with no internal overviews will still
    /// defeat it — only the point past which failing early is kinder than
    /// failing late.
    public static let hardLimitBytes = 500 * 1024 * 1024

    /// The longest edge of the preview that is kept.
    public static let previewMaxDimension = 4096

    /// Above this many pixels in the image actually chosen for decode, a failed
    /// decode is reported as too large rather than as corrupt.
    ///
    /// The preview cap bounds what is *retained*, not the decode peak: with no
    /// overview small enough to cover it, the chosen image's whole pixel grid
    /// still has to be materialised. A perfectly good raster well under the
    /// file-size limit can run a phone out of memory right there, and telling
    /// that user their file is corrupt would be a lie.
    public static let decodeTooLargePixels = 50_000_000

    /// What a raster past the limit is told, wherever the size is noticed.
    ///
    /// One string because the picker now measures the file before it reads it,
    /// and a reader who met two different sentences for the same refusal would
    /// reasonably think two different things had gone wrong.
    public static let tooLargeMessage = """
        This file is over 500 MB. Export a smaller area or a lower \
        resolution and import it again.
        """

    public static func checkFileSize(_ bytes: Int) throws(UserMapImportRefusal) {
        guard bytes <= hardLimitBytes else {
            throw UserMapImportRefusal(code: .tooLarge, userMessage: tooLargeMessage)
        }
    }

    /// The smallest image — the base, or one of its overviews — whose longest
    /// edge still covers the preview target.
    ///
    /// Falls back to the base image when nothing covers it, because upscaling
    /// an overview fabricates detail: the sheet would look sharp and be a
    /// guess. Index 0 is the base image by TIFF convention.
    ///
    /// Nil when there are no images at all. Returning 0 would hand the caller
    /// an index into an empty collection — a trap on the next line, in a
    /// decoder, on somebody's file.
    public static func chooseImage(sizes: [PixelSize], target: Int) -> Int? {
        guard !sizes.isEmpty else { return nil }
        var best = 0
        var bestLongestEdge = Double.infinity
        for (index, size) in sizes.enumerated() {
            let longestEdge = max(size.width, size.height)
            if longestEdge >= Double(target), longestEdge < bestLongestEdge {
                best = index
                bestLongestEdge = longestEdge
            }
        }
        return best
    }

    /// What the retained preview's dimensions should be. Never smaller than a
    /// pixel each way, and never larger than the source: a preview bigger than
    /// its own raster is fabricated detail.
    public static func previewSize(for size: PixelSize) -> PixelSize {
        let longestEdge = max(size.width, size.height)
        guard longestEdge.isFinite, longestEdge > 0,
              size.width.isFinite, size.height.isFinite
        else { return PixelSize(width: 1, height: 1) }
        let scale = min(1, Double(previewMaxDimension) / longestEdge)
        return PixelSize(
            width: max(1, (size.width * scale).rounded()),
            height: max(1, (size.height * scale).rounded())
        )
    }

    /// Whether a failed decode of this image is a too-large or a corrupt file.
    public static func decodeFailure(ofImageSized size: PixelSize) -> UserMapImportRefusal {
        guard size.width.isFinite, size.height.isFinite,
              size.width * size.height > Double(decodeTooLargePixels)
        else {
            return UserMapImportRefusal(
                code: .corruptFile,
                userMessage: "The image in this file could not be decoded."
            )
        }
        return UserMapImportRefusal(
            code: .tooLarge,
            userMessage: """
                This image is too large for this device to decode, even though \
                the file itself is under 500 MB. Add internal overviews (with \
                gdaladdo, for example) or export a smaller or lower-resolution \
                area, then import it again.
                """
        )
    }

    /// The import-time georeferencing gate: the declared system is on the
    /// accepted list, and the four corners of the raster actually land
    /// somewhere.
    ///
    /// Both halves are needed and they fail differently. A system this app does
    /// not know is a fixable export mistake, and saying so lets the user fix
    /// it. A known system paired with a tiepoint outside its domain projects to
    /// numbers that are not places — checked here, at import, because the
    /// alternative is a sheet drawn as triangles stretched across the globe,
    /// which looks like a rendering bug rather than a bad file.
    public static func checkGeoreferencing(
        _ georeference: RasterProjection.EmbeddedGeoreference, pixelSize: PixelSize
    ) throws(UserMapImportRefusal) {
        do {
            try RasterProjection.validate(crs: georeference.crs)
            for (x, y) in [
                (0.0, 0.0), (pixelSize.width, 0.0),
                (0.0, pixelSize.height), (pixelSize.width, pixelSize.height),
            ] {
                _ = try RasterProjection.groundPosition(georeference, x: x, y: y)
            }
        } catch let refusal {
            switch refusal {
            case .unsupportedCoordinateSystem(let crs):
                throw UserMapImportRefusal(
                    code: .unsupportedCrs,
                    userMessage: """
                        This map is in \(crs), which this app cannot place. \
                        Re-export it in NAD83 UTM zone 20 or 21, or in \
                        latitude and longitude.
                        """
                )
            case .invalidGeoreferencing:
                throw UserMapImportRefusal(
                    code: .invalidGeoreferencing,
                    userMessage: """
                        This map says where it belongs, and the numbers do not \
                        land anywhere on the earth. You can still place it by \
                        hand.
                        """
                )
            }
        }
    }

    /// What to do with a file, once its bytes have been read.
    public enum Route: Equatable, Sendable {
        /// Read its tags; it may or may not carry georeferencing.
        case geoTiff
        /// A page to rasterise, and possibly a GeoPDF.
        case pdf
        /// A plain scan, for the georeferencer.
        case image
    }

    /// Content decides the pipeline, never the extension.
    public static func route(_ data: Data) throws(UserMapImportRefusal) -> Route {
        switch sniff(data) {
        case .geoTiff: return .geoTiff
        case .pdf: return .pdf
        case .png, .jpeg: return .image
        case .unknown:
            throw UserMapImportRefusal(
                code: .unsupportedType,
                userMessage: """
                    This is not a map file this app can read. Import a GeoTIFF, \
                    a PDF, a PNG, or a JPEG.
                    """
            )
        }
    }
}
