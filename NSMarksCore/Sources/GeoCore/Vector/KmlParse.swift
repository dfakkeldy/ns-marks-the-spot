import Foundation

/// KML → GeoJSON.
///
/// The web gets this from togeojson. There is no equivalent to depend on here
/// and adding one is not worth a dependency, so it is written out: placemarks
/// become features, and authored KML styles become the same simplestyle
/// properties `VectorStyle` already reads, so an imported KML keeps the look
/// its author gave it on both surfaces.
public enum KmlParse {
    public static func parse(_ data: Data) throws(UserMapImportRefusal) -> ParsedVector {
        let root = try XmlTree.parse(data)
        let styles = styleTable(in: root)
        var features: [GeoJsonFeature] = []
        for placemark in root.descendants(named: "Placemark") {
            guard let feature = feature(from: placemark, styles: styles) else { continue }
            features.append(feature)
        }
        return try UserVectorParse.normalize(features)
    }

    // MARK: - Placemarks

    private static func feature(
        from placemark: XmlElement, styles: [String: [String: JSONValue]]
    ) -> GeoJsonFeature? {
        guard let geometry = geometry(in: placemark) else { return nil }
        var properties: [String: JSONValue] = [:]

        if let name = text(placemark.firstChild(named: "name")) {
            properties["name"] = .string(name)
        }
        // Kept exactly as authored. Google Earth writes HTML descriptions as a
        // matter of course; nothing downstream renders a property as markup,
        // so the markup stays text the user can read rather than being
        // stripped into a different sentence.
        if let description = text(placemark.firstChild(named: "description")) {
            properties["description"] = .string(description)
        }
        for data in placemark.descendants(named: "Data") {
            guard let key = data.attributes["name"],
                  let value = text(data.firstChild(named: "value"))
            else { continue }
            properties[key] = .string(value)
        }
        for data in placemark.descendants(named: "SimpleData") {
            guard let key = data.attributes["name"], let value = text(data) else { continue }
            properties[key] = .string(value)
        }

        // An inline style outranks a referenced one, which is the order a KML
        // reader applies them in.
        if let reference = text(placemark.firstChild(named: "styleUrl")) {
            let key = reference.hasPrefix("#") ? String(reference.dropFirst()) : reference
            for (name, value) in styles[key] ?? [:] { properties[name] = value }
        }
        if let inline = placemark.firstChild(named: "Style") {
            for (name, value) in simplestyle(from: inline) { properties[name] = value }
        }

        return GeoJsonFeature(id: placemark.attributes["id"], geometry: geometry, properties: properties)
    }

    private static func geometry(in element: XmlElement) -> GeoJsonGeometry? {
        var parts: [GeoJsonGeometry] = []
        for child in element.children {
            switch child.name {
            case "Point":
                if let position = positions(in: child).first { parts.append(.point(position)) }
            case "LineString":
                let line = positions(in: child)
                if line.count >= 2 { parts.append(.lineString(line)) }
            case "LinearRing":
                let ring = positions(in: child)
                if ring.count >= 4 { parts.append(.polygon([ring])) }
            case "Polygon":
                if let polygon = polygon(in: child) { parts.append(polygon) }
            case "MultiGeometry":
                if let nested = geometry(in: child) { parts.append(nested) }
            case "Track", "MultiTrack":
                // gx:Track writes its positions one element at a time rather
                // than in a coordinates block. A track read as empty would
                // drop a recorded walk silently.
                let line = trackPositions(in: child)
                if line.count >= 2 { parts.append(.lineString(line)) }
            default:
                continue
            }
        }
        if parts.count == 1 { return parts[0] }
        return parts.isEmpty ? nil : .collection(parts)
    }

    private static func polygon(in element: XmlElement) -> GeoJsonGeometry? {
        var rings: [[GeoJsonPosition]] = []
        for boundary in element.children(named: "outerBoundaryIs")
            + element.children(named: "innerBoundaryIs")
        {
            for ring in boundary.descendants(named: "LinearRing") {
                let positions = positions(in: ring)
                if positions.count >= 4 { rings.append(positions) }
            }
        }
        guard !rings.isEmpty else { return nil }
        return .polygon(rings)
    }

    private static func trackPositions(in element: XmlElement) -> [GeoJsonPosition] {
        element.descendants(named: "coord").compactMap { coord in
            let parts = coord.trimmedText.split(whereSeparator: \.isWhitespace).compactMap(
                { Double($0) })
            guard parts.count >= 2 else { return nil }
            return GeoJsonPosition(
                lng: parts[0], lat: parts[1], altitude: parts.count > 2 ? parts[2] : nil
            )
        }
    }

    /// KML writes a whole coordinate list in one element: `lon,lat[,alt]`
    /// tuples separated by whitespace.
    ///
    /// A tuple that does not parse is dropped rather than refusing the file.
    /// Real exports carry stray tokens, and losing one vertex of a boundary is
    /// visible on the map, while refusing the file leaves the user with
    /// nothing and no way to see what was wrong.
    static func positions(in element: XmlElement) -> [GeoJsonPosition] {
        guard let block = element.descendants(named: "coordinates").first
                ?? (element.name == "coordinates" ? element : nil)
        else { return [] }
        return block.text.split(whereSeparator: \.isWhitespace).compactMap { tuple in
            let parts = tuple.split(separator: ",", omittingEmptySubsequences: false)
            guard parts.count >= 2,
                  let lng = Double(parts[0]), let lat = Double(parts[1])
            else { return nil }
            let altitude = parts.count > 2 ? Double(parts[2]) : nil
            return GeoJsonPosition(lng: lng, lat: lat, altitude: altitude)
        }
    }

    // MARK: - Styles

    /// Every `<Style id="…">` in the document, plus the `<StyleMap>` entries
    /// that point at one, flattened to simplestyle properties.
    private static func styleTable(in root: XmlElement) -> [String: [String: JSONValue]] {
        var table: [String: [String: JSONValue]] = [:]
        for style in root.descendants(named: "Style") {
            guard let id = style.attributes["id"] else { continue }
            table[id] = simplestyle(from: style)
        }
        // A StyleMap is a pair of states; the normal one is what the map draws.
        for map in root.descendants(named: "StyleMap") {
            guard let id = map.attributes["id"] else { continue }
            for pair in map.children(named: "Pair") {
                guard text(pair.firstChild(named: "key")) == "normal",
                      let reference = text(pair.firstChild(named: "styleUrl"))
                else { continue }
                let key = reference.hasPrefix("#") ? String(reference.dropFirst()) : reference
                if let resolved = table[key] { table[id] = resolved }
            }
        }
        return table
    }

    private static func simplestyle(from style: XmlElement) -> [String: JSONValue] {
        var properties: [String: JSONValue] = [:]
        if let line = style.firstChild(named: "LineStyle") {
            if let color = color(text(line.firstChild(named: "color"))) {
                properties["stroke"] = .string(color.hex)
                properties["stroke-opacity"] = .number(color.opacity)
            }
            if let width = text(line.firstChild(named: "width")).flatMap(Double.init) {
                properties["stroke-width"] = .number(width)
            }
        }
        if let poly = style.firstChild(named: "PolyStyle"),
           let color = color(text(poly.firstChild(named: "color")))
        {
            properties["fill"] = .string(color.hex)
            properties["fill-opacity"] = .number(color.opacity)
        }
        if let icon = style.firstChild(named: "IconStyle"),
           let color = color(text(icon.firstChild(named: "color")))
        {
            properties["marker-color"] = .string(color.hex)
        }
        return properties
    }

    /// KML colours are `aabbggrr` — alpha first and the channels reversed from
    /// every other hex colour in this app. Read in KML's order and written in
    /// CSS's, because a straight copy across gives a blue boundary a red one.
    static func color(_ raw: String?) -> (hex: String, opacity: Double)? {
        guard let raw else { return nil }
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count == 8, text.allSatisfy(\.isHexDigit) else { return nil }
        let digits = Array(text)
        func byte(_ index: Int) -> String { String(digits[index...(index + 1)]) }
        guard let alpha = UInt8(byte(0), radix: 16) else { return nil }
        return ("#\(byte(6))\(byte(4))\(byte(2))".lowercased(), Double(alpha) / 255)
    }

    private static func text(_ element: XmlElement?) -> String? {
        guard let value = element?.trimmedText, !value.isEmpty else { return nil }
        return value
    }
}
