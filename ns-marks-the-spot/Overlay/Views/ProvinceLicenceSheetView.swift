import SwiftUI

/// The Province of Nova Scotia restricted-licence decision.
///
/// Shown the first time the user turns on a layer backed by a restricted
/// Province service, not at launch: most of the map works without it, and a
/// legal dialog in front of a user who may never open one of these layers is a
/// dialog they will dismiss without reading.
///
/// The full text ships in the bundle rather than behind a link, because the one
/// place a user is most likely to want to read it is standing in a field with
/// no signal.
struct ProvinceLicenceSheetView: View {
    @Environment(\.dismiss) private var dismiss

    let layerName: String
    let onAccept: () -> Void
    let onDecline: () -> Void

    private var licenceText: String? {
        guard let url = Bundle(for: LayerResourceBundleToken.self)
            .url(forResource: "ProvinceRestrictedGeographicServicesLicense.md", withExtension: nil)
        else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("“\(layerName)” is published by the Province of Nova Scotia under a restricted licence. Accept it once to use every Province layer in this app.")
                        .font(.subheadline)

                    if let licenceText {
                        Text(licenceText)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    } else {
                        // The bundled copy is the licence; without it there is
                        // nothing to agree to, and saying so beats an Accept
                        // button over an empty page.
                        Text("The licence text could not be loaded from this build, so it cannot be shown for you to read. Province layers stay unavailable.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
            .navigationTitle("Province Data Licence")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not Now") {
                        onDecline()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Accept") {
                        onAccept()
                        dismiss()
                    }
                    .disabled(licenceText == nil)
                }
            }
        }
    }
}
