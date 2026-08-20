import Foundation

// MARK: - The pieces a record is made of

// Everything a saved record is built from conforms to `Codable` where it is
// declared, because Swift only synthesises the coding in the file that owns the
// type. What is left here is the one conformance that had to be written by
// hand — and the reminder that these are now a file format: a field renamed in
// GeoCore is a field renamed on somebody's phone.

extension UserMapRecord.Placement: Codable {
    // Written by hand, unlike the rest. Swift's synthesised coding for an enum
    // with associated values names its cases in the file, so a case renamed in
    // source silently stops matching what is already on disk. Naming them here
    // makes that an edit somebody has to make on purpose.
    private enum CodingKeys: String, CodingKey {
        case kind
        case georeference
        case controlPoints
        case method
    }

    private enum Kind: String, Codable {
        case embedded
        case controlPoints
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .embedded:
            self = .embedded(
                try container.decode(
                    RasterProjection.EmbeddedGeoreference.self, forKey: .georeference
                )
            )
        case .controlPoints:
            self = .controlPoints(
                try container.decode([SessionControlPoint].self, forKey: .controlPoints),
                method: try container.decode(GeoreferenceMethod.self, forKey: .method)
            )
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .embedded(let georeference):
            try container.encode(Kind.embedded, forKey: .kind)
            try container.encode(georeference, forKey: .georeference)
        case .controlPoints(let points, let method):
            try container.encode(Kind.controlPoints, forKey: .kind)
            try container.encode(points, forKey: .controlPoints)
            try container.encode(method, forKey: .method)
        }
    }
}

extension PdfImportMetadata.Registration: Codable {
    // By hand for the same reason as `Placement` above: this is a file format
    // now, and a case renamed in source must not quietly stop matching the
    // records already on somebody's phone — which for this type would turn a
    // sheet the file placed into one the user is asked to place again.
    private enum CodingKeys: String, CodingKey {
        case kind
        case frameID
        case label
        case candidates
        case reason
    }

    private enum Kind: String, Codable {
        case embedded
        case selectionRequired
        case manual
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .embedded:
            self = .embedded(
                frameID: try container.decode(String.self, forKey: .frameID),
                label: try container.decodeIfPresent(String.self, forKey: .label),
                candidates: try container.decode(
                    [PdfMapRegistration.Candidate].self, forKey: .candidates
                )
            )
        case .selectionRequired:
            self = .selectionRequired(
                try container.decode(
                    [PdfMapRegistration.Candidate].self, forKey: .candidates
                )
            )
        case .manual:
            self = .manual(
                try container.decode(PdfMapRegistration.ManualReason.self, forKey: .reason)
            )
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .embedded(let frameID, let label, let candidates):
            try container.encode(Kind.embedded, forKey: .kind)
            try container.encode(frameID, forKey: .frameID)
            try container.encodeIfPresent(label, forKey: .label)
            try container.encode(candidates, forKey: .candidates)
        case .selectionRequired(let candidates):
            try container.encode(Kind.selectionRequired, forKey: .kind)
            try container.encode(candidates, forKey: .candidates)
        case .manual(let reason):
            try container.encode(Kind.manual, forKey: .kind)
            try container.encode(reason, forKey: .reason)
        }
    }
}

// MARK: - The document

/// Everything the app knows about the user's own maps, as one saved file.
///
/// The pixels are not here. A record is a few hundred bytes and a preview is
/// megabytes, so the previews are files of their own beside this one, named by
/// record id: a library that has to be rewritten whole every time a slider
/// moves should not carry them.
///
/// The user's own scans never leave the device. Nothing in this document is
/// sent anywhere, and the georeferencing a user works out by hand — which is
/// their research, and can be the valuable part — is theirs alone.
public struct UserMapLibrary: Hashable, Sendable, Codable {
    /// The format this document was written in.
    ///
    /// Present from the first version, because the alternative is a later
    /// version having to guess by sniffing fields. A document from a *newer*
    /// version is not decoded and not overwritten: a downgrade must not
    /// quietly delete the maps a later build saved.
    public var version: Int
    public var maps: [UserMapRecord]

    /// What this build writes, and the highest it reads.
    public static let currentVersion = 1

    public init(version: Int = UserMapLibrary.currentVersion, maps: [UserMapRecord]) {
        self.version = version
        self.maps = maps
    }

    /// Whether this build may read the document.
    public var isReadable: Bool {
        version >= 1 && version <= Self.currentVersion
    }
}
