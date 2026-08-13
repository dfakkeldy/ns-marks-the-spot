import MapCatalog
import SwiftUI

struct InfoSheetView: View {
    @Environment(\.dismiss) private var dismiss

    /// Every catalogued layer, including the ones this build cannot draw. The
    /// sheet answers "where does this map's data come from", and a source is no
    /// less real for not being rendered yet.
    private let layers = LayerCatalog.all

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    aboutSection
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
