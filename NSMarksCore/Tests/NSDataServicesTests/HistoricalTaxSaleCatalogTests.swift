import Foundation
import Testing

@testable import NSDataServices

/// The historical record set: sales that have happened, and what was published
/// about them.
///
/// The tests that matter here are the ones about silence. A sale with no
/// published result, a notice row the result PDF never carried, and a listing
/// nobody could tie to a parcel all look like "nothing" in a data structure,
/// and each of them means something different to a reader.
@Suite("Historical tax-sale records")
struct HistoricalTaxSaleCatalogTests {
    private static let catalog = HistoricalTaxSaleCatalog.bundled

    @Test func theBundledDatasetsMatchTheManifestTheWebWrote() throws {
        let manifest = try SharedData.manifest()
        for dataset in [SharedData.Dataset.historicalTaxSales, .cbrmTaxSaleResults] {
            let entry = try #require(manifest.entry(for: dataset))
            let bytes = try SharedData.bytes(of: dataset)
            #expect(bytes.count == entry.bytes)
            #expect(SharedData.sha256(of: bytes) == entry.sha256)
        }
    }

    @Test func everythingThisBuildShipsIsReadable() {
        #expect(Self.catalog.unreadable.isEmpty)
        #expect(Self.catalog.events.isEmpty == false)
        #expect(Self.catalog.records.isEmpty == false)
    }

    /// 23 sales in the dataset plus CBRM's, reconciled at load.
    @Test func cbrmsResultsAreReconciledOntoItsOwnNotice() throws {
        #expect(Self.catalog.events.count == 24)
        #expect(Self.catalog.records.count == 481)

        let cbrm = try #require(Self.catalog.event(id: "cbrm-2026-07-21"))
        #expect(cbrm.resultStatus == .verified)
        #expect(cbrm.saleMethod == .publicAuction)
        #expect(cbrm.listingIdentifierLabel == "Lien")
        #expect(cbrm.resultURL?.absoluteString.hasPrefix("https://cbrm.ns.ca/") == true)

        let records = Self.catalog.records.filter { $0.eventID == cbrm.id }
        #expect(records.count == 67)
        #expect(records.count { $0.outcome == .sold } == 21)
        // 33 published rows without a printed bid plus 13 notice rows the
        // result PDF does not carry. Both are unknown, and neither is unsold.
        #expect(records.count { $0.outcome == .unknown } == 46)
        #expect(records.contains { $0.outcome == .unsold } == false)
    }

    /// A notice row the result document never carried says exactly that.
    @Test func aRowMissingFromTheResultPDFIsNotAFailureToSell() throws {
        let missing = try #require(
            Self.catalog.records.first {
                $0.eventID == "cbrm-2026-07-21" && $0.reviewState == .noticeVerified
            }
        )
        #expect(missing.outcome == .unknown)
        #expect(missing.winningBidCents == nil)
        #expect(
            missing.resultNote
                == "The official result PDF does not carry this notice row; no outcome or "
                    + "winning bid is inferred."
        )
    }

    /// The two invariants that stop a source being misquoted.
    @Test func aSoldRecordCarriesAPriceAndAnUnsoldOneCannot() {
        for record in Self.catalog.records {
            if record.outcome == .sold { #expect(record.winningBidCents != nil) }
            if record.outcome == .unsold { #expect(record.winningBidCents == nil) }
        }
    }

    /// A build whose dataset breaks a rule ships no records rather than the
    /// subset that happened to pass.
    @Test func aRecordThatWouldMisquoteItsSourceTakesTheWholeSetDown() {
        let event = Self.event()
        let broken = Self.record(eventID: event.id, outcome: .sold, winningBidCents: nil)
        #expect(throws: (any Error).self) {
            try HistoricalTaxSaleCatalog.validate(events: [event], records: [broken])
        }
    }

    @Test func aMatchMethodCannotBeClaimedForAListingThatWasNotMatched() {
        let event = Self.event()
        let broken = HistoricalTaxSaleRecord(
            eventID: event.id,
            recordID: "r1",
            listingIdentifier: "1",
            pids: ["11111111"],
            civicDescription: "Somewhere",
            advertisedAmountCents: 1000,
            winningBidCents: nil,
            outcome: .unknown,
            redemptionLabel: "Redeemable",
            nsprdMatchStatus: .ambiguous,
            nsprdMatchMethod: .exactOfficialPID,
            reviewState: .needsReview
        )
        #expect(throws: (any Error).self) {
            try HistoricalTaxSaleCatalog.validate(events: [event], records: [broken])
        }
    }

    /// A verified sale must carry the document that verified it.
    @Test func aVerifiedSaleWithoutAResultReceiptIsRefused() {
        let event = HistoricalTaxSaleEvent(
            id: "test-2024-01-01",
            municipalityID: "test",
            municipality: "Test",
            shortMunicipality: "Test",
            saleDate: "2024-01-01",
            saleMethod: .publicAuction,
            listingIdentifierLabel: "Lien",
            advertisedAmountLabel: "Minimum bid",
            noticeURL: URL(string: "https://example.test/notice.pdf")!,
            resultStatus: .verified,
            retrievedOn: "2024-02-01",
            noticeSnapshotDate: "2023-12-01",
            noticeSHA256: String(repeating: "a", count: 64),
            sourceNotes: ""
        )
        #expect(throws: (any Error).self) {
            try HistoricalTaxSaleCatalog.validate(events: [event], records: [])
        }
    }

    // MARK: - What the panel and the card read

    /// Only matched listings are worth a parcel request. An ambiguous one has
    /// no parcel this build is willing to name.
    @Test func onlyMatchedRecordsOfferAPIDToDraw() {
        let event = Self.event()
        let matched = Self.record(eventID: event.id, pids: ["11111111"])
        let ambiguous = HistoricalTaxSaleRecord(
            eventID: event.id,
            recordID: "r2",
            listingIdentifier: "2",
            pids: ["22222222"],
            civicDescription: "Elsewhere",
            advertisedAmountCents: 1000,
            winningBidCents: nil,
            outcome: .unknown,
            redemptionLabel: "Redeemable",
            nsprdMatchStatus: .ambiguous,
            nsprdMatchMethod: .none,
            reviewState: .needsReview
        )
        let catalog = HistoricalTaxSaleCatalog(
            events: [event],
            records: [matched, ambiguous]
        )
        #expect(catalog.matchedPIDs() == ["11111111"])
        // Still readable on the parcel it names, if the user gets there by
        // another route: the record exists, it is the map draw that is refused.
        #expect(catalog.contexts(forPID: "22222222").count == 1)
    }

    @Test func filtersNarrowByMunicipalityYearAndOutcome() {
        let filtered = Self.catalog.records(
            matching: .init(municipalityID: "halifax-regional-municipality", year: "2022")
        )
        #expect(filtered.isEmpty == false)
        for record in filtered {
            let event = Self.catalog.event(id: record.eventID)
            #expect(event?.municipalityID == "halifax-regional-municipality")
            #expect(event?.saleYear == "2022")
        }

        let sold = Self.catalog.records(matching: .init(outcome: .sold))
        #expect(sold.allSatisfy { $0.outcome == .sold })
        #expect(sold.count < Self.catalog.records.count)
    }

    /// The filter offers only outcomes that are in the set. Offering
    /// "Cancelled" when nothing was cancelled invites the reader to run a
    /// search and read the empty result as a finding.
    /// The one sale whose method the web's type does not cover keeps the word
    /// its municipality used, instead of being labelled as the other kind of
    /// sale entirely.
    @Test func anUnrecognisedSaleMethodKeepsTheSourcesOwnWord() throws {
        let pictou = try #require(Self.catalog.event(id: "pictou-2026-04-10"))
        #expect(pictou.saleMethod.rawValue == "public-tender")
        #expect(pictou.saleMethod.label == "Public tender")
        #expect(HistoricalSaleMethod.sealedTender.label == "Sealed tender")
    }

    @Test func onlyOutcomesPresentInTheDataAreOffered() {
        #expect(Self.catalog.outcomes.contains(.sold))
        #expect(Self.catalog.outcomes.contains(.cancelled) == false)
        #expect(Self.catalog.years.first == "2026")
    }

    // MARK: - What a card says where a number is missing

    @Test func anUnpublishedBidIsNotRenderedAsZeroOrAsNoBids() {
        let event = Self.event()
        let context = HistoricalRecordContext(
            event: event,
            record: Self.record(eventID: event.id, outcome: .unknown, winningBidCents: nil)
        )
        #expect(context.winningBidLabel == "Not published in verified sources")
        #expect(context.financialComparison == nil)
        #expect(context.outcomeLabel == "Outcome unknown")
    }

    @Test func aPublishedNoBidsResultSaysSoInItsOwnWords() {
        let event = Self.event()
        let context = HistoricalRecordContext(
            event: event,
            record: Self.record(eventID: event.id, outcome: .unsold, winningBidCents: nil)
        )
        #expect(context.winningBidLabel == "No winning bid - official result says no bids")
    }

    /// A sale nobody has published results for claims no outcome at all.
    @Test func aSaleAwaitingResultsClaimsNothingAboutWhatHappened() {
        let event = HistoricalTaxSaleEvent(
            id: "test-2026-05-01",
            municipalityID: "test",
            municipality: "Test",
            shortMunicipality: "Test",
            saleDate: "2026-05-01",
            saleMethod: .publicAuction,
            listingIdentifierLabel: "Lien",
            advertisedAmountLabel: "Minimum bid",
            noticeURL: URL(string: "https://example.test/notice.pdf")!,
            landingPageURL: URL(string: "https://example.test/tax-sale")!,
            resultStatus: .awaitingOfficialResults,
            retrievedOn: "2026-05-02",
            noticeSnapshotDate: "2026-04-01",
            resultCheckedOn: "2026-05-02",
            noticeSHA256: String(repeating: "a", count: 64),
            sourceNotes: ""
        )
        let context = HistoricalRecordContext(
            event: event,
            record: Self.record(eventID: event.id, outcome: .unknown, winningBidCents: nil)
        )
        #expect(context.outcomeLabel == "Outcome pending")
        #expect(context.winningBidLabel == "Awaiting official results")
        #expect(context.limitNote.contains("no result is claimed"))
    }

    /// The arithmetic the web does, to the same two decimals.
    @Test func theComparisonIsTakenOnlyWhereBothNumbersWerePublished() {
        let event = Self.event()
        let context = HistoricalRecordContext(
            event: event,
            record: Self.record(
                eventID: event.id,
                outcome: .sold,
                advertisedAmountCents: 189_905,
                winningBidCents: 1_250_000
            )
        )
        let comparison = context.financialComparison
        #expect(comparison?.differenceCents == 1_060_095)
        #expect(comparison?.percentageAbove == 558.22)
        #expect(comparison?.winningBidMultiple == 6.58)
    }

    /// The catalogue hands the same record to every PID it names, so the
    /// caveat has to travel with the money or three parcels each read $12,500
    /// as their own price.
    @Test func aListingCoveringSeveralParcelsSaysSoWhereTheMoneyIs() {
        let event = Self.event()
        let bundled = HistoricalRecordContext(
            event: event,
            record: Self.record(
                eventID: event.id, pids: ["00522755", "40630923", "40630949"]
            )
        )
        let note = bundled.multiPIDNote
        #expect(note?.contains("covers 3 PIDs") == true)
        #expect(note?.contains("00522755, 40630923, 40630949") == true)
        #expect(note?.contains("not divided between parcels") == true)

        let single = HistoricalRecordContext(
            event: event, record: Self.record(eventID: event.id)
        )
        #expect(single.multiPIDNote == nil)
    }

    /// Ingest date and capture date are different facts, and only one of them
    /// says how stale the outcome is.
    @Test func theCardGivesTheCaptureDatesAsWellAsTheIngestDate() {
        let context = HistoricalRecordContext(
            event: Self.event(), record: Self.record(eventID: "test-2024-01-01")
        )
        let summary = context.sourceSnapshotSummary
        #expect(summary.hasPrefix("Notice \(TaxSaleFormat.day("2023-12-01"))"))
        #expect(summary.hasSuffix("result \(TaxSaleFormat.day("2024-01-15"))"))
        // The point of the row: the day the build ingested this is not the day
        // anybody captured it, and 2024-02-01 has no business in a capture date.
        #expect(!summary.contains(TaxSaleFormat.day("2024-02-01")))
    }

    /// A sale nobody published results for was *looked* at on a day. That is
    /// not a result captured on it, and the card must not read as though it
    /// were.
    @Test func aSaleWithNoResultDocumentSaysWhenItWasChecked() {
        let pending = HistoricalTaxSaleEvent(
            id: "test-2024-01-01",
            municipalityID: "test",
            municipality: "Municipality of Test",
            shortMunicipality: "Test",
            saleDate: "2024-01-01",
            saleMethod: .publicAuction,
            listingIdentifierLabel: "Lien",
            advertisedAmountLabel: "Minimum bid",
            noticeURL: URL(string: "https://example.test/notice.pdf")!,
            resultStatus: .awaitingOfficialResults,
            resultURL: nil,
            retrievedOn: "2024-02-01",
            noticeSnapshotDate: "2023-12-01",
            resultSnapshotDate: nil,
            resultCheckedOn: "2024-03-04",
            noticeSHA256: String(repeating: "a", count: 64),
            resultSHA256: nil,
            sourceNotes: ""
        )
        let context = HistoricalRecordContext(
            event: pending, record: Self.record(eventID: pending.id, winningBidCents: nil)
        )
        let summary = context.sourceSnapshotSummary
        #expect(summary.contains("results checked \(TaxSaleFormat.day("2024-03-04"))"))
        #expect(!summary.contains("· result \(TaxSaleFormat.day("2024-03-04"))"))
    }

    // MARK: - Fixtures

    private static func event(id: String = "test-2024-01-01") -> HistoricalTaxSaleEvent {
        HistoricalTaxSaleEvent(
            id: id,
            municipalityID: "test",
            municipality: "Municipality of Test",
            shortMunicipality: "Test",
            saleDate: "2024-01-01",
            saleMethod: .publicAuction,
            listingIdentifierLabel: "Lien",
            advertisedAmountLabel: "Minimum bid",
            noticeURL: URL(string: "https://example.test/notice.pdf")!,
            resultStatus: .verified,
            resultURL: URL(string: "https://example.test/results.pdf")!,
            retrievedOn: "2024-02-01",
            noticeSnapshotDate: "2023-12-01",
            resultSnapshotDate: "2024-01-15",
            noticeSHA256: String(repeating: "a", count: 64),
            resultSHA256: String(repeating: "b", count: 64),
            sourceNotes: ""
        )
    }

    private static func record(
        eventID: String,
        pids: [String] = ["11111111"],
        outcome: HistoricalOutcome = .sold,
        advertisedAmountCents: Int = 100_000,
        winningBidCents: Int? = 200_000
    ) -> HistoricalTaxSaleRecord {
        HistoricalTaxSaleRecord(
            eventID: eventID,
            recordID: "r1",
            listingIdentifier: "1",
            pids: pids,
            civicDescription: "Somewhere",
            advertisedAmountCents: advertisedAmountCents,
            winningBidCents: winningBidCents,
            outcome: outcome,
            redemptionLabel: "Redeemable",
            nsprdMatchStatus: .matched,
            nsprdMatchMethod: .exactOfficialPID,
            reviewState: .visuallyVerified
        )
    }
}
