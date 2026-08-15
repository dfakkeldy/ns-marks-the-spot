import Foundation

/// Writes a session's control points out as a IIIF Georeference Annotation,
/// and reads one back.
///
/// The format Allmaps uses (<https://iiif.io/api/extension/georef/>), so the
/// work of placing a sheet can leave this app and come back — including from
/// the web map, which writes the same shape.
///
/// Hand-written rather than taken from a package, matching the web, which
/// hand-writes it for the same reason: it is a small fixed document and this
/// is one round trip, not a IIIF implementation.
public enum GeoreferenceAnnotation {
    /// The two contexts the extension requires, in this order.
    public static let context = [
        "http://iiif.io/api/presentation/3/context.json",
        "http://iiif.io/api/extension/georef/1/context.json",
    ]

    public enum Refusal: Error, Equatable, Sendable {
        case notJson
        /// Parses as JSON and is not one of these: a missing body, the wrong
        /// motivation, or no features.
        case notAnAnnotation
        /// A feature without both halves of a control point, or with a
        /// coordinate that is not a number. Refused rather than skipped: a
        /// silently shorter set still solves, and it would place the sheet
        /// from points the user did not check.
        case malformedControlPoint
        /// A transformation this app does not fit. Named rather than
        /// substituted, because reading a second-order polynomial's points as
        /// an affine's would place the sheet with a fit its author rejected.
        case unsupportedTransformation(String)
    }

    /// What a read-back annotation carries.
    public struct Document: Equatable, Sendable {
        public var controlPoints: [SessionControlPoint]
        public var method: GeoreferenceMethod
        /// The scan's own size, as the annotation states it. Always the
        /// original raster, never a preview: the pixel coordinates are in
        /// those pixels, and a mismatch places every point proportionally
        /// wrong with nothing in the arithmetic able to tell.
        public var pixelSize: PixelSize?
        public var target: String?
    }

    // MARK: - Writing

    public static func data(
        controlPoints: [SessionControlPoint],
        method: GeoreferenceMethod,
        pixelSize: PixelSize,
        target: String
    ) throws -> Data {
        let features: [[String: Any]] = controlPoints.map { point in
            [
                "type": "Feature",
                // `resourceCoords` is [x, y] and GeoJSON coordinates are
                // [lng, lat] — opposite orders. Both are pairs of numbers, so
                // getting this backwards produces a document that validates
                // and is wrong.
                "properties": ["resourceCoords": [point.pixel.x, point.pixel.y]],
                "geometry": [
                    "type": "Point",
                    "coordinates": [point.map.lng, point.map.lat],
                ],
            ]
        }
        let transformation: [String: Any] = switch method {
        case .spline: ["type": "thinPlateSpline"]
        case .affine: ["type": "polynomial", "options": ["order": 1]]
        }
        let document: [String: Any] = [
            "@context": context,
            "type": "Annotation",
            "motivation": "georeferencing",
            // A local scan has no IIIF image service and no public address,
            // and the extension has no provision for that. A urn placeholder
            // keeps the document well formed and carries the whole payload; a
            // user who later publishes the scan retargets it by editing this
            // one field.
            "target": [
                "type": "Canvas",
                "id": target,
                "width": pixelSize.width,
                "height": pixelSize.height,
            ],
            "body": [
                "type": "FeatureCollection",
                // On the body, not at the root. At the root it parses as JSON
                // and is silently invalid against the extension.
                "transformation": transformation,
                "features": features,
            ],
        ]
        return try JSONSerialization.data(
            withJSONObject: document, options: [.prettyPrinted, .sortedKeys]
        )
    }

    // MARK: - Reading

    public static func read(_ data: Data) throws(Refusal) -> Document {
        guard let root = try? JSONSerialization.jsonObject(with: data),
              let object = root as? [String: Any]
        else { throw .notJson }

        guard object["motivation"] as? String == "georeferencing",
              let body = object["body"] as? [String: Any],
              let features = body["features"] as? [[String: Any]],
              !features.isEmpty
        else { throw .notAnAnnotation }

        let method = try self.method(from: body["transformation"])
        var points = [SessionControlPoint]()
        for (index, feature) in features.enumerated() {
            let properties = feature["properties"] as? [String: Any]
            let geometry = feature["geometry"] as? [String: Any]
            guard let resource = numbers(properties?["resourceCoords"]), resource.count >= 2,
                  let coordinates = numbers(geometry?["coordinates"]), coordinates.count >= 2
            else { throw .malformedControlPoint }
            points.append(
                SessionControlPoint(
                    id: "gcp-\(index + 1)",
                    pixel: PixelPoint(x: resource[0], y: resource[1]),
                    // [lng, lat], the opposite order from the pixel pair above.
                    map: GeoPoint(lat: coordinates[1], lng: coordinates[0])
                )
            )
        }

        let target = object["target"] as? [String: Any]
        var pixelSize: PixelSize?
        if let width = (target?["width"] as? NSNumber)?.doubleValue,
           let height = (target?["height"] as? NSNumber)?.doubleValue,
           width > 0, height > 0 {
            pixelSize = PixelSize(width: width, height: height)
        }
        return Document(
            controlPoints: points,
            method: method,
            pixelSize: pixelSize,
            target: target?["id"] as? String
        )
    }

    private static func method(from transformation: Any?) throws(Refusal) -> GeoreferenceMethod {
        guard let transformation = transformation as? [String: Any],
              let type = transformation["type"] as? String
        else { throw .notAnAnnotation }
        switch type {
        case "thinPlateSpline":
            return .spline
        case "polynomial":
            let order = (transformation["options"] as? [String: Any])?["order"]
            // Order 1 is the affine this app fits. A higher order is a
            // different surface, and reading its points as an affine's would
            // place the sheet with a fit its author rejected.
            guard (order as? NSNumber)?.intValue ?? 1 == 1 else {
                throw .unsupportedTransformation("polynomial order \(order ?? "?")")
            }
            return .affine
        default:
            throw .unsupportedTransformation(type)
        }
    }

    /// A JSON number pair, refusing anything that is not two numbers —
    /// including a string that looks like one, which is how a spreadsheet
    /// export usually arrives.
    private static func numbers(_ value: Any?) -> [Double]? {
        guard let array = value as? [Any] else { return nil }
        var out = [Double]()
        for element in array {
            guard let number = element as? NSNumber,
                  !(number is NSNull),
                  number.doubleValue.isFinite
            else { return nil }
            out.append(number.doubleValue)
        }
        return out
    }
}
