import Foundation
import GeoCore
import MapCatalog

/// Addresses for the Fletcher historical sheets, ported from
/// `web/src/layers/fletcherLayer.ts`.
///
/// The base URL is runtime configuration rather than catalog data, because the
/// tiles are ours to host and the host is not settled. Everything else about
/// the address — the revision segment, the sheet padding, the `{z}/{x}/{y}`
/// layout — is fixed and shared with the web, so a set of tiles built for one
/// surface is readable by the other.
public enum FletcherTileURL {
    /// Why a configured base URL was rejected.
    public enum BaseURLError: Error, Equatable, Sendable {
        case notAURL
        /// Anything but HTTPS, outside local development.
        case insecureScheme
        /// OldMapsOnline, which is not ours to redistribute from.
        case disallowedSource
        /// Credentials, query or fragment — state that has no business in a
        /// tile template.
        case carriesQueryState
    }

    /// Validates and canonicalises a configured base URL.
    ///
    /// Returns `nil` for an absent or empty value, which is the "not hosted
    /// yet" case and not an error: the layer simply does not draw. A malformed
    /// or unsafe value throws, because silently falling back to no tiles would
    /// hide a misconfigured build.
    public static func normalizeBaseURL(_ value: String?) throws(BaseURLError) -> URL? {
        guard var trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty
        else { return nil }
        while trimmed.hasSuffix("/") {
            trimmed.removeLast()
        }
        guard !trimmed.isEmpty else { return nil }

        guard var components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              // `URLComponents` reports an empty string, not nil, for a host-
              // less authority: `https://` and `https:///x` both parse, both
              // yield `host == ""`, and both would build a template pointing at
              // no server. JavaScript's `new URL` throws on them.
              let host = components.host?.lowercased(), !host.isEmpty
        else { throw .notAURL }

        // http is allowed only against a loopback host, so a developer can
        // serve a build locally without turning off the rule everywhere.
        let isLocalDevelopment = scheme == "http"
            && (host == "localhost" || host == "127.0.0.1")
        guard scheme == "https" || isLocalDevelopment else {
            throw .insecureScheme
        }
        guard !host.contains("oldmapsonline") else {
            throw .disallowedSource
        }
        // Stricter than the web on one input: a bare trailing `?` or `#` gives
        // `URLComponents` an empty query or fragment where `new URL` reports
        // the falsy `""` and lets it through. Rejecting is the right side of
        // that difference — the template appends `/{z}/{x}/{y}.png`, so a base
        // ending in `?` turns the entire tile path into a query string.
        guard components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil
        else { throw .carriesQueryState }

        // Scheme and host are case-insensitive, and JavaScript's URL parser
        // lowercases both. Doing the same here keeps one configured value from
        // producing two different tile prefixes — which would otherwise mean two
        // disk caches and two sets of downloads for the same tiles.
        components.scheme = scheme
        components.host = host
        guard let url = components.url else { throw .notAURL }
        return url
    }

    /// The `{z}/{x}/{y}` template for one sheet, or `nil` if unhosted.
    ///
    /// Left as a template string rather than a built URL because MapKit's
    /// `MKTileOverlay` takes one and substitutes the placeholders itself.
    public static func tileTemplate(sheet: Int, baseURL: URL?) -> String? {
        guard let baseURL else { return nil }
        let padded = String(format: "%02d", sheet)
        return "\(baseURL.absoluteString)/\(FletcherSheets.tileRevision)"
            + "/sheet-\(padded)/{z}/{x}/{y}.png"
    }

    /// The receipt describing how this tile build was produced.
    ///
    /// Built as a string rather than with `appending(path:)` so it is the same
    /// concatenation `tileTemplate` performs; `URL`'s path APIs normalise, and
    /// a receipt that resolved to a different prefix than the tiles it
    /// describes would be documenting a build nobody is loading.
    public static func sourceReceiptURL(baseURL: URL?) -> URL? {
        guard let baseURL else { return nil }
        return URL(
            string: "\(baseURL.absoluteString)/\(FletcherSheets.tileRevision)/source.json"
        )
    }
}
