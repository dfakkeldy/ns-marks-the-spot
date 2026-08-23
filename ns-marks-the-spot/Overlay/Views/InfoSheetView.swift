import MapCatalog
import SwiftUI

struct InfoSheetView: View {
    @Environment(\.dismiss) private var dismiss

    /// The model that holds the licence. Optional so the sheet can still be
    /// previewed and tested on its own; without one it shows the sources and
    /// offers no licence control, rather than offering one that does nothing.
    var overlayVM: OverlayViewModel?

    @State private var isConfirmingRevoke = false

    /// Every catalogued layer, including the ones this build cannot draw. The
    /// sheet answers "where does this map's data come from", and a source is no
    /// less real for not being rendered yet.
    private let layers = LayerCatalog.all

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    aboutSection
                    methodSection
                    makerSection
                    linksSection
                    licenceSection
                    dataSourcesSection
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
            .accessibilityIdentifier("map-info-scroll")
            .navigationTitle("Map Info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("About This Map")
                .font(.headline)

            Text("NS Marks The Spot pairs Fletcher historical imagery with live provincial reference layers for exploring Nova Scotia.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Said once, plainly, at the top. The per-layer caveats each say
            // what one source cannot answer; none of them says what the map as
            // a whole is for, and a reader who has just found a parcel drawn
            // over a 1960s survey sheet is exactly the reader who needs to be
            // told before they act on it.
            Text("It is a screening and research tool. Nothing here is a survey, a title search or legal proof, and every parcel boundary is a drawing of a record rather than a line on the ground.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // What the app can promise about being offline, and no more. The
            // tile cache is a cache: it holds what was looked at recently,
            // within a size limit, and drops the oldest to make room. Saying a
            // layer "becomes available" once opened reads as a download, and a
            // reader who drives out of coverage on that sentence finds the
            // imagery gone.
            Text("Not for navigation. A saved area holds Fletcher sheets. NS Aerial and the Province reference layers stay online. Tiles you have already looked at redraw without a connection until the cache makes room for newer ones. Parcels, zoning and the other queried layers need a connection every time.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    /// What the map does with evidence, and what it will not do.
    ///
    /// The same four promises the browser's About dialog makes, because they
    /// are promises about the data both surfaces read rather than about either
    /// one's interface. A reader deciding whether to act on a parcel is
    /// deciding how much this map is claiming, and the answer has to be
    /// somewhere they can find it.
    ///
    /// The location sentence is the one that had to be rewritten rather than
    /// copied. The browser promises location never leaves the browser; here
    /// the promise is about the device, which is the same promise in the only
    /// words that are true of an app.
    private var methodSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("How It Treats Data")
                .font(.headline)

            ForEach(Self.methodPoints, id: \.self) { point in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("•")
                    Text(point)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private static let methodPoints = [
        "Every tax-sale notice ships inside the app with the SHA-256 of the file it was built from, so a dataset cannot change without its receipt changing.",
        "Unknown outcomes stay unknown. A result is never inferred, so a dated record cannot read as a current offering.",
        "An empty answer and a failed source are reported differently. Absence of evidence is never shown as evidence of absence.",
        "No assessed-owner name is ingested. Your location, your saved areas and the maps you import stay on this device.",
    ]

    /// Who made the map, which is part of what a reader is judging when they
    /// judge the map.
    ///
    /// The browser's About dialog says it and this sheet did not, so a reader
    /// who came to the app first had no way to tell whether the person naming
    /// every source and scale had ever made a map before. The sentence about
    /// web engineering is left in the browser, where it is true of the thing
    /// being described; the standard it names is the same on both.
    private var makerSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Who Makes It")
                .font(.headline)

            Text("I have made maps for twenty years, mostly for forestry in Nova Scotia. Every layer here names its source, its scale and its licence, the way a printed map sheet carries its legend and its survey notes.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Where to read the code, and how to reach a person.
    ///
    /// The browser puts both in its About dialog and its footer, and a reader
    /// who finds something wrong on the map has nowhere to say so without
    /// them. The App Store page is not that route: a review is public, it
    /// cannot carry a screenshot or a PID, and it cannot be replied to.
    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Link(
                "Source on GitHub",
                destination: URL(string: "https://github.com/dfakkeldy/ns-marks-the-spot")!
            )
            Link(
                "Email the maker",
                destination: URL(
                    string: "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot"
                )!
            )
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The way back out of an accepted Province licence.
    ///
    /// The app has always been able to ask for acceptance and never able to
    /// take it back, which made "accept" a one-way door. Withdrawing has to
    /// state what it does to data already on the device, because that is the
    /// part a user cannot see for themselves.
    @ViewBuilder private var licenceSection: some View {
        if let overlayVM, overlayVM.hasAcceptedProvinceLicence {
            VStack(alignment: .leading, spacing: 12) {
                Text("Provincial Data Licence")
                    .font(.headline)

                Text("You have accepted the Province of Nova Scotia's licence for its restricted map services. Withdrawing switches those layers off, clears any provincial parcel evidence on screen, and deletes the tiles already cached on this device.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text("Saved offline areas are unaffected: they contain Fletcher tiles only, which are not licensed under it.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Button("Withdraw Acceptance", role: .destructive) {
                    isConfirmingRevoke = true
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("revoke-province-licence")

                if let failure = overlayVM.licenceSweepFailure {
                    Text(failure)
                        .font(.footnote)
                        .foregroundStyle(Color.red)
                }
            }
            .confirmationDialog(
                "Withdraw acceptance of the provincial data licence?",
                isPresented: $isConfirmingRevoke,
                titleVisibility: .visible
            ) {
                Button("Withdraw", role: .destructive) {
                    Task { await overlayVM.revokeProvinceLicence() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Provincial layers will be switched off and their cached tiles deleted. You can accept again at any time.")
            }
        }
    }

    private var dataSourcesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Data Sources & Licenses")
                .font(.headline)

            ForEach(layers) { layer in
                LayerAttributionRow(layer: layer)
            }
        }
    }
}

private struct LayerAttributionRow: View {
    let layer: LayerDescriptor

    private var attribution: LayerAttribution {
        NativeLayerTraits.attribution(for: layer)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(layer.name)
                .font(.subheadline)
                .bold()

            Text(attribution.provider)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let copyright = attribution.copyright {
                Text(copyright)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let licenseTitle = attribution.licenseTitle {
                if let licenseURL = attribution.resolvedLicenseURL {
                    Link(licenseTitle, destination: licenseURL)
                        .font(.caption)
                } else {
                    Text(licenseTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(attribution.disclaimer)
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(NativeLayerTraits.caveat(for: layer))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

#Preview {
    InfoSheetView()
}
