import Foundation

/// A municipal tax-sale notice and the properties it advertises.
///
/// Ported from `web/src/data/taxSaleTypes.ts`. Every field here is a source
/// fact from a dated municipal notice: the app does not merge municipalities
/// into one national shape, because they do not publish one. One prints a
/// minimum bid, another total arrears, another an amount "subject to municipal
/// confirmation" — so the amount carries its own kind and its own label rather
/// than being flattened into a single "price" the notice never stated.
///
/// A listing is evidence that a property was advertised on a date, and nothing
/// more. It does not establish that the sale happened, that the property was
/// sold, that the arrears are still owed, that redemption has or has not
/// occurred, or anything about title, access, or condition.
public enum TaxSaleEventStatus: String, Sendable, Hashable, CaseIterable {
    case upcoming
    case historical
}

public enum TaxSaleEventType: String, Sendable, Hashable, CaseIterable {
    case publicAuction = "public-auction"
    case sealedTender = "sealed-tender"

    public var label: String {
        switch self {
        case .publicAuction: "Public auction"
        case .sealedTender: "Sealed tender"
        }
    }
}

public enum TaxSaleListingStatus: String, Sendable, Hashable, CaseIterable {
    case advertised
    case withdrawn
    case sold
    case unsold

    /// What this status means, in the words the web uses.
    ///
    /// `sold` and `unsold` say "not available" rather than naming a buyer or a
    /// price: those are historical results this app does not carry on a current
    /// listing.
    public var label: String {
        switch self {
        case .advertised: "Advertised in notice"
        case .withdrawn: "Withdrawn in current municipal notice revision"
        case .sold: "Historical sold result - not available"
        case .unsold: "Historical unsold result - not available"
        }
    }
}

/// The redemption treatment the municipality printed, not a legal conclusion.
///
/// `unknown` is a real and distinct answer: a notice that does not state a
/// redemption period has not stated one, which is different from stating that
/// there is none.
public enum RedemptionCategory: String, Sendable, Hashable, CaseIterable, Decodable {
    case sixMonth = "six-month"
    case immediateDeed = "immediate-deed"
    case notRedeemable = "not-redeemable"
    case unknown
}

/// The money a notice printed, with the municipality's own name for it.
public struct MunicipalFinancialField: Sendable, Hashable {
    public enum Kind: String, Sendable, Hashable, CaseIterable {
        case minimumBid = "minimum-bid"
        case totalArrears = "total-arrears"
        case recoveryAmount = "recovery-amount"
        case successfulBid = "successful-bid"
    }

    public let kind: Kind
    public let label: String
    public let amountCents: Int

    public init(kind: Kind, label: String, amountCents: Int) {
        self.kind = kind
        self.label = label
        self.amountCents = amountCents
    }
}

public struct TaxSaleListing: Sendable, Hashable, Identifiable {
    public let eventID: String
    public let recordID: String
    /// The municipality's own reference — a lien number, tender item, or list
    /// item. Absent when the notice printed none.
    public let lien: String?
    public let aan: String?
    public let pids: [String]
    public let addressOrDescription: String?
    public let location: String
    public let financial: MunicipalFinancialField
    public let redemptionCategory: RedemptionCategory
    public let redemptionLabel: String
    public let listingStatus: TaxSaleListingStatus

    public var id: String { recordID }

    /// What to call this property in a list: the notice's description when it
    /// printed one, and its location otherwise.
    public var propertyLabel: String { addressOrDescription ?? location }

    public init(
        eventID: String,
        recordID: String,
        lien: String? = nil,
        aan: String? = nil,
        pids: [String],
        addressOrDescription: String? = nil,
        location: String,
        financial: MunicipalFinancialField,
        redemptionCategory: RedemptionCategory,
        redemptionLabel: String,
        listingStatus: TaxSaleListingStatus
    ) {
        self.eventID = eventID
        self.recordID = recordID
        self.lien = lien
        self.aan = aan
        self.pids = pids
        self.addressOrDescription = addressOrDescription
        self.location = location
        self.financial = financial
        self.redemptionCategory = redemptionCategory
        self.redemptionLabel = redemptionLabel
        self.listingStatus = listingStatus
    }
}

/// An official notice row the parcel service will not draw.
///
/// Halifax's Schedule A prints rows whose PID returns no exact geometry from
/// NSPRD. Dropping them would lose an official listing; drawing them would
/// invent a boundary. So the row is kept, off the map, with the date the
/// lookup was tried: a parcel the map cannot show is not a parcel that is not
/// in the notice, and a reader searching that PID has to be told which it is.
public struct TaxSaleGeometryException: Sendable, Hashable, Identifiable {
    /// Why the parcel is not drawn. One case, because one is all any source
    /// has given so far, and a second reason would need its own wording.
    public enum Reason: String, Sendable, Hashable, Decodable {
        case noNSPRDGeometry = "no-nsprd-geometry"
    }

    public let recordID: String
    public let aan: String?
    public let pids: [String]
    public let location: String
    public let reason: Reason
    /// The day the lookup was tried, `yyyy-MM-dd`, as the notice's own dates
    /// are kept. A service can start answering tomorrow.
    public let checkedOn: String

    public var id: String { recordID }

    public init(
        recordID: String,
        aan: String? = nil,
        pids: [String],
        location: String,
        reason: Reason = .noNSPRDGeometry,
        checkedOn: String
    ) {
        self.recordID = recordID
        self.aan = aan
        self.pids = pids
        self.location = location
        self.reason = reason
        self.checkedOn = checkedOn
    }
}

public struct TaxSaleEvent: Sendable, Hashable, Identifiable {
    public let id: String
    public let municipalityID: String
    public let municipality: String
    public let shortMunicipality: String
    public let eventType: TaxSaleEventType
    public let eventStatus: TaxSaleEventStatus
    /// When bidding opens, or when tenders close.
    public let saleStartsAt: Date?
    public let closedAt: Date?
    public let venue: String?
    public let sourceURL: URL
    public let secondarySourceURL: URL?
    /// The page the notice hangs off, which municipalities overwrite in place.
    public let landingPageURL: URL?
    public let sourceLabel: String
    /// Calendar days as the notice printed them, `yyyy-MM-dd`. Kept as days
    /// rather than instants because a publication date is a day, and turning it
    /// into midnight UTC is how it renders as the day before in Halifax.
    public let publishedOn: String?
    public let retrievedOn: String
    public let sourceDatasetSHA256: String?
    public let listings: [TaxSaleListing]
    /// Official rows this build cannot map. Empty for every notice whose PIDs
    /// all resolved.
    public let geometryExceptions: [TaxSaleGeometryException]

    public init(
        id: String,
        municipalityID: String,
        municipality: String,
        shortMunicipality: String,
        eventType: TaxSaleEventType,
        eventStatus: TaxSaleEventStatus,
        saleStartsAt: Date? = nil,
        closedAt: Date? = nil,
        venue: String? = nil,
        sourceURL: URL,
        secondarySourceURL: URL? = nil,
        landingPageURL: URL? = nil,
        sourceLabel: String,
        publishedOn: String? = nil,
        retrievedOn: String,
        sourceDatasetSHA256: String? = nil,
        listings: [TaxSaleListing],
        geometryExceptions: [TaxSaleGeometryException] = []
    ) {
        self.id = id
        self.municipalityID = municipalityID
        self.municipality = municipality
        self.shortMunicipality = shortMunicipality
        self.eventType = eventType
        self.eventStatus = eventStatus
        self.saleStartsAt = saleStartsAt
        self.closedAt = closedAt
        self.venue = venue
        self.sourceURL = sourceURL
        self.secondarySourceURL = secondarySourceURL
        self.landingPageURL = landingPageURL
        self.sourceLabel = sourceLabel
        self.publishedOn = publishedOn
        self.retrievedOn = retrievedOn
        self.sourceDatasetSHA256 = sourceDatasetSHA256
        self.listings = listings
        self.geometryExceptions = geometryExceptions
    }

    /// The PIDs still advertised, which is what the map draws.
    ///
    /// Withdrawn listings are deliberately excluded: the parcel is still in the
    /// notice's history, but highlighting it would say it is for sale.
    public var advertisedPIDs: [String] {
        listings
            .filter { $0.listingStatus == .advertised }
            .flatMap(\.pids)
            .deduplicatedPreservingOrder()
    }

    public var pids: [String] {
        listings.flatMap(\.pids).deduplicatedPreservingOrder()
    }
}

/// Where an event sits relative to now.
///
/// `verifyResults` is the state the web added and this app keeps: a notice
/// whose sale date has passed is not an upcoming sale and is not a historical
/// result either, because nobody has published what happened. Collapsing it
/// into either one would tell the user something the sources have not said.
public enum TaxSaleEventLifecycle: Sendable, Hashable {
    case upcoming
    case verifyResults
    case historical

    public var label: String {
        switch self {
        case .upcoming: "Upcoming"
        case .verifyResults: "Past sale date — verify results with the municipality."
        case .historical: "Historical"
        }
    }
}

extension TaxSaleEvent {
    public func lifecycle(now: Date) -> TaxSaleEventLifecycle {
        guard eventStatus != .historical else { return .historical }
        if let saleStartsAt, saleStartsAt <= now { return .verifyResults }
        return .upcoming
    }
}

extension Array where Element: Hashable {
    func deduplicatedPreservingOrder() -> [Element] {
        var seen: Set<Element> = []
        return filter { seen.insert($0).inserted }
    }
}
