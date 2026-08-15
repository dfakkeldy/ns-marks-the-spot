import Foundation

/// The evidence appendix: the pages that follow the map and say what the app
/// found, what it did not find, and what it never asked.
///
/// The web builds this from its print snapshot (`PrintEvidenceAppendix.tsx`).
/// Here it is built from the evidence note's own markdown instead, and that is
/// deliberate. The note and the appendix are the same statements about the same
/// parcel; two independent renderings of them are two things that can drift,
/// and the pair that must never disagree is exactly this pair — one is what the
/// user emails and the other is what they carry into an office. Parsing the
/// note means a sentence can only ever be changed in one place.
///
/// Nothing here is laid out as a table. A grid invites a reader to compare
/// cells across rows, and an empty cell in a grid reads as a zero; these
/// sections carry "returned nothing" and "source unavailable" as sentences
/// precisely so they cannot be read as absence.
public enum PdfAppendix {
    /// One laid-out thing on the page. The kinds the note's markdown can say.
    public enum Block: Sendable, Equatable {
        case heading(String)
        case subheading(String)
        case body(String)
        case bullet(String)
    }

    /// The note's markdown as blocks, with its own title line dropped — the
    /// appendix page prints its own heading, and two titles in a row reads as a
    /// mistake.
    ///
    /// Links become "label (url)". A printed page cannot be clicked, and a
    /// label whose address is not written next to it is a citation the reader
    /// cannot follow.
    public static func blocks(fromMarkdown markdown: String) -> [Block] {
        var blocks = [Block]()
        for rawLine in markdown.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            if line.hasPrefix("# ") { continue }
            if line.hasPrefix("### ") {
                blocks.append(.subheading(inlined(String(line.dropFirst(4)))))
            } else if line.hasPrefix("## ") {
                blocks.append(.heading(inlined(String(line.dropFirst(3)))))
            } else if line.hasPrefix("- ") {
                blocks.append(.bullet(inlined(String(line.dropFirst(2)))))
            } else {
                blocks.append(.body(inlined(line)))
            }
        }
        return blocks
    }

    /// Markdown links flattened to text a reader can retype.
    static func inlined(_ text: String) -> String {
        var out = ""
        var rest = Substring(text)
        while let open = rest.firstIndex(of: "["),
              let close = rest[open...].firstIndex(of: "]"),
              rest.index(after: close) < rest.endIndex,
              rest[rest.index(after: close)] == "(",
              let end = rest[close...].firstIndex(of: ")") {
            let label = rest[rest.index(after: open)..<close]
            let url = rest[rest.index(close, offsetBy: 2)..<end]
            out += rest[rest.startIndex..<open] + label + " (" + url + ")"
            rest = rest[rest.index(after: end)...]
        }
        return out + rest
    }

    // MARK: - Layout

    /// Metrics for the text pages. Not the map page's: it has a frame, a strip
    /// and a legend to place things against, and these pages have only a
    /// margin.
    struct Metrics {
        var pageWidth: Double
        var pageHeight: Double
        var margin: Double
        var headingSize: Double
        var bodySize: Double
        var captionSize: Double

        var textWidth: Double { pageWidth - margin * 2 }
        /// The footer sits inside the bottom margin, so body text stops above
        /// it rather than printing through the page number.
        var bottomY: Double { margin + captionSize * 2 }
        var topY: Double { pageHeight - margin }

        init(template: PdfTemplate) {
            pageWidth = template.pageWidth
            pageHeight = template.pageHeight
            margin = template.margin
            headingSize = template.type.subtitle
            bodySize = template.type.body
            captionSize = template.type.caption
        }
    }

    /// One drawn line, already placed. Pagination happens over these so a
    /// heading that would land alone at the foot of a page can be moved whole.
    struct Placed {
        var text: String
        var font: PdfFont
        var size: Double
        var indent: Double
        var spaceBefore: Double
    }

    static let title = "Evidence appendix"

    static func placed(_ blocks: [Block], metrics: Metrics) -> [[Placed]] {
        var groups = [[Placed]]()
        for block in blocks {
            switch block {
            case .heading(let text):
                groups.append(
                    wrapped(
                        text, font: .bold, size: metrics.headingSize,
                        indent: 0, spaceBefore: metrics.headingSize * 1.1, metrics: metrics
                    )
                )
            case .subheading(let text):
                groups.append(
                    wrapped(
                        text, font: .bold, size: metrics.bodySize,
                        indent: 0, spaceBefore: metrics.bodySize * 0.9, metrics: metrics
                    )
                )
            case .body(let text):
                groups.append(
                    wrapped(
                        text, font: .regular, size: metrics.bodySize,
                        indent: 0, spaceBefore: metrics.bodySize * 0.6, metrics: metrics
                    )
                )
            case .bullet(let text):
                groups.append(
                    wrapped(
                        "• \(text)", font: .regular, size: metrics.bodySize,
                        indent: 8, spaceBefore: metrics.bodySize * 0.3, metrics: metrics
                    )
                )
            }
        }
        return groups
    }

    private static func wrapped(
        _ text: String,
        font: PdfFont,
        size: Double,
        indent: Double,
        spaceBefore: Double,
        metrics: Metrics
    ) -> [Placed] {
        let lines = PdfComposer.wrap(
            text, font: font, size: size, maxWidth: metrics.textWidth - indent
        )
        return lines.enumerated().map { index, line in
            Placed(
                text: line, font: font, size: size, indent: indent,
                spaceBefore: index == 0 ? spaceBefore : 0
            )
        }
    }

    /// The appendix as content streams, one per page.
    ///
    /// A heading is never left stranded at the foot of a page: a group whose
    /// first line fits but whose successor could not follow it is pushed whole
    /// to the next page. Nothing is dropped — the pages simply continue.
    public static func pages(_ blocks: [Block], template: PdfTemplate) -> [Data] {
        let metrics = Metrics(template: template)
        let groups = placed(blocks, metrics: metrics)
        guard !groups.isEmpty else { return [] }

        var pages = [[Placed]]()
        var current = [Placed]()
        var y = metrics.topY - metrics.headingSize * 2.2

        for group in groups {
            let height = group.reduce(0.0) { $0 + $1.spaceBefore + $1.size * 1.35 }
            // A heading needs its first following line with it; the cheap
            // stand-in for that is asking the group to clear the bottom with a
            // body line's room to spare — its leading as well as its height, or
            // the heading stays and the line it introduces still moves.
            let needed = height + (isHeading(group) ? metrics.bodySize * 2.2 : 0)
            if y - needed < metrics.bottomY, !current.isEmpty {
                pages.append(current)
                current = []
                y = metrics.topY
            }
            for line in group {
                // Line by line, not group by group. A paragraph longer than a
                // whole page — a resource section with dozens of results — has
                // to be able to break in the middle of itself; kept together it
                // runs off the bottom of the page and the lines below the media
                // box are simply not there.
                let step = line.spaceBefore + line.size * 1.35
                if y - step < metrics.bottomY, !current.isEmpty {
                    pages.append(current)
                    current = []
                    y = metrics.topY
                }
                y -= step
                current.append(line)
            }
        }
        if !current.isEmpty { pages.append(current) }

        return pages.enumerated().map { index, lines in
            render(
                lines,
                metrics: metrics,
                isFirst: index == 0,
                page: index + 1,
                of: pages.count
            )
        }
    }

    private static func isHeading(_ group: [Placed]) -> Bool {
        group.first?.font.face == .bold
    }

    private static func render(
        _ lines: [Placed], metrics: Metrics, isFirst: Bool, page: Int, of total: Int
    ) -> Data {
        var content = PdfContent()
        let ink = PdfColor(0.1, 0.1, 0.1)
        let muted = PdfColor(0.42, 0.42, 0.42)
        var y = metrics.topY

        if isFirst {
            y -= metrics.headingSize * 1.2
            content.text(
                title, font: .bold, size: metrics.headingSize * 1.2,
                x: metrics.margin, y: y, colour: ink
            )
            y -= metrics.headingSize
        }
        for line in lines {
            y -= line.spaceBefore + line.size * 1.35
            content.text(
                line.text, font: line.font, size: line.size,
                x: metrics.margin + line.indent, y: y, colour: ink
            )
        }
        content.text(
            "Evidence appendix — page \(page) of \(total)",
            font: .regular, size: metrics.captionSize,
            x: metrics.margin, y: metrics.margin * 0.6, colour: muted
        )
        return content.data
    }
}
