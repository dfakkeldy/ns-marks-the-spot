import Foundation
import MapCatalog

/// Addresses for the rendered Atlas tiles.
///
/// The host is runtime configuration, exactly as it is for the Fletcher
/// sheets: the tiles are ours and sit on the same object host, so the same
/// build setting rules apply — HTTPS, or plain HTTP against loopback for a
/// build served from this machine — and `FletcherTileURL.normalizeBaseURL`
/// already enforces them. Everything after the host is fixed by the package
/// contract `web/scripts/atlasRaster` writes to, so a revision rendered from
/// the web tree is readable here without either side being told twice.
public enum AtlasRasterTileURL {
    /// Validates and canonicalises a configured base URL; `nil` for an absent
    /// value, which is "not hosted" rather than an error.
    public static func normalizeBaseURL(
        _ value: String?
    ) throws(FletcherTileURL.BaseURLError) -> URL? {
        try FletcherTileURL.normalizeBaseURL(value)
    }

    /// `<host>/atlas-raster/<revision>`, the prefix everything else hangs off.
    ///
    /// Built by concatenation rather than with `URL`'s path APIs for the
    /// reason `FletcherTileURL` gives: the receipt and the tiles must share
    /// one prefix, and a normalising API could hand them two.
    public static func packagePrefix(baseURL: URL) -> String {
        "\(baseURL.absoluteString)/\(AtlasRaster.packageDirectory)/\(AtlasRaster.tileRevision)"
    }

    /// The `{z}/{x}/{y}` template for one style, for callers that substitute
    /// the placeholders themselves.
    public static func tileTemplate(style: AtlasRasterStyle, baseURL: URL) -> String {
        "\(packagePrefix(baseURL: baseURL))/\(style.rawValue)/{z}/{x}/{y}.\(AtlasRaster.imageFormat)"
    }

    /// One tile. Non-optional because every component is either validated by
    /// `normalizeBaseURL` or an integer or a fixed word, so there is no
    /// input that makes the string fail to parse.
    public static func tileURL(
        style: AtlasRasterStyle, z: Int, x: Int, y: Int, baseURL: URL
    ) -> URL {
        URL(string: "\(packagePrefix(baseURL: baseURL))/\(style.rawValue)/\(z)/\(x)/\(y).\(AtlasRaster.imageFormat)")!
    }

    /// The stand-in for any address at `z` the package has no tile for —
    /// open water, drawn in the style's own ocean colour by the same renderer.
    public static func oceanTileURL(style: AtlasRasterStyle, z: Int, baseURL: URL) -> URL {
        URL(string: "\(packagePrefix(baseURL: baseURL))/\(style.rawValue)/ocean/\(z).\(AtlasRaster.imageFormat)")!
    }

    /// The receipt describing how this revision was rendered.
    public static func sourceReceiptURL(baseURL: URL) -> URL {
        URL(string: "\(packagePrefix(baseURL: baseURL))/source.json")!
    }
}
