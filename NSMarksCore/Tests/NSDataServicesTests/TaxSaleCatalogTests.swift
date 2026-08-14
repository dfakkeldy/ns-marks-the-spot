import Foundation
import Testing
@testable import NSDataServices

/// The bundled tax-sale notices.
///
/// These tests are the reason the snapshots are bundled rather than re-keyed:
/// they check the app's numbers against the manifest the web wrote, so a
/// dataset that drifts from the web's bytes fails here instead of shipping.
struct TaxSaleCatalogTests {
    @Test func everyBundledDatasetHashesToWhatTheManifestPinned() throws {
        let manifest = try SharedData.manifest()

        for dataset in SharedData.Dataset.allCases {
            let bytes = try SharedData.bytes(of: dataset)
            let entry = try #require(
                manifest.entry(for: dataset),
                "\(dataset.rawValue) is bundled but not in the manifest"
            )
            #expect(bytes.count == entry.bytes)
            #expect(SharedData.sha256(of: bytes) == entry.sha256)
        }
    }

    @Test func allFourNoticesDecode() {
        let catalog = TaxSaleCatalog.bundled

        #expect(catalog.unreadableDatasets.isEmpty)
        #expect(catalog.events.map(\.id) == [
            "cbrm-2026-07-21",
            "inverness-county-2026-08-11",
            "middleton-2026-08-20",
            "annapolis-county-2026-08-31",
        ])
    }

    @Test func theInvernessBookCarriesEveryLienItAdvertised() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "inverness-county-2026-08-11"))

        // The snapshot's own counts, which the notice printed.
        #expect(event.listings.count == 45)
        #expect(event.pids.count == 47)
        #expect(event.eventType == .publicAuction)
        #expect(event.publishedOn == "2026-07-16")
        #expect(event.retrievedOn == "2026-08-10")

        let first = try #require(event.listings.first)
        #expect(first.lien == "1")
        #expect(first.aan == "00603988")
        #expect(first.location == "Highway 19, Mabou")
        #expect(first.financial.kind == .totalArrears)
        #expect(first.financial.amountCents == 1_552_915)
        #expect(first.redemptionCategory == .notRedeemable)
    }

    @Test func aWithdrawnListingIsNotDrawnButIsStillListed() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "inverness-county-2026-08-11"))
        let withdrawn = event.listings.filter { $0.listingStatus == .withdrawn }
        #expect(!withdrawn.isEmpty)

        let withdrawnPIDs = Set(withdrawn.flatMap(\.pids))
        #expect(withdrawnPIDs.isDisjoint(with: Set(event.advertisedPIDs)))
        #expect(Set(event.pids).isSuperset(of: withdrawnPIDs))
    }

    @Test func annapolisSaysTheRedemptionPeriodIsUnstatedRatherThanAbsent() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "annapolis-county-2026-08-31"))
        let listing = try #require(event.listings.first)

        #expect(event.eventType == .sealedTender)
        #expect(listing.redemptionCategory == .sixMonth)
        #expect(listing.redemptionLabel == "Redeemable - 6 months")
        // The eight-digit forms from the Property Online map, so an exact NSPRD
        // match is possible at all.
        #expect(listing.aan == "09153144")
        #expect(listing.pids == ["05266937"])
        #expect(listing.financial.label == "Minimum bid (plus HST on the total bid)")
        #expect(listing.financial.amountCents == 100)
    }

    @Test func middletonKeepsItsAmountLabelledAsUnconfirmed() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "middleton-2026-08-20"))

        #expect(event.listings.count == 3)
        #expect(event.venue == "Town Hall Council Chambers - 131 Commercial Street, Middleton")
        for listing in event.listings {
            #expect(listing.financial.kind == .recoveryAmount)
            #expect(listing.financial.label == "Total due (subject to municipal confirmation)")
        }
        #expect(event.listings.map(\.financial.amountCents) == [1_183_095, 8_351_154, 1_536_838])
        #expect(event.listings.last?.redemptionCategory == .notRedeemable)
    }

    @Test func cbrmIsCarriedAsHistoryRatherThanAnOffering() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "cbrm-2026-07-21"))

        #expect(event.eventStatus == .historical)
        #expect(event.listings.count == 67)
        #expect(event.pids.count == 68)
        #expect(event.lifecycle(now: .distantPast) == .historical)
        #expect(event.listings.map(\.financial.amountCents).reduce(0, +) == 65_385_810)
        #expect(TaxSaleCatalog.bundled.events(status: .upcoming).count == 3)
    }

    @Test func aPassedSaleDateAsksForVerificationRatherThanClaimingAResult() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "middleton-2026-08-20"))
        let saleStart = try #require(event.saleStartsAt)

        #expect(event.lifecycle(now: saleStart.addingTimeInterval(-1)) == .upcoming)
        #expect(event.lifecycle(now: saleStart) == .verifyResults)
        #expect(event.lifecycle(now: saleStart.addingTimeInterval(60)) == .verifyResults)
    }

    @Test func onlyCurrentNoticesAnswerForAParcel() throws {
        let catalog = TaxSaleCatalog.bundled
        let middleton = try #require(catalog.event(id: "middleton-2026-08-20"))
        let cbrm = try #require(catalog.event(id: "cbrm-2026-07-21"))

        let context = try #require(catalog.listingContext(forPID: "05078472"))
        #expect(context.event.id == middleton.id)
        #expect(context.listing.location == "Dwelling, 12-16 Bridge Street, Middleton")

        // In a past notice, so answering with it would read as "for sale".
        let past = try #require(cbrm.listings.first?.pids.first)
        #expect(catalog.listingContext(forPID: past) == nil)
        #expect(catalog.listingContext(forPID: "00000000") == nil)
    }

    @Test func theMapDrawsOnlyWhatIsStillAdvertised() {
        let upcoming = TaxSaleCatalog.bundled.events(status: .upcoming)
        let advertised = TaxSaleCatalog.advertisedPIDs(for: upcoming)
        let all = TaxSaleCatalog.pids(for: upcoming)

        #expect(advertised.count < all.count)
        #expect(Set(advertised).isSubset(of: Set(all)))
        #expect(advertised.count == Set(advertised).count)
    }

    @Test func theRedemptionFilterCountsWhatItWouldLeave() throws {
        let listings = TaxSaleCatalog.bundled
            .events(status: .upcoming)
            .flatMap(\.listings)
        let counts = RedemptionFilter.counts(in: listings)

        #expect(counts[.all] == listings.count)
        // Every listing lands in exactly one of the two grouped choices, or in
        // neither.
        let unstated = listings.count { $0.redemptionCategory == .unknown }
        #expect(
            (counts[.redemption] ?? 0) + (counts[.immediateOrNone] ?? 0) + unstated
                == listings.count
        )
    }

    @Test func anUnstatedRedemptionPeriodIsNotFiledUnderNone() {
        // "Immediate / none" is a claim about what the notice said. A notice
        // that said nothing has not said there is no redemption, so it belongs
        // in neither grouped choice.
        let unstated = TaxSaleListing(
            eventID: "event",
            recordID: "record",
            pids: ["00000000"],
            location: "Somewhere",
            financial: MunicipalFinancialField(
                kind: .minimumBid, label: "Minimum bid", amountCents: 100
            ),
            redemptionCategory: .unknown,
            redemptionLabel: "Redemption period not stated",
            listingStatus: .advertised
        )

        #expect(RedemptionFilter.all.matches(unstated))
        #expect(RedemptionFilter.redemption.matches(unstated) == false)
        #expect(RedemptionFilter.immediateOrNone.matches(unstated) == false)
    }
}
