import CoreGraphics
import Foundation
import GeoCore

/// Opens a PDF, draws its first page, and reads whatever registration the page
/// carries.
///
/// The CoreGraphics half of the GeoPDF import. What a registration is allowed
/// to claim lives in `PdfMapRegistration` in GeoCore, where it is tested
/// without a file; what is here is the part that has to touch one — walking
/// CGPDF's object graph into the value model, and turning a page of vectors
/// into pixels a control point can be recorded against.
enum PdfMapReader {
    /// A page, drawn, and what it said about where it sits.
    struct Read {
        var image: CGImage
        /// The rendered raster's size. For a PDF this *is* the original: there
        /// is no larger version of the page to record control points against,
        /// so the render resolution is the map's resolution for good.
        var pixelSize: PixelSize
        /// How many pages the file had. Only the first is drawn, and the panel
        /// says so — an atlas reduced to its cover without a word is a user
        /// concluding the other sheets held nothing.
        var pageCount: Int
        var extraction: PdfMapRegistration.Extraction
    }

    /// How deep into a PDF's object graph this reader will follow.
    ///
    /// CGPDF resolves indirect references on the way out, so a file whose
    /// dictionaries refer to one another in a circle would be followed for
    /// ever. Nothing a registration needs is more than about five levels down,
    /// and a structure deeper than this is read as opaque rather than
    /// traversed — which refuses the file rather than hanging the import.
    static let maxDepth = 12

    static func read(_ data: Data) throws(UserMapImportRefusal) -> Read {
        guard let provider = CGDataProvider(data: data as CFData),
              let document = CGPDFDocument(provider)
        else {
            throw UserMapImportRefusal(
                code: .corruptFile, userMessage: "This file could not be opened as a PDF."
            )
        }
        // An encrypted document that opens with an empty password is one that
        // only restricts printing, and is perfectly readable. One that does not
        // is a file this app cannot decode at all, and saying "corrupt" would
        // send the user looking for damage that is not there.
        if document.isEncrypted, !document.unlockWithPassword("") {
            throw UserMapImportRefusal(
                code: .passwordProtected,
                userMessage: """
                    This PDF is password-protected. Open it in another app, save \
                    an unprotected copy, and import that.
                    """
            )
        }
        guard document.numberOfPages > 0, let page = document.page(at: 1) else {
            throw UserMapImportRefusal(
                code: .emptyFile, userMessage: "This PDF has no pages in it."
            )
        }

        let box = Self.renderedBox(of: page)
        guard box.width.isFinite, box.height.isFinite,
              let scale = PdfMapRegistration.renderScale(
            pageWidth: Double(box.width), pageHeight: Double(box.height)
        ) else {
            throw UserMapImportRefusal(
                code: .corruptFile,
                userMessage: "This PDF's first page does not state a usable size."
            )
        }
        // The rotation the page asks for, so a landscape sheet stored upright
        // comes out the way it is meant to be read — and so the registration's
        // transform describes the same pixels the user is looking at.
        let rotation = ((Int(page.rotationAngle) % 360) + 360) % 360
        let quarterTurned = rotation == 90 || rotation == 270
        let width = Int(
            ((quarterTurned ? box.height : box.width) * CGFloat(scale)).rounded()
        )
        let height = Int(
            ((quarterTurned ? box.width : box.height) * CGFloat(scale)).rounded()
        )
        guard width > 0, height > 0 else {
            throw UserMapImportRefusal(
                code: .corruptFile,
                userMessage: "This PDF's first page does not state a usable size."
            )
        }

        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw UserMapImport.decodeFailure(
                ofImageSized: PixelSize(width: Double(width), height: Double(height))
            )
        }
        // A page is drawn onto whatever is behind it, and a bitmap starts
        // transparent. Left as it is, every unpainted part of the sheet — which
        // on a map is most of it — would arrive as a hole.
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))

        // PDF's y grows upwards and a raster's grows downwards, so the page is
        // drawn into a flipped context.
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)
        let drawing = Self.drawingTransform(
            box: box, scale: CGFloat(scale), rotation: rotation
        )
        context.concatenate(drawing)
        context.drawPDFPage(page)

        guard let image = context.makeImage() else {
            throw UserMapImport.decodeFailure(
                ofImageSized: PixelSize(width: Double(width), height: Double(height))
            )
        }

        // The same two steps the drawing did, composed into one transform in
        // PDF's own `[a b c d e f]` order: the page's drawing transform, then
        // the flip back down into raster rows. A registration read through any
        // other transform describes pixels that are not the ones in the image.
        let viewport = PdfViewportGeometry(
            transform: [
                Double(drawing.a), -Double(drawing.b),
                Double(drawing.c), -Double(drawing.d),
                Double(drawing.tx), Double(height) - Double(drawing.ty),
            ],
            width: Double(width),
            height: Double(height)
        )
        return Read(
            image: image,
            pixelSize: PixelSize(width: Double(width), height: Double(height)),
            pageCount: document.numberOfPages,
            extraction: PdfMapRegistration.candidates(
                page: registrationKeys(of: page.dictionary), viewport: viewport
            )
        )
    }

    /// The two page keys a registration can live under, and nothing else.
    ///
    /// Converting the whole page dictionary would be a much simpler line, and
    /// it walks the document: a page points at its parent, the parent lists
    /// every page as a kid, and each of those points back at the parent. The
    /// depth cap stops that recursing for ever but not from fanning out, so an
    /// eighty-page atlas expands eighty sheets' worth of resources before the
    /// reader has decided whether the file is georeferenced at all. The web
    /// resolves exactly these two roots, for the same reason.
    static func registrationKeys(of page: CGPDFDictionaryRef?) -> [String: PdfValue] {
        guard let page else { return [:] }
        var pairs = [String: PdfValue]()
        for key in ["VP", "LGIDict"] {
            var value: CGPDFObjectRef?
            guard CGPDFDictionaryGetObject(page, key, &value), let value else { continue }
            pairs[key] = object(value, depth: 1)
        }
        return pairs
    }

    /// The part of the page that is actually drawn.
    ///
    /// The crop box, not the media box. A page cropped down to its map frame
    /// displays as the frame in every reader, and the web's renderer sizes its
    /// viewport from the crop box too; sizing from the media box here would put
    /// the sheet's registration in one set of pixels and its image in another,
    /// and drape the map over ground the crop box was drawn to exclude.
    ///
    /// Intersected rather than trusted: a crop box outside the media box is
    /// malformed, and the spec says the media box wins.
    static func renderedBox(of page: CGPDFPage) -> CGRect {
        let media = page.getBoxRect(.mediaBox)
        let crop = page.getBoxRect(.cropBox)
        guard !crop.isEmpty, !crop.isNull, !crop.isInfinite else { return media }
        let clipped = crop.intersection(media)
        return clipped.isEmpty || clipped.isNull ? media : clipped
    }

    /// PDF user space onto the rendered canvas, still y-up.
    ///
    /// Built here rather than taken from `CGPDFPage.getDrawingTransform`, which
    /// fits a page *into* a rectangle and never magnifies: asked to draw a
    /// letter page onto a 4096-pixel canvas it returns a scale of one and a
    /// centring offset, so the sheet comes out at 612 pixels wide in the middle
    /// of a field of white — and every control point lands on ground the sheet
    /// is not covering. Measured: a page whose frame should have spanned 2 876
    /// pixels registered across 556.
    static func drawingTransform(
        box: CGRect, scale: CGFloat, rotation: Int
    ) -> CGAffineTransform {
        // The rotation the page asks for is clockwise on the screen, which is
        // negative in this y-up space. Each turn also moves the page's origin
        // to a different corner of the canvas.
        let placed: CGAffineTransform = switch rotation {
        case 90:
            CGAffineTransform(translationX: 0, y: box.width * scale)
                .rotated(by: -.pi / 2)
        case 180:
            CGAffineTransform(translationX: box.width * scale, y: box.height * scale)
                .rotated(by: .pi)
        case 270:
            CGAffineTransform(translationX: box.height * scale, y: 0)
                .rotated(by: .pi / 2)
        default:
            .identity
        }
        // The media box's own origin is not always zero — a page cropped from a
        // larger sheet carries the offset — so it is subtracted before anything
        // else, in the page's own units.
        return placed.scaledBy(x: scale, y: scale)
            .translatedBy(x: -box.minX, y: -box.minY)
    }

    // MARK: - CGPDF into the value model

    static func dictionary(
        _ source: CGPDFDictionaryRef?, depth: Int
    ) -> [String: PdfValue] {
        guard let source, depth < maxDepth else { return [:] }
        var pairs = [String: PdfValue]()
        CGPDFDictionaryApplyBlock(
            source,
            { key, value, _ in
                pairs[String(cString: key)] = object(value, depth: depth + 1)
                return true
            },
            nil
        )
        return pairs
    }

    static func object(_ value: CGPDFObjectRef, depth: Int) -> PdfValue {
        guard depth < maxDepth else { return .opaque }
        switch CGPDFObjectGetType(value) {
        case .integer:
            var number: CGPDFInteger = 0
            guard CGPDFObjectGetValue(value, .integer, &number) else { return .opaque }
            return .number(Double(number))
        case .real:
            var number: CGPDFReal = 0
            guard CGPDFObjectGetValue(value, .real, &number) else { return .opaque }
            return .number(Double(number))
        case .name:
            var name: UnsafePointer<CChar>?
            guard CGPDFObjectGetValue(value, .name, &name), let name else {
                return .opaque
            }
            return .name(String(cString: name))
        case .string:
            var string: CGPDFStringRef?
            guard CGPDFObjectGetValue(value, .string, &string), let string,
                  let text = CGPDFStringCopyTextString(string)
            else { return .opaque }
            return .text(text as String)
        case .array:
            var array: CGPDFArrayRef?
            guard CGPDFObjectGetValue(value, .array, &array), let array else {
                return .opaque
            }
            var items = [PdfValue]()
            for index in 0..<CGPDFArrayGetCount(array) {
                var element: CGPDFObjectRef?
                guard CGPDFArrayGetObject(array, index, &element), let element else {
                    items.append(.opaque)
                    continue
                }
                items.append(object(element, depth: depth + 1))
            }
            return .array(items)
        case .dictionary:
            var nested: CGPDFDictionaryRef?
            guard CGPDFObjectGetValue(value, .dictionary, &nested) else { return .opaque }
            return .dictionary(dictionary(nested, depth: depth))
        default:
            // Booleans, nulls and streams. None of them can be part of a
            // registration, and none of them is a reason to refuse a file.
            return .opaque
        }
    }
}
