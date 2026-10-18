import Foundation
import NSDataServices
import OSLog

/// Where the Fletcher tile build is hosted.
///
/// Its own type rather than a field in the catalog, because that is what it is:
/// a build setting, not data about the survey. The shared descriptor says so
/// outright — its `serviceURL` is `nil` with the comment that the base URL is
/// runtime configuration — and keeping it here means the catalog stays a
/// parity-checkable constant while the address stays configurable per build.
nonisolated enum FletcherHost {
    /// `nonisolated` because `normalizedBuildSetting` is, and the target
    /// compiles with `-default-isolation=MainActor`, which would otherwise put
    /// this on the main actor and make it unreachable from there. `Logger` is
    /// `Sendable`, so there is nothing to protect.
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "ns-marks-the-spot",
        category: "FletcherHost"
    )

    /// The configured base URL, or `nil` if the build has none.
    ///
    /// `nil` is a real state, not a failure: the sheets are rendered from the
    /// David Rumsey scans by our own pipeline, and until that build is behind an
    /// HTTPS host there is nothing to point at. The Fletcher row still appears —
    /// disabled, with the reason shown — rather than vanishing, because a layer
    /// the app is built around should not silently cease to exist depending on
    /// a build setting the user cannot see.
    ///
    /// A malformed or unsafe value is different, and `normalizeBaseURL` throws
    /// on it. Swallowing that would turn a misconfigured build into a silently
    /// missing feature; it is logged and treated as unhosted, which is the only
    /// safe reading, but the log is what makes it findable.
    ///
    /// The log is `os.Logger` rather than `assertionFailure` because the case
    /// that needs finding is the release build shipped with a bad host, and an
    /// assertion is compiled out of exactly that build.
    static var configuredBaseURL: URL? {
        let configured = [
            Bundle.main.object(forInfoDictionaryKey: "FletcherTileBaseURL") as? String,
            ProcessInfo.processInfo.environment["FLETCHER_TILE_BASE_URL"]
        ]
        .compactMap { $0 }
        .compactMap(normalizedBuildSetting)
        .first

        do {
            return try FletcherTileURL.normalizeBaseURL(configured)
        } catch {
            logger.error("FletcherTileBaseURL is set but unusable: \(String(describing: error))")
            return nil
        }
    }

    /// Drops a build setting that was never substituted, and refuses the one
    /// host this app may never read Fletcher tiles from.
    ///
    /// An unset `$(FLETCHER_TILE_BASE_URL)` reaches the Info.plist as the
    /// literal `$(FLETCHER_TILE_BASE_URL)`, and a placeholder left in a config
    /// file reaches it as `<your-host-here>`. Both are "not configured", not
    /// values to parse.
    ///
    /// The OldMapsOnline refusal is enforced here rather than documented because
    /// the failure mode is a build setting pointed back at the retired source by
    /// someone reaching for the quickest way to make the layer appear — which is
    /// exactly the moment a comment is not read. The David Rumsey permission
    /// recorded in `docs/FLETCHER_GEOREFERENCING.md` covers the scans we render
    /// ourselves and explicitly does not extend to OldMapsOnline-derived tiles,
    /// warps, bounds or endpoints.
    static func normalizedBuildSetting(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              !trimmed.contains("$("),
              !trimmed.hasPrefix("<") else {
            return nil
        }
        guard !trimmed.lowercased().contains("oldmapsonline") else {
            logger.error("Refusing FletcherTileBaseURL: the Rumsey permission does not cover OldMapsOnline-derived tiles")
            return nil
        }
        return trimmed
    }
}
