import NSDataServices
import SwiftUI

/// Looks up a parcel by PID or civic address, and reports what the lookup did.
///
/// The message under the field is not decoration. A parcel lookup can fail in
/// ways that look identical on a map — nothing drawn — and only the words
/// separate "the Province has no parcel there" from "we could not ask".
struct ParcelSearchBar: View {
    @Bindable var viewModel: OverlayViewModel
    @FocusState private var isFocused: Bool

    /// How tall the matched addresses are, so the list can be given its own
    /// height when it is short and a scrolling window when it is not.
    @State private var resultsHeight: CGFloat = 0

    /// The tallest that window gets. Scaled with the text size, because a
    /// fixed 220 points at an accessibility size is one row and a half.
    @ScaledMetric private var resultsCap: CGFloat = 220

    /// How tall the map is under this column. The scaled cap alone can be
    /// taller than a phone held sideways, so the list also stops short of the
    /// bottom of the screen. Unbounded where no height is passed.
    var availableHeight: CGFloat = .infinity

    /// The cap actually applied: the scaled one, or what is left of the
    /// screen after the field, its message and the attribution, whichever is
    /// smaller.
    private var resultsLimit: CGFloat {
        min(resultsCap, max(132, availableHeight - 240))
    }

    /// The field's text lives in the view model, which is the only place that
    /// can tell the user typing from the app filling a result in. The binding
    /// routes writes back through `editSearchText`, so a keystroke drops the
    /// stale results and a programmatic fill does not.
    private var query: Binding<String> {
        Binding(
            get: { viewModel.searchText },
            set: { viewModel.editSearchText($0) }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)

                // A default keyboard rather than a numeric one: the field takes
                // civic addresses as well as PIDs, and offering digits only
                // would say otherwise before the user typed anything.
                //
                // The link is named in the placeholder because it is the only
                // advertisement it gets: nothing routes a web link into this
                // app, so a reader who was sent a view has no way to guess that
                // pasting it here opens it.
                TextField("PID, address or shared link", text: query)
                    .textFieldStyle(.plain)
                    .font(.subheadline)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.search)
                    .focused($isFocused)
                    .onSubmit {
                        viewModel.submitSearch()
                        isFocused = false
                    }
                    .accessibilityLabel("PID, address or shared link")

                if !viewModel.searchText.isEmpty {
                    Button {
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

            // Kept separate from the lookup message above rather than merged
            // into it. A link that names a parcel writes its own result there a
            // moment later, and folding the two together would take the
            // sentence about the missing layers with it.
            if let notice = viewModel.sharedLinkNotice {
                Text(notice)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.regularMaterial)
                    .clipShape(.rect(cornerRadius: 10))
                    .shadow(color: .black.opacity(0.12), radius: 3, x: 0, y: 1)
                    .accessibilityIdentifier("shared-link-notice")
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// The addresses that matched, for the user to choose between.
    ///
    /// Choosing one is what asks NSPRD which parcel is under it — the address
    /// and the parcel are separate records, and the app does not claim one from
    /// the other until the Province has been asked.
    private var addressResults: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Twelve results is what the query asks for, and twelve rows at an
            // accessibility text size are taller than the phone. They scroll,
            // and the attribution below them does not: a licence that has to
            // be scrolled past the twelfth address to reach is a licence the
            // reader never sees. The browser caps and scrolls the same list.
            //
            // Given the height of its own rows rather than the height it is
            // offered, so that one result is one result tall.
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(viewModel.addressResults, id: \.pntid) { address in
                        Button {
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

                        Divider().padding(.leading, 12)
                    }
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                    resultsHeight = height
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(height: resultsHeight > 0 ? min(resultsHeight, resultsLimit) : nil)

            // Attribution, not decoration: the Civic Address File is published
            // under the Open Government Licence – Nova Scotia, which requires
            // the source to be identified wherever the data is shown. It also
            // tells the user whose record these addresses are, which is the
            // difference between a Province record and a guess by this app.
            //
            // Two links because they are two documents. This one is the
            // dataset; naming the licence in the same tap target and then
            // opening the dataset is how a reader ends up believing they have
            // seen terms they have not.
            Link(destination: CivicAddressQuery.datasetURL) {
                Text("Nova Scotia Civic Address File. \(CivicAddressQuery.attribution)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityIdentifier("civic-address-attribution")

            Link(destination: CivicAddressQuery.licenceURL) {
                Text("Open Government Licence – Nova Scotia")
                    .font(.caption2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityIdentifier("civic-address-licence")
        }
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 12))
        .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
        .accessibilityIdentifier("civic-address-results")
    }
}
