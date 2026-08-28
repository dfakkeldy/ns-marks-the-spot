import Foundation

/// The points file the Fletcher tooling emits, read and written.
///
/// A port of `web/src/userMaps/parsers/fletcherGcps.ts`. Both Python emitters
/// under `tools/fletcher/` write the same six columns, and the reason to read
/// them here is the `role` column: the pipeline fits on the control rows and
/// scores against the check rows, and a surface that merged the two would
/// report an accuracy figure measured against the very points that produced
/// the fit.
public enum FletcherGcpFile {
    /// Matched exactly rather than sniffed. A file with different columns is a
    /// different format, and reading it by position would place pins at
    /// nonsense coordinates without complaining.
    public static let header = "pixel_x,pixel_y,lon,lat,role,label"

    /// Precision for a point that never came from a file.
    private static let defaultPixelDecimals = 1
    private static let defaultLonLatDecimals = 8

    public enum Role: String, Hashable, Sendable {
        case control
        case check
    }

    /// One row, carrying the field text exactly as it arrived.
    ///
    /// The text is kept because the two emitters disagree on precision — the
    /// graticule emitter writes lon/lat at six decimals and the feature-led one
    /// at eight — so re-formatting from the parsed value would round-trip one
    /// of them wrong. Echoing the original makes byte-identical output
    /// independent of which emitter produced the file. Absent for a point
    /// placed or dragged in the app, which is why writing falls back to
    /// formatting.
    public struct Row: Hashable, Sendable {
        public struct SourceText: Hashable, Sendable {
            public var pixelX: String
            public var pixelY: String
            public var lon: String
            public var lat: String

            public init(pixelX: String, pixelY: String, lon: String, lat: String) {
                self.pixelX = pixelX
                self.pixelY = pixelY
                self.lon = lon
                self.lat = lat
            }
        }

        public var id: String
        public var pixel: PixelPoint
        public var map: GeoPoint
        public var role: Role
        public var source: SourceText?

        public init(
            id: String,
            pixel: PixelPoint,
            map: GeoPoint,
            role: Role,
            source: SourceText? = nil
        ) {
            self.id = id
            self.pixel = pixel
            self.map = map
            self.role = role
            self.source = source
        }
    }

    public struct Parsed: Hashable, Sendable {
        /// Control points, in the shape a session stores.
        public var controls: [SessionControlPoint]
        /// Held-out checks, deliberately kept out of `controls`: promoting one
        /// would make the accuracy figure circular.
        public var checks: [GroundControlPoint]
        /// Every row in file order, carrying role and original field text.
        public var rows: [Row]
        /// Leading `#` lines, kept so a round trip keeps the provenance banner.
        public var comments: [String]
    }

    /// Why a file was refused, in the words shown to the reader.
    ///
    /// Two kinds, as the web has two: a file that is not this format at all,
    /// and a file that is but says something impossible. The second is the one
    /// worth spelling out — a reader who exported the wrong sheet's points
    /// needs to be told that, not told the file is unreadable.
    public enum ReadFailure: Error, Hashable, Sendable {
        case notAPointsFile(String)
        case invalid(String)

        public var message: String {
            switch self {
            case .notAPointsFile(let text), .invalid(let text): text
            }
        }
    }

    public static func parse(
        _ text: String,
        pixelSize: PixelSize? = nil
    ) throws(ReadFailure) -> Parsed {
        var comments: [String] = []
        var rows: [Row] = []
        var sawHeader = false

        for (index, rawLine) in text.split(separator: "\n", omittingEmptySubsequences: false)
            .enumerated() {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { continue }

            if line.hasPrefix("#") {
                // Only the banner above the header is kept. A stray comment
                // further down would change row order when the file is written
                // back out.
                if !sawHeader { comments.append(line) }
                continue
            }

            if !sawHeader {
                guard line == header else { throw notAPointsFile() }
                sawHeader = true
                continue
            }

            rows.append(try row(from: line, line: index + 1))
        }

        guard sawHeader else { throw notAPointsFile() }

        if let pixelSize, let outside = rows.first(where: {
            $0.pixel.x < 0 || $0.pixel.y < 0
                || $0.pixel.x > pixelSize.width || $0.pixel.y > pixelSize.height
        }) {
            // A file emitted against a different scan of the same sheet parses
            // cleanly and lands every pin in the wrong place. This check is the
            // only thing between a mismatched file and silent garbage.
            throw ReadFailure.invalid(
                """
                Point "\(outside.id)" at \(number(outside.pixel.x)), \
                \(number(outside.pixel.y)) falls outside this image \
                (\(number(pixelSize.width)) x \(number(pixelSize.height))). \
                These points were measured against a different scan.
                """
            )
        }

        let controls = rows.filter { $0.role == .control }.map {
            SessionControlPoint(id: $0.id, pixel: $0.pixel, map: $0.map)
        }
        guard !controls.isEmpty else {
            throw ReadFailure.invalid(
                "This file has no control points, so there is nothing to place."
            )
        }

        return Parsed(
            controls: controls,
            checks: rows.filter { $0.role == .check }.map {
                GroundControlPoint(pixel: $0.pixel, map: $0.map)
            },
            rows: rows,
            comments: comments
        )
    }

    public static func serialize(rows: [Row], comments: [String] = []) -> String {
        var lines = comments
        lines.append(header)
        for row in rows {
            lines.append(
                [
                    field(row.source?.pixelX, row.pixel.x, decimals: defaultPixelDecimals),
                    field(row.source?.pixelY, row.pixel.y, decimals: defaultPixelDecimals),
                    field(row.source?.lon, row.map.lng, decimals: defaultLonLatDecimals),
                    field(row.source?.lat, row.map.lat, decimals: defaultLonLatDecimals),
                    row.role.rawValue,
                    row.id,
                ].joined(separator: ",")
            )
        }
        // The Python emitters end their files with a newline, and a round trip
        // has to reproduce it.
        return lines.joined(separator: "\n") + "\n"
    }

    // MARK: - A session, written out

    /// A working session as a points file, at full precision.
    ///
    /// Ported from `web/src/userMaps/autoExport.ts`. Not the emitters' 1 and 8
    /// decimals: those keep GENERATED pipeline files stable and diffable,
    /// while this file's only job is to restore the session exactly. A dragged
    /// point sits at a sub-pixel position, 800.25 becomes 800.3 at one
    /// decimal, and a backup that moves every point on the way back in is not
    /// a backup.
    /// `checkLabels` are the names the checks arrived with, in the same order.
    /// A held-out point is stored as ground and pixels alone, so its label
    /// does not survive a session on its own — and for a graticule file those
    /// labels are the intersections' names. Passing them keeps the file worth
    /// handing back to the pipeline; without them the checks are numbered.
    public static func snapshot(
        name: String,
        controls: [SessionControlPoint],
        checks: [GroundControlPoint],
        checkLabels: [String] = [],
        at date: Date
    ) -> String {
        let rows =
            controls.map {
                exactRow(id: $0.id, pixel: $0.pixel, map: $0.map, role: .control)
            }
            + checks.enumerated().map { index, check in
                exactRow(
                    id: index < checkLabels.count ? checkLabels[index] : "check-\(index + 1)",
                    pixel: check.pixel, map: check.map, role: .check
                )
            }
        let held = checks.isEmpty
            ? ""
            : ", \(checks.count) held-out check\(checks.count == 1 ? "" : "s")"
        return serialize(
            rows: rows,
            comments: [
                "# \(name) — saved \(iso8601(date)).",
                """
                # \(controls.count) control\(controls.count == 1 ? "" : "s")\(held). \
                Re-import this file to restore the session.
                """,
            ]
        )
    }

    /// Filesystem-safe, and sorts chronologically inside a folder.
    public static func snapshotFileName(for name: String, at date: Date) -> String {
        let slug = String(
            name.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "-" }
        )
        .split(separator: "-", omittingEmptySubsequences: true)
        .joined(separator: "-")
        .prefix(60)
        return "\(slug.isEmpty ? "user-map" : String(slug))-\(stamp(date)).csv"
    }

    /// Built per call rather than held: `ISO8601DateFormatter` is a class with
    /// mutable settings, so one shared instance is not safe to reach from two
    /// tasks at once, and a snapshot is written rarely enough that the cost
    /// does not matter.
    private static func iso8601(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }

    /// Local time, not UTC: the reader is looking for the file they made
    /// twenty minutes ago, and a name in another timezone is one they have to
    /// convert before they can find it.
    private static func stamp(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let parts = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second], from: date
        )
        func pad(_ value: Int?) -> String { String(format: "%02d", value ?? 0) }
        return """
            \(parts.year ?? 0)-\(pad(parts.month))-\(pad(parts.day))\
            T\(pad(parts.hour))-\(pad(parts.minute))-\(pad(parts.second))
            """
    }

    private static func exactRow(
        id: String, pixel: PixelPoint, map: GeoPoint, role: Role
    ) -> Row {
        Row(
            id: id, pixel: pixel, map: map, role: role,
            source: Row.SourceText(
                pixelX: number(pixel.x), pixelY: number(pixel.y),
                lon: number(map.lng), lat: number(map.lat)
            )
        )
    }

    // MARK: - Reading one row

    private static func row(from line: String, line number: Int) throws(ReadFailure) -> Row {
        let parts = line.components(separatedBy: ",")
        guard parts.count >= 6 else {
            throw ReadFailure.invalid(
                "Line \(number): expected 6 columns, found \(parts.count)."
            )
        }
        // Everything after the fifth comma is the label. Labels carry no comma
        // today; joining the remainder keeps a future one intact rather than
        // truncating the name a reader chose.
        let label = parts[5...].joined(separator: ",")

        guard let role = Role(rawValue: parts[4]) else {
            throw ReadFailure.invalid(
                """
                Line \(number): role must be "control" or "check", found "\(parts[4])".
                """
            )
        }

        let x = try value(parts[0], "pixel_x", line: number)
        let y = try value(parts[1], "pixel_y", line: number)
        let lng = try value(parts[2], "lon", line: number)
        let lat = try value(parts[3], "lat", line: number)

        guard lng >= -180, lng <= 180, lat >= -90, lat <= 90 else {
            throw ReadFailure.invalid(
                """
                Line \(number): coordinate \(Self.number(lat)), \(Self.number(lng)) \
                is outside WGS84 range.
                """
            )
        }

        return Row(
            id: label,
            pixel: PixelPoint(x: x, y: y),
            map: GeoPoint(lat: lat, lng: lng),
            role: role,
            source: Row.SourceText(
                pixelX: parts[0], pixelY: parts[1], lon: parts[2], lat: parts[3]
            )
        )
    }

    private static func value(
        _ text: String, _ field: String, line: Int
    ) throws(ReadFailure) -> Double {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let value = Double(trimmed), value.isFinite else {
            throw ReadFailure.invalid(
                """
                Line \(line): \(field) is not a number ("\(text)").
                """
            )
        }
        return value
    }

    private static func notAPointsFile() -> ReadFailure {
        .notAPointsFile("Not a Fletcher points file. Expected the header \"\(header)\".")
    }

    private static func field(_ source: String?, _ value: Double, decimals: Int) -> String {
        source ?? format(value, decimals: decimals)
    }

    /// `toFixed`, not `printf`. A field exactly on a rounding boundary is the
    /// one case the two disagree on: `printf` rounds 12.25 to even and gives
    /// "12.2", while every emitter and the browser give "12.3". Rounding away
    /// from zero first, then printing an already-rounded value, keeps a point
    /// placed on one surface identical when the other writes it out.
    private static func format(_ value: Double, decimals: Int) -> String {
        let scale = pow(10.0, Double(decimals))
        return String(format: "%.\(decimals)f", (value * scale).rounded() / scale)
    }

    /// Numbers inside a message, printed the way the web's template literal
    /// prints them: whole values without a trailing `.0`.
    private static func number(_ value: Double) -> String {
        value == value.rounded() && abs(value) < 1e15
            ? String(Int(value))
            : String(value)
    }
}
