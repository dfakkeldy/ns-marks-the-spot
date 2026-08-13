import NSDataServices
import SwiftUI

/// Looks up a parcel by PID or civic address, and reports what the lookup did.
///
/// The message under the field is not decoration. A parcel lookup can fail in
/// ways that look identical on a map — nothing drawn — and only the words
/// separate "the Province has no parcel there" from "we could not ask".
struct ParcelSearchBar: View {
    @Bindable var viewModel: OverlayViewModel
    @State private var query = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)

                // A default keyboard rather than a numeric one: the field takes
                // civic addresses as well as PIDs, and offering digits only
                // would say otherwise before the user typed anything.
                TextField("PID or civic address", text: $query)
                    .textFieldStyle(.plain)
                    .font(.subheadline)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.search)
                    .focused($isFocused)
                    .onSubmit {
                        viewModel.searchParcel(query)
                        isFocused = false
                    }
                    .accessibilityLabel("PID or civic address")

                if !query.isEmpty {
                    Button {
                        query = ""
                        viewModel.clearParcelSelection()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Clear parcel search")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.regularMaterial)
            .clipShape(.rect(cornerRadius: 12))
            .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)

            if !viewModel.addressResults.isEmpty {
                addressResults
            }

            if let message = viewModel.parcelMessage {
                Text(message)
                    .font(.footnote)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.regularMaterial)
                    .clipShape(.rect(cornerRadius: 10))
                    .shadow(color: .black.opacity(0.12), radius: 3, x: 0, y: 1)
                    .accessibilityIdentifier("parcel-lookup-message")
                    // Fixed size in the vertical direction only: a message can
                    // run to two lines, and truncating it would drop the half
                    // that says which kind of nothing was found.
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        // A tap on the map identifies a parcel, so the field has to keep the
        // selection it produced in view: whatever the user last asked about is
        // what the field says, whether they typed it or tapped it.
        .onChange(of: viewModel.parcels.selectedPID) { _, selected in
            guard let selected, selected != query else { return }
            query = selected
        }
    }

    /// The addresses that matched, for the user to choose between.
    ///
    /// Choosing one is what asks NSPRD which parcel is under it — the address
    /// and the parcel are separate records, and the app does not claim one from
    /// the other until the Province has been asked.
    private var addressResults: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(viewModel.addressResults, id: \.pntid) { address in
                Button {
                    query = address.label
                    isFocused = false
                    viewModel.selectAddress(address)
                } label: {
                    Text(address.label)
                        .font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)

                if address.pntid != viewModel.addressResults.last?.pntid {
                    Divider().padding(.leading, 12)
                }
            }
        }
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 12))
        .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
        .accessibilityIdentifier("civic-address-results")
    }
}
