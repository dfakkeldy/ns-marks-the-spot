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
                    licenceSection
                    dataSourcesSection
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
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

            Text("Not for navigation. Saved-area downloads in v1.0 include Fletcher tiles only. NS Aerial and provincial reference layers stay online and become available from viewed cache after you open them.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
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
