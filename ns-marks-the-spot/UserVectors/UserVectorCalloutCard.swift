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
    /// A control's touch target, scaled with the reader's text so the glyph
    /// inside it never outgrows the box around it. A definite size rather than
    /// a minimum, which is the pattern MapControlIcon already uses on the
    /// rail: a minimum lets the enclosing row propose whatever width it has
    /// left, so the target is only as certain as the layout around it.
    @ScaledMetric(relativeTo: .title3) private var controlTarget: CGFloat = 44

    let callout: VectorFeatureCallout
    let layerName: String
    /// The feature's photo descriptors and the bytes behind them. Nil loader
    /// means no photo row — a preview or test without a store.
    var photos: [PhotoDescriptor] = []
    var loadPhoto: ((_ photoID: String, _ thumb: Bool) async -> Data?)?
    /// Download progress for a photo still on its way from iCloud, if the
    /// loader knows it; nil for a photo that is local or not loading.
    var loadProgress: ((_ photoID: String) -> Double?)?
    var onClose: () -> Void

    @State private var lightbox: CalloutLightboxPhoto?

    var body: some View {
        // The title and Close stay put; everything under them scrolls. At an
        // accessibility text size a card with a description, a thumbnail, a
        // GPS caveat and a provenance line is taller than a phone in
        // landscape, and a card taller than the screen took its own Close
        // control off the top of it — with the provenance, which is the point
        // of the card, going first.
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(callout.title)
                    .font(.headline)
                Spacer()
                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .symbolRenderingMode(.hierarchical)
                        .frame(width: controlTarget, height: controlTarget)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    if let detail = callout.detail {
                        Text(detail)
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    // Thumbnails between the description and the provenance, as the
                    // web's popup places them.
                    if let loadPhoto, !photos.isEmpty {
                        // Lazy: a cluster card can hold hundreds of thumbnails, and
                        // an eager row started every download at once.
                        ScrollView(.horizontal) {
                            LazyHStack(spacing: 8) {
                                ForEach(Array(photos.enumerated()), id: \.element.id) {
                                    index, descriptor in
                                    Button {
                                        lightbox = CalloutLightboxPhoto(
                                            id: descriptor.id,
                                            title: descriptor.sourceName ?? "Photo \(index + 1)"
                                        )
                                    } label: {
                                        PhotoThumbView(progress: loadProgress?(descriptor.id)) {
                                            await loadPhoto(descriptor.id, true)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Open photo \(index + 1) of \(photos.count)")
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
                    }

                    // The claim the data makes about itself — when it was captured
                    // and how rough the fix was — so a ±40 m mark never reads as a
                    // surveyed corner. Rendered only when both reserved keys are
                    // present; see VectorFeatureCallout.
                    if let gpsProvenance = callout.gpsProvenance {
                        Label(gpsProvenance, systemImage: "location")
                            .font(.footnote)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let tracedCaveat = callout.tracedCaveat {
                        Text(tracedCaveat)
                            .font(.footnote)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    // The provenance is the point of the card. This is the user's own
                    // material, and a panel that presented it in the same voice as a
                    // registry parcel would be inviting a conclusion the map cannot
                    // support.
                    // It and the two lines above it carry the label colour for
                    // the same reason: they are what stops a drawn shape being
                    // read as a record, so they cannot be the faintest text on
                    // the card.
                    Label("\(layerName) · \(callout.provenance)", systemImage: "person.crop.square")
                        .font(.footnote)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Only as tall as it needs to be, up to what the caller leaves it.
            .scrollBounceBehavior(.basedOnSize)
        }
        .padding(12)
        .mapChromeSurface(shadow: nil)
        .fullScreenCover(item: $lightbox) { photo in
            PhotoLightboxView(
                title: photo.title,
                load: { await loadPhoto?(photo.id, false) }
            ) {
                lightbox = nil
            }
        }
    }
}

private struct CalloutLightboxPhoto: Identifiable {
    let id: String
    let title: String
}

/// A tapped feature, identified so a `.overlay` can present it.
struct UserVectorCalloutItem: Identifiable, Equatable {
    let id: String
    let callout: VectorFeatureCallout
    let layerName: String
    /// The layer the feature belongs to and its photo descriptors, so the
    /// card can load the bytes behind them.
    let layerID: String
    let photos: [PhotoDescriptor]
    /// A cluster card's members, by feature id, so the card can be re-read
    /// from the index without parsing its own identifier.
    let memberFeatureIDs: [String]?

    init(feature: GeoJsonFeature, record: UserVectorLayerRecord) {
        id = "\(record.id)/\(feature.id ?? "feature")"
        callout = VectorFeatureCallout(feature: feature, record: record)
        layerName = record.name
        layerID = record.id
        photos = PhotoDescriptor.read(from: feature.properties)
        memberFeatureIDs = nil
    }

    /// A card assembled from several features: a cluster's photos together.
    init(
        id: String, callout: VectorFeatureCallout, layerName: String, layerID: String,
        photos: [PhotoDescriptor], memberFeatureIDs: [String]? = nil
    ) {
        self.id = id
        self.callout = callout
        self.layerName = layerName
        self.layerID = layerID
        self.photos = photos
        self.memberFeatureIDs = memberFeatureIDs
    }
}
