import Foundation

/// KMZ → GeoJSON: a zip with a KML inside it.
public enum KmzParse {
    public static func parse(_ data: Data) throws(UserMapImportRefusal) -> ParsedVector {
        let entries = try ZipArchive.entries(in: data)
        let chosen = try chosenKml(among: entries)
        return try KmlParse.parse(try ZipArchive.contents(of: chosen, in: data))
    }

    /// The most a KML document inside a KMZ may inflate to. Text, not
    /// imagery: sixty-four megabytes of KML is hundreds of thousands of
    /// placemarks, and a document declaring more is asking for the
    /// allocation, not describing a map.
    public static let maxKmlBytes = 64 * 1024 * 1024

    /// Whether the KML entry may be inflated at all, on its declared size.
    public static func acceptsDocument(declaredSize: Int) -> Bool {
        declaredSize >= 0 && declaredSize <= maxKmlBytes
    }

    /// `doc.kml` at the root is the KMZ convention for the document to open;
    /// otherwise the first KML in the archive. Picking arbitrarily among
    /// several would import a different part of the user's file each time.
    /// Refused before inflation when the declared size is past the cap: the
    /// archive-wide limit is on the archive, and a small archive can declare
    /// a document no phone can hold.
    static func chosenKml(among entries: [ZipArchive.Entry]) throws(UserMapImportRefusal) -> ZipArchive.Entry {
        let candidates = entries.filter { entry in
            entry.name.lowercased().hasSuffix(".kml")
                && !entry.name.contains("__MACOSX")
                && !(entry.name.split(separator: "/").last?.hasPrefix("._") ?? false)
        }
        let chosen =
            candidates.first { $0.name.lowercased() == "doc.kml" }
            ?? candidates.first
        guard let chosen else {
            throw UserMapImportRefusal(
                code: .unsupportedType,
                userMessage: """
                    This archive has no KML in it. A KMZ is a zipped KML — export \
                    it again from the app that made it.
                    """
            )
        }
        guard acceptsDocument(declaredSize: chosen.uncompressedSize) else {
            throw UserMapImportRefusal(
                code: .tooLarge,
                userMessage: """
                    The KML inside this archive is over 64 MB once unpacked, which \
                    is more than this app can read. Export a smaller area and \
                    import that.
                    """
            )
        }
        return chosen
    }

    /// A KMZ parse that keeps the archive's other entries — the photo bytes
    /// a field-capture KMZ carries under `files/`. For tests and small
    /// archives; the import path reads assets one at a time through
    /// `AssetSource` and never holds them all.
    public struct WithAssets: Sendable {
        public var parsed: ParsedVector
        /// Non-KML archive entries the document refers to, keyed by the
        /// href as the document wrote it; the source resolved each to the
        /// exact spelling first, then the one case-insensitive match.
        public var assets: [String: Data]
        /// Entries left uninflated: not referenced, over a cap, or unreadable.
        public var skippedEntries: Int

        public init(parsed: ParsedVector, assets: [String: Data], skippedEntries: Int = 0) {
            self.parsed = parsed
            self.assets = assets
            self.skippedEntries = skippedEntries
        }
    }

    /// What reading one named asset came to. Distinct on purpose: an entry
    /// the archive never had, one it had but declared over the cap, and one
    /// it had but could not inflate are three different facts to report.
    public enum AssetRead: Sendable {
        case bytes(Data)
        case missing
        case capped
        case unreadable
        /// Two entries differ only in case and the name matches neither
        /// exactly: nothing is guessed.
        case ambiguous
    }

    /// The archive's non-KML entries, read one at a time by lowercased name.
    /// Nothing is inflated until asked for, one asset is held at a time, and
    /// each is refused on its declared size before a byte is allocated, so a
    /// KMZ cannot put more than one photo's worth of raw bytes in memory.
    public struct AssetSource: Sendable {
        private let data: Data
        /// Entries by their exact name; the first listing of a name wins.
        private let byName: [String: ZipArchive.Entry]
        /// The distinct spellings the archive has under each folded name.
        private let spellings: [String: [String]]
        /// How many entries the document could refer to.
        public let entryCount: Int

        public init(data: Data) throws(UserMapImportRefusal) {
            self.data = data
            let entries = try ZipArchive.entries(in: data)
            let chosen = try KmzParse.chosenKml(among: entries)
            var byName: [String: ZipArchive.Entry] = [:]
            var spellings: [String: [String]] = [:]
            var conflicting = Set<String>()
            for entry in entries where entry.name != chosen.name && !entry.name.contains("__MACOSX") {
                if byName[entry.name] != nil {
                    // One name listed twice is two candidates, whatever the
                    // directory says about them: a checksum and a size are
                    // the archive's claim about itself, and a claim is not
                    // identity. Attaching the first would put one photograph
                    // under a descriptor that may have meant the other, so
                    // neither is attached and the reference is reported as
                    // matching more than one file.
                    conflicting.insert(entry.name)
                    continue
                }
                byName[entry.name] = entry
                spellings[entry.name.lowercased(), default: []].append(entry.name)
            }
            self.byName = byName
            self.spellings = spellings
            self.conflicting = conflicting
            self.entryCount = byName.count
        }

        /// Names under which the archive lists two different files.
        private let conflicting: Set<String>

        /// The entry a document name refers to: its exact spelling when the
        /// archive has it, else the one entry that matches regardless of
        /// case — the documents this app writes are lowercase, and a KMZ
        /// re-saved by a tool that folds case is not broken — else, with two
        /// spellings to choose between and no exact match, nothing.
        public func read(named name: String) -> AssetRead {
            let entry: ZipArchive.Entry
            if let exact = byName[name] {
                guard !conflicting.contains(name) else { return .ambiguous }
                entry = exact
            } else {
                let candidates = spellings[name.lowercased()] ?? []
                guard let only = candidates.first else { return .missing }
                guard candidates.count == 1, let found = byName[only], !conflicting.contains(only)
                else { return .ambiguous }
                entry = found
            }
            guard KmzParse.acceptsAsset(declaredSize: entry.uncompressedSize) else { return .capped }
            guard let bytes = try? ZipArchive.contents(of: entry, in: data) else { return .unreadable }
            // The declaration is checked again against what actually came
            // out: a stored entry cannot lie about it now, and an inflated
            // one is held to its declaration by the inflater.
            guard bytes.count <= PhotoDescriptor.maxFileBytes else { return .capped }
            return .bytes(bytes)
        }
    }

    public static func parseWithAssets(_ data: Data) throws(UserMapImportRefusal) -> WithAssets {
        let parsed = try parse(data)
        let source = try AssetSource(data: data)
        let referenced = referencedAssetNames(in: parsed)
        var assets: [String: Data] = [:]
        var skipped = source.entryCount
        var inflated = 0
        // The same budget as the relink: this whole-archive form is for
        // tests and small files, and must not be the way round the cap.
        for name in referenced.sorted() where inflated < KmzRelink.maxInflatedBytes {
            if case .bytes(let bytes) = source.read(named: name) {
                inflated += bytes.count
                assets[name] = bytes
                skipped -= 1
            }
        }
        return WithAssets(parsed: parsed, assets: assets, skippedEntries: max(skipped, 0))
    }

    /// The archive entries the document's photo descriptors point at, by the
    /// same rule the relink resolves them: the href as written, or
    /// `files/<id>.jpg`. The source settles spelling, exact first.
    static func referencedAssetNames(in parsed: ParsedVector) -> Set<String> {
        var names = Set<String>()
        for feature in parsed.features {
            for descriptor in PhotoDescriptor.readKmz(from: feature.properties) {
                names.insert(descriptor.href ?? "files/\(descriptor.id).jpg")
            }
        }
        return names
    }

    /// One photo's worth is the most any asset may inflate to: the photo cap
    /// the layer would refuse anyway, applied before a byte is allocated.
    /// Whether one non-KML entry may be inflated at all, on what it declares.
    public static func acceptsAsset(declaredSize: Int) -> Bool {
        declaredSize >= 0 && declaredSize <= PhotoDescriptor.maxFileBytes
    }
}
