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
}
