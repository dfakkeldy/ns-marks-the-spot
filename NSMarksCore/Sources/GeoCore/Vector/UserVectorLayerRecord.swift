import Foundation

/// What kind of file a layer came out of, or that nothing did.
public enum UserVectorSource: String, Hashable, Sendable, Codable, CaseIterable {
    case geoJson = "geojson"
    case kml
    case kmz
    case gpx
    case shapefileZip = "shapefile-zip"
    case drawn
}

/// Where a layer came from, kept for the life of the record.
///
/// Rendered wherever the layer is, so user-loaded material announces itself
/// and is never read as an official record. An imported layer names the file
/// it arrived in; a drawn one names the device-local act that made it. This is
/// the distinction the map exists to preserve: everything catalogued has a
/// published provenance, and these two do not.
public enum UserVectorOrigin: Hashable, Sendable {
    case imported(filename: String, importedAt: Date)
    case drawn(createdAt: Date)

    /// The provenance line a popup shows.
    public var provenanceText: String {
        switch self {
        case .imported(let filename, _): return "From your file \(filename)"
        case .drawn: return "Drawn on this device"
        }
    }
}

extension UserVectorOrigin: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, filename, importedAt, createdAt
    }

    private enum Kind: String, Codable {
        case imported, drawn
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .imported:
            self = .imported(
                filename: try container.decode(String.self, forKey: .filename),
                importedAt: try container.decode(Date.self, forKey: .importedAt)
            )
        case .drawn:
            self = .drawn(createdAt: try container.decode(Date.self, forKey: .createdAt))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .imported(let filename, let importedAt):
            try container.encode(Kind.imported, forKey: .kind)
            try container.encode(filename, forKey: .filename)
            try container.encode(importedAt, forKey: .importedAt)
        case .drawn(let createdAt):
            try container.encode(Kind.drawn, forKey: .kind)
            try container.encode(createdAt, forKey: .createdAt)
        }
    }
}

/// One of the user's own vector layers, as the app remembers it.
///
/// The geometry is not in here. A record is small enough to list a panel from;
/// ten thousand features are not, and loading every layer's geometry to draw a
/// row of switches would stall the panel on the largest file the user ever
/// imported.
public struct UserVectorLayerRecord: Identifiable, Hashable, Sendable, Codable {
    public var id: String
    public var name: String
    public var source: UserVectorSource
    public var origin: UserVectorOrigin
    public var createdAt: Date
    public var modifiedAt: Date?
    /// Bumped by an edit. The rendered layer keys off it, so a change to the
    /// geometry redraws rather than leaving the old shape on screen.
    public var revision: Int
    /// The layer default. Per-feature simplestyle properties win over it.
    public var colorHex: String
    public var featureCount: Int
    /// Nil when nothing in the layer has a position.
    public var bbox: GeoBoundingBox?

    public init(
        id: String,
        name: String,
        source: UserVectorSource,
        origin: UserVectorOrigin,
        createdAt: Date,
        modifiedAt: Date? = nil,
        revision: Int = 1,
        colorHex: String,
        featureCount: Int,
        bbox: GeoBoundingBox?
    ) {
        self.id = id
        self.name = name
        self.source = source
        self.origin = origin
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.revision = revision
        self.colorHex = colorHex
        self.featureCount = featureCount
        self.bbox = bbox
    }
}

/// The user's vector layers as they are written to disk.
public struct UserVectorLibrary: Hashable, Sendable, Codable {
    public var version: Int
    public var layers: [UserVectorLayerRecord]

    public static let currentVersion = 1

    public init(version: Int = UserVectorLibrary.currentVersion, layers: [UserVectorLayerRecord]) {
        self.version = version
        self.layers = layers
    }

    /// Whether this build should touch the document at all.
    ///
    /// A document from a later version is left exactly as it is. Reading what
    /// this build understands and saving that back would drop whatever the
    /// later one added, and the user would never be told.
    public var isReadable: Bool {
        version >= 1 && version <= Self.currentVersion
    }
}
