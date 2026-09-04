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

    /// Everything under the field, measured at the height it wants.
    ///
    /// One region, and one number. Nothing under here is optional reading:
    /// the licence the Civic Address File is published under, the addresses
    /// themselves, and the sentence separating "the Province has no parcel
    /// there" from "we could not ask". Sizing them against each other left
    /// whichever lost the arithmetic below the bottom of the screen, where
    /// nothing scrolled and nothing could reach it.
    @State private var cardHeight: CGFloat = 0

    /// The field above it, and the parts inside it that do not flex. Measured
    /// rather than allowed for: a flat allowance was the field alone at an
    /// accessibility text size.
    @State private var fieldHeight: CGFloat = 0
    @State private var attributionHeight: CGFloat = 0
    @State private var footerHeight: CGFloat = 0

    /// How much of the addresses to show before scrolling them, at this text
    /// size. Scaled, because a fixed 220 points at an accessibility size is
    /// one row and a half. The browser caps its own list at the same 220.
    @ScaledMetric private var resultsCap: CGFloat = 220

    /// One row, so that a screen with almost nothing left still shows
    /// something to scroll rather than a sliver of material.
    @ScaledMetric private var rowFloor: CGFloat = 44

    /// How tall the map is under this column. The scaled cap alone can be
    /// taller than a phone held sideways, so the card also stops short of the
    /// bottom of the screen. Unbounded where no height is passed.
    var availableHeight: CGFloat = .infinity

    /// The tallest the card is allowed to be: enough for the licence, a
    /// screenful of addresses and the message, or what the screen has left
    /// under the field, whichever is smaller.
    private var cardLimit: CGFloat {
        let preferred = resultsCap + attributionHeight + footerHeight
        guard availableHeight.isFinite else { return preferred }
        // 60 points above this column and 12 of air below it, plus the eight
        // point gap under the field.
        let room = availableHeight - 80 - fieldHeight
        return min(preferred, max(rowFloor, room))
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
                    .font(.subheadline.weight(.semibold))
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
                            .font(.subheadline)
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
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                fieldHeight = height
            }

            // One scroll region, rather than a scrolling list with fixed
            // matter above and below it. Given the height of its own content
            // so that two results are two results tall, and capped so that
            // twelve of them at an accessibility text size are still a card
            // and not the whole screen.
            //
            // Rendered only when it holds something. A scroll view takes every
            // point it is offered until its content has been measured, and an
            // empty one left standing is an invisible 260 point column down
            // the map taking drags that belong to MapKit.
            if hasCardContent {
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 8) {
                        if !viewModel.addressResults.isEmpty {
                            addressResults
                        }

                        footer
                    }
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                        cardHeight = height
                    }
                }
                .scrollBounceBehavior(.basedOnSize)
                .frame(height: cardHeight > 0 ? min(cardHeight, cardLimit) : nil)
            }
        }
    }

    /// Whether anything under the field has something to say.
    private var hasCardContent: Bool {
        !viewModel.addressResults.isEmpty || viewModel.parcelMessage != nil
            || viewModel.sharedLinkNotice != nil
    }

    /// What the lookup had to say, under the list.
    ///
    /// Grouped so that its height can be measured in one place: these words
    /// are the difference between "the Province has no parcel there" and "we
    /// could not ask", and the list above must not push them off the screen.
    @ViewBuilder
    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
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
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
            footerHeight = height
        }
    }

    /// The addresses that matched, for the user to choose between.
    ///
    /// Choosing one is what asks NSPRD which parcel is under it — the address
    /// and the parcel are separate records, and the app does not claim one from
    /// the other until the Province has been asked.
    private var addressResults: some View {
        VStack(alignment: .leading, spacing: 0) {
            attribution

            // The licence sits above the rows rather than under them. Twelve
            // results is what the query asks for, and twelve rows at an
            // accessibility text size are taller than the phone: a licence
            // under them is a licence reached by scrolling past the twelfth
            // address, which is a licence nobody reads.
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
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 12))
        .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
        .accessibilityIdentifier("civic-address-results")
    }

    /// Whose addresses these are.
    ///
    /// Attribution, not decoration: the Civic Address File is published under
    /// the Open Government Licence – Nova Scotia, which requires the source to
    /// be identified wherever the data is shown. It also tells the user whose
    /// record these addresses are, which is the difference between a Province
    /// record and a guess by this app.
    ///
    /// Two links because they are two documents. The first is the dataset;
    /// naming the licence in the same tap target and then opening the dataset
    /// is how a reader ends up believing they have seen terms they have not.
    private var attribution: some View {
        VStack(alignment: .leading, spacing: 0) {
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
                    .padding(.top, 2)
                    .padding(.bottom, 8)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityIdentifier("civic-address-licence")

            Divider()
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
            attributionHeight = height
        }
    }
}
