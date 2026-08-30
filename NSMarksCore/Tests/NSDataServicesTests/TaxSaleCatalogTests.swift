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

    @Test func everyNoticeTheWebCarriesDecodes() {
        let catalog = TaxSaleCatalog.bundled

        #expect(catalog.unreadableDatasets.isEmpty)
        // The web's own order, which is the order the panel lists them in.
        #expect(catalog.events.map(\.id) == [
            "cbrm-2026-07-21",
            "inverness-county-2026-08-11",
            "middleton-2026-08-20",
            "annapolis-county-2026-08-31",
            "victoria-county-2026-09-14",
            "halifax-2026-09-15",
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

        #expect(event.listings.count == 2)
        #expect(event.venue == "Town Hall Council Chambers - 131 Commercial Street, Middleton")
        for listing in event.listings {
            #expect(listing.financial.kind == .recoveryAmount)
            #expect(listing.financial.label == "Total due (subject to municipal confirmation)")
        }
        #expect(event.listings.map(\.financial.amountCents) == [8_351_154, 1_536_838])
        #expect(event.listings.last?.redemptionCategory == .notRedeemable)
    }

    @Test func middletonIsCarriedAsHistoryOnceItsSaleHasHappened() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "middleton-2026-08-20"))

        #expect(event.eventStatus == .historical)
        // The August 18 snapshot, which dropped the item the town withdrew
        // between publications. A PID no longer in the notice must not be
        // answerable from it at all.
        #expect(event.pids == ["05193040", "05030911"])
        #expect(TaxSaleCatalog.bundled.listingContext(forPID: "05078472") == nil)
    }

    @Test func victoriaCarriesItsSevenItemsAsAmountsOwing() throws {
        let event = try #require(
            TaxSaleCatalog.bundled.event(id: "victoria-county-2026-09-14")
        )

        #expect(event.listings.count == 7)
        #expect(event.eventType == .sealedTender)
        #expect(event.publishedOn == "2026-08-13")
        // What the county owes itself, not a price. Labelling it a minimum bid
        // would invent a floor the notice never set.
        for listing in event.listings {
            #expect(listing.financial.kind == .recoveryAmount)
            #expect(listing.financial.label == "Total owing (subject to municipal confirmation)")
        }

        let context = try #require(
            TaxSaleCatalog.bundled.listingContext(forPID: event.listings[0].pids[0])
        )
        #expect(context.event.id == event.id)
    }

    @Test func halifaxKeepsTheRowsNSPRDWillNotDrawOutOfTheMappedList() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "halifax-2026-09-15"))

        // Twenty-eight rows in Schedule A; two of them have no exact NSPRD
        // parcel, so they are carried as exceptions rather than as listings a
        // reader could select on the map.
        #expect(event.listings.count == 26)
        #expect(event.geometryExceptions.count == 2)
        #expect(event.geometryExceptions.map(\.aan) == ["09417036", "09417044"])
        #expect(event.geometryExceptions.flatMap(\.pids) == ["41051889", "41051897"])
        for exception in event.geometryExceptions {
            #expect(exception.reason == .noNSPRDGeometry)
            #expect(exception.checkedOn == "2026-08-15")
            // Still an official row, so it keeps the record id its listing had.
            #expect(exception.recordID.hasPrefix("halifax-2026-09-15-item-"))
        }

        // An excepted PID is not answerable as a mapped parcel, which is the
        // whole point of holding it apart.
        #expect(TaxSaleCatalog.bundled.listingContext(forPID: "41051889") == nil)
        #expect(!event.pids.contains("41051889"))
    }

    @Test func cbrmIsCarriedAsHistoryRatherThanAnOffering() throws {
        let event = try #require(TaxSaleCatalog.bundled.event(id: "cbrm-2026-07-21"))

        #expect(event.eventStatus == .historical)
        #expect(event.listings.count == 67)
        #expect(event.pids.count == 68)
        #expect(event.lifecycle(now: .distantPast) == .historical)
        #expect(event.listings.map(\.financial.amountCents).reduce(0, +) == 65_385_810)
        #expect(TaxSaleCatalog.bundled.events(status: .upcoming).count == 4)
    }

    @Test func aPassedSaleDateAsksForVerificationRatherThanClaimingAResult() throws {
        let event = try #require(
            TaxSaleCatalog.bundled.event(id: "inverness-county-2026-08-11")
        )
        let saleStart = try #require(event.saleStartsAt)

        #expect(event.lifecycle(now: saleStart.addingTimeInterval(-1)) == .upcoming)
        #expect(event.lifecycle(now: saleStart) == .verifyResults)
        #expect(event.lifecycle(now: saleStart.addingTimeInterval(60)) == .verifyResults)
    }

    @Test func onlyCurrentNoticesAnswerForAParcel() throws {
        let catalog = TaxSaleCatalog.bundled
        let inverness = try #require(catalog.event(id: "inverness-county-2026-08-11"))
        let cbrm = try #require(catalog.event(id: "cbrm-2026-07-21"))

        let context = try #require(catalog.listingContext(forPID: "50203256"))
        #expect(context.event.id == inverness.id)
        #expect(context.listing.location == "Highway 19, Mabou")

        // In past notices, so answering with either would read as "for sale".
        let past = try #require(cbrm.listings.first?.pids.first)
        #expect(catalog.listingContext(forPID: past) == nil)
        #expect(catalog.listingContext(forPID: "05193040") == nil)
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
