import Foundation
import NSDataServices
import Observation

/// Which records the map is reading, and which of them are drawn.
///
/// The mode is the important part. The web has one map that answers two
/// different questions, and never both at once: what is advertised for sale
/// now, and what changed hands before. Showing them together would put a dated
/// result and a live notice in the same colour scheme on the same screen, which
/// is the one confusion this feature cannot afford.
@MainActor
@Observable
final class HistoricalTaxSaleViewModel {
    /// Which record set the map is showing.
    enum Mode: String, Sendable, CaseIterable, Identifiable {
        case current
        case historical

        var id: String { rawValue }

        var label: String {
            switch self {
            case .current: "Current notices"
            case .historical: "Historical records"
            }
        }

        /// The marker the web prints on the parcel card, so a reader who came
        /// back to the app knows which question it is answering.
        var markerLabel: String {
            switch self {
            case .current: "Current-notice mode"
            case .historical: "Historical-records mode"
            }
        }
    }

    let catalog: HistoricalTaxSaleCatalog

    var mode: Mode = .current
    var filter = HistoricalTaxSaleCatalog.Filter()

    init(catalog: HistoricalTaxSaleCatalog = .bundled) {
        self.catalog = catalog
    }

    var isShowingHistorical: Bool { mode == .historical }

    /// Datasets this build ships and could not read, with the reason.
    var unreadable: [HistoricalTaxSaleCatalog.Unreadable] { catalog.unreadable }

    /// Every dated event this build carries. What a shared link is checked
    /// against: a link naming an event that is not in here is naming one this
    /// build cannot show.
    var catalogEventIDs: [String] { catalog.events.map(\.id) }

    var municipalities: [(id: String, label: String)] { catalog.municipalities }
    var years: [String] { catalog.years }
    var outcomes: [HistoricalOutcome] { catalog.outcomes }

    var filteredRecords: [HistoricalTaxSaleRecord] {
        catalog.records(matching: filter)
    }

    /// The PIDs the map draws while the historical mode is on.
    ///
    /// Matched records only, narrowed by the filter. An ambiguous or unmatched
    /// listing has no parcel this build is willing to name, so it is listed and
    /// not drawn.
    var highlightedPIDs: Set<String> {
        guard isShowingHistorical else { return [] }
        return Set(catalog.matchedPIDs(in: filteredRecords))
    }

    /// Every matched PID, which is what is worth asking NSPRD for once — the
    /// filter moves often and the geometry does not.
    var matchedPIDs: [String] { catalog.matchedPIDs() }

    /// The records naming this PID, narrowed by the filter, as the web narrows
    /// the card to what the panel is currently showing.
    func contexts(forPID pid: String) -> [HistoricalRecordContext] {
        guard isShowingHistorical else { return [] }
        let visible = Set(filteredRecords.map(\.recordID))
        return catalog.contexts(forPID: pid).filter { visible.contains($0.record.recordID) }
    }

    func event(id: String) -> HistoricalTaxSaleEvent? { catalog.event(id: id) }

    /// The line under the panel heading: how much of the set the filters leave.
    var filterSummary: String {
        let shown = filteredRecords.count
        let total = catalog.records.count
        return shown == total
            ? "\(total) records across \(catalog.events.count) sales"
            : "\(shown) of \(total) records"
    }
}
