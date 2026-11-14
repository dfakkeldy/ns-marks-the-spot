import Foundation

public enum UserLayerKind: String, Codable, Sendable {
    case xyz, tms, wms
    case arcgisMap = "arcgis-map"
    case arcgisImage = "arcgis-image"
}

public struct UserLayerURL: Codable, Equatable, Sendable {
    public let value: String
    public let kind: UserLayerKind
    public enum ValidationError: Error { case invalidAddress }

    public init(_ value: String, kind: UserLayerKind) throws {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.removingPercentEncoding != nil,
              let parts = URLComponents(string: value), let host = parts.host, !host.isEmpty,
              parts.scheme?.lowercased() == "https" || (parts.scheme?.lowercased() == "http" && ["localhost", "127.0.0.1"].contains(host.lowercased())),
              parts.user == nil, parts.password == nil, parts.fragment == nil,
              let path = parts.percentEncodedPath.removingPercentEncoding,
              !path.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { throw ValidationError.invalidAddress }
        let lower = value.lowercased()
        if kind == .xyz || kind == .tms {
            guard lower.contains("{z}"), lower.contains("{x}"), (lower.contains("{y}") || lower.contains("{-y}")), !lower.contains("{switch:"), !lower.contains("{q}") else { throw ValidationError.invalidAddress }
        }
        if kind == .arcgisMap || kind == .arcgisImage {
            let service = kind == .arcgisMap ? "mapserver" : "imageserver"
            let segments = path.split(separator: "/")
            guard let index = segments.firstIndex(where: { $0.lowercased() == service }), !(segments.dropFirst(index + 1).first.map { Int($0) != nil } ?? false) else { throw ValidationError.invalidAddress }
            let prefix = segments.prefix(index + 1).joined(separator: "/")
            var normalized = parts
            normalized.path = "/" + prefix
            guard let output = normalized.string else { throw ValidationError.invalidAddress }
            self.value = output
        } else {
            self.value = value
        }
        self.kind = kind
    }

    public static func guessKind(_ value: String) -> UserLayerKind {
        let lower = value.lowercased()
        if lower.contains("{-y}") { return .tms }
        if ["{z}", "{x}", "{y}"].contains(where: lower.contains) { return .xyz }
        if lower.contains("/imageserver") { return .arcgisImage }
        if lower.contains("/mapserver/wmsserver") || lower.contains("service=wms") { return .wms }
        if lower.contains("/mapserver") { return .arcgisMap }
        return .wms
    }

    public var display: String {
        guard var parts = URLComponents(string: value) else { return "Invalid address" }
        parts.user = nil; parts.password = nil; parts.fragment = nil
        if parts.percentEncodedQuery != nil { parts.query = "…" }
        return (parts.string ?? "Invalid address").replacingOccurrences(of: "%7B", with: "{", options: .caseInsensitive).replacingOccurrences(of: "%7D", with: "}", options: .caseInsensitive)
    }

    private enum CodingKeys: String, CodingKey { case value, kind }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(container.decode(String.self, forKey: .value), kind: container.decode(UserLayerKind.self, forKey: .kind))
    }
}
