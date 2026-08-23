import Foundation
import NSDataServices
import Observation

/// Which tax-sale notices the user is looking at, and which listings within
/// them.
///
/// Only the notices: the parcels they name are geometry, and geometry has one
/// owner in this app — `OverlayViewModel` — so what this holds is the state
/// that decides which PIDs are worth drawing rather than the drawing itself.
///
/// Nothing here is fetched. Every notice ships in the app, which is why the
/// panel can list a sale with the network down; what needs the Province is the
/// parcel boundary, and its absence is reported separately rather than making
/// the notice disappear.
@MainActor
@Observable
final class TaxSaleViewModel {
    let catalog: TaxSaleCatalog

    /// The events whose properties are drawn. Every current notice starts on,
    /// as the web starts them, because a map showing tax sales and no tax sales
    /// is a map that looks broken.
    private(set) var selectedEventIDs: Set<String>

    var filter: RedemptionFilter = .all

    init(catalog: TaxSaleCatalog = .bundled) {
        self.catalog = catalog
        selectedEventIDs = Set(catalog.events(status: .upcoming).map(\.id))
    }

    /// Back to what a fresh map has: every current notice on, no filter.
    ///
    /// Called when the map stops showing tax-sale information. Remembering the
    /// selection instead would mean a reader who comes back to tax sales months
    /// later finds half the notices silently off, which reads as a sale being
    /// over when what happened is that somebody once unticked it.
    func resetSelection() {
        selectedEventIDs = Set(catalog.events(status: .upcoming).map(\.id))
        filter = .all
    }

    /// The current notices, in catalog order.
    var upcomingEvents: [TaxSaleEvent] {
        catalog.events(status: .upcoming)
    }

    /// Municipalities whose notice this build bundles but could not read.
    ///
    /// Surfaced rather than swallowed: a section that silently lists three
    /// municipalities when the app ships four says the fourth held no sale.
    var unreadableDatasetNames: [String] {
        catalog.unreadableDatasets.map(\.rawValue)
    }

    func isSelected(_ eventID: String) -> Bool {
        selectedEventIDs.contains(eventID)
    }

    func setEventVisibility(_ eventID: String, to visible: Bool) {
        if visible {
            selectedEventIDs.insert(eventID)
        } else {
            selectedEventIDs.remove(eventID)
        }
    }

    /// The PIDs the map draws as tax-sale parcels.
    ///
    /// Advertised listings only, and only from selected events. A withdrawn
    /// listing stays in the notice's history and in the browse list, but
    /// colouring its parcel on the map would say the property is for sale after
    /// the municipality struck it out.
    var highlightedPIDs: Set<String> {
        Set(
            upcomingEvents
                .filter { isSelected($0.id) }
                .flatMap(\.listings)
                .filter { $0.listingStatus == .advertised && filter.matches($0) }
                .flatMap(\.pids)
        )
    }

    /// Every advertised PID in every current notice, which is what is worth
    /// asking NSPRD for once.
    ///
    /// Not narrowed by the filter or the switches: the filter moves often, and
    /// re-fetching the same parcels each time it moves would spend the
    /// Province's service on geometry the app already holds.
    var advertisedPIDs: [String] {
        TaxSaleCatalog.advertisedPIDs(for: upcomingEvents)
    }

    /// The advertised listings the counts are taken over.
    var selectedListings: [TaxSaleListing] {
        upcomingEvents
            .filter { isSelected($0.id) }
            .flatMap(\.listings)
            .filter { $0.listingStatus == .advertised }
    }

    var filterCounts: [RedemptionFilter: Int] {
        RedemptionFilter.counts(in: selectedListings)
    }

    /// What an event's browse list shows.
    ///
    /// Filtered by redemption category but not by listing status: a withdrawn
    /// listing is part of what the notice says, and dropping it from the list
    /// would leave a user who read the notice looking for a row that is not
    /// there.
    func listings(in event: TaxSaleEvent) -> [TaxSaleListing] {
        event.listings.filter(filter.matches)
    }

    /// The line under an event's name: what it advertised, what it struck out,
    /// and how many parcels that leaves on the map.
    struct EventSummary: Equatable {
        let advertised: Int
        let withdrawn: Int
        let activePIDs: Int
    }

    func summary(for event: TaxSaleEvent) -> EventSummary {
        let advertised = event.listings.count { $0.listingStatus == .advertised }
        return EventSummary(
            advertised: advertised,
            withdrawn: event.listings.count - advertised,
            activePIDs: event.advertisedPIDs.count
        )
    }

    func listingContext(forPID pid: String) -> TaxSaleNoticeContext? {
        catalog.listingContext(forPID: pid).map {
            TaxSaleNoticeContext(event: $0.event, listing: $0.listing)
        }
    }
}

/// A parcel's place in a current notice: the sale, and the listing that named
/// it.
///
/// Both, because neither is enough on its own — the amount and the redemption
/// treatment are the listing's, and the date, venue, and source document are
/// the sale's.
struct TaxSaleNoticeContext: Equatable, Sendable {
    let event: TaxSaleEvent
    let listing: TaxSaleListing
}
