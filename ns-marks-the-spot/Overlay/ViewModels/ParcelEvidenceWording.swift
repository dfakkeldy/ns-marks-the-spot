import Foundation
import NSDataServices

/// The sentences the app says about a parcel's mapped evidence.
///
/// One copy, because the panel and the exported note are two renderings of the
/// same finding. When the wording lived on the view, the note could only quote
/// it by writing it out again — and a caveat that exists twice is a caveat that
/// eventually says two different things, with the weaker version travelling in
/// the document somebody files.
nonisolated enum ParcelEvidenceWording {
    // MARK: - Flood: river

    static func sentence(for finding: RiverAEPIntersection) -> String {
        let kind = finding.relationship == .area ? "flood area" : "zone boundary"
        return "\(finding.annualExceedanceProbabilityPercent)% annual-exceedance \(kind) "
            + "intersects this parcel (\(finding.places.joined(separator: ", ")))."
    }

    /// A real negative from a real survey, and still hedged: the service
    /// publishes mapped zones, not a polygon saying where it looked.
    static let withinPublishedExtentWithNoIntersection =
        "No published river flood geometry intersected this parcel. It falls inside a "
        + "published layer's extent, and the service carries no study-coverage polygon, "
        + "so absence is not inferred."

    static let outsidePublishedExtents =
        "Outside the extents of the four published river-flood study areas. River flood "
        + "probability is not assessed here."

    static func sentence(for failure: FloodHazardFailure) -> String {
        "\(ParcelLookupMessage.floodEvidenceFailure(failure)) No absence is inferred."
    }

    // MARK: - Flood: coastal

    static func sentence(for scenario: CoastalFloodEvidence) -> String {
        let label = label(for: scenario.scenario)
        switch scenario.sample {
        case .failure(let failure):
            return "\(label): \(sentence(for: failure))"
        case .success(let summary) where !summary.wasSampled:
            // The render landed no sample inside the outline, so nothing was
            // measured. Reporting 0% here would turn a failure to sample into a
            // finding that the scenario misses the lot.
            return "\(label): this parcel is too small at the sampled resolution to read "
                + "off the scenario map, so nothing was measured."
        case .success(let summary) where !summary.intersects:
            return "\(label): no scenario pixel fell inside this parcel. That is a screen "
                + "of the mapped scenario, not proof of no coastal hazard."
        case .success(let summary):
            let percent = summary.approximateAffectedPercent.map {
                percentFormatter.string(from: $0 as NSNumber) ?? "\($0)"
            } ?? "an unknown share of"
            let area = summary.approximateAffectedSquareMetres.map {
                " (about \(areaFormatter.string(from: $0.rounded() as NSNumber) ?? "\($0)") m²)"
            } ?? ""
            return "\(label): approximately \(percent)% of the mapped parcel area\(area) "
                + "falls inside the scenario."
        }
    }

    static func label(for scenario: FloodHazardQuery.CoastalScenario) -> String {
        switch scenario {
        case .current: "Current sea level"
        case .year2050: "2050"
        case .year2100: "2100"
        }
    }

    // Built on each use rather than shared: this type is reachable from any
    // isolation, and a stored `NumberFormatter` is not safe to hand around.
    private static var percentFormatter: NumberFormatter {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_CA")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 2
        return formatter
    }

    private static var areaFormatter: NumberFormatter {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_CA")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter
    }

    // MARK: - Geology and resources

    static func sentence(for failure: ResourceIntersectionFailure) -> String {
        "\(ParcelLookupMessage.resourceEvidenceFailure(failure)) No absence is inferred."
    }

    // MARK: - Mapped buildings

    /// The split matters: NSTDB carries points and footprints, and a building
    /// can appear as both, so the total is an upper bound on structures rather
    /// than a structure count.
    static func buildingCaveat(_ count: ParcelBuildingCount) -> String {
        guard count.total > 0 else {
            // The one building state that says something about the parcel, and
            // it stops at what NSTDB holds on its own compilation date.
            return "Nothing is mapped inside this outline in NSTDB 1:10,000. "
                + "That is not a finding that the lot is vacant."
        }
        let points = count.points == 1 ? "1 point" : "\(count.points) points"
        let polygons = count.polygons == 1 ? "1 footprint" : "\(count.polygons) footprints"
        return "\(points) and \(polygons) in NSTDB 1:10,000. A structure can carry both, "
            + "so this counts mapped features rather than buildings standing today."
    }

    // MARK: - Mapped roads and water

    static let adjacentLabel =
        "Adjacent within \(MappedFeatureQuery.adjacentRoadDistanceMetres) m"

    static func label(for evidence: ParcelRoads.Evidence) -> String {
        switch evidence {
        case .intersects: "Intersects parcel"
        case .adjacent: adjacentLabel
        case .namedByCivicAddress: "Named by civic address"
        }
    }

    static let noWaterFeature = "No mapped water feature intersects this parcel."
}
