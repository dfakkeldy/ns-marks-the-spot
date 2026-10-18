import Foundation

/// Deciding what a user's file is, and reading it.
///
/// Content decides the pipeline, never the extension: extensions are
/// user-editable, and a `.txt` holding GeoJSON is a file this app can draw
/// while a `.geojson` holding a spreadsheet is not.
public enum VectorImport {
    /// What the bytes look like, before any parser has been asked.
    ///
    /// "Candidate" because the parser is the authority — a file that starts
    /// with `{` may still fail to be GeoJSON.
    public enum Sniffed: String, Hashable, Sendable {
        case geoJsonCandidate
        case zip
        case xmlCandidate
        case unknown
    }

    /// One file, read.
    public struct Imported: Hashable, Sendable {
        public var layers: [ShapefileParse.Layer]
        public var source: UserVectorSource
    }

    private static let whitespace: Set<UInt8> = [0x20, 0x09, 0x0a, 0x0d]

    /// The size past which a vector file is refused before anything reads it.
    ///
    /// Well below the raster 500 MB cap on purpose, and the same 50 MB the web
    /// uses: a raster is downsampled into one preview, while every vector
    /// vertex is drawn and hit-tested as it came. A 50 MB GeoJSON is already
    /// millions of vertices, which is past what a phone will draw at any frame
    /// rate the user would call a map.
    public static let hardLimitBytes = 50 * 1024 * 1024

    /// What a vector file past the limit is told, wherever the size is noticed.
    public static let tooLargeMessage = """
        This file is over 50 MB, which is more than can be drawn \
        interactively. Export a smaller extract and import it again.
        """

    public static func checkFileSize(_ bytes: Int) throws(UserMapImportRefusal) {
        guard bytes <= hardLimitBytes else {
            throw UserMapImportRefusal(code: .tooLarge, userMessage: tooLargeMessage)
        }
    }

    /// Text formats carry no magic bytes, so this probes the first printable
    /// character instead: `{` can only start a JSON document and `<` an XML
    /// one.
    public static func sniff(_ data: Data) -> Sniffed {
        let bytes = [UInt8](data.prefix(4096))
        if bytes.count >= 4, bytes[0] == 0x50, bytes[1] == 0x4b, bytes[2] == 0x03,
           bytes[3] == 0x04
        {
            return .zip
        }
        var index = 0
        // A UTF-8 byte-order mark is invisible to the user and would otherwise
        // make their GeoJSON unrecognisable.
        if bytes.count >= 3, bytes[0] == 0xef, bytes[1] == 0xbb, bytes[2] == 0xbf {
            index = 3
        }
        while index < bytes.count, whitespace.contains(bytes[index]) {
            index += 1
        }
        guard index < bytes.count else { return .unknown }
        if bytes[index] == 0x7b { return .geoJsonCandidate }
        if bytes[index] == 0x3c { return .xmlCandidate }
        return .unknown
    }

    /// Reads a vector file, whatever of the accepted formats it turns out to
    /// be.
    ///
    /// Layers rather than one layer because a zipped shapefile archive can
    /// hold several, and collapsing them would mix unrelated feature sets
    /// under one name and one colour.
    public static func read(
        _ data: Data, filename: String
    ) throws(UserMapImportRefusal) -> Imported {
        try Self.checkFileSize(data.count)
        let stem = Self.stem(of: filename)
        switch sniff(data) {
        case .geoJsonCandidate:
            return Imported(
                layers: [
                    ShapefileParse.Layer(
                        name: stem, parsed: try UserVectorParse.parseGeoJson(data), note: nil
                    )
                ],
                source: .geoJson
            )
        case .xmlCandidate:
            let routed = try XmlVectorParse.parse(data)
            return Imported(
                layers: [ShapefileParse.Layer(name: stem, parsed: routed.parsed, note: nil)],
                source: routed.source
            )
        case .zip:
            let names = try ZipArchive.entries(in: data).map(\.name)
            switch ZipArchive.classify(entryNames: names) {
            case .kmz:
                return Imported(
                    layers: [
                        ShapefileParse.Layer(
                            name: stem, parsed: try KmzParse.parse(data), note: nil
                        )
                    ],
                    source: .kmz
                )
            case .shapefile:
                return Imported(layers: try ShapefileParse.parse(zip: data), source: .shapefileZip)
            case .unknown:
                throw UserMapImportRefusal(
                    code: .unsupportedType,
                    userMessage: """
                        This archive holds neither a KML nor a shapefile. Import a \
                        KMZ, or a zipped shapefile with all of its sidecar files.
                        """
                )
            }
        case .unknown:
            throw UserMapImportRefusal(
                code: .unsupportedType,
                userMessage: """
                    This is not a map file this app can read. Import GeoJSON, KML, \
                    KMZ, GPX, or a zipped shapefile.
                    """
            )
        }
    }

    /// The file's name without its extension, which is what a layer is called
    /// until the user renames it.
    static func stem(of filename: String) -> String {
        let base = filename.split(separator: "/").last.map(String.init) ?? filename
        guard let dot = base.lastIndex(of: "."), dot != base.startIndex else { return base }
        return String(base[base.startIndex..<dot])
    }
}
