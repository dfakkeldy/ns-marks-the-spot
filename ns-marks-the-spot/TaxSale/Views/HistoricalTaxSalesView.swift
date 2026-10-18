import NSDataServices
import SwiftUI

/// Sales that have already happened, and what was published about them.
///
/// Reached by switching the map's mode rather than by turning on another layer,
/// because that is what the web does and the reason is the same: this panel and
/// the notices answer different questions, and a map showing both at once puts
/// a dated outcome and a live offering in front of a reader at the same time.
struct HistoricalTaxSalesView: View {
    let viewModel: HistoricalTaxSaleViewModel
    let overlayViewModel: OverlayViewModel
    let onSelectProperty: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(
                        "Dated results from official municipal sources. A record is "
                            + "evidence that a property was advertised and that a named "
                            + "source published an outcome — nothing about who owns it now."
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                    Text(viewModel.filterSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let message = overlayViewModel.historicalParcelMessage {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .accessibilityAddTraits(.updatesFrequently)
                    }

                    ForEach(viewModel.unreadable, id: \.dataset) { unreadable in
                        Label(
                            "This build could not read \(unreadable.dataset): "
                                + unreadable.reason,
                            systemImage: "exclamationmark.triangle"
                        )
                        .font(.footnote)
                        .foregroundStyle(.orange)
                    }
                }

                Section("Filters") {
                    Picker("Municipality", selection: municipalityBinding) {
                        Text("All municipalities").tag(String?.none)
                        ForEach(viewModel.municipalities, id: \.id) { municipality in
                            Text(municipality.label).tag(String?.some(municipality.id))
                        }
                    }
                    Picker("Year", selection: yearBinding) {
                        Text("All years").tag(String?.none)
                        ForEach(viewModel.years, id: \.self) { year in
                            Text(year).tag(String?.some(year))
                        }
                    }
                    // Only the outcomes present in the record set. Offering
                    // "Cancelled" when nothing was cancelled invites a reader to
                    // run the filter and take the empty result as a finding.
                    Picker("Outcome", selection: outcomeBinding) {
                        Text("All outcomes").tag(HistoricalOutcome?.none)
                        ForEach(viewModel.outcomes, id: \.self) { outcome in
                            Text(outcome.label).tag(HistoricalOutcome?.some(outcome))
                        }
                    }
                }

                Section("Records") {
                    ForEach(viewModel.filteredRecords) { record in
                        recordRow(record)
                    }
                }
            }
            .navigationTitle("Historical records")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var municipalityBinding: Binding<String?> {
        Binding(
            get: { viewModel.filter.municipalityID },
            set: {
                viewModel.filter.municipalityID = $0
                overlayViewModel.refreshHistoricalStyling()
            }
        )
    }

    private var yearBinding: Binding<String?> {
        Binding(
            get: { viewModel.filter.year },
            set: {
                viewModel.filter.year = $0
                overlayViewModel.refreshHistoricalStyling()
            }
        )
    }

    private var outcomeBinding: Binding<HistoricalOutcome?> {
        Binding(
            get: { viewModel.filter.outcome },
            set: {
                viewModel.filter.outcome = $0
                overlayViewModel.refreshHistoricalStyling()
            }
        )
    }

    @ViewBuilder
    private func recordRow(_ record: HistoricalTaxSaleRecord) -> some View {
        let event = viewModel.event(id: record.eventID)
        let context = event.map { HistoricalRecordContext(event: $0, record: record) }

        Button {
            if let pid = record.pids.first {
                overlayViewModel.selectHistoricalParcel(pid: pid)
                onSelectProperty()
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(record.civicDescription)
                    .font(.subheadline.weight(.semibold))
                if let event {
                    Text("\(event.shortMunicipality) · \(TaxSaleFormat.day(event.saleDate))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(record.pids.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                if let event {
                    Text(
                        "\(event.advertisedAmountLabel) "
                            + TaxSaleFormat.currency(cents: record.advertisedAmountCents)
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                if let context {
                    Text("\(context.outcomeLabel) · \(context.winningBidLabel)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                // A listing nobody could tie to a parcel is listed and not
                // drawn, and the row says which it is rather than leaving the
                // reader to notice nothing appeared on the map.
                if record.nsprdMatchStatus != .matched {
                    Text("Not matched to an NSPRD parcel; no boundary is drawn.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(record.nsprdMatchStatus != .matched)
    }
}
