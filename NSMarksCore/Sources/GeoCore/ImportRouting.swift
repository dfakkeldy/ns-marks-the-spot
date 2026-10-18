import Foundation

/// Which pipeline a file the user brought in belongs to.
///
/// Ported from `web/src/userMaps/importRouting.ts`, where one drop zone serves
/// both pipelines. The panel has two Import buttons rather than a drop zone,
/// but the question is the same one and the answer has to match: a reader who
/// selects six files should not have to know which of them this app calls a
/// map and which it calls data.
public enum ImportRouting {
    public enum Pipeline: String, Hashable, Sendable {
        case raster
        case vector
    }

    /// Content decides the pipeline, never the extension: extensions are
    /// user-editable, and a `.txt` holding GeoJSON is a file this app can draw
    /// while a `.geojson` holding a spreadsheet is not.
    ///
    /// Raster signatures win first because they are exact magic bytes; the
    /// vector probe is a guess at the first printable character and would claim
    /// files it cannot read. Anything neither recognises goes to the raster
    /// pipeline on purpose — its refusals name the file and say what to do
    /// about it, so every file the user chose is reported exactly once.
    public static func pipeline(for data: Data) -> Pipeline {
        if UserMapImport.sniff(data) != .unknown { return .raster }
        if VectorImport.sniff(data) != .unknown { return .vector }
        return .raster
    }
}
