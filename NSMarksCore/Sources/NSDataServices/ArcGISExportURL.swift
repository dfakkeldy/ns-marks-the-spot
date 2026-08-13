import Foundation
import MapCatalog

/// A box in Web Mercator (EPSG:3857) metres.
public struct WebMercatorBox: Sendable, Equatable {
    public let minX: Double
    public let minY: Double
    public let maxX: Double
    public let maxY: Double

    public init(minX: Double, minY: Double, maxX: Double, maxY: Double) {
        self.minX = minX
        self.minY = minY
        self.maxX = maxX
        self.maxY = maxY
    }
}

public enum WebMercator {
    /// Half the width of the Web Mercator world, in metres. The web hard-codes
    /// this same literal; sharing the digits matters because it is the origin
    /// every tile bound is measured from, and a truncated copy would shift
    /// every request by centimetres at z8 and metres at z19.
    public static let worldExtent = 20_037_508.342789244

    /// The bounds of an XYZ tile, matching `webMercatorBoundsForTile` on the web.
    public static func bounds(x: Int, y: Int, z: Int) -> WebMercatorBox {
        let tileSpan = (2 * worldExtent) / pow(2, Double(z))
        let minX = -worldExtent + Double(x) * tileSpan
        let maxY = worldExtent - Double(y) * tileSpan
        return WebMercatorBox(
            minX: minX,
            minY: maxY - tileSpan,
            maxX: minX + tileSpan,
            maxY: maxY
        )
    }
}

/// Assembles the ArcGIS `/export` query.
///
/// Deliberately `internal`: an app target that could build an export URL
/// directly would have a way around the licence check, since the check happens
/// in `TileRequestFactory` rather than here. Everything outside the package
/// reaches this through a `TileRequest`.
///
/// The query is byte-compatible with the web's `arcGISExportUrl`, not merely
/// equivalent. ArcGIS caches renders by URL, and so do the CDNs in front of it;
/// two spellings of the same request are two renders. Matching exactly also
/// means a URL copied out of the browser's network tab can be pasted into a
/// native bug report and be the same string.
enum ArcGISExportURL {
    /// One `/export` render of `box` at a given pixel size.
    static func url(
        serviceURL: URL,
        options: ArcGISExportOptions,
        box: WebMercatorBox,
        widthPx: Int,
        heightPx: Int
    ) -> URL? {
        var base = serviceURL.absoluteString
        while base.hasSuffix("/") {
            base.removeLast()
        }

        // Insertion order is the web's order, and it is part of the byte match.
        var query: [(String, String)] = [
            ("bbox", [box.minX, box.minY, box.maxX, box.maxY].map(jsNumber).joined(separator: ",")),
            ("bboxSR", "3857"),
            ("imageSR", "3857"),
            ("size", "\(widthPx),\(heightPx)"),
            ("format", "png32"),
            ("transparent", options.transparent ? "true" : "false"),
            ("f", "image"),
        ]
        // The web writes these under `if (options.dpi)` and friends, so a zero
        // dpi or an empty layers string is omitted, not sent empty.
        if let dpi = options.dpi, dpi != 0 {
            query.append(("dpi", String(dpi)))
        }
        if let layers = options.layers, !layers.isEmpty {
            query.append(("layers", layers))
        }
        if let dynamicLayers = options.dynamicLayers, !dynamicLayers.isEmpty {
            query.append(("dynamicLayers", dynamicLayers))
        }

        let encoded = query
            .map { "\(formURLEncoded($0.0))=\(formURLEncoded($0.1))" }
            .joined(separator: "&")
        return URL(string: "\(base)/export?\(encoded)")
    }

    /// One 256px tile.
    static func tile(
        serviceURL: URL,
        options: ArcGISExportOptions,
        x: Int,
        y: Int,
        z: Int
    ) -> URL? {
        url(
            serviceURL: serviceURL,
            options: options,
            box: WebMercator.bounds(x: x, y: y, z: z),
            widthPx: 256,
            heightPx: 256
        )
    }

    /// Percent-encoding that matches JavaScript's `URLSearchParams`.
    ///
    /// `URLComponents` is not a substitute: its `urlQueryAllowed` set passes
    /// `:` `,` `[` `]` through literally, where `URLSearchParams` escapes them.
    /// The `dynamicLayers` value is a JSON blob full of exactly those
    /// characters, so the two spellings differ on every styled layer we send.
    static func formURLEncoded(_ value: String) -> String {
        var out = ""
        out.reserveCapacity(value.utf8.count)
        for byte in value.utf8 {
            switch byte {
            case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, // 0-9 A-Z a-z
                 0x2A, 0x2D, 0x2E, 0x5F:                // * - . _
                out.append(Character(UnicodeScalar(byte)))
            case 0x20:
                out.append("+")
            default:
                out.append("%")
                out.append(hexDigit(byte >> 4))
                out.append(hexDigit(byte & 0x0F))
            }
        }
        return out
    }

    private static func hexDigit(_ nibble: UInt8) -> Character {
        Character(UnicodeScalar(nibble < 10 ? 0x30 + nibble : 0x41 + nibble - 10))
    }

    /// Formats a coordinate the way JavaScript's number-to-string does.
    ///
    /// The one that bites is a whole number: JS writes `0`, Swift writes `0.0`,
    /// and a tile whose edge lands exactly on the prime meridian or the equator
    /// would then differ from the web by two characters. Elsewhere the two
    /// agree, because both emit the shortest decimal that round-trips.
    ///
    /// This holds for Web Mercator metres, whose magnitudes run from 0 to about
    /// 2e7. It is not a general-purpose port of JS number formatting: below
    /// roughly 1e-4 Swift switches to exponent notation sooner than JS does.
    static func jsNumber(_ value: Double) -> String {
        if value == value.rounded(), abs(value) < 9e18 {
            return String(Int64(value))
        }
        return "\(value)"
    }
}
