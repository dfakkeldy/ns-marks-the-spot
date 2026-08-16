import CoreGraphics
import Foundation
import GeoCore
import ImageIO

/// Turns a file the user chose into a record and a preview.
///
/// The decisions — which files are accepted, which image inside one is
/// decoded, how big the preview may be, what the user is told when the answer
/// is no — are all `UserMapImport` in GeoCore, where they are tested without a
/// device. What is here is Image I/O: the part that has to touch the file.
enum UserMapImporter {
    /// A file, read and placed as far as it can be.
    struct Imported {
        var record: UserMapRecord
        var preview: CGImage
        /// True when the file said nothing about where it belongs, so the user
        /// has to place it. Not an error, and not the same as georeferencing
        /// that was present and refused — that is a refusal, with its own
        /// message, because the remedies differ.
        var needsGeoreferencing: Bool
    }

    /// Reads a file into a record. `id` and `name` are the caller's: the store
    /// owns identity, and the name is the user's to change afterwards.
    static func `import`(
        data: Data, id: String, name: String
    ) throws(UserMapImportRefusal) -> Imported {
        try UserMapImport.checkFileSize(data.count)
        let route = try UserMapImport.route(data)

        // A PDF is its own pipeline: Image I/O cannot open one, the page has to
        // be drawn before it has pixels at all, and its registration is a
        // different parser from a GeoTIFF's tags.
        if route == .pdf { return try importPdf(data: data, id: id, name: name) }

        let placement: UserMapRecord.Placement?
        switch route {
        case .geoTiff:
            placement = try embeddedPlacement(in: data)
        case .image, .pdf:
            placement = nil
        }

        let (preview, pixelSize) = try decodePreview(data)
        if let placement, case .embedded(let georeference) = placement {
            try UserMapImport.checkGeoreferencing(georeference, pixelSize: pixelSize)
        }

        return Imported(
            record: UserMapRecord(
                id: id, name: name, pixelSize: pixelSize,
                // A placement the file did not supply starts as an empty
                // control-point list rather than as a placeholder transform.
                // `mesh` is nil for it, which is what stops the sheet being
                // drawn somewhere arbitrary while the user places it.
                placement: placement ?? .controlPoints([], method: .affine)
            ),
            preview: preview,
            needsGeoreferencing: placement == nil
        )
    }

    /// A PDF page, drawn and placed.
    ///
    /// Separate from the raster path because almost nothing is shared: the page
    /// is rendered rather than decoded, the rendered size *is* the original
    /// size, and the registration comes from the page's own dictionaries rather
    /// than from image tags. The preview is the render — there is no bigger
    /// version of a page to keep, and the control points are already in these
    /// pixels.
    private static func importPdf(
        data: Data, id: String, name: String
    ) throws(UserMapImportRefusal) -> Imported {
        let read = try PdfMapReader.read(data)
        switch PdfMapRegistration.outcome(of: read.extraction) {
        case .placed(let candidate, _):
            return Imported(
                record: UserMapRecord(
                    id: id,
                    name: name,
                    pixelSize: read.pixelSize,
                    // The registration's own frame, so a map sheet inside a page
                    // of margins and title blocks drapes only the sheet. Drawing
                    // the whole page would put the legend box on the ground.
                    sourceRect: candidate.sourceRect,
                    placement: .controlPoints(
                        candidate.gcps.enumerated().map { index, gcp in
                            SessionControlPoint(
                                id: "\(candidate.id)-\(index + 1)",
                                pixel: gcp.pixel,
                                map: gcp.map
                            )
                        },
                        // Affine, not a spline: these points come from a
                        // rectangle's corners, and a spline through four
                        // corners has nothing to bend towards.
                        method: .affine
                    )
                ),
                preview: read.image,
                needsGeoreferencing: false
            )
        case .unregistered:
            return Imported(
                record: UserMapRecord(
                    id: id, name: name, pixelSize: read.pixelSize,
                    placement: .controlPoints([], method: .affine)
                ),
                preview: read.image,
                needsGeoreferencing: true
            )
        case .refused(let reason):
            throw refusal(for: reason)
        }
    }

    /// What to tell the user about a registration this app would not use.
    ///
    /// Each of these has a different remedy, which is why they are not one
    /// message: an unsupported system is re-exported, a broken one is fixed at
    /// the source, and a structure this reader does not model is placed by hand.
    private static func refusal(
        for reason: PdfMapRegistration.Rejection
    ) -> UserMapImportRefusal {
        switch reason {
        case .unsupportedCrs:
            UserMapImportRefusal(
                code: .unsupportedCrs,
                userMessage: """
                    This PDF is georeferenced in a coordinate system this app \
                    cannot place. Re-export it in NAD83 UTM zone 20 or 21, or in \
                    latitude and longitude.
                    """
            )
        case .invalid:
            UserMapImportRefusal(
                code: .invalidGeoreferencing,
                userMessage: """
                    This PDF carries georeferencing whose numbers do not place \
                    the page anywhere on the earth. Re-export it from whatever \
                    made it.
                    """
            )
        case .unsupported, .unreadable:
            UserMapImportRefusal(
                code: .unsupportedType,
                userMessage: """
                    This PDF's georeferencing is in a form this app does not \
                    read. Export the page as a GeoTIFF, or import it and place \
                    it by hand.
                    """
            )
        }
    }

    /// The placement a GeoTIFF carries, or nil when it carries none.
    ///
    /// A TIFF with no geo tags is an ordinary scan and goes to the
    /// georeferencer. A TIFF this cannot read at all — BigTIFF, or truncated —
    /// is refused, because its pixels may still decode and placing them by
    /// hand while the file's own answer went unread is worse than saying so.
    private static func embeddedPlacement(
        in data: Data
    ) throws(UserMapImportRefusal) -> UserMapRecord.Placement? {
        let metadata: GeoTiffTags.Metadata
        do {
            metadata = try GeoTiffTags.parse(data)
        } catch {
            switch error {
            case .bigTiff:
                throw UserMapImportRefusal(
                    code: .unsupportedType,
                    userMessage: """
                        This is a BigTIFF, which this app cannot read. \
                        Re-export it as an ordinary GeoTIFF.
                        """
                )
            case .notATiff, .truncated:
                throw UserMapImportRefusal(
                    code: .corruptFile,
                    userMessage: "This TIFF stops before the end of its own contents."
                )
            }
        }
        guard let georeference = metadata.georeference else {
            // A file that named its system in prose rather than in a code is
            // reported as an unsupported system, quoting what it said, rather
            // than being quietly demoted to a plain scan: the user can then
            // re-export it with a code.
            if let citation = metadata.citation, metadata.geotransform != nil {
                throw UserMapImportRefusal(
                    code: .unsupportedCrs,
                    userMessage: """
                        This map describes its coordinate system as \
                        "\(citation)" rather than by an EPSG code, which this \
                        app cannot look up. Re-export it in NAD83 UTM zone 20 \
                        or 21, or place it by hand.
                        """
                )
            }
            return nil
        }
        return .embedded(georeference)
    }

    /// Decodes a preview, and reports the size of the *original* raster.
    ///
    /// The size matters more than it looks: control points are recorded in the
    /// original's pixels, so a record carrying a preview's dimensions would
    /// misplace every point on any sheet large enough to have been downscaled
    /// — and the arithmetic would look healthy the whole way through.
    private static func decodePreview(
        _ data: Data
    ) throws(UserMapImportRefusal) -> (CGImage, PixelSize) {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0
        else {
            throw UserMapImportRefusal(
                code: .corruptFile, userMessage: "This file could not be opened as an image."
            )
        }

        let sizes = (0..<CGImageSourceGetCount(source)).map { index -> PixelSize in
            let properties = CGImageSourceCopyPropertiesAtIndex(
                source, index, nil
            ) as? [CFString: Any]
            return PixelSize(
                width: properties?[kCGImagePropertyPixelWidth] as? Double ?? 0,
                height: properties?[kCGImagePropertyPixelHeight] as? Double ?? 0
            )
        }
        guard let base = sizes.first, base.width > 0, base.height > 0 else {
            throw UserMapImportRefusal(
                code: .corruptFile, userMessage: "This image does not state its own size."
            )
        }
        guard let chosen = UserMapImport.chooseImage(
            sizes: sizes, target: UserMapImport.previewMaxDimension
        ) else {
            throw UserMapImportRefusal(
                code: .corruptFile, userMessage: "This file holds no images."
            )
        }

        // `CreateThumbnail` rather than a full decode followed by a resize: it
        // is what lets a raster larger than this device's memory produce a
        // preview at all, because the full-size bitmap is never materialised.
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: UserMapImport.previewMaxDimension,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(
            source, chosen, options as CFDictionary
        ) else {
            throw UserMapImport.decodeFailure(ofImageSized: sizes[chosen])
        }
        return (image, base)
    }
}
