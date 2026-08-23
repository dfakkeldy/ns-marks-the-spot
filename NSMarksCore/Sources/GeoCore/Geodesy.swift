import Foundation

/// Geodesic measurement on the sphere Leaflet uses (CRS.Earth, R = 6 371 000 m),
/// so measured values agree with the on-screen scale bar. A planar shoelace on
/// raw lat/lng would overstate areas by ~40 % at Nova Scotia's latitude; the
/// spherical-excess form below is the standard geodesic approximation.
///
/// Ported case-for-case from `web/src/services/geodesy.ts`. The sphere radius is
/// Leaflet's, *not* the WGS84 ellipsoid — matching the web surface matters more
/// than absolute geodetic accuracy, because the two surfaces must report the
/// same area for the same parcel.
public enum Geodesy {
    static let earthRadiusMetres = 6_371_000.0
    static let degreesToRadians = Double.pi / 180
    static let squareMetresPerHectare = 10_000.0

    public static let squareMetresPerAcre = 4_046.856_422_4

    static func distanceMetres(from: GeoPoint, to: GeoPoint) -> Double {
        let fromLat = from.lat * degreesToRadians
        let toLat = to.lat * degreesToRadians
        let deltaLat = (to.lat - from.lat) * degreesToRadians
        let deltaLng = (to.lng - from.lng) * degreesToRadians
        let haversine =
            pow(sin(deltaLat / 2), 2)
            + cos(fromLat) * cos(toLat) * pow(sin(deltaLng / 2), 2)
        return 2 * earthRadiusMetres
            * atan2(haversine.squareRoot(), (1 - haversine).squareRoot())
    }

    /// Total length of an open path. Fewer than two points measures zero.
    public static func pathDistanceMetres(_ points: [GeoPoint]) -> Double {
        guard points.count > 1 else { return 0 }
        var total = 0.0
        for index in 1..<points.count {
            total += distanceMetres(from: points[index - 1], to: points[index])
        }
        return total
    }

    /// Spherical-excess area of a closed ring, sign-independent.
    ///
    /// Valid only for rings that do not cross the antimeridian (fine for Nova
    /// Scotia): the Δλ term is a plain linear difference, not wrapped to
    /// [-180, 180], so a ring spanning ±180° longitude would compute a wildly
    /// wrong area. This limitation is inherited deliberately — the web has it
    /// too, and diverging here would break area parity.
    public static func polygonAreaSquareMetres(_ ring: [GeoPoint]) -> Double {
        guard ring.count >= 3 else { return 0 }
        var sum = 0.0
        for index in ring.indices {
            let current = ring[index]
            let next = ring[(index + 1) % ring.count]
            sum +=
                (next.lng - current.lng)
                * degreesToRadians
                * (2
                    + sin(current.lat * degreesToRadians)
                    + sin(next.lat * degreesToRadians))
        }
        return abs(sum * earthRadiusMetres * earthRadiusMetres / 2)
    }
}

// MARK: - Formatting

extension Geodesy {
    // The web uses Intl.NumberFormat("en-CA"). FormatStyle is the Sendable
    // analogue; NumberFormatter would need locking under Swift 6. Intl rounds
    // half away from zero, so the rounding rule is set explicitly rather than
    // left at FormatStyle's default of half-to-even.
    private static let locale = Locale(identifier: "en_CA")

    private static func format(_ value: Double, fractionDigits: Int) -> String {
        value.formatted(
            .number
                .precision(.fractionLength(fractionDigits))
                .rounded(rule: .toNearestOrAwayFromZero)
                .locale(locale)
        )
    }

    /// Metres below a kilometre, kilometres to two decimals at and above.
    public static func formatDistance(_ metres: Double) -> String {
        if metres < 1_000 {
            return "\(format(metres, fractionDigits: 0)) m"
        }
        return "\(format(metres / 1_000, fractionDigits: 2)) km"
    }

    /// Hectares and acres together — the pairing surveyors and assessment rolls
    /// each use, shown side by side so neither has to be converted by hand.
    public static func formatArea(_ squareMetres: Double) -> String {
        let hectares = squareMetres / squareMetresPerHectare
        let acres = squareMetres / squareMetresPerAcre
        return "\(format(hectares, fractionDigits: 2)) ha · \(format(acres, fractionDigits: 2)) ac"
    }
}
