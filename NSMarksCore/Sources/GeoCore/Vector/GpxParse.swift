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
                .map { segment in
                    segment.children(named: "trkpt").compactMap { trkpt -> TrackVertex? in
                        guard let position = position(of: trkpt) else { return nil }
                        return TrackVertex(position: position, time: time(of: trkpt))
                    }
                }
                .filter { $0.count >= 2 }
            guard !segments.isEmpty else { continue }
            // A paused-and-resumed recording is several segments of one track.
            // Joining them would draw a straight line across the gap the user
            // did not walk.
            let lines = segments.map { $0.map(\.position) }
            let geometry: GeoJsonGeometry =
                segments.count == 1 ? .lineString(lines[0]) : .multiLineString(lines)
            var trackProperties = properties(of: track)
            // Per-vertex trkpt times ride `coordinateProperties.times` in the
            // togeojson convention, parallel to `coordinates` (array of
            // arrays for MultiLineString), so a field recording exported on
            // either surface reimports with its times intact. A point with no
            // time is null rather than dropped — dropping it would break the
            // parallelism the arrays exist for — and a track with no times at
            // all writes nothing rather than an array of nulls.
            let timeSegments = segments.map { $0.map(\.time) }
            if timeSegments.contains(where: { $0.contains { $0 != .null } }) {
                let times: JSONValue =
                    segments.count == 1
                    ? .array(timeSegments[0])
                    : .array(timeSegments.map { JSONValue.array($0) })
                trackProperties["coordinateProperties"] = .object(["times": times])
            }
            features.append(
                GeoJsonFeature(geometry: geometry, properties: trackProperties)
            )
        }

        return try UserVectorParse.normalize(features)
    }

    /// One trkpt: where it is, and when it was fixed if the file says.
    private struct TrackVertex {
        var position: GeoJsonPosition
        var time: JSONValue
    }

    /// The trkpt's own `<time>` as a string, or null. Kept as text rather
    /// than parsed into a date: the value is the file's claim, and rewriting
    /// it through a date type would change bytes the app has no reason to
    /// touch.
    private static func time(of element: XmlElement) -> JSONValue {
        guard let text = element.firstChild(named: "time")?.trimmedText, !text.isEmpty else {
            return .null
        }
        return .string(text)
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
