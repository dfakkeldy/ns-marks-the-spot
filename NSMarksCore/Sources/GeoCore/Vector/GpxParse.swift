import Foundation

/// GPX → GeoJSON.
///
/// Waypoints become points and tracks and routes become lines, which is
/// exactly the shape a site visit records: a handful of marked spots and the
/// path walked between them. No extra modelling for waypoints against tracks —
/// the distinction the user cares about is point against line.
public enum GpxParse {
    public static func parse(_ data: Data) throws(UserMapImportRefusal) -> ParsedVector {
        let root = try XmlTree.parse(data)
        var features: [GeoJsonFeature] = []

        for waypoint in root.descendants(named: "wpt") {
            guard let position = position(of: waypoint) else { continue }
            features.append(
                GeoJsonFeature(geometry: .point(position), properties: properties(of: waypoint))
            )
        }

        for route in root.descendants(named: "rte") {
            let line = route.children(named: "rtept").compactMap(position(of:))
            guard line.count >= 2 else { continue }
            features.append(
                GeoJsonFeature(geometry: .lineString(line), properties: properties(of: route))
            )
        }

        for track in root.descendants(named: "trk") {
            let segments = track.children(named: "trkseg")
                .map { $0.children(named: "trkpt").compactMap(position(of:)) }
                .filter { $0.count >= 2 }
            guard !segments.isEmpty else { continue }
            // A paused-and-resumed recording is several segments of one track.
            // Joining them would draw a straight line across the gap the user
            // did not walk.
            let geometry: GeoJsonGeometry =
                segments.count == 1 ? .lineString(segments[0]) : .multiLineString(segments)
            features.append(
                GeoJsonFeature(geometry: geometry, properties: properties(of: track))
            )
        }

        return try UserVectorParse.normalize(features)
    }

    private static func position(of element: XmlElement) -> GeoJsonPosition? {
        guard let lat = element.attributes["lat"].flatMap(Double.init),
              let lng = element.attributes["lon"].flatMap(Double.init)
        else { return nil }
        let elevation = element.firstChild(named: "ele").flatMap { Double($0.trimmedText) }
        return GeoJsonPosition(lng: lng, lat: lat, altitude: elevation)
    }

    /// The descriptive elements GPX carries, under the names the web's
    /// converter gives them.
    ///
    /// `desc` rather than `description` deliberately: that is the key togeojson
    /// emits, and a file imported on one surface has to carry the same
    /// properties as the same file imported on the other. It does mean a GPX
    /// description does not fill the callout's detail line — true on both
    /// surfaces, and a divergence invented here would be worse than a shared
    /// limitation.
    private static func properties(of element: XmlElement) -> [String: JSONValue] {
        var properties: [String: JSONValue] = [:]
        for key in ["name", "cmt", "desc", "src", "sym", "type", "time"] {
            guard let value = element.firstChild(named: key)?.trimmedText, !value.isEmpty
            else { continue }
            properties[key] = .string(value)
        }
        if let link = element.firstChild(named: "link")?.attributes["href"], !link.isEmpty {
            properties["link"] = .string(link)
        }
        return properties
    }
}

/// Which XML map format a file turned out to be.
public enum XmlVectorParse {
    /// Routes by the document's root element rather than by namespace.
    ///
    /// Real exports from consumer GPS units and older desktop tools regularly
    /// omit or misspell the namespace, and refusing those would fail files
    /// that are otherwise perfectly readable.
    public static func parse(
        _ data: Data
    ) throws(UserMapImportRefusal) -> (parsed: ParsedVector, source: UserVectorSource) {
        let root = try XmlTree.parse(data)
        switch root.name.lowercased() {
        case "kml": return (try KmlParse.parse(data), .kml)
        case "gpx": return (try GpxParse.parse(data), .gpx)
        default:
            throw UserMapImportRefusal(
                code: .unsupportedType,
                userMessage: """
                    This XML file isn't KML or GPX — those are the XML map formats \
                    this map reads.
                    """
            )
        }
    }
}
