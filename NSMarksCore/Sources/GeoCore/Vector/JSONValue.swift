import Foundation

/// An arbitrary JSON value, for the parts of a user's file this app carries
/// without understanding: a feature's properties.
///
/// Kept whole rather than flattened to `[String: String]`. The properties are
/// the user's own attribute table — a lot number, a survey date, a nested
/// record from whatever exported the file — and the app shows them, exports
/// them back out, and otherwise does not interpret them. Anything that
/// stringified them on the way in would change the user's data in transit and
/// then hand it back as if that were what they gave us.
public enum JSONValue: Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    /// What the value looks like written out, for a popup row.
    ///
    /// Whole numbers lose their decimal point: a parcel numbered 1234 read as
    /// JSON is a `Double`, and "1234.0" is not the number the user typed.
    public var displayText: String {
        switch self {
        case .null: return ""
        case .bool(let value): return value ? "true" : "false"
        case .number(let value): return Self.text(forNumber: value)
        case .string(let value): return value
        case .array(let values): return values.map(\.displayText).joined(separator: ", ")
        case .object: return ""
        }
    }

    public var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    public var doubleValue: Double? {
        if case .number(let value) = self, value.isFinite { return value }
        return nil
    }

    static func text(forNumber value: Double) -> String {
        guard value.isFinite else { return "" }
        if value == value.rounded(), abs(value) < 1e15 {
            return String(Int64(value))
        }
        return String(value)
    }

    /// Wraps a value that came out of `JSONSerialization`.
    ///
    /// Nil for anything that is not JSON — the caller passed something else.
    public static func from(_ raw: Any) -> JSONValue? {
        switch raw {
        case is NSNull: return .null
        case let number as NSNumber:
            // NSNumber does not distinguish an integer from a bool by type, so
            // the underlying encoding is the only way to keep `true` from
            // becoming `1` in a popup.
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return .bool(number.boolValue)
            }
            return .number(number.doubleValue)
        case let string as String: return .string(string)
        case let array as [Any]:
            var values: [JSONValue] = []
            values.reserveCapacity(array.count)
            for element in array {
                guard let value = Self.from(element) else { return nil }
                values.append(value)
            }
            return .array(values)
        case let dictionary as [String: Any]:
            var values: [String: JSONValue] = [:]
            for (key, element) in dictionary {
                guard let value = Self.from(element) else { return nil }
                values[key] = value
            }
            return .object(values)
        default: return nil
        }
    }

    /// The value as `JSONSerialization` wants it back, for export.
    public var jsonObject: Any {
        switch self {
        case .null: return NSNull()
        case .bool(let value): return value
        case .number(let value): return value
        case .string(let value): return value
        case .array(let values): return values.map(\.jsonObject)
        case .object(let values): return values.mapValues(\.jsonObject)
        }
    }
}

extension JSONValue: Codable {
    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container, debugDescription: "Not a JSON value."
            )
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}
