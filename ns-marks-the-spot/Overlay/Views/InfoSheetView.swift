import GeoCore
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
                    versionFooter
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
            Link(destination: URL(string: "https://github.com/dfakkeldy/ns-marks-the-spot")!) {
                Text("Source on GitHub")
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            Link(destination: Self.feedbackMailURL) {
                Text("Email the maker")
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Which build the reader is holding, in the marketing-plus-build form
    /// beta feedback needs: two TestFlight builds share a marketing version
    /// and differ only in the bracketed build number.
    ///
    /// Rendered from the bundle rather than hard-coded, so it cannot drift
    /// from what was actually installed. When the bundle carries no version —
    /// previews, bare test hosts — the row disappears instead of reading
    /// "Version  ()".
    @ViewBuilder private var versionFooter: some View {
        if let version = Self.appVersion {
            Text("Version \(version)")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// "1.0 (7)", or just "1.0" without a build number, or nil when the
    /// bundle reports no marketing version at all.
    static func versionDescription(shortVersion: String?, build: String?) -> String? {
        guard let shortVersion, !shortVersion.isEmpty else { return nil }
        guard let build, !build.isEmpty else { return shortVersion }
        return "\(shortVersion) (\(build))"
    }

    /// The subject line a feedback email arrives under. Carrying the version
    /// means a beta report identifies its build even when the sender never
    /// thinks to mention it.
    static func feedbackSubject(version: String?) -> String {
        guard let version else { return "NS Marks The Spot" }
        return "NS Marks The Spot \(version)"
    }

    private static let appVersion = versionDescription(
        shortVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
            as? String,
        build: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    )

    /// Built with `URLComponents` so the subject's spaces and brackets are
    /// percent-encoded correctly rather than by hand.
    private static let feedbackMailURL: URL = {
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = "map@kinnokilabs.com"
        components.queryItems = [
            URLQueryItem(name: "subject", value: feedbackSubject(version: appVersion))
        ]
        return components.url ?? URL(string: "mailto:map@kinnokilabs.com")!
    }()

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

            // The ground itself, first: the attribution strip's credit line
            // sends readers here for the rest, and the OpenStreetMap base is
            // the one source the catalogue's rows do not answer for.
            openStreetMapRow

            ForEach(layers) { layer in
                LayerAttributionRow(layer: layer)
            }
        }
    }

    private var openStreetMapRow: some View {
        let credit = ActiveAttribution.openStreetMapCredit
        return VStack(alignment: .leading, spacing: 6) {
            Text(OpenStreetMapBase.pageName)
                .font(.subheadline)
                .bold()

            Text(credit.provider)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let licenseTitle = credit.licenseTitle, let licenseURL = credit.licenseURL {
                Link(licenseTitle, destination: licenseURL)
                    .font(.caption)
                    .accessibilityIdentifier("source-licence-\(OpenStreetMapBase.layerID)")
            }

            Text(credit.disclaimer)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct LayerAttributionRow: View {
    let layer: LayerDescriptor

    /// A bundled licence resolves to a file URL, which `Link` renders as an
    /// inert control on iOS — presented in-app instead.
    @State private var presentedBundledLicence: PresentedBundledLicence?

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
                // Named for the layer it belongs to. A test that only looked
                // for the licence text would pass while it sat under the wrong
                // layer, which is the one thing this row exists to get right.
                if let licenseURL = attribution.resolvedLicenseURL, licenseURL.isFileURL {
                    Button(licenseTitle) {
                        presentedBundledLicence = PresentedBundledLicence(
                            title: licenseTitle, url: licenseURL
                        )
                    }
                    .font(.caption)
                    .accessibilityIdentifier("source-licence-\(layer.id.rawValue)")
                    .sheet(item: $presentedBundledLicence) { licence in
                        BundledLicenceReaderView(title: licence.title, fileURL: licence.url)
                    }
                } else if let licenseURL = attribution.resolvedLicenseURL {
                    Link(licenseTitle, destination: licenseURL)
                        .font(.caption)
                        .accessibilityIdentifier("source-licence-\(layer.id.rawValue)")
                } else {
                    Text(licenseTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("source-licence-\(layer.id.rawValue)")
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
