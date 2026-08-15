import Foundation

/// How one feature of a user's layer is drawn.
///
/// Named for the user rather than for features in general because
/// `NSDataServices` already has a `VectorFeatureStyle` for the catalogued
/// layers: same idea, different vocabulary (that one carries a dash pattern and
/// a marker radius the catalog specifies, this one carries the simplestyle
/// properties a user's own file may set). App files import both modules, so two
/// types of the same name would be ambiguous at every use site.
public struct UserVectorStyle: Hashable, Sendable {
    public var strokeHex: String
    public var weight: Double
    public var strokeOpacity: Double
    public var fillHex: String
    public var fillOpacity: Double

    public init(
        strokeHex: String, weight: Double, strokeOpacity: Double,
        fillHex: String, fillOpacity: Double
    ) {
        self.strokeHex = strokeHex
        self.weight = weight
        self.strokeOpacity = strokeOpacity
        self.fillHex = fillHex
        self.fillOpacity = fillOpacity
    }
}

/// The colours a user layer is drawn in, and how a feature's own styling
/// overrides them.
public enum VectorStyle {
    /// Okabe–Ito, minus the yellow: it disappears over aerial imagery.
    ///
    /// Colourblind-safe, and assigned once at import and stored on the record
    /// rather than derived from the layer's position in the list — a layer
    /// keeps its colour for life instead of changing when the user deletes a
    /// neighbour.
    public static let layerColors = [
        "#d55e00",  // vermillion
        "#0072b2",  // blue
        "#009e73",  // bluish green
        "#cc79a7",  // reddish purple
        "#e69f00",  // orange
        "#56b4e9",  // sky blue
    ]

    /// Takes a count rather than the records, so importing several files at
    /// once advances the cursor before any of them has been saved.
    public static func nextLayerColor(existingCount: Int) -> String {
        let index = ((existingCount % layerColors.count) + layerColors.count) % layerColors.count
        return layerColors[index]
    }

    /// The layer default, overridden per feature by the simplestyle-spec
    /// properties (`stroke`, `stroke-width`, `stroke-opacity`, `fill`,
    /// `fill-opacity`, `marker-color`).
    ///
    /// That vocabulary is what a KML conversion emits for authored styles, so
    /// an imported KML keeps the look its author gave it with no extra
    /// plumbing. A malformed value falls back to the layer default rather than
    /// to anything of the renderer's, so a broken property is a colour the
    /// user recognises rather than a layer that vanishes.
    public static func style(
        for feature: GeoJsonFeature, layerColorHex: String
    ) -> UserVectorStyle {
        let properties = feature.properties
        let stroke = color(properties["stroke"]) ?? layerColorHex
        let fill = color(properties["marker-color"]) ?? color(properties["fill"]) ?? layerColorHex
        return UserVectorStyle(
            strokeHex: stroke,
            weight: finite(properties["stroke-width"]) ?? 2,
            strokeOpacity: finite(properties["stroke-opacity"]) ?? 0.9,
            fillHex: fill,
            fillOpacity: finite(properties["fill-opacity"]) ?? 0.25
        )
    }

    private static func color(_ value: JSONValue?) -> String? {
        guard let text = value?.stringValue, !text.isEmpty else { return nil }
        return text
    }

    private static func finite(_ value: JSONValue?) -> Double? {
        value?.doubleValue
    }

    /// A `#rgb`, `#rrggbb` or `#rrggbbaa` colour as components in 0...1.
    ///
    /// Nil for anything else. The value came out of a user's file and may be a
    /// CSS colour name, a `rgb()` call, or a typo; the caller falls back to the
    /// layer colour rather than drawing something invisible.
    public static func components(
        ofHex hex: String
    ) -> (red: Double, green: Double, blue: Double, alpha: Double)? {
        var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.hasPrefix("#") else { return nil }
        text.removeFirst()
        guard text.allSatisfy(\.isHexDigit) else { return nil }
        let digits = Array(text)
        func value(_ characters: [Character]) -> Double? {
            guard let raw = UInt8(String(characters), radix: 16) else { return nil }
            return Double(raw) / 255
        }
        switch digits.count {
        case 3:
            guard let red = value([digits[0], digits[0]]),
                  let green = value([digits[1], digits[1]]),
                  let blue = value([digits[2], digits[2]])
            else { return nil }
            return (red, green, blue, 1)
        case 6, 8:
            guard let red = value(Array(digits[0..<2])),
                  let green = value(Array(digits[2..<4])),
                  let blue = value(Array(digits[4..<6]))
            else { return nil }
            let alpha = digits.count == 8 ? value(Array(digits[6..<8])) : 1
            guard let alpha else { return nil }
            return (red, green, blue, alpha)
        default:
            return nil
        }
    }
}

/// What a tapped feature says about itself.
///
/// Built here rather than in the view because the provenance line is not
/// decoration: a user-loaded feature has to announce that it is one, wherever
/// it is shown, and a view that forgot the line would present the user's own
/// sketch with the same authority as a registry parcel.
public struct VectorFeatureCallout: Hashable, Sendable {
    public var title: String
    public var detail: String?
    public var provenance: String

    public init(title: String, detail: String?, provenance: String) {
        self.title = title
        self.detail = detail
        self.provenance = provenance
    }

    public init(feature: GeoJsonFeature, record: UserVectorLayerRecord) {
        func text(_ key: String) -> String? {
            guard let value = feature.properties[key]?.stringValue,
                  !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else { return nil }
            return value
        }
        // The layer's name when the feature has none: a callout headed by a
        // blank line reads as a feature that failed to load.
        self.title = text("name") ?? record.name
        self.detail = text("description")
        self.provenance = record.origin.provenanceText
    }
}
