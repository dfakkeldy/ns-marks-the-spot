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

    /// What the service said this parcel's outline is.
    ///
    /// Three outcomes rather than a possibly-empty array of rings, because "no
    /// boundary came with this record" and "a boundary came and could not be
    /// read" are different evidence, and an empty array would say the first
    /// while meaning either.
    public enum Boundary: Sendable, Hashable {
        /// The shape, in GeoJSON winding, outer ring first within each part.
        ///
        /// Not reversed. The web reverses rings before sending them back to
        /// ArcGIS as an `esriGeometryPolygon`, which wants the opposite winding
        /// — that is a fact about building a query, and belongs wherever that
        /// query is built rather than in what the source said.
        case shape([PolygonHitTest.PolygonPart])

        /// `"geometry": null`, or no geometry key. The record exists; the
        /// service did not draw it.
        case notSupplied

        /// Geometry arrived and this reader could not turn it into a boundary.
        ///
        /// Never partially recovered. Half of a parcel outline is not a smaller
        /// parcel — it is an outline nobody drew, and hit-testing or rendering
        /// it would put an invented boundary on the map. Anything shown from a
        /// feature in this state has to say the shape is unavailable rather than
        /// leave the parcel looking unmapped.
        case unreadable

        /// The parts to draw and hit-test, and nothing for a boundary that was
        /// never supplied or could not be read.
        public var parts: [PolygonHitTest.PolygonPart] {
            switch self {
            case .shape(let parts): parts
            case .notSupplied, .unreadable: []
            }
        }
    }

    public let boundary: Boundary

    public init(
        pid: String,
        updatedAtEpochMilliseconds: Double? = nil,
        mappedAreaSquareMetres: Double? = nil,
        boundary: Boundary = .notSupplied
    ) {
        self.pid = pid
        self.updatedAtEpochMilliseconds = updatedAtEpochMilliseconds
        self.mappedAreaSquareMetres = mappedAreaSquareMetres
        self.boundary = boundary
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
    /// The features that came back carrying a PID.
    ///
    /// Named for what it holds rather than for the whole reply, because the
    /// obvious question — is this empty? — has the wrong answer when shapes
    /// arrived without identifiers. `identifiedFeatures.isEmpty` says only that
    /// nothing could be identified; `isEmpty` is the one that means the service
    /// returned nothing.
    public let identifiedFeatures: [ParcelFeature]

    /// Shapes the service returned that carried no usable PID.
    ///
    /// Counted rather than dropped in silence. A response holding three
    /// unidentifiable shapes is not the same evidence as a response holding
    /// nothing, and collapsing the two would let "the service returned
    /// something we could not read" be presented as "there is no parcel here".
    public let unidentifiedFeatureCount: Int

    public init(identifiedFeatures: [ParcelFeature], unidentifiedFeatureCount: Int = 0) {
        self.identifiedFeatures = identifiedFeatures
        self.unidentifiedFeatureCount = unidentifiedFeatureCount
    }

    /// Whether the service answered with nothing at all.
    ///
    /// A true `returned-empty`: the query succeeded and there was no parcel to
    /// return. Distinct from every `Failure`, which mean the question was not
    /// answered — and neither is evidence that no parcel exists.
    public var isEmpty: Bool {
        identifiedFeatures.isEmpty && unidentifiedFeatureCount == 0
    }
}

/// A parcel's mapped area, in the units the inspector shows.
///
/// Carries the raw square metres as well as the rounded acres, so anything that
/// needs to compute uses the measurement rather than the display value.
public struct MappedArea: Sendable, Equatable {
    public let squareMetres: Double
    public let acres: Double
    public let label: String

    public init(squareMetres: Double, acres: Double, label: String) {
        self.squareMetres = squareMetres
        self.acres = acres
        self.label = label
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
                    boundary: feature.geometry?.boundary ?? .notSupplied
                )
            )
        }
        return ParcelFeatureCollection(
            identifiedFeatures: parcels, unidentifiedFeatureCount: unidentified
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
        let total = collection.identifiedFeatures
            .filter { $0.pid == pid }
            .reduce(0.0) { $0 + ($1.mappedAreaSquareMetres ?? 0) }
        // The finite check is repeated after the sum, not just per feature:
        // areas large enough to overflow when added would arrive here as an
        // infinite total that passed every individual check, and an infinite
        // total rendered as acres is a number nobody measured.
        guard total.isFinite, total > 0 else { return nil }
        return total
    }

    /// Square metres as acres, rounded to two decimals the way the web rounds.
    public static func acres(fromSquareMetres squareMetres: Double) -> Double {
        (squareMetres / Geodesy.squareMetresPerAcre * 100).rounded() / 100
    }

    /// The service's mapped area for one PID, ready to show.
    ///
    /// "Mapped area" throughout, never "area" or "size": this is the area of
    /// the NSPRD polygon, which is a mapping product. It is not a survey, not
    /// the deeded area, and not what an assessment roll or a plan of survey
    /// would say. `nil` means the service supplied no usable area for the
    /// parcel — not that the parcel has none.
    public static func mappedArea(
        forPID pid: String,
        in collection: ParcelFeatureCollection
    ) -> MappedArea? {
        guard let squareMetres = mappedAreaSquareMetres(forPID: pid, in: collection) else {
            return nil
        }
        let acres = acres(fromSquareMetres: squareMetres)
        return MappedArea(
            squareMetres: squareMetres,
            acres: acres,
            label: "\(acreFormatter.string(from: acres as NSNumber) ?? "\(acres)") acres"
        )
    }

    /// The web's `Intl.NumberFormat("en-CA", { min: 2, max: 2 })`.
    private static let acreFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_CA")
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter
    }()

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

    /// Reads a feature's geometry, all or nothing.
    ///
    /// One unreadable ring condemns the whole feature's boundary rather than
    /// just itself. Rings are not independent: the first is the outline and the
    /// rest are the holes cut out of it, so dropping one either promotes a hole
    /// to an outline or fills land the service deliberately excluded. Either
    /// way the map would draw a parcel with a boundary the source never sent,
    /// and hit-testing it would match properties that are not there.
    ///
    /// The same rule spans a MultiPolygon's parts. Keeping the readable parts of
    /// a parcel split by a road would show one side of the road as the whole
    /// property.
    private struct Geometry: Decodable {
        let boundary: ParcelFeature.Boundary

        private enum CodingKeys: String, CodingKey {
            case type
            case coordinates
        }

        init(from decoder: any Decoder) throws {
            guard let container = try? decoder.container(keyedBy: CodingKeys.self) else {
                boundary = .unreadable
                return
            }
            switch try? container.decodeIfPresent(String.self, forKey: .type) {
            case "Polygon":
                guard let rings = try? container.decode([[[Double]]].self, forKey: .coordinates),
                      let part = Self.part(from: rings) else {
                    boundary = .unreadable
                    return
                }
                boundary = .shape([part])
            case "MultiPolygon":
                guard let polygons =
                    try? container.decode([[[[Double]]]].self, forKey: .coordinates) else {
                    boundary = .unreadable
                    return
                }
                var parts: [PolygonHitTest.PolygonPart] = []
                parts.reserveCapacity(polygons.count)
                for polygon in polygons {
                    guard let part = Self.part(from: polygon) else {
                        boundary = .unreadable
                        return
                    }
                    parts.append(part)
                }
                boundary = parts.isEmpty ? .unreadable : .shape(parts)
            default:
                // A parcel layer answering with a point, a line, or a
                // GeometryCollection is an anomaly this reader will not guess
                // at. The feature is still kept — the PID is the evidence, and a
                // record that cannot be drawn is still a record that came back.
                //
                // The web hands whatever arrived to Leaflet, which can draw the
                // polygon members of a GeometryCollection, so the two surfaces
                // will disagree on such a reply. Saying so is the point of the
                // `.unreadable` case: the phone reports a shape it could not
                // read, rather than a parcel with no shape.
                boundary = .unreadable
            }
        }

        /// One polygon's rings, or `nil` if any of them is not a ring.
        private static func part(from rings: [[[Double]]]) -> PolygonHitTest.PolygonPart? {
            guard !rings.isEmpty else { return nil }
            var part: PolygonHitTest.PolygonPart = []
            part.reserveCapacity(rings.count)
            for positions in rings {
                guard let ring = Self.ring(from: positions) else { return nil }
                part.append(ring)
            }
            return part
        }

        /// A ring, or `nil` if any of its positions is not a coordinate or the
        /// positions do not enclose anything.
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

            // Three corners is the least that encloses ground. `PolygonHitTest`
            // closes every ring with a modulo index, so a shorter run of points
            // would silently become a shape: two points a line with an area of
            // nothing, one point a spot that answers "yes, inside" to a click
            // landing exactly on it. Both would report a parcel hit where the
            // service drew no parcel. GeoJSON's own closing repeat is allowed
            // for but not required, since the modulo close makes it redundant.
            let corners = points.count >= 2 && points[0] == points[points.count - 1]
                ? points.count - 1
                : points.count
            guard corners >= 3 else { return nil }
            return points
        }
    }
}
