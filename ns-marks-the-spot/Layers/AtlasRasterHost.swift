import Foundation
import NSDataServices
import OSLog

/// Where the rendered Atlas tiles are hosted.
///
/// A build setting, like `FletcherHost`, and for the same reason: the tiles
/// are ours and the address is configuration rather than a fact about the
/// map. The catalog pins the revision; this names the host to read it from.
///
/// `nil` is a real state. A build with no host still offers the OpenStreetMap
/// raster the browser falls back to, and the Atlas entries leave the picker
/// rather than sit there drawing nothing — but nothing is substituted under
/// an Atlas credit, because the web's rule is that neither surface quietly
/// swaps one ground for another.
nonisolated enum AtlasRasterHost {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "ns-marks-the-spot",
        category: "AtlasRasterHost"
    )

    /// The configured base URL, or `nil` if the build has none.
    ///
    /// The Info.plist key is substituted from the `ATLAS_TILE_BASE_URL` build
    /// setting. The environment variable is read first, because it exists to
    /// point a build that already carries the published host at a server on
    /// this machine for verification — which `normalizeBaseURL` allows only
    /// on loopback — and an override that lost to the setting would override
    /// nothing. A malformed value is logged and treated as unhosted, as
    /// `FletcherHost` treats its own, so a bad release setting is findable
    /// rather than silent.
    static var configuredBaseURL: URL? {
        let configured = [
            ProcessInfo.processInfo.environment["ATLAS_TILE_BASE_URL"],
            Bundle.main.object(forInfoDictionaryKey: "AtlasTileBaseURL") as? String,
        ]
        .compactMap { $0 }
        .compactMap(FletcherHost.normalizedBuildSetting)
        .first

        do {
            return try AtlasRasterTileURL.normalizeBaseURL(configured)
        } catch {
            logger.error("AtlasTileBaseURL is set but unusable: \(String(describing: error))")
            return nil
        }
    }
}
