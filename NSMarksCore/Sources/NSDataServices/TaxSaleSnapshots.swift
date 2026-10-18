import Foundation

/// Decoders for the bundled municipal tax-sale snapshots.
///
/// One decoder per municipality, because one shape per municipality is the
/// truth: Inverness prints a lien number and a recovery amount, Middleton an
/// item number and a total due, Annapolis a tender item and a minimum bid plus
/// HST, CBRM a lien number and a minimum bid. The mapping each performs is the
/// same mapping `web/src/data/*TaxSale.ts` performs, field for field.
///
/// The `datasetSHA256` each builder is handed is the manifest's hash of the
/// bundled file. It is a receipt for this project's transcription of the
/// municipal document, not a hash of the municipal document itself — the
/// notices are PDFs and rewritten HTML pages, and the snapshots record their
/// own source URLs and archived copies for that.
enum TaxSaleSnapshots {
    struct Unreadable: Error, Equatable, Sendable {
        let field: String
    }

    // MARK: - Inverness County

    static func inverness(_ bytes: Data, datasetSHA256: String?) throws -> TaxSaleEvent {
        struct Snapshot: Decodable {
            struct Listing: Decodable {
                let lien: Int
                let aan: String
                let location: String
                let recoveryAmount: Double
                let redeemable: Bool
                let pids: [String]
                let listingStatus: String
            }

            let publishedDate: String
            let retrievedDate: String
            let source: String
            let listings: [Listing]
        }

        let snapshot = try JSONDecoder().decode(Snapshot.self, from: bytes)
        let id = "inverness-county-2026-08-11"

        return TaxSaleEvent(
            id: id,
            municipalityID: "inverness-county",
            municipality: "Municipality of the County of Inverness",
            shortMunicipality: "Inverness County",
            eventType: .publicAuction,
            eventStatus: .upcoming,
            // Both from the notice prose rather than its table.
            saleStartsAt: try instant("2026-08-11T09:30:00-03:00"),
            venue: "St. Peter's Parish Hall, 260 Main Street, Port Hood",
            sourceURL: try url(snapshot.source),
            sourceLabel: "Official Inverness County notice",
            publishedOn: snapshot.publishedDate,
            retrievedOn: snapshot.retrievedDate,
            sourceDatasetSHA256: datasetSHA256,
            listings: snapshot.listings.map { listing in
                TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-lien-\(listing.lien)",
                    lien: String(listing.lien),
                    aan: listing.aan,
                    pids: listing.pids,
                    location: listing.location,
                    financial: MunicipalFinancialField(
                        kind: .totalArrears,
                        label: "Total arrears",
                        amountCents: cents(listing.recoveryAmount)
                    ),
                    redemptionCategory: listing.redeemable ? .sixMonth : .notRedeemable,
                    redemptionLabel: listing.redeemable
                        ? "Redeemable - Yes"
                        : "Redeemable - No",
                    listingStatus: listing.listingStatus == "withdrawn"
                        ? .withdrawn
                        : .advertised
                )
            }
        )
    }

    // MARK: - Town of Middleton

    static func middleton(_ bytes: Data, datasetSHA256: String?) throws -> TaxSaleEvent {
        struct Snapshot: Decodable {
            struct Listing: Decodable {
                let item: Int
                let address: String
                let pids: [String]
                let aan: String
                let totalDueCents: Int
                let redeemable: Bool
                let listingStatus: String
            }

            let municipality: String
            let source: String
            let retrievedDate: String
            let eventDate: String
            let saleTime: String
            let venue: String
            let listings: [Listing]
        }

        let snapshot = try JSONDecoder().decode(Snapshot.self, from: bytes)
        let id = "middleton-2026-08-20"
        let source = try url(snapshot.source)

        return TaxSaleEvent(
            id: id,
            municipalityID: "middleton",
            municipality: snapshot.municipality,
            shortMunicipality: "Middleton",
            eventType: .publicAuction,
            // The sale was held. The web moved this notice to history when the
            // results were published, and a notice carried as current is a
            // notice the app is offering: `listingContext` answers a selected
            // parcel from upcoming events only, so leaving it here would tell
            // a reader their parcel is for sale months after the auction.
            eventStatus: .historical,
            saleStartsAt: try instant("\(snapshot.eventDate)T\(snapshot.saleTime):00-03:00"),
            venue: snapshot.venue,
            sourceURL: source,
            landingPageURL: source,
            sourceLabel: "Official Town of Middleton notice",
            retrievedOn: snapshot.retrievedDate,
            sourceDatasetSHA256: datasetSHA256,
            listings: snapshot.listings.map { listing in
                TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-item-\(listing.item)",
                    aan: listing.aan,
                    pids: listing.pids,
                    location: listing.address,
                    financial: MunicipalFinancialField(
                        kind: .recoveryAmount,
                        label: "Total due (subject to municipal confirmation)",
                        amountCents: listing.totalDueCents
                    ),
                    redemptionCategory: listing.redeemable ? .sixMonth : .notRedeemable,
                    redemptionLabel: listing.redeemable
                        ? "Redeemable - Yes"
                        : "Redeemable - No",
                    listingStatus: listing.listingStatus == "withdrawn"
                        ? .withdrawn
                        : .advertised
                )
            }
        )
    }

    // MARK: - Annapolis County

    static func annapolis(_ bytes: Data, datasetSHA256: String?) throws -> TaxSaleEvent {
        struct Snapshot: Decodable {
            struct Listing: Decodable {
                let tenderItem: Int
                let aan: String
                let description: String
                let address: String
                let minimumBid: Double
                let redemptionPeriod: String
                let pids: [String]
                let listingStatus: String
            }

            struct SupportingDocument: Decodable {
                let url: String
            }

            let retrievedDate: String
            let source: String
            let landingPage: String
            let listings: [Listing]
            let supportingDocuments: [SupportingDocument]
        }

        let snapshot = try JSONDecoder().decode(Snapshot.self, from: bytes)
        let id = "annapolis-county-2026-08-31"
        guard let supporting = snapshot.supportingDocuments.first else {
            throw Unreadable(field: "supportingDocuments")
        }

        return TaxSaleEvent(
            id: id,
            municipalityID: "annapolis-county",
            municipality: "Municipality of the County of Annapolis",
            shortMunicipality: "Annapolis County",
            eventType: .sealedTender,
            eventStatus: .upcoming,
            // Tenders close; nothing opens. Both from the tender terms.
            saleStartsAt: try instant("2026-08-31T13:00:00-03:00"),
            venue: "752 St George Street, Annapolis Royal",
            sourceURL: try url(snapshot.source),
            secondarySourceURL: try url(supporting.url),
            landingPageURL: try url(snapshot.landingPage),
            sourceLabel: "Official Annapolis County tender notice",
            retrievedOn: snapshot.retrievedDate,
            sourceDatasetSHA256: datasetSHA256,
            listings: snapshot.listings.map { listing in
                let redeemable = listing.redemptionPeriod == "six-month"
                return TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-tender-\(listing.tenderItem)",
                    aan: listing.aan,
                    pids: listing.pids,
                    addressOrDescription: listing.description,
                    location: listing.address,
                    financial: MunicipalFinancialField(
                        kind: .minimumBid,
                        label: "Minimum bid (plus HST on the total bid)",
                        amountCents: cents(listing.minimumBid)
                    ),
                    // Not stated is its own answer, and not the same as none.
                    redemptionCategory: redeemable ? .sixMonth : .unknown,
                    redemptionLabel: redeemable
                        ? "Redeemable - 6 months"
                        : "Redemption period not stated",
                    listingStatus: listing.listingStatus == "withdrawn"
                        ? .withdrawn
                        : .advertised
                )
            }
        )
    }

    // MARK: - Victoria County

    static func victoria(_ bytes: Data, datasetSHA256: String?) throws -> TaxSaleEvent {
        struct Snapshot: Decodable {
            struct Listing: Decodable {
                let item: Int
                let aan: String
                let pids: [String]
                let description: String
                let redeemable: Bool
                let totalOwingCents: Int
                let listingStatus: String
            }

            let municipality: String
            let source: String
            let landingPage: String
            let retrievedDate: String
            let publishedOn: String
            let eventDate: String
            let bidDeadlineTime: String
            let venue: String
            let listings: [Listing]
        }

        let snapshot = try JSONDecoder().decode(Snapshot.self, from: bytes)
        let id = "victoria-county-2026-09-14"

        return TaxSaleEvent(
            id: id,
            municipalityID: "victoria-county",
            municipality: snapshot.municipality,
            shortMunicipality: "Victoria County",
            eventType: .sealedTender,
            eventStatus: .upcoming,
            saleStartsAt: try instant(
                "\(snapshot.eventDate)T\(snapshot.bidDeadlineTime):00-03:00"
            ),
            venue: snapshot.venue,
            sourceURL: try url(snapshot.source),
            landingPageURL: try url(snapshot.landingPage),
            sourceLabel: "Official Victoria County tax-sale notice",
            publishedOn: snapshot.publishedOn,
            retrievedOn: snapshot.retrievedDate,
            sourceDatasetSHA256: datasetSHA256,
            listings: snapshot.listings.map { listing in
                TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-item-\(listing.item)",
                    aan: listing.aan,
                    pids: listing.pids,
                    location: listing.description,
                    financial: MunicipalFinancialField(
                        kind: .recoveryAmount,
                        label: "Total owing (subject to municipal confirmation)",
                        amountCents: listing.totalOwingCents
                    ),
                    redemptionCategory: listing.redeemable ? .sixMonth : .notRedeemable,
                    redemptionLabel: listing.redeemable
                        ? "Redeemable - Yes"
                        : "Redeemable - No",
                    listingStatus: listing.listingStatus == "withdrawn"
                        ? .withdrawn
                        : .advertised
                )
            }
        )
    }

    // MARK: - Halifax Regional Municipality

    /// Halifax's Schedule A, with the rows NSPRD will not draw kept apart.
    ///
    /// The exceptions are matched the way the web matches them: an exception
    /// belongs to exactly one source row, by AAN and by a single PID. A row
    /// that cannot be found that way is a snapshot whose exceptions no longer
    /// describe its listings, and this build refuses the whole notice rather
    /// than shipping a listing count nobody can reconcile against the source.
    static func halifax(_ bytes: Data, datasetSHA256: String?) throws -> TaxSaleEvent {
        struct Snapshot: Decodable {
            struct Listing: Decodable {
                let item: Int
                let aan: String
                let pids: [String]
                let description: String
                let openingBidCents: Int
                let redeemable: Bool
                let listingStatus: String
            }

            struct Exception: Decodable {
                let aan: String
                let pid: String
                let reason: TaxSaleGeometryException.Reason
                let checkedOn: String
            }

            let municipality: String
            let source: String
            let landingPage: String
            let tenderInstructions: String
            let retrievedDate: String
            let eventDate: String
            let bidDeadlineTime: String
            let venue: String
            let listings: [Listing]
            let geometryExceptions: [Exception]
        }

        let snapshot = try JSONDecoder().decode(Snapshot.self, from: bytes)
        let id = "halifax-2026-09-15"

        // One exception, one row, both ways. Two exceptions naming the same row
        // would count it as unavailable twice; two rows answering one exception
        // would leave the second silently undrawn with nothing said about it.
        var exceptedItems: Set<Int> = []
        let exceptions = try snapshot.geometryExceptions.map { exception in
            let matches = snapshot.listings.filter {
                $0.aan == exception.aan && $0.pids == [exception.pid]
            }
            guard let listing = matches.first, matches.count == 1,
                exceptedItems.insert(listing.item).inserted
            else {
                throw Unreadable(field: "geometryExceptions/\(exception.aan)")
            }
            return TaxSaleGeometryException(
                recordID: "\(id)-item-\(listing.item)",
                aan: listing.aan,
                pids: listing.pids,
                location: listing.description,
                reason: exception.reason,
                checkedOn: exception.checkedOn
            )
        }

        return TaxSaleEvent(
            id: id,
            municipalityID: "halifax-regional-municipality",
            municipality: snapshot.municipality,
            shortMunicipality: "Halifax",
            eventType: .sealedTender,
            eventStatus: .upcoming,
            saleStartsAt: try instant(
                "\(snapshot.eventDate)T\(snapshot.bidDeadlineTime):00-03:00"
            ),
            venue: snapshot.venue,
            sourceURL: try url(snapshot.source),
            secondarySourceURL: try url(snapshot.tenderInstructions),
            landingPageURL: try url(snapshot.landingPage),
            sourceLabel: "Official Halifax Schedule A tax-sale notice",
            retrievedOn: snapshot.retrievedDate,
            sourceDatasetSHA256: datasetSHA256,
            // By row, not by PID. Excluding every row that mentions an excepted
            // PID would drop a second row the exception never spoke for.
            listings: snapshot.listings
                .filter { !exceptedItems.contains($0.item) }
                .map { listing in
                    TaxSaleListing(
                        eventID: id,
                        recordID: "\(id)-item-\(listing.item)",
                        aan: listing.aan,
                        pids: listing.pids,
                        location: listing.description,
                        financial: MunicipalFinancialField(
                            kind: .minimumBid,
                            label: "Opening bid",
                            amountCents: listing.openingBidCents
                        ),
                        redemptionCategory: listing.redeemable ? .sixMonth : .notRedeemable,
                        redemptionLabel: listing.redeemable
                            ? "Redeemable - Yes"
                            : "Redeemable - No",
                        listingStatus: listing.listingStatus == "withdrawn"
                            ? .withdrawn
                            : .advertised
                    )
                },
            geometryExceptions: exceptions
        )
    }

    // MARK: - Cape Breton Regional Municipality

    static func cbrm(_ bytes: Data, datasetSHA256: String?) throws -> TaxSaleEvent {
        struct Snapshot: Decodable {
            struct Listing: Decodable {
                let lien: String
                let aan: String
                let pids: [String]
                let addressOrDescription: String
                let location: String
                let minimumBidCents: Int
                let redemptionCategory: String
            }

            let municipality: String
            let saleDate: String
            let saleTime: String
            let venue: String
            let landingPage: String
            let source: String
            let secondarySource: String
            let retrievedDate: String
            let listings: [Listing]
        }

        let snapshot = try JSONDecoder().decode(Snapshot.self, from: bytes)
        let id = "cbrm-2026-07-21"

        return TaxSaleEvent(
            id: id,
            municipalityID: "cbrm",
            municipality: snapshot.municipality,
            shortMunicipality: "CBRM",
            eventType: .publicAuction,
            eventStatus: .historical,
            saleStartsAt: try instant("\(snapshot.saleDate)T\(snapshot.saleTime):00-03:00"),
            venue: snapshot.venue,
            sourceURL: try url(snapshot.source),
            secondarySourceURL: try url(snapshot.secondarySource),
            landingPageURL: try url(snapshot.landingPage),
            sourceLabel: "Official CBRM property list",
            retrievedOn: snapshot.retrievedDate,
            sourceDatasetSHA256: datasetSHA256,
            listings: snapshot.listings.map { listing in
                let sixMonth = listing.redemptionCategory == "six-month"
                return TaxSaleListing(
                    eventID: id,
                    recordID: "\(id)-lien-\(listing.lien)",
                    lien: listing.lien,
                    aan: listing.aan,
                    pids: listing.pids,
                    addressOrDescription: listing.addressOrDescription,
                    location: listing.location,
                    financial: MunicipalFinancialField(
                        kind: .minimumBid,
                        label: "Minimum bid",
                        amountCents: listing.minimumBidCents
                    ),
                    redemptionCategory: sixMonth ? .sixMonth : .immediateDeed,
                    redemptionLabel: sixMonth
                        ? "Six-month redemption"
                        : "Immediate deed (municipal category)",
                    listingStatus: .advertised
                )
            }
        )
    }

    // MARK: - Shared

    /// Dollars as the notice printed them, in cents.
    ///
    /// Rounded rather than truncated, and rounded at the same point the web
    /// rounds: a listing that reads $15,529.15 must be 1552915 on both
    /// surfaces, not 1552914 on one of them.
    private static func cents(_ amount: Double) -> Int {
        Int((amount * 100).rounded())
    }

    /// Built per call rather than shared: `ISO8601DateFormatter` is not
    /// `Sendable`, and these run once at load.
    private static func instant(_ value: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: value) else {
            throw Unreadable(field: value)
        }
        return date
    }

    private static func url(_ value: String) throws -> URL {
        guard let url = URL(string: value) else { throw Unreadable(field: value) }
        return url
    }
}
