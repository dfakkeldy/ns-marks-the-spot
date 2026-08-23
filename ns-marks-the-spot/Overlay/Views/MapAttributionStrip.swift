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
    /// Somewhere to send a reader who wants the whole catalogue rather than
    /// what happens to be switched on.
    let onOpenSources: () -> Void

    @State private var isExpanded = false

    private var credits: [ActiveAttribution.Credit] {
        ActiveAttribution.credits(for: descriptors)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.snappy(duration: 0.2)) { isExpanded.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Text(ActiveAttribution.summary(for: credits))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(isExpanded ? nil : 1)
                        .multilineTextAlignment(.leading)

                    if !credits.isEmpty {
                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
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
                            Link(title, destination: url)
                                .font(.caption2)
                        }
                    }
                }

                Button("All sources", action: onOpenSources)
                    .font(.caption2)
                    .accessibilityIdentifier("map-attribution-all-sources")
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: 320, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
    }
}
