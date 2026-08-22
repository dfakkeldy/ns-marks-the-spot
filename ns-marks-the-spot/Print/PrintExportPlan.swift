import Foundation
import GeoCore
import MapCatalog
import NSDataServices

/// Turns what the map is showing into what the page will say about it.
///
/// Kept apart from the export coordinator so the two decisions that a reader
/// could be misled by — what ground the page covers, and which layers it claims
/// to show — can be read and tested without a map view or a network.
nonisolated enum PrintExportPlan {
    /// The ground the printed frame covers.
    ///
    /// The paper's proportions are not the screen's, so one of the two
    /// dimensions has to give. It grows rather than shrinks: a page that
    /// covered less than the screen it was exported from would silently crop
    /// whatever the user had just put in the corner of the view.
    static func bounds(
        covering visible: GeoBoundingBox, mapFrame: PdfRect
    ) -> GeoBoundingBox {
        let northWest = WebMercator.project(
            GeoPoint(lat: visible.north, lng: visible.west)
        )
        let southEast = WebMercator.project(
            GeoPoint(lat: visible.south, lng: visible.east)
        )
        let width = southEast.x - northWest.x
        let height = northWest.y - southEast.y
        guard width > 0, height > 0, mapFrame.height > 0 else { return visible }

        let target = mapFrame.width / mapFrame.height
        var halfWidth = width / 2
        var halfHeight = height / 2
        if width / height < target {
            halfWidth = height * target / 2
        } else {
            halfHeight = width / target / 2
        }
        let centreX = (northWest.x + southEast.x) / 2
        let centreY = (northWest.y + southEast.y) / 2

        let topLeft = WebMercator.unproject(
            MercatorPoint(x: centreX - halfWidth, y: centreY + halfHeight)
        )
        let bottomRight = WebMercator.unproject(
            MercatorPoint(x: centreX + halfWidth, y: centreY - halfHeight)
        )
        return GeoBoundingBox(
            south: bottomRight.lat, west: topLeft.lng,
            north: topLeft.lat, east: bottomRight.lng
        )
    }

    /// What the legend may name, and what the page has to admit it is missing.
    ///
    /// A layer that did not draw is not in the legend. The legend is the page's
    /// account of what the reader is looking at, and naming a layer that is not
    /// in the raster would turn a source that could not be reached into a
    /// source that answered with nothing — which is the one substitution this
    /// map may never make.
    struct LayerAccount: Equatable {
        var legend: [PdfComposer.LegendEntry]
        /// Named on the page, in words, under the notes.
        var omitted: [String]
        /// Drew, but not everywhere.
        var incomplete: [String]
        /// On the screen, and outside what the page can draw.
        var unsupported: [String] = []
        /// Asked, answered, and with nothing of theirs over this ground.
        var uncovered: [String] = []
        /// Switched on, and never fetched because the licence is unanswered.
        var licenceBlocked: [String] = []

        var notes: [String] {
            var lines = [String]()
            if !unsupported.isEmpty {
                lines.append(
                    "Not printed — this app cannot yet draw these layers onto a page: "
                        + unsupported.joined(separator: ", ")
                        + ". They were on the screen this page was made from. "
                        + "Absence here is not evidence the layer has nothing at this place."
                )
            }
            if !licenceBlocked.isEmpty {
                lines.append(
                    "Not printed — the licence has not been accepted: "
                        + licenceBlocked.joined(separator: ", ")
                        + ". Absence here is not evidence the layer has nothing at this place."
                )
            }
            if !uncovered.isEmpty {
                // A different sentence from the one above, and deliberately so.
                // This layer answered; it simply does not reach this ground. A
                // reader may conclude the source does not cover this place, and
                // may not conclude anything about what is here.
                lines.append(
                    "No coverage here — these layers were on the screen and reach none of "
                        + "this ground: " + uncovered.joined(separator: ", ")
                        + ". That is a limit of the source's extent, not a finding about "
                        + "this place."
                )
            }
            if !omitted.isEmpty {
                lines.append(
                    "Not printed — the source could not be reached: "
                        + omitted.joined(separator: ", ")
                        + ". Absence here is not evidence the layer has nothing at this place."
                )
            }
            if !incomplete.isEmpty {
                lines.append(
                    "Partly printed — some tiles did not arrive: "
                        + incomplete.joined(separator: ", ") + "."
                )
            }
            return lines
        }
    }

    static func account(
        for outcomes: [PrintMapCompositor.LayerOutcome],
        swatch: (String) -> String?
    ) -> LayerAccount {
        var legend = [PdfComposer.LegendEntry]()
        var omitted = [String]()
        var incomplete = [String]()
        var unsupported = [String]()
        var uncovered = [String]()
        var licenceBlocked = [String]()
        for outcome in outcomes {
            switch outcome.state {
            case .drawn:
                legend.append(
                    PdfComposer.LegendEntry(
                        name: outcome.name, swatchColour: swatch(outcome.id)
                    )
                )
            case .partial:
                incomplete.append(outcome.name)
                legend.append(
                    PdfComposer.LegendEntry(
                        name: "\(outcome.name) (partly printed)",
                        swatchColour: swatch(outcome.id)
                    )
                )
            case .failed:
                omitted.append(outcome.name)
            case .unsupported:
                // Kept out of the legend for the same reason a failed layer is:
                // the legend names what the reader is looking at.
                unsupported.append(outcome.name)
            case .outsideCoverage:
                uncovered.append(outcome.name)
            case .licenceBlocked:
                licenceBlocked.append(outcome.name)
            }
        }
        return LayerAccount(
            legend: legend, omitted: omitted, incomplete: incomplete,
            unsupported: unsupported, uncovered: uncovered,
            licenceBlocked: licenceBlocked
        )
    }

    /// The attribution strip's sources, base map first, in the order they were
    /// drawn — and only for layers that actually printed.
    /// `drewParcels` credits the parcel geometry the compositor draws itself.
    ///
    /// Those outlines are not a layer outcome — they go onto the page whether
    /// or not the parcel layer is switched on — so deriving the credits from
    /// outcomes alone printed official Province boundaries over a page whose
    /// only attribution was Apple's. The obligation follows the ink.
    static func sources(
        baseMap: MapBaseType,
        outcomes: [PrintMapCompositor.LayerOutcome],
        drewParcels: Bool = false,
        descriptor: (String) -> LayerDescriptor?
    ) -> [PrintLayerSource] {
        // A page printed with no base map carries no Apple pixels, so it owes
        // Apple nothing. The obligation follows the ink here as it does below.
        var sources = baseMap == .blank
            ? []
            : [
                PrintLayerSource(
                    name: baseMapName(baseMap), attribution: "© Apple Maps", licenceUrl: nil
                )
            ]
        for outcome in outcomes {
            // A layer whose attribution is printed but whose pixels are not
            // would credit a publisher for a picture the page does not carry.
            if case .failed = outcome.state { continue }
            if case .unsupported = outcome.state { continue }
            // Neither of these put a pixel on the page, so neither is credited.
            // An attribution is owed for use, and a layer that reaches none of
            // this ground — or that was never fetched at all — was not used.
            if case .outsideCoverage = outcome.state { continue }
            if case .licenceBlocked = outcome.state { continue }
            guard let layer = descriptor(outcome.id) else { continue }
            // The app's own credit table, which is where the disclaimer text a
            // licence obliges is kept; the shared catalog carries the licence,
            // not the words it requires.
            let credit = NativeLayerTraits.attribution(for: layer)
            sources.append(
                PrintLayerSource(
                    name: layer.name,
                    attribution: [credit.copyright ?? credit.provider, credit.disclaimer]
                        .joined(separator: ". "),
                    licenceUrl: credit.licenseURL?.absoluteString
                )
            )
        }
        // Credited once. With the parcel layer on it is already in the list
        // above, and a page that named the Province twice would read as two
        // sources agreeing.
        if drewParcels, !sources.contains(where: { $0.name == parcelSourceName }),
           let layer = descriptor(LayerID.nsprd.rawValue)
        {
            let credit = NativeLayerTraits.attribution(for: layer)
            sources.append(
                PrintLayerSource(
                    name: layer.name,
                    attribution: [credit.copyright ?? credit.provider, credit.disclaimer]
                        .joined(separator: ". "),
                    licenceUrl: credit.licenseURL?.absoluteString
                )
            )
        }
        return sources
    }

    private static var parcelSourceName: String {
        LayerCatalog.descriptor(for: .nsprd)?.name ?? "NSPRD"
    }

    private static func baseMapName(_ baseMap: MapBaseType) -> String {
        switch baseMap {
        case .standard: "Apple Maps"
        case .satellite: "Apple Maps imagery"
        case .hybrid: "Apple Maps imagery"
        // The aerial is a layer of its own and is credited as one; what is
        // underneath it is still Apple's standard map.
        case .nsAerial: "Apple Maps"
        // Never reaches the strip — `sources` drops the base entry entirely —
        // but the evidence note names what was read over, and "no base map" is
        // the honest answer there.
        case .blank: "No base map"
        }
    }
}
