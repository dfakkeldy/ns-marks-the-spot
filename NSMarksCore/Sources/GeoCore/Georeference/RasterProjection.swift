import Foundation

/// Turns a raster's own georeferencing — the coordinate system it was exported
/// in, and the six numbers that place its pixels in that system — into ground
/// positions.
///
/// Ported from `web/src/userMaps/transform/projection.ts`, which does this
/// through proj4. There is no proj4 here and no dependency was added for one,
/// so the one projection Nova Scotia data actually ships in is worked out
/// directly. That is affordable precisely because the accepted list is short
/// and closed: this is an allowlist of the systems NS source data uses, not a
/// general reprojection library, and a file in anything else is refused at
/// import rather than drawn in the wrong place.
public enum RasterProjection {
    /// The coordinate systems a user raster may declare.
    ///
    /// NAD83 and WGS 84 are treated as the same datum, which is what the web's
    /// definitions do (`+towgs84=0,0,0`). They differ by a metre or two in
    /// Nova Scotia. That is smaller than the georeferencing error of any
    /// scanned sheet this feature exists to place, and stating it here is the
    /// point: it is a deliberate approximation, not an oversight.
    public enum CoordinateSystem: Int, CaseIterable, Sendable {
        /// NAD83 / UTM zone 20N — the one most NS provincial rasters ship in.
        case nad83UtmZone20 = 26920
        /// NAD83(CSRS) / UTM zone 20N.
        case nad83CsrsUtmZone20 = 2961
        /// NAD83(CSRS) / UTM zone 21N, for the eastern edge.
        case nad83CsrsUtmZone21 = 2962
        /// NAD83(CSRS) geographic — degrees already.
        case nad83CsrsGeographic = 4617
        /// WGS 84 geographic.
        case wgs84 = 4326
        /// Web Mercator, in metres.
        case webMercator = 3857

        /// Reads "EPSG:26920" in either case, as the web's pattern does.
        ///
        /// Checked against this list rather than against what a projection
        /// library happens to recognise. proj4 knows a great many EPSG codes
        /// that NS data never ships in, and accepting one of those because a
        /// library could parse it would place a sheet using a system nobody
        /// verified it against.
        public init?(crs: String) {
            let trimmed = crs.trimmingCharacters(in: .whitespacesAndNewlines)
            let digits = trimmed.dropFirst(5)
            guard trimmed.count > 5,
                  trimmed.prefix(5).lowercased() == "epsg:",
                  // Digits and nothing else. Swift's integer parsing accepts a
                  // leading sign, so "EPSG:+26920" would otherwise come back as
                  // zone 20 while the web's `/^EPSG:(\d+)$/i` refuses it — a
                  // file the two surfaces disagree about.
                  digits.allSatisfy(\.isASCII), digits.allSatisfy(\.isNumber),
                  let code = Int(digits),
                  let system = CoordinateSystem(rawValue: code)
            else { return nil }
            self = system
        }

        /// The zone's central meridian, for the two UTM systems.
        var utmZone: Int? {
            switch self {
            case .nad83UtmZone20, .nad83CsrsUtmZone20: 20
            case .nad83CsrsUtmZone21: 21
            case .nad83CsrsGeographic, .wgs84, .webMercator: nil
            }
        }
    }

    /// Why a raster's georeferencing cannot be used.
    public enum Refusal: Error, Equatable, Sendable {
        /// A coordinate system outside the accepted list, or not an EPSG code
        /// at all. The web additionally accepts a raw proj4 or WKT definition
        /// string as a fallback for a file that embeds only a citation; there
        /// is nothing here that can parse one, so such a file is refused with
        /// this rather than guessed at.
        case unsupportedCoordinateSystem(String)
        /// The numbers are there and they do not describe a place: a
        /// non-finite geotransform, or a coordinate that lands outside the
        /// declared system's valid area. Unchecked, that draws a sheet
        /// stretched across the globe instead of failing.
        case invalidGeoreferencing
    }

    /// Where a raster's pixels sit, in the system it declares.
    ///
    /// `geotransform` is in GDAL's order:
    /// `[originX, xResolution, xRotation, originY, yRotation, yResolution]`.
    public struct EmbeddedGeoreference: Hashable, Sendable {
        public var crs: String
        public var geotransform: [Double]

        public init(crs: String, geotransform: [Double]) {
            self.crs = crs
            self.geotransform = geotransform
        }
    }

    /// Import-time gate, so a file in a system this app cannot place fails when
    /// it is opened rather than when it is first drawn.
    public static func validate(crs: String) throws(Refusal) {
        guard CoordinateSystem(crs: crs) != nil else {
            throw .unsupportedCoordinateSystem(crs)
        }
    }

    public static func groundPosition(
        _ georeference: EmbeddedGeoreference, x: Double, y: Double
    ) throws(Refusal) -> GeoPoint {
        guard georeference.geotransform.count == 6,
              georeference.geotransform.allSatisfy(\.isFinite),
              x.isFinite, y.isFinite
        else { throw .invalidGeoreferencing }
        let t = georeference.geotransform
        return try groundPosition(
            crs: georeference.crs,
            x: t[0] + x * t[1] + y * t[2],
            y: t[3] + x * t[4] + y * t[5]
        )
    }

    /// One coordinate in a declared system, as a ground position.
    public static func groundPosition(
        crs: String, x: Double, y: Double
    ) throws(Refusal) -> GeoPoint {
        guard let system = CoordinateSystem(crs: crs) else {
            throw .unsupportedCoordinateSystem(crs)
        }
        let point: GeoPoint
        switch system {
        case .nad83CsrsGeographic, .wgs84:
            point = GeoPoint(lat: y, lng: x)
        case .webMercator:
            // Checked before unprojecting, not after: `unproject` clamps to the
            // projection's latitude limit, so a northing of a hundred million
            // would otherwise come back as a perfectly ordinary 85.05° rather
            // than as the nonsense it is.
            guard abs(x) <= mercatorWorldExtent, abs(y) <= mercatorWorldExtent else {
                throw .invalidGeoreferencing
            }
            point = WebMercator.unproject(MercatorPoint(x: x, y: y))
        case .nad83UtmZone20, .nad83CsrsUtmZone20, .nad83CsrsUtmZone21:
            let zone = system.utmZone ?? 20
            point = utmToGround(easting: x, northing: y, zone: zone)
            try checkInsideZone(point, zone: zone)
        }
        // A coordinate far outside its declared zone comes back finite-looking
        // from the series but no longer means anything, so the answer is
        // checked for being a place rather than merely for being a number.
        guard point.lat.isFinite, point.lng.isFinite,
              abs(point.lat) <= 90, abs(point.lng) <= 180
        else { throw .invalidGeoreferencing }
        return point
    }

    /// A lattice of ground positions over the raster.
    ///
    /// Eight cells rather than the affine warp's one, and for a reason the
    /// affine case does not have: this path goes pixel to UTM to ground to the
    /// screen's Mercator, and UTM to Mercator genuinely curves. Across a
    /// county-scale sheet one cell would visibly bow.
    public static let embeddedGridSize = 8

    public static func latLngMesh(
        _ georeference: EmbeddedGeoreference,
        pixelSize: PixelSize,
        gridSize: Int = embeddedGridSize,
        sourceRect: PixelRect? = nil
    ) throws -> [[GeoPoint]] {
        guard gridSize >= 1 else { throw GcpMesh.MeshRefusal.notALattice }
        let rect = try GcpMesh.resolve(pixelSize: pixelSize, sourceRect: sourceRect)
        let steps = gridSize
        var mesh = [[GeoPoint]]()
        for row in 0...steps {
            let y = rect.y + rect.height * Double(row) / Double(steps)
            var line = [GeoPoint]()
            for col in 0...steps {
                let x = rect.x + rect.width * Double(col) / Double(steps)
                line.append(try groundPosition(georeference, x: x, y: y))
            }
            mesh.append(line)
        }
        return mesh
    }

    // MARK: - Domain

    /// Half the width of the projected world in EPSG:3857 metres.
    static let mercatorWorldExtent = WebMercator.earthRadiusMetres * .pi

    /// How far from its zone's central meridian a coordinate may land.
    ///
    /// A UTM zone is 6° wide, so 3° each side, but real provincial rasters
    /// overrun their zone: NS ships zone-20 sheets that reach Yarmouth at about
    /// 3.4° west of the 63rd meridian. Five degrees admits that overrun and
    /// still refuses the two things worth refusing — a zone-21 raster labelled
    /// zone 20, which lands a full 6° out, and a coordinate so far from the
    /// meridian that Snyder's truncated series has stopped being accurate
    /// (PROJ puts that divergence at roughly 3°, and at 19° out it measured
    /// 154 m against proj4).
    static let maxDegreesFromCentralMeridian = 5.0

    /// What the guard cannot do: a raster whose metadata names the wrong zone
    /// but whose eastings still fall inside the zone it names is placed
    /// confidently in the wrong place, about 470 km away. Nothing in the
    /// coordinate carries the information needed to notice — only the file's
    /// own declaration says which zone it is in, and that declaration is what
    /// is wrong. It is caught, if at all, by the user seeing the sheet land in
    /// the wrong county.
    private static func checkInsideZone(_ point: GeoPoint, zone: Int) throws(Refusal) {
        let centralMeridian = Double(zone) * 6 - 183
        guard point.lat.isFinite, point.lng.isFinite,
              point.lat >= 0, point.lat <= 84,
              abs(point.lng - centralMeridian) <= maxDegreesFromCentralMeridian
        else { throw .invalidGeoreferencing }
    }

    // MARK: - Transverse Mercator, inverse

    /// GRS 80, which NAD83 and NAD83(CSRS) both use.
    private static let semiMajorAxis = 6_378_137.0
    private static let flattening = 1 / 298.257_222_101
    private static let scaleFactor = 0.9996
    private static let falseEasting = 500_000.0

    /// Snyder's inverse transverse Mercator series, which is what proj4 runs
    /// for a UTM zone. Accurate to well under a millimetre inside a zone, and
    /// meaningless far outside one — which is why the caller checks the answer
    /// is a place before returning it.
    private static func utmToGround(
        easting: Double, northing: Double, zone: Int
    ) -> GeoPoint {
        let a = semiMajorAxis
        let f = flattening
        let eSquared = 2 * f - f * f
        let ePrimeSquared = eSquared / (1 - eSquared)

        // Northern hemisphere only: every zone Nova Scotia uses is north of the
        // equator, so the false northing is zero.
        let meridional = northing / scaleFactor
        let mu = meridional
            / (a * (1 - eSquared / 4 - 3 * pow(eSquared, 2) / 64
                    - 5 * pow(eSquared, 3) / 256))
        let e1 = (1 - sqrt(1 - eSquared)) / (1 + sqrt(1 - eSquared))
        let footprint = mu
            + (3 * e1 / 2 - 27 * pow(e1, 3) / 32) * sin(2 * mu)
            + (21 * pow(e1, 2) / 16 - 55 * pow(e1, 4) / 32) * sin(4 * mu)
            + (151 * pow(e1, 3) / 96) * sin(6 * mu)
            + (1097 * pow(e1, 4) / 512) * sin(8 * mu)

        let sinFootprint = sin(footprint)
        let cosFootprint = cos(footprint)
        let tanFootprint = tan(footprint)
        let c1 = ePrimeSquared * cosFootprint * cosFootprint
        let t1 = tanFootprint * tanFootprint
        let n1 = a / sqrt(1 - eSquared * sinFootprint * sinFootprint)
        let r1 = a * (1 - eSquared)
            / pow(1 - eSquared * sinFootprint * sinFootprint, 1.5)
        let d = (easting - falseEasting) / (n1 * scaleFactor)

        let latitude = footprint - (n1 * tanFootprint / r1) * (
            d * d / 2
                - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ePrimeSquared)
                * pow(d, 4) / 24
                + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1
                   - 252 * ePrimeSquared - 3 * c1 * c1)
                * pow(d, 6) / 720
        )
        let fromMeridian = (
            d
                - (1 + 2 * t1 + c1) * pow(d, 3) / 6
                + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ePrimeSquared
                   + 24 * t1 * t1) * pow(d, 5) / 120
        ) / cosFootprint

        let centralMeridian = Double(zone) * 6 - 183
        return GeoPoint(
            lat: latitude * 180 / .pi,
            lng: centralMeridian + fromMeridian * 180 / .pi
        )
    }
}
