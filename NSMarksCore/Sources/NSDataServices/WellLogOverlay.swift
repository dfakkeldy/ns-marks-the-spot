import Foundation
import GeoCore
import MapCatalog

/// Nova Scotia well logs, drawn per viewport.
///
/// Ported from `web/src/services/wellLogs.ts`. Every record here is what a
/// driller reported, not a survey and not proof of a usable water supply, and
/// most of them are not where the marker sits — the Province publishes its own
/// estimate of how far off each point may be, and this module keeps that
/// estimate attached to the record everywhere it goes.
public enum WellLogOverlay {
    /// The fields asked for.
    ///
    /// The published table also carries an `ADDRESS` column that can hold a
    /// well owner's civic address. Its absence here is the point: the field is
    /// excluded at the query, so the device never receives it, rather than
    /// being fetched and then dropped.
    public static let outFields = [
        "OBJECTID", "WELLNUM", "DATE", "DEPTH", "CASING", "BEDROCK", "STATIC",
        "YIELD_LPM", "GEOREF_A", "GEOREF_S",
    ]

    /// How well the Province knows where a well is.
    ///
    /// From Appendix A of the NS Well Logs Database Users Manual (2022).
    /// `GEOREF_A` is the Province's own estimate, in metres, of how far the
    /// plotted point may sit from the real well. Only the surveyed band is
    /// tight enough to read as a located well.
    public enum Accuracy: String, Sendable, Hashable, CaseIterable {
        case surveyed
        case mapReferenced = "map-referenced"
        case sheetReferenced = "sheet-referenced"
        case community
        case unknown
    }

    public struct AccuracyBand: Sendable, Hashable {
        public let accuracy: Accuracy
        public let label: String
        /// Upper bound in metres, or `nil` where the band is open-ended.
        public let maxMetres: Double?
        /// Where the coordinate came from, per Appendix A.
        public let provenance: String
    }

    /// Ordered coarsest-last. The boundaries are the manual's documented
    /// figures: GPS ±50 m, NS Map Book/Atlas ±800 m, NTS sheet ±1,500 m,
    /// community centroid ±8,000 m. Property and building centroids are
    /// case-by-case and land in whichever band their own estimate falls in.
    public static let accuracyBands: [AccuracyBand] = [
        AccuracyBand(
            accuracy: .surveyed,
            label: "Surveyed · ±50 m",
            maxMetres: 50,
            provenance: "Driller GPS or surveyed coordinate, mostly wells built after 2004"
        ),
        AccuracyBand(
            accuracy: .mapReferenced,
            label: "Map-referenced · ±800 m",
            maxMetres: 800,
            provenance: "NS Map Book or Atlas reference"
        ),
        AccuracyBand(
            accuracy: .sheetReferenced,
            label: "Sheet-referenced · ±1.5 km",
            maxMetres: 1_500,
            provenance: "NTS map sheet reference"
        ),
        AccuracyBand(
            accuracy: .community,
            label: "Community centroid · up to ±8 km",
            maxMetres: nil,
            provenance: "Community or gazetteer centroid"
        ),
        AccuracyBand(
            accuracy: .unknown,
            label: "No accuracy estimate",
            maxMetres: nil,
            provenance: "The source record carries no usable accuracy estimate"
        ),
    ]

    /// The band a metre estimate falls in.
    ///
    /// A zero or negative estimate means the Province recorded no usable
    /// figure. It is read as unknown rather than as a perfectly located well.
    public static func classify(metres: Double?) -> Accuracy {
        guard let metres, metres.isFinite, metres > 0 else { return .unknown }
        if metres <= 50 { return .surveyed }
        if metres <= 800 { return .mapReferenced }
        if metres <= 1_500 { return .sheetReferenced }
        return .community
    }

    /// Labels come from the band table so a legend cannot drift from the bands.
    public static func label(for accuracy: Accuracy) -> String {
        accuracyBands.first { $0.accuracy == accuracy }?.label ?? ""
    }

    /// The sentence shown beside the record.
    ///
    /// Coarse records are described as a report near a place, never as a
    /// located well. That distinction is the whole reason the accuracy travels
    /// with the record: a community-centroid marker sitting on someone's lawn
    /// says nothing whatever about that lawn.
    public static func statement(for accuracy: Accuracy, metres: Double?) -> String {
        if accuracy == .unknown {
            return "This record carries no location-accuracy estimate. "
                + "Treat the marker as a rough indication only."
        }

        let distance: String?
        if let metres, metres.isFinite, metres > 0 {
            distance = accuracyDistance(metres.rounded())
        } else {
            distance = nil
        }

        if accuracy == .surveyed {
            guard let distance else { return "Surveyed coordinate." }
            return "Surveyed coordinate, reported accurate to about ±\(distance)."
        }

        guard let distance else {
            return "A well was reported near here. The marker is not the well location."
        }
        return "A well was reported within about \(distance) of here. "
            + "The marker is not the well location."
    }

    static func accuracyDistance(_ metres: Double) -> String {
        guard metres >= 1_000 else {
            return "\(Int(metres)) m"
        }
        let kilometres = metres / 1_000
        let places = metres.truncatingRemainder(dividingBy: 1_000) == 0 ? 0 : 1
        return "\(String(format: "%.\(places)f", kilometres)) km"
    }

    /// Which records the service is asked for.
    public enum AccuracyFilter: String, Sendable, Hashable {
        case surveyed
        case all
    }

    /// Pushes the accuracy filter into the query, so hidden coarse records are
    /// never transferred at all. `GEOREF_A` is populated for every published
    /// record, so the surveyed clause needs no null branch.
    public static func whereClause(for filter: AccuracyFilter) -> String {
        filter == .surveyed ? "GEOREF_A > 0 AND GEOREF_A <= 50" : "1=1"
    }

    /// One well record, read.
    public struct Record: Sendable, Hashable {
        public let location: GeoPoint
        public let wellNumber: String?
        /// ISO-8601 date, in UTC, as the service's epoch stamp reads.
        public let completedOn: String?
        public let depthMetres: Double?
        public let casingMetres: Double?
        public let bedrockDepthMetres: Double?
        public let staticLevelMetres: Double?
        public let yieldLitresPerMinute: Double?
        public let accuracyMetres: Double?
        public let accuracy: Accuracy
        public let coordinateSource: String?

        public var accuracyStatement: String {
            WellLogOverlay.statement(for: accuracy, metres: accuracyMetres)
        }
    }

    /// The published table's no-data marker, used across every measurement
    /// column. It has to be dropped rather than rendered as a depth. Small
    /// negative static levels are left alone: those are real readings for
    /// flowing wells where water stands above ground.
    static let noDataSentinel: Double = -9_999

    private static func number(_ value: MappedFeatureResponse.AttributeValue?) -> Double? {
        guard case .number(let value) = value, value.isFinite else { return nil }
        return value
    }

    private static func measurement(_ value: MappedFeatureResponse.AttributeValue?) -> Double? {
        guard let numeric = number(value), numeric > noDataSentinel else { return nil }
        return numeric
    }

    private static func text(_ value: MappedFeatureResponse.AttributeValue?) -> String? {
        guard case .string(let raw) = value else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// The service returns completion dates as epoch milliseconds, and the web
    /// reads them in UTC. Read in local time they would slide a day either way
    /// depending on where the reader is standing.
    static func completionDate(_ value: MappedFeatureResponse.AttributeValue?) -> String? {
        guard let milliseconds = number(value) else { return nil }
        let seconds = milliseconds / 1_000
        guard seconds.isFinite, abs(seconds) < 1e12 else { return nil }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = calendar.dateComponents(
            [.year, .month, .day], from: Date(timeIntervalSince1970: seconds)
        )
        guard let year = parts.year, let month = parts.month, let day = parts.day else {
            return nil
        }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    public static func record(
        at location: GeoPoint,
        properties: [String: MappedFeatureResponse.AttributeValue]
    ) -> Record {
        let accuracyMetres = number(properties["GEOREF_A"])

        return Record(
            location: location,
            wellNumber: text(properties["WELLNUM"]),
            completedOn: completionDate(properties["DATE"]),
            depthMetres: measurement(properties["DEPTH"]),
            casingMetres: measurement(properties["CASING"]),
            bedrockDepthMetres: measurement(properties["BEDROCK"]),
            staticLevelMetres: measurement(properties["STATIC"]),
            yieldLitresPerMinute: measurement(properties["YIELD_LPM"]),
            accuracyMetres: accuracyMetres,
            accuracy: classify(metres: accuracyMetres),
            coordinateSource: text(properties["GEOREF_S"])
        )
    }
}

/// Fetches the well logs in a viewport.
public nonisolated final class WellLogFetcher: Sendable {
    private let overlay: FeatureOverlayFetcher

    public init(transport: HTTPTransport = .urlSession()) {
        overlay = FeatureOverlayFetcher(transport: transport)
    }

    /// The wells reported inside `bounds`.
    ///
    /// Only point geometry is kept. A well log is a coordinate the driller
    /// reported, and anything else in the response is not a record this layer
    /// knows how to place.
    public func wells(
        in bounds: GeoBoundingBox,
        filter: WellLogOverlay.AccuracyFilter,
        clearance: ProvinceLicenceClearance
    ) async throws(FeatureOverlayFailure) -> (
        records: [WellLogOverlay.Record], unreadable: Int
    ) {
        let plan: FeatureOverlayQuery.Plan
        do {
            plan = try FeatureOverlayQuery.plan(
                for: .nsWellLogs,
                bounds: bounds,
                outFields: WellLogOverlay.outFields,
                whereClause: WellLogOverlay.whereClause(for: filter),
                orderByFields: "OBJECTID",
                idField: "OBJECTID",
                clearance: clearance
            )
        } catch {
            throw .refused(error)
        }

        let found = try await overlay.features(for: plan)
        let records = found.features.compactMap { feature -> WellLogOverlay.Record? in
            guard case .point(let location) = feature.geometry else { return nil }
            return WellLogOverlay.record(at: location, properties: feature.properties)
        }
        // Counted rather than discarded: a well log is a coordinate somebody
        // reported, and a row this app could not place is a gap in the answer
        // rather than an absence of wells.
        return (
            records,
            found.unreadableFeatures + (found.features.count - records.count)
        )
    }
}
