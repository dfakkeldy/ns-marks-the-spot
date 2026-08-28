import Foundation
import GeoCore

/// Lays out and writes one exported map page.
///
/// Ported from `web/src/print/pdf/pdfComposer.ts`. The layout numbers, the
/// wrapping rules, and the order the blocks are drawn in all match, because a
/// page printed from the phone and one printed from the browser are meant to
/// be comparable side by side.
public enum PdfComposer {
    public struct Fields: Hashable, Sendable {
        public var title: String
        public var subtitle: String
        public var notes: String

        public init(title: String, subtitle: String = "", notes: String = "") {
            self.title = title
            self.subtitle = subtitle
            self.notes = notes
        }
    }

    public struct LegendEntry: Hashable, Sendable {
        public var name: String
        /// `#rrggbb`, or nil for a layer the map draws with something a
        /// printed square cannot stand in for.
        public var swatchColour: String?

        public init(name: String, swatchColour: String?) {
            self.name = name
            self.swatchColour = swatchColour
        }
    }

    public struct MapImage: Sendable {
        public var jpegBytes: Data
        public var widthPx: Int
        public var heightPx: Int

        public init(jpegBytes: Data, widthPx: Int, heightPx: Int) {
            self.jpegBytes = jpegBytes
            self.widthPx = widthPx
            self.heightPx = heightPx
        }
    }

    public struct Input: Sendable {
        public var template: PdfTemplate
        public var bounds: GeoBoundingBox
        public var mapImage: MapImage
        public var fields: Fields
        /// Nil draws no legend box. The attribution strip always draws.
        public var legend: [LegendEntry]?
        /// Statements the page must carry however crowded it gets: what was on
        /// the screen and is not on the paper, and why.
        ///
        /// They ride in the attribution strip rather than in `fields.notes`
        /// because the strip is the only region with a guarantee. Notes share
        /// the title block's bottom bound, so a long enough title or subtitle
        /// leaves them no room at all and they are simply not drawn — which for
        /// a licence credit would be a breach and for a disclosure is a page
        /// that quietly stops saying a layer is missing. The strip instead
        /// steps its caption size down until the text fits, and ellipsizes
        /// visibly only when even the floor cannot hold it.
        ///
        /// Drawn ahead of the credits, so what the reader must not conclude
        /// comes before who is owed a mention.
        public var disclosures: [String]
        public var attributionLines: [String]
        public var scaleBar: PrintScaleBar
        /// The QR code as its modules, row by row from the top, `true` for a
        /// dark one. Nil draws nothing.
        ///
        /// A grid rather than an image, for two reasons. It draws as filled
        /// rectangles, so the code is vector and stays sharp at any print size
        /// rather than being resampled from a bitmap. And the encoder that made
        /// it is a platform framework, which keeps this composer testable
        /// without one. Nil is the ordinary case for a page with nowhere to
        /// point at: the QR is a courtesy, never an export blocker.
        /// The same address the QR code carries, printed as text. Nil where
        /// there is no link to give.
        public var shareURLText: String?
        public var qrModules: [[Bool]]?
        /// The evidence appendix, as pages after the map. Empty is a map on its
        /// own, which is what the field sheet is.
        ///
        /// The appendix is text and carries no registration: only the map page
        /// says where it is on the ground, and a reader's GIS tool must not be
        /// able to pick up a page of sentences as if it were georeferenced.
        public var appendix: [PdfAppendix.Block]
        /// What the appendix pages must not be read as, printed in the footer
        /// of each one.
        ///
        /// Repeated rather than stated once, because these pages are separated
        /// from the map and from each other: filed, photocopied, quoted. A
        /// caveat that lives on page one does not travel with page four.
        public var appendixCaveat: String
        public var generatedAt: Date

        public init(
            template: PdfTemplate,
            bounds: GeoBoundingBox,
            mapImage: MapImage,
            fields: Fields,
            legend: [LegendEntry]?,
            disclosures: [String] = [],
            attributionLines: [String],
            scaleBar: PrintScaleBar,
            shareURLText: String? = nil,
            qrModules: [[Bool]]? = nil,
            appendix: [PdfAppendix.Block] = [],
            appendixCaveat: String = "",
            generatedAt: Date
        ) {
            self.template = template
            self.bounds = bounds
            self.mapImage = mapImage
            self.fields = fields
            self.legend = legend
            self.disclosures = disclosures
            self.attributionLines = attributionLines
            self.scaleBar = scaleBar
            self.shareURLText = shareURLText
            self.qrModules = qrModules
            self.appendix = appendix
            self.appendixCaveat = appendixCaveat
            self.generatedAt = generatedAt
        }
    }

    static let ink = PdfColor(0.12, 0.13, 0.15)
    static let muted = PdfColor(0.42, 0.44, 0.48)
    static let rule = PdfColor(0.78, 0.8, 0.83)
    static let chip = PdfColor(0.85, 0.86, 0.88)

    /// Baseline-to-baseline padding added to the caption size in the strip.
    static let captionLeading = 2.0

    /// The smallest caption the attribution strip will shrink to. Below about
    /// 5pt the strip stops being readable on paper, and at that point saying
    /// the text was cut is more honest than printing something nobody can
    /// read.
    static let minimumCaptionSize = 5.0

    // MARK: - Text fitting

    /// Greedy word wrap, measured with the font's real metrics.
    ///
    /// A word wider than the whole line is broken across lines rather than
    /// started anyway. Nothing in ordinary prose is that long; the things that
    /// are — a receipt URL carrying every layer id, an ArcGIS service address
    /// in a credit — are exactly the strings a reader needs whole, and a line
    /// that runs off the right edge of the paper takes the tail of one with it
    /// silently.
    static func wrap(_ text: String, font: PdfFont, size: Double, maxWidth: Double) -> [String] {
        var lines = [String]()
        var line = ""
        for word in text.split(whereSeparator: \.isWhitespace) {
            let candidate = line.isEmpty ? String(word) : "\(line) \(word)"
            if font.width(of: candidate, size: size) <= maxWidth {
                line = candidate
                continue
            }
            if !line.isEmpty {
                lines.append(line)
                line = ""
            }
            var remainder = Substring(word)
            while font.width(of: String(remainder), size: size) > maxWidth {
                var head = remainder
                while head.count > 1, font.width(of: String(head), size: size) > maxWidth {
                    head = head.dropLast()
                }
                lines.append(String(head))
                remainder = remainder.dropFirst(head.count)
                // A single character wider than the line would loop forever;
                // it has already been emitted on its own line above.
                if head.count == 1, font.width(of: String(head), size: size) > maxWidth { break }
            }
            line = String(remainder)
        }
        if !line.isEmpty { lines.append(line) }
        return lines
    }

    /// Trims until an ellipsis fits, so a line the block's edge cuts off says
    /// so rather than silently vanishing.
    static func ellipsized(
        _ line: String, font: PdfFont, size: Double, maxWidth: Double
    ) -> String {
        var candidate = line
        while !candidate.isEmpty, font.width(of: "\(candidate)…", size: size) > maxWidth {
            candidate.removeLast()
        }
        while candidate.last?.isWhitespace == true { candidate.removeLast() }
        return "\(candidate)…"
    }

    /// Fits the attribution INTO the strip rather than cutting it to length.
    ///
    /// The strip carries a licence obligation: source names, licence names and
    /// URLs, and the capture stamp. Wrapping at the template size and slicing
    /// to the lines that fit dropped whatever did not — with the default layer
    /// set, the later Province layers and the `Generated …` stamp, gone with no
    /// ellipsis and no notice. Silently cutting an attribution is worse than
    /// having none.
    ///
    /// So the caption size steps down until the wrapped text fits the strip's
    /// real height. Only if even the floor cannot hold it does the last visible
    /// line get ellipsized — visible truncation, never silent.
    static func fitAttribution(
        _ text: String, font: PdfFont, strip: PdfRect, preferredSize: Double
    ) -> (size: Double, lines: [String]) {
        var size = preferredSize
        while size >= minimumCaptionSize {
            let lines = wrap(text, font: font, size: size, maxWidth: strip.width)
            if Double(lines.count) * (size + captionLeading) <= strip.height {
                return (size, lines)
            }
            size -= 0.5
        }
        // The floor is re-wrapped rather than reused from the loop, because a
        // half-point step from a 7.2pt caption never lands exactly on the
        // floor: 7.2, 6.7, … 5.2, and then out.
        let floorSize = minimumCaptionSize
        let lines = wrap(text, font: font, size: floorSize, maxWidth: strip.width)
        let maxLines = max(1, Int(strip.height / (floorSize + captionLeading)))
        if lines.count <= maxLines { return (floorSize, lines) }
        var visible = Array(lines.prefix(maxLines))
        visible[maxLines - 1] = ellipsized(
            visible[maxLines - 1], font: font, size: floorSize, maxWidth: strip.width
        )
        return (floorSize, visible)
    }

    /// Draws pre-wrapped lines top-down from `startY`, stopping once a
    /// baseline would fall below `bottomY`.
    ///
    /// The bound is the point. Without it a long title spilled past its block
    /// and printed over the map image drawn beneath it. When more lines exist
    /// than fit, the last line that does fit is ellipsized, so the clipping is
    /// something the reader can see.
    ///
    /// Returns the baseline of the last line drawn, so the next paragraph can
    /// chain its own gap onto it.
    @discardableResult
    static func drawParagraph(
        into content: inout PdfContent,
        lines: [String],
        font: PdfFont,
        size: Double,
        lineHeight: Double,
        x: Double,
        startY: Double,
        bottomY: Double,
        colour: PdfColor,
        maxWidth: Double
    ) -> Double {
        var lastBaseline = startY
        for (index, line) in lines.enumerated() {
            let y = startY - Double(index) * lineHeight
            if y < bottomY { break }
            let linesRemain = index < lines.count - 1
            let nextWouldOverflow = y - lineHeight < bottomY
            let text = linesRemain && nextWouldOverflow
                ? ellipsized(line, font: font, size: size, maxWidth: maxWidth)
                : line
            content.text(text, font: font, size: size, x: x, y: y, colour: colour)
            lastBaseline = y
        }
        return lastBaseline
    }

    // MARK: - Furniture

    static func drawScaleBar(
        into content: inout PdfContent, template: PdfTemplate, spec: PrintScaleBar
    ) {
        let slot = template.scaleBar
        let segments = 4
        let segmentWidth = spec.widthPoints / Double(segments)
        for index in 0..<segments {
            content.fillAndStrokeRectangle(
                PdfRect(
                    x: slot.x + Double(index) * segmentWidth, y: slot.y,
                    width: segmentWidth, height: 5
                ),
                fill: index % 2 == 0 ? ink : PdfColor(1, 1, 1),
                stroke: ink,
                width: 0.6
            )
        }
        let caption = template.type.caption
        let font = PdfFont.regular
        content.text(
            "0", font: font, size: caption, x: slot.x, y: slot.y - caption - 2, colour: muted
        )
        content.text(
            spec.label,
            font: font,
            size: caption,
            x: slot.x + spec.widthPoints - font.width(of: spec.label, size: caption),
            y: slot.y - caption - 2,
            colour: muted
        )
        content.text(
            spec.denominatorLabel,
            font: font, size: caption, x: slot.x, y: slot.y + 9, colour: muted
        )
    }

    static func drawNorthArrow(into content: inout PdfContent, template: PdfTemplate) {
        let slot = template.northArrow
        let body = template.type.body
        let font = PdfFont.regular
        let centreX = slot.x + slot.size / 2
        content.text(
            "N",
            font: font,
            size: body,
            x: centreX - font.width(of: "N", size: body) / 2,
            y: slot.y + slot.size - body,
            colour: ink
        )
        let tip = slot.y + slot.size - body - 3
        content.line(from: (centreX, slot.y), to: (centreX, tip), colour: ink, width: 1.2)
        content.line(from: (centreX - 4, tip - 6), to: (centreX, tip), colour: ink, width: 1.2)
        content.line(from: (centreX + 4, tip - 6), to: (centreX, tip), colour: ink, width: 1.2)
    }

    /// The QR code, drawn as one filled rectangle per dark module over a white
    /// square.
    ///
    /// The quiet zone is inside the slot, not added around it: the layout's
    /// blocks must not overlap, and a code that grew its own margin outward
    /// would put white paper over whatever the template placed beside it. Two
    /// modules of quiet zone on each side matches the web's `margin: 2`; the
    /// module size is floored to a whole number of hundredths so a rounding
    /// remainder cannot leave a seam between neighbouring modules.
    static func drawQrCode(
        into content: inout PdfContent, slot: PdfTemplate.SquareSlot, modules: [[Bool]]
    ) {
        guard let width = modules.first?.count, width > 0, modules.count == width else { return }

        content.fillRectangle(
            PdfRect(x: slot.x, y: slot.y, width: slot.size, height: slot.size),
            colour: PdfColor(1, 1, 1)
        )
        let quietZone = 2.0
        let moduleSize = slot.size / (Double(width) + quietZone * 2)
        let origin = quietZone * moduleSize
        for (row, cells) in modules.enumerated() {
            for (column, isDark) in cells.enumerated() where isDark {
                content.fillRectangle(
                    PdfRect(
                        x: slot.x + origin + Double(column) * moduleSize,
                        // Modules arrive top row first; PDF user space counts up
                        // from the bottom of the page.
                        y: slot.y + origin + Double(width - row - 1) * moduleSize,
                        width: moduleSize,
                        height: moduleSize
                    ),
                    colour: PdfColor(0, 0, 0)
                )
            }
        }
    }

    static func drawLegend(
        into content: inout PdfContent,
        box: PdfRect,
        entries: [LegendEntry],
        type: PdfTemplate.TypeScale
    ) {
        content.strokeRectangle(box, colour: rule, width: 0.75)
        content.text(
            "LEGEND",
            font: .bold,
            size: type.caption,
            x: box.x + 8,
            y: box.y + box.height - type.caption - 6,
            colour: muted
        )
        let rowHeight = type.caption + 6
        let firstRowY = box.y + box.height - type.caption - 6 - rowHeight
        let maxRows = max(1, Int((firstRowY - box.y) / rowHeight) + 1)
        let visible = Array(entries.prefix(maxRows))
        let overflow = entries.count - visible.count
        for (index, entry) in visible.enumerated() {
            let rowY = firstRowY - Double(index) * rowHeight
            // The last row becomes a count when there are more layers than
            // rows, because a legend that just stops looks complete. The
            // hidden layers are still named in full in the attribution strip.
            let isOverflowRow = overflow > 0 && index == visible.count - 1
            if !isOverflowRow {
                content.fillAndStrokeRectangle(
                    PdfRect(x: box.x + 8, y: rowY, width: 8, height: 8),
                    fill: entry.swatchColour.map { PdfColor(hex: $0, fallback: chip) } ?? chip,
                    stroke: muted,
                    width: 0.4
                )
            }
            let label = isOverflowRow
                ? "…and \(overflow + 1) more — see attribution"
                : entry.name
            let font = PdfFont.regular
            let fitted = font.width(of: label, size: type.caption) > box.width - 30
                ? ellipsized(label, font: font, size: type.caption, maxWidth: box.width - 30)
                : label
            content.text(
                fitted, font: font, size: type.caption, x: box.x + 22, y: rowY + 1, colour: ink
            )
        }
    }

    // MARK: - The page

    public static func compose(_ input: Input) -> Data {
        let template = input.template
        let type = template.type
        let bold = PdfFont.bold
        let regular = PdfFont.regular
        var content = PdfContent()

        // Map image, then its neatline on top of it.
        let frame = template.mapFrame
        content.image("Im0", in: frame)
        content.strokeRectangle(frame, colour: ink, width: 1)

        // Title block: title, subtitle, then wrapped notes. Every paragraph
        // wraps itself against real font metrics and draws a line at a time,
        // and all three share the block's bottom bound — so a long title that
        // eats the whole block simply leaves no room for the subtitle and
        // notes, rather than any of the three printing over the map.
        let block = template.titleBlock
        let titleLines = wrap(
            bold.sanitized(input.fields.title), font: bold, size: type.title,
            maxWidth: block.width
        )
        var cursorY = drawParagraph(
            into: &content,
            lines: titleLines,
            font: bold,
            size: type.title,
            lineHeight: type.title * 1.15,
            x: block.x,
            startY: block.y + block.height - type.title,
            bottomY: block.y,
            colour: ink,
            maxWidth: block.width
        )
        if !input.fields.subtitle.isEmpty {
            cursorY -= type.subtitle + 6
            if cursorY >= block.y {
                cursorY = drawParagraph(
                    into: &content,
                    lines: wrap(
                        regular.sanitized(input.fields.subtitle), font: regular,
                        size: type.subtitle, maxWidth: block.width
                    ),
                    font: regular,
                    size: type.subtitle,
                    lineHeight: type.subtitle * 1.15,
                    x: block.x,
                    startY: cursorY,
                    bottomY: block.y,
                    colour: muted,
                    maxWidth: block.width
                )
            }
        }
        if !input.fields.notes.isEmpty {
            cursorY -= type.body + 3
            if cursorY >= block.y {
                drawParagraph(
                    into: &content,
                    lines: wrap(
                        regular.sanitized(input.fields.notes), font: regular,
                        size: type.body, maxWidth: block.width
                    ),
                    font: regular,
                    size: type.body,
                    lineHeight: type.body + 3,
                    x: block.x,
                    startY: cursorY,
                    bottomY: block.y,
                    colour: ink,
                    maxWidth: block.width
                )
            }
        }

        if let legend = input.legend, !legend.isEmpty {
            drawLegend(into: &content, box: template.legendBox, entries: legend, type: type)
        }
        drawScaleBar(into: &content, template: template, spec: input.scaleBar)
        drawNorthArrow(into: &content, template: template)
        if let modules = input.qrModules {
            drawQrCode(into: &content, slot: template.qr, modules: modules)
        }

        // Attribution strip — always drawn, ruled off above.
        let strip = template.attributionStrip
        content.line(
            from: (strip.x, strip.y + strip.height),
            to: (strip.x + strip.width, strip.y + strip.height),
            colour: rule,
            width: 0.75
        )
        let stamp = "Generated \(day(input.generatedAt)) — kinnokilabs.com/map"
        // The link in words as well as in the code. A QR is a courtesy that a
        // fold, a photocopy or a phone without a camera defeats, and the whole
        // claim of the square is that this page can be got back to; written out
        // it survives all three.
        //
        // Its own rows at the foot of the strip, with the space taken out of
        // what the credits get, rather than appended to them. Joined on, it was
        // last in a line that ellipsizes when it runs out of room — so a page
        // with enough sources to credit dropped the whole address and kept the
        // guarantee only in the comment above it.
        var creditStrip = strip
        var receiptLines = [String]()
        if let link = input.shareURLText {
            receiptLines = wrap(
                regular.sanitized("Exact map receipt: \(link)"),
                font: regular, size: type.caption, maxWidth: strip.width
            )
            let rowHeight = type.caption + captionLeading
            // The credits come first when there is not room for both. A long
            // URL — every layer switched on runs to some six hundred characters
            // — wrapped to five rows in a strip that holds two, and printed
            // over the attributions underneath it. The written address is a
            // courtesy and the credits are an obligation, so the courtesy is
            // the half that goes. The QR square still carries the link.
            let affordable = Int((strip.height / rowHeight).rounded(.down)) - 1
            if receiptLines.count > max(0, affordable) {
                receiptLines = []
            }
            let receiptHeight = Double(receiptLines.count) * rowHeight
            creditStrip = PdfRect(
                x: strip.x, y: strip.y + receiptHeight,
                width: strip.width, height: max(0, strip.height - receiptHeight)
            )
        }
        for (index, line) in receiptLines.enumerated() {
            content.text(
                line,
                font: regular,
                size: type.caption,
                x: strip.x,
                y: strip.y + Double(receiptLines.count - index - 1)
                    * (type.caption + captionLeading),
                colour: muted
            )
        }
        let attribution = (input.disclosures + input.attributionLines + [stamp])
            .map { regular.sanitized($0) }
            .joined(separator: "  ·  ")
        let fitted = fitAttribution(
            attribution, font: regular, strip: creditStrip, preferredSize: type.caption
        )
        for (index, line) in fitted.lines.enumerated() {
            content.text(
                line,
                font: regular,
                size: fitted.size,
                x: strip.x,
                y: strip.y + strip.height
                    - Double(index + 1) * (fitted.size + captionLeading),
                colour: muted
            )
        }

        return write(input: input, content: content.data)
    }

    /// Assembles the file: the page, its resources, the map image, and the geo
    /// registration that says where on the ground the frame sits.
    private static func write(input: Input, content: Data) -> Data {
        var writer = PdfWriter()
        let catalog = writer.reserve()
        let pages = writer.reserve()
        let template = input.template

        // The JPEG goes in with no re-encoding: DCTDecode means the reader
        // decompresses exactly the bytes the compositor produced, so the
        // printed map is the raster that was rendered, not a copy of it.
        let image = writer.add(
            .stream(
                [
                    ("Type", .name("XObject")),
                    ("Subtype", .name("Image")),
                    ("Width", .integer(input.mapImage.widthPx)),
                    ("Height", .integer(input.mapImage.heightPx)),
                    ("ColorSpace", .name("DeviceRGB")),
                    ("BitsPerComponent", .integer(8)),
                    ("Filter", .name("DCTDecode")),
                ],
                input.mapImage.jpegBytes
            )
        )
        let regular = writer.add(
            .dictionary([
                ("Type", .name("Font")),
                ("Subtype", .name("Type1")),
                ("BaseFont", .name(PdfFont.Face.regular.rawValue)),
                ("Encoding", .name("WinAnsiEncoding")),
            ])
        )
        let bold = writer.add(
            .dictionary([
                ("Type", .name("Font")),
                ("Subtype", .name("Type1")),
                ("BaseFont", .name(PdfFont.Face.bold.rawValue)),
                ("Encoding", .name("WinAnsiEncoding")),
            ])
        )
        let contents = writer.add(.stream([], content))

        let page = writer.add(
            .dictionary([
                ("Type", .name("Page")),
                ("Parent", .reference(pages)),
                (
                    "MediaBox",
                    .array([
                        .integer(0), .integer(0),
                        .number(template.pageWidth), .number(template.pageHeight),
                    ])
                ),
                ("Contents", .reference(contents)),
                (
                    "Resources",
                    .dictionary([
                        (
                            "Font",
                            .dictionary([
                                ("F1", .reference(regular)),
                                ("F2", .reference(bold)),
                            ])
                        ),
                        ("XObject", .dictionary([("Im0", .reference(image))])),
                    ])
                ),
                (
                    "VP",
                    GeoPdfRegistration.viewport(
                        bounds: input.bounds, mapFrame: template.mapFrame
                    )
                ),
                (
                    "LGIDict",
                    GeoPdfRegistration.lgiDict(
                        bounds: input.bounds, mapFrame: template.mapFrame
                    )
                ),
            ])
        )
        // The appendix pages share the map page's fonts and carry no image and
        // no viewport: they are text on paper, and nothing about them should
        // read as a second map.
        let appendixPages = PdfAppendix.pages(
            input.appendix, template: template, caveat: input.appendixCaveat
        ).map { stream in
            let streamNumber = writer.add(.stream([], stream))
            return writer.add(
                .dictionary([
                    ("Type", .name("Page")),
                    ("Parent", .reference(pages)),
                    (
                        "MediaBox",
                        .array([
                            .integer(0), .integer(0),
                            .number(template.pageWidth), .number(template.pageHeight),
                        ])
                    ),
                    ("Contents", .reference(streamNumber)),
                    (
                        "Resources",
                        .dictionary([
                            (
                                "Font",
                                .dictionary([
                                    ("F1", .reference(regular)),
                                    ("F2", .reference(bold)),
                                ])
                            )
                        ])
                    ),
                ])
            )
        }
        let kids = [page] + appendixPages
        writer.fill(
            pages,
            with: .dictionary([
                ("Type", .name("Pages")),
                ("Kids", .array(kids.map { .reference($0) })),
                ("Count", .integer(kids.count)),
            ])
        )
        writer.fill(
            catalog,
            with: .dictionary([("Type", .name("Catalog")), ("Pages", .reference(pages))])
        )

        let stamp = pdfDate(input.generatedAt)
        let info = writer.add(
            .dictionary([
                ("Title", .textString(input.fields.title)),
                ("Producer", .textString("NS Marks The Spot")),
                ("Creator", .textString("NS Marks The Spot")),
                ("CreationDate", .string(stamp)),
                ("ModDate", .string(stamp)),
            ])
        )
        return writer.data(catalog: catalog, info: info)
    }

    /// `yyyy-MM-dd` in UTC, matching the web's ISO string sliced to ten
    /// characters.
    static func day(_ date: Date) -> String {
        let parts = Calendar.utc.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0
        )
    }

    /// PDF's own date syntax, which is not ISO 8601.
    static func pdfDate(_ date: Date) -> String {
        let parts = Calendar.utc.dateComponents(
            [.year, .month, .day, .hour, .minute, .second], from: date
        )
        return String(
            format: "D:%04d%02d%02d%02d%02d%02d+00'00'",
            parts.year ?? 0, parts.month ?? 0, parts.day ?? 0,
            parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0
        )
    }
}

extension Calendar {
    /// The export stamps UTC rather than the phone's zone, so two people
    /// comparing the same printed page read the same date on it.
    fileprivate static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }()
}
