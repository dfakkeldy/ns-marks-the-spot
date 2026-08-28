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

        /// Identity is everything the strip *says*: provider, copyright,
        /// caveat and licence title. The licence must be part of it — the
        /// Province publishes layers under both a restricted licence and the
        /// Open Government Licence with the same provider name and disclaimer,
        /// and folding those into one credit showed whichever licence happened
        /// to come first for imagery drawn under the other. The URL is
        /// deliberately not identity: two layers naming the same licence title
        /// carry the same licence text on different hosts, and splitting the
        /// strip per host would print the same credit twice.
        var id: String {
            [provider, copyright ?? "", disclaimer, licenseTitle ?? ""]
                .joined(separator: "\u{1F}")
        }
    }

    /// The credit the OpenStreetMap tile policy requires wherever its map is
    /// shown, leading the strip because the base is under everything else.
    ///
    /// The provider is the credit line itself, so the collapsed strip reads
    /// "© OpenStreetMap contributors" verbatim — which is the wording the
    /// policy asks for, exactly as the browser's corner control carries it.
    static let openStreetMapCredit = Credit(
        provider: OpenStreetMapBase.credit,
        copyright: nil,
        disclaimer: "The base map is drawn from live OpenStreetMap tiles. "
            + "Map data is available under the Open Database Licence.",
        licenseTitle: "openstreetmap.org/copyright",
        licenseURL: OpenStreetMapBase.copyrightURL
    )

    /// The credits for what is drawn: the base map's, where the base owes one,
    /// then one entry per distinct source among the layers.
    static func credits(
        for descriptors: [LayerDescriptor], baseMap: MapBaseType
    ) -> [Credit] {
        (baseMap == .openStreetMap ? [openStreetMapCredit] : [])
            + credits(for: descriptors)
    }

    /// One entry per distinct source among the layers currently drawn.
    ///
    /// Layers only — a surface whose ground can be the OpenStreetMap base must
    /// call `credits(for:baseMap:)` above, or its required credit is silently
    /// dropped.
    ///
    /// Distinct by the whole credit — provider, copyright, caveat and licence
    /// together, in the order the layers were given: provincial layers under
    /// one licence are one credit, but restricted and Open Government layers
    /// stay separate entries even though both say "Province of Nova Scotia",
    /// because a licence line that names the wrong terms is worse than a
    /// longer strip.
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
