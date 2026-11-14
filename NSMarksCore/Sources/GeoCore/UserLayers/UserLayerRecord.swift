import Foundation

public struct UserLayerRecord: Codable, Equatable, Identifiable, Sendable {
    public enum Role: String, Codable, Sendable { case base, overlay }
    public struct WMS: Codable, Equatable, Sendable {
        public enum Format: String, Codable, Sendable { case png = "image/png", jpeg = "image/jpeg" }
        public enum Version: String, Codable, Sendable { case v111 = "1.1.1", v130 = "1.3.0" }
        public var layers: String
        public var styles: String
        public var format: Format
        public var version: Version
        public var transparent: Bool
    }
    public struct Acknowledgement: Codable, Equatable, Sendable { public var version: Int; public var at: Date }
    public struct Probe: Codable, Equatable, Sendable { public var display: Bool?; public var corsReadable: Bool?; public var at: Date }
    public let id: UUID
    public var role: Role
    public var name: String
    public var url: UserLayerURL
    public var attribution: String
    public var termsNote: String
    public var termsURL: URL?
    public var minZoom: Int
    public var maxNativeZoom: Int
    public var tileSize: Int
    public var wms: WMS?
    public var arcgisLayers: String?
    public var createdAt: Date
    public var modifiedAt: Date
    public var acknowledgement: Acknowledgement?
    public var probe: Probe?

    public init(id: UUID = UUID(), role: Role = .overlay, name: String, url: UserLayerURL, attribution: String, termsNote: String, now: Date = Date()) {
        self.id = id; self.role = role; self.name = name; self.url = url
        self.attribution = attribution; self.termsNote = termsNote; self.termsURL = nil
        self.minZoom = 0; self.maxNativeZoom = 19; self.tileSize = 256
        self.wms = nil; self.arcgisLayers = nil; self.createdAt = now; self.modifiedAt = now
        self.acknowledgement = nil; self.probe = nil
    }
}

public struct UserLayerArchive: Codable, Equatable, Sendable {
    public static let currentVersion = 1
    public let version: Int
    public var layers: [UserLayerRecord]
    public init(layers: [UserLayerRecord]) { version = Self.currentVersion; self.layers = layers }
    private enum CodingKeys: String, CodingKey { case version, layers }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decode(Int.self, forKey: .version)
        guard version == Self.currentVersion else { throw DecodingError.dataCorruptedError(forKey: .version, in: container, debugDescription: "Unsupported user-layer version") }
        layers = try container.decode([UserLayerRecord].self, forKey: .layers)
    }
}
