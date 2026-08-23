import NSDataServices
import SwiftUI

/// The current tax-sale notices, and the properties each advertises.
///
/// A sheet rather than the web's rail: the same content, on a phone. What it
/// must keep from the web is the order of the claims — a dated notice, from a
/// named municipality, retrieved on a stated day, with a link to the source
/// document — so nothing here reads as this app's own listing of a property.
struct TaxSaleNoticesView: View {
    let viewModel: TaxSaleViewModel
    let overlayViewModel: OverlayViewModel
    /// Dismisses this sheet once a property is chosen, so the map and the
    /// parcel card it just opened are visible.
    let onSelectProperty: () -> Void

    @State private var now = Date()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(
                        "Dated official notices. Past sale dates require municipal "
                            + "result verification."
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                    Picker("Redemption category", selection: filterBinding) {
                        ForEach(RedemptionFilter.allCases, id: \.self) { filter in
                            Text("\(filter.label) \(viewModel.filterCounts[filter] ?? 0)")
                                .tag(filter)
                        }
                    }
                    .pickerStyle(.segmented)

                    if let message = overlayViewModel.listedParcelMessage {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .accessibilityAddTraits(.updatesFrequently)
                    }

                    ForEach(viewModel.unreadableDatasetNames, id: \.self) { name in
                        Label(
                            "This build could not read \(name), so that "
                                + "municipality's notice is missing.",
                            systemImage: "exclamationmark.triangle"
                        )
                        .font(.footnote)
                        .foregroundStyle(.orange)
                    }
                }

                ForEach(viewModel.upcomingEvents) { event in
                    Section {
                        eventHeader(event)
                        ForEach(viewModel.listings(in: event)) { listing in
                            ForEach(listing.pids, id: \.self) { pid in
                                propertyRow(event: event, listing: listing, pid: pid)
                            }
                        }
                        if !event.geometryExceptions.isEmpty {
                            unavailableRows(event)
                        }
                        sourceLinks(event)
                    }
                }
            }
            .navigationTitle("Tax-sale notices")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear { now = Date() }
    }

    private var filterBinding: Binding<RedemptionFilter> {
        Binding(
            get: { viewModel.filter },
            set: { filter in
                viewModel.filter = filter
                // The highlight is the filter's only effect on the map, and it
                // is computed from state the map does not observe.
                overlayViewModel.refreshListedParcelStyling()
            }
        )
    }

    @ViewBuilder
    private func eventHeader(_ event: TaxSaleEvent) -> some View {
        let summary = viewModel.summary(for: event)

        Toggle(isOn: Binding(
            get: { viewModel.isSelected(event.id) },
            set: { visible in
                viewModel.setEventVisibility(event.id, to: visible)
                overlayViewModel.refreshListedParcelStyling()
            }
        )) {
            VStack(alignment: .leading, spacing: 2) {
                Text(event.shortMunicipality)
                    .font(.headline)
                Text(TaxSaleFormat.eventDateLabel(event))
                    .font(.subheadline)
                Text(event.lifecycle(now: now).label)
                    .font(.footnote)
                    .foregroundStyle(
                        event.lifecycle(now: now) == .verifyResults ? .orange : .secondary
                    )
                Text(Self.countsLine(summary))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Snapshot retrieved \(TaxSaleFormat.day(event.retrievedOn))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func propertyRow(
        event: TaxSaleEvent,
        listing: TaxSaleListing,
        pid: String
    ) -> some View {
        Button {
            overlayViewModel.selectListedParcel(eventID: event.id, pid: pid)
            onSelectProperty()
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(listing.propertyLabel)
                    .font(.subheadline.weight(.semibold))
                Text(listing.lien.map { "Lien \($0) · PID \(pid)" } ?? "PID \(pid)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(
                    "\(listing.financial.label) "
                        + TaxSaleFormat.currency(cents: listing.financial.amountCents)
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Text(listing.redemptionLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if listing.listingStatus == .withdrawn {
                    // Struck out in the municipality's current revision. Kept in
                    // the list because it is in the notice the user is reading;
                    // its parcel is not drawn.
                    Text(TaxSaleListingStatus.withdrawn.label)
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            "\(listing.propertyLabel), lien \(listing.lien ?? "not listed"), PID \(pid)"
        )
    }

    /// The counts under a notice's name, in the web's two forms.
    ///
    /// A notice with rows NSPRD cannot draw says how many it advertised and how
    /// many of those are on the map, because that difference is the question a
    /// reader comparing the app against the printed notice is about to ask.
    /// Every other notice says what it struck out instead, which is the
    /// difference that matters when there is nothing missing.
    private static func countsLine(_ summary: TaxSaleViewModel.EventSummary) -> String {
        guard summary.unavailable > 0 else {
            return "\(summary.advertised) advertised · \(summary.withdrawn) withdrawn · "
                + "\(summary.activePIDs) active PIDs"
        }
        return "\(summary.advertised) advertised · \(summary.mapped) mapped · "
            + "\(summary.unavailable) unavailable in NSPRD"
    }

    /// The official rows NSPRD would not draw.
    ///
    /// Kept in the list and kept unselectable. A row the province has no exact
    /// parcel for is still in the municipality's notice, so dropping it would
    /// under-report the sale, and mapping it to a near match would put a
    /// reader on someone else's land.
    @ViewBuilder
    private func unavailableRows(_ event: TaxSaleEvent) -> some View {
        Text("Official notice rows unavailable in NSPRD")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)

        ForEach(event.geometryExceptions) { exception in
            VStack(alignment: .leading, spacing: 2) {
                Text(exception.location)
                    .font(.subheadline.weight(.semibold))
                Text(
                    (exception.aan.map { "AAN \($0) · " } ?? "")
                        + (exception.pids.count == 1 ? "PID " : "PIDs ")
                        + exception.pids.joined(separator: ", ")
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Text(
                    "No exact NSPRD geometry was returned on "
                        + "\(TaxSaleFormat.day(exception.checkedOn)). The official "
                        + "notice row is retained but is not shown as a mapped parcel."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func sourceLinks(_ event: TaxSaleEvent) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let venue = event.venue {
                Text(venue)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Link("Open direct official source", destination: event.sourceURL)
                .font(.footnote)
            if let landing = event.landingPageURL, landing != event.sourceURL {
                Link("Open the municipality's tax-sale page", destination: landing)
                    .font(.footnote)
            }
            Text("\(event.sourceLabel) · \(event.eventType.label)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
