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

/// The same layers as they print.
///
/// A separate set rather than the screen styles at a different opacity, because
/// the page is a different medium: the screen tells these layers apart by hue,
/// and a page that may be photocopied, faxed to a municipality or printed on a
/// mono office printer has to tell them apart by weight and dash instead. The
/// web's print branches, carried over so a printed page from either surface can
/// be laid beside the other and read the same way.
public enum PrintVectorFeatureStyles {
    public static let zoning = VectorFeatureStyle(
        strokeHex: "#333333",
        fillHex: "#ededed",
        fillOpacity: 0.35,
        lineWidth: 1,
        dashPattern: [1, 2]
    )

    public static func oldGrowth(_ status: OldGrowthPolicyOverlay.Status) -> VectorFeatureStyle {
        switch status {
        case .confirmedOldGrowth:
            VectorFeatureStyle(
                strokeHex: "#2f2f2f", fillHex: "#bcbcbc", fillOpacity: 0.5, lineWidth: 1.5
            )
        case .restorationOpportunity:
            VectorFeatureStyle(
                strokeHex: "#666666", fillHex: "#dedede", fillOpacity: 0.45, lineWidth: 1.4,
                dashPattern: [6, 3]
            )
        case .unknown:
            VectorFeatureStyle(
                strokeHex: "#888888", fillHex: "#f2f2f2", fillOpacity: 0.35, lineWidth: 1.3,
                dashPattern: [2, 3]
            )
        }
    }

    /// Still dashed on paper, and in its own pattern: the derivation is the
    /// reason this parcel is on the page, and the page has no colour left to
    /// say so with.
    public static let mineralProximityParcel = VectorFeatureStyle(
        strokeHex: "#222222",
        fillHex: "#e6e6e6",
        fillOpacity: 0.28,
        lineWidth: 2,
        dashPattern: [2, 3, 8, 3]
    )

    public static func resourcePoint(_ detail: ResourcePointLayerDetail) -> VectorFeatureStyle {
        VectorFeatureStyle(
            strokeHex: "#111111",
            fillHex: "#e8e8e8",
            fillOpacity: 0.8,
            lineWidth: 1.5,
            // The openings keep the dash they have nowhere else: on a mono page
            // the two inventories are otherwise the same grey dot, and one of
            // them is a physical hazard.
            dashPattern: detail.id == .abandonedMines ? [2, 2] : nil,
            markerRadius: detail.id == .abandonedMines ? 6 : 5
        )
    }

    /// A well, in ink rather than in accuracy colour.
    ///
    /// The filled-versus-hollow distinction survives the loss of hue, which is
    /// the one that matters: a hollow dashed dot is a record from an area, and
    /// printing it solid would put a well on the page at a spot nobody surveyed.
    public static func wellLog(_ accuracy: WellLogOverlay.Accuracy) -> VectorFeatureStyle {
        if accuracy == .surveyed {
            return VectorFeatureStyle(
                strokeHex: "#111111",
                fillHex: "#4b4b4b",
                fillOpacity: 0.85,
                lineWidth: 1.25,
                markerRadius: 5
            )
        }
        return VectorFeatureStyle(
            strokeHex: "#111111",
            strokeOpacity: 0.7,
            fillHex: nil,
            fillOpacity: 0,
            lineWidth: 1,
            dashPattern: [2, 2],
            markerRadius: 4
        )
    }

    /// A screened reach, where the opportunity band is carried entirely by
    /// weight and dash — the seven bands are a colour ramp on screen and have
    /// to survive a mono page as seven distinguishable lines.
    public static func hydroReach(
        _ potentialClass: HydroPotentialPilot.PotentialClass
    ) -> VectorFeatureStyle {
        let style = HydroPotentialPilot.printLineStyle(for: potentialClass)
        return VectorFeatureStyle(
            strokeHex: "#222222",
            strokeOpacity: 0.9,
            lineWidth: style.width,
            dashPattern: style.dashPattern,
            hasRoundedEnds: true
        )
    }
}
