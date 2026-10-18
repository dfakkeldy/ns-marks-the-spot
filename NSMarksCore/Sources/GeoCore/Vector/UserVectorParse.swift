import Foundation

/// Turning a user's vector file into features, and refusing the ones that
/// cannot be turned into features honestly.
///
/// Ported from `web/src/userMaps/vector/parsers/geojsonSource.ts`. The
/// canonical format everywhere past this point is WGS84 GeoJSON; KML, GPX and
/// shapefile convert here and never leak their own shapes further in.
public enum UserVectorParse {
    /// What one layer will render and hit-test before the import is refused
    /// outright.
    ///
    /// The same 10,000 the web uses. A refusal rather than a degraded map: a
    /// user who imports a provincial roads extract is better told it is too
    /// big than handed a map that will not pan.
    public static let maximumFeatures = 10_000

    private static let geometryTypes: Set<String> = [
        "Point", "MultiPoint", "LineString", "MultiLineString",
        "Polygon", "MultiPolygon", "GeometryCollection",
    ]

    static func corrupt() -> UserMapImportRefusal {
        UserMapImportRefusal(
            code: .corruptFile,
            userMessage: "Couldn't read this file — it isn't valid GeoJSON."
        )
    }

    /// Everything a vector import ends with, whatever format it started in:
    /// the feature cap, coordinate validation, stable ids, and the bounds.
    ///
    /// Ids matter beyond tidiness. Editing addresses a feature by id and an
    /// export round-trip carries it, so two features sharing one id would let
    /// an edit to either move the other.
    public static func normalize(
        _ features: [GeoJsonFeature]
    ) throws(UserMapImportRefusal) -> ParsedVector {
        guard features.count <= maximumFeatures else {
            throw UserMapImportRefusal(
                code: .tooManyFeatures,
                userMessage: """
                    This file has \(formatted(features.count)) features — the map \
                    supports up to \(formatted(maximumFeatures)) per file.
                    """
            )
        }

        var west = Double.infinity
        var south = Double.infinity
        var east = -Double.infinity
        var north = -Double.infinity
        var seen = Set<String>()
        var normalized: [GeoJsonFeature] = []
        normalized.reserveCapacity(features.count)

        for (index, feature) in features.enumerated() {
            for position in feature.geometry?.positions ?? [] {
                guard position.lng.isFinite, position.lat.isFinite else { throw corrupt() }
                guard abs(position.lng) <= 180, abs(position.lat) <= 90 else {
                    // Values like [500000, 4980000] are projected coordinates
                    // with no declared system. Guessing which projection is
                    // exactly the guess this app will not make: the wrong guess
                    // puts the user's survey somewhere plausible and wrong.
                    throw UserMapImportRefusal(
                        code: .invalidGeoreferencing,
                        userMessage: """
                            This file's coordinates are outside longitude/latitude \
                            range — it looks like projected data. Re-export it in \
                            WGS84 (longitude/latitude).
                            """
                    )
                }
                west = min(west, position.lng)
                east = max(east, position.lng)
                south = min(south, position.lat)
                north = max(north, position.lat)
            }

            var id = feature.id.flatMap { $0.isEmpty ? nil : $0 } ?? "feature-\(index + 1)"
            while seen.contains(id) {
                id = "\(id)-\(index + 1)"
            }
            seen.insert(id)
            var copy = feature
            copy.id = id
            if let geometry = copy.geometry {
                copy.geometry = try repaired(geometry)
            }
            normalized.append(copy)
        }

        guard normalized.contains(where: { $0.geometry?.isRenderable == true }) else {
            throw UserMapImportRefusal(
                code: .emptyFile,
                userMessage: "This file has no map features in it — nothing to add."
            )
        }

        return ParsedVector(
            features: normalized,
            bbox: west.isFinite
                ? GeoBoundingBox(south: south, west: west, north: north, east: east)
                : nil
        )
    }

    /// One geometry with its rings closed, or a refusal for one that cannot be
    /// drawn at all.
    ///
    /// The two are different failures and are treated differently. A ring whose
    /// first and last position differ is a file that broke the spec in a way
    /// with exactly one right answer — the ring closes where it started — so it
    /// is closed here rather than refused, because MapKit would close it
    /// implicitly on screen and the export would then write out something the
    /// user never saw. A ring of two positions, or a line of one, has no right
    /// answer: it is refused rather than padded into a shape the file does not
    /// contain.
    static func repaired(_ geometry: GeoJsonGeometry) throws(UserMapImportRefusal)
        -> GeoJsonGeometry
    {
        func line(_ positions: [GeoJsonPosition]) throws(UserMapImportRefusal)
            -> [GeoJsonPosition]
        {
            guard positions.count >= 2 else { throw degenerate() }
            return positions
        }
        func ring(_ positions: [GeoJsonPosition]) throws(UserMapImportRefusal)
            -> [GeoJsonPosition]
        {
            // Three distinct corners is the least that encloses ground. The
            // closing repeat is not one of them.
            var closed = positions
            if let first = closed.first, first == closed.last {
                closed.removeLast()
            }
            guard closed.count >= 3, let first = closed.first else { throw degenerate() }
            closed.append(first)
            return closed
        }

        switch geometry {
        case .point, .multiPoint:
            return geometry
        case .lineString(let positions):
            return .lineString(try line(positions))
        case .multiLineString(let lines):
            return .multiLineString(try lines.map(line))
        case .polygon(let rings):
            return .polygon(try rings.map(ring))
        case .multiPolygon(let parts):
            var repairedParts: [[[GeoJsonPosition]]] = []
            for part in parts {
                repairedParts.append(try part.map(ring))
            }
            return .multiPolygon(repairedParts)
        case .collection(let geometries):
            return .collection(try geometries.map(repaired))
        }
    }

    static func degenerate() -> UserMapImportRefusal {
        UserMapImportRefusal(
            code: .corruptFile,
            userMessage: """
                This file has a shape with too few points to draw — a line needs \
                two and an area needs three.
                """
        )
    }

    /// Parses a GeoJSON document.
    ///
    /// `allowingEmpty` is for the app's own stored layers. A drawn layer that
    /// has no features yet, or none again after the last one was erased, is a
    /// legitimate empty collection there, not a file with nothing to import;
    /// refusing it made the layer unreadable on the next launch. The import
    /// path keeps the refusal, and its test.
    public static func parseGeoJson(
        _ data: Data, allowingEmpty: Bool = false
    ) throws(UserMapImportRefusal) -> ParsedVector {
        let root: Any
        do {
            root = try JSONSerialization.jsonObject(with: data, options: [])
        } catch {
            throw corrupt()
        }
        guard let document = root as? [String: Any] else {
            throw notGeoJson()
        }
        try assertUsableCrs(document)

        let type = document["type"] as? String
        if type == "FeatureCollection" {
            guard let raw = document["features"] as? [Any] else { throw corrupt() }
            if raw.isEmpty, allowingEmpty {
                return ParsedVector(features: [], bbox: nil)
            }
            var features: [GeoJsonFeature] = []
            features.reserveCapacity(raw.count)
            for element in raw {
                features.append(try feature(from: element))
            }
            return try normalize(features)
        }
        if type == "Feature" {
            return try normalize([try feature(from: document)])
        }
        if let type, geometryTypes.contains(type) {
            return try normalize([
                GeoJsonFeature(geometry: try geometry(from: document), properties: [:])
            ])
        }
        throw notGeoJson()
    }

    private static func notGeoJson() -> UserMapImportRefusal {
        UserMapImportRefusal(
            code: .unsupportedType,
            userMessage: "This JSON file isn't GeoJSON — no features found in it."
        )
    }

    /// RFC 7946 fixed GeoJSON's coordinate system to WGS84 and removed the
    /// 2008-era `crs` member. A file that still declares something else is
    /// projected data, and reprojecting it without saying so would move the
    /// user's geometry silently.
    private static func assertUsableCrs(
        _ document: [String: Any]
    ) throws(UserMapImportRefusal) {
        guard let crs = document["crs"], !(crs is NSNull) else { return }
        let name = ((crs as? [String: Any])?["properties"] as? [String: Any])?["name"] as? String
        let upper = (name ?? "").uppercased()
        guard !upper.contains("CRS84"), !upper.contains("4326") else { return }
        throw UserMapImportRefusal(
            code: .unsupportedCrs,
            userMessage: """
                This file declares the coordinate system "\(name ?? "")" — only \
                longitude/latitude (WGS84) GeoJSON is supported. Re-export it in \
                WGS84.
                """
        )
    }

    private static func feature(from raw: Any) throws(UserMapImportRefusal) -> GeoJsonFeature {
        guard let object = raw as? [String: Any],
              object["type"] as? String == "Feature"
        else { throw corrupt() }

        var properties: [String: JSONValue] = [:]
        if let raw = object["properties"], !(raw is NSNull) {
            guard let dictionary = raw as? [String: Any],
                  case .object(let values)? = JSONValue.from(dictionary)
            else { throw corrupt() }
            properties = values
        }

        var parsed: GeoJsonGeometry?
        if let raw = object["geometry"], !(raw is NSNull) {
            parsed = try geometry(from: raw)
        }

        return GeoJsonFeature(id: identifier(object["id"]), geometry: parsed, properties: properties)
    }

    /// A file's own id for a feature, when it gave one this app can use.
    ///
    /// A numeric id keeps its digits: JSON has one number type, and a parcel
    /// identified as 1234 must not come back as "1234.0" in an export.
    private static func identifier(_ raw: Any?) -> String? {
        if let text = raw as? String { return text.isEmpty ? nil : text }
        if let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() {
            return JSONValue.text(forNumber: number.doubleValue)
        }
        return nil
    }

    private static func geometry(
        from raw: Any
    ) throws(UserMapImportRefusal) -> GeoJsonGeometry {
        guard let object = raw as? [String: Any],
              let type = object["type"] as? String,
              geometryTypes.contains(type)
        else { throw corrupt() }

        if type == "GeometryCollection" {
            guard let raw = object["geometries"] as? [Any] else { throw corrupt() }
            var geometries: [GeoJsonGeometry] = []
            geometries.reserveCapacity(raw.count)
            for element in raw {
                geometries.append(try geometry(from: element))
            }
            return .collection(geometries)
        }

        guard let coordinates = object["coordinates"] else { throw corrupt() }
        switch type {
        case "Point": return .point(try position(coordinates))
        case "MultiPoint": return .multiPoint(try positions(coordinates))
        case "LineString": return .lineString(try positions(coordinates))
        case "MultiLineString": return .multiLineString(try lines(coordinates))
        case "Polygon": return .polygon(try lines(coordinates))
        case "MultiPolygon":
            guard let raw = coordinates as? [Any] else { throw corrupt() }
            var polygons: [[[GeoJsonPosition]]] = []
            polygons.reserveCapacity(raw.count)
            for element in raw {
                polygons.append(try lines(element))
            }
            return .multiPolygon(polygons)
        default: throw corrupt()
        }
    }

    private static func lines(
        _ raw: Any
    ) throws(UserMapImportRefusal) -> [[GeoJsonPosition]] {
        guard let array = raw as? [Any] else { throw corrupt() }
        var result: [[GeoJsonPosition]] = []
        result.reserveCapacity(array.count)
        for element in array {
            result.append(try positions(element))
        }
        return result
    }

    private static func positions(
        _ raw: Any
    ) throws(UserMapImportRefusal) -> [GeoJsonPosition] {
        guard let array = raw as? [Any] else { throw corrupt() }
        var result: [GeoJsonPosition] = []
        result.reserveCapacity(array.count)
        for element in array {
            result.append(try position(element))
        }
        return result
    }

    private static func position(
        _ raw: Any
    ) throws(UserMapImportRefusal) -> GeoJsonPosition {
        guard let array = raw as? [Any], array.count >= 2 else { throw corrupt() }
        var numbers: [Double] = []
        for element in array.prefix(3) {
            guard let number = element as? NSNumber,
                  CFGetTypeID(number) != CFBooleanGetTypeID()
            else { throw corrupt() }
            numbers.append(number.doubleValue)
        }
        return GeoJsonPosition(
            lng: numbers[0], lat: numbers[1],
            altitude: numbers.count > 2 ? numbers[2] : nil
        )
    }

    /// Thousands separators, the way the panel writes counts.
    static func formatted(_ count: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: count)) ?? String(count)
    }
}
