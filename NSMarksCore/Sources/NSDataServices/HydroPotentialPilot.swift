import Foundation
import GeoCore

/// The Inverness micro-hydro screening pilot.
///
/// Ported from `web/src/services/hydroPotential.ts` and
/// `web/src/data/invernessHydroPotential.ts`. Unlike every other layer in this
/// phase, nothing is fetched: the collection is a derived dataset produced once
/// from official watershed, catchment, and NSHN sources, and it ships inside
/// the app exactly as the web ships it inside the bundle.
///
/// What a reach on this layer says is narrow, and the popup text says so: a
/// modelled upstream area at routed catchment outlets, a mapped gross drop, and
/// a nominal flow assumption. It is not measured flow, net head, seasonal
/// output, predicted production, access, water rights, or approval.
public enum HydroPotentialPilot {
    /// The screening band a reach falls in.
    ///
    /// The raw values are the web's, because they are also the values written
    /// into the bundled file this module decodes.
    public enum PotentialClass: String, Sendable, Hashable, CaseIterable, Decodable {
        case notQualified = "not-qualified"
        case below1kW = "below-1kw"
        case kW1to5 = "kw-1-5"
        case kW5to15 = "kw-5-15"
        case kW15to30 = "kw-15-30"
        case kW30to50 = "kw-30-50"
        case over50kW = "over-50kw"

        public var label: String {
            switch self {
            case .notQualified: "No qualifying drop"
            case .below1kW: "Below 1 kW scale"
            case .kW1to5: "1–5 kW scale"
            case .kW5to15: "5–15 kW scale"
            case .kW15to30: "15–30 kW scale"
            case .kW30to50: "30–50 kW scale"
            case .over50kW: "Above 50 kW scale"
            }
        }

        /// The web's colour for this band.
        public var colorHex: String {
            switch self {
            case .notQualified: "#94a3b8"
            case .below1kW: "#cbd5e1"
            case .kW1to5: "#0d9488"
            case .kW5to15: "#16a34a"
            case .kW15to30: "#d97706"
            case .kW30to50: "#dc2626"
            case .over50kW: "#64748b"
            }
        }
    }

    /// What a reach is drawn with on screen.
    public struct LineStyle: Sendable, Hashable {
        public let colorHex: String
        public let opacity: Double
        public let width: Double
    }

    /// What a reach is drawn with on a printed page.
    ///
    /// Print is greyscale-safe: the band is carried by the dash pattern and the
    /// line width, never by colour alone, so a monochrome print still
    /// distinguishes the bands.
    public struct PrintLineStyle: Sendable, Hashable {
        public let colorHex = "#222222"
        public let opacity = 0.9
        public let width: Double
        /// `nil` is a solid line.
        public let dashPattern: [Double]?
    }

    /// The web's `hydroLineStyle`.
    ///
    /// Width grows with the log of the modelled upstream area and is clamped at
    /// both ends, so a trunk reach reads as heavier than a headwater one
    /// without a province-wide range of widths.
    public static func lineStyle(
        upstreamAreaKm2: Double,
        potentialClass: PotentialClass
    ) -> LineStyle {
        let area = max(0, upstreamAreaKm2.isFinite ? upstreamAreaKm2 : 0)
        let width = min(6.5, max(1.75, 1.1 + log2(area + 1) * 0.55))
        return LineStyle(
            colorHex: potentialClass.colorHex,
            opacity: potentialClass == .over50kW ? 0.72 : 0.92,
            width: width
        )
    }

    /// The web's `printHydroLineStyle`.
    public static func printLineStyle(for potentialClass: PotentialClass) -> PrintLineStyle {
        switch potentialClass {
        case .notQualified: PrintLineStyle(width: 1.5, dashPattern: [1, 4])
        case .below1kW: PrintLineStyle(width: 1.75, dashPattern: [3, 4])
        case .kW1to5: PrintLineStyle(width: 2, dashPattern: [6, 3])
        case .kW5to15: PrintLineStyle(width: 2.25, dashPattern: [10, 3])
        case .kW15to30: PrintLineStyle(width: 2.5, dashPattern: [10, 2, 2, 2])
        case .kW30to50: PrintLineStyle(width: 2.75, dashPattern: [14, 2])
        case .over50kW: PrintLineStyle(width: 3.25, dashPattern: nil)
        }
    }

    /// One screened reach.
    ///
    /// The optional measurements are optional in the source and stay optional
    /// here: a reach with no 5 m drop within 3 km carries no drop, route
    /// length, fall, flow, or kW figure at all, and inventing a zero for any of
    /// them would read as a measured result.
    public struct Reach: Sendable, Hashable {
        public let geometry: GeoJSONGeometry
        public let watershedCode: String
        public let watershedName: String
        public let catchmentResolution: String
        public let networkRole: NetworkRole
        public let upstreamAreaKm2: Double
        public let dropThresholdMetres: Double?
        public let downstreamRouteLengthKm: Double?
        public let averageMappedFallMetresPerKm: Double?
        public let nominalFlowLitresPerSecond: Double?
        public let indicativePowerKw: Double?
        public let screeningValue: Double?
        public let downstreamEndpoint: GeoPoint?
        public let sourceSegmentID: String
        public let potentialClass: PotentialClass

        public enum NetworkRole: String, Sendable, Hashable, Decodable {
            case trunk
            case tributary

            public var label: String {
                switch self {
                case .trunk: "Main trunk"
                case .tributary: "Tributary"
                }
            }
        }
    }

    /// The assumptions the pilot was produced under.
    ///
    /// Kept because the popup quotes them: the numbers on screen are only
    /// meaningful beside the discharge and efficiency they were computed with.
    public struct Metadata: Sendable, Hashable, Decodable {
        public let title: String
        public let retrievedOn: String
        public let watershedCount: Int
        public let reachCount: Int
        public let qualifyingReachCount: Int
        public let maxDownstreamDistanceKm: Double
        public let nominalSpecificDischargeLitresPerSecondPerKm2: Double
        public let nominalSystemEfficiency: Double
        public let method: String
        public let limitations: String
    }

    public struct Collection: Sendable, Hashable {
        public let metadata: Metadata
        public let reaches: [Reach]
    }

    public enum LoadFailure: Error, Equatable, Sendable {
        /// The bundled file is missing from the built product.
        case resourceMissing
        /// The bundled file is not the collection this reader expects.
        case unreadable
    }

    /// The bundled collection.
    ///
    /// Decoding is strict, unlike the network readers in this module. A
    /// service can answer with a code this app has never seen and that is a
    /// live-data condition; the bundled file is shipped alongside this code, so
    /// a field it cannot read is a packaging mistake and must fail loudly
    /// rather than draw a partial map.
    public static func bundledCollection() throws(LoadFailure) -> Collection {
        guard let data = try? SharedData.bytes(of: .invernessHydroPotential) else {
            throw .resourceMissing
        }
        return try collection(from: data)
    }

    static func collection(from data: Data) throws(LoadFailure) -> Collection {
        let payload: Payload
        do {
            payload = try JSONDecoder().decode(Payload.self, from: data)
        } catch {
            throw .unreadable
        }

        var reaches: [Reach] = []
        reaches.reserveCapacity(payload.features.count)
        for feature in payload.features {
            let properties = feature.properties
            // Only linear geometry: a reach is a stretch of channel, and the
            // width rule and the popup both describe a line.
            switch feature.geometry {
            case .lineString, .multiLineString: break
            default: throw .unreadable
            }
            reaches.append(
                Reach(
                    geometry: feature.geometry,
                    watershedCode: properties.watershedCode,
                    watershedName: properties.watershedName,
                    catchmentResolution: properties.catchmentResolution,
                    networkRole: properties.networkRole,
                    upstreamAreaKm2: properties.upstreamAreaKm2,
                    dropThresholdMetres: properties.dropThresholdMetres,
                    downstreamRouteLengthKm: properties.downstreamRouteLengthKm,
                    averageMappedFallMetresPerKm: properties.averageMappedFallMetresPerKm,
                    nominalFlowLitresPerSecond: properties.nominalFlowLitresPerSecond,
                    indicativePowerKw: properties.indicativePowerKw,
                    screeningValue: properties.screeningValue,
                    // GeoJSON order, as everywhere else: longitude first.
                    downstreamEndpoint: try endpoint(properties.downstreamEndpoint),
                    sourceSegmentID: properties.sourceSegmentId,
                    potentialClass: properties.potentialClass
                )
            )
        }
        return Collection(metadata: payload.metadata, reaches: reaches)
    }

    private static func endpoint(_ position: [Double]?) throws(LoadFailure) -> GeoPoint? {
        guard let position else { return nil }
        guard position.count >= 2, position[0].isFinite, position[1].isFinite else {
            throw .unreadable
        }
        return GeoPoint(lat: position[1], lng: position[0])
    }

    private struct Payload: Decodable {
        struct Feature: Decodable {
            let geometry: GeoJSONGeometry
            let properties: Properties
        }

        struct Properties: Decodable {
            let watershedCode: String
            let watershedName: String
            let catchmentResolution: String
            let networkRole: Reach.NetworkRole
            let upstreamAreaKm2: Double
            let dropThresholdMetres: Double?
            let downstreamRouteLengthKm: Double?
            let averageMappedFallMetresPerKm: Double?
            let nominalFlowLitresPerSecond: Double?
            let indicativePowerKw: Double?
            let screeningValue: Double?
            let downstreamEndpoint: [Double]?
            let sourceSegmentId: String
            let potentialClass: PotentialClass
        }

        let metadata: Metadata
        let features: [Feature]
    }
}
