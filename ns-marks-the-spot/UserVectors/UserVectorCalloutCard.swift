import GeoCore
import SwiftUI

/// What a tapped feature of the user's own layer says about itself.
///
/// A card of the app's own rather than MapKit's callout bubble, and the same
/// card for every geometry type. The bubble has room for a title and a subtitle
/// and appears only over an annotation, which would have meant an imported
/// track or parcel could be tapped and say nothing at all, and an imported
/// marker could speak without naming where it came from.
struct UserVectorCalloutCard: View {
    let callout: VectorFeatureCallout
    let layerName: String
    var onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(callout.title)
                    .font(.headline)
                Spacer()
                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.secondary)
                        .symbolRenderingMode(.hierarchical)
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }

            if let detail = callout.detail {
                Text(detail)
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // The claim the data makes about itself — when it was captured
            // and how rough the fix was — so a ±40 m mark never reads as a
            // surveyed corner. Rendered only when both reserved keys are
            // present; see VectorFeatureCallout.
            if let gpsProvenance = callout.gpsProvenance {
                Label(gpsProvenance, systemImage: "location")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // The provenance is the point of the card. This is the user's own
            // material, and a panel that presented it in the same voice as a
            // registry parcel would be inviting a conclusion the map cannot
            // support.
            Label("\(layerName) · \(callout.provenance)", systemImage: "person.crop.square")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
    }
}

/// A tapped feature, identified so a `.overlay` can present it.
struct UserVectorCalloutItem: Identifiable, Equatable {
    let id: String
    let callout: VectorFeatureCallout
    let layerName: String

    init(feature: GeoJsonFeature, record: UserVectorLayerRecord) {
        id = "\(record.id)/\(feature.id ?? "feature")"
        callout = VectorFeatureCallout(feature: feature, record: record)
        layerName = record.name
    }
}
