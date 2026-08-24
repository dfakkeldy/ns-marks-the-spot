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

        // The axis the paper does not grow comes back through a projection and
        // an unprojection, so it lands a few parts in a quadrillion of a degree
        // inside where it started — a distance the size of an atom. The claim
        // is that nothing is cropped, not that the arithmetic is exact.
        let slack = 1e-9
        #expect(bounds.north >= visible.north - slack)
        #expect(bounds.south <= visible.south + slack)
        #expect(bounds.west <= visible.west + slack)
        #expect(bounds.east >= visible.east - slack)
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

    /// A zoom-gated or still-loading layer is the one case where blank paper is
    /// recoverable: the reader can frame tighter, or wait, and print again. The
    /// page has to say which it is, and it has to say it is not a finding.
    @Test func aLayerSwitchedOnWithNothingToDrawSaysWhyAndSaysItIsNotAFinding() {
        let account = PrintExportPlan.account(
            for: [
                Self.outcome("roads", "Roads", .drawn),
                Self.outcome("zoning", "Zoning", .notDrawn(reason: "zoom to 12+ to load")),
                Self.outcome(
                    "wells", "Well logs", .notDrawn(reason: "source temporarily unavailable")
                )
            ],
            swatch: { _ in nil }
        )

        // Out of the legend: the legend names what is on the page.
        #expect(account.legend.map(\.name) == ["Roads"])
        #expect(
            account.notDrawn == [
                "Zoning (zoom to 12+ to load)",
                "Well logs (source temporarily unavailable)"
            ]
        )
        let note = account.notes.first { $0.contains("Zoning") }
        #expect(note != nil)
        #expect(note?.contains("zoom to 12+ to load") == true)
        #expect(note?.contains("source temporarily unavailable") == true)
        #expect(note?.contains("not evidence the layer has nothing at this place") == true)
        // Not a source that failed to draw what it had, and not one outside its
        // own coverage. Both of those are statements about the ground.
        #expect(account.omitted.isEmpty)
        #expect(account.uncovered.isEmpty)
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
                Self.outcome("roads2", "Roads", .licenceBlocked),
                Self.outcome("roads3", "Roads", .notDrawn(reason: "loading visible area"))
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

    /// A frame the user drew is already the paper's shape, so the export's own
    /// growth has nothing left to do. If it did, the page would cover ground
    /// outside the rectangle the user was shown — which is the whole point of
    /// letting them draw one.
    @Test(arguments: [PdfTemplate.ID.portrait, .landscape])
    func groundTheUserFramedIsTheGroundThatPrints(orientation: PdfTemplate.ID) {
        let template = PdfTemplate.template(orientation)
        let container = (width: 390.0, height: 844.0)
        let rect = PrintFrameGeometry.screenRect(
            container: container,
            aspect: template.mapFrameAspect,
            state: PrintFrameGeometry.FrameState(orientation: orientation)
        )
        let framed = PrintFrameGeometry.bounds(
            forFrame: rect, container: container,
            center: GeoPoint(lat: 46.15, lng: -61.3), zoom: 13
        )

        let printed = PrintExportPlan.bounds(covering: framed, mapFrame: template.mapFrame)

        #expect(abs(printed.north - framed.north) < 1e-9)
        #expect(abs(printed.south - framed.south) < 1e-9)
        #expect(abs(printed.east - framed.east) < 1e-9)
        #expect(abs(printed.west - framed.west) < 1e-9)
    }

}

/// The two documents one map page can become.
@Suite("Field sheet and research summary")
struct PrintDocumentKindTests {
    /// The appendix is the whole structural difference: everything else about
    /// the two pages is the same map.
    @Test func onlyTheResearchSummaryCarriesTheAppendix() {
        #expect(PrintDocumentKind.researchSummary.includesAppendix)
        #expect(!PrintDocumentKind.fieldSheet.includesAppendix)
    }

    /// A sheet carried onto the ground asks the reader to confirm what is
    /// there; a filed page lists what it is not. Swapping them would put a
    /// site-visit instruction on a document nobody is taking outside.
    @Test func eachDocumentCarriesItsOwnWarning() {
        #expect(PrintDocumentKind.fieldSheet.caveat.contains("on site"))
        #expect(PrintDocumentKind.researchSummary.caveat.contains("proof of absence"))
        #expect(PrintDocumentKind.fieldSheet.caveat != PrintDocumentKind.researchSummary.caveat)
    }

    /// The default name is also the filename, so a folder of exports can be
    /// told apart by the parcel each one is about.
    @Test func anUnnamedPageIsNamedAfterItsParcel() {
        #expect(
            PrintDocumentKind.researchSummary.defaultTitle(pid: "12345678")
                == "Parcel research summary — PID 12345678"
        )
        #expect(
            PrintDocumentKind.fieldSheet.defaultTitle(pid: "12345678")
                == "Parcel field sheet — PID 12345678"
        )
    }

    /// With no parcel open the page is a map of ground, not of a parcel. A
    /// title promising a PID it does not have would be a claim about which
    /// parcel the reader is looking at.
    @Test func aPageWithNoParcelDoesNotClaimOne() {
        for pid in [nil, ""] {
            #expect(!PrintDocumentKind.fieldSheet.defaultTitle(pid: pid).contains("PID"))
            #expect(!PrintDocumentKind.researchSummary.defaultTitle(pid: pid).contains("PID"))
        }
    }
}

/// The exported file's name, which now carries a PID the app did not choose.
@Suite("Naming the exported file")
struct PrintExportFilenameTests {
    /// A PID arrives from the parcel service exactly as the service wrote it,
    /// and a "/" in one asks the file system for a directory that is not there.
    /// The export would fail over something the user never typed.
    @Test func aPathSeparatorCannotReachTheFileSystem() {
        let name = PrintExport.filename(for: "Parcel field sheet — PID 12/345678")
        #expect(!name.contains("/"))
        #expect(name.contains("12"))
        #expect(name.contains("345678"))
    }

    /// The em dash the default title uses is a perfectly good file name
    /// character, and stripping it would be the port breaking its own titles.
    @Test func theDefaultTitleSurvivesIntact() {
        #expect(
            PrintExport.filename(for: "Parcel research summary — PID 12345678")
                == "Parcel research summary — PID 12345678"
        )
    }

    /// A leading dot hides the file in the folder the user filed it in.
    @Test func aHiddenFileIsNotWhatAnybodyAskedFor() {
        #expect(!PrintExport.filename(for: "..secret").hasPrefix("."))
    }

    /// A name past the file system's limit is refused outright, so the page is
    /// written under a shorter one rather than not at all.
    @Test func anOverlongTitleIsCutRatherThanRefused() {
        #expect(PrintExport.filename(for: String(repeating: "a", count: 400)).count <= 120)
    }

    /// A title that was nothing but forbidden characters still has to name a
    /// file.
    @Test func aTitleWithNothingLeftFallsBackToAName() {
        #expect(PrintExport.filename(for: "///") == "NS Marks map")
        #expect(PrintExport.filename(for: "") == "NS Marks map")
    }

    /// The browser dates the file it downloads. Two research summaries for one
    /// parcel, made a fortnight apart, are two documents about two different
    /// days' evidence, and whoever they are sent to has only the name to tell
    /// them apart.
    ///
    /// UTC, because the browser slices its ISO string, and a file named for a
    /// local day while the page inside says a UTC one is a disagreement nobody
    /// can resolve from the document.
    @Test func theFileCarriesTheDayThePageWasMade() {
        // 2026-08-23T23:30:00Z, which is already the 24th in Sydney and still
        // the 23rd in Halifax. The name follows the page.
        let generated = Date(timeIntervalSince1970: 1_787_527_800)
        #expect(
            PrintExport.filename(for: "Parcel research summary — PID 12345678", on: generated)
                == "Parcel research summary — PID 12345678 2026-08-23"
        )
        // The rules the undated name is under still apply to the title half.
        #expect(PrintExport.filename(for: "///", on: generated) == "NS Marks map 2026-08-23")
    }
}
