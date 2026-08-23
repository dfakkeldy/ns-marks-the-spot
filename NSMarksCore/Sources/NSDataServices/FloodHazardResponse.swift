import Foundation
import GeoCore

/// Reads the flood services' two very different replies.
public enum FloodHazardResponse {
    /// Why a reply could not be read.
    ///
    /// None of these is a finding that a parcel is dry.
    public enum Failure: Error, Equatable, Sendable {
        case malformed
        case serviceError(code: Int?, message: String?)
        /// The export returned bytes that are not an image this device can
        /// decode. Nothing was sampled, so nothing is known.
        case undecodableRaster
    }

    private struct RiverPayload: Decodable {
        struct ServiceError: Decodable {
            let code: Int?
            let message: String?
        }
        struct Feature: Decodable {}

        let features: [Feature]?
        let error: ServiceError?
    }

    /// Whether the study-area sublayer has anything over the parcel.
    ///
    /// ArcGIS answers a rejected query with HTTP 200 and an `error` object, so
    /// the error is checked before the feature list. Reading it the other way
    /// round would turn every refused query into "no flood zone here".
    public static func riverIntersects(from data: Data) throws(Failure) -> Bool {
        let payload: RiverPayload
        do {
            payload = try JSONDecoder().decode(RiverPayload.self, from: data)
        } catch {
            throw .malformed
        }
        if let error = payload.error {
            throw .serviceError(code: error.code, message: error.message)
        }
        guard let features = payload.features else { throw .malformed }
        return !features.isEmpty
    }

    /// What one raster sample found inside a parcel.
    ///
    /// A count of pixels, not a measurement of land. The percentage is
    /// deliberately optional: a sample that landed no pixels inside the outline
    /// measured nothing, and reporting that as 0% would turn a failure to sample
    /// into a finding of no flooding.
    public struct RasterSampleSummary: Sendable, Equatable {
        public let sampledParcelPixels: Int
        public let floodedParcelPixels: Int
        public let approximateAffectedPercent: Double?
        public let approximateAffectedSquareMetres: Double?

        public init(
            sampledParcelPixels: Int,
            floodedParcelPixels: Int,
            approximateAffectedPercent: Double?,
            approximateAffectedSquareMetres: Double?
        ) {
            self.sampledParcelPixels = sampledParcelPixels
            self.floodedParcelPixels = floodedParcelPixels
            self.approximateAffectedPercent = approximateAffectedPercent
            self.approximateAffectedSquareMetres = approximateAffectedSquareMetres
        }

        /// Whether any pixel inside the outline was drawn on.
        ///
        /// True is a screening signal that the scenario reaches the parcel.
        /// False, with pixels sampled, is the province's raster showing nothing
        /// there — which is as close to a negative as this method can get.
        public var intersects: Bool { floodedParcelPixels > 0 }

        /// Whether the sample landed inside the outline at all.
        public var wasSampled: Bool { sampledParcelPixels > 0 }
    }

    /// Counts the drawn pixels that fall inside the parcel.
    ///
    /// The province publishes these scenarios as rendered rasters and no vector
    /// service behind them, so the only way to ask "does this reach the lot" is
    /// to draw it and look. `rgba` is row-major from the top-left corner of
    /// `bounds`, four bytes per pixel; a pixel counts as flooded when its alpha
    /// is non-zero, which is what "transparent=true" makes mean "nothing drawn
    /// here".
    ///
    /// This is the web's `summarizeRasterAlpha`, including sampling at pixel
    /// centres. It differs in one place: containment uses `PolygonHitTest`,
    /// which counts a point exactly on a ring as inside, where the web's ray
    /// cast does not. That decides a pixel whose centre lands precisely on a
    /// boundary — vanishingly rare in floating point, and settled the same way
    /// the rest of this app settles it.
    public static func summarizeRasterAlpha(
        rgba: [UInt8],
        width: Int,
        height: Int,
        bounds: GeoBoundingBox,
        parts: [PolygonHitTest.PolygonPart],
        mappedAreaSquareMetres: Double?
    ) -> RasterSampleSummary {
        var sampled = 0
        var flooded = 0
        // Multiplied only once the operands are known not to overflow: a
        // decoder reporting an absurd size must fail closed, not trap.
        guard width > 0, height > 0, width <= Int.max / 4 / height,
              rgba.count >= width * height * 4
        else {
            return RasterSampleSummary(
                sampledParcelPixels: 0, floodedParcelPixels: 0,
                approximateAffectedPercent: nil, approximateAffectedSquareMetres: nil
            )
        }

        for row in 0..<height {
            let latitude = bounds.north
                - ((Double(row) + 0.5) / Double(height)) * (bounds.north - bounds.south)
            for column in 0..<width {
                let longitude = bounds.west
                    + ((Double(column) + 0.5) / Double(width)) * (bounds.east - bounds.west)
                guard PolygonHitTest.contains(
                    GeoPoint(lat: latitude, lng: longitude), multiPolygon: parts
                ) else { continue }
                sampled += 1
                if rgba[(row * width + column) * 4 + 3] > 0 { flooded += 1 }
            }
        }

        guard sampled > 0 else {
            return RasterSampleSummary(
                sampledParcelPixels: 0, floodedParcelPixels: 0,
                approximateAffectedPercent: nil, approximateAffectedSquareMetres: nil
            )
        }
        let percent = ((Double(flooded) / Double(sampled)) * 10_000).rounded() / 100
        return RasterSampleSummary(
            sampledParcelPixels: sampled,
            floodedParcelPixels: flooded,
            approximateAffectedPercent: percent,
            approximateAffectedSquareMetres: mappedAreaSquareMetres.map {
                ($0 * percent).rounded() / 100
            }
        )
    }
}
