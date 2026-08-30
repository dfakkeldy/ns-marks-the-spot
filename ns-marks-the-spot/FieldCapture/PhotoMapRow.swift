import GeoCore
import PhotosUI
import SwiftUI

/// The catalogue-free My Maps row for the device photo library.
///
/// Three distinct states: granted, limited, and denied. The subtitle never
/// claims the photos leave the device.
struct PhotoMapRow: View {
    @Bindable var viewModel: PhotoMapViewModel
    var onPicked: ([PhotosPickerItem]) -> Void

    @State private var pickerItems: [PhotosPickerItem] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Circle()
                    .fill(Color(uiColor: UIColor(featureHex: "#7c3aed")))
                    .frame(width: 10, height: 10)

                Toggle(isOn: Binding(
                    get: { viewModel.isVisible },
                    set: { visible in
                        Task { await viewModel.setVisible(visible) }
                    }
                )) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Photo map")
                            .font(.subheadline)
                        Text(viewModel.subtitle)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .toggleStyle(.switch)
                .disabled(viewModel.access == .denied)
                .accessibilityIdentifier("photo-map-toggle")
            }

            if viewModel.isIndexing {
                Text("Indexing your photos…")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if let status = viewModel.statusLine {
                HStack(alignment: .top) {
                    Text(status)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if viewModel.access == .limited {
                        Button("Manage") { viewModel.openManageAccess() }
                            .font(.caption2)
                    }
                }
            }

            if let note = viewModel.truncationNote, viewModel.isVisible {
                Text(note)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            PhotosPicker(
                selection: $pickerItems,
                maxSelectionCount: PhotoDescriptor.maxPerLayer,
                matching: .images
            ) {
                Label("Place photos as points", systemImage: "photo.badge.plus")
                    .font(.caption)
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("place-photos")
        }
        .accessibilityIdentifier("photo-map-row")
        .onChange(of: pickerItems) { _, items in
            guard !items.isEmpty else { return }
            pickerItems = []
            onPicked(items)
        }
    }
}
