import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// What separates a research summary from a field sheet, and what the app says
/// while it cannot make one yet.
@Suite("The research summary and its evidence")
struct PrintResearchSummaryTests {
    private static func answered(_ inspection: inout ParcelInspection) {
        inspection.civicAddresses = .ready(
            CivicAddressResponse.Reading(addresses: [], unreadableRows: 0)
        )
        inspection.buildings = .ready(ParcelBuildingCount(points: 0, polygons: 0))
        inspection.mappedContext = .ready(ParcelContext())
        inspection.floodHazard = .ready(
            ParcelFloodHazard(river: .outsidePublishedExtents, coastal: [])
        )
        inspection.assessments = .ready(
            PVSCAssessmentResponse.Result(matchMethod: .spatial, accounts: [])
        )
        inspection.dwellings = .ready(PVSCDwellingResponse.Result(accounts: []))
        inspection.resources = .ready(ParcelResourceIntersections(sources: []))
    }

    private static func settled() -> ParcelInspection {
        var inspection = ParcelInspection(pid: "15234636", mappedArea: nil, boundaryNotice: nil)
        answered(&inspection)
        return inspection
    }

    /// The sheet used to say no source had answered whenever one had not, which
    /// is a different claim and, with six of seven in hand, a false one.
    @Test("Only the sources still looking are named as pending")
    func onlyTheSourcesStillLookingAreNamedAsPending() {
        var inspection = Self.settled()
        #expect(ParcelEvidenceExport.pending(inspection).isEmpty)

        inspection.floodHazard = .looking
        #expect(ParcelEvidenceExport.pending(inspection) == ["Flood evidence"])

        inspection.civicAddresses = .looking
        #expect(
            ParcelEvidenceExport.pending(inspection)
                == ["Authoritative mapped civic points", "Flood evidence"]
        )
    }

    /// A source that answered with nothing, and one that could not be reached,
    /// have both answered. Waiting on either would hold the appendix forever.
    @Test("A source that answered with nothing is not pending")
    func aSourceThatAnsweredWithNothingIsNotPending() {
        var inspection = Self.settled()
        inspection.resources = .unavailable("The service did not answer.")
        #expect(ParcelEvidenceExport.pending(inspection).isEmpty)
        #expect(ParcelEvidenceExport.isReady(inspection))
    }

    @Test("Pending sources are named in the order the note lists them")
    func pendingSourcesAreNamedInTheOrderTheNoteListsThem() {
        let inspection = ParcelInspection(
            pid: "15234636", mappedArea: nil, boundaryNotice: nil
        )
        #expect(
            ParcelEvidenceExport.pending(inspection) == [
                "Authoritative mapped civic points",
                "Mapped buildings",
                "Mapped roads and water",
                "Flood evidence",
                "PVSC assessment accounts",
                "PVSC residential dwelling records",
                "Geology and resource context",
            ]
        )
    }
}

/// A page named for evidence that is going out without any.
@Suite("A research summary printed without its appendix")
@MainActor
struct PrintWithheldAppendixTests {
    private static let framed = GeoBoundingBox(
        south: 45.6, west: -61.4, north: 45.7, east: -61.3
    )

    private static let withheld =
        "The evidence appendix was left off this page. What each source answered, "
        + "what it returned nothing for, and what was never asked are not on this "
        + "document."

    private func request(appendixWithheld: Bool) -> PrintExportRequest? {
        OverlayViewModel.forTesting(installing: [.nsprd]).printExportRequest(
            template: PdfTemplate.template(.portrait),
            fields: PdfComposer.Fields(title: "Sheet", subtitle: "", notes: ""),
            includesAppendix: false,
            appendixWithheld: appendixWithheld,
            caveat: PrintExport.screeningCaveat,
            frame: Self.framed
        )
    }

    /// The appendix is the whole of what a research summary carries beyond a
    /// field sheet. Dropped silently, the title stands for evidence the page
    /// does not have, and a reader cannot tell that from a parcel nothing was
    /// found for.
    @Test("The page says the evidence pages were left off")
    func thePageSaysTheEvidencePagesWereLeftOff() throws {
        let printed = try #require(request(appendixWithheld: true))
        #expect(printed.disclosures.contains(Self.withheld))
        // Behind the caveat, which is what the reader must not conclude and
        // comes before what this particular page is missing.
        #expect(printed.disclosures.first == PrintExport.screeningCaveat)
    }

    /// A field sheet was never going to carry one, so there is nothing to
    /// admit and the sentence would only confuse.
    @Test("A page that was never going to carry an appendix says nothing")
    func aPageThatWasNeverGoingToCarryAnAppendixSaysNothing() throws {
        let printed = try #require(request(appendixWithheld: false))
        #expect(!printed.disclosures.contains(Self.withheld))
    }
}
