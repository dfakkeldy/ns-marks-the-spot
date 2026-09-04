import MapCatalog
import SwiftUI

/// Who the map is currently borrowing from, under the map.
///
/// One line collapsed, because the disclaimers run two sentences each and a
/// strip that covered a third of a phone would be the first thing a reader
/// learned to ignore. Tapping opens the rest in place: the full statement for
/// every source drawn, and its licence where there is one to read.
struct MapAttributionStrip: View {
    let descriptors: [LayerDescriptor]
    /// Which ground the layers are drawn over, because the OpenStreetMap base
    /// carries a credit of its own that must show whenever its tiles do.
    let baseMap: MapBaseType
    /// Somewhere to send a reader who wants the whole catalogue rather than
    /// what happens to be switched on.
    let onOpenSources: () -> Void

    @State private var isExpanded = false
    /// A bundled licence the reader tapped, presented in-app: its URL is a
    /// file URL, which `Link` renders as a control that does nothing on iOS.
    @State private var bundledLicence: PresentedBundledLicence?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var credits: [ActiveAttribution.Credit] {
        ActiveAttribution.credits(for: descriptors, baseMap: baseMap)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.snappy(duration: 0.2).unlessReduced(reduceMotion)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 4) {
                    Text(ActiveAttribution.summary(for: credits))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        // Two lines collapsed, not one: the line carries both
                        // the OpenStreetMap credit its tile policy requires
                        // and the boundaries caveat, and at one line it never
                        // rendered whole on any phone width.
                        .lineLimit(isExpanded ? nil : 2)
                        .multilineTextAlignment(.leading)

                    if !credits.isEmpty {
                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
                // The whole strip is the control, not only the words in it.
                // Collapsed, this line is the way into every licence the map
                // is relying on, and the gap beside the chevron used to
                // swallow the tap that went for it.
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(credits.isEmpty)
            .accessibilityIdentifier("map-attribution")
            .accessibilityHint(credits.isEmpty ? "" : "Shows the full source statements")

            if isExpanded {
                ForEach(credits) { credit in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(credit.copyright ?? credit.provider)
                            .font(.caption2.weight(.semibold))

                        Text(credit.disclaimer)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        if let title = credit.licenseTitle, let url = credit.licenseURL {
                            if url.isFileURL {
                                Button {
                                    bundledLicence = PresentedBundledLicence(title: title, url: url)
                                } label: {
                                    Text(title)
                                        .font(.caption2)
                                        .frame(minHeight: 44)
                                        .contentShape(Rectangle())
                                }
                            } else {
                                Link(destination: url) {
                                    Text(title)
                                        .font(.caption2)
                                        .frame(minHeight: 44)
                                        .contentShape(Rectangle())
                                }
                            }
                        }
                    }
                }

                Button(action: onOpenSources) {
                    Text("All sources")
                        .font(.caption2)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("map-attribution-all-sources")
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: 320, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        .sheet(item: $bundledLicence) { licence in
            BundledLicenceReaderView(title: licence.title, fileURL: licence.url)
        }
    }
}
