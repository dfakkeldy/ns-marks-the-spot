import Foundation
import GeoCore
import MapCatalog

/// Who to credit for what is on the screen right now.
///
/// The info sheet lists every catalogued layer, which answers "what could this
/// app show" rather than "what am I looking at". A reader can turn on a
/// provincial overlay or a Rumsey scan, read something off it, and never meet
/// its provenance or its caveat — and the restricted provincial licence
/// requires its statement to be shown, not merely to exist somewhere in the
/// app. This gathers the credits for the layers actually drawn, so the strip
/// under the map names them.
nonisolated enum ActiveAttribution {
    /// True of every layer here and of the base map, so it is said whether or
    /// not anything is turned on. Parcel edges are drawn from a provincial
    /// index, not from a surveyor's plan, and the distance between the two is
    /// the whole reason this map is a screening tool.
    static let boundaryCaveat = "Boundaries are not a survey"

    struct Credit: Identifiable, Equatable {
        var provider: String
        /// A branch or a publisher, when the provider alone is too broad to
        /// credit correctly. NS Aerial is the province's, but the imagery is
        /// Service Nova Scotia's.
        var copyright: String?
        var disclaimer: String
        var licenseTitle: String?
        var licenseURL: URL?

        var id: String { provider + disclaimer }
    }

    /// One entry per distinct source among the layers currently drawn.
    ///
    /// Distinct by provider and caveat together, in the order the layers were
    /// given: eleven provincial layers are one credit, and a municipal source
    /// that states no terms stays its own entry rather than being folded into
    /// the licensed ones.
    static func credits(for descriptors: [LayerDescriptor]) -> [Credit] {
        var seen = Set<String>()
        var credits: [Credit] = []
        for descriptor in descriptors {
            let attribution = NativeLayerTraits.attribution(for: descriptor)
            let credit = Credit(
                provider: attribution.provider,
                copyright: attribution.copyright,
                disclaimer: attribution.disclaimer,
                licenseTitle: attribution.licenseTitle,
                licenseURL: attribution.resolvedLicenseURL
            )
            guard seen.insert(credit.id).inserted else { continue }
            credits.append(credit)
        }
        return credits
    }

    /// How many sources the collapsed line names before it starts counting.
    ///
    /// Two, because everything switched on at once runs to five and the Rumsey
    /// credit alone is seventy characters — a line that long is truncated by
    /// the label and the reader learns nothing from the half that survives.
    static let namedInSummary = 2

    /// The one line the strip shows before anyone taps it.
    ///
    /// Providers rather than their disclaimers, because the disclaimers are
    /// two sentences each and a strip that covered a third of a phone's map
    /// would be turned off by everyone it is meant to inform. The full text is
    /// one tap away and the caveat is here regardless.
    static func summary(for credits: [Credit]) -> String {
        guard !credits.isEmpty else { return boundaryCaveat }
        var parts = credits.prefix(namedInSummary).map(\.provider)
        let remaining = credits.count - parts.count
        if remaining > 0 { parts.append("+\(remaining) more") }
        return parts.joined(separator: " · ") + " · " + boundaryCaveat
    }
}
