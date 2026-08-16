import NSDataServices
import SwiftUI
import UIKit

/// Where the map is, and a way to take that with you.
///
/// A port of the web's position readout. It answers the question a field user
/// asks most often — "where am I looking?" — and tapping it puts the pair on
/// the pasteboard, which is how a coordinate gets from this map into a GPS, a
/// message, or somebody's notes.
///
/// The coordinate is the centre of the view, not a fix: it says where the map
/// is pointed, and it is not a reading of where the phone is.
struct MapPositionReadout: View {
    let position: MapPosition
    /// Roughly how large what is on screen is, in the terms a paper map uses.
    /// Approximate, and stated as such: see `DisplayScale`.
    var screenScale: String?

    @State private var hasCopied = false
    @State private var isShowingScaleCaveat = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            coordinate
            if let screenScale {
                Button {
                    isShowingScaleCaveat = true
                } label: {
                    Text(screenScale)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(.regularMaterial)
                        .clipShape(.rect(cornerRadius: 8))
                }
                .accessibilityLabel(screenScale)
                .accessibilityHint("How accurate this is")
                .accessibilityIdentifier("map-scale-readout")
                .popover(isPresented: $isShowingScaleCaveat) {
                    Text(DisplayScale.caveat)
                        .font(.footnote)
                        .padding()
                        .frame(maxWidth: 280)
                        .presentationCompactAdaptation(.popover)
                }
            }
        }
    }

    private var coordinate: some View {
        Button {
            UIPasteboard.general.string = position.coordinateText
            hasCopied = true
        } label: {
            Text(hasCopied ? "Copied" : position.readoutText)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.regularMaterial)
                .clipShape(.rect(cornerRadius: 8))
        }
        .accessibilityLabel("Copy Map Centre Coordinates")
        .accessibilityValue(position.readoutText)
        .accessibilityIdentifier("map-position-readout")
        // Two seconds, as on the web, then back to the coordinate. The
        // confirmation replaces the readout rather than sitting beside it, so
        // it cannot be left standing over a position that has since moved.
        .task(id: hasCopied) {
            guard hasCopied else { return }
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            hasCopied = false
        }
        // A move puts the readout back to reading: "Copied" over a coordinate
        // that is no longer the one on the pasteboard would be a lie.
        .onChange(of: position) { _, _ in
            hasCopied = false
        }
    }
}
