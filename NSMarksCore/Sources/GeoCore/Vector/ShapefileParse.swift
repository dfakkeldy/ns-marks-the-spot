import Foundation

/// Shapefile → GeoJSON.
///
/// The web gets this from shpjs plus proj4. Neither exists here, and the
/// projection half is the reason this is written out rather than approximated:
/// shpjs passes raw coordinates through untouched when a `.prj` is absent, so
/// a projected shapefile with no `.prj` arrives as if its eastings were
/// already degrees and lands in the Gulf of Guinea. This reader refuses that
/// file instead.
///
/// The accepted coordinate systems are `RasterProjection`'s closed list, the
/// same one the raster path uses. That is narrower than proj4: a shapefile in
/// some other projection is refused here where the web would convert it. The
/// refusal names the systems to re-export in, because a layer drawn from a
/// projection nobody verified is worse than a layer the user has to convert.
public enum ShapefileParse {
    /// One `.shp` and its sidecars, read as one layer.
    public struct Layer: Hashable, Sendable {
        public var name: String
        public var parsed: ParsedVector
        /// Something true about this layer the user should know before they
        /// read anything off it. Nil when there is nothing to say.
        public var note: String?
    }

    /// Reads every shapefile in an archive, each as its own layer.
    ///
    /// One `.shp` is one layer: collapsing a multi-layer archive into a single
    /// collection would mix unrelated feature sets under one name and one
    /// colour, and the user would have no way to tell which was which.
    public static func parse(zip data: Data) throws(UserMapImportRefusal) -> [Layer] {
        let entries = try ZipArchive.entries(in: data).filter { entry in
            !entry.name.contains("__MACOSX")
                && !(entry.name.split(separator: "/").last?.hasPrefix("._") ?? false)
        }
        let shapefiles = entries.filter { $0.name.lowercased().hasSuffix(".shp") }
        guard !shapefiles.isEmpty else {
            throw UserMapImportRefusal(
                code: .unsupportedType,
                userMessage: "This archive has no shapefile (.shp) in it."
            )
        }

        var layers: [Layer] = []
        for shapefile in shapefiles {
            let stem = String(shapefile.name.dropLast(4))
            func sidecar(_ suffix: String) -> ZipArchive.Entry? {
                entries.first { $0.name.lowercased() == "\(stem.lowercased())\(suffix)" }
            }

            // The .prj gate runs before any geometry is read. Without it there
            // is no way to know whether the numbers in the .shp are degrees or
            // metres, and the two are indistinguishable from the file alone.
            guard let projection = sidecar(".prj") else {
                throw UserMapImportRefusal(
                    code: .unsupportedCrs,
                    userMessage: """
                        "\(baseName(stem))" does not say what coordinate system it \
                        uses — its .prj file is missing. Re-export the shapefile with \
                        all of its sidecar files and import it again.
                        """
                )
            }
            let wkt = String(decoding: try ZipArchive.contents(of: projection, in: data), as: UTF8.self)
            guard let crs = epsgName(inWkt: wkt) else {
                throw UserMapImportRefusal(
                    code: .unsupportedCrs,
                    userMessage: """
                        The coordinate system in "\(baseName(stem)).prj" isn't one this \
                        app reads. Re-export the shapefile in NAD83 UTM zone 20N \
                        (EPSG:26920) or WGS84 (EPSG:4326).
                        """
                )
            }

            let shp = try ZipArchive.contents(of: shapefile, in: data)
            var attributes: [[String: JSONValue]]?
            if let table = sidecar(".dbf") {
                attributes = try Dbf.rows(in: try ZipArchive.contents(of: table, in: data))
            }
            let geometries = try shapes(in: shp, crs: crs)

            var features: [GeoJsonFeature] = []
            for (index, geometry) in geometries.enumerated() {
                let properties = attributes.flatMap { $0.indices.contains(index) ? $0[index] : nil }
                features.append(GeoJsonFeature(geometry: geometry, properties: properties ?? [:]))
            }

            layers.append(
                Layer(
                    name: baseName(stem),
                    parsed: try UserVectorParse.normalize(features),
                    // A shapefile with no .dbf is legal and its features have
                    // no details at all. Saying so beats a set of blank
                    // callouts the user has to guess the meaning of.
                    note: attributes == nil
                        ? """
                            No attribute table (.dbf) came with this shapefile, so its \
                            features have no details.
                            """
                        : nil
                )
            )
        }
        return layers
    }

    private static func baseName(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    // MARK: - Coordinate system

    /// The EPSG code a `.prj` declares, as `RasterProjection` names them.
    ///
    /// WKT is read for its authority code, and ESRI's own names are matched by
    /// hand because ESRI writes `.prj` files with no authority block at all.
    /// Anything else is nil, and the caller refuses the file.
    static func epsgName(inWkt wkt: String) -> String? {
        if let code = authorityCode(inWkt: wkt),
           RasterProjection.CoordinateSystem(crs: "EPSG:\(code)") != nil
        {
            return "EPSG:\(code)"
        }
        let upper = wkt.uppercased()
        // Ordered longest-first: a NAD83 UTM file's WKT also contains the
        // string "NAD_1983", and matching that first would call a projected
        // file geographic and read its eastings as degrees.
        let names: [(String, Int)] = [
            ("NAD_1983_CSRS_UTM_ZONE_20N", 2961),
            ("NAD83(CSRS) / UTM ZONE 20N", 2961),
            ("NAD_1983_CSRS_UTM_ZONE_21N", 2962),
            ("NAD83(CSRS) / UTM ZONE 21N", 2962),
            ("NAD_1983_UTM_ZONE_20N", 26920),
            ("NAD83 / UTM ZONE 20N", 26920),
            ("WGS_1984_WEB_MERCATOR_AUXILIARY_SPHERE", 3857),
            ("GCS_WGS_1984", 4326),
            ("WGS 84", 4326),
            ("GCS_NORTH_AMERICAN_1983", 4326),
        ]
        for (name, code) in names where upper.contains(name.uppercased()) {
            return "EPSG:\(code)"
        }
        return nil
    }

    /// The last `AUTHORITY["EPSG","…"]` in the document, which is the one
    /// belonging to the outermost coordinate system. An inner one names the
    /// datum or the geographic base — reading that would call a UTM file
    /// geographic.
    private static func authorityCode(inWkt wkt: String) -> Int? {
        let upper = wkt.uppercased()
        guard let range = upper.range(of: "AUTHORITY", options: .backwards) else { return nil }
        let tail = upper[range.upperBound...]
        let digits = tail.drop { $0 != "\"" }.dropFirst()
        guard digits.hasPrefix("EPSG") else { return nil }
        let after = digits.dropFirst(4).drop { !$0.isNumber }
        let code = after.prefix { $0.isNumber }
        return Int(code)
    }

    // MARK: - Geometry

    /// The shape types this reader draws. Z and M variants share the type
    /// modulo the 10/20 offset and carry their extra ordinates after the XY
    /// block, which this ignores: nothing in the app uses an elevation from a
    /// shapefile, and reading the XY of a PolygonZ is right, not partial.
    private static func shapes(
        in data: Data, crs: String
    ) throws(UserMapImportRefusal) -> [GeoJsonGeometry?] {
        let bytes = [UInt8](data)
        guard bytes.count >= 100, readBig32(bytes, 0) == 9994 else {
            throw ZipArchive.refusal("Couldn't read the shapefile inside this archive.")
        }
        var offset = 100
        var geometries: [GeoJsonGeometry?] = []
        while offset + 8 <= bytes.count {
            let contentLength = Int(readBig32(bytes, offset + 4)) * 2
            let start = offset + 8
            let end = start + contentLength
            guard contentLength >= 4, end <= bytes.count else { break }
            geometries.append(try shape(bytes, start: start, end: end, crs: crs))
            offset = end
        }
        guard !geometries.isEmpty else {
            throw ZipArchive.refusal("Couldn't read the shapefile inside this archive.")
        }
        return geometries
    }

    private static func shape(
        _ bytes: [UInt8], start: Int, end: Int, crs: String
    ) throws(UserMapImportRefusal) -> GeoJsonGeometry? {
        let type = Int(ZipArchive.read32(bytes, start))
        switch type {
        case 0:
            // A null shape is a row with no place — legal, and kept so the
            // attribute row it pairs with is not silently renumbered.
            return nil
        case 1, 11, 21:
            guard start + 20 <= end else { throw malformed() }
            return .point(
                try project(
                    x: readDouble(bytes, start + 4), y: readDouble(bytes, start + 12), crs: crs
                )
            )
        case 8, 18, 28:
            let positions = try points(bytes, start: start, end: end, crs: crs)
            return positions.isEmpty ? nil : .multiPoint(positions)
        case 3, 13, 23:
            let parts = try parts(bytes, start: start, end: end, crs: crs)
            let usable = parts.filter { $0.count >= 2 }
            if usable.isEmpty { return nil }
            return usable.count == 1 ? .lineString(usable[0]) : .multiLineString(usable)
        case 5, 15, 25:
            let rings = try parts(bytes, start: start, end: end, crs: crs)
            return polygon(from: rings)
        default:
            throw UserMapImportRefusal(
                code: .unsupportedType,
                userMessage: """
                    This shapefile holds a shape type this app can't draw. Export it \
                    as points, lines or polygons and import it again.
                    """
            )
        }
    }

    private static func malformed() -> UserMapImportRefusal {
        ZipArchive.refusal("Couldn't read the shapefile inside this archive.")
    }

    private static func points(
        _ bytes: [UInt8], start: Int, end: Int, crs: String
    ) throws(UserMapImportRefusal) -> [GeoJsonPosition] {
        guard start + 40 <= end else { throw malformed() }
        let count = Int(ZipArchive.read32(bytes, start + 36))
        var positions: [GeoJsonPosition] = []
        positions.reserveCapacity(count)
        for index in 0..<max(0, count) {
            let at = start + 40 + index * 16
            guard at + 16 <= end else { throw malformed() }
            positions.append(
                try project(x: readDouble(bytes, at), y: readDouble(bytes, at + 8), crs: crs)
            )
        }
        return positions
    }

    /// A polyline or polygon record: a part index followed by one flat run of
    /// points.
    private static func parts(
        _ bytes: [UInt8], start: Int, end: Int, crs: String
    ) throws(UserMapImportRefusal) -> [[GeoJsonPosition]] {
        guard start + 44 <= end else { throw malformed() }
        let partCount = Int(ZipArchive.read32(bytes, start + 36))
        let pointCount = Int(ZipArchive.read32(bytes, start + 40))
        guard partCount >= 0, pointCount >= 0 else { throw malformed() }
        let partsStart = start + 44
        let pointsStart = partsStart + partCount * 4
        guard pointsStart + pointCount * 16 <= end else { throw malformed() }

        var offsets: [Int] = []
        for index in 0..<partCount {
            offsets.append(Int(ZipArchive.read32(bytes, partsStart + index * 4)))
        }
        offsets.append(pointCount)

        var result: [[GeoJsonPosition]] = []
        for index in 0..<partCount {
            let from = offsets[index]
            let to = offsets[index + 1]
            guard from >= 0, to <= pointCount, from <= to else { throw malformed() }
            var positions: [GeoJsonPosition] = []
            positions.reserveCapacity(to - from)
            for pointIndex in from..<to {
                let at = pointsStart + pointIndex * 16
                positions.append(
                    try project(x: readDouble(bytes, at), y: readDouble(bytes, at + 8), crs: crs)
                )
            }
            result.append(positions)
        }
        return result
    }

    /// Shapefile polygons carry every ring of every part in one flat list, and
    /// the winding is the only thing saying which is which: clockwise is an
    /// outer boundary, counter-clockwise a hole.
    ///
    /// GeoJSON instead nests each polygon's holes inside it. Getting this
    /// wrong does not fail — it draws a lake as land, or one parcel as a hole
    /// in its neighbour.
    static func polygon(from rings: [[GeoJsonPosition]]) -> GeoJsonGeometry? {
        var polygons: [[[GeoJsonPosition]]] = []
        for ring in rings where ring.count >= 4 {
            if signedArea(ring) < 0 || polygons.isEmpty {
                // Counter-clockwise-first is malformed, and a hole with no
                // boundary to belong to is drawn as its own shape rather than
                // dropped: the user's ground is visible either way.
                polygons.append([ring])
            } else {
                polygons[polygons.count - 1].append(ring)
            }
        }
        guard !polygons.isEmpty else { return nil }
        return polygons.count == 1 ? .polygon(polygons[0]) : .multiPolygon(polygons)
    }

    /// Negative for a clockwise ring in a y-up coordinate system, which is
    /// what a shapefile's outer rings are.
    private static func signedArea(_ ring: [GeoJsonPosition]) -> Double {
        var total = 0.0
        for index in 0..<ring.count {
            let a = ring[index]
            let b = ring[(index + 1) % ring.count]
            total += (b.lng - a.lng) * (b.lat + a.lat)
        }
        return -total
    }

    private static func project(
        x: Double, y: Double, crs: String
    ) throws(UserMapImportRefusal) -> GeoJsonPosition {
        do {
            let point = try RasterProjection.groundPosition(crs: crs, x: x, y: y)
            return GeoJsonPosition(lng: point.lng, lat: point.lat)
        } catch {
            throw UserMapImportRefusal(
                code: .invalidGeoreferencing,
                userMessage: """
                    A coordinate in this shapefile doesn't land anywhere in the \
                    coordinate system its .prj declares. Re-export it and import it \
                    again.
                    """
            )
        }
    }

    private static func readDouble(_ bytes: [UInt8], _ offset: Int) -> Double {
        var raw: UInt64 = 0
        for index in 0..<8 where offset + index < bytes.count {
            raw |= UInt64(bytes[offset + index]) << (8 * index)
        }
        return Double(bitPattern: raw)
    }

    private static func readBig32(_ bytes: [UInt8], _ offset: Int) -> UInt32 {
        guard offset + 4 <= bytes.count else { return 0 }
        return UInt32(bytes[offset]) << 24 | UInt32(bytes[offset + 1]) << 16
            | UInt32(bytes[offset + 2]) << 8 | UInt32(bytes[offset + 3])
    }
}

/// The attribute table beside a shapefile.
enum Dbf {
    struct Field {
        var name: String
        var type: Character
        var length: Int
    }

    /// One dictionary per record, in file order — the order the `.shp` uses to
    /// pair them with geometry.
    static func rows(in data: Data) throws(UserMapImportRefusal) -> [[String: JSONValue]] {
        let bytes = [UInt8](data)
        guard bytes.count >= 32 else { return [] }
        let recordCount = Int(ZipArchive.read32(bytes, 4))
        let headerLength = Int(ZipArchive.read16(bytes, 8))
        let recordLength = Int(ZipArchive.read16(bytes, 10))
        guard recordCount >= 0, headerLength >= 33, recordLength > 0 else { return [] }

        var fields: [Field] = []
        var offset = 32
        while offset + 32 <= headerLength, bytes[offset] != 0x0d {
            let name = String(
                decoding: bytes[offset..<(offset + 11)].prefix { $0 != 0 }, as: UTF8.self
            )
            fields.append(
                Field(
                    name: name,
                    type: Character(UnicodeScalar(bytes[offset + 11])),
                    length: Int(bytes[offset + 16])
                )
            )
            offset += 32
        }

        var rows: [[String: JSONValue]] = []
        for index in 0..<recordCount {
            let start = headerLength + index * recordLength
            guard start + recordLength <= bytes.count else { break }
            // Byte zero is the deletion flag. A record marked deleted is not
            // part of the table, and reading it would add a row the user's own
            // GIS does not show them.
            if bytes[start] == 0x2a { continue }
            var row: [String: JSONValue] = [:]
            var at = start + 1
            for field in fields {
                guard at + field.length <= bytes.count else { break }
                let raw = Array(bytes[at..<(at + field.length)])
                at += field.length
                guard let value = value(of: field, raw: raw) else { continue }
                row[field.name] = value
            }
            rows.append(row)
        }
        return rows
    }

    private static func value(of field: Field, raw: [UInt8]) -> JSONValue? {
        // dBase has no encoding declaration worth trusting. UTF-8 when it
        // decodes, and Latin-1 otherwise, so an accented place name arrives as
        // itself rather than as a replacement character.
        let text = (String(bytes: raw, encoding: .utf8) ?? String(bytes: raw, encoding: .isoLatin1) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        switch field.type {
        case "N", "F":
            // A number that will not parse is kept as its text rather than
            // dropped: it is what the table says, and dropping it would show
            // the user an empty attribute where their data has a value.
            return Double(text).map { JSONValue.number($0) } ?? .string(text)
        case "L":
            switch text.uppercased().first {
            case "T", "Y": return .bool(true)
            case "F", "N": return .bool(false)
            default: return nil
            }
        default:
            return .string(text)
        }
    }
}
