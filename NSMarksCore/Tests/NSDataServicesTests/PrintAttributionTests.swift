import Foundation
import Testing

@testable import NSDataServices

@Suite("Attribution strip lines")
struct PrintAttributionTests {
    private static let openGovernment =
        "Contains information licensed under the Open Government Licence — Nova Scotia"

    /// Four Province layers used to put the same 149 characters on the page
    /// four times, which overran the strip and got the tail cut. Sharing one
    /// line keeps the whole obligation on the page.
    @Test func sourcesSharingOneLicenceShareOneLine() {
        let lines = PrintAttribution.lines(for: [
            PrintLayerSource(
                name: "Parcels", attribution: Self.openGovernment, licenceUrl: "https://a"
            ),
            PrintLayerSource(
                name: "Well logs", attribution: Self.openGovernment, licenceUrl: "https://a"
            ),
            PrintLayerSource(
                name: "Forestry", attribution: Self.openGovernment, licenceUrl: "https://a"
            ),
        ])

        #expect(lines == ["Parcels, Well logs, Forestry: \(Self.openGovernment) — https://a"])
    }

    /// The same words under a different licence document are a different
    /// obligation. Merging them would assert one publisher's licence over data
    /// it does not cover.
    @Test func theSameWordsUnderADifferentLicenceStaySeparate() {
        let lines = PrintAttribution.lines(for: [
            PrintLayerSource(
                name: "Parcels", attribution: Self.openGovernment, licenceUrl: "https://ogl"
            ),
            PrintLayerSource(
                name: "Coastal flood", attribution: Self.openGovernment,
                licenceUrl: "https://coastal"
            ),
        ])

        #expect(lines.count == 2)
        #expect(lines[0].hasSuffix("https://ogl"))
        #expect(lines[1].hasSuffix("https://coastal"))
    }

    /// The strip reads base map upward, matching the order the layers were
    /// captured in, so a reader can match a line to what they see.
    @Test func firstSeenOrderIsKept() {
        let lines = PrintAttribution.lines(for: [
            PrintLayerSource(name: "Base", attribution: "Apple", licenceUrl: nil),
            PrintLayerSource(name: "Parcels", attribution: Self.openGovernment, licenceUrl: nil),
            PrintLayerSource(name: "Roads", attribution: "Apple", licenceUrl: nil),
        ])

        #expect(lines == ["Base, Roads: Apple", "Parcels: \(Self.openGovernment)"])
    }

    /// A publisher that states no licence document gets no invented one.
    @Test func aSourceWithNoStatedLicenceGetsNoUrl() {
        let lines = PrintAttribution.lines(for: [
            PrintLayerSource(name: "User layer", attribution: "Loaded by the reader", licenceUrl: nil)
        ])

        #expect(lines == ["User layer: Loaded by the reader"])
    }

    /// The same layer listed twice is one name, not two.
    @Test func aRepeatedSourceIsNamedOnce() {
        let lines = PrintAttribution.lines(for: [
            PrintLayerSource(name: "Parcels", attribution: "Province", licenceUrl: nil),
            PrintLayerSource(name: "Parcels", attribution: "Province", licenceUrl: nil),
        ])

        #expect(lines == ["Parcels: Province"])
    }
}

@Suite("Export resolution")
struct PrintResolutionTests {
    /// A phone with room for it prints at full resolution.
    @Test func aRoomyDeviceGetsTheTopOfTheLadder() {
        let resolution = PrintResolution.resolve(
            mapFrame: PdfTemplate.portrait.mapFrame, constrainedDevice: false
        )

        #expect(resolution.dpi == 300)
        #expect(resolution.widthPx == 2317)
        #expect(resolution.heightPx == 2083)
        #expect(!resolution.reduced)
    }

    /// A constrained device starts a rung down, and says so — a page at 200
    /// dpi is a different document from one at 300, and the reader is the one
    /// who decides whether that matters.
    @Test func aConstrainedDeviceStartsLowerAndSaysSo() {
        let resolution = PrintResolution.resolve(
            mapFrame: PdfTemplate.portrait.mapFrame, constrainedDevice: true
        )

        #expect(resolution.dpi == 200)
        #expect(resolution.reduced)
    }

    /// Past the bottom of the ladder the raster is scaled to fit, and the dpi
    /// it reports describes the pixels it actually returned rather than the
    /// rung it fell off.
    @Test func anOversizeFrameReportsThePitchItReallyHas() {
        let frame = PdfRect(x: 0, y: 0, width: 4000, height: 2000)
        let resolution = PrintResolution.resolve(mapFrame: frame, constrainedDevice: false)

        #expect(max(resolution.widthPx, resolution.heightPx)
            == PrintResolution.maximumDimensionPx)
        #expect(resolution.reduced)
        // The pitch has to match the pixels: 4096 px across 4000 pt is a
        // little over one pixel per point, which is 74 dpi, not 150.
        #expect(resolution.dpi == 74)
    }

    @Test(arguments: [
        (UInt64(3) * 1024 * 1024 * 1024, true),
        (UInt64(4) * 1024 * 1024 * 1024, true),
        (UInt64(8) * 1024 * 1024 * 1024, false),
    ])
    func memoryDecidesWhetherADeviceIsConstrained(bytes: UInt64, constrained: Bool) {
        #expect(PrintResolution.isConstrained(physicalMemoryBytes: bytes) == constrained)
    }
}
