import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// The arithmetic behind the export frame, ported alongside the web's own
/// assertions so the two surfaces cannot drift into printing different ground
/// from the same drag.
@Suite("Print frame geometry")
struct PrintFrameGeometryTests {
    private static let container = (width: 1200.0, height: 800.0)

    @Test func aFrameSitsCentredAtTheAspectItWillBePrintedAt() {
        let aspect = PdfTemplate.landscape.mapFrameAspect
        let rect = PrintFrameGeometry.screenRect(
            container: Self.container,
            aspect: aspect,
            state: PrintFrameGeometry.FrameState(orientation: .landscape, scale: 0.5)
        )

        #expect(abs(rect.width / rect.height - aspect) < 1e-9)
        #expect(abs(rect.x + rect.width / 2 - 600) < 1e-9)
        #expect(abs(rect.y + rect.height / 2 - 400) < 1e-9)
    }

    /// A phone is narrow enough that a portrait page fitted to the screen's
    /// height would be wider than the screen. The handle has to keep working
    /// there: every scale in range must produce a frame that fits, and a larger
    /// scale must produce a visibly larger frame.
    @Test func theHandleStillMovesTheFrameOnAPhone() {
        let phone = (width: 390.0, height: 844.0)
        let aspect = PdfTemplate.portrait.mapFrameAspect
        let small = PrintFrameGeometry.screenRect(
            container: phone, aspect: aspect,
            state: PrintFrameGeometry.FrameState(orientation: .portrait, scale: 0.4)
        )
        let large = PrintFrameGeometry.screenRect(
            container: phone, aspect: aspect,
            state: PrintFrameGeometry.FrameState(orientation: .portrait, scale: 0.9)
        )

        #expect(large.width > small.width * 1.5)
        #expect(large.width <= phone.width)
        #expect(abs(large.width / large.height - aspect) < 1e-9)
    }

    @Test func aFrameDraggedOffTheEdgeStaysOnTheMap() {
        let rect = PrintFrameGeometry.screenRect(
            container: Self.container,
            aspect: 1.7,
            state: PrintFrameGeometry.FrameState(scale: 0.9, offsetX: 5_000, offsetY: -5_000)
        )

        #expect(rect.x >= 0)
        #expect(rect.y >= 0)
        #expect(rect.x + rect.width <= Self.container.width)
        #expect(rect.y + rect.height <= Self.container.height)
    }

    @Test func theFrameCentreStaysOnTheMapCentre() {
        let bounds = PrintFrameGeometry.bounds(
            forFrame: PrintFrameGeometry.ScreenRect(x: 400, y: 250, width: 400, height: 300),
            container: Self.container,
            center: GeoPoint(lat: 46.1, lng: -61.25),
            zoom: 12
        )

        #expect(abs((bounds.north + bounds.south) / 2 - 46.1) < 1e-4)
        #expect(abs((bounds.east + bounds.west) / 2 + 61.25) < 1e-6)
        #expect(bounds.north > bounds.south)
        #expect(bounds.east > bounds.west)
    }

    /// The zoom scale is the map's own: 256 points of world at z0. A frame the
    /// full width of a 256-point container therefore covers the whole
    /// longitude range, and anything else means the export is framed at a
    /// different scale from the map it was framed on.
    @Test func theZoomScaleIsTheMapsOwn() {
        let bounds = PrintFrameGeometry.bounds(
            forFrame: PrintFrameGeometry.ScreenRect(x: 0, y: 336, width: 256, height: 128),
            container: (width: 256, height: 800),
            center: GeoPoint(lat: 0, lng: 0),
            zoom: 0
        )

        #expect(abs(bounds.west + 180) < 1e-4)
        #expect(abs(bounds.east - 180) < 1e-4)
    }

    @Test(arguments: [
        (80.0, 0.6),
        (-80.0, 0.4),
        (8_000.0, PrintFrameGeometry.maximumScale),
        (-8_000.0, PrintFrameGeometry.minimumScale),
    ])
    func aResizeDragLandsWhereItIsDraggedAndNoFurther(deltaY: Double, expected: Double) {
        let next = PrintFrameGeometry.scaleAfterResizeDrag(
            startScale: 0.5, deltaY: deltaY, containerFit: 800
        )
        #expect(abs(next - expected) < 1e-9)
    }

    /// The handle has to keep up with the finger on a phone, where the frame's
    /// size comes from the width and not the height.
    @Test func theFrameEdgeFollowsTheFingerOnAPhone() {
        let container = (width: 390.0, height: 844.0)
        let aspect = PdfTemplate.landscape.mapFrameAspect
        let fit = PrintFrameGeometry.fittedHeight(container: container, aspect: aspect)
        var state = PrintFrameGeometry.FrameState(orientation: .landscape, scale: 0.4)
        let before = PrintFrameGeometry.screenRect(
            container: container, aspect: aspect, state: state
        )

        state.scale = PrintFrameGeometry.scaleAfterResizeDrag(
            startScale: state.scale, deltaY: 100, containerFit: fit
        )
        let after = PrintFrameGeometry.screenRect(
            container: container, aspect: aspect, state: state
        )

        // The frame grows by the drag, less the half of it the top edge takes
        // as the frame stays centred — not the ~27 points a container-height
        // divisor would have given.
        #expect(abs((after.height - before.height) - 100) < 1e-6)
    }

    @Test func aFrameDraggedPastTheEdgeComesStraightBack() {
        let container = (width: 390.0, height: 844.0)
        let aspect = PdfTemplate.landscape.mapFrameAspect
        var state = PrintFrameGeometry.FrameState(orientation: .landscape, offsetX: 200)
        state = PrintFrameGeometry.clampedOffsets(
            state, container: container, aspect: aspect
        )
        let atEdge = PrintFrameGeometry.screenRect(
            container: container, aspect: aspect, state: state
        )

        state.offsetX -= 40
        let after = PrintFrameGeometry.screenRect(
            container: container, aspect: aspect, state: state
        )

        #expect(abs((atEdge.x - after.x) - 40) < 1e-6)
    }
}

@Suite("Print scale bar")
struct PrintScaleBarTests {
    private static let bounds = GeoBoundingBox(
        south: 46.0, west: -61.4, north: 46.2, east: -61.1
    )
    private static let frame = PdfTemplate.portrait.mapFrame

    @Test func theBarIsARoundLengthThatFitsTheSpace() {
        let bar = PrintScaleBar.build(bounds: Self.bounds, mapFrame: Self.frame, maxWidthPoints: 128)
        let mantissa = bar.metres / pow(10, log10(bar.metres).rounded(.down))

        #expect([1.0, 2.0, 5.0].contains { abs($0 - mantissa) < 1e-9 })
        #expect(bar.widthPoints > 0)
        #expect(bar.widthPoints <= 128)
    }

    @Test func theBarIsLabelledInMetresOrKilometres() {
        let bar = PrintScaleBar.build(bounds: Self.bounds, mapFrame: Self.frame, maxWidthPoints: 128)
        #expect(bar.label.hasSuffix(" m") || bar.label.hasSuffix(" km"))
        #expect(bar.label.contains(".") == false)
    }

    /// 0.3° of longitude at 46.1°N is about 23.2 km across 556 points, which is
    /// a shade under 1:130,000. A denominator outside that range means the bar
    /// is measuring projected metres rather than ground.
    @Test func theRepresentativeFractionDescribesTheGround() {
        let bar = PrintScaleBar.build(bounds: Self.bounds, mapFrame: Self.frame, maxWidthPoints: 128)

        #expect(bar.denominator > 100_000)
        #expect(bar.denominator < 140_000)
        #expect(bar.denominatorLabel.hasPrefix("≈ 1:"))
        #expect(bar.denominatorLabel.contains(","))
    }

    /// The drawn bar and the printed fraction have to agree: a bar whose width
    /// does not reproduce its own label is a scale bar that lies.
    @Test func theDrawnWidthReproducesTheLabelledLength() {
        let bar = PrintScaleBar.build(bounds: Self.bounds, mapFrame: Self.frame, maxWidthPoints: 128)
        let metresPerPoint = bar.denominator * PdfTemplate.metresPerPoint

        #expect(abs(bar.widthPoints * metresPerPoint - bar.metres) < 1e-6)
    }
}

@Suite("Print page templates")
struct PdfTemplateTests {
    /// Nothing may sit on top of anything else. A legend over a scale bar is a
    /// page that has to be reprinted, and it is exactly the kind of change a
    /// layout edit makes by accident.
    @Test(arguments: PdfTemplate.ID.allCases)
    func noTwoBlocksOverlap(id: PdfTemplate.ID) {
        let template = PdfTemplate.template(id)
        let blocks = template.blocks

        for (index, block) in blocks.enumerated() {
            for other in blocks[(index + 1)...] {
                let separated = block.rect.x + block.rect.width <= other.rect.x
                    || other.rect.x + other.rect.width <= block.rect.x
                    || block.rect.y + block.rect.height <= other.rect.y
                    || other.rect.y + other.rect.height <= block.rect.y
                #expect(separated, "\(block.name) overlaps \(other.name) on \(id.rawValue)")
            }
        }
    }

    @Test(arguments: PdfTemplate.ID.allCases)
    func everyBlockIsOnThePage(id: PdfTemplate.ID) {
        let template = PdfTemplate.template(id)
        for block in template.blocks {
            #expect(block.rect.x >= 0)
            #expect(block.rect.y >= 0)
            #expect(block.rect.x + block.rect.width <= template.pageWidth)
            #expect(block.rect.y + block.rect.height <= template.pageHeight)
        }
    }
}
