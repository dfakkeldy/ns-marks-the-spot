import SwiftUI

/// Looks up a parcel by PID, and reports what the lookup did.
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

                TextField("Parcel ID", text: $query)
                    .textFieldStyle(.plain)
                    .font(.subheadline)
                    .keyboardType(.numbersAndPunctuation)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.search)
                    .focused($isFocused)
                    .onSubmit {
                        viewModel.searchParcel(query)
                        isFocused = false
                    }
                    .accessibilityLabel("Parcel ID")

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
}
