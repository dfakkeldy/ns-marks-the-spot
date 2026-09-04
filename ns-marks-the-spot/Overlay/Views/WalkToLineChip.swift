import GeoCore
import SwiftUI

/// How far the reader is from a line, and which way.
///
/// The landowner walking a boundary and the researcher finding a listed lot's
/// edge want the same two numbers, and nothing on the map computed the reader's
/// distance to anything. This is the reading `WalkToLine` produces, said.
///
/// What it does not say, and will not: it names no parcel, asserts no boundary
/// and turns nothing into a position. The distance is from a device fix to
/// geometry already on screen, and both of those carry caveats that travel with
/// the number rather than being summarised away — the parcel caveat below, and
/// the fix's own accuracy, which is called out whenever it is wider than the
/// distance being reported. "Three metres to the boundary" from a fix known to
/// twelve is a figure whose error bar swallows it whole, and a reader stepping
/// to that line is trusting arithmetic the device cannot support.
struct WalkToLineChip: View {
    var reading: WalkToLine.Reading
    /// Shown when the reading is against a parcel boundary: the standing
    /// caveat, wherever a traced boundary is offered.
    var parcelCaveat: String

    private var distance: String { Geodesy.formatDistance(reading.distanceMetres) }

    private var whatItIs: String {
        switch (reading.source, reading.kind) {
        case (.parcel, .vertex): "to the boundary corner"
        case (.parcel, .edge): "to the boundary"
        case (.ownFeature, .vertex): "to your corner"
        case (.ownFeature, .edge): "to your shape"
        }
    }

    /// True north, and said so. The map is drawn in true north and the
    /// device's compass is never consulted, so a reader holding a magnetic
    /// compass has to apply the local declination themselves — which is why
    /// this never says "heading" and never draws an arrow.
    private var direction: String? {
        guard let bearing = reading.bearingDegrees else { return nil }
        return "\(Geodesy.compassPoint(forBearingDegrees: bearing)) · \(Int(bearing.rounded()))° true"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "ruler")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                if reading.distanceMetres == 0 {
                    Text("You are on it")
                        .font(.footnote.weight(.semibold))
                } else {
                    Text("\(distance) \(whatItIs)")
                        .font(.footnote.weight(.semibold))
                    if let direction {
                        Text(direction)
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // The one thing a distance readout can quietly get wrong.
            if reading.isWithinFixAccuracy {
                Text("Your position is known less precisely than this distance.")
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if reading.source == .parcel {
                Text(parcelCaveat)
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .mapChromeSurface(cornerRadius: 8, shadow: nil)
        // One element, so a reader hears the distance, the direction and the
        // caveats as one answer rather than swiping through four fragments.
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("walk-to-line")
    }
}
