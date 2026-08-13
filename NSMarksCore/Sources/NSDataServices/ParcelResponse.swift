import Foundation
import GeoCore

/// One parcel record, as NSPRD returned it.
///
/// A PID can appear on more than one feature: a parcel split by a road or a
/// watercourse comes back as several shapes carrying the same identifier, which
/// is why the mapped area is summed across features rather than read off one.
public struct ParcelFeature: Sendable, Equatable {
    /// Exactly the string the service returned, unnormalized.
    ///
    /// Not run through `ParcelQuery.normalizePID` on the way in. That function
    /// exists to decide whether a *user's* typing is a PID; applying it to a
    /// reply would quietly repair a service anomaly instead of surfacing it,
    /// and a PID that came back in an unexpected shape is a fact about the
    /// source that the caller should be able to see.
    public let pid: String

    /// `UPDAT_DATE` as the number the service sent.
    ///
    /// Kept raw because its meaning is a convention rather than a guarantee —
    /// see `updatedAt`. Nothing on either surface renders this yet; it is
    /// carried so the inspector can attach a record date to the record it came
    /// from rather than to the moment it was fetched.
    public let updatedAtEpochMilliseconds: Double?

    /// `SHAPE.AREA` in square metres, or `nil`.
    ///
    /// The service's own computed area for this shape, not one derived here —
    /// the map must not offer a second, differently-derived number beside an
    /// official one. Zero, negative and non-finite values become `nil` rather
    /// than being carried as an area, matching the web's `mappedAreaForPid`:
    /// they are the absence of a measurement, and rendering "0.00 acres" would
    /// read as one.
    public let mappedAreaSquareMetres: Double?

    /// The shape, in GeoJSON winding, outer ring first within each part.
    ///
    /// Not reversed. The web reverses rings before sending them back to ArcGIS
    /// as an `esriGeometryPolygon`, which wants the opposite winding — that is
    /// a fact about building a query, and belongs wherever that query is built
    /// rather than in what the source said.
    public let parts: [PolygonHitTest.PolygonPart]

    public init(
        pid: String,
        updatedAtEpochMilliseconds: Double? = nil,
        mappedAreaSquareMetres: Double? = nil,
        parts: [PolygonHitTest.PolygonPart] = []
    ) {
        self.pid = pid
        self.updatedAtEpochMilliseconds = updatedAtEpochMilliseconds
        self.mappedAreaSquareMetres = mappedAreaSquareMetres
        self.parts = parts
    }

    /// `updatedAtEpochMilliseconds` read as ArcGIS dates are conventionally
    /// encoded: milliseconds since the Unix epoch, UTC.
    ///
    /// A convention, not a promise the service makes in the response, which is
    /// why the raw number is kept beside this. Anything presenting a date from
    /// here owes the user the source's own wording for what the date means —
    /// `UPDAT_DATE` is when the parcel record was last updated, which is not
    /// when the boundary was surveyed and not when ownership changed.
    public var updatedAt: Date? {
        guard let milliseconds = updatedAtEpochMilliseconds, milliseconds.isFinite else {
            return nil
        }
        return Date(timeIntervalSince1970: milliseconds / 1000)
    }
}

/// What one NSPRD `/query` answered with.
public struct ParcelFeatureCollection: Sendable, Equatable {
    public let features: [ParcelFeature]

    /// Shapes the service returned that carried no usable PID.
    ///
    /// Counted rather than dropped in silence. A response holding three
    /// unidentifiable shapes is not the same evidence as a response holding
    /// nothing, and collapsing the two would let "the service returned
    /// something we could not read" be presented as "there is no parcel here".
    public let unidentifiedFeatureCount: Int

    public init(features: [ParcelFeature], unidentifiedFeatureCount: Int = 0) {
        self.features = features
        self.unidentifiedFeatureCount = unidentifiedFeatureCount
    }

    /// Whether the service answered with nothing at all.
    ///
    /// A true `returned-empty`: the query succeeded and there was no parcel to
    /// return. Distinct from every `Failure`, which mean the question was not
    /// answered — and neither is evidence that no parcel exists.
    public var isEmpty: Bool {
        features.isEmpty && unidentifiedFeatureCount == 0
    }
}

/// Reads NSPRD's `/query` replies.
///
/// The parsing rules are the web's `fetchParcelCollection`, including the one
/// that is easy to miss: ArcGIS answers a rejected query with HTTP 200 and an
/// `error` object in the body. A reader that only checked the status code would
/// take that for an empty result and tell the user there is no parcel where it
/// had in fact never asked.
public enum ParcelResponse {
    /// Why a reply could not be read as parcels.
    ///
    /// Every case means the question went unanswered. None of them is evidence
    /// that a parcel does not exist — that is `ParcelFeatureCollection.isEmpty`,
    /// and it is deliberately not reachable through this type.
    public enum Failure: Error, Equatable, Sendable {
        /// HTTP 200 with an ArcGIS `error` object: the service refused or could
        /// not run the query.
        case serviceError(code: Int?, message: String?)
        /// Parsed as JSON, but not as a GeoJSON `FeatureCollection`.
        case notAFeatureCollection
        case malformedJSON
    }

    public static func decode(_ data: Data) throws(Failure) -> ParcelFeatureCollection {
        let payload: Payload
        do {
            payload = try JSONDecoder().decode(Payload.self, from: data)
        } catch {
            throw .malformedJSON
        }

        // Before the shape check, because an error payload has no `features`
        // and would otherwise be reported as a malformed reply — losing the
        // service's own account of what went wrong.
        if let error = payload.error {
            throw .serviceError(code: error.code, message: error.message)
        }

        guard payload.type == "FeatureCollection", let features = payload.features else {
            throw .notAFeatureCollection
        }

        var parcels: [ParcelFeature] = []
        var unidentified = 0
        parcels.reserveCapacity(features.count)
        for feature in features {
            guard let pid = feature.properties?.pid, !pid.isEmpty else {
                unidentified += 1
                continue
            }
            parcels.append(
                ParcelFeature(
                    pid: pid,
                    updatedAtEpochMilliseconds: feature.properties?.updatedAt,
                    mappedAreaSquareMetres: Self.usableArea(feature.properties?.area),
                    parts: feature.geometry?.parts ?? []
                )
            )
        }
        return ParcelFeatureCollection(
            features: parcels, unidentifiedFeatureCount: unidentified
        )
    }

    /// The service's mapped area for one PID, summed across its shapes.
    ///
    /// Matched by exact string equality, as the web does. A parcel is not
    /// "close enough" to another parcel, and a looser match here would attach
    /// one property's area to another's record.
    public static func mappedAreaSquareMetres(
        forPID pid: String,
        in collection: ParcelFeatureCollection
    ) -> Double? {
        let total = collection.features
            .filter { $0.pid == pid }
            .reduce(0.0) { $0 + ($1.mappedAreaSquareMetres ?? 0) }
        return total > 0 ? total : nil
    }

    /// Square metres as acres, rounded to two decimals the way the web rounds.
    public static func acres(fromSquareMetres squareMetres: Double) -> Double {
        (squareMetres / Geodesy.squareMetresPerAcre * 100).rounded() / 100
    }

    /// `SHAPE.AREA` if it is a measurement, `nil` if it is the absence of one.
    private static func usableArea(_ value: Double?) -> Double? {
        guard let value, value.isFinite, value > 0 else { return nil }
        return value
    }

    // MARK: - Wire shapes

    private struct Payload: Decodable {
        let type: String?
        let features: [Feature]?
        let error: ServiceError?
    }

    private struct ServiceError: Decodable {
        let code: Int?
        let message: String?
    }

    private struct Feature: Decodable {
        let properties: Properties?
        let geometry: Geometry?
    }

    private struct Properties: Decodable {
        let pid: String?
        let updatedAt: Double?
        let area: Double?

        private enum CodingKeys: String, CodingKey {
            case pid = "PID"
            case updatedAt = "UPDAT_DATE"
            case area = "SHAPE.AREA"
        }

        /// Field by field, so one unexpected type costs that field rather than
        /// the whole reply. A response with a readable PID and an unreadable
        /// area is still a parcel we can show; discarding it would turn a
        /// cosmetic anomaly into "no parcel here".
        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            // String only, never coerced from a number: PIDs are eight digits
            // and can lead with a zero, so reading `01234567` as an integer and
            // writing it back would produce a different, real parcel's id.
            pid = try? container.decodeIfPresent(String.self, forKey: .pid)
            updatedAt = try? container.decodeIfPresent(Double.self, forKey: .updatedAt)
            area = try? container.decodeIfPresent(Double.self, forKey: .area)
        }
    }

    private struct Geometry: Decodable {
        let parts: [PolygonHitTest.PolygonPart]

        private enum CodingKeys: String, CodingKey {
            case type
            case coordinates
        }

        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            switch try? container.decodeIfPresent(String.self, forKey: .type) {
            case "Polygon":
                let rings = (try? container.decode([[[Double]]].self, forKey: .coordinates)) ?? []
                parts = [Self.part(from: rings)].filter { !$0.isEmpty }
            case "MultiPolygon":
                let polygons =
                    (try? container.decode([[[[Double]]]].self, forKey: .coordinates)) ?? []
                parts = polygons.map(Self.part(from:)).filter { !$0.isEmpty }
            default:
                // A parcel layer answering with a point or a line is an anomaly,
                // and so is `"geometry": null`. The feature is kept either way:
                // the PID is the evidence, and a record that cannot be drawn is
                // still a record that was returned.
                parts = []
            }
        }

        private static func part(from rings: [[[Double]]]) -> PolygonHitTest.PolygonPart {
            rings.compactMap(Self.ring(from:))
        }

        /// A ring, or `nil` if any of its positions is not a coordinate.
        ///
        /// All or nothing per ring: skipping the bad positions and keeping the
        /// rest would hand back a closed shape with a different outline from the
        /// one the service sent, which is a boundary nobody drew.
        private static func ring(from positions: [[Double]]) -> [GeoPoint]? {
            var points: [GeoPoint] = []
            points.reserveCapacity(positions.count)
            for position in positions {
                // GeoJSON positions are [longitude, latitude], optionally
                // followed by an altitude this layer has no use for.
                guard position.count >= 2 else { return nil }
                let longitude = position[0]
                let latitude = position[1]
                guard longitude.isFinite, longitude >= -180, longitude <= 180,
                      latitude.isFinite, latitude >= -90, latitude <= 90 else {
                    return nil
                }
                points.append(GeoPoint(lat: latitude, lng: longitude))
            }
            return points
        }
    }
}
