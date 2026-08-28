import Foundation
import MapCatalog
import Testing

@testable import NSDataServices

/// The Fletcher tile base URL is the one address in the app that comes from
/// build configuration rather than from the catalog, which makes it the one
/// address a mistake can point anywhere.
///
/// Two rules matter beyond "is it a URL". Plain HTTP would put every tile
/// request on the wire in clear, and OldMapsOnline is not a source we may
/// redistribute from — the whole point of this tile build is that we render
/// from the Rumsey originals ourselves. Both are enforced here rather than at
/// the call site so there is no path that skips them.
@Suite("Fletcher tile URLs")
struct FletcherTileURLTests {
    // MARK: - Base URL

    @Test("Absent configuration is not an error")
    func absentBaseURL() throws {
        // Not hosted yet is a real, expected state: the layer just does not
        // draw. Throwing here would make an unconfigured debug build fail to
        // launch over a layer the user has not turned on.
        #expect(try FletcherTileURL.normalizeBaseURL(nil) == nil)
        #expect(try FletcherTileURL.normalizeBaseURL("") == nil)
        #expect(try FletcherTileURL.normalizeBaseURL("   \n ") == nil)
        #expect(try FletcherTileURL.normalizeBaseURL("///") == nil)
    }

    @Test("Strips trailing slashes so the template has exactly one separator")
    func stripsTrailingSlashes() throws {
        let once = try FletcherTileURL.normalizeBaseURL("https://tiles.test/fletcher/")
        let twice = try FletcherTileURL.normalizeBaseURL("https://tiles.test/fletcher//")
        let bare = try FletcherTileURL.normalizeBaseURL("  https://tiles.test/fletcher  ")
        #expect(once?.absoluteString == "https://tiles.test/fletcher")
        #expect(twice?.absoluteString == once?.absoluteString)
        #expect(bare?.absoluteString == once?.absoluteString)
    }

    @Test("Requires HTTPS everywhere but loopback")
    func requiresHTTPS() {
        #expect(throws: FletcherTileURL.BaseURLError.insecureScheme) {
            try FletcherTileURL.normalizeBaseURL("http://tiles.test/fletcher")
        }
        // A developer serving a freshly built pyramid off their laptop is the
        // case this exception exists for, and only that case.
        #expect(throws: Never.self) {
            try FletcherTileURL.normalizeBaseURL("http://localhost:8080/tiles")
        }
        #expect(throws: Never.self) {
            try FletcherTileURL.normalizeBaseURL("http://127.0.0.1:8080/tiles")
        }
        // Not a loopback host — just one that starts the same way.
        #expect(throws: FletcherTileURL.BaseURLError.insecureScheme) {
            try FletcherTileURL.normalizeBaseURL("http://localhost.attacker.test/tiles")
        }
    }

    @Test("Refuses OldMapsOnline as a source")
    func refusesOldMapsOnline() {
        #expect(throws: FletcherTileURL.BaseURLError.disallowedSource) {
            try FletcherTileURL.normalizeBaseURL("https://www.oldmapsonline.org/tiles")
        }
        // Case and subdomain do not get around it.
        #expect(throws: FletcherTileURL.BaseURLError.disallowedSource) {
            try FletcherTileURL.normalizeBaseURL("https://TILES.OldMapsOnline.ORG/x")
        }
    }

    @Test("Refuses credentials, query and fragment")
    func refusesQueryState() {
        // A tile template ends in `{z}/{x}/{y}.png`, so anything already
        // carrying a query or fragment would produce an address whose path is
        // not where the path is supposed to be. Credentials in a URL that gets
        // logged and cached are their own problem.
        for value in [
            "https://user:pass@tiles.test/fletcher",
            "https://tiles.test/fletcher?token=abc",
            "https://tiles.test/fletcher#frag",
        ] {
            #expect(throws: FletcherTileURL.BaseURLError.carriesQueryState) {
                try FletcherTileURL.normalizeBaseURL(value)
            }
        }
    }

    @Test("Refuses values that are not URLs at all")
    func refusesNonURLs() {
        for value in [
            "tiles.test/fletcher", "not a url", "file:///tmp/tiles",
            "//tiles.test/fletcher",
            // `URLComponents` parses these with an empty-string host rather
            // than failing, so a nil check alone would let a base URL with no
            // server through.
            "https://", "https:///fletcher", "https://:8443/fletcher",
            // Decodes to the host `a/b`, which is a path separator smuggled
            // into the authority.
            "https://a%2Fb/fletcher",
            // Parsed with a nil host: scheme-only forms JavaScript rewrites
            // into `https://foo/` and Foundation leaves as an opaque path.
            "https:tiles.test", "https:/tiles.test",
        ] {
            #expect(throws: FletcherTileURL.BaseURLError.self, "\(value)") {
                try FletcherTileURL.normalizeBaseURL(value)
            }
        }
    }

    @Test("Lowercases scheme and host so one setting is one cache prefix")
    func normalizesCase() throws {
        // Both are case-insensitive and JavaScript's URL parser folds them. If
        // Swift did not, `HTTPS://Tiles.Test/f` and `https://tiles.test/f`
        // would be two tile prefixes, two disk caches, and two downloads of the
        // same pyramid — from one configured value typed two ways.
        let shouty = try FletcherTileURL.normalizeBaseURL("HTTPS://Tiles.TEST/Fletcher")
        #expect(shouty?.absoluteString == "https://tiles.test/Fletcher")
        // The path keeps its case: only the scheme and host are
        // case-insensitive, and tile servers do serve case-sensitive paths.
        let loopback = try FletcherTileURL.normalizeBaseURL("HTTP://LOCALHOST:8080/t")
        #expect(loopback?.absoluteString == "http://localhost:8080/t")
    }

    @Test("Refuses a bare trailing question mark or hash")
    func refusesEmptyQueryState() {
        // Stricter than the web, deliberately: `new URL` reports these as the
        // falsy empty string and lets them through, and the template appends
        // `/{z}/{x}/{y}.png` — so on the web a base ending in `?` silently
        // turns every tile path into a query string.
        for value in ["https://tiles.test/f?", "https://tiles.test/f#"] {
            #expect(throws: FletcherTileURL.BaseURLError.carriesQueryState, "\(value)") {
                try FletcherTileURL.normalizeBaseURL(value)
            }
        }
    }

    // MARK: - Templates

    @Test("Builds the template the web builds")
    func matchesWebTemplate() throws {
        let base = try #require(try FletcherTileURL.normalizeBaseURL("https://tiles.test/f"))
        #expect(
            FletcherTileURL.tileTemplate(sheet: 1, baseURL: base)
                == "https://tiles.test/f/\(FletcherSheets.tileRevision)"
                    + "/sheet-01/{z}/{x}/{y}.png"
        )
        // Two digits, zero-padded — `padStart(2, "0")` on the web. Sheet 1 at
        // `sheet-1` is a 404 against a pyramid built as `sheet-01`.
        #expect(
            FletcherTileURL.tileTemplate(sheet: 24, baseURL: base)?
                .contains("/sheet-24/") == true
        )
        #expect(
            FletcherTileURL.tileTemplate(sheet: 9, baseURL: base)?
                .contains("/sheet-09/") == true
        )
    }

    @Test("Builds a distinct, correctly padded template for every declared sheet")
    func coversEverySheet() throws {
        let base = try #require(try FletcherTileURL.normalizeBaseURL("https://tiles.test/f"))
        let prefix = "https://tiles.test/f/\(FletcherSheets.tileRevision)/sheet-"
        var seen = Set<String>()
        for sheet in FletcherSheets.all {
            let template = try #require(
                FletcherTileURL.tileTemplate(sheet: sheet.sheet, baseURL: base)
            )
            // The whole string, not a suffix and a substring: asserting only
            // the fixed parts would pass for an implementation that ignored
            // its sheet argument and returned one constant template.
            let padded = sheet.sheet < 10 ? "0\(sheet.sheet)" : "\(sheet.sheet)"
            #expect(template == "\(prefix)\(padded)/{z}/{x}/{y}.png", "sheet \(sheet.sheet)")
            #expect(seen.insert(template).inserted, "sheet \(sheet.sheet) repeats another sheet")
            #expect(FletcherTileURL.tileTemplate(sheet: sheet.sheet, baseURL: nil) == nil)
        }
        #expect(seen.count == 24)
    }

    @Test("Puts the receipt under the same revision prefix as the tiles")
    func receiptSharesThePrefix() throws {
        let base = try #require(try FletcherTileURL.normalizeBaseURL("https://tiles.test/f"))
        let receipt = try #require(FletcherTileURL.sourceReceiptURL(baseURL: base))
        let template = try #require(FletcherTileURL.tileTemplate(sheet: 1, baseURL: base))
        let prefix = "https://tiles.test/f/\(FletcherSheets.tileRevision)/"
        #expect(receipt.absoluteString == "\(prefix)source.json")
        #expect(template.hasPrefix(prefix), "the receipt must describe the build being loaded")
        #expect(FletcherTileURL.sourceReceiptURL(baseURL: nil) == nil)
    }

    @Test("The revision is a single path segment")
    func revisionIsOneSegment() {
        // It is interpolated straight into a path, so a slash or a space in it
        // would silently restructure every tile address.
        #expect(!FletcherSheets.tileRevision.contains("/"))
        #expect(!FletcherSheets.tileRevision.contains(" "))
        #expect(
            FletcherSheets.tileRevision
                .allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "." }
        )
    }
}
