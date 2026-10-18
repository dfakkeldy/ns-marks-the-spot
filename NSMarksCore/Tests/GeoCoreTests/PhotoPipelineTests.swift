import CoreGraphics
import Foundation
import ImageIO
import Testing

#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

@testable import GeoCore

@Suite("The photo pipeline")
struct PhotoPipelineTests {
    /// A JPEG built in-test with EXIF (capture time and GPS) and a chosen
    /// pixel size — the pipeline's input, with the metadata the pipeline
    /// exists to strip.
    private func jpeg(
        width: Int,
        height: Int,
        orientation: Int? = nil,
        gps: (lat: Double, lng: Double)? = nil,
        dateTimeOriginal: String? = nil
    ) throws -> Data {
        let context = try #require(
            CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            )
        )
        context.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.3, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try #require(context.makeImage())

        var properties: [CFString: Any] = [:]
        if let orientation {
            properties[kCGImagePropertyOrientation] = orientation
        }
        if let gps {
            properties[kCGImagePropertyGPSDictionary] = [
                kCGImagePropertyGPSLatitude: abs(gps.lat),
                kCGImagePropertyGPSLatitudeRef: gps.lat < 0 ? "S" : "N",
                kCGImagePropertyGPSLongitude: abs(gps.lng),
                kCGImagePropertyGPSLongitudeRef: gps.lng < 0 ? "W" : "E",
            ] as [CFString: Any]
        }
        if let dateTimeOriginal {
            properties[kCGImagePropertyExifDictionary] = [
                kCGImagePropertyExifDateTimeOriginal: dateTimeOriginal
            ] as [CFString: Any]
        }

        let output = NSMutableData()
        let destination = try #require(
            CGImageDestinationCreateWithData(
                output, UTType.jpeg.identifier as CFString, 1, nil
            )
        )
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        #expect(CGImageDestinationFinalize(destination))
        return output as Data
    }

    private func properties(of data: Data) -> [CFString: Any] {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
                as? [CFString: Any]
        else { return [:] }
        return properties
    }

    @Test func aLargePhotoDownscalesToTheContractEdges() throws {
        let input = try jpeg(width: 4_000, height: 3_000)
        let processed = try PhotoPipeline.process(input)
        // Long edge 2048, aspect preserved.
        #expect(processed.width == 2_048)
        #expect(processed.height == 1_536)
        let thumbProperties = properties(of: processed.thumbJpeg)
        #expect(thumbProperties[kCGImagePropertyPixelWidth] as? Int == 256)
    }

    @Test func aSmallPhotoIsNeverUpscaled() throws {
        let input = try jpeg(width: 800, height: 600)
        let processed = try PhotoPipeline.process(input)
        #expect(processed.width == 800)
        #expect(processed.height == 600)
    }

    /// The privacy mechanism: re-encoding leaves ALL EXIF behind, GPS
    /// included, in both renditions.
    @Test func reencodingStripsExifIncludingGps() throws {
        let input = try jpeg(
            width: 400, height: 300,
            gps: (lat: 44.6, lng: -63.5),
            dateTimeOriginal: "2026:08:29 14:00:00"
        )
        // The claims are there before processing…
        let claims = PhotoPipeline.captureClaims(input)
        #expect(claims.location != nil)
        #expect(claims.capturedAt != nil)

        let processed = try PhotoPipeline.process(input)
        for rendition in [processed.fullJpeg, processed.thumbJpeg] {
            let stripped = properties(of: rendition)
            #expect(stripped[kCGImagePropertyGPSDictionary] == nil)
            let exif = stripped[kCGImagePropertyExifDictionary] as? [CFString: Any]
            #expect(exif?[kCGImagePropertyExifDateTimeOriginal] == nil)
        }
    }

    @Test func exifOrientationIsAppliedToThePixels() throws {
        // Orientation 6 (90° CW): a landscape file that displays portrait.
        let input = try jpeg(width: 400, height: 200, orientation: 6)
        let processed = try PhotoPipeline.process(input)
        #expect(processed.width == 200)
        #expect(processed.height == 400)
        // And the output carries no orientation tag to double-apply.
        let orientation = properties(of: processed.fullJpeg)[kCGImagePropertyOrientation]
        #expect(orientation == nil || (orientation as? Int) == 1)
    }

    @Test func theInputCapRefusesBeforeDecoding() {
        let oversized = Data(count: PhotoDescriptor.maxFileBytes + 1)
        #expect(throws: PhotoPipeline.Refusal.tooLarge) {
            try PhotoPipeline.process(oversized)
        }
        #expect(PhotoPipeline.Refusal.tooLarge.userMessage.contains("50 MB"))
    }

    @Test func nonImageBytesAreTheDistinctUnsupportedState() {
        #expect(throws: PhotoPipeline.Refusal.unsupportedImage) {
            try PhotoPipeline.process(Data("not an image".utf8))
        }
    }

    @Test func captureClaimsTreatNullIslandAsAbsent() throws {
        let input = try jpeg(width: 10, height: 10, gps: (lat: 0, lng: 0))
        #expect(PhotoPipeline.captureClaims(input).location == nil)
    }

    @Test func exifDatesConvertToIso() {
        // With an explicit offset the moment is fully determined.
        let iso = PhotoPipeline.isoFromExif("2026:08:29 14:00:00", offset: "-03:00")
        #expect(iso == "2026-08-29T17:00:00.000Z")
        #expect(PhotoPipeline.isoFromExif("not a date", offset: nil) == nil)
    }

}
