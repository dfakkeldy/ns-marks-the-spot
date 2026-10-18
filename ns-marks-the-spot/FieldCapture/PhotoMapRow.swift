import GeoCore
import PhotosUI
import SwiftUI

/// The catalogue-free My Maps row for the device photo library.
///
/// Distinct states, each with its own line: granted, limited (with the
/// system's picker to change the selection), denied (with the way to
/// Settings), and for the switch itself waiting for access, indexing, and on
/// with a count. The subtitle never claims the photos leave the device.
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

                // The switch shows the reader's intent, not the index's
                // progress: it flips the moment it is tapped and stays there
                // through the prompt and the read.
                Toggle(isOn: Binding(
                    get: { viewModel.isOn },
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
                .disabled(!viewModel.canShowOnMap && viewModel.access != .unknown)
                .accessibilityIdentifier("photo-map-toggle")
            }

            if let line = viewModel.indexLine {
                Text(line)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("photo-map-index-line")
                    // The end of a read is said, not only shown: "no photos
                    // with a location" arrived silently for a VoiceOver
                    // reader who had just thrown the switch.
                    .onChange(of: line) { _, line in
                        if viewModel.state == .on || viewModel.state == .failed {
                            AccessibilityNotification.Announcement(line).post()
                        }
                    }
            }

            if let status = viewModel.statusLine {
                HStack(alignment: .firstTextBaseline) {
                    Text(status)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if viewModel.access == .limited {
                        // The system's own picker, in place: "Manage" used
                        // to open Settings, which is not where the selection
                        // is changed. The frame is the target; the caption
                        // alone was well under 44 points.
                        Button {
                            Task { await viewModel.presentLimitedLibraryPicker() }
                        } label: {
                            Text("Manage")
                                .font(.caption2)
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Manage photo access")
                    }
                }
                if viewModel.access == .denied {
                    OpenSettingsButton()
                }
            }

            PhotosPicker(
                selection: $pickerItems,
                maxSelectionCount: PhotoDescriptor.maxPerLayer,
                matching: .images
            ) {
                Label("Add photos to map", systemImage: "photo.badge.plus")
                    .font(.caption)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
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
