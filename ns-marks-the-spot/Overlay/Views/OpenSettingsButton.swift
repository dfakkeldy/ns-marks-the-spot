import SwiftUI
import UIKit

/// The way out of a refusal.
///
/// Every message that says location permission was not granted carries it,
/// because the setting it describes is changed in Settings and nowhere in
/// this app; a refusal with no route there leaves the reader stuck.
struct OpenSettingsButton: View {
    /// Run after the link is followed, so the message that carried the button
    /// can come down: the reader has acted on it.
    var onOpen: (() -> Void)? = nil

    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                openURL(url)
            }
            onOpen?()
        } label: {
            // The frame is the target: a footnote-sized label alone was well
            // under the 44-point minimum.
            Text("Open Settings")
                .font(.footnote.weight(.semibold))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        // The same button serves location and photo refusals; the hint names
        // the page, not one permission.
        .accessibilityHint("Opens this app's page in Settings.")
    }
}
