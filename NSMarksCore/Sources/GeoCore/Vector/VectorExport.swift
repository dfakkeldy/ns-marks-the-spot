import Foundation

/// Writing a user's layer back out.
///
/// GeoJSON is a serialisation rather than a conversion — the canonical format
/// in this app already is a WGS84 feature collection — so what the user gets
/// back is exactly what the map is drawing, ids and properties included.
public enum VectorExport {
    /// The layer as GeoJSON, pretty-printed.
    ///
    /// Pretty-printed because an exported layer is usually read or hand-edited
    /// before it goes anywhere else, and one long line is not a file anyone
    /// can check.
    public static func geoJson(_ parsed: ParsedVector) throws -> Data {
        var features: [Any] = []
        for feature in parsed.features {
            var object: [String: Any] = [
                "type": "Feature",
                "properties": feature.properties.mapValues(\.jsonObject),
                "geometry": feature.geometry.map(json(of:)) ?? NSNull(),
            ]
            if let id = feature.id { object["id"] = id }
            features.append(object)
        }
        return try JSONSerialization.data(
            withJSONObject: ["type": "FeatureCollection", "features": features],
            options: [.prettyPrinted, .sortedKeys]
        )
    }

    private static func json(of geometry: GeoJsonGeometry) -> [String: Any] {
        func position(_ value: GeoJsonPosition) -> [Double] {
            value.altitude.map { [value.lng, value.lat, $0] } ?? [value.lng, value.lat]
        }
        switch geometry {
        case .point(let value):
            return ["type": "Point", "coordinates": position(value)]
        case .multiPoint(let values):
            return ["type": "MultiPoint", "coordinates": values.map(position)]
        case .lineString(let values):
            return ["type": "LineString", "coordinates": values.map(position)]
        case .multiLineString(let lines):
            return ["type": "MultiLineString", "coordinates": lines.map { $0.map(position) }]
        case .polygon(let rings):
            return ["type": "Polygon", "coordinates": rings.map { $0.map(position) }]
        case .multiPolygon(let polygons):
            return [
                "type": "MultiPolygon",
                "coordinates": polygons.map { $0.map { $0.map(position) } },
            ]
        case .collection(let geometries):
            return ["type": "GeometryCollection", "geometries": geometries.map(json(of:))]
        }
    }

    // MARK: - KML

    /// The layer as a KML document.
    ///
    /// Styling is deliberately not written back. The simplestyle properties
    /// survive in the GeoJSON export, and a `<Style>` block that got the
    /// colours slightly wrong would misrepresent the layer in whatever tool
    /// opens it more than an absent one does.
    public static func kml(layerName: String, parsed: ParsedVector) -> String {
        var body = ""
        for feature in parsed.features {
            guard let geometry = feature.geometry, let element = kmlGeometry(geometry) else {
                continue
            }
            var placemark = "<Placemark>"
            if let name = feature.properties["name"]?.stringValue, !name.isEmpty {
                placemark += "<name>\(escaped(name))</name>"
            }
            if let description = feature.properties["description"]?.stringValue,
               !description.isEmpty
            {
                placemark += "<description>\(escaped(description))</description>"
            }
            placemark += element + "</Placemark>"
            body += placemark
        }
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <kml xmlns="http://www.opengis.net/kml/2.2"><Document>\
            <name>\(escaped(layerName))</name>\(body)</Document></kml>
            """
    }

    /// Nil for geometry KML has no representation for.
    private static func kmlGeometry(_ geometry: GeoJsonGeometry) -> String? {
        func coordinates(_ positions: [GeoJsonPosition]) -> String {
            positions.map { position in
                // Longitude first here too: KML shares GeoJSON's axis order,
                // unlike most of the rest of the geospatial world.
                position.altitude.map { "\(position.lng),\(position.lat),\($0)" }
                    ?? "\(position.lng),\(position.lat)"
            }
            .joined(separator: " ")
        }
        func multi(_ parts: [GeoJsonGeometry]) -> String {
            // KML has no Multi* primitives. A MultiGeometry holding one child
            // per part is the spec's equivalent, and what a KML reader gives
            // back.
            "<MultiGeometry>" + parts.compactMap(kmlGeometry).joined() + "</MultiGeometry>"
        }

        switch geometry {
        case .point(let position):
            return "<Point><coordinates>\(coordinates([position]))</coordinates></Point>"
        case .lineString(let line):
            return "<LineString><coordinates>\(coordinates(line))</coordinates></LineString>"
        case .polygon(let rings):
            guard let outer = rings.first else { return nil }
            var element = "<Polygon><outerBoundaryIs><LinearRing><coordinates>"
            element += coordinates(outer)
            element += "</coordinates></LinearRing></outerBoundaryIs>"
            for hole in rings.dropFirst() {
                element += "<innerBoundaryIs><LinearRing><coordinates>"
                element += coordinates(hole)
                element += "</coordinates></LinearRing></innerBoundaryIs>"
            }
            return element + "</Polygon>"
        case .multiPoint(let positions):
            return multi(positions.map { .point($0) })
        case .multiLineString(let lines):
            return multi(lines.map { .lineString($0) })
        case .multiPolygon(let polygons):
            return multi(polygons.map { .polygon($0) })
        case .collection(let geometries):
            return multi(geometries)
        }
    }

    /// XML escaping, applied to every piece of user text that goes into the
    /// document.
    ///
    /// The web builds its KML through the DOM so escaping is structural. This
    /// one builds a string, so the escaping has to be deliberate and total: a
    /// description containing `<` must leave as text, and one unescaped
    /// interpolation would produce a file that no longer parses — or worse,
    /// one that parses into something the user did not write.
    static func escaped(_ text: String) -> String {
        var escaped = ""
        escaped.reserveCapacity(text.count)
        for character in text {
            switch character {
            case "&": escaped += "&amp;"
            case "<": escaped += "&lt;"
            case ">": escaped += "&gt;"
            case "\"": escaped += "&quot;"
            case "'": escaped += "&apos;"
            default: escaped.append(character)
            }
        }
        return escaped
    }
}
