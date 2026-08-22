import Foundation
import GeoCore
import MapCatalog

/// What a tapped feature of a catalogued layer says about itself.
///
/// A port of the web's per-layer popups (`ZoningLayer.tsx`,
/// `oldGrowthPolicyPresentation.ts`, `wellLogs.ts`, the hydro popup in
/// `MapCanvas.tsx`). The wording is carried across rather than paraphrased:
/// these sentences are the layer's own account of what it is evidence of, and
/// two surfaces telling a user different things about the same polygon is the
/// failure this port is trying not to introduce.
///
/// The caveat is not optional and never empty. Every one of these layers is a
/// screening rendering of somebody else's record, and a card that showed the
/// figures without the sentence qualifying them would be inviting a conclusion
/// the source does not support.
public struct FeatureCallout: Sendable, Hashable {
    public struct Row: Sendable, Hashable, Identifiable {
        public let label: String
        public let value: String
        public var id: String { label }

        public init(label: String, value: String) {
            self.label = label
            self.value = value
        }
    }

    /// The layer the feature belongs to, shown above the title as the web's
    /// eyebrow line does — so a figure is never read without knowing which
    /// source published it.
    public let layerName: String
    public let title: String
    /// The line under the title, where the layer has one to say.
    public let summary: String?
    public let rows: [Row]
    public let caveat: String
    public let linkLabel: String?
    public let linkURL: URL?
    /// Set where the feature is *about* a parcel, so the card can offer to open
    /// it. Carried rather than inferred: this is the publisher's own PID, and
    /// finding a parcel by tapping the same ground would be a different claim.
    public let pid: String?

    public init(
        layerName: String,
        title: String,
        summary: String? = nil,
        rows: [Row] = [],
        caveat: String,
        linkLabel: String? = nil,
        linkURL: URL? = nil,
        pid: String? = nil
    ) {
        self.layerName = layerName
        self.title = title
        self.summary = summary
        self.rows = rows
        self.caveat = caveat
        self.linkLabel = linkLabel
        self.linkURL = linkURL
        self.pid = pid
    }
}

public enum FeatureCallouts {
    /// The web's `ZONING_POPUP_NOTE`.
    static let zoningCaveat =
        "Unofficial rendering of a municipal map service, not the municipality's official copy "
        + "and not for legal purposes. Confirm the zone and its rules with the municipality."

    /// The web's `POLICY_POPUP_NOTE`.
    static let oldGrowthCaveat =
        "Mapped policy area on publicly owned land outside protected areas. This layer is not a "
        + "complete inventory of old-growth forest and does not establish conditions on private land."

    static let wellLogCaveat =
        "Reported by the well driller. Not a survey, and not proof of a usable water supply."

    public static func zoning(
        _ description: ZoningOverlay.Description,
        detail: ZoningLayerDetail,
        layerName: String
    ) -> FeatureCallout {
        FeatureCallout(
            layerName: layerName,
            title: description.label,
            summary: description.planArea.map { "Plan area: \($0)" },
            caveat: zoningCaveat,
            // The by-law is the point of the card: the polygon says where a
            // zone was drawn, and only the by-law says what it permits.
            linkLabel: detail.bylawLabel,
            linkURL: detail.bylawURL
        )
    }

    public static func oldGrowth(
        _ area: OldGrowthPolicyOverlay.Area,
        layerName: String,
        sourceURL: URL?
    ) -> FeatureCallout {
        var rows: [FeatureCallout.Row] = []
        // The source's own figure, labelled as such: this app does not
        // recompute an area from the polygon, and a number presented without
        // that attribution would read as a measurement.
        if let hectares = area.hectares {
            rows.append(
                .init(label: "Source-reported area", value: "\(formatted(hectares, digits: 2)) ha")
            )
        }
        if let method = area.selectionMethod {
            rows.append(.init(label: "Selection method", value: method))
        }
        return FeatureCallout(
            layerName: layerName,
            title: area.status.label,
            rows: rows,
            caveat: oldGrowthCaveat,
            linkLabel: sourceURL == nil ? nil : "Official policy layer",
            linkURL: sourceURL
        )
    }

    public static func mineralProximity(
        pid: String,
        distanceKm: Double,
        layerName: String,
        sourceURL: URL?
    ) -> FeatureCallout {
        FeatureCallout(
            layerName: layerName,
            title: "PID \(pid)",
            summary: "Within \(formatted(distanceKm)) km of a recorded mineral occurrence",
            caveat:
                "A distance between two published records, not a finding about this property. It "
                + "says nothing about what is under the ground, who holds the rights, or whether "
                + "anything may be worked here.",
            linkLabel: sourceURL == nil ? nil : "Official source",
            linkURL: sourceURL,
            pid: pid
        )
    }

    /// A tapped point from one of the two provincial inventories.
    ///
    /// The web shows the name and the commodity or hazard on hover and nothing
    /// else, so this card shows the same two things and adds no field the web
    /// keeps out of its tooltip. What it does add is the eyebrow and the
    /// caveat: a hover line vanishes when the pointer moves, while a card sits
    /// there, and a hazard grade left sitting on screen with no source and no
    /// qualification is the kind of thing a reader starts treating as a survey.
    ///
    /// The caveat is the layer's own, carried from the catalog rather than
    /// written here, so the sentence under the point is the sentence the panel
    /// already showed for the layer.
    public static func resourcePoint(
        _ record: ResourcePointOverlay.Record,
        layer: LayerID,
        layerName: String,
        caveat: String,
        sourceURL: URL?
    ) -> FeatureCallout {
        let parts = ResourcePointOverlay.parts(for: layer, properties: record.properties)
        return FeatureCallout(
            layerName: layerName,
            title: parts.name,
            summary: parts.detail.isEmpty ? nil : parts.detail,
            caveat: caveat,
            linkLabel: sourceURL == nil ? nil : "Official source",
            linkURL: sourceURL
        )
    }

    public static func wellLog(
        _ record: WellLogOverlay.Record, layerName: String, sourceURL: URL?
    ) -> FeatureCallout {
        FeatureCallout(
            layerName: layerName,
            title: "Well \(record.wellNumber ?? "record")",
            summary: record.accuracyStatement,
            rows: [
                .init(label: "Completed", value: record.completedOn ?? notRecorded),
                .init(label: "Depth", value: measurement(record.depthMetres, "m")),
                .init(label: "Casing", value: measurement(record.casingMetres, "m")),
                .init(label: "Depth to bedrock", value: measurement(record.bedrockDepthMetres, "m")),
                .init(label: "Static level", value: measurement(record.staticLevelMetres, "m")),
                .init(label: "Yield", value: measurement(record.yieldLitresPerMinute, "L/min")),
                .init(label: "Coordinate source", value: record.coordinateSource ?? notRecorded),
            ],
            caveat: wellLogCaveat,
            linkLabel: sourceURL == nil ? nil : "Official source",
            linkURL: sourceURL
        )
    }

    public static func hydroReach(
        _ reach: HydroPotentialPilot.Reach,
        metadata: HydroPotentialPilot.Metadata,
        layerName: String
    ) -> FeatureCallout {
        var rows: [FeatureCallout.Row] = [
            .init(
                label: "Modeled upstream area",
                value: "\(formatted(reach.upstreamAreaKm2)) km²"
            ),
            .init(
                label: "Network reach",
                value: reach.networkRole == .tributary ? "Tributary" : "Main trunk"
            ),
        ]
        // A reach with no qualifying drop is said to have none, rather than
        // having its four derived figures left out silently: absent rows would
        // read as a reach whose numbers this build failed to load.
        if let drop = reach.dropThresholdMetres,
           let route = reach.downstreamRouteLengthKm,
           let fall = reach.averageMappedFallMetresPerKm,
           let flow = reach.nominalFlowLitresPerSecond,
           let power = reach.indicativePowerKw {
            rows.append(.init(label: "Selected drop", value: "\(formatted(drop)) m"))
            rows.append(
                .init(label: "Downstream route", value: "\(formatted(route)) km")
            )
            rows.append(
                .init(label: "Average mapped fall", value: "\(formatted(fall)) m/km")
            )
            rows.append(
                .init(label: "Nominal flow scenario", value: "\(formatted(flow)) L/s")
            )
            rows.append(
                .init(label: "Indicative scale", value: "\(formatted(power)) kW")
            )
        } else {
            rows.append(.init(label: "Bounded drop", value: "No 5 m drop within 3 km"))
        }
        rows.append(.init(label: "Opportunity band", value: reach.potentialClass.label))

        return FeatureCallout(
            layerName: layerName,
            title: reach.watershedName,
            rows: rows,
            caveat:
                "Area changes at routed \(reach.catchmentResolution) catchment outlets; it is not "
                + "exact at an arbitrary point. The kW scale uses "
                + "\(formatted(metadata.nominalSpecificDischargeLitresPerSecondPerKm2)) "
                + "L/s/km², mapped gross drop, and "
                + "\(formatted((metadata.nominalSystemEfficiency * 100).rounded(), digits: 0))% nominal "
                + "efficiency. It is not measured flow, net head, seasonal output, predicted "
                + "production, access, rights, or approval."
        )
    }

    static let notRecorded = "Not recorded"

    /// The web's `measurementText`: `toFixed(1)`, and a missing reading says so
    /// rather than leaving a blank, which would read as a zero.
    static func measurement(_ value: Double?, _ unit: String) -> String {
        guard let value else { return notRecorded }
        // Rounded half away from zero before formatting, because `toFixed` in
        // the browser breaks a tie upward and `%f` breaks it to the nearest
        // even digit: a yield of 18.25 L/min would otherwise read 18.3 on the
        // web and 18.2 here, off the same published record.
        let rounded = (value * 10).rounded(.toNearestOrAwayFromZero) / 10
        return String(format: "%.1f %@", rounded, unit)
    }

    /// `toLocaleString("en-CA")`: grouped thousands, at most three decimals,
    /// and no trailing zeros on a whole number. Fixed to that locale rather
    /// than the device's, because these are the figures the published dataset
    /// carries and the web renders them the same way everywhere.
    static func formatted(_ value: Double, digits: Int = 3) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_CA")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = digits
        formatter.minimumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
