import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// What the page covers, and what it is allowed to claim it shows.
struct PrintExportPlanTests {
    private static func outcome(
        _ id: String, _ name: String, _ state: PrintMapCompositor.LayerState
    ) -> PrintMapCompositor.LayerOutcome {
        PrintMapCompositor.LayerOutcome(id: id, name: name, state: state)
    }

    /// The paper is not the shape of the screen, and the page grows to the
    /// difference rather than cropping to it: whatever the user had just put in
    /// the corner of the view is still on the page.
    @Test func theFrameGrowsToThePaperRatherThanCroppingToIt() {
        let visible = GeoBoundingBox(south: 46.0, west: -61.4, north: 46.2, east: -61.1)
        let frame = PdfTemplate.portrait.mapFrame

        let bounds = PrintExportPlan.bounds(covering: visible, mapFrame: frame)

        #expect(bounds.north >= visible.north)
        #expect(bounds.south <= visible.south)
        #expect(bounds.west <= visible.west)
        #expect(bounds.east >= visible.east)
    }

    /// And it is centred on what the user was looking at, in the projection the
    /// map is drawn in — not split unevenly, and not centred on the midpoint in
    /// degrees, which is a different place.
    @Test func theFrameStaysCentredOnTheView() {
        let visible = GeoBoundingBox(south: 46.0, west: -61.4, north: 46.2, east: -61.1)
        let frame = PdfTemplate.portrait.mapFrame

        let bounds = PrintExportPlan.bounds(covering: visible, mapFrame: frame)
        let before = WebMercator.project(
            GeoPoint(lat: (visible.north + visible.south) / 2, lng: 0)
        )
        let after = WebMercator.project(
            GeoPoint(lat: (bounds.north + bounds.south) / 2, lng: 0)
        )

        #expect(abs(after.y - before.y) < 1)
        #expect(abs((bounds.east + bounds.west) / 2 - (visible.east + visible.west) / 2) < 1e-9)
    }

    /// The printed frame's proportions are the map frame's, or the raster would
    /// be stretched into it and every feature would print off its ground
    /// position.
    @Test func theFrameTakesTheShapeOfTheMapBlock() {
        let visible = GeoBoundingBox(south: 46.0, west: -61.4, north: 46.2, east: -61.1)
        let frame = PdfTemplate.landscape.mapFrame

        let bounds = PrintExportPlan.bounds(covering: visible, mapFrame: frame)
        let northWest = WebMercator.project(GeoPoint(lat: bounds.north, lng: bounds.west))
        let southEast = WebMercator.project(GeoPoint(lat: bounds.south, lng: bounds.east))
        let aspect = (southEast.x - northWest.x) / (northWest.y - southEast.y)

        #expect(abs(aspect - frame.width / frame.height) < 1e-6)
    }

    /// A layer that could not be reached is not in the legend. The legend is
    /// the page's account of what the reader is looking at, and naming a layer
    /// that is not in the raster turns a source that failed into a source that
    /// answered with nothing.
    @Test func aLayerThatFailedIsNotInTheLegend() {
        let account = PrintExportPlan.account(
            for: [
                Self.outcome("roads", "Roads", .drawn),
                Self.outcome("flood", "Flood risk", .failed("timed out")),
            ],
            swatch: { _ in nil }
        )

        #expect(account.legend.map(\.name) == ["Roads"])
        #expect(account.omitted == ["Flood risk"])
        #expect(account.notes.first?.contains("Flood risk") == true)
        // And the page says what that absence does not mean.
        #expect(account.notes.first?.contains("not evidence") == true)
    }

    /// A layer that drew in patches is named as such rather than either
    /// dropped or presented whole.
    @Test func aPartlyPrintedLayerIsNamedAsPartlyPrinted() {
        let account = PrintExportPlan.account(
            for: [Self.outcome("aerial", "NS Aerial", .partial(missing: 3, of: 40))],
            swatch: { _ in "#ff0000" }
        )

        #expect(account.legend.count == 1)
        #expect(account.legend[0].name.contains("partly printed"))
        #expect(account.legend[0].swatchColour == "#ff0000")
        #expect(account.incomplete == ["NS Aerial"])
    }

    /// Credit follows the pixels. A layer whose attribution printed but whose
    /// raster did not would credit a publisher for a picture the page does not
    /// carry — and would let a reader infer the layer had been consulted.
    @Test func aFailedLayerIsNotCredited() throws {
        let roads = try #require(LayerCatalog.descriptor(for: .roads))
        let sources = PrintExportPlan.sources(
            baseMap: .standard,
            outcomes: [
                Self.outcome("roads", "Roads", .drawn),
                Self.outcome("missing", "Missing", .failed("offline")),
            ],
            descriptor: { $0 == "roads" ? roads : nil }
        )

        #expect(sources.count == 2)
        #expect(sources[0].name == "Apple Maps")
        #expect(sources[1].name == roads.name)
        #expect(!sources.contains { $0.name == "Missing" })
    }

    /// A layer this app cannot draw onto a page is named on the page anyway.
    /// It was on the screen the reader exported, and blank ground where it was
    /// would read as a layer that found nothing there.
    @Test func aLayerThePageCannotDrawIsStillNamedInWords() {
        let account = PrintExportPlan.account(
            for: [
                Self.outcome("roads", "Roads", .drawn),
                Self.outcome("well-logs", "Well logs", .unsupported)
            ],
            swatch: { _ in nil }
        )

        #expect(account.legend.map(\.name) == ["Roads"])
        #expect(account.unsupported == ["Well logs"])
        let note = account.notes.first
        #expect(note?.contains("Well logs") == true)
        #expect(note?.contains("not evidence") == true)
        // And it is not folded in with a source that could not be reached,
        // which is a different thing to tell a reader.
        #expect(account.omitted.isEmpty)
    }

    /// Nor is it credited: the page does not carry its pixels.
    @Test func aLayerThePageCannotDrawIsNotCredited() throws {
        let roads = try #require(LayerCatalog.descriptor(for: .roads))
        let sources = PrintExportPlan.sources(
            baseMap: .standard,
            outcomes: [Self.outcome("roads", "Roads", .unsupported)],
            descriptor: { _ in roads }
        )

        #expect(sources.map(\.name) == ["Apple Maps"])
    }

    /// "The survey does not reach here" and "the survey found nothing here"
    /// are different statements about the same blank paper, and the page has to
    /// make the first one rather than let the reader make the second.
    @Test func aLayerThatReachesNoneOfThisGroundSaysSoInItsOwnWords() {
        let account = PrintExportPlan.account(
            for: [
                Self.outcome("roads", "Roads", .drawn),
                Self.outcome("fletcher", "Fletcher 1949", .outsideCoverage)
            ],
            swatch: { _ in nil }
        )

        #expect(account.legend.map(\.name) == ["Roads"])
        #expect(account.uncovered == ["Fletcher 1949"])
        let note = account.notes.first { $0.contains("Fletcher 1949") }
        #expect(note != nil)
        #expect(note?.contains("No coverage here") == true)
        #expect(note?.contains("not a finding about this place") == true)
        // Not a source that could not be reached, and not one the page cannot
        // draw. Those are three different things to tell a reader.
        #expect(account.omitted.isEmpty)
        #expect(account.unsupported.isEmpty)
    }

    /// A layer whose licence is unanswered was never fetched. Saying it printed
    /// nothing would be a claim about the ground; saying nothing at all would
    /// let the reader make that claim themselves.
    @Test func aLayerWhoseLicenceIsUnansweredSaysThatRatherThanNothing() {
        let account = PrintExportPlan.account(
            for: [Self.outcome("imagery", "Provincial imagery", .licenceBlocked)],
            swatch: { _ in nil }
        )

        #expect(account.legend.isEmpty)
        #expect(account.licenceBlocked == ["Provincial imagery"])
        let note = account.notes.first
        #expect(note?.contains("the licence has not been accepted") == true)
        #expect(note?.contains("not evidence") == true)
    }

    /// Neither put ink on the page, so neither is credited: an attribution is
    /// owed for use, and a layer that was never fetched — or that reaches none
    /// of this ground — was not used.
    @Test func aLayerThatPutNoInkOnThePageIsNotCredited() throws {
        let roads = try #require(LayerCatalog.descriptor(for: .roads))
        let sources = PrintExportPlan.sources(
            baseMap: .standard,
            outcomes: [
                Self.outcome("roads", "Roads", .outsideCoverage),
                Self.outcome("roads2", "Roads", .licenceBlocked)
            ],
            descriptor: { _ in roads }
        )

        #expect(sources.map(\.name) == ["Apple Maps"])
    }

    /// The disclaimer a licence obliges travels with the layer, because that is
    /// the obligation — naming the provider alone is not the statement the
    /// Province licence requires.
    @Test func theLicenceStatementIsCarriedNotSummarised() throws {
        let roads = try #require(LayerCatalog.descriptor(for: .roads))
        let sources = PrintExportPlan.sources(
            baseMap: .standard,
            outcomes: [Self.outcome("roads", "Roads", .drawn)],
            descriptor: { _ in roads }
        )

        let credit = NativeLayerTraits.attribution(for: roads)
        #expect(sources[1].attribution.contains(credit.disclaimer))
    }
}
