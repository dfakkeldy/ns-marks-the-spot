import Foundation

/// KMZ → GeoJSON: a zip with a KML inside it.
public enum KmzParse {
    public static func parse(_ data: Data) throws(UserMapImportRefusal) -> ParsedVector {
        let entries = try ZipArchive.entries(in: data)
        let candidates = entries.filter { entry in
            entry.name.lowercased().hasSuffix(".kml")
                && !entry.name.contains("__MACOSX")
                && !(entry.name.split(separator: "/").last?.hasPrefix("._") ?? false)
        }
        // `doc.kml` at the root is the KMZ convention for the document to open;
        // otherwise the first KML in the archive. Picking arbitrarily among
        // several would import a different part of the user's file each time.
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
        return try KmlParse.parse(try ZipArchive.contents(of: chosen, in: data))
    }

    /// A KMZ parse that keeps the archive's other entries — the photo bytes
    /// a field-capture KMZ carries under `files/`.
    public struct WithAssets: Sendable {
        public var parsed: ParsedVector
        /// Non-KML archive entries, keyed by LOWERCASED entry name: KMZs
        /// edited by other tools do not preserve case reliably, so href
        /// resolution is case-insensitive per the interchange profile.
        public var assets: [String: Data]
    }

    public static func parseWithAssets(_ data: Data) throws(UserMapImportRefusal) -> WithAssets {
        let entries = try ZipArchive.entries(in: data)
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
        let parsed = try KmlParse.parse(try ZipArchive.contents(of: chosen, in: data))
        var assets: [String: Data] = [:]
        for entry in entries where entry.name != chosen.name {
            guard !entry.name.contains("__MACOSX") else { continue }
            // An entry that will not decompress is left out rather than
            // refusing the whole file; the relink counts it as missing.
            guard let bytes = try? ZipArchive.contents(of: entry, in: data) else { continue }
            assets[entry.name.lowercased()] = bytes
        }
        return WithAssets(parsed: parsed, assets: assets)
    }
}
