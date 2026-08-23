import Foundation

/// The tax-sale notices this app ships, decoded from the bundled snapshots.
///
/// Ported from `web/src/data/taxSaleCatalog.ts` and the per-municipality
/// modules beside it. Each municipality publishes a different document with
/// different columns, so each snapshot has its own decoder; what they share is
/// the shape they produce and the rule that nothing is invented on the way.
///
/// Some event facts are not in the snapshots because the source documents do
/// not put them in a table — Inverness prints its start time and hall in the
/// notice prose, and Annapolis prints its closing time and address in the
/// tender terms. Those are transcribed here exactly as the web transcribes
/// them, next to the dataset receipt that pins the rest.
public struct TaxSaleCatalog: Sendable {
    public let events: [TaxSaleEvent]

    /// Bundled datasets that could not be read.
    ///
    /// Named rather than dropped: a missing municipality is a municipality
    /// whose notice this build cannot show, which is not the same as a
    /// municipality holding no tax sale.
    public let unreadableDatasets: [SharedData.Dataset]

    /// The catalog as shipped. Decoding runs once, off bundled bytes.
    public static let bundled = TaxSaleCatalog()

    public init() {
        var events: [TaxSaleEvent] = []
        var unreadable: [SharedData.Dataset] = []
        let manifest = try? SharedData.manifest()

        // Web order, which is the order the panel lists them in.
        let builders: [(SharedData.Dataset, (Data, String?) throws -> TaxSaleEvent)] = [
            (.cbrmTaxSale, TaxSaleSnapshots.cbrm),
            (.invernessTaxSale, TaxSaleSnapshots.inverness),
            (.middletonTaxSale, TaxSaleSnapshots.middleton),
            (.annapolisTaxSale, TaxSaleSnapshots.annapolis),
            (.victoriaTaxSale, TaxSaleSnapshots.victoria),
            (.halifaxTaxSale, TaxSaleSnapshots.halifax),
        ]

        for (dataset, build) in builders {
            do {
                let bytes = try SharedData.bytes(of: dataset)
                events.append(try build(bytes, manifest?.entry(for: dataset)?.sha256))
            } catch {
                unreadable.append(dataset)
            }
        }

        self.events = events
        self.unreadableDatasets = unreadable
    }

    public init(events: [TaxSaleEvent], unreadableDatasets: [SharedData.Dataset] = []) {
        self.events = events
        self.unreadableDatasets = unreadableDatasets
    }

    public func events(status: TaxSaleEventStatus) -> [TaxSaleEvent] {
        events.filter { $0.eventStatus == status }
    }

    public func event(id: String) -> TaxSaleEvent? {
        events.first { $0.id == id }
    }

    /// The listing that put a PID in a current notice.
    ///
    /// Only upcoming events are searched, as the web searches them: a parcel
    /// that appeared in a past notice is history, and answering with it while
    /// the user is looking at a current parcel would read as "this is for
    /// sale".
    public func listingContext(forPID pid: String) -> (event: TaxSaleEvent, listing: TaxSaleListing)? {
        for event in events where event.eventStatus == .upcoming {
            if let listing = event.listings.first(where: { $0.pids.contains(pid) }) {
                return (event, listing)
            }
        }
        return nil
    }

    public static func advertisedPIDs(for events: [TaxSaleEvent]) -> [String] {
        events.flatMap(\.advertisedPIDs).deduplicatedPreservingOrder()
    }

    public static func pids(for events: [TaxSaleEvent]) -> [String] {
        events.flatMap(\.pids).deduplicatedPreservingOrder()
    }
}

/// The redemption categories the panel filters by.
///
/// The two grouped choices are the municipalities' own categories, not a
/// judgement about which properties are worth bidding on: "immediate / none"
/// collects the listings whose notice said a deed issues immediately, said the
/// property is not redeemable, or said nothing at all about redemption.
public enum RedemptionFilter: String, Sendable, Hashable, CaseIterable {
    case all
    case redemption
    case immediateOrNone = "immediate-or-none"

    public var label: String {
        switch self {
        case .all: "All"
        case .redemption: "Redemption"
        case .immediateOrNone: "Immediate / none"
        }
    }

    public func matches(_ listing: TaxSaleListing) -> Bool {
        switch self {
        case .all:
            true
        case .redemption:
            listing.redemptionCategory == .sixMonth
        case .immediateOrNone:
            listing.redemptionCategory == .immediateDeed
                || listing.redemptionCategory == .notRedeemable
        }
    }

    /// How many of these listings each choice would leave, for the counts the
    /// segmented control shows beside its labels.
    public static func counts(in listings: [TaxSaleListing]) -> [RedemptionFilter: Int] {
        allCases.reduce(into: [:]) { counts, filter in
            counts[filter] = listings.count(where: filter.matches)
        }
    }
}
