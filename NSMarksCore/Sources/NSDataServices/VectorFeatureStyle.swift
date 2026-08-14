import Foundation
import MapCatalog

/// How one drawn feature looks, in values a renderer can consume.
///
/// Colours stay hex strings all the way to the renderer, as they are in the
/// catalog and on the web, so a colour is compared and tested as the same text
/// on both surfaces rather than as a platform colour object that has already
/// been through a conversion.
public struct VectorFeatureStyle: Sendable, Hashable {
    public let strokeHex: String
    public let strokeOpacity: Double
    /// `nil` draws no fill at all, which is not the same as a clear fill: a
    /// hollow marker is how this app says "reported somewhere near here".
    public let fillHex: String?
    public let fillOpacity: Double
    public let lineWidth: Double
    /// Dash lengths in points, or `nil` for a solid line.
    public let dashPattern: [Double]?
    /// Point features only: the circle's radius in points.
    public let markerRadius: Double?
    /// Rounded ends and corners, as the web asks for on the hydro reaches: a
    /// stream drawn with mitred joins reads as a surveyed alignment rather than
    /// as the smoothed centre line it is.
    public let hasRoundedEnds: Bool

    public init(
        strokeHex: String,
        strokeOpacity: Double = 1,
        fillHex: String? = nil,
        fillOpacity: Double = 0,
        lineWidth: Double,
        dashPattern: [Double]? = nil,
        markerRadius: Double? = nil,
        hasRoundedEnds: Bool = false
    ) {
        self.strokeHex = strokeHex
        self.strokeOpacity = strokeOpacity
        self.fillHex = fillHex
        self.fillOpacity = fillOpacity
        self.lineWidth = lineWidth
        self.dashPattern = dashPattern
        self.markerRadius = markerRadius
        self.hasRoundedEnds = hasRoundedEnds
    }
}

/// The web's styling rules for the viewport feature layers.
///
/// Ported from the Leaflet components rather than reinvented. They are not
/// decoration: hollow-and-dashed against solid is how this map distinguishes a
/// record that was surveyed from one that was placed off a sheet, and a user
/// who learns the difference on one surface must not have to relearn it here.
public enum VectorFeatureStyles {
    /// A municipal zoning polygon, in its layer's declared colours.
    public static func zoning(_ detail: ZoningLayerDetail, opacity: Double) -> VectorFeatureStyle {
        VectorFeatureStyle(
            strokeHex: detail.strokeColor,
            fillHex: detail.fillColor,
            fillOpacity: opacity,
            lineWidth: 1
        )
    }

    /// An old-growth policy area, coloured by the status the source coded.
    ///
    /// An unknown status is drawn dashed and fainter than either mapped one,
    /// because it is a polygon this app could not classify rather than a third
    /// finding about the forest.
    public static func oldGrowth(
        _ status: OldGrowthPolicyOverlay.Status,
        colors: ForestryStatusColors,
        opacity: Double
    ) -> VectorFeatureStyle {
        let color =
            switch status {
            case .confirmedOldGrowth: colors.confirmedOldGrowth
            case .restorationOpportunity: colors.restorationOpportunity
            case .unknown: colors.unknown
            }
        return VectorFeatureStyle(
            strokeHex: color,
            strokeOpacity: opacity,
            fillHex: color,
            fillOpacity: status == .unknown ? 0.22 : 0.28,
            lineWidth: status == .confirmedOldGrowth ? 1.7 : 1.4,
            dashPattern: status == .unknown ? [4, 3] : nil
        )
    }

    /// A mineral occurrence or abandoned-mine opening.
    public static func resourcePoint(
        _ detail: ResourcePointLayerDetail,
        opacity: Double
    ) -> VectorFeatureStyle {
        VectorFeatureStyle(
            strokeHex: "#ffffff",
            fillHex: detail.markerColor,
            fillOpacity: opacity,
            lineWidth: 1.5,
            // The abandoned-mine openings are drawn a point larger than the
            // occurrences, as on the web: of the two inventories it is the one
            // carrying a physical hazard.
            markerRadius: detail.id == .abandonedMines ? 6 : 5
        )
    }

    /// A well log, drawn by how well its location is known.
    ///
    /// Only a surveyed location gets a filled dot. Every coarser band is hollow
    /// and dashed so it reads as a report from an area rather than a plotted
    /// point — the accuracy is the difference between a well at that spot and a
    /// well somewhere within a kilometre and a half of it.
    public static func wellLog(_ accuracy: WellLogOverlay.Accuracy) -> VectorFeatureStyle {
        let color: String =
            switch accuracy {
            case .surveyed: "#0ea5e9"
            case .mapReferenced: "#7dd3fc"
            case .sheetReferenced: "#bae6fd"
            case .community: "#cbd5e1"
            case .unknown: "#e2e8f0"
            }

        if accuracy == .surveyed {
            return VectorFeatureStyle(
                strokeHex: "#ffffff",
                fillHex: color,
                fillOpacity: 0.95,
                lineWidth: 1.5,
                markerRadius: 5
            )
        }
        return VectorFeatureStyle(
            strokeHex: color,
            strokeOpacity: 0.75,
            fillHex: color,
            fillOpacity: 0.12,
            lineWidth: 1.25,
            dashPattern: [2, 2],
            markerRadius: 4
        )
    }

    /// A parcel within a kilometre of a recorded occurrence.
    ///
    /// Dashed on purpose: the boundary is NSPRD's, but the reason it is drawn
    /// is a derivation this app performed, and a solid outline would read as
    /// the Province having published this parcel as mineral-adjacent.
    public static let mineralProximityParcel = VectorFeatureStyle(
        strokeHex: "#72520f",
        fillHex: "#f1c453",
        fillOpacity: 0.28,
        lineWidth: 2,
        dashPattern: [5, 3]
    )

    /// A screened hydro reach.
    public static func hydroReach(
        _ potentialClass: HydroPotentialPilot.PotentialClass,
        upstreamAreaKm2: Double
    ) -> VectorFeatureStyle {
        let style = HydroPotentialPilot.lineStyle(
            upstreamAreaKm2: upstreamAreaKm2, potentialClass: potentialClass
        )
        return VectorFeatureStyle(
            strokeHex: style.colorHex,
            strokeOpacity: style.opacity,
            lineWidth: style.width,
            hasRoundedEnds: true
        )
    }
}
