import Foundation

/// Photo attachments per the field-capture contract. The portable side is
/// the `nsmts:photos` feature property: an array of descriptors that travels
/// through GeoJSON round trips and, in KMZ form, gains a required
/// `href: "files/<id>.jpg"`. The device side is a pair of JPEG files under
/// the store directory. Parsers here are strict-but-tolerant the way the
/// contract pins: unknown fields are ignored, missing optionals are fine,
/// and a malformed value is treated as an opaque user attribute — never
/// interpreted as photos.
/// Mirrors `web/src/userMaps/vector/photos/types.ts`.
public struct PhotoDescriptor: Hashable, Sendable {
    public var id: String
    /// EXIF `DateTimeOriginal` (web) or the asset's creation date (iOS);
    /// never invented.
    public var capturedAt: String?
    public var sourceName: String?
    public var width: Double?
    public var height: Double?
    /// KMZ form only: `files/<id>.jpg`. Export adds it, import resolves it
    /// against the archive and strips it while re-minting ids.
    public var href: String?

    public init(
        id: String,
        capturedAt: String? = nil,
        sourceName: String? = nil,
        width: Double? = nil,
        height: Double? = nil,
        href: String? = nil
    ) {
        self.id = id
        self.capturedAt = capturedAt
        self.sourceName = sourceName
        self.width = width
        self.height = height
        self.href = href
    }

    /// Contract caps; refusal messages name them.
    public static let maxPerFeature = 20
    public static let maxPerLayer = 500
    public static let maxFileBytes = 50 * 1024 * 1024

    public var kmzHref: String {
        "\(CaptureSpec.Kmz.photoDir)\(id).jpg"
    }

    private static func fromValue(_ value: JSONValue) -> PhotoDescriptor? {
        guard case .object(let object) = value,
              let id = object["id"]?.stringValue, !id.isEmpty,
              // An id is a filename stem, never a path. A foreign file can
              // carry any string here, and the store builds file paths from
              // the id — a path-shaped id (`files/IMG_1.jpg`) would trap its
              // precondition. All-or-nothing, like the rest of this parser:
              // the value then renders as an opaque attribute.
              !id.contains("/"), !id.contains("\\"), !id.contains("..")
        else { return nil }
        return PhotoDescriptor(
            id: id,
            capturedAt: object["capturedAt"]?.stringValue,
            sourceName: object["sourceName"]?.stringValue,
            width: object["width"]?.doubleValue,
            height: object["height"]?.doubleValue,
            href: object["href"]?.stringValue
        )
    }

    /// The descriptors on a feature, or `[]` when absent or malformed.
    /// All-or-nothing on malformed entries: a half-valid array would
    /// attribute the wrong photos to a feature, which is worse than
    /// attributing none — the malformed value then renders as an opaque
    /// attribute instead.
    public static func read(from properties: [String: JSONValue]) -> [PhotoDescriptor] {
        guard case .array(let raw)? = properties[CaptureSpec.photosKey] else { return [] }
        var descriptors: [PhotoDescriptor] = []
        for entry in raw {
            guard let descriptor = fromValue(entry) else { return [] }
            descriptors.append(descriptor)
        }
        return descriptors
    }

    /// The KMZ-side reader: ExtendedData values come back from the KML
    /// parser as STRINGS, so the property may be a JSON string rather than
    /// an array. Same all-or-nothing tolerance.
    public static func readKmz(from properties: [String: JSONValue]) -> [PhotoDescriptor] {
        guard case .string(let raw)? = properties[CaptureSpec.photosKey] else {
            return read(from: properties)
        }
        guard let parsed = try? JSONSerialization.jsonObject(with: Data(raw.utf8)),
              let value = JSONValue.from(parsed),
              case .array = value
        else { return [] }
        return read(from: [CaptureSpec.photosKey: value])
    }

    /// The internal form written into feature properties: no `href`, and
    /// both dimensions always written when known (parsers treat them as
    /// optional).
    public var internalValue: JSONValue {
        var object: [String: JSONValue] = ["id": .string(id)]
        if let capturedAt { object["capturedAt"] = .string(capturedAt) }
        if let sourceName { object["sourceName"] = .string(sourceName) }
        if let width { object["width"] = .number(width) }
        if let height { object["height"] = .number(height) }
        return .object(object)
    }

    /// The KMZ form: the internal object plus the required href.
    public var kmzValue: JSONValue {
        guard case .object(var object) = internalValue else { return internalValue }
        object["href"] = .string(kmzHref)
        return .object(object)
    }

    public static func propertyValue(internalForm descriptors: [PhotoDescriptor]) -> JSONValue {
        .array(descriptors.map(\.internalValue))
    }
}
