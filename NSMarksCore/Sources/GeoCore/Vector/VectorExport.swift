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

    /// Whether photo descriptors are written. Plain KML omits them and the
    /// img appendix entirely — a lone .kml must never dangle photo
    /// references. The KMZ writer sets `.kmz`, which adds the required href
    /// and the viewer-facing description images.
    enum KmlPhotoMode {
        case omit, kmz
    }

    /// A layer with any parcel-traced feature exports with this note in the
    /// Document description: the coordinates were traced from licence-gated
    /// NSPRD geometry, the caveat is NSPRD's own, and the attribution
    /// obligation travels with the file. Consumers that strip it still keep
    /// the per-feature `nsmts:traced` property. Word-for-word the web's
    /// TRACED_PROVENANCE_NOTE.
    public static let tracedProvenanceNote =
        "Contains boundary coordinates traced from the Nova Scotia Property "
        + "Records Database (NSPRD). \(CaptureSpec.Snap.parcelCaveat) "
        + "Contains information obtained under license from the Province of "
        + "Nova Scotia which is provided without warranty or liability for "
        + "errors or omissions."

    /// Whether anything here was traced off an NSPRD boundary.
    ///
    /// The value the spec declares, not merely the key. An imported file may
    /// carry its own "nsmts:traced"; treating that as a trace would put the
    /// NSPRD note and the Province's attribution on an export the Province had
    /// nothing to do with.
    public static func hasTracedFeatures(_ parsed: ParsedVector) -> Bool {
        parsed.features.contains {
            $0.properties[CaptureSpec.tracedKey]?.stringValue
                == CaptureSpec.tracedParcelValue
        }
    }

    /// The layer as a KML document.
    ///
    /// Styling is deliberately not written back. The simplestyle properties
    /// survive in the GeoJSON export, and a `<Style>` block that got the
    /// colours slightly wrong would misrepresent the layer in whatever tool
    /// opens it more than an absent one does.
    public static func kml(layerName: String, parsed: ParsedVector) -> String {
        kmlDocument(layerName: layerName, parsed: parsed, photoMode: .omit)
    }

    static func kmlDocument(
        layerName: String, parsed: ParsedVector, photoMode: KmlPhotoMode
    ) -> String {
        var body = ""
        for feature in parsed.features {
            guard let geometry = feature.geometry, let element = kmlGeometry(geometry) else {
                continue
            }
            let descriptors = photoMode == .kmz
                ? PhotoDescriptor.read(from: feature.properties) : []
            var placemark = "<Placemark>"
            if let name = feature.properties["name"]?.stringValue, !name.isEmpty {
                placemark += "<name>\(escaped(name))</name>"
            }
            let description = feature.properties["description"]?.stringValue ?? ""
            if !descriptors.isEmpty {
                // CDATA per the contract profile: the user's text, a blank
                // line, then one viewer-facing img per photo so Google Earth
                // renders them from the archive. Import strips exactly the
                // img tags whose src begins with the photo directory.
                let imgTags = descriptors.map { descriptor in
                    "<img src=\"\(descriptor.kmzHref)\" "
                        + "width=\"\(CaptureSpec.Kmz.descriptionImgWidth)\"/>"
                }.joined()
                let text = description.isEmpty ? imgTags : "\(description)\n\n\(imgTags)"
                placemark += "<description><![CDATA[\(cdataSafe(text))]]></description>"
            } else if !description.isEmpty {
                placemark += "<description>\(escaped(description))</description>"
            }
            placemark += extendedData(
                feature.properties,
                kmzDescriptors: photoMode == .kmz ? descriptors : nil
            )
            placemark += element + "</Placemark>"
            body += placemark
        }
        let documentDescription = hasTracedFeatures(parsed)
            ? "<description>\(escaped(tracedProvenanceNote))</description>" : ""
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <kml xmlns="http://www.opengis.net/kml/2.2"><Document>\
            <name>\(escaped(layerName))</name>\(documentDescription)\(body)</Document></kml>
            """
    }

    /// ExtendedData carries every property except the ones with their own
    /// KML homes (`name`, `description`), togeojson's per-vertex
    /// `coordinateProperties` (times are a GPX/GeoJSON concern per the
    /// contract), and `nsmts:photos` (whose KMZ form is passed in by the KMZ
    /// writer; plain KML must not carry dangling photo references). All
    /// other `nsmts:` keys ARE written — a parcel-traced or recorded feature
    /// keeps its provenance through a KML round trip. KML is string-typed:
    /// numbers and booleans stringify, objects ride as JSON text, and nulls
    /// are skipped; GeoJSON stays the type-faithful format.
    private static func extendedData(
        _ properties: [String: JSONValue], kmzDescriptors: [PhotoDescriptor]?
    ) -> String {
        let excluded: Set<String> = [
            "name", "description", "coordinateProperties", CaptureSpec.photosKey,
        ]
        // Sorted for deterministic output; KML carries no ordering meaning.
        let entries = properties
            .filter { !excluded.contains($0.key) && $0.value != .null }
            .sorted { $0.key < $1.key }
        let descriptors = kmzDescriptors ?? []
        guard !entries.isEmpty || !descriptors.isEmpty else { return "" }
        var element = "<ExtendedData>"
        for (key, value) in entries {
            element += "<Data name=\"\(escaped(key))\"><value>"
            element += escaped(stringified(value))
            element += "</value></Data>"
        }
        if !descriptors.isEmpty {
            let json = stringified(.array(descriptors.map(\.kmzValue)))
            element += "<Data name=\"\(escaped(CaptureSpec.photosKey))\"><value>"
            element += escaped(json)
            element += "</value></Data>"
        }
        return element + "</ExtendedData>"
    }

    /// The KML string form of a property value: strings as they are, scalars
    /// the way JSON writes them, structures as JSON text.
    private static func stringified(_ value: JSONValue) -> String {
        switch value {
        case .string(let text):
            return text
        case .bool(let flag):
            return flag ? "true" : "false"
        case .number(let number):
            return JSONValue.text(forNumber: number)
        case .null:
            return ""
        case .array, .object:
            // Slashes unescaped so `files/p1.jpg` reads as written; sorted
            // keys so the same layer always writes the same document.
            guard let data = try? JSONSerialization.data(
                withJSONObject: value.jsonObject,
                options: [.sortedKeys, .withoutEscapingSlashes]
            ) else { return "" }
            return String(data: data, encoding: .utf8) ?? ""
        }
    }

    /// CDATA cannot contain its own terminator. The standard split keeps the
    /// user's text intact through any conforming parser.
    private static func cdataSafe(_ text: String) -> String {
        text.replacingOccurrences(of: "]]>", with: "]]]]><![CDATA[>")
    }

    // MARK: - KMZ

    public struct KmzExport: Sendable {
        public var data: Data
        public var photosEmbedded: Int
        /// Descriptors whose bytes could not be supplied — dropped from the
        /// written document entirely (no Data entry, no img tag): a KMZ must
        /// never dangle a photo reference. The caller reports the count.
        public var photosMissing: Int
    }

    /// KMZ per the field-capture interchange profile: `doc.kml`
    /// (DEFLATE-compressed) plus one STORED `files/<photoId>.jpg` per
    /// attached photo. Nil only when the zip writer refuses, which the
    /// photo caps make unreachable.
    public static func kmz(
        layerName: String, parsed: ParsedVector, photos: [String: Data]
    ) -> KmzExport? {
        var photosMissing = 0
        let writable = ParsedVector(
            features: parsed.features.map { feature in
                let descriptors = PhotoDescriptor.read(from: feature.properties)
                guard !descriptors.isEmpty else { return feature }
                let present = descriptors.filter { photos[$0.id] != nil }
                photosMissing += descriptors.count - present.count
                guard present.count != descriptors.count else { return feature }
                var copy = feature
                if present.isEmpty {
                    copy.properties.removeValue(forKey: CaptureSpec.photosKey)
                } else {
                    copy.properties[CaptureSpec.photosKey] =
                        PhotoDescriptor.propertyValue(internalForm: present)
                }
                return copy
            },
            bbox: parsed.bbox
        )

        var entries: [ZipArchive.WriteEntry] = [
            ZipArchive.WriteEntry(
                name: CaptureSpec.Kmz.docEntry,
                data: Data(
                    kmlDocument(layerName: layerName, parsed: writable, photoMode: .kmz).utf8
                ),
                compress: true
            )
        ]
        var embedded = Set<String>()
        for feature in writable.features {
            for descriptor in PhotoDescriptor.read(from: feature.properties)
            where !embedded.contains(descriptor.id) {
                guard let bytes = photos[descriptor.id] else { continue }
                embedded.insert(descriptor.id)
                entries.append(
                    ZipArchive.WriteEntry(
                        name: descriptor.kmzHref, data: bytes, compress: false
                    )
                )
            }
        }
        guard let data = ZipArchive.archive(entries) else { return nil }
        return KmzExport(
            data: data, photosEmbedded: embedded.count, photosMissing: photosMissing
        )
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
