import Foundation

/// A tax sale that has already happened, and what the municipality published
/// about it afterwards.
///
/// Ported from `web/src/data/historicalTaxSales.ts`. A historical record is
/// evidence that a property was advertised on a date and that a named source
/// published a stated outcome. It is not a current offering, and it says
/// nothing about who owns the property now, what it is worth, whether it can
/// be reached, or what stands on it.
public enum HistoricalOutcome: String, Sendable, Hashable, CaseIterable, Decodable {
    case sold
    case unsold
    case withdrawn
    case cancelled
    case redeemed
    /// The source published a row and no disposition. Distinct from `unsold`,
    /// which is a published result saying nobody bid.
    case unknown

    public var label: String {
        switch self {
        case .sold: "Sold"
        case .unsold: "Unsold - no bids"
        case .withdrawn: "Withdrawn"
        case .cancelled: "Cancelled"
        case .redeemed: "Redeemed"
        case .unknown: "Outcome unknown"
        }
    }
}

/// How the sale was run, in the municipality's own vocabulary.
///
/// Deliberately open rather than a two-case enum. The dataset carries
/// `public-tender` on one Pictou sale, and the web's union type does not — so
/// its label function falls through and prints "Public auction" for a tender.
/// An auction and a tender are different mechanisms, and a reader researching
/// how a property changed hands should not be handed the wrong one because a
/// type was too narrow. An unrecognised method keeps the source's word.
public struct HistoricalSaleMethod: RawRepresentable, Sendable, Hashable, Decodable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public init(from decoder: any Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(String.self)
    }

    public static let publicAuction = HistoricalSaleMethod(rawValue: "public-auction")
    public static let sealedTender = HistoricalSaleMethod(rawValue: "sealed-tender")

    public var label: String {
        switch rawValue {
        case Self.publicAuction.rawValue: return "Public auction"
        case Self.sealedTender.rawValue: return "Sealed tender"
        default:
            // "public-tender" reads as "Public tender", which is what the
            // source said, rather than as one of the two this build knows.
            let words = rawValue.split(separator: "-").map(String.init)
            guard let first = words.first else { return rawValue }
            return ([first.capitalized] + words.dropFirst()).joined(separator: " ")
        }
    }
}

/// Whether anyone has published what happened.
///
/// `awaitingOfficialResults` is a sale with a notice and no result, which is
/// why a record under it may not be rendered with an outcome: nothing has been
/// published to render.
public enum HistoricalResultStatus: String, Sendable, Hashable, CaseIterable, Decodable {
    case verified
    case awaitingOfficialResults = "awaiting-official-results"
}

/// How a listing was tied to a parcel in NSPRD, which is a separate question
/// from what the sale did.
public enum NSPRDMatchStatus: String, Sendable, Hashable, CaseIterable, Decodable {
    case matched
    case ambiguous
    case unmatched
}

public enum NSPRDMatchMethod: String, Sendable, Hashable, CaseIterable, Decodable {
    case exactOfficialPID = "exact-official-pid"
    case deterministicReconciliation = "deterministic-reconciliation"
    case none

    public var label: String {
        switch self {
        case .exactOfficialPID: "Exact official eight-digit PID"
        case .deterministicReconciliation: "Deterministic authoritative-field reconciliation"
        case .none: "Not matched"
        }
    }
}

public struct HistoricalTaxSaleEvent: Sendable, Hashable, Identifiable, Decodable {
    public let id: String
    public let municipalityID: String
    public let municipality: String
    public let shortMunicipality: String
    /// The calendar day the sale was held, `yyyy-MM-dd`.
    public let saleDate: String
    public let saleMethod: HistoricalSaleMethod
    /// What the municipality called its own listing reference, so a lien number
    /// is not rendered under the word another municipality used.
    public let listingIdentifierLabel: String
    public let advertisedAmountLabel: String
    public let currency: String
    public let noticeURL: URL
    public let termsURL: URL?
    public let landingPageURL: URL?
    public let resultStatus: HistoricalResultStatus
    public let resultURL: URL?
    public let retrievedOn: String
    public let noticeSnapshotDate: String
    public let resultSnapshotDate: String?
    public let resultCheckedOn: String?
    public let noticeSHA256: String
    public let resultSHA256: String?
    public let sourceNotes: String

    public var saleYear: String { String(saleDate.prefix(4)) }

    enum CodingKeys: String, CodingKey {
        case id
        case municipalityID = "municipalityId"
        case municipality
        case shortMunicipality
        case saleDate
        case saleMethod
        case listingIdentifierLabel
        case advertisedAmountLabel
        case currency
        case noticeURL = "noticeUrl"
        case termsURL = "termsUrl"
        case landingPageURL = "landingPageUrl"
        case resultStatus
        case resultURL = "resultUrl"
        case retrievedOn
        case noticeSnapshotDate
        case resultSnapshotDate
        case resultCheckedOn
        case noticeSHA256 = "noticeSha256"
        case resultSHA256 = "resultSha256"
        case sourceNotes
    }

    public init(
        id: String,
        municipalityID: String,
        municipality: String,
        shortMunicipality: String,
        saleDate: String,
        saleMethod: HistoricalSaleMethod,
        listingIdentifierLabel: String,
        advertisedAmountLabel: String,
        currency: String = "CAD",
        noticeURL: URL,
        termsURL: URL? = nil,
        landingPageURL: URL? = nil,
        resultStatus: HistoricalResultStatus,
        resultURL: URL? = nil,
        retrievedOn: String,
        noticeSnapshotDate: String,
        resultSnapshotDate: String? = nil,
        resultCheckedOn: String? = nil,
        noticeSHA256: String,
        resultSHA256: String? = nil,
        sourceNotes: String
    ) {
        self.id = id
        self.municipalityID = municipalityID
        self.municipality = municipality
        self.shortMunicipality = shortMunicipality
        self.saleDate = saleDate
        self.saleMethod = saleMethod
        self.listingIdentifierLabel = listingIdentifierLabel
        self.advertisedAmountLabel = advertisedAmountLabel
        self.currency = currency
        self.noticeURL = noticeURL
        self.termsURL = termsURL
        self.landingPageURL = landingPageURL
        self.resultStatus = resultStatus
        self.resultURL = resultURL
        self.retrievedOn = retrievedOn
        self.noticeSnapshotDate = noticeSnapshotDate
        self.resultSnapshotDate = resultSnapshotDate
        self.resultCheckedOn = resultCheckedOn
        self.noticeSHA256 = noticeSHA256
        self.resultSHA256 = resultSHA256
        self.sourceNotes = sourceNotes
    }
}

public struct HistoricalTaxSaleRecord: Sendable, Hashable, Identifiable, Decodable {
    public let eventID: String
    public let recordID: String
    public let listingIdentifier: String
    public let pids: [String]
    public let civicDescription: String
    public let advertisedAmountCents: Int
    /// `nil` means no winning bid was published, which is not the same as no
    /// winning bid existing. What it means is read off `outcome`.
    public let winningBidCents: Int?
    public let outcome: HistoricalOutcome
    public let resultNote: String?
    public let redemptionLabel: String
    public let nsprdMatchStatus: NSPRDMatchStatus
    public let nsprdMatchMethod: NSPRDMatchMethod
    public let reviewState: ReviewState

    public enum ReviewState: String, Sendable, Hashable, CaseIterable, Decodable {
        case visuallyVerified = "visually-verified"
        case noticeVerified = "notice-verified"
        case needsReview = "needs-review"
    }

    public var id: String { recordID }

    enum CodingKeys: String, CodingKey {
        case eventID = "eventId"
        case recordID = "recordId"
        case listingIdentifier
        case pids
        case civicDescription
        case advertisedAmountCents
        case winningBidCents
        case outcome
        case resultNote
        case redemptionLabel
        case nsprdMatchStatus = "nspMatchStatus"
        case nsprdMatchMethod = "nspMatchMethod"
        case reviewState
    }

    public init(
        eventID: String,
        recordID: String,
        listingIdentifier: String,
        pids: [String],
        civicDescription: String,
        advertisedAmountCents: Int,
        winningBidCents: Int?,
        outcome: HistoricalOutcome,
        resultNote: String? = nil,
        redemptionLabel: String,
        nsprdMatchStatus: NSPRDMatchStatus,
        nsprdMatchMethod: NSPRDMatchMethod,
        reviewState: ReviewState
    ) {
        self.eventID = eventID
        self.recordID = recordID
        self.listingIdentifier = listingIdentifier
        self.pids = pids
        self.civicDescription = civicDescription
        self.advertisedAmountCents = advertisedAmountCents
        self.winningBidCents = winningBidCents
        self.outcome = outcome
        self.resultNote = resultNote
        self.redemptionLabel = redemptionLabel
        self.nsprdMatchStatus = nsprdMatchStatus
        self.nsprdMatchMethod = nsprdMatchMethod
        self.reviewState = reviewState
    }
}

/// A record and the sale it belongs to. Neither is enough alone: the amount and
/// the outcome are the record's, and the method, the source documents, and the
/// name the municipality gave its own amount are the sale's.
public struct HistoricalRecordContext: Sendable, Hashable {
    public let event: HistoricalTaxSaleEvent
    public let record: HistoricalTaxSaleRecord

    public init(event: HistoricalTaxSaleEvent, record: HistoricalTaxSaleRecord) {
        self.event = event
        self.record = record
    }
}

/// What a winning bid came to against what was advertised.
///
/// Computed only where both numbers were published. A comparison against an
/// unpublished bid would be arithmetic on a number nobody printed.
public struct FinancialComparison: Sendable, Hashable {
    public let differenceCents: Int
    public let percentageAbove: Double
    public let winningBidMultiple: Double
}

extension HistoricalRecordContext {
    public var financialComparison: FinancialComparison? {
        guard event.currency == "CAD",
              let winning = record.winningBidCents,
              record.advertisedAmountCents > 0 else { return nil }
        let difference = winning - record.advertisedAmountCents
        let advertised = Double(record.advertisedAmountCents)
        return FinancialComparison(
            differenceCents: difference,
            percentageAbove: (Double(difference) / advertised * 10_000).rounded() / 100,
            winningBidMultiple: (Double(winning) / advertised * 100).rounded() / 100
        )
    }

    /// What to print where a winning bid would go.
    ///
    /// Four different sentences, because there are four different reasons a
    /// number is missing and only one of them — `unsold` — is a published
    /// finding about the sale.
    public var winningBidLabel: String {
        if let winning = record.winningBidCents {
            return TaxSaleFormat.currency(cents: winning)
        }
        switch (record.outcome, event.resultStatus) {
        case (.unsold, _): return "No winning bid - official result says no bids"
        case (_, .awaitingOfficialResults): return "Awaiting official results"
        case (_, .verified): return "Not published in verified sources"
        }
    }

    /// The heading of the record card. A sale whose results nobody has
    /// published gets "Outcome pending" rather than an outcome.
    public var outcomeLabel: String {
        event.resultStatus == .awaitingOfficialResults
            ? "Outcome pending"
            : record.outcome.label
    }

    /// Said where the money is, when the listing was never about one parcel.
    ///
    /// The catalogue attaches a record to every PID it names, so a listing that
    /// bundled three parcels puts the same advertised amount and the same
    /// winning bid on all three cards. Those are the loudest comparables in the
    /// set — one HRM listing carries $70,000 against three PIDs — and read as
    /// this parcel's price they are wrong by whatever the other parcels were
    /// worth. The other PIDs are named so the reader can go and find them.
    ///
    /// Nil for the ordinary single-parcel listing, which needs no caveat.
    public var multiPIDNote: String? {
        guard record.pids.count > 1 else { return nil }
        return """
            This one listing covers \(record.pids.count) PIDs \
            (\(record.pids.joined(separator: ", "))). The listing-level amounts \
            are not divided between parcels.
            """
    }

    /// When the source documents were captured, which is not when this build
    /// read them.
    ///
    /// `retrievedOn` is the ingest date and reads the same day on every shipped
    /// record; the snapshot dates are when the notice and the result were
    /// actually taken, and some are years earlier. A reader judging how stale
    /// an outcome is needs the capture date, not the day a script ran, so the
    /// card prints both and the web prints both.
    ///
    /// "Results checked" rather than a result date where the sale published no
    /// result document: somebody looked on that day and there was nothing,
    /// which is a different fact from a result captured on it.
    public var sourceSnapshotSummary: String {
        let notice = "Notice \(TaxSaleFormat.day(event.noticeSnapshotDate))"
        if let snapshot = event.resultSnapshotDate {
            return "\(notice) · result \(TaxSaleFormat.day(snapshot))"
        }
        if let checked = event.resultCheckedOn {
            return "\(notice) · results checked \(TaxSaleFormat.day(checked))"
        }
        return notice
    }

    /// The limit on what this record proves, in the web's words.
    public var limitNote: String {
        event.resultStatus == .awaitingOfficialResults
            ? "Dated notice record only; no result is claimed. It is not a current "
                + "offering and does not prove a sale, present ownership, title, "
                + "redemption, legal access, or parcel status."
            : "Dated outcome only. It is not a current offering and does not prove "
                + "present ownership, title, redemption, legal access, or parcel status."
    }
}
