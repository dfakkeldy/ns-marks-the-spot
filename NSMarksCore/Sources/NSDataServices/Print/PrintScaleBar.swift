import Foundation
import GeoCore

/// The scale bar and the representative fraction printed beside it.
///
/// Ported from `web/src/print/pdf/scaleBar.ts`. Measured on the ground rather
/// than in projected metres: Mercator inflates distance by about 1.44× at Nova
/// Scotian latitudes, so a bar drawn from projected metres would be a bar
/// labelled with a length nobody could pace out.
public struct PrintScaleBar: Hashable, Sendable {
    public var metres: Double
    public var label: String
    public var widthPoints: Double
    public var denominator: Double
    public var denominatorLabel: String

    /// Largest 1, 2 or 5 × 10ⁿ length that fits the space.
    static func roundedLength(atMost target: Double) -> Double {
        guard target > 0, target.isFinite else { return 0 }
        let magnitude = pow(10, (log10(target)).rounded(.down))
        let normalized = target / magnitude
        let step: Double = normalized >= 5 ? 5 : (normalized >= 2 ? 2 : 1)
        return step * magnitude
    }

    public static func build(
        bounds: GeoBoundingBox,
        mapFrame: PdfRect,
        maxWidthPoints: Double
    ) -> PrintScaleBar {
        let midLatitude = (bounds.north + bounds.south) / 2
        let groundWidth = WebMercator.groundMetres(
            from: GeoPoint(lat: midLatitude, lng: bounds.west),
            to: GeoPoint(lat: midLatitude, lng: bounds.east)
        )
        let metresPerPoint = groundWidth / mapFrame.width
        let denominator = metresPerPoint / PdfTemplate.metresPerPoint
        let metres = roundedLength(atMost: metresPerPoint * maxWidthPoints)
        return PrintScaleBar(
            metres: metres,
            label: metres >= 1_000 ? "\(trimmed(metres / 1_000)) km" : "\(trimmed(metres)) m",
            widthPoints: metresPerPoint > 0 ? metres / metresPerPoint : 0,
            denominator: denominator,
            denominatorLabel: "≈ 1:\(grouped(threeSignificantFigures(denominator)))"
        )
    }

    /// A rounded length is 1, 2 or 5 × 10ⁿ, so it is a whole number of metres
    /// except below 1 m and a whole number of kilometres above 1 km. Printing
    /// "2.0 km" where the web prints "2 km" would be a visible difference
    /// between two pages meant to be the same.
    private static func trimmed(_ value: Double) -> String {
        value == value.rounded()
            ? String(Int(value.rounded()))
            : String(format: "%g", value)
    }

    private static func threeSignificantFigures(_ value: Double) -> Double {
        guard value > 0, value.isFinite else { return 0 }
        let magnitude = pow(10, (log10(value)).rounded(.down) - 2)
        return (value / magnitude).rounded() * magnitude
    }

    /// Grouped the way the web's `toLocaleString("en-CA")` groups, so the
    /// fraction reads the same on both pages.
    private static func grouped(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_CA")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 3
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}
