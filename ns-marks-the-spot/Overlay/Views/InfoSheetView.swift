import SwiftUI

struct InfoSheetView: View {
    @Environment(\.dismiss) private var dismiss

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

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(layer.name)
                .font(.subheadline)
                .bold()

            Text(layer.attribution.provider)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let copyright = layer.attribution.copyright {
                Text(copyright)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let licenseTitle = layer.attribution.licenseTitle {
                Text(licenseTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(layer.attribution.disclaimer)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let userCaveat = layer.userCaveat {
                Text(userCaveat)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

#Preview {
    InfoSheetView()
}
