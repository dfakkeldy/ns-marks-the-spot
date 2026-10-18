import Foundation
import Testing

@testable import NSDataServices

@Suite("Evidence appendix")
struct PdfAppendixTests {
    @Test("A source link keeps its address, because paper cannot be clicked")
    func linksBecomeLabelAndAddress() {
        let blocks = PdfAppendix.blocks(
            fromMarkdown: "- [Crown lands](https://example.ca/crown) — 2025-01-01"
        )
        #expect(
            blocks == [.bullet("Crown lands (https://example.ca/crown) — 2025-01-01")]
        )
    }

    @Test("The note's own title does not print twice")
    func theNoteTitleIsDropped() {
        let blocks = PdfAppendix.blocks(
            fromMarkdown: "# NS Marks The Spot parcel evidence note\n\n## Event\n\nNothing."
        )
        #expect(blocks == [.heading("Event"), .body("Nothing.")])
    }

    @Test("Headings, subheadings and bullets are told apart")
    func markdownKindsSurvive() {
        let blocks = PdfAppendix.blocks(
            fromMarkdown: "## Resources\n\n### AAN 12345\n\n- Nothing returned.\n\nA sentence."
        )
        #expect(
            blocks == [
                .heading("Resources"),
                .subheading("AAN 12345"),
                .bullet("Nothing returned."),
                .body("A sentence."),
            ]
        )
    }

    @Test("An empty note makes no pages at all")
    func nothingToSayDrawsNothing() {
        #expect(PdfAppendix.pages([], template: .portrait).isEmpty)
    }

    /// The failure this guards is silent: a long note laid out on one page runs
    /// off the bottom, and the lines that fell off take a "source unavailable"
    /// sentence with them.
    @Test("A note longer than a page continues onto the next one")
    func longNotesPaginate() {
        let blocks = (1...120).map { PdfAppendix.Block.bullet("Result \($0): nothing returned.") }
        let pages = PdfAppendix.pages(blocks, template: .portrait)
        #expect(pages.count > 1)
        let text = pages.map { String(decoding: $0, as: UTF8.self) }
        #expect(text[0].contains("Result 1"))
        #expect(text.last?.contains("Result 120") == true)
        #expect(text.allSatisfy { $0.contains("Evidence appendix") })
        #expect(text.last?.contains("page \(pages.count) of \(pages.count)") == true)
    }

    /// Every line the caller handed over reaches paper. A page break that drops
    /// a line rather than moving it is the same defect as running off the
    /// bottom, only harder to see.
    @Test("Nothing is dropped at a page break")
    func everyLineSurvivesPagination() {
        let blocks = (1...200).map { PdfAppendix.Block.body("Line \($0).") }
        let text = PdfAppendix.pages(blocks, template: .portrait)
            .map { String(decoding: $0, as: UTF8.self) }
            .joined()
        for number in 1...200 {
            #expect(text.contains("Line \(number)."), "line \(number) never printed")
        }
    }

    @Test("A heading is not left stranded at the foot of a page")
    func headingsTravelWithTheirText() {
        let metrics = PdfAppendix.Metrics(template: .portrait)
        // Enough bullets to nearly fill the page, then a heading: the heading
        // has to move rather than sit alone above the footer.
        var blocks = (1...44).map { PdfAppendix.Block.bullet("Filler \($0).") }
        blocks.append(.heading("General limitations"))
        blocks.append(.body("Approximate, and not a survey."))
        let pages = PdfAppendix.pages(blocks, template: .portrait)
        let text = pages.map { String(decoding: $0, as: UTF8.self) }
        guard let headingPage = text.firstIndex(where: { $0.contains("General limitations") })
        else {
            Issue.record("the heading never printed")
            return
        }
        #expect(text[headingPage].contains("Approximate"))
        #expect(metrics.bottomY > metrics.margin)
    }
}

/// The footer caveat, which is what an appendix page says about itself once it
/// has been separated from the map it came with.
@Suite("The appendix's own caveat")
struct PdfAppendixCaveatTests {
    private static let field =
        "Field screening/reference material only. Not a survey or an access conclusion. "
        + "Confirm conditions, boundaries, and permissions on site and from "
        + "authoritative sources."

    /// Not only the first. These pages get filed, photocopied and quoted one at
    /// a time, and page four on its own is the page somebody acts on.
    @Test func everyPageCarriesIt() {
        let blocks = (1...200).map { PdfAppendix.Block.body("Line \($0).") }
        let pages = PdfAppendix.pages(blocks, template: .portrait, caveat: "Screening only.")
        #expect(pages.count > 1)
        for page in pages {
            #expect(String(decoding: page, as: UTF8.self).contains("Screening only."))
        }
    }

    /// A caveat too long for the footer is cut visibly rather than quietly. A
    /// sentence that stops mid-clause with no ellipsis reads as the whole
    /// warning.
    @Test func aCaveatTooLongForTheFooterSaysItWasCut() {
        let metrics = PdfAppendix.Metrics(template: .portrait)
        let lines = PdfAppendix.caveatLines(String(repeating: "warning ", count: 200), metrics: metrics)
        #expect(lines.count == PdfAppendix.caveatRows)
        #expect(lines.last?.hasSuffix("…") == true)
    }

    /// The field sheet's caveat is the longest either document carries; it has
    /// to reach paper whole.
    @Test func theLongestRealCaveatStillFits() {
        let metrics = PdfAppendix.Metrics(template: .portrait)
        let lines = PdfAppendix.caveatLines(Self.field, metrics: metrics)
        #expect(lines.count <= PdfAppendix.caveatRows)
        #expect(lines.joined(separator: " ") == Self.field)
    }

    /// No caveat means no footer rows, so a caller that passes nothing gets the
    /// page it always got.
    @Test func noCaveatDrawsNothing() {
        let metrics = PdfAppendix.Metrics(template: .portrait)
        #expect(PdfAppendix.caveatLines("", metrics: metrics).isEmpty)
    }
}
