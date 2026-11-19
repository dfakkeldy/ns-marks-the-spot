import Foundation

/// Source identity only. Matching does not grant permission for any use.
public enum UserLayerSourceMatch {
    public static func key(_ value: String) -> String? {
        guard let parts = URLComponents(string: value), let rawHost = parts.host?.lowercased(), !rawHost.isEmpty,
              let decoded = parts.percentEncodedPath.removingPercentEncoding else { return nil }
        let hostname = rawHost.hasSuffix(".") ? String(rawHost.dropLast()) : rawHost
        let host = ["nsgiwa.novascotia.ca", "nsgiwa2.novascotia.ca"].contains(hostname) ? "nsgiwa.novascotia.ca" : hostname + (parts.port.map { ":\($0)" } ?? "")
        let path = "/" + decoded.lowercased().split(separator: "/").joined(separator: "/")
        let pattern = #"^(.*?)(?:/arcgis)?/(?:rest/)?services/(.+?/(?:mapserver|imageserver))(?:/|$)"#
        if let regex = try? NSRegularExpression(pattern: pattern), let match = regex.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)),
           let prefix = Range(match.range(at: 1), in: path), let service = Range(match.range(at: 2), in: path) {
            return host + path[prefix] + "/services/" + path[service]
        }
        let tilePattern = #"/(?:\{z\}|\d+)/[^/]+/[^/]+$"#
        let base = path.replacingOccurrences(of: tilePattern, with: "", options: .regularExpression)
        return host + base.trimmingCharacters(in: CharacterSet(charactersIn: "/" )).withLeadingSlash
    }
    public static func match(_ value: String) -> [LayerDescriptor] {
        guard let source = key(value) else { return [] }
        return LayerCatalog.all.filter { $0.serviceURL.flatMap { key($0.absoluteString) } == source }
    }
}

private extension String {
    var withLeadingSlash: String { isEmpty ? "" : "/" + self }
}
