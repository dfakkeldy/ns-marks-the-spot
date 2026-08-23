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

    private static func input(_ inspection: ParcelInspection) throws -> EvidenceNoteInput {
        ParcelEvidenceExport.input(
            generatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            inspection: inspection,
            taxSaleEnabled: false,
            mode: .current,
            shareURL: try #require(URL(string: "https://example.invalid/map")),
            position: MapPosition(latitude: 45.6, longitude: -61.4, zoom: 15),
            activeLayers: [],
            baseMap: .standard,
            fletcherBaseURL: nil
        )
    }

    /// What the note calls a source that was asked and never answered.
    private static let waiting = "This source had not answered when the note was written."

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

    /// The wait is not open-ended, and what comes out of it has to be readable
    /// as a report made early rather than as a parcel with nothing behind it.
    @Test("A note written while a source was out says so, source by source")
    func aNoteWrittenEarlySaysWhichSourcesWereStillOut() throws {
        var inspection = Self.settled()
        inspection.civicAddresses = .looking
        inspection.resources = .looking

        let input = try Self.input(inspection)

        // Not "no civic address on this parcel", which is a finding, and not
        // "the source was unavailable", which is a claim about the service.
        #expect(input.civicNotice == Self.waiting)
        #expect(input.resourceNotice == Self.waiting)
        #expect(input.civicAddresses.isEmpty)
        #expect(EvidenceNote.build(input).markdown.contains(Self.waiting))
    }

    /// The two PVSC sources had only two states to arrive in, so a lookup still
    /// in flight was written down as a source that had failed. A reader can act
    /// on a failure — ask again later, or go to the counter — and acting on the
    /// wrong one of those wastes the trip.
    @Test("A PVSC source still out is not reported as one that failed")
    func aPvscSourceStillOutIsNotReportedAsOneThatFailed() throws {
        var inspection = Self.settled()
        inspection.assessments = .looking
        inspection.dwellings = .looking

        let input = try Self.input(inspection)
        #expect(input.assessmentEvidence == .stillOut)
        #expect(input.dwellingEvidence == .stillOut)

        let markdown = EvidenceNote.build(input).markdown
        #expect(markdown.contains("PVSC assessment had not answered when the note was written."))
        #expect(
            markdown.contains("PVSC residential dwelling had not answered when the note was written.")
        )
        #expect(markdown.contains("source unavailable at export time") == false)
        // And nothing here reads as an answer about the parcel.
        #expect(markdown.contains("No PVSC assessment account point was returned") == false)

        // A source that did answer, badly, still says so.
        var failed = Self.settled()
        failed.assessments = .unavailable("The assessment service did not answer.")
        failed.dwellings = .unavailable("The dwelling service did not answer.")
        let unavailable = try Self.input(failed)
        #expect(unavailable.assessmentEvidence == .error)
        #expect(unavailable.dwellingEvidence == .error)
    }

    /// The three geology sources are asked as one request and answer as one, so
    /// a wait that ran out leaves nothing to list them from. Named from the
    /// query's own roll instead: "geology and resource context is missing" does
    /// not tell a reader which of the three it was, or where to go and ask it.
    @Test("A geology lookup still out still names its three sources")
    func aGeologyLookupStillOutStillNamesItsThreeSources() throws {
        var inspection = Self.settled()
        inspection.resources = .looking

        let input = try Self.input(inspection)
        #expect(
            input.resourceResults.map(\.name)
                == ["Mineral occurrences", "Mineral tenure", "Abandoned mine openings"]
        )
        #expect(input.resourceResults.allSatisfy { $0.status == .error })
        #expect(input.resourceResults.allSatisfy { $0.errorMessage == Self.waiting })
        #expect(input.resourceResults.allSatisfy { $0.results.isEmpty })
        // Each one traceable, which is the point of naming them at all.
        #expect(input.resourceResults.allSatisfy { $0.attribution?.isEmpty == false })

        let markdown = EvidenceNote.build(input).markdown
        #expect(markdown.contains("Mineral tenure"))
        #expect(markdown.contains("Abandoned mine openings"))
    }

    /// Per-source lines in an appendix somebody may never reach are not the
    /// same as telling them on the front page.
    @Test("A page made early names the sources that never answered")
    func aPageMadeEarlyNamesTheSourcesThatNeverAnswered() throws {
        #expect(ParcelEvidenceExport.stillOutDisclosure([]) == nil)

        let sentence = try #require(
            ParcelEvidenceExport.stillOutDisclosure(
                ["Flood evidence", "Geology and resource context"]
            )
        )
        #expect(sentence.contains("Flood evidence and Geology and resource context"))
        #expect(sentence.contains("not a finding about this parcel"))
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
