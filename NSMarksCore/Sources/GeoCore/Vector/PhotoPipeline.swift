import CoreGraphics
import Foundation
import ImageIO

#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

/// The contract's photo processing, identical on both surfaces: decode with
/// the camera's EXIF orientation applied, downscale to a 2048 px long edge,
/// re-encode as JPEG 0.8 with a 256 px 0.7 thumbnail. Re-encoding is also
/// the privacy mechanism — every stored and exported byte stream leaves the
/// EXIF behind, GPS included; the only location that survives is feature
/// geometry the user confirmed.
///
/// ImageIO and CoreGraphics rather than UIKit, so the pipeline runs and
/// tests mac-native like the rest of GeoCore. Mirrors
/// `web/src/userMaps/vector/photos/photoPipeline.ts`.
public enum PhotoPipeline {
    public static let fullLongEdgePx = 2_048
    public static let fullJpegQuality = 0.8
    public static let thumbLongEdgePx = 256
    public static let thumbJpegQuality = 0.7

    public enum Refusal: Error, Equatable {
        /// Over the 50 MB input cap — far past any camera output.
        case tooLarge
        /// The bytes are not an image this device can decode. Distinct from
        /// a storage failure: these pixels cannot be shown.
        case unsupportedImage

        public var userMessage: String {
            switch self {
            case .tooLarge:
                return "This photo is over 50 MB — far past any camera output. It wasn't added."
            case .unsupportedImage:
                return "This photo format can't be read on this device. It wasn't added."
            }
        }
    }

    /// What re-encoding produced: upright pixels, no metadata.
    public struct Processed: Sendable {
        public var fullJpeg: Data
        public var thumbJpeg: Data
        /// Dimensions of the full (2048 px long edge) rendition, matching
        /// what the web writes into the descriptor.
        public var width: Int
        public var height: Int
    }

    public static func process(_ data: Data) throws(Refusal) -> Processed {
        guard data.count <= PhotoDescriptor.maxFileBytes else { throw .tooLarge }
        guard let full = orientedImage(data, longEdgePx: fullLongEdgePx),
              let thumb = orientedImage(data, longEdgePx: thumbLongEdgePx),
              let fullJpeg = jpeg(full, quality: fullJpegQuality),
              let thumbJpeg = jpeg(thumb, quality: thumbJpegQuality)
        else { throw .unsupportedImage }
        return Processed(
            fullJpeg: fullJpeg,
            thumbJpeg: thumbJpeg,
            width: full.width,
            height: full.height
        )
    }

    /// The capture claims the original bytes make about themselves, read
    /// BEFORE re-encoding strips them: EXIF `DateTimeOriginal` (as an ISO
    /// string) and the GPS position. `(0,0)` is treated as absent — it is
    /// the null island a broken writer emits, not a place a camera was.
    public struct CaptureClaims: Sendable {
        public var capturedAt: String?
        public var location: GeoPoint?
    }

    public static func captureClaims(_ data: Data) -> CaptureClaims {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
                as? [CFString: Any]
        else { return CaptureClaims(capturedAt: nil, location: nil) }

        var capturedAt: String?
        if let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any],
           let raw = exif[kCGImagePropertyExifDateTimeOriginal] as? String
        {
            capturedAt = isoFromExif(
                raw,
                offset: exif[kCGImagePropertyExifOffsetTimeOriginal] as? String
            )
        }

        var location: GeoPoint?
        if let gps = properties[kCGImagePropertyGPSDictionary] as? [CFString: Any],
           let latitude = gps[kCGImagePropertyGPSLatitude] as? Double,
           let longitude = gps[kCGImagePropertyGPSLongitude] as? Double
        {
            let latitudeRef = gps[kCGImagePropertyGPSLatitudeRef] as? String ?? "N"
            let longitudeRef = gps[kCGImagePropertyGPSLongitudeRef] as? String ?? "E"
            let lat = latitudeRef == "S" ? -latitude : latitude
            let lng = longitudeRef == "W" ? -longitude : longitude
            if !(lat == 0 && lng == 0), abs(lat) <= 90, abs(lng) <= 180 {
                location = GeoPoint(lat: lat, lng: lng)
            }
        }
        return CaptureClaims(capturedAt: capturedAt, location: location)
    }

    /// EXIF's "yyyy:MM:dd HH:mm:ss", with the offset field when the camera
    /// wrote one and the device's zone when it did not — the same best
    /// available answer the web's exifr path lands on. Nil for text that is
    /// not a date; the claim is never invented.
    static func isoFromExif(_ raw: String, offset: String?) -> String? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy:MM:dd HH:mm:ss"
        if let offset, let zone = zone(fromOffset: offset) {
            formatter.timeZone = zone
        }
        guard let date = formatter.date(from: raw) else { return nil }
        return CaptureTime.iso(date)
    }

    private static func zone(fromOffset offset: String) -> TimeZone? {
        // "+03:00" / "-03:30" — the EXIF OffsetTime format.
        let trimmed = offset.trimmingCharacters(in: .whitespaces)
        guard trimmed.count == 6, trimmed.first == "+" || trimmed.first == "-" else {
            return nil
        }
        let sign = trimmed.first == "-" ? -1 : 1
        let parts = trimmed.dropFirst().split(separator: ":")
        guard parts.count == 2, let hours = Int(parts[0]), let minutes = Int(parts[1])
        else { return nil }
        return TimeZone(secondsFromGMT: sign * (hours * 3_600 + minutes * 60))
    }

    /// The image decoded, EXIF orientation applied, long edge at most
    /// `longEdgePx`. `CGImageSourceCreateThumbnailAtIndex` with the
    /// transform option is ImageIO's own downscale-and-orient path — the
    /// pixels come out upright, so dropping the orientation tag with the
    /// rest of the metadata cannot sideways a photo.
    private static func orientedImage(_ data: Data, longEdgePx: Int) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0
        else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: longEdgePx,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    /// JPEG with no metadata dictionary at all — the strip. Alpha flattens
    /// onto white to match the web's canvas, rather than JPEG's default
    /// black.
    private static func jpeg(_ image: CGImage, quality: Double) -> Data? {
        let flattened = flattenedOntoWhite(image) ?? image
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, jpegTypeIdentifier, 1, nil
        ) else { return nil }
        let options: [CFString: Any] = [
            kCGImageDestinationLossyCompressionQuality: quality
        ]
        CGImageDestinationAddImage(destination, flattened, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }

    private static var jpegTypeIdentifier: CFString {
        #if canImport(UniformTypeIdentifiers)
        return UTType.jpeg.identifier as CFString
        #else
        return "public.jpeg" as CFString
        #endif
    }

    private static func flattenedOntoWhite(_ image: CGImage) -> CGImage? {
        let width = image.width
        let height = image.height
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        ) else { return nil }
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage()
    }
}
