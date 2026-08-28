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
/// `nonisolated`: the decode below can materialise a whole pixel grid for a
/// raster with no small-enough overview — hundreds of MB and whole seconds for
/// a provincial sheet — and under MainActor-default isolation an unmarked enum
/// pinned all of it to the main thread. The importer takes `Data` and returns
/// values; nothing here touches shared state.
nonisolated enum UserMapImporter {
    /// A file, read and placed as far as it can be.
    struct Imported {
        var record: UserMapRecord
        var preview: CGImage
        /// True when the file said nothing about where it belongs, so the user
        /// has to place it. Not an error.
        var needsGeoreferencing: Bool
        /// Why the file's own georeferencing was not used, when it carried some
        /// this app could not read. Nil when it placed itself, and nil when it
        /// never claimed to.
        ///
        /// The map still comes in. The remedy differs from a plain scan's —
        /// re-exporting in a system this app reads gets the placement back
        /// automatically — so the reason is carried out to be said, rather than
        /// the file being turned away with it.
        ///
        /// The PDF path leaves this nil: a page whose registration could not be
        /// used says so in the record's own note, which the row keeps after a
        /// relaunch.
        var unreadGeoreferencing: String? = nil
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

        var placement: UserMapRecord.Placement?
        var unreadGeoreferencing: String?
        switch route {
        case .geoTiff:
            do {
                placement = try embeddedPlacement(in: data)
            } catch let refusal where refusal.code == .unsupportedCrs {
                // A file that named its system in prose rather than in a code
                // is read no further, but it is still kept: the tags are what
                // could not be read, not the picture. Everything else the tag
                // parser refuses — a truncated file, a BigTIFF with impossible
                // offsets — is a file whose pixels are in doubt too, and those
                // still turn the import away.
                unreadGeoreferencing = refusal.userMessage
                placement = nil
            }
        case .image, .pdf:
            placement = nil
        }

        // A file that placed itself is decoded in its own raster's row order;
        // one the user will place by hand is decoded the way up it asks to be
        // read. See `decodePreview`.
        let (preview, pixelSize) = try decodePreview(
            data, honouringOrientation: placement == nil
        )
        // A georeference this app cannot use is not a reason to refuse the
        // file, for the same reason the PDF path does not refuse one: the sheet
        // is a perfectly good map either way, and hand placement is what the
        // georeferencer is for. Refusing also made the advice these messages
        // give — place it by hand — impossible to follow.
        //
        // What is dropped is the file's claim about where its pixels belong.
        // Nothing is guessed from a system nobody verified this app against,
        // and nothing is drawn from numbers that land off the earth.
        //
        // The preview keeps the row order the raster was written in rather than
        // being decoded again the way up an orientation tag asks for. The
        // reader places these by matching what they can see against the map,
        // and a second full decode of a large sheet is a real cost on a phone
        // for a tag a GeoTIFF almost never carries.
        if let current = placement, case .embedded(let georeference) = current {
            do {
                try UserMapImport.checkGeoreferencing(georeference, pixelSize: pixelSize)
            } catch let refusal {
                unreadGeoreferencing = refusal.userMessage
                placement = nil
            }
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
            needsGeoreferencing: placement == nil,
            unreadGeoreferencing: unreadGeoreferencing
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
        let registration: PdfImportMetadata.Registration
        let placement: UserMapRecord.Placement
        let sourceRect: PixelRect?

        // A registration this app will not use is not a reason to refuse the
        // file. The page is a perfectly good map either way, and hand placement
        // is exactly what the georeferencer is for — so every one of these
        // imports, and the record says which it was. Refusing here would also
        // have made the old advice ("import it and place it by hand")
        // impossible to follow on the very path that gave it.
        switch PdfMapRegistration.selection(of: read.extraction) {
        case .automatic(let candidate):
            registration = .embedded(
                PdfImportMetadata.Embedded(
                    flavour: candidate.flavour,
                    // Sole, not chosen: the page offered one frame, so nobody
                    // decided anything. The distinction prints in the row, and
                    // "chosen by you" on a page the user never saw a choice for
                    // would be the app putting words in their mouth.
                    selection: .sole,
                    frameID: candidate.id,
                    label: candidate.label,
                    candidates: read.extraction.candidates
                )
            )
            // The registration's own frame, so a map sheet inside a page of
            // margins and title blocks drapes only the sheet. Drawing the whole
            // page would put the legend box on the ground.
            sourceRect = candidate.sourceRect
            placement = .controlPoints(
                controlPoints(of: candidate),
                // Affine, not a spline: these points come from a rectangle's
                // corners, and a spline through four corners has nothing to
                // bend towards.
                method: .affine
            )
        case .selectionRequired(let candidates):
            // Several frames on one page — a county sheet with three insets,
            // each honestly registered to different ground. Choosing for the
            // user would drape one of them over the others' territory, so
            // nothing is drawn until they say which sheet they meant.
            registration = .selectionRequired(candidates)
            sourceRect = nil
            placement = .controlPoints([], method: .affine)
        case .manual(let reason):
            registration = .manual(reason: reason, adjusted: false)
            sourceRect = nil
            placement = .controlPoints([], method: .affine)
        }

        return Imported(
            record: UserMapRecord(
                id: id,
                name: name,
                pixelSize: read.pixelSize,
                sourceRect: sourceRect,
                placement: placement,
                pdf: PdfImportMetadata(
                    pageCount: read.pageCount, registration: registration
                )
            ),
            preview: read.image,
            needsGeoreferencing: sourceRect == nil
        )
    }

    /// A frame's ground control points, as the record stores them.
    static func controlPoints(
        of candidate: PdfMapRegistration.Candidate
    ) -> [SessionControlPoint] {
        candidate.gcps.enumerated().map { index, gcp in
            SessionControlPoint(
                id: "\(candidate.id)-\(index + 1)", pixel: gcp.pixel, map: gcp.map
            )
        }
    }

    /// The placement a GeoTIFF carries, or nil when it carries none.
    ///
    /// A TIFF with no geo tags is an ordinary scan and goes to the
    /// georeferencer. A TIFF whose tags name a system this app cannot read
    /// throws `unsupportedCrs`, which the caller catches: the file is kept and
    /// placed by hand, and the reader is told what went unread rather than
    /// having it guessed at.
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
                        This BigTIFF gives the width of its own offsets as \
                        something other than eight bytes, which no version of \
                        the format defines. Re-export it.
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
                        app cannot look up. It is in your library, ready to \
                        place by hand. To have it place itself, re-export it in \
                        NAD83 UTM zone 20 or 21, or in latitude and longitude.
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
    ///
    /// `honouringOrientation` decides what a TIFF's or JPEG's Orientation tag
    /// is allowed to do. A photograph of a paper map arrives sideways with a
    /// tag saying so, and turning it upright is the only way the user can work
    /// with it — but a *georeferenced* file's geotransform is written in its
    /// raster's own rows and columns, and knows nothing of that tag. Rotate
    /// those pixels and the sheet is drawn quarter-turned over ground it does
    /// describe correctly, with every number in the file still checking out.
    /// So: the user's own placement gets the upright picture, and a file that
    /// placed itself is decoded exactly as it was written.
    private static func decodePreview(
        _ data: Data, honouringOrientation: Bool
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
            // ImageIO reporting no size for a TIFF is not a corrupt file. It
            // is the tiled-and-predicted layout it will not unpack, which is
            // what a Cloud-Optimized GeoTIFF is and what the browser reads
            // without trouble. Decoded from the tags instead.
            if let bitmap = try tiffFallback(data) { return bitmap }
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
            kCGImageSourceCreateThumbnailWithTransform: honouringOrientation,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: UserMapImport.previewMaxDimension,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(
            source, chosen, options as CFDictionary
        ) else {
            if let bitmap = try tiffFallback(data) { return bitmap }
            throw UserMapImport.decodeFailure(ofImageSized: sizes[chosen])
        }
        // `kCGImagePropertyPixelWidth` is the stored raster's width, before any
        // orientation is applied. When the pixels have been turned a quarter
        // turn the original's dimensions have turned with them, and a record
        // keeping the stored pair would scale every control point the user
        // places through a size the picture does not have.
        //
        // Measured off the thumbnail rather than read from an Orientation tag,
        // because a TIFF carries one tag per image and the overview chosen here
        // is often not the image the tag is on. Reading index 0's tag while
        // decoding index 2's pixels swaps the recorded size for a picture that
        // was never turned.
        //
        // Compared against the *primary*, which is the image whose size is
        // being corrected, and not against the overview that happened to be
        // decoded. An overview is a scaled copy of the primary, so the upright
        // thumbnail's shape is the primary's upright shape; comparing it with
        // the overview's own stored pair instead answers a question about the
        // overview and applies it to the primary. A multi-image TIFF whose
        // 4000×2000 primary is tagged sideways and whose 1000×2000 overview is
        // stored already upright reads as "not turned" that way, and every
        // control point the user places is then scaled through swapped axes.
        let quarterTurned = Self.isQuarterTurn(decoded: image, stored: base)
        let size = quarterTurned
            ? PixelSize(width: base.height, height: base.width) : base
        return (image, size)
    }

    /// The pixels of a TIFF that Image I/O would not open, read from its own
    /// tags.
    ///
    /// Tried on failure rather than chosen in advance. Which layouts Image I/O
    /// refuses is Apple's to change, and a check that predicts it would start
    /// taking files away from a decoder that had learned to read them.
    ///
    /// Returns nil when the file is not a TIFF at all, or is one whose tags
    /// say nothing about where its pixels are, so the caller's own refusal
    /// stands. A file this decoder understands and rejects throws instead,
    /// because that refusal names a reason and the caller's does not.
    ///
    /// No orientation is applied. A tag saying which way up a picture goes
    /// belongs to a photograph, and this path exists for GIS output, which
    /// states its rows and columns in its geotransform.
    private static func tiffFallback(
        _ data: Data
    ) throws(UserMapImportRefusal) -> (CGImage, PixelSize)? {
        let layout: GeoTiffTags.RasterLayout?
        do {
            layout = try GeoTiffTags.layout(data)
        } catch {
            return nil
        }
        guard let layout else { return nil }
        let bitmap = try TiffRaster.decode(
            data, layout: layout, maxDimension: UserMapImport.previewMaxDimension
        )
        guard let image = cgImage(from: bitmap) else {
            throw UserMapImportRefusal(
                code: .corruptFile,
                userMessage: "The image in this file could not be decoded."
            )
        }
        return (image, layout.pixelSize)
    }

    private static func cgImage(from bitmap: TiffRaster.Bitmap) -> CGImage? {
        guard bitmap.width > 0, bitmap.height > 0,
              let provider = CGDataProvider(data: Data(bitmap.rgba) as CFData)
        else { return nil }
        return CGImage(
            width: bitmap.width,
            height: bitmap.height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: bitmap.width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
        )
    }

    /// Whether decoding exchanged the image's axes.
    ///
    /// Both readings are compared rather than one being tested, because a
    /// thumbnail is scaled and its aspect never matches the stored one exactly.
    /// The question is only which of the two possible aspects it is nearer.
    private static func isQuarterTurn(decoded: CGImage, stored: PixelSize) -> Bool {
        guard stored.width > 0, stored.height > 0, decoded.height > 0 else { return false }
        let thumbnail = Double(decoded.width) / Double(decoded.height)
        let upright = stored.width / stored.height
        // A square image looks the same either way, and its two candidate
        // aspects are the same number: the comparison below would be decided by
        // whichever way a thumbnail's rounding happened to fall. Said not
        // turned, which is what a square picture is.
        guard abs(upright - 1 / upright) > 0.01 else { return false }
        return abs(thumbnail - upright) > abs(thumbnail - 1 / upright)
    }
}
