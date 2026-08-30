import Foundation

/// What kind of file a layer came out of, or that nothing did.
public enum UserVectorSource: String, Hashable, Sendable, Codable, CaseIterable {
    case geoJson = "geojson"
    case kml
    case kmz
    case gpx
    case shapefileZip = "shapefile-zip"
    case drawn
    /// A track recorded on this device — the field-capture contract's
    /// recorded layer, saved with its raw GPX as the original file.
    case recorded
    /// A layer of points placed from the device photo library (bulk EXIF /
    /// PhotoKit placement).
    case photos
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
    /// A track recorded on this device, and when the recording ran. The key
    /// names match the web's `{ kind: "recorded", startedAt, endedAt }` so
    /// the two surfaces' stored records stay mutually readable in shape.
    case recorded(startedAt: Date, endedAt: Date)
    /// Points placed from the device photo library.
    case photos(createdAt: Date, count: Int)

    /// The provenance line a popup shows.
    public var provenanceText: String {
        switch self {
        case .imported(let filename, _): return "From your file \(filename)"
        case .drawn: return "Drawn on this device"
        case .recorded: return CaptureSpec.recordedProvenance
        case .photos(_, let count):
            return "From your photos · \(count) photo\(count == 1 ? "" : "s")"
        }
    }
}

extension UserVectorOrigin: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, filename, importedAt, createdAt, startedAt, endedAt, count
    }

    private enum Kind: String, Codable {
        case imported, drawn, recorded, photos
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
        case .recorded:
            self = .recorded(
                startedAt: try container.decode(Date.self, forKey: .startedAt),
                endedAt: try container.decode(Date.self, forKey: .endedAt)
            )
        case .photos:
            self = .photos(
                createdAt: try container.decode(Date.self, forKey: .createdAt),
                count: try container.decode(Int.self, forKey: .count)
            )
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
        case .recorded(let startedAt, let endedAt):
            try container.encode(Kind.recorded, forKey: .kind)
            try container.encode(startedAt, forKey: .startedAt)
            try container.encode(endedAt, forKey: .endedAt)
        case .photos(let createdAt, let count):
            try container.encode(Kind.photos, forKey: .kind)
            try container.encode(createdAt, forKey: .createdAt)
            try container.encode(count, forKey: .count)
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
    /// The stored copy of the file this layer was imported from, if there is
    /// one.
    ///
    /// Shared by every layer out of the same file, because a zipped shapefile
    /// archive can hold several and one copy of the archive is what the user
    /// gave us. Nil for a drawn layer, which came from no file.
    ///
    /// Kept because the canonical in-app format is GeoJSON, and a conversion is
    /// not the thing it converted: a KML's own styling, a GPX's timestamps and
    /// a shapefile's projection metadata do not survive it. Handing back the
    /// GeoJSON as if it were the file the user imported would be handing them
    /// something they never gave us.
    public var originalFileID: String?

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
        bbox: GeoBoundingBox?,
        originalFileID: String? = nil
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
        self.originalFileID = originalFileID
    }
}

/// The user's vector layers as they are written to disk.
public struct UserVectorLibrary: Hashable, Sendable, Codable {
    public var version: Int
    public var layers: [UserVectorLayerRecord]
    /// Which layers the user has switched off.
    ///
    /// Here rather than on the record, because whether a layer is currently
    /// drawn is a view preference and a record is the evidence: the file it
    /// came from, when, how many features, and where. Persisted at all because
    /// a user who switches off eight of nine layers and reopens the app should
    /// not have to do it again.
    public var hiddenLayerIDs: [String]

    /// Version 3: the `photos` source and origin arrived with the native
    /// photo map. Bumped so a build from before them refuses the document
    /// cleanly (`fromALaterVersion`) instead of decoding an origin kind it
    /// has never heard of and reporting the library as damaged.
    public static let currentVersion = 3

    public init(
        version: Int = UserVectorLibrary.currentVersion,
        layers: [UserVectorLayerRecord],
        hiddenLayerIDs: [String] = []
    ) {
        self.version = version
        self.layers = layers
        self.hiddenLayerIDs = hiddenLayerIDs
    }

    private enum CodingKeys: String, CodingKey {
        case version, layers, hiddenLayerIDs
    }

    /// Decoded by hand only so a library written before visibility was
    /// remembered still reads, with every layer showing.
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decode(Int.self, forKey: .version)
        layers = try container.decode([UserVectorLayerRecord].self, forKey: .layers)
        hiddenLayerIDs =
            try container.decodeIfPresent([String].self, forKey: .hiddenLayerIDs) ?? []
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

extension UserVectorLayerRecord {
    /// Where this layer came from, and whether it still matches.
    ///
    /// An edited layer is no longer the file it was imported from: vertices
    /// have moved, or features the user judged irrelevant are gone. Left as
    /// the filename alone, the row and the callout keep saying "From your
    /// file parcels.kml" over data the municipality never published, and
    /// weeks later there is no way to tell the two apart.
    public var provenanceText: String {
        guard let modifiedAt else { return origin.provenanceText }
        return "\(origin.provenanceText) · edited "
            + modifiedAt.formatted(date: .abbreviated, time: .omitted)
    }
}
