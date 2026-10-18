import Foundation

/// A rectangle in PDF user space: points, origin at the page's bottom-left.
public struct PdfRect: Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

/// The page layouts the export offers.
///
/// Ported number-for-number from `web/src/print/pdf/templates/`, because the
/// two surfaces are meant to produce the same document. A map printed from the
/// phone and one printed from the browser should be comparable side by side,
/// and a layout that drifted would make the same parcel look like two
/// different pages.
public struct PdfTemplate: Hashable, Sendable {
    public enum ID: String, Hashable, Sendable, CaseIterable {
        case portrait
        case landscape
    }

    public struct TypeScale: Hashable, Sendable {
        public var title: Double
        public var subtitle: Double
        public var body: Double
        public var caption: Double
    }

    public struct ScaleBarSlot: Hashable, Sendable {
        public var x: Double
        public var y: Double
        public var maxWidth: Double
    }

    public struct SquareSlot: Hashable, Sendable {
        public var x: Double
        public var y: Double
        public var size: Double
    }

    public var id: ID
    public var pageWidth: Double
    public var pageHeight: Double
    public var margin: Double
    public var mapFrame: PdfRect
    public var titleBlock: PdfRect
    public var legendBox: PdfRect
    public var attributionStrip: PdfRect
    public var scaleBar: ScaleBarSlot
    public var northArrow: SquareSlot
    public var qr: SquareSlot
    public var type: TypeScale

    public static let pointsPerInch = 72.0
    public static let metresPerPoint = 0.0254 / pointsPerInch

    public var mapFrameAspect: Double { mapFrame.width / mapFrame.height }

    public static let portrait = PdfTemplate(
        id: .portrait,
        pageWidth: 612,
        pageHeight: 792,
        margin: 28,
        mapFrame: PdfRect(x: 28, y: 192, width: 556, height: 500),
        titleBlock: PdfRect(x: 28, y: 700, width: 556, height: 64),
        legendBox: PdfRect(x: 28, y: 72, width: 312, height: 112),
        attributionStrip: PdfRect(x: 28, y: 28, width: 556, height: 36),
        scaleBar: ScaleBarSlot(x: 348, y: 84, maxWidth: 128),
        northArrow: SquareSlot(x: 352, y: 124, size: 40),
        qr: SquareSlot(x: 488, y: 72, size: 96),
        type: TypeScale(title: 22, subtitle: 11, body: 9, caption: 7)
    )

    public static let landscape = PdfTemplate(
        id: .landscape,
        pageWidth: 792,
        pageHeight: 612,
        margin: 28,
        mapFrame: PdfRect(x: 28, y: 150, width: 736, height: 434),
        titleBlock: PdfRect(x: 28, y: 64, width: 300, height: 78),
        legendBox: PdfRect(x: 340, y: 64, width: 224, height: 78),
        attributionStrip: PdfRect(x: 28, y: 28, width: 624, height: 28),
        scaleBar: ScaleBarSlot(x: 576, y: 76, maxWidth: 80),
        northArrow: SquareSlot(x: 576, y: 106, size: 32),
        qr: SquareSlot(x: 668, y: 46, size: 96),
        type: TypeScale(title: 16, subtitle: 10, body: 9, caption: 7)
    )

    public static func template(_ id: ID) -> PdfTemplate {
        id == .portrait ? .portrait : .landscape
    }

    /// Every visually exclusive block, so a layout change that lets two of them
    /// overlap is caught by a test rather than by a reader whose legend is
    /// sitting on top of the scale bar.
    public var blocks: [(name: String, rect: PdfRect)] {
        [
            ("mapFrame", mapFrame),
            ("titleBlock", titleBlock),
            ("legendBox", legendBox),
            ("attributionStrip", attributionStrip),
            (
                "scaleBar",
                PdfRect(x: scaleBar.x, y: scaleBar.y - 4, width: scaleBar.maxWidth, height: 26)
            ),
            (
                "northArrow",
                PdfRect(
                    x: northArrow.x, y: northArrow.y,
                    width: northArrow.size, height: northArrow.size
                )
            ),
            ("qr", PdfRect(x: qr.x, y: qr.y, width: qr.size, height: qr.size)),
        ]
    }
}
