import Foundation

/// Points-to-path conversion per the field-capture contract: the layer's
/// Point features in STORED ARRAY ORDER (creation order for drawn layers —
/// the owner ruled to ship the simple ordering first and revisit reordering
/// after real use), consecutive exact-duplicate coordinates dropped, a
/// polygon ring closed by repeating the first position, self-intersection
/// warned but never blocked. The numbered on-map preview is the safeguard
/// against a surprising order. The output feature carries `nsmts:createdAt`,
/// `nsmts:convertedFromPoints`, and inherits `nsmts:traced` when any source
/// point was parcel-snapped — the caveat travels with derived geometry.
/// Ported from `web/src/userMaps/vector/convert/pointsToPath.ts`.
public enum ConvertShape: String, Hashable, Sendable, CaseIterable {
    case line, area
}

public struct ConversionPlan: Hashable, Sendable {
    /// Deduped source positions in stored order, unclosed.
    public var positions: [GeoJsonPosition]
    public var sourcePointCount: Int
    public var viable: Bool
    public var lengthM: Double
    public var areaM2: Double?
    public var selfIntersects: Bool
    public var traced: Bool
}

extension VectorEdit {
    public static func conversionPlan(
        for parsed: ParsedVector, shape: ConvertShape
    ) -> ConversionPlan {
        var positions: [GeoJsonPosition] = []
        var traced = false
        var sourcePointCount = 0
        for feature in parsed.features {
            guard case .point(let raw)? = feature.geometry else { continue }
            sourcePointCount += 1
            // 2D on purpose: a converted outline is planimetric, and mixed
            // altitudes from marked points would fabricate a 3D shape.
            let position = GeoJsonPosition(lng: raw.lng, lat: raw.lat)
            if positions.last != position {
                positions.append(position)
            }
            if feature.properties[CaptureSpec.tracedKey] != nil {
                traced = true
            }
        }
        // A hand-closed ring (last point back on the first) would double the
        // closure the builder appends.
        if shape == .area, positions.count >= 2, positions.first == positions.last {
            positions.removeLast()
        }

        let viable = shape == .line ? positions.count >= 2 : positions.count >= 3
        let geoPoints = positions.map { GeoPoint(lat: $0.lat, lng: $0.lng) }
        let closedGeoPoints: [GeoPoint] =
            viable && shape == .area ? geoPoints + [geoPoints[0]] : geoPoints
        return ConversionPlan(
            positions: positions,
            sourcePointCount: sourcePointCount,
            viable: viable,
            lengthM: viable ? Geodesy.pathDistanceMetres(closedGeoPoints) : 0,
            areaM2: viable && shape == .area
                ? Geodesy.polygonAreaSquareMetres(geoPoints) : nil,
            selfIntersects: viable
                ? pathSelfIntersects(positions, closed: shape == .area) : false,
            traced: traced
        )
    }

    public struct ConversionResult: Sendable {
        public var parsed: ParsedVector
        public var feature: GeoJsonFeature
    }

    /// The layer with its points connected into a new line or area, per the
    /// plan above. Nil when the plan is not viable. Removing the source
    /// points removes every Point feature, exactly as the web does — the
    /// deduped positions all came from them, and a partial removal would
    /// leave the user guessing which points were "used".
    public static func convertingPoints(
        in parsed: ParsedVector,
        shape: ConvertShape,
        keepSourcePoints: Bool,
        id: String = UUID().uuidString,
        now: Date = Date()
    ) -> ConversionResult? {
        let plan = conversionPlan(for: parsed, shape: shape)
        guard plan.viable else { return nil }

        var properties: [String: JSONValue] = [
            CaptureSpec.createdAtKey: .string(CaptureTime.iso(now)),
            CaptureSpec.convertedFromPointsKey: .number(Double(plan.sourcePointCount)),
        ]
        if plan.traced {
            properties[CaptureSpec.tracedKey] = .string(CaptureSpec.tracedParcelValue)
        }
        let geometry: GeoJsonGeometry =
            shape == .line
            ? .lineString(plan.positions)
            : .polygon([plan.positions + [plan.positions[0]]])
        let feature = GeoJsonFeature(id: id, geometry: geometry, properties: properties)

        let remaining = keepSourcePoints
            ? parsed.features
            : parsed.features.filter { candidate in
                if case .point? = candidate.geometry { return false }
                return true
            }
        return ConversionResult(
            parsed: recomputed(remaining + [feature]), feature: feature
        )
    }

    /// Proper segment-intersection test in lon/lat; adequate at parcel
    /// scales. Adjacent segments share a vertex and are skipped; in a ring
    /// the last and first segments are adjacent too.
    static func pathSelfIntersects(_ path: [GeoJsonPosition], closed: Bool) -> Bool {
        var segments: [(GeoJsonPosition, GeoJsonPosition)] = []
        for index in 0..<max(path.count - 1, 0) {
            segments.append((path[index], path[index + 1]))
        }
        if closed, path.count >= 3, let last = path.last, let first = path.first {
            segments.append((last, first))
        }
        guard segments.count >= 3 else { return false }
        for i in 0..<segments.count {
            // Clamped: the last segments have no non-adjacent successors,
            // and an empty range must not be built descending.
            for j in min(i + 2, segments.count)..<segments.count {
                if closed, i == 0, j == segments.count - 1 { continue }
                if segmentsCross(
                    segments[i].0, segments[i].1, segments[j].0, segments[j].1
                ) {
                    return true
                }
            }
        }
        return false
    }

    private static func segmentsCross(
        _ a1: GeoJsonPosition, _ a2: GeoJsonPosition,
        _ b1: GeoJsonPosition, _ b2: GeoJsonPosition
    ) -> Bool {
        func orient(_ p: GeoJsonPosition, _ q: GeoJsonPosition, _ r: GeoJsonPosition) -> Int {
            let value = (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng)
            return value > 0 ? 1 : value < 0 ? -1 : 0
        }
        let o1 = orient(a1, a2, b1)
        let o2 = orient(a1, a2, b2)
        let o3 = orient(b1, b2, a1)
        let o4 = orient(b1, b2, a2)
        return o1 != o2 && o3 != o4 && o1 != 0 && o2 != 0 && o3 != 0 && o4 != 0
    }
}
