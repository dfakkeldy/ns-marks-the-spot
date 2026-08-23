import Foundation
import GeoCore

/// Where the map is looking, and what it is looking at.
///
/// A port of the web's `mapShareState.ts`, and it stays byte-compatible with it
/// on purpose: a link made on the phone opens the browser map on the same
/// parcel, and a link somebody was sent opens here. The two surfaces are one
/// address space or they are two apps that happen to look alike.
///
/// Nothing in the URL is evidence. It records a view — a mode, a PID, which
/// notices were switched on, which layers were drawn — and a view is not a
/// finding about the property under it.
public struct MapShareState: Sendable, Equatable {
    /// Which record set the map was reading.
    public enum Mode: String, Sendable, Equatable, CaseIterable {
        case current
        case historical
    }

    public var mode: Mode
    /// The selected parcel, or `nil` when the link is to a place rather than a
    /// property.
    public var pid: String?
    public var eventIDs: [String]
    /// `"modern"` and the layer IDs both surfaces share. Kept as strings rather
    /// than as `LayerID`, because `"modern"` is the web's name for a base map
    /// this app models as a style rather than as a layer.
    public var layerIDs: [String]
    public var position: MapPosition

    public init(
        mode: Mode = .current,
        pid: String? = nil,
        eventIDs: [String] = [],
        layerIDs: [String] = [],
        position: MapPosition = .default
    ) {
        self.mode = mode
        self.pid = pid
        self.eventIDs = eventIDs
        self.layerIDs = layerIDs
        self.position = position
    }
}

public struct MapPosition: Sendable, Equatable {
    public var latitude: Double
    public var longitude: Double
    public var zoom: Int

    public init(latitude: Double, longitude: Double, zoom: Int) {
        self.latitude = latitude
        self.longitude = longitude
        self.zoom = zoom
    }

    /// The web's opening view, which is Cape Breton rather than the province.
    public static let `default` = MapPosition(latitude: 46.08, longitude: -60.92, zoom: 9)

    /// The centre as a pair anything else will accept — five decimals, which is
    /// about a metre, and no more: a coordinate read off a map has no business
    /// claiming millimetres.
    ///
    /// Formatted without a locale on purpose. This string is meant to be pasted
    /// into a GPS, a spreadsheet or another map, and a decimal comma would make
    /// two numbers separated by a comma into four.
    public var coordinateText: String {
        String(format: "%.5f, %.5f", latitude, longitude)
    }

    /// What the readout on the map says: the zoom the view is at, then where
    /// its centre is. The web's wording, so a coordinate read off one surface
    /// looks like the same coordinate on the other.
    public var readoutText: String {
        "Z \(zoom) · \(coordinateText)"
    }
}

extension MapShareState {
    /// The web's `modern`, which is the OpenStreetMap base rather than an
    /// overlay. Named here so the two surfaces spell it the same way.
    public static let modernBaseLayerID = "modern"

    /// The box a shared position is clamped into.
    ///
    /// Not a statement about coverage: it keeps a malformed or hostile link
    /// from throwing the map somewhere it has no data and calling that a place.
    static let bounds = (south: 43.0, west: -66.5, north: 47.5, east: -59.0)

    /// The query names the two surfaces write into a shared link.
    public static let parameterNames = ["position", "pid", "layers", "event", "mode"]

    /// Whether this text is a link that actually carries a view.
    ///
    /// `parse` never fails: handed an unrelated URL it returns the default
    /// view, which is a real place in the middle of the province. Anything that
    /// acts on a link the reader supplied has to ask this first, or a pasted
    /// shopping link would move the map and present the result as the view
    /// somebody sent them.
    ///
    /// The host is not checked. The same query works against a local build, a
    /// preview deployment and the published map, and a reader whose link came
    /// from one of those is not wrong.
    public static func carriesState(_ value: String) -> Bool {
        guard let components = URLComponents(string: value),
              let scheme = components.scheme?.lowercased(),
              scheme == "http" || scheme == "https"
        else { return false }
        let names = Set((components.queryItems ?? []).map(\.name))
        return parameterNames.contains { names.contains($0) }
    }

    /// Reads a shared link, dropping anything this build cannot vouch for.
    ///
    /// Unknown event and layer IDs are dropped rather than kept: a link naming
    /// a notice this build does not carry would otherwise open a map claiming
    /// to show it. What is dropped is dropped silently, as the web drops it —
    /// the link is a view, and a view that cannot be restored in full is still
    /// a view.
    public static func parse(
        _ value: String,
        validEventIDs: Set<String>,
        validLayerIDs: Set<String>
    ) -> MapShareState {
        // A relative link is still a link. The host is thrown away either way;
        // only the query is read.
        guard let components = URLComponents(string: value)
            ?? URLComponents(string: "https://example.invalid/\(value)")
        else { return MapShareState() }
        let query = components.queryItems ?? []
        func first(_ name: String) -> String? {
            query.first { $0.name == name }?.value
        }

        let mode: Mode = first("mode") == Mode.historical.rawValue ? .historical : .current
        let eventIDs = (first("event") ?? "")
            .split(separator: ",", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { validEventIDs.contains($0) }
        let layerIDs = (first("layers") ?? "")
            .split(separator: ",", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { validLayerIDs.contains($0) }

        return MapShareState(
            mode: mode,
            pid: ParcelQuery.normalizePID(first("pid") ?? ""),
            eventIDs: eventIDs,
            layerIDs: layerIDs,
            position: position(from: first("position"))
        )
    }

    /// The same, against what this build actually carries.
    public static func parse(
        _ value: String,
        notices: TaxSaleCatalog = .bundled,
        historical: HistoricalTaxSaleCatalog = .bundled
    ) -> MapShareState {
        parse(
            value,
            validEventIDs: Set(notices.events.map(\.id))
                .union(historical.events.map(\.id)),
            validLayerIDs: Set(LayerID.allCases.map(\.rawValue))
                .union([modernBaseLayerID])
        )
    }

    static func position(from value: String?) -> MapPosition {
        let parts = (value ?? "").split(separator: ",", omittingEmptySubsequences: false)
        guard parts.count >= 3,
              let latitude = Double(parts[0]), latitude.isFinite,
              let longitude = Double(parts[1]), longitude.isFinite,
              let zoom = Double(parts[2]), zoom.isFinite
        else { return .default }

        return MapPosition(
            latitude: min(max(latitude, bounds.south), bounds.north),
            longitude: min(max(longitude, bounds.west), bounds.east),
            // Rounded before it is clamped, as the web rounds it: a zoom of
            // 23.6 is a zoom of 24 asked for, and 23 is what can be given.
            zoom: Int(min(max(zoom.rounded(), 7), 23))
        )
    }

    /// Writes the link, in the web's parameter order.
    ///
    /// Order matters here in a way it usually does not: two surfaces producing
    /// the same view must produce the same string, or a link copied from one
    /// and compared against the other reads as a different place.
    public func url(base: URL) -> URL? {
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        else { return nil }
        components.query = nil
        components.fragment = nil

        var items = [URLQueryItem(name: "mode", value: mode.rawValue)]
        if let pid, !pid.isEmpty {
            items.append(URLQueryItem(name: "pid", value: pid))
        }
        if !eventIDs.isEmpty {
            items.append(URLQueryItem(name: "event", value: eventIDs.joined(separator: ",")))
        }
        items.append(URLQueryItem(name: "layers", value: layerIDs.joined(separator: ",")))
        items.append(
            URLQueryItem(
                name: "position",
                value: [
                    Self.compact(position.latitude),
                    Self.compact(position.longitude),
                    String(position.zoom),
                ].joined(separator: ",")
            )
        )
        components.queryItems = items
        return components.url
    }

    /// Five decimal places with the trailing zeros taken off — about a metre,
    /// and the web's own `compactCoordinate`.
    static func compact(_ value: Double) -> String {
        var written = String(format: "%.5f", value)
        if written.contains(".") {
            while written.hasSuffix("0") { written.removeLast() }
            if written.hasSuffix(".") { written.removeLast() }
        }
        return written
    }
}
